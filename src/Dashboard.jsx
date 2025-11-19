import { useState, useEffect } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { supabase } from './supabaseClient'
import './App.css'

export default function Dashboard(){
  const { user, profile, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()
  
  // Si el usuario es admin, redirigir automáticamente al panel de administración
  if (profile?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }
  const [view, setView] = useState('menu') // 'menu', 'enrollment', 'payment', 'profile'
  const [schedules, setSchedules] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [loading, setLoading] = useState(true)
  
  // User profile data - ahora viene del contexto
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dob: '',
    address: ''
  })
  const [profileErrors, setProfileErrors] = useState({})

  // Cargar datos al montar el componente
  useEffect(() => {
    if (profile) {
      console.log('Profile data:', profile) // Debug: ver el perfil
      setProfileData({
        firstName: profile.first_name || '',
        lastName: profile.last_name || '',
        email: user?.email || '',
        phone: profile.phone || '',
        dob: profile.date_of_birth || '',
        address: profile.address || ''
      })
    }
    loadSchedules()
    loadEnrollments()
  }, [profile, user])

  // Cargar horarios disponibles
  async function loadSchedules() {
    try {
      const { data, error } = await supabase
        .from('training_schedules')
        .select('*')
        .eq('is_active', true)
        .order('day_of_week')
        .order('time_slot')
      
      if (error) throw error
      setSchedules(data || [])
    } catch (error) {
      console.error('Error loading schedules:', error)
    }
  }

  // Cargar inscripciones del usuario
  async function loadEnrollments() {
    try {
      const { data, error } = await supabase
        .from('enrollments')
        .select('*, training_schedules(*)')
        .eq('user_id', user?.id)
        .eq('status', 'active')
      
      if (error) throw error
      setEnrollments(data || [])
    } catch (error) {
      console.error('Error loading enrollments:', error)
    } finally {
      setLoading(false)
    }
  }

  function handleProfileChange(field, value){
    setProfileData(prev => ({...prev, [field]: value}))
    // Clear error when user starts typing
    if(profileErrors[field]){
      setProfileErrors(prev => ({...prev, [field]: ''}))
    }
  }

  async function handleProfileSave(){
    const errors = {}
    if(!profileData.firstName) errors.firstName = 'El nombre es obligatorio'
    if(!profileData.lastName) errors.lastName = 'El apellido es obligatorio'
    if(!profileData.phone) errors.phone = 'El teléfono es obligatorio'
    if(!profileData.dob) errors.dob = 'La fecha de nacimiento es obligatoria'

    setProfileErrors(errors)
    if(Object.keys(errors).length === 0){
      try {
        const { error } = await supabase
          .from('profiles')
          .update({
            first_name: profileData.firstName,
            last_name: profileData.lastName,
            phone: profileData.phone,
            date_of_birth: profileData.dob,
            address: profileData.address
          })
          .eq('id', user.id)

        if (error) throw error
        
        alert('Información actualizada correctamente')
        refreshProfile()
      } catch (error) {
        console.error('Error updating profile:', error)
        alert('Error al actualizar la información')
      }
    }
  }

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
  const hours = ['17hs', '18hs']

  async function toggleEnrollment(scheduleId, day, hour){
    try {
      const isCurrentlyEnrolled = isEnrolled(scheduleId)
      
      if (isCurrentlyEnrolled) {
        // Dar de baja
        const enrollment = enrollments.find(e => e.schedule_id === scheduleId)
        const { error } = await supabase
          .from('enrollments')
          .delete()
          .eq('id', enrollment.id)
        
        if (error) throw error
        alert(`Te diste de baja de ${day} - ${hour}`)
      } else {
        // Inscribirse
        const { error } = await supabase
          .from('enrollments')
          .insert({
            user_id: user.id,
            schedule_id: scheduleId,
            status: 'active'
          })
        
        if (error) throw error
        alert(`Te inscribiste a ${day} - ${hour}`)
      }
      
      // Recargar inscripciones
      await loadEnrollments()
    } catch (error) {
      console.error('Error toggling enrollment:', error)
      alert('Error al procesar la inscripción')
    }
  }

  function isEnrolled(scheduleId){
    return enrollments.some(e => e.schedule_id === scheduleId)
  }

  function getScheduleId(day, hour) {
    const schedule = schedules.find(s => s.day_of_week === day && s.time_slot === hour)
    return schedule?.id
  }

  if(view === 'profile'){
    return (
      <div className="page page-center">
        <div className="auth-card" style={{maxWidth:520}}>
          <h2>Información personal</h2>
          <p style={{color:'var(--muted)',marginBottom:'1rem',fontSize:'0.9rem'}}>Actualiza tus datos personales</p>
          
          <form className="auth-form" onSubmit={(e) => {e.preventDefault(); handleProfileSave()}}>
            <label>
              Nombre
              <input 
                type="text" 
                value={profileData.firstName}
                onChange={(e) => handleProfileChange('firstName', e.target.value)}
                className={profileErrors.firstName ? 'input-error' : ''}
              />
              {profileErrors.firstName && <span className="error-text">{profileErrors.firstName}</span>}
            </label>

            <label>
              Apellido
              <input 
                type="text" 
                value={profileData.lastName}
                onChange={(e) => handleProfileChange('lastName', e.target.value)}
                className={profileErrors.lastName ? 'input-error' : ''}
              />
              {profileErrors.lastName && <span className="error-text">{profileErrors.lastName}</span>}
            </label>

            <label>
              Correo electrónico
              <input 
                type="email" 
                value={profileData.email}
                onChange={(e) => handleProfileChange('email', e.target.value)}
                className={profileErrors.email ? 'input-error' : ''}
              />
              {profileErrors.email && <span className="error-text">{profileErrors.email}</span>}
            </label>

            <label>
              Teléfono
              <input 
                type="tel" 
                value={profileData.phone}
                onChange={(e) => handleProfileChange('phone', e.target.value)}
                className={profileErrors.phone ? 'input-error' : ''}
              />
              {profileErrors.phone && <span className="error-text">{profileErrors.phone}</span>}
            </label>

            <label>
              Fecha de nacimiento
              <input 
                type="date" 
                value={profileData.dob}
                onChange={(e) => handleProfileChange('dob', e.target.value)}
                className={profileErrors.dob ? 'input-error' : ''}
              />
              {profileErrors.dob && <span className="error-text">{profileErrors.dob}</span>}
            </label>

            <label>
              Dirección
              <input 
                type="text" 
                value={profileData.address}
                onChange={(e) => handleProfileChange('address', e.target.value)}
              />
            </label>

            <button type="submit" className="btn-primary" style={{marginTop:'0.5rem'}}>
              Guardar cambios
            </button>
          </form>

          <div style={{marginTop:'1.5rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <button 
              onClick={() => setView('menu')}
              style={{color:'var(--muted)',fontSize:'0.9rem',background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}
            >
              ← Volver al menú
            </button>
          </div>
        </div>
      </div>
    )
  }

  if(view === 'payment'){
    return (
      <div className="page page-center">
        <div className="auth-card" style={{maxWidth:520}}>
          <h2>Realizar el pago mensual</h2>
          <p style={{color:'var(--muted)',marginBottom:'1.5rem',fontSize:'0.9rem'}}>Transferí el monto correspondiente a la siguiente cuenta</p>
          
          <div style={{background:'#f9fafb',padding:'1.25rem',borderRadius:'10px',marginBottom:'1rem'}}>
            <div style={{marginBottom:'1rem'}}>
              <p style={{fontSize:'0.85rem',color:'var(--muted)',marginBottom:'0.25rem',fontWeight:600}}>CBU</p>
              <p style={{fontSize:'1.1rem',color:'var(--text)',fontWeight:700,margin:0,letterSpacing:'0.5px'}}>0000003100012345678901</p>
            </div>
            
            <div style={{marginBottom:'1rem'}}>
              <p style={{fontSize:'0.85rem',color:'var(--muted)',marginBottom:'0.25rem',fontWeight:600}}>Alias</p>
              <p style={{fontSize:'1.1rem',color:'var(--text)',fontWeight:700,margin:0}}>escuela.daprotis</p>
            </div>
            
            <div>
              <p style={{fontSize:'0.85rem',color:'var(--muted)',marginBottom:'0.25rem',fontWeight:600}}>Titular</p>
              <p style={{fontSize:'1rem',color:'var(--text)',fontWeight:600,margin:0}}>Matías Rodriguez</p>
            </div>
          </div>

          <div style={{background:'#fef3c7',padding:'1rem',borderRadius:'8px',marginBottom:'1.5rem',border:'1px solid #fcd34d'}}>
            <p style={{fontSize:'0.85rem',color:'#92400e',margin:0}}>
              <strong>⚠️ Importante:</strong> Una vez realizada la transferencia, enviá el comprobante por WhatsApp al +54 9 223 123-4567
            </p>
          </div>

          <div style={{marginTop:'1.5rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <button 
              onClick={() => setView('menu')}
              style={{color:'var(--muted)',fontSize:'0.9rem',background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}
            >
              ← Volver al menú
            </button>
          </div>
        </div>
      </div>
    )
  }

  if(view === 'enrollment'){
    return (
      <div className="page page-center">
        <div className="auth-card" style={{maxWidth:720}}>
          <h2>Anotarme al entrenamiento</h2>
          <p style={{color:'var(--muted)',marginBottom:'1rem',fontSize:'0.9rem'}}>Selecciona los días y horarios</p>
          
          <div className="enrollment-grid">
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr>
                  <th style={{padding:'0.75rem',textAlign:'left',borderBottom:'2px solid #e6e9ef',color:'var(--text)',fontWeight:600}}>Día</th>
                  {hours.map(hour => (
                    <th key={hour} style={{padding:'0.75rem',textAlign:'center',borderBottom:'2px solid #e6e9ef',color:'var(--text)',fontWeight:600}}>{hour}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map(day => (
                  <tr key={day}>
                    <td style={{padding:'0.75rem',borderBottom:'1px solid #e6e9ef',fontWeight:500}}>{day}</td>
                    {hours.map(hour => {
                      const scheduleId = getScheduleId(day, hour)
                      const enrolled = scheduleId && isEnrolled(scheduleId)
                      
                      return (
                        <td key={hour} style={{padding:'0.75rem',textAlign:'center',borderBottom:'1px solid #e6e9ef'}}>
                          <button 
                            onClick={() => scheduleId && toggleEnrollment(scheduleId, day, hour)}
                            className="btn-enroll"
                            disabled={!scheduleId || loading}
                            style={{
                              background: enrolled ? 'linear-gradient(90deg,#10b981,#059669)' : 'linear-gradient(90deg,var(--blue-1),var(--blue-2))',
                              color:'white',
                              padding:'0.5rem 1rem',
                              borderRadius:'8px',
                              border:'none',
                              fontWeight:600,
                              cursor: scheduleId ? 'pointer' : 'not-allowed',
                              fontSize:'0.85rem',
                              minWidth:'100px',
                              transition:'opacity 0.2s',
                              opacity: scheduleId ? 1 : 0.5
                            }}
                            onMouseOver={(e) => e.target.style.opacity = '0.9'}
                            onMouseOut={(e) => e.target.style.opacity = '1'}
                          >
                            {enrolled ? '✓ Anotado' : 'Anotarme'}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{marginTop:'1.5rem',display:'flex',justifyContent:'space-between',alignItems:'center',gap:'1rem'}}>
            <button 
              onClick={() => setView('menu')}
              style={{color:'var(--muted)',fontSize:'0.9rem',background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}
            >
              ← Volver al menú
            </button>
            <button 
              className="btn-primary"
              style={{padding:'0.5rem 1rem',fontSize:'0.9rem'}}
              onClick={() => {
                const enrolled = Object.entries(enrollments).filter(([_, val]) => val).map(([key]) => key)
                if(enrolled.length > 0){
                  alert(`Has sido inscrito en: ${enrolled.join(', ')}`)
                } else {
                  alert('No has seleccionado ningún horario')
                }
              }}
            >
              Confirmar inscripción
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page page-center">
      <div className="auth-card" style={{maxWidth:520}}>
        <h2>Hola, {profile?.first_name || 'Usuario'}!</h2>
        <p style={{color:'var(--muted)',marginBottom:'1rem',fontSize:'0.95rem'}}>¿Qué querés hacer hoy?</p>
        <div className="dashboard-actions" style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
          <button 
            className="btn-primary" 
            style={{width:'100%',minHeight:'48px',fontSize:'1rem'}}
            onClick={() => setView('enrollment')}
          >
            Anotarme al entrenamiento
          </button>
          <button 
            className="btn-primary" 
            style={{width:'100%',minHeight:'48px',fontSize:'1rem'}}
            onClick={() => setView('payment')}
          >
            Realizar el pago mensual
          </button>
          <button 
            className="btn-primary" 
            style={{width:'100%',minHeight:'48px',fontSize:'1rem'}}
            onClick={() => setView('profile')}
          >
            Información personal
          </button>
        </div>

        <div style={{marginTop:'1.5rem',textAlign:'center'}}>
          <button 
            onClick={handleLogout}
            style={{color:'#ef4444',fontSize:'0.9rem',background:'none',border:'none',cursor:'pointer',textDecoration:'underline',fontWeight:600}}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}

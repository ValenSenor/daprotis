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
  const [errorMessage, setErrorMessage] = useState('')
  
  // User profile data - ahora viene del contexto
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dob: '',
  })
  const [profileErrors, setProfileErrors] = useState({})

  // Helpers para calcular inicio/fin de semana (Lunes a Domingo)
  function startOfWeekISO(date = new Date()) {
    const d = new Date(date)
    const day = d.getDay() // 0 (Sun) ... 6 (Sat)
    const diff = (day + 6) % 7 // days since Monday
    d.setDate(d.getDate() - diff)
    d.setHours(0,0,0,0)
    return d.toISOString()
  }

  function endOfWeekISO(date = new Date()) {
    const start = new Date(startOfWeekISO(date))
    start.setDate(start.getDate() + 7)
    start.setHours(0,0,0,0)
    return start.toISOString()
  }

  // Cargar datos al montar el componente
  useEffect(() => {
    if (profile) {
      console.log('Profile data:', profile) // Debug: ver el perfil
      setProfileData({
        firstName: profile.first_name || '',
        lastName: profile.last_name || '',
        email: user?.email || '',
        phone: profile.phone || '',
        dob: profile.date_of_birth || ''
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
      if (!user || !user.id) {
        console.warn('toggleEnrollment: no user or missing user.id', user)
        alert('Debes iniciar sesión para anotarte')
        return
      }

      const scheduleObj = schedules.find(s => s.id === scheduleId)
      if (!scheduleObj) {
        console.warn('toggleEnrollment: schedule not found for id', scheduleId)
        alert('Horario no encontrado. Intenta recargar la página.')
        return
      }

      const isCurrentlyEnrolled = isEnrolled(scheduleId)
      
      if (isCurrentlyEnrolled) {
        // Dar de baja
        const enrollment = enrollments.find(e => e.schedule_id === scheduleId)
        const { data: delData, error: delError } = await supabase
          .from('enrollments')
          .delete()
          .eq('id', enrollment.id)

        if (delError) {
          console.error('Error deleting enrollment:', delError)
          const m = delError?.message || String(delError)
          setErrorMessage(`Error al darte de baja: ${m}`)
          setLoading(false)
          return
        }

        console.log('Deleted enrollment response:', delData)
        alert(`Te diste de baja de ${day} - ${hour}`)
      } else {
        // Inscribirse: regla mensual
        const today = new Date()
        const dayOfMonth = today.getDate()

        // Del 1 al 7: permitir inscripción sin chequear pago
          if (dayOfMonth >= 1 && dayOfMonth <= 7) {
          // quick insert without payment checks
          console.log('Attempting enrollment insert payload:', { user_id: user.id, schedule_id: scheduleId, status: 'active' })
          const { data: insertData, error: insertError } = await supabase
            .from('enrollments')
            .insert({ user_id: user.id, schedule_id: scheduleId, status: 'active' })

          if (insertError) {
            console.error('Error inserting enrollment (day 1-7):', insertError)
            const m = insertError?.message || String(insertError)
            setErrorMessage(`Error al procesar la inscripción: ${m}`)
            setLoading(false)
            return
          }

          console.log('Enrollment created (day 1-7):', insertData)
          alert(`Te inscribiste a ${day} - ${hour}`)
        } else {
          // Después del día 7: verificar que el último pago sea del mes actual
            const lastPayment = profile?.last_payment_date
            function paidThisMonth(dateStr) {
              if (!dateStr) return false
              const d = new Date(dateStr)
              const now = new Date()
              return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
            }

            if (!paidThisMonth(lastPayment)) {
              alert('Adeudas la cuota, comunicate con Matias')
              return
            }

            // El campo `cant_por_semana` ahora sólo sirve como límite semanal
            const rawLimit = profile?.cant_por_semana
            const limit = parseInt(rawLimit, 10)
            if (!limit || isNaN(limit) || limit <= 0) {
              alert('Tu plan no tiene un cupo válido. Comunicate con Matias')
              return
            }

            // Aplicar límite semanal (Lunes a lunes)
            const start = startOfWeekISO(new Date())
            const end = endOfWeekISO(new Date())

            const countRes = await supabase
              .from('enrollments')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('status', 'active')
              .gte('enrolled_at', start)
              .lt('enrolled_at', end)

            if (countRes.error) {
              console.error('Error counting enrollments:', countRes.error)
              const m = countRes.error?.message || String(countRes.error)
              setErrorMessage(`Error al procesar la inscripción: ${m}`)
              setLoading(false)
              return
            }
            const currentCount = countRes.count || 0

            if (currentCount >= limit) {
              alert(`No podés anotarte a más de ${limit} entrenamientos por semana.`)
            } else {
              console.log('Attempting enrollment insert payload (post-7):', { user_id: user.id, schedule_id: scheduleId, status: 'active' })
              const { data: insertData2, error: insertError2 } = await supabase
                .from('enrollments')
                .insert({ user_id: user.id, schedule_id: scheduleId, status: 'active' })

              if (insertError2) {
                console.error('Error inserting enrollment (post-7):', insertError2)
                const m = insertError2?.message || String(insertError2)
                setErrorMessage(`Error al procesar la inscripción: ${m}`)
                setLoading(false)
                return
              }

              console.log('Enrollment created (post-7):', insertData2)
              alert(`Te inscribiste a ${day} - ${hour}`)
            }
        }
      }
      
      // Recargar inscripciones
      await loadEnrollments()
    } catch (error) {
      // Provide more info in console and show specific message when available
      console.error('Error toggling enrollment:', error)
      const msg = (error && (error.message || error.error || error.description)) || 'Error al procesar la inscripción'
      setErrorMessage(msg)
      setLoading(false)
    }
  }

  function isEnrolled(scheduleId){
    return enrollments.some(e => e.schedule_id === scheduleId)
  }

  function getScheduleId(day, hour) {
    const schedule = schedules.find(s => s.day_of_week === day && s.time_slot === hour)
    return schedule?.id
  }

  // Mostrar mensaje de error no bloqueante (se muestra hasta cerrar)
  if (errorMessage) {
    return (
      <div className="page page-center">
        <div className="auth-card" style={{maxWidth:520}}>
          <h2>Atención</h2>
          <p style={{color:'var(--muted)',marginBottom:'1rem'}}>{errorMessage}</p>
          <div style={{display:'flex',gap:'0.5rem',justifyContent:'flex-end'}}>
            <button
              onClick={() => setErrorMessage('')}
              className="btn-primary"
              style={{minHeight:'40px'}}
            >
              Cerrar
            </button>
            <button
              onClick={() => { setErrorMessage(''); setView('menu') }}
              style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',textDecoration:'underline'}}
            >
              Volver al menú
            </button>
          </div>
        </div>
      </div>
    )
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

            {/* Dirección field removed per request */}

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

          <div style={{display:'flex',gap:'0.4rem',marginBottom:'1rem',flexWrap:'nowrap',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{flex:'1 1 90px',minWidth:'70px',background:'#f9fafb',padding:'0.35rem 0.4rem',borderRadius:'8px',border:'1px solid #e6e9ef',textAlign:'center'}}>
              <div style={{fontSize:'0.72rem',color:'var(--muted)',marginBottom:'0.2rem',fontWeight:600}}>3 x semana</div>
              <div style={{fontSize:'0.85rem',fontWeight:700,color:'#0c0c0c'}}>$31.000</div>
            </div>
            <div style={{flex:'1 1 90px',minWidth:'70px',background:'#f9fafb',padding:'0.35rem 0.4rem',borderRadius:'8px',border:'1px solid #e6e9ef',textAlign:'center'}}>
              <div style={{fontSize:'0.72rem',color:'var(--muted)',marginBottom:'0.2rem',fontWeight:600}}>2 x semana</div>
              <div style={{fontSize:'0.85rem',fontWeight:700,color:'#0c0c0c'}}>$26.000</div>
            </div>
            <div style={{flex:'1 1 90px',minWidth:'70px',background:'#f9fafb',padding:'0.35rem 0.4rem',borderRadius:'8px',border:'1px solid #e6e9ef',textAlign:'center'}}>
              <div style={{fontSize:'0.72rem',color:'var(--muted)',marginBottom:'0.2rem',fontWeight:600}}>Clase personal</div>
              <div style={{fontSize:'0.85rem',fontWeight:700,color:'#0c0c0c'}}>$10.000</div>
            </div>
          </div>

          <div style={{background:'#f9fafb',padding:'1.25rem',borderRadius:'10px',marginBottom:'1rem'}}>
            <div style={{marginBottom:'1rem'}}>
              <p style={{fontSize:'0.85rem',color:'var(--muted)',marginBottom:'0.25rem',fontWeight:600}}>CBU</p>
              <p style={{fontSize:'1.1rem',color:'var(--text)',fontWeight:700,margin:0,letterSpacing:'0.5px'}}>3840200500000044625113</p>
            </div>
            
            <div style={{marginBottom:'1rem'}}>
              <p style={{fontSize:'0.85rem',color:'var(--muted)',marginBottom:'0.25rem',fontWeight:600}}>Alias</p>
              <p style={{fontSize:'1.1rem',color:'var(--text)',fontWeight:700,margin:0}}>DaprotisFutvoley</p>
            </div>
            
            <div>
              <p style={{fontSize:'0.85rem',color:'var(--muted)',marginBottom:'0.25rem',fontWeight:600}}>Titular</p>
              <p style={{fontSize:'1rem',color:'var(--text)',fontWeight:600,margin:0}}>Matías Rodriguez</p>
            </div>
          </div>

          <div style={{background:'#fef3c7',padding:'1rem',borderRadius:'8px',marginBottom:'1.5rem',border:'1px solid #fcd34d'}}>
            <p style={{fontSize:'0.85rem',color:'#92400e',margin:0}}>
              <strong>⚠️ Importante:</strong> Una vez realizada la transferencia, enviá el comprobante por WhatsApp al +54 9 2235829356 (Matias) para confirmar tu pago.
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
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {schedules.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '1rem' }}>No hay entrenamientos activos por el momento.</p>
            ) : (
              schedules.map(schedule => {
                const enrolled = isEnrolled(schedule.id)
                return (
                  <div key={schedule.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e6e9ef' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '1rem', color: '#0c0c0c' }}>{schedule.day_of_week} — {schedule.time_slot}</div>
                      {schedule.max_capacity != null && (
                        <div style={{ fontSize: '0.85rem', color: '#0c0c0c' }}>Capacidad: {schedule.max_capacity}</div>
                      )}
                    </div>
                    <div>
                      <button
                        onClick={() => toggleEnrollment(schedule.id, schedule.day_of_week, schedule.time_slot)}
                        className="btn-enroll"
                        disabled={loading}
                        style={{
                          background: 'rgb(250,234,5)',
                          color: '#0c0c0c',
                          padding: '0.5rem 1rem',
                          borderRadius: '8px',
                          border: 'none',
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontSize: '0.9rem'
                        }}
                      >
                        {enrolled ? '✓ Anotado' : 'Anotarme'}
                      </button>
                    </div>
                  </div>
                )
              })
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
              <button
                onClick={() => setView('menu')}
                style={{ color: 'var(--muted)', fontSize: '0.9rem', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                ← Volver al menú
              </button>
            </div>
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

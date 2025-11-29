import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { supabase } from './supabaseClient'
import './App.css'

export default function Admin() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [view, setView] = useState(searchParams.get('view') || 'menu') // 'menu', 'users', 'enrollments', 'schedules'
  const [users, setUsers] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(null)
  const [newSchedule, setNewSchedule] = useState({ day_of_week: '', max_capacity: 15 })
  const [timeStart, setTimeStart] = useState('')
  const [editingUserDueDate, setEditingUserDueDate] = useState(null)
  const [editingUserValues, setEditingUserValues] = useState({})
  const [showEnrolledModal, setShowEnrolledModal] = useState(false)
  const [enrolledUsers, setEnrolledUsers] = useState([])
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalEnrollments: 0,
    pendingPayments: 0,
    totalRevenue: 0
  })

  useEffect(() => {
    loadStats()
  }, [])

  useEffect(() => {
    const currentView = searchParams.get('view') || 'menu'
    setView(currentView)
  }, [searchParams])

  useEffect(() => {
    if (view === 'users') loadUsers()
    if (view === 'enrollments') loadEnrollments()
    if (view === 'schedules') loadSchedules()
  }, [view])

  async function loadStats() {
    try {
      // Count only real users (exclude admins)
      const usersRes = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'user')

      // Calculate paid users this month: users with last_payment_date inside current month
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const startIso = startOfMonth.toISOString()
      const endIso = startOfNextMonth.toISOString()

      const paidThisMonthRes = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'user')
        .gte('last_payment_date', startIso)
        .lt('last_payment_date', endIso)

      // payments table removed — metrics default to zero
      const pendingPayments = 0
      const totalRevenue = 0

      setStats({
        totalUsers: usersRes.count || 0,
        totalEnrollments: paidThisMonthRes.count || 0,
        pendingPayments,
        totalRevenue
      })
    } catch (error) {
      console.error('Error loading stats:', error)
    }
  }

  async function loadUsers() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'user')
        .order('id', { ascending: false })

      if (error) throw error
      setUsers(data || [])
    } catch (error) {
      console.error('Error loading users:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadEnrollments() {
    setLoading(true)
    try {
      const [enrollmentsRes, schedulesRes] = await Promise.all([
        supabase
          .from('enrollments')
          .select('*, profiles(first_name, last_name, email)')
          .eq('status', 'active')
          .order('enrolled_at', { ascending: false }),
        supabase.from('training_schedules').select('*')
      ])

      if (enrollmentsRes.error) throw enrollmentsRes.error
      if (schedulesRes.error) throw schedulesRes.error

      setEnrollments(enrollmentsRes.data || [])
      setSchedules(schedulesRes.data || [])
    } catch (error) {
      console.error('Error loading enrollments:', error)
    } finally {
      setLoading(false)
    }
  }

  

  async function loadSchedules() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('training_schedules')
        .select('*')
        .order('day_of_week', { ascending: true })

      if (error) throw error
      
      // Contar inscriptos por horario
      const schedulesWithCount = await Promise.all(
        (data || []).map(async (schedule) => {
          const { count } = await supabase
            .from('enrollments')
            .select('id', { count: 'exact', head: true })
            .eq('schedule_id', schedule.id)
            .eq('status', 'active')
          
          return { ...schedule, enrolled: count || 0 }
        })
      )
      
      setSchedules(schedulesWithCount)
    } catch (error) {
      console.error('Error loading schedules:', error)
    } finally {
      setLoading(false)
    }
  }

  function isPaidThisMonth(lastPaymentDate) {
    if (!lastPaymentDate) return false
    const d = new Date(lastPaymentDate)
    const now = new Date()
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }

  async function createSchedule() {
    if (!newSchedule.day_of_week || !timeStart) {
      alert('Por favor completa todos los campos')
      return
    }

    try {
      const scheduleData = {
        ...newSchedule,
        time_slot: timeStart
      }
      
      console.log('Intentando crear horario:', scheduleData)
      const { data, error } = await supabase
        .from('training_schedules')
        .insert([scheduleData])
        .select()

      if (error) {
        console.error('Error de Supabase:', error)
        throw error
      }

      console.log('Horario creado:', data)
      alert('Horario creado correctamente')
      setNewSchedule({ day_of_week: '', max_capacity: 15 })
      setTimeStart('')
      loadSchedules()
    } catch (error) {
      console.error('Error creating schedule:', error)
      alert(`Error al crear el horario: ${error.message || 'Error desconocido'}`)
    }
  }

  async function updateSchedule(scheduleId, updates) {
    try {
      const { error } = await supabase
        .from('training_schedules')
        .update(updates)
        .eq('id', scheduleId)

      if (error) throw error

      alert('Horario actualizado correctamente')
      setEditingSchedule(null)
      loadSchedules()
    } catch (error) {
      console.error('Error updating schedule:', error)
      alert('Error al actualizar el horario')
    }
  }

  async function deleteSchedule(scheduleId) {
    if (!confirm('¿Estás seguro de eliminar este horario? Se eliminarán todas las inscripciones asociadas.')) {
      return
    }

    try {
      // Primero eliminar las inscripciones
      await supabase.from('enrollments').delete().eq('schedule_id', scheduleId)
      
      // Luego eliminar el horario
      const { error } = await supabase
        .from('training_schedules')
        .delete()
        .eq('id', scheduleId)

      if (error) throw error

      alert('Horario eliminado correctamente')
      loadSchedules()
    } catch (error) {
      console.error('Error deleting schedule:', error)
      alert('Error al eliminar el horario')
    }
  }

  function getScheduleInfo(scheduleId) {
    const schedule = schedules.find(s => s.id === scheduleId)
    return schedule ? `${schedule.day_of_week} - ${schedule.time_slot}` : 'N/A'
  }

  async function updateUserProfile(userId, updates) {
    try {
      console.log('updateUserProfile called', { userId, updates })

      const res = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()

      console.log('updateUserProfile response', res)

      if (res.error) {
        console.error('Error updating profile (supabase):', res.error)
        alert(`No se pudo actualizar el perfil: ${res.error.message || res.error}`)
        return false
      }

      if (!res.data || res.data.length === 0) {
        console.warn('Update returned no rows. Verifying profile existence and permissions...')
        const sel = await supabase.from('profiles').select('*').eq('id', userId)
        console.log('select profile result', sel)

        alert('La actualización no afectó filas. Revisa la consola para más detalles (posible mismatch de ID o permisos RLS).')
        return false
      }

      alert('Actualizado correctamente')
      // Keep editing state so admin can change more fields; just reload the list
      await loadUsers()
      return true
    } catch (error) {
      console.error('Error updating profile:', error)
      alert('Error al actualizar el perfil')
      return false
    }
  }

  async function showEnrolledStudents(scheduleId) {
    try {
      const { data, error } = await supabase
        .from('enrollments')
        .select('*, profiles(first_name, last_name)')
        .eq('schedule_id', scheduleId)
        .eq('status', 'active')
        .order('enrolled_at', { ascending: true })

      if (error) throw error
      setEnrolledUsers(data || [])
      setShowEnrolledModal(true)
    } catch (error) {
      console.error('Error loading enrolled students:', error)
      alert('Error al cargar los inscriptos')
    }
  }

  // Vista de estadísticas (menu principal)
  if (view === 'menu') {
    return (
      <div className="site">
        <div className="site-inner" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
        <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 12px 36px rgba(2,6,23,0.08)', maxWidth: 720, margin: '0 auto' }}>
          <h2 style={{ color: '#0c0c0c' }}>Panel de Administración</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
            Bienvenido, {profile?.first_name}
          </p>

          {/* Tarjetas de estadísticas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ background: 'rgb(250,234,5)', padding: '1.25rem', borderRadius: '10px', textAlign: 'center' }}>
              <p style={{ fontSize: '2rem', fontWeight: 700, color: '#0c0c0c', margin: 0 }}>{stats.totalUsers}</p>
              <p style={{ fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
                <span style={{ background: 'rgb(250,234,5)', color: '#0c0c0c', padding: '0.2rem 0.5rem', borderRadius: '999px', fontWeight: 700, display: 'inline-block' }}>Alumnos registrados</span>
              </p>
            </div>
            <div style={{ background: 'rgb(250,234,5)', padding: '1.25rem', borderRadius: '10px', textAlign: 'center' }}>
              <p style={{ fontSize: '2rem', fontWeight: 700, color: '#0c0c0c', margin: 0 }}>{stats.totalEnrollments}</p>
              <p style={{ fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
                <span style={{ background: 'rgb(250,234,5)', color: '#0c0c0c', padding: '0.2rem 0.5rem', borderRadius: '999px', fontWeight: 700, display: 'inline-block' }}>Alumnos al dia</span>
              </p>
            </div>
          </div>

          {/* Botones de navegación */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button
              className="btn-primary"
              style={{ width: '100%', minHeight: '48px', fontSize: '1rem' }}
              onClick={() => navigate('/admin?view=users')}
            >
              Ver todos los Alumnos
            </button>
            <button
              className="btn-primary"
              style={{ width: '100%', minHeight: '48px', fontSize: '1rem' }}
              onClick={() => navigate('/admin?view=schedules')}
            >
              Gestionar entrenamientos
            </button>
          </div>

          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <button
              onClick={signOut}
              style={{ color: '#ef4444', fontSize: '0.9rem', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}
            >
              Cerrar sesión
            </button>
          </div>
        </div>
        </div>
      </div>
    )
  }

  // Vista de usuarios
  if (view === 'users') {
    return (
      <div className="site">
        <div className="site-inner" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '12px', boxShadow: '0 12px 36px rgba(2,6,23,0.08)', maxWidth: 920, margin: '0 auto' }}>
          <h2 style={{ padding: '0 0.5rem', color: '#0c0c0c' }}>Usuarios registrados</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '1rem', fontSize: '0.9rem', padding: '0 0.5rem' }}>
            Total: {users.length} usuarios
          </p>

          {loading ? (
            <p style={{ padding: '0 0.5rem' }}>Cargando...</p>
          ) : (
            <div className="users-grid">
              {users.map(user => (
                <div key={user.id} className="user-card">
                  <div className="user-card-header">
                    <div>
                      <div className="user-name">{user.first_name} {user.last_name}</div>
                      <div className="user-phone">{user.phone || 'Sin teléfono'}</div>
                    </div>
                    {isPaidThisMonth(user.last_payment_date) ? (
                      <div className="user-badge">al dia</div>
                    ) : (
                      <div className="user-badge unpaid">impago</div>
                    )}
                  </div>

                  <div className="user-card-footer">
                    <div>
                      <div className="muted small">Último pago</div>
                      {editingUserDueDate === user.id ? (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <input
                            type="date"
                            value={(editingUserValues[user.id] && editingUserValues[user.id].last_payment_date) ?? (user.last_payment_date || '')}
                            onChange={(e) => setEditingUserValues(prev => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), last_payment_date: e.target.value } }))}
                            autoFocus
                            className="small-input"
                          />
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.15rem' }}>Cant veces</label>
                            <select
                              value={(editingUserValues[user.id] && editingUserValues[user.id].cant_por_semana) ?? (user.cant_por_semana ?? 2)}
                              onChange={(e) => setEditingUserValues(prev => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), cant_por_semana: e.target.value } }))}
                              className="small-input"
                              style={{ padding: '0.35rem' }}
                            >
                              <option value="2">2</option>
                              <option value="3">3</option>
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div className="last-payment">
                          {user.last_payment_date ? new Date(user.last_payment_date).toLocaleDateString('es-AR') : 'Sin pago'}
                          <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                            Cant por semana: {user.cant_por_semana || '—'}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        if (editingUserDueDate === user.id) {
                          // Save values
                          const vals = editingUserValues[user.id] || {}
                          const payload = {
                            last_payment_date: vals.last_payment_date || null,
                            cant_por_semana: vals.cant_por_semana ? parseInt(vals.cant_por_semana) : null
                          }
                          updateUserProfile(user.id, payload).then((ok) => {
                            if (ok) {
                              setEditingUserDueDate(null)
                              setEditingUserValues(prev => { const next = { ...prev }; delete next[user.id]; return next })
                            }
                          })
                        } else {
                          // Enter edit mode and prefill values
                          setEditingUserDueDate(user.id)
                          setEditingUserValues(prev => ({ ...prev, [user.id]: { last_payment_date: user.last_payment_date || '', cant_por_semana: user.cant_por_semana ?? 2 } }))
                        }
                      }}
                      className="edit-btn"
                    >
                      {editingUserDueDate === user.id ? '✓' : '✏️'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: '1.5rem', padding: '0 0.5rem' }}>
            <button
              onClick={() => navigate('/admin')}
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

  // Vista de inscripciones
  if (view === 'enrollments') {
    return (
      <div className="site">
        <div className="site-inner" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
        <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 12px 36px rgba(2,6,23,0.08)', maxWidth: 920, margin: '0 auto' }}>
          <h2>Inscripciones activas</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
            Total: {enrollments.length} inscripciones
          </p>

          {loading ? (
            <p>Cargando...</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e6e9ef' }}>Usuario</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e6e9ef' }}>Email</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e6e9ef' }}>Horario</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e6e9ef' }}>Fecha inscripción</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map(enrollment => (
                    <tr key={enrollment.id}>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #e6e9ef' }}>
                        {enrollment.profiles?.first_name} {enrollment.profiles?.last_name}
                      </td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #e6e9ef', color: 'var(--muted)' }}>
                        {enrollment.profiles?.email}
                      </td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #e6e9ef', fontWeight: 600 }}>
                        {getScheduleInfo(enrollment.schedule_id)}
                      </td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #e6e9ef', color: 'var(--muted)' }}>
                        {new Date(enrollment.enrolled_at).toLocaleDateString('es-AR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: '1.5rem' }}>
            <button
              onClick={() => navigate('/admin')}
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

  

  // Vista de gestión de entrenamientos
  if (view === 'schedules') {
    return (
      <div className="site">
        <div className="site-inner" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '12px', boxShadow: '0 12px 36px rgba(2,6,23,0.08)', maxWidth: 920, margin: '0 auto', position: 'relative' }}>
          <h2 style={{ padding: '0 0.5rem', color: '#0c0c0c' }}>Gestión de entrenamientos</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', fontSize: '0.9rem', padding: '0 0.5rem' }}>
            Crea, edita o elimina horarios de entrenamiento
          </p>

          {/* Formulario para crear nuevo horario */}
          <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: '#0c0c0c' }}>Crear nuevo horario</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--muted)' }}>
                  Día de la semana
                </label>
                <select
                  value={newSchedule.day_of_week}
                  onChange={(e) => setNewSchedule({ ...newSchedule, day_of_week: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #e6e9ef', fontSize: '0.9rem' }}
                >
                  <option value="">Seleccionar día</option>
                  <option value="Lunes">Lunes</option>
                  <option value="Martes">Martes</option>
                  <option value="Miércoles">Miércoles</option>
                  <option value="Jueves">Jueves</option>
                  <option value="Viernes">Viernes</option>
                  <option value="Sábado">Sábado</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-end' }}>
                <div style={{ width: '120px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--muted)' }}>
                    Hora
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9:]*"
                    placeholder="09:00"
                    value={timeStart}
                    onChange={(e) => {
                      let value = e.target.value.replace(/[^0-9]/g, '')
                      if (value.length >= 3) {
                        value = value.slice(0, 2) + ':' + value.slice(2, 4)
                      }
                      setTimeStart(value)
                    }}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #e6e9ef', fontSize: '0.9rem', textAlign: 'center' }}
                  />
                </div>
                <div style={{ width: '120px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--muted)' }}>
                    Capacidad
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={newSchedule.max_capacity}
                    onChange={(e) => setNewSchedule({ ...newSchedule, max_capacity: parseInt(e.target.value) })}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #e6e9ef', fontSize: '0.9rem', textAlign: 'center' }}
                  />
                </div>
              </div>
            </div>
            <button
              onClick={createSchedule}
              className="btn-primary"
              style={{ width: '100%', fontSize: '0.95rem' }}
            >
              + Crear horario
            </button>
          </div>

          {/* Lista de horarios existentes */}
          {loading ? (
            <p style={{ padding: '0 0.5rem' }}>Cargando...</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {schedules.map(schedule => (
                <div key={schedule.id} style={{ 
                  background: '#f9fafb', 
                  padding: '1rem', 
                  borderRadius: '8px',
                  border: '1px solid #e6e9ef'
                }}>
                  {/* Fila principal con día y horario */}
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      {editingSchedule === schedule.id ? (
                        <select
                          defaultValue={schedule.day_of_week}
                          onChange={(e) => updateSchedule(schedule.id, { day_of_week: e.target.value })}
                          style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid #e6e9ef', fontSize: '0.9rem', fontWeight: 600 }}
                        >
                          <option value="Lunes">Lunes</option>
                          <option value="Martes">Martes</option>
                          <option value="Miércoles">Miércoles</option>
                          <option value="Jueves">Jueves</option>
                          <option value="Viernes">Viernes</option>
                          <option value="Sábado">Sábado</option>
                        </select>
                      ) : (
                        <div style={{ fontWeight: 600, fontSize: '1rem', flex: 1, color: '#0c0c0c' }}>{schedule.day_of_week}</div>
                      )}
                    </div>
                    <div>
                      {editingSchedule === schedule.id ? (
                        <input
                          type="text"
                          defaultValue={schedule.time_slot}
                          onBlur={(e) => updateSchedule(schedule.id, { time_slot: e.target.value })}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #e6e9ef', fontSize: '0.9rem' }}
                        />
                      ) : (
                        <div style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>{schedule.time_slot}</div>
                      )}
                    </div>
                  </div>

                  {/* Fila de estadísticas e inscriptos */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr', 
                    gap: '0.75rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid #e6e9ef',
                    marginBottom: '0.75rem'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#0c0c0c', marginBottom: '0.25rem' }}>
                        Inscriptos
                      </div>
                      <span 
                        onClick={() => schedule.enrolled > 0 && showEnrolledStudents(schedule.id)}
                        style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '12px',
                          background: '#FFD400',
                          color: '#0c0c0c',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          cursor: schedule.enrolled > 0 ? 'pointer' : 'default'
                        }}
                      >
                        {schedule.enrolled || 0}
                      </span>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#0c0c0c', marginBottom: '0.25rem' }}>
                        Capacidad máxima
                      </div>
                      {editingSchedule === schedule.id ? (
                        <input
                          type="number"
                          min="1"
                          defaultValue={schedule.max_capacity}
                          onBlur={(e) => updateSchedule(schedule.id, { max_capacity: parseInt(e.target.value) })}
                          style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #e6e9ef', fontSize: '0.85rem', width: '80px' }}
                        />
                      ) : (
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0c0c0c' }}>{schedule.max_capacity}</div>
                      )}
                    </div>
                  </div>

                  {/* Botones de acción */}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {editingSchedule === schedule.id ? (
                      <button
                        onClick={() => setEditingSchedule(null)}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          fontSize: '0.85rem',
                          background: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                      >
                        ✓ Listo
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditingSchedule(schedule.id)}
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            fontSize: '0.85rem',
                            background: 'rgb(250,234,5)',
                            color: '#0c0c0c',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 600
                          }}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => deleteSchedule(schedule.id)}
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            fontSize: '0.85rem',
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 600
                          }}
                        >
                          Eliminar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              
              {schedules.length === 0 && (
                <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
                  No hay horarios creados. Crea el primero usando el formulario de arriba.
                </p>
              )}
            </div>
          )}

          <div style={{ marginTop: '1.5rem' }}>
            <button
              onClick={() => navigate('/admin')}
              style={{ color: 'var(--muted)', fontSize: '0.9rem', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              ← Volver al menú
            </button>
          </div>

          {/* Modal para mostrar inscriptos */}
          {showEnrolledModal && (
            <>
              <div 
                onClick={() => setShowEnrolledModal(false)}
                style={{ 
                  position: 'fixed', 
                  top: 0, 
                  left: 0, 
                  right: 0, 
                  bottom: 0, 
                  background: 'rgba(2, 6, 23, 0.6)',
                  zIndex: 1000
                }}
              />
              <div 
                onClick={(e) => e.stopPropagation()}
                style={{ 
                  position: 'fixed', 
                  top: '50%', 
                  left: '50%', 
                  transform: 'translate(-50%, -50%)',
                  width: 'auto',
                  minWidth: '280px',
                  maxWidth: '90%',
                  zIndex: 1001
                }}
              >
                <div className="auth-card" style={{ padding: '1rem', margin: 0, minHeight: 'auto', height: 'auto' }}>
                  <h3 style={{ marginBottom: '0.5rem', fontSize: '1.4rem', marginTop: 0,textAlign: 'center' ,fontWeight: 600, color: '#0c0c0c' }}>Alumnos inscriptos</h3>
                  {enrolledUsers.length === 0 ? (
                    <p style={{ color: '#0c0c0c', textAlign: 'center', padding: '0.5rem 0', margin: 0 }}>
                      No hay alumnos inscriptos en este horario
                    </p>
                  ) : (
                    <div>
                      {enrolledUsers.map((enrollment, index) => (
                        <div 
                          key={enrollment.id}
                          style={{
                            padding: '0.5rem 0',
                            borderBottom: index < enrolledUsers.length - 1 ? '1px solid #e6e9ef' : 'none',
                            fontSize: '1.1rem',
                            textAlign: 'center',
                            color: '#0c0c0c'
                          }}
                        >
                          {enrollment.profiles?.first_name} {enrollment.profiles?.last_name}
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setShowEnrolledModal(false)}
                    className="btn-primary"
                    style={{ width: '100%', marginTop: '0.75rem', padding: '0.5rem', fontSize: '0.85rem', color: '#0c0c0c' }}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        </div>
      </div>
    )
  }
}

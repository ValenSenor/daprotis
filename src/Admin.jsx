import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { supabase } from './supabaseClient'
import './App.css'

export default function Admin() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [view, setView] = useState(searchParams.get('view') || 'menu') // 'menu', 'users', 'enrollments', 'payments', 'schedules'
  const [users, setUsers] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [payments, setPayments] = useState([])
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(null)
  const [newSchedule, setNewSchedule] = useState({ day_of_week: '', max_capacity: 15 })
  const [timeStart, setTimeStart] = useState('')
  const [editingUserDueDate, setEditingUserDueDate] = useState(null)
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
    if (view === 'payments') loadPayments()
    if (view === 'schedules') loadSchedules()
  }, [view])

  async function loadStats() {
    try {
      const [usersRes, enrollmentsRes, paymentsRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('payments').select('amount, status')
      ])

      const pendingPayments = paymentsRes.data?.filter(p => p.status === 'pending').length || 0
      const totalRevenue = paymentsRes.data
        ?.filter(p => p.status === 'verified')
        .reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0

      setStats({
        totalUsers: usersRes.count || 0,
        totalEnrollments: enrollmentsRes.count || 0,
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
        .order('created_at', { ascending: false })

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

  async function loadPayments() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*, profiles(first_name, last_name, email)')
        .order('created_at', { ascending: false })

      if (error) throw error
      setPayments(data || [])
    } catch (error) {
      console.error('Error loading payments:', error)
    } finally {
      setLoading(false)
    }
  }

  async function updatePaymentStatus(paymentId, newStatus) {
    try {
      const { error } = await supabase
        .from('payments')
        .update({
          status: newStatus,
          verified_at: newStatus === 'verified' ? new Date().toISOString() : null,
          verified_by: newStatus === 'verified' ? profile.id : null
        })
        .eq('id', paymentId)

      if (error) throw error

      alert(`Pago ${newStatus === 'verified' ? 'verificado' : 'rechazado'} correctamente`)
      loadPayments()
      loadStats()
    } catch (error) {
      console.error('Error updating payment:', error)
      alert('Error al actualizar el pago')
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

  async function updateUserDueDate(userId, paymentDate) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ last_payment_date: paymentDate })
        .eq('id', userId)

      if (error) throw error

      alert('Fecha de pago actualizada correctamente')
      setEditingUserDueDate(null)
      loadUsers()
    } catch (error) {
      console.error('Error updating payment date:', error)
      alert('Error al actualizar la fecha de pago')
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
          <h2>Panel de Administración</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
            Bienvenido, {profile?.first_name}
          </p>

          {/* Tarjetas de estadísticas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ background: '#f0f9ff', padding: '1.25rem', borderRadius: '10px', textAlign: 'center' }}>
              <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--blue-1)', margin: 0 }}>{stats.totalUsers}</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0.25rem 0 0' }}>Alumnos registrados</p>
            </div>
            <div style={{ background: '#f0fdf4', padding: '1.25rem', borderRadius: '10px', textAlign: 'center' }}>
              <p style={{ fontSize: '2rem', fontWeight: 700, color: '#10b981', margin: 0 }}>{stats.totalEnrollments}</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0.25rem 0 0' }}>Alumnos al dia</p>
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
          <h2 style={{ padding: '0 0.5rem' }}>Usuarios registrados</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '1rem', fontSize: '0.9rem', padding: '0 0.5rem' }}>
            Total: {users.length} usuarios
          </p>

          {loading ? (
            <p style={{ padding: '0 0.5rem' }}>Cargando...</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {users.map(user => (
                <div key={user.id} style={{ 
                  background: '#f9fafb', 
                  padding: '1rem', 
                  borderRadius: '8px',
                  border: '1px solid #e6e9ef'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem' }}>
                        {user.first_name} {user.last_name}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                        {user.phone || 'Sin teléfono'}
                      </div>
                    </div>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: '#d1fae5',
                      color: '#065f46',
                      whiteSpace: 'nowrap'
                    }}>
                      Al día
                    </span>
                  </div>

                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr auto', 
                    gap: '0.5rem', 
                    alignItems: 'center',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid #e6e9ef'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>
                        Último pago
                      </div>
                      {editingUserDueDate === user.id ? (
                        <input
                          type="date"
                          defaultValue={user.last_payment_date || ''}
                          onBlur={(e) => updateUserDueDate(user.id, e.target.value)}
                          autoFocus
                          style={{ 
                            padding: '0.4rem', 
                            borderRadius: '6px', 
                            border: '1px solid #e6e9ef', 
                            fontSize: '0.85rem',
                            width: '100%'
                          }}
                        />
                      ) : (
                        <div style={{ 
                          fontSize: '0.9rem',
                          color: user.last_payment_date ? 'inherit' : 'var(--muted)' 
                        }}>
                          {user.last_payment_date ? new Date(user.last_payment_date).toLocaleDateString('es-AR') : 'Sin pago'}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setEditingUserDueDate(editingUserDueDate === user.id ? null : user.id)}
                      style={{
                        padding: '0.5rem 1rem',
                        fontSize: '0.85rem',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
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

  // Vista de pagos
  if (view === 'payments') {
    return (
      <div className="site">
        <div className="site-inner" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
        <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 12px 36px rgba(2,6,23,0.08)', maxWidth: 520, margin: '0 auto' }}>
          <h2>Gestión de pagos</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Registra un nuevo pago
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--muted)' }}>
                Nombre
              </label>
              <input
                type="text"
                placeholder="Ingresa el nombre"
                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #e6e9ef', fontSize: '0.9rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--muted)' }}>
                Apellido
              </label>
              <input
                type="text"
                placeholder="Ingresa el apellido"
                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #e6e9ef', fontSize: '0.9rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--muted)' }}>
                Fecha de pago
              </label>
              <input
                type="date"
                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #e6e9ef', fontSize: '0.9rem' }}
              />
            </div>

            <button
              className="btn-primary"
              style={{ width: '100%', fontSize: '0.95rem', marginTop: '0.5rem' }}
            >
              Guardar
            </button>
          </div>

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
          <h2 style={{ padding: '0 0.5rem' }}>Gestión de entrenamientos</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', fontSize: '0.9rem', padding: '0 0.5rem' }}>
            Crea, edita o elimina horarios de entrenamiento
          </p>

          {/* Formulario para crear nuevo horario */}
          <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Crear nuevo horario</h3>
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
                        <div style={{ fontWeight: 600, fontSize: '1rem', flex: 1 }}>{schedule.day_of_week}</div>
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
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>
                        Inscriptos
                      </div>
                      <span 
                        onClick={() => schedule.enrolled > 0 && showEnrolledStudents(schedule.id)}
                        style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '12px',
                          background: schedule.enrolled >= schedule.max_capacity ? '#fee2e2' : '#f0fdf4',
                          color: schedule.enrolled >= schedule.max_capacity ? '#dc2626' : '#10b981',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          cursor: schedule.enrolled > 0 ? 'pointer' : 'default'
                        }}
                      >
                        {schedule.enrolled || 0}
                      </span>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>
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
                        <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{schedule.max_capacity}</div>
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
                            background: '#3b82f6',
                            color: 'white',
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
                  <h3 style={{ marginBottom: '0.5rem', fontSize: '1.4rem', marginTop: 0,textAlign: 'center' ,fontWeight: 600 }}>Alumnos inscriptos</h3>
                  {enrolledUsers.length === 0 ? (
                    <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '0.5rem 0', margin: 0 }}>
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
                            textAlign: 'center'
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
                    style={{ width: '100%', marginTop: '0.75rem', padding: '0.5rem', fontSize: '0.85rem' }}
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

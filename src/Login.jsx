import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { supabase } from './supabaseClient'
import './App.css'

export default function Login(){
  const navigate = useNavigate()
  const { user, profile, loading } = useAuth()
  const [mode, setMode] = useState('login') // 'login' or 'register'

  // login fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // register fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dob, setDob] = useState('')
  const [phone, setPhone] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState({})

  // Redirigir automáticamente si ya hay sesión activa
  useEffect(() => {
    if (!loading && user && profile) {
      if (profile.role === 'admin') {
        navigate('/admin', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    }
  }, [user, profile, loading, navigate])

  async function handleSubmit(e){
    e.preventDefault()
    const newErrors = {}

    // common validations
    if(!email) newErrors.email = 'El correo es obligatorio.'
    // password min length
    if(!password || password.length < 8) newErrors.password = 'La contraseña debe tener al menos 8 caracteres.'

    if(mode === 'register'){
      if(!firstName) newErrors.firstName = 'El nombre es obligatorio.'
      if(!lastName) newErrors.lastName = 'El apellido es obligatorio.'
      if(!dob) newErrors.dob = 'La fecha de nacimiento es obligatoria.'
      // phone: only digits and length check (7-15)
      const phoneDigits = phone.replace(/\D/g,'')
      if(!phone || phoneDigits.length < 7) newErrors.phone = 'Ingresa un número de celular válido (mínimo 7 dígitos).'
      // confirmar contraseña
      if(!confirmPassword || confirmPassword !== password) newErrors.confirmPassword = 'Las contraseñas no coinciden.'
    }

    setErrors(newErrors)
    if(Object.keys(newErrors).length > 0) return

    try {
      if(mode === 'login'){
        // Autenticar con Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          setErrors({ email: error.message })
          return
        }

        console.log('Login exitoso:', data)
        // No navegamos inmediatamente, dejamos que AuthContext detecte el cambio
        // y el componente App.jsx redirigirá automáticamente
        return
      }

      // Registro con Supabase - incluir metadata en el signup
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            phone: phone,
            date_of_birth: dob,
          }
        }
      })

      if (authError) {
        setErrors({ email: authError.message })
        return
      }

      // Crear o actualizar perfil del usuario en la tabla profiles
      if (authData.user) {
        try {
          // Use upsert to create/update the profile row (no emergency contact at signup)
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .upsert([
              {
                id: authData.user.id,
                first_name: firstName,
                last_name: lastName,
                phone: phone,
                date_of_birth: dob,
              }
            ], { onConflict: 'id' })

          if (profileError) {
            console.error('Error al upsertar perfil:', profileError)
            setErrors({ email: 'Usuario creado pero hubo un problema al guardar el perfil. Contacta soporte.' })
            return
          }

          console.log('Perfil creado/actualizado:', profileData)
          alert('¡Registro exitoso! Revisa tu email para confirmar tu cuenta (si está habilitado).')
          navigate('/dashboard')
        } catch (err) {
          console.error('Error inesperado al crear/actualizar perfil:', err)
          setErrors({ email: 'Usuario creado pero hubo un problema con el perfil. Contacta soporte.' })
          return
        }
      } else {
        // authData.user is not present (email confirmation likely required).
        alert('Registro iniciado. Revisa tu email para confirmar la cuenta.')
      }
    } catch (err) {
      console.error('Error inesperado:', err)
      setErrors({ email: 'Ocurrió un error. Intenta nuevamente.' })
    }
  }

  return (
    <div className="page page-center">
      <div className="auth-card">
        <h2>{mode === 'login' ? 'Iniciar sesión' : 'Regístrate'}</h2>
        <form onSubmit={handleSubmit} className="auth-form">
            {mode === 'register' && (
              <>
                <label>
                  Nombre
                  <input className={`${errors.firstName? 'input-error':''} auth-input`} type="text" value={firstName} onChange={e=>setFirstName(e.target.value)} required />
                  {errors.firstName && <div className="error-text">{errors.firstName}</div>}
                </label>
                <label>
                  Apellido
                  <input className={`${errors.lastName? 'input-error':''} auth-input`} type="text" value={lastName} onChange={e=>setLastName(e.target.value)} required />
                  {errors.lastName && <div className="error-text">{errors.lastName}</div>}
                </label>
                <label>
                  Fecha de nacimiento
                  <input className={`${errors.dob? 'input-error':''} auth-input`} type="date" value={dob} onChange={e=>setDob(e.target.value)} required />
                  {errors.dob && <div className="error-text">{errors.dob}</div>}
                </label>
              </>
            )}

            <label>
              Correo
              <input className={`${errors.email? 'input-error':''} auth-input`} type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
              {errors.email && <div className="error-text">{errors.email}</div>}
            </label>

            <label>
              Contraseña
              <input className={`${errors.password? 'input-error':''} auth-input`} type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
              {errors.password && <div className="error-text">{errors.password}</div>}
            </label>

            {mode === 'register' && (
              <label>
                Repetir contraseña
                <input className={`${errors.confirmPassword? 'input-error':''} auth-input`} type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required />
                {errors.confirmPassword && <div className="error-text">{errors.confirmPassword}</div>}
              </label>
            )}

            {mode === 'register' && (
              <>
                <label>
                  Número celular
                  <input className={`${errors.phone? 'input-error':''} auth-input`} type="tel" inputMode="tel" value={phone} onChange={e=>setPhone(e.target.value)} required />
                  {errors.phone && <div className="error-text">{errors.phone}</div>}
                </label>

                
              </>
            )}

            <button className="btn-primary" type="submit">{mode === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
          </form>

          <div className="auth-footer">
            {mode === 'login' ? (
              <p>¿No tienes cuenta? <button type="button" className="link-btn" onClick={()=>setMode('register')}>Regístrate</button></p>
            ) : (
              <p>¿Ya tienes cuenta? <button type="button" className="link-btn" onClick={()=>setMode('login')}>Iniciar sesión</button></p>
            )}
            <p><Link to="/">Volver al inicio</Link></p>
          </div>
        </div>
      </div>
  )
}

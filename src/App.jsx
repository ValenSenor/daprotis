import './App.css'
import { Link } from 'react-router-dom'

function App() {
  return (
    <div className="site">
      <div className="site-inner">
        <header className="site-header">
          <div className="logo-wrap">
            <div className="site-title">
              <strong>Escuela Futvoley Daprotis</strong>
              <span className="site-tagline">Pasión por el deporte</span>
            </div>
          </div>
          <Link className="btn-login" to="/login">Iniciar Sesión</Link>
        </header>
      </div>

      <main>
        <section className="hero">
          <div className="hero-content">
            <h1>Aprende futvoley en Mar del Plata</h1>
            <p className="hero-sub">Entrenamiento profesional de lunes a viernes</p>

            <div className="feature-cards">
              <div className="feature">
                <div className="feature-icon">👥</div>
                <div className="feature-title">Grupos Reducidos</div>
              </div>
              <div className="feature">
                <div className="feature-icon">🕒</div>
                <div className="feature-title">Horarios Flexibles</div>
              </div>
              <div className="feature">
                <div className="feature-icon">🏆</div>
                <div className="feature-title">Instructores Pro</div>
              </div>
            </div>
          </div>
        </section>

        <section className="why">
          <div className="why-inner">
            <h2>Entrenamientos</h2>
            <div className="why-cards">
              <article className="why-card">
                <h3>3 veces por semana</h3>
                <p>Entrenamiento mixto de 1hs</p>
                <p>LUNES-MIERCOLES-VIERNES</p>
                <p>$31.000</p>
              </article>
              <article className="why-card">
                <h3>2 veces por semana</h3>
                <p>Entrenamiento mixto de 1hs</p>
                <p>MARTES-JUEVES</p>
                <p>$26.000</p>
              </article>
              <article className="why-card">
                <h3>Clase personalizada</h3>
                <p>Entrenamiento de 1hs</p>
                <p>Dia a elección</p>
                <p>$10.000</p>
              </article>
            </div>
          </div>
        </section>

        <div className="site-inner">
          <footer className="site-footer">
            <p>© {new Date().getFullYear()} Escuela Futvoley Daprotis</p>
          </footer>
        </div>
      </main>
    </div>
  )
}

export default App
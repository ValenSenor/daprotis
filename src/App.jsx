import './App.css'
import { Link } from 'react-router-dom'

function App() {
  return (
    <div className="site">
      <div className="site-inner">
        <header className="site-header">
          <Link className="btn-login" to="/login">Iniciar Sesión</Link>
        </header>
      </div>

      <main>
        {/* Image placed outside the blue hero rectangle */}
        <div className="hero-image-wrap">
          <img src="/Daprotis.jpg" alt="Daprotis Futvoley" className="hero-logo hero-outside" />
        </div>

        <section className="hero">
          <div className="hero-content">

            <div className="hero-text">
              <p>
                Daprotis es la primera escuela de futvoley de Mar del Plata.  Entrenamos todo el año, de lunes a viernes, con clases adaptadas a todos los niveles.
                            
              </p>
              <p>
                Cada entrenamiento combina técnica, preparación física, coordinación y juego real, en un ambiente único de playa, deporte y comunidad.
              </p>
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
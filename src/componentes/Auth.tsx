import { useState } from 'react'
import type { FormEvent } from 'react'
import { iniciarSesion, pedirRecuperacion, registrarse } from '../servicios/perfil'
import logo from '../assets/forteva-logo.png'
import CampoPassword from './CampoPassword'
import AceptarDeslinde from './AceptarDeslinde'

// Nombre del estudio: cambialo acá y aparece en el login y en los correos que
// configures en Supabase.
const NOMBRE_ESTUDIO = 'FORTEVA Studio'

type Modo = 'login' | 'registro'

export default function Auth() {
  const [modo, setModo] = useState<Modo>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [dni, setDni] = useState('')
  const [telefono, setTelefono] = useState('')
  const [aceptaDeslinde, setAceptaDeslinde] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setAviso('')
    setEnviando(true)

    try {
      if (modo === 'login') {
        await iniciarSesion(email, password)
        // onAuthStateChange en App se encarga del resto.
      } else {
        await registrarse({ email, password, nombre, apellido, dni, telefono, aceptaDeslinde })
        setAviso(
          'Cuenta creada. Si el proyecto pide confirmar el correo, revisá tu casilla; ' +
            'si no, ya podés iniciar sesión.',
        )
        setModo('login')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo salió mal.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="centro-pantalla">
      <section className="tarjeta-auth">
        <h1 className="oculto-visualmente">{NOMBRE_ESTUDIO}</h1>
        <img className="logo-auth" src={logo} alt={NOMBRE_ESTUDIO} />
        <p className="subtitulo">
          {modo === 'login' ? 'Entrá para reservar tu turno' : 'Registrar cuenta'}
        </p>

        <form onSubmit={enviar}>
          {modo === 'registro' && (
            <>
              <label htmlFor="nombre">Nombre</label>
              <input
                id="nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                autoComplete="given-name"
                required
              />

              <label htmlFor="apellido">Apellido</label>
              <input
                id="apellido"
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                autoComplete="family-name"
                required
              />

              <label htmlFor="dni">DNI</label>
              <input
                id="dni"
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                inputMode="numeric"
                placeholder="Sin puntos"
                required
              />

              <label htmlFor="telefono">Teléfono</label>
              <input
                id="telefono"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                inputMode="tel"
                autoComplete="tel"
                placeholder="Para avisarte si se cancela un turno"
                required
              />
            </>
          )}

          <label htmlFor="email">Correo electrónico</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          <label htmlFor="password">Contraseña</label>
          <CampoPassword
            id="password"
            value={password}
            onChange={setPassword}
            autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
            minLength={6}
            required
          />

          {modo === 'registro' && (
            <AceptarDeslinde aceptado={aceptaDeslinde} onCambiar={setAceptaDeslinde} />
          )}

          {error && <p className="mensaje-error">{error}</p>}
          {aviso && <p className="mensaje-ok">{aviso}</p>}

          <button type="submit" disabled={enviando}>
            {enviando
              ? 'Un momento...'
              : modo === 'login'
                ? 'Ingresar'
                : 'Registrar cuenta'}
          </button>
        </form>

        {modo === 'login' && (
          <button
            type="button"
            className="link-secundario"
            onClick={async () => {
              if (!email.trim()) {
                setError('Escribí tu correo arriba y tocá de nuevo "Olvidé mi contraseña".')
                return
              }
              setError('')
              setAviso('')
              try {
                await pedirRecuperacion(email)
                setAviso('Te mandamos un correo para elegir una contraseña nueva.')
              } catch (err) {
                setError(err instanceof Error ? err.message : 'No se pudo enviar el correo.')
              }
            }}
          >
            Olvidé mi contraseña
          </button>
        )}

        <button
          type="button"
          className="link-secundario"
          onClick={() => {
            setModo(modo === 'login' ? 'registro' : 'login')
            setError('')
            setAviso('')
          }}
        >
          {modo === 'login' ? '¿No tenés cuenta? Registrar cuenta' : '¿Ya tenés cuenta? Ingresá'}
        </button>
      </section>
    </main>
  )
}

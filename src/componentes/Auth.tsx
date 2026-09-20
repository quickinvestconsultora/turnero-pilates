import { useState } from 'react'
import type { FormEvent } from 'react'
import { iniciarSesion, registrarse } from '../servicios/perfil'
import logo from '../assets/forteva-logo.png'

// Nombre del estudio: cambialo acá y aparece en el login y en los correos que
// configures en Supabase.
const NOMBRE_ESTUDIO = 'FORTEVA Studio'

type Modo = 'login' | 'registro'

export default function Auth() {
  const [modo, setModo] = useState<Modo>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
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
        await registrarse({ email, password, nombre, telefono })
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
          {modo === 'login' ? 'Entrá para reservar tu turno' : 'Creá tu cuenta'}
        </p>

        <form onSubmit={enviar}>
          {modo === 'registro' && (
            <>
              <label htmlFor="nombre">Nombre y apellido</label>
              <input
                id="nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                autoComplete="name"
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
          <div className="campo-password">
            <input
              id="password"
              type={verPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
            <button
              type="button"
              className="boton-ver-password"
              onClick={() => setVerPassword((v) => !v)}
              aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={verPassword}
            >
              {verPassword ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path
                    d="M3 3l18 18M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5M9.4 5.3A10.4 10.4 0 0 1 12 5c5.5 0 9 4.5 10 7-.5 1.2-1.4 2.6-2.7 3.8M6.4 6.6C4.2 8 2.6 10 2 12c1 2.5 4.5 7 10 7 1.4 0 2.7-.3 3.9-.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path
                    d="M2 12c1-2.5 4.5-7 10-7s9 4.5 10 7c-1 2.5-4.5 7-10 7s-9-4.5-10-7z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          {error && <p className="mensaje-error">{error}</p>}
          {aviso && <p className="mensaje-ok">{aviso}</p>}

          <button type="submit" disabled={enviando}>
            {enviando
              ? 'Un momento...'
              : modo === 'login'
                ? 'Ingresar'
                : 'Crear cuenta'}
          </button>
        </form>

        <button
          type="button"
          className="link-secundario"
          onClick={() => {
            setModo(modo === 'login' ? 'registro' : 'login')
            setError('')
            setAviso('')
          }}
        >
          {modo === 'login' ? '¿No tenés cuenta? Registrate' : '¿Ya tenés cuenta? Ingresá'}
        </button>
      </section>
    </main>
  )
}

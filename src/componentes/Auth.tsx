import { useState } from 'react'
import type { FormEvent } from 'react'
import { iniciarSesion, registrarse } from '../servicios/perfil'
import logo from '../assets/logo.svg'

// Nombre del estudio: cambialo acá y aparece en el login y en los correos que
// configures en Supabase.
const NOMBRE_ESTUDIO = 'Turnero Pilates'

type Modo = 'login' | 'registro'

export default function Auth() {
  const [modo, setModo] = useState<Modo>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
        <img className="logo-auth" src={logo} alt={NOMBRE_ESTUDIO} />
        <h1>{NOMBRE_ESTUDIO}</h1>
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
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
            minLength={6}
            required
          />

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

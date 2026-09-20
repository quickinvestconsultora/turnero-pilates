import { useState } from 'react'
import type { FormEvent } from 'react'
import { cambiarMiPassword } from '../servicios/perfil'
import logo from '../assets/forteva-logo.png'
import CampoPassword from './CampoPassword'

type Props = {
  onListo: () => void
}

// Pantalla que aparece cuando alguien entra desde un link de recuperación o
// invitación de Supabase (llega logueada por el link, pero sin contraseña
// propia todavía). Ver App.tsx: detecta type=recovery/invite en la URL.
export default function CrearPassword({ onListo }: Props) {
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('La contraseña tiene que tener al menos 6 caracteres.')
      return
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setEnviando(true)
    try {
      await cambiarMiPassword(password)
      onListo()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la contraseña.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="centro-pantalla">
      <section className="tarjeta-auth">
        <img className="logo-auth" src={logo} alt="FORTEVA Studio" />
        <p className="subtitulo">Elegí una contraseña para entrar de acá en más.</p>

        <form onSubmit={enviar}>
          <label htmlFor="password-nueva">Contraseña nueva</label>
          <CampoPassword
            id="password-nueva"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={6}
            required
          />

          <label htmlFor="password-repetir">Repetila</label>
          <CampoPassword
            id="password-repetir"
            value={confirmar}
            onChange={setConfirmar}
            autoComplete="new-password"
            minLength={6}
            required
          />

          {error && <p className="mensaje-error">{error}</p>}

          <button type="submit" disabled={enviando}>
            {enviando ? 'Guardando...' : 'Guardar y entrar'}
          </button>
        </form>
      </section>
    </main>
  )
}

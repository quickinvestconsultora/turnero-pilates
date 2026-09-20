import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { cerrarSesion, obtenerMiPerfil } from './servicios/perfil'
import { generarYSubirDeslinde } from './servicios/deslinde'
import type { Perfil } from './tipos'
import Auth from './componentes/Auth'
import CrearPassword from './componentes/CrearPassword'
import AlumnoApp from './componentes/AlumnoApp'
import AdminApp from './componentes/AdminApp'
import Cargando from './componentes/Cargando'

type EstadoPerfil =
  | { estado: 'cargando' }
  | { estado: 'listo'; perfil: Perfil }
  | { estado: 'sin-perfil' } // sesión OK pero no aparece la fila en 'perfiles'
  | { estado: 'error'; mensaje: string }

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [cargandoSesion, setCargandoSesion] = useState(true)
  const [perfilState, setPerfilState] = useState<EstadoPerfil>({ estado: 'cargando' })

  // Los links de invitación/recuperación de Supabase loguean directo, pero
  // nunca definen una contraseña con eso — sin esto, la próxima vez no hay
  // con qué entrar. Detectamos el link (type=invite o type=recovery en el
  // hash de la URL) para pedirla una sola vez.
  const [debeCrearPassword, setDebeCrearPassword] = useState(() => {
    if (typeof window === 'undefined') return false
    const hash = window.location.hash
    return hash.includes('type=invite') || hash.includes('type=recovery')
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCargandoSesion(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSession(nuevaSesion)
      setCargandoSesion(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const cargarPerfil = useCallback(async (): Promise<void> => {
    setPerfilState({ estado: 'cargando' })
    try {
      // El perfil lo crea un trigger al registrarse. Si justo consultamos
      // antes de que exista, reintentamos un par de veces.
      for (let intento = 0; intento < 3; intento++) {
        const perfil = await obtenerMiPerfil()
        if (perfil) {
          setPerfilState({ estado: 'listo', perfil })
          return
        }
        await new Promise((r) => setTimeout(r, 700))
      }
      setPerfilState({ estado: 'sin-perfil' })
    } catch (e) {
      setPerfilState({
        estado: 'error',
        mensaje: e instanceof Error ? e.message : 'No se pudo cargar tu perfil.',
      })
    }
  }, [])

  useEffect(() => {
    if (!session) {
      setPerfilState({ estado: 'cargando' })
      return
    }
    void cargarPerfil()
  }, [session, cargarPerfil])

  // El PDF del deslinde se genera y sube en segundo plano la primera vez que
  // hay sesión con el perfil ya creado. Si en su momento faltaba confirmar
  // el mail (sin sesión todavía), queda pendiente y se sube acá, la primera
  // vez que entra. No bloquea la pantalla: si falla, se reintenta solo.
  useEffect(() => {
    if (perfilState.estado !== 'listo') return
    const perfil = perfilState.perfil
    if (perfil.rol !== 'alumno' || perfil.deslinde_pdf_subido) return

    let cancelado = false
    generarYSubirDeslinde(perfil)
      .then(() => {
        if (!cancelado) {
          setPerfilState({ estado: 'listo', perfil: { ...perfil, deslinde_pdf_subido: true } })
        }
      })
      .catch(() => {
        // Sin drama: se vuelve a intentar en el próximo login.
      })
    return () => {
      cancelado = true
    }
  }, [perfilState])

  if (cargandoSesion) return <Cargando />
  if (!session) return <Auth />

  if (debeCrearPassword) {
    return (
      <CrearPassword
        onListo={() => {
          // Limpiamos el hash con el token para que un refresh no vuelva a
          // pedir la contraseña ni deje el token viejo dando vueltas.
          window.history.replaceState(null, '', window.location.pathname)
          setDebeCrearPassword(false)
        }}
      />
    )
  }

  if (perfilState.estado === 'cargando') return <Cargando />

  if (perfilState.estado === 'error') {
    return (
      <PantallaProblema
        titulo="No pudimos cargar tu perfil"
        detalle={perfilState.mensaje}
        onReintentar={cargarPerfil}
      />
    )
  }

  if (perfilState.estado === 'sin-perfil') {
    return (
      <PantallaProblema
        titulo="Tu cuenta quedó sin perfil"
        detalle={
          'Se creó el usuario pero no la fila en la tabla "perfiles". Suele pasar si el ' +
          'schema.sql se corrió después de registrarte. Corré de nuevo el schema y tocá Reintentar.'
        }
        onReintentar={cargarPerfil}
      />
    )
  }

  return perfilState.perfil.rol === 'staff' ? (
    <AdminApp perfil={perfilState.perfil} />
  ) : (
    <AlumnoApp
      perfil={perfilState.perfil}
      onPerfilActualizado={(p) => setPerfilState({ estado: 'listo', perfil: p })}
    />
  )
}

function PantallaProblema({
  titulo,
  detalle,
  onReintentar,
}: {
  titulo: string
  detalle: string
  onReintentar: () => void
}) {
  return (
    <main className="centro-pantalla">
      <section className="tarjeta-auth">
        <h1>{titulo}</h1>
        <p className="subtitulo">{detalle}</p>
        <button type="button" onClick={onReintentar}>
          Reintentar
        </button>
        <button type="button" className="link-secundario" onClick={cerrarSesion}>
          Cerrar sesión
        </button>
      </section>
    </main>
  )
}

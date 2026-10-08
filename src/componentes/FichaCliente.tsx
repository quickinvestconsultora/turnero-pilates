import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { ItemHistorial, Observacion, Perfil } from '../tipos'
import {
  actualizarRol,
  agregarObservacion,
  borrarObservacion,
  listarHistorial,
  listarObservaciones,
} from '../servicios/clientes'
import { fechaCorta, horaCorta } from '../fechas'

const ETIQUETA_ASISTENCIA = { asistio: 'Asistió', ausente: 'Faltó' } as const

// Ficha completa de una alumna para el staff: lo que ella cargó en "Mis
// datos" (solo lectura), su historial de asistencia y las observaciones
// internas del estudio, que la alumna nunca ve.
export default function FichaCliente({
  cliente,
  onCambio,
}: {
  cliente: Perfil
  onCambio: () => void
}) {
  const esProfesora = cliente.rol === 'instructora'
  const [historial, setHistorial] = useState<ItemHistorial[] | null>(null)
  const [verTodo, setVerTodo] = useState(false)
  const [observaciones, setObservaciones] = useState<Observacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    try {
      setObservaciones(await listarObservaciones(cliente.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las observaciones.')
    } finally {
      setCargando(false)
    }
  }, [cliente.id])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    if (esProfesora) return
    listarHistorial(cliente.id)
      .then(setHistorial)
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'No se pudo cargar el historial.'),
      )
  }, [cliente.id, esProfesora])

  const cambiarRol = async () => {
    const mensaje = esProfesora
      ? `¿Devolver a ${cliente.nombre} a alumna? Deja de ver "Mis turnos" y vuelve a reservar.`
      : `¿Convertir a ${cliente.nombre} en profesora? Va a poder crear y manejar sus propios turnos.`
    if (!window.confirm(mensaje)) return
    setError('')
    try {
      await actualizarRol(cliente.id, esProfesora ? 'alumno' : 'instructora')
      onCambio()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el rol.')
    }
  }

  const asistio = historial?.filter((h) => h.asistencia === 'asistio').length ?? 0
  const falto = historial?.filter((h) => h.asistencia === 'ausente').length ?? 0
  const sinMarcar = (historial?.length ?? 0) - asistio - falto
  const ultima = historial?.find((h) => h.asistencia === 'asistio')
  const visibles = historial ? (verTodo ? historial : historial.slice(0, 8)) : []

  const agregar = async (e: FormEvent) => {
    e.preventDefault()
    if (!texto.trim()) return
    setError('')
    setGuardando(true)
    try {
      await agregarObservacion(cliente.id, texto)
      setTexto('')
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const borrar = async (o: Observacion) => {
    if (!window.confirm('¿Borrar esta observación?')) return
    setError('')
    try {
      await borrarObservacion(o.id)
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar.')
    }
  }

  return (
    <div className="ficha-cliente">
      <dl className="ficha-datos">
        <dt>Lesiones o condiciones</dt>
        <dd>{cliente.lesiones || 'Sin datos'}</dd>
        <dt>Contacto de emergencia</dt>
        <dd>
          {cliente.contacto_emergencia_nombre || cliente.contacto_emergencia_telefono
            ? `${cliente.contacto_emergencia_nombre ?? ''} ${cliente.contacto_emergencia_telefono ?? ''}`.trim()
            : 'Sin datos'}
        </dd>
      </dl>

      {!esProfesora && (
        <>
          <h3>Historial de asistencia</h3>
          {historial === null ? (
            <p className="ayuda">Cargando...</p>
          ) : historial.length === 0 ? (
            <p className="ayuda">Todavía no tuvo clases.</p>
          ) : (
            <>
              <p className="ficha-resumen">
                <strong>{asistio}</strong> asistió · <strong>{falto}</strong> faltó ·{' '}
                <strong>{sinMarcar}</strong> sin marcar
                {ultima && ` · Última clase: ${fechaCorta(ultima.fecha)}`}
              </p>
              <ul className="ficha-historial">
                {visibles.map((h) => (
                  <li key={h.fecha + h.hora}>
                    <span>
                      {fechaCorta(h.fecha)} · {horaCorta(h.hora)}
                    </span>
                    <span className={`etiqueta-asistencia etiqueta-asistencia--${h.asistencia ?? 'nada'}`}>
                      {h.asistencia ? ETIQUETA_ASISTENCIA[h.asistencia] : 'Sin marcar'}
                    </span>
                  </li>
                ))}
              </ul>
              {historial.length > 8 && (
                <button
                  type="button"
                  className="link-secundario"
                  onClick={() => setVerTodo(!verTodo)}
                >
                  {verTodo ? 'Ver menos' : `Ver las ${historial.length} clases`}
                </button>
              )}
            </>
          )}
        </>
      )}

      <h3>Observaciones del estudio</h3>
      <form onSubmit={agregar} className="ficha-form">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
          placeholder="Ej: prefiere clases de la mañana, trae una lesión de rodilla…"
          aria-label="Nueva observación"
        />
        <button type="submit" disabled={guardando || !texto.trim()}>
          {guardando ? 'Guardando...' : 'Agregar'}
        </button>
      </form>

      {error && <p className="mensaje-error">{error}</p>}

      {cargando ? (
        <p className="ayuda">Cargando...</p>
      ) : observaciones.length === 0 ? (
        <p className="ayuda">Todavía no hay observaciones.</p>
      ) : (
        <ul className="ficha-observaciones">
          {observaciones.map((o) => (
            <li key={o.id}>
              <span className="ayuda">
                {new Date(o.creado_en).toLocaleDateString('es-AR', {
                  day: 'numeric',
                  month: 'numeric',
                  year: '2-digit',
                })}
              </span>
              <p>{o.texto}</p>
              <button type="button" className="link-secundario" onClick={() => borrar(o)}>
                Borrar
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>Rol</h3>
      <p className="ayuda">
        {esProfesora
          ? 'Es profesora: arma y ve sus propios turnos, y su nombre figura en cada uno.'
          : 'Si es una profesora del estudio, pasala a "profesora" para que pueda cargar sus turnos.'}
      </p>
      <button type="button" className="link-secundario" onClick={cambiarRol}>
        {esProfesora ? 'Volver a alumna' : 'Convertir en profesora'}
      </button>
    </div>
  )
}

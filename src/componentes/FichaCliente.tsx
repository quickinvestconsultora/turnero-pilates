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

// Ficha completa de una alumna para el estudio: lo que ella cargó en "Mis
// datos" (solo lectura), su historial de asistencia y las observaciones
// internas, que la alumna nunca ve. La profesora (paraProfesora) ve lo mismo,
// pero no puede cambiar roles y solo borra las observaciones que escribió ella.
export default function FichaCliente({
  cliente,
  onCambio,
  paraProfesora = false,
  miId,
}: {
  cliente: Perfil
  onCambio: () => void
  paraProfesora?: boolean
  miId?: string
}) {
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
    listarHistorial(cliente.id)
      .then(setHistorial)
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'No se pudo cargar el historial.'),
      )
  }, [cliente.id])

  const convertirEnProfesora = async () => {
    const nombre = `${cliente.nombre} ${cliente.apellido}`.trim()
    if (
      !window.confirm(
        `¿Convertir a ${nombre} en profesora?\n\nVa a dejar de reservar turnos como alumna y va a poder crear y manejar los suyos.`,
      )
    ) {
      return
    }
    setError('')
    try {
      await actualizarRol(cliente.id, 'instructora')
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
                <span
                  className={`etiqueta-asistencia etiqueta-asistencia--${h.asistencia ?? 'nada'}`}
                >
                  {h.asistencia ? ETIQUETA_ASISTENCIA[h.asistencia] : 'Sin marcar'}
                </span>
              </li>
            ))}
          </ul>
          {historial.length > 8 && (
            <button type="button" className="link-secundario" onClick={() => setVerTodo(!verTodo)}>
              {verTodo ? 'Ver menos' : `Ver las ${historial.length} clases`}
            </button>
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
              {(!paraProfesora || o.autor_id === miId) && (
                <button type="button" className="link-secundario" onClick={() => borrar(o)}>
                  Borrar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!paraProfesora && (
        <details className="ficha-avanzado">
          <summary>Más opciones</summary>
          <p>Si es una profesora del estudio, podés pasarla de alumna a profesora.</p>
          <button type="button" className="boton-mini" onClick={convertirEnProfesora}>
            Convertir en profesora
          </button>
        </details>
      )}
    </div>
  )
}

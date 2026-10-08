import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Observacion, Perfil } from '../tipos'
import {
  agregarObservacion,
  borrarObservacion,
  listarObservaciones,
} from '../servicios/clientes'

// Ficha completa de una alumna para el staff: lo que ella cargó en "Mis
// datos" (solo lectura) y las observaciones internas del estudio, que la
// alumna nunca ve.
export default function FichaCliente({ cliente }: { cliente: Perfil }) {
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
    </div>
  )
}

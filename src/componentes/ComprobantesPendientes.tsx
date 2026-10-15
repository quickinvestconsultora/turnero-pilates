import { useCallback, useEffect, useState } from 'react'
import {
  listarComprobantesPendientes,
  resolverComprobante,
  urlComprobante,
} from '../servicios/comprobantes'
import type { ComprobanteConAlumna } from '../servicios/comprobantes'
import { abonoVencido } from '../cuenta'
import { nombreCompleto } from '../personas'
import RegistrarPago from './RegistrarPago'
import EnlaceWhatsApp from './EnlaceWhatsApp'

// Lo que mandaron las alumnas para que el estudio confirme: se abre el
// comprobante, y al aprobarlo se registra el pago (monto, medio, hasta cuándo)
// y queda al día. Si no corresponde, se rechaza.
export default function ComprobantesPendientes({ onCambio }: { onCambio: () => void }) {
  const [lista, setLista] = useState<ComprobanteConAlumna[]>([])
  const [error, setError] = useState('')
  const [aprobando, setAprobando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setLista(await listarComprobantesPendientes())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los comprobantes.')
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (lista.length === 0 && !error) return null

  const ver = async (c: ComprobanteConAlumna) => {
    setError('')
    try {
      window.open(await urlComprobante(c.ruta), '_blank', 'noopener')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el comprobante.')
    }
  }

  const rechazar = async (c: ComprobanteConAlumna) => {
    if (!window.confirm('¿Rechazar este comprobante? La alumna sigue sin estar al día.')) return
    setError('')
    try {
      await resolverComprobante(c.id, 'rechazado')
      await cargar()
      onCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo rechazar.')
    }
  }

  return (
    <section className="comprobantes-pendientes">
      <h3>Pagos para confirmar ({lista.length})</h3>
      {error && <p className="mensaje-error">{error}</p>}
      <ul>
        {lista.map((c) => {
          const nombre = c.perfiles ? nombreCompleto(c.perfiles) : 'Alumna'
          const abonoVigente =
            c.perfiles?.al_dia_hasta &&
            !abonoVencido({ estado_cuenta: 'al_dia', al_dia_hasta: c.perfiles.al_dia_hasta })
          return (
            <li key={c.id}>
              <div className="comprobante-datos">
                <strong>{nombre}</strong>
                <span className="turno-detalle">
                  {new Date(c.creado_en).toLocaleString('es-AR', {
                    day: 'numeric',
                    month: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {c.nota ? ` · ${c.nota}` : ''}
                </span>
              </div>
              <div className="barra-acciones">
                <button type="button" className="link-secundario" onClick={() => ver(c)}>
                  Ver comprobante
                </button>
                <button type="button" onClick={() => setAprobando(aprobando === c.id ? null : c.id)}>
                  Aprobar
                </button>
                <button type="button" className="link-peligro" onClick={() => rechazar(c)}>
                  Rechazar
                </button>
                {c.perfiles && (
                  <EnlaceWhatsApp
                    telefono={c.perfiles.telefono}
                    mensaje={`Hola ${c.perfiles.nombre.trim() || 'hola'}! Te escribimos de FORTEVA Studio por el comprobante que subiste.`}
                  />
                )}
              </div>

              {aprobando === c.id && (
                <RegistrarPago
                  cliente={{
                    id: c.alumna_id,
                    nombre: c.perfiles?.nombre ?? '',
                    al_dia_hasta: c.perfiles?.al_dia_hasta ?? null,
                  }}
                  modo={abonoVigente ? 'sumar' : 'este-mes'}
                  onRegistrado={async () => {
                    setAprobando(null)
                    try {
                      await resolverComprobante(c.id, 'aprobado')
                    } finally {
                      await cargar()
                      onCambio()
                    }
                  }}
                  onCerrar={() => setAprobando(null)}
                />
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

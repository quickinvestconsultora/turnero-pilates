import { useCallback, useEffect, useState } from 'react'
import {
  cambiarReferidos,
  listarReferidos,
  marcarBeneficioReferido,
  referidosActivos,
} from '../servicios/referidos'
import type { Referido } from '../servicios/referidos'
import { BENEFICIO_REFERIDOS } from '../config/referidos'
import EnlaceWhatsApp from './EnlaceWhatsApp'
import PagoManual from './PagoManual'

const fechaAr = (iso: string) => new Date(iso).toLocaleDateString('es-AR')

function estadoDe(r: Referido): string {
  if (r.pagos > 0) return 'Ya pagó'
  if (r.clases > 0) return 'Ya vino a clase'
  return 'Solo se registró'
}

// Clientes → Referidos: interruptor para lanzar el programa, y quién trajo a quién.
// El beneficio se entrega a mano: "Regalar clase" abre el cobro manual con monto en
// cero y queda anotado en la ficha de la alumna.
export default function Referidos() {
  const [activos, setActivos] = useState<boolean | null>(null)
  const [lista, setLista] = useState<Referido[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [regalando, setRegalando] = useState<{ id: string; nombre: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    setError('')
    try {
      const [a, l] = await Promise.all([referidosActivos(), listarReferidos()])
      setActivos(a)
      setLista(l)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los referidos.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const alternarPrograma = async () => {
    if (activos === null) return
    if (!activos && !window.confirm('¿Lanzar el programa? Todas las alumnas van a ver "Traé a una amiga" en Mi cuenta.')) return
    setOcupado(true)
    setError('')
    try {
      await cambiarReferidos(!activos)
      setActivos(!activos)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar.')
    } finally {
      setOcupado(false)
    }
  }

  const alternarBeneficio = async (r: Referido) => {
    setError('')
    try {
      await marcarBeneficioReferido(r.referida_id, r.beneficio_en === null)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar.')
    }
  }

  const entregados = lista.filter((r) => r.beneficio_en !== null).length

  return (
    <div>
      <h2>Referidos</h2>

      <div className={activos ? 'control-recordatorios' : 'control-recordatorios control-recordatorios--pausado'}>
        <div className="control-recordatorios-texto">
          <strong>
            <span className="punto-estado" style={{ background: activos ? 'var(--ok)' : 'var(--error)' }} />
            Programa {activos === null ? '...' : activos ? 'activo' : 'apagado'}
          </strong>
          <span className="ayuda">
            {activos
              ? 'Las alumnas ven su link y su código en Mi cuenta.'
              : 'Listo para lanzar: cuando lo actives, las alumnas ven "Traé a una amiga" en Mi cuenta.'}
          </span>
        </div>
        <button type="button" disabled={ocupado || activos === null} onClick={alternarPrograma}>
          {activos ? 'Apagar' : 'Lanzar programa'}
        </button>
      </div>

      <p className="ayuda">
        Beneficio que ven las alumnas: “{BENEFICIO_REFERIDOS}” (se cambia en <code>src/config/referidos.ts</code>).
        Cada amiga que se registra con un código queda acá; cuando cumple la condición, regalás la clase con un toque.
      </p>

      {error && <p className="mensaje-error">{error}</p>}

      {regalando && (
        <PagoManual
          alumna={regalando}
          inicial={{ monto: '0', concepto: 'clase', nota: 'Beneficio por referidos' }}
          onRegistrado={() => setRegalando(null)}
          onCerrar={() => setRegalando(null)}
        />
      )}

      {cargando ? (
        <p className="vacio">Cargando...</p>
      ) : lista.length === 0 ? (
        <p className="vacio">Todavía nadie se registró con un código de otra alumna.</p>
      ) : (
        <>
          <p className="ficha-resumen">
            <strong>{lista.length}</strong> amiga{lista.length === 1 ? '' : 's'} traída{lista.length === 1 ? '' : 's'} ·{' '}
            <strong>{entregados}</strong> con beneficio entregado
          </p>
          <ul className="lista-clientes">
            {lista.map((r) => (
              <li key={r.referida_id} className="cliente">
                <div className="cliente-datos">
                  <strong>{r.referida_nombre || 'Sin nombre'}</strong>
                  <span className="turno-detalle">
                    La trajo {r.referente_nombre || 'una alumna'} · {fechaAr(r.creada_en)}
                  </span>
                  <span className="turno-detalle">
                    {estadoDe(r)}
                    {r.beneficio_en && ` · beneficio entregado el ${fechaAr(r.beneficio_en)}`}
                  </span>
                </div>
                <div className="cliente-enlaces">
                  <EnlaceWhatsApp
                    telefono={r.referida_telefono}
                    mensaje={`Hola ${r.referida_nombre.split(' ')[0] || 'hola'}! Te escribimos de FORTEVA Studio. ¡Gracias por sumarte!`}
                    etiqueta="Escribirle a la amiga"
                  />
                  <button
                    type="button"
                    className="link-secundario"
                    onClick={() => setRegalando({ id: r.referente_id, nombre: r.referente_nombre.split(' ')[0] })}
                  >
                    Regalar clase a {r.referente_nombre.split(' ')[0] || 'quien la trajo'}
                  </button>
                  <button
                    type="button"
                    className="link-secundario"
                    onClick={() => setRegalando({ id: r.referida_id, nombre: r.referida_nombre.split(' ')[0] })}
                  >
                    Regalar clase a {r.referida_nombre.split(' ')[0] || 'la amiga'}
                  </button>
                  <button type="button" className="link-secundario" onClick={() => alternarBeneficio(r)}>
                    {r.beneficio_en ? 'Quitar marca de entregado' : 'Marcar beneficio entregado'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

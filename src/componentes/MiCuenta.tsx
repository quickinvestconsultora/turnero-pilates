import { useEffect, useState } from 'react'
import type { Perfil } from '../tipos'
import { miHistorial, misPagos } from '../servicios/miCuenta'
import type { ClaseMia, PagoMio } from '../servicios/miCuenta'
import { ETIQUETA_MEDIO } from '../servicios/clientes'
import type { ConceptoPago, MedioPago } from '../servicios/clientes'
import BotonRecibo from './BotonRecibo'
import { SeccionNotificaciones } from './Notificaciones'
import { calcularProgreso, mensajeProgreso } from '../progreso'
import { abonoVencido, diaMes } from '../cuenta'
import { fechaCorta, horaCorta } from '../fechas'

const formatoPesos = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

// "Mi cuenta": lo que la alumna puede consultar de sí misma sin preguntarle al
// estudio: cómo está su abono, a cuántas clases vino y qué pagos tiene cargados.
export default function MiCuenta({ perfil, onCerrar }: { perfil: Perfil; onCerrar: () => void }) {
  const [clases, setClases] = useState<ClaseMia[] | null>(null)
  const [pagos, setPagos] = useState<PagoMio[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([miHistorial(), misPagos()])
      .then(([c, p]) => {
        setClases(c)
        setPagos(p)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar tu cuenta.'))
  }, [])

  const progreso = calcularProgreso(clases ?? [])
  const asistio = clases?.filter((c) => c.asistencia === 'asistio').length ?? 0
  const falto = clases?.filter((c) => c.asistencia === 'ausente').length ?? 0

  const estadoAbono = (() => {
    if (perfil.estado_cuenta === 'pendiente') return { texto: 'Tenés un pago pendiente.', ok: false }
    if (perfil.estado_cuenta === 'prueba') return { texto: 'Estás en tu clase de prueba.', ok: true }
    if (abonoVencido(perfil) && perfil.al_dia_hasta) {
      return { texto: `Tu abono venció el ${diaMes(perfil.al_dia_hasta)}.`, ok: false }
    }
    return {
      texto: perfil.al_dia_hasta
        ? `Estás al día: tu abono cubre turnos hasta el ${diaMes(perfil.al_dia_hasta)}.`
        : 'Estás al día.',
      ok: true,
    }
  })()

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal mi-cuenta" onClick={(e) => e.stopPropagation()}>
        <h2>Mi cuenta</h2>

        <p className={estadoAbono.ok ? 'mensaje-ok' : 'mensaje-error'}>{estadoAbono.texto}</p>

        {error && <p className="mensaje-error">{error}</p>}

        {clases !== null && (
          <>
            <div className="kpi-grid">
              <div className="kpi">
                <span className="kpi-valor">{progreso.esteMes}</span>
                <span className="kpi-etiqueta">Clases este mes</span>
              </div>
              <div className="kpi">
                <span className="kpi-valor">{progreso.semanasSeguidas}</span>
                <span className="kpi-etiqueta">Semanas seguidas</span>
              </div>
              <div className="kpi">
                <span className="kpi-valor">{progreso.total}</span>
                <span className="kpi-etiqueta">Clases en total</span>
              </div>
            </div>
            <p className="ayuda">{mensajeProgreso(progreso)}</p>
          </>
        )}

        <h3>Mis clases</h3>
        {clases === null ? (
          <p className="ayuda">Cargando...</p>
        ) : clases.length === 0 ? (
          <p className="ayuda">Todavía no tuviste clases.</p>
        ) : (
          <>
            <p className="ficha-resumen">
              <strong>{asistio}</strong> asististe · <strong>{falto}</strong> faltaste ·{' '}
              <strong>{clases.length - asistio - falto}</strong> sin marcar
            </p>
            <ul className="ficha-historial">
              {clases.slice(0, 8).map((c) => (
                <li key={c.fecha + c.hora}>
                  <span>
                    {fechaCorta(c.fecha)} · {horaCorta(c.hora)}
                  </span>
                  <span
                    className={`etiqueta-asistencia etiqueta-asistencia--${c.asistencia ?? 'nada'}`}
                  >
                    {c.asistencia === 'asistio' ? 'Asististe' : c.asistencia === 'ausente' ? 'Faltaste' : 'Sin marcar'}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <h3>Mis pagos</h3>
        {pagos === null ? (
          <p className="ayuda">Cargando...</p>
        ) : pagos.length === 0 ? (
          <p className="ayuda">Todavía no hay pagos registrados.</p>
        ) : (
          <ul className="ficha-historial">
            {pagos.map((p, i) => (
              <li key={i}>
                <span>
                  {new Date(p.fecha).toLocaleDateString('es-AR')} ·{' '}
                  <strong>{p.monto === null ? 'Sin monto' : formatoPesos(p.monto)}</strong> ·{' '}
                  {ETIQUETA_MEDIO[p.medio as MedioPago] ?? p.medio}
                  {p.abono_hasta && ` · hasta el ${diaMes(p.abono_hasta)}`}
                </span>
                <BotonRecibo
                  datos={{
                    numero: p.numero ?? null,
                    fecha: p.fecha,
                    alumna: `${perfil.nombre} ${perfil.apellido}`.trim(),
                    dni: perfil.dni,
                    concepto: (p.concepto as ConceptoPago | null) ?? 'mes',
                    monto: p.monto,
                    medio: p.medio as MedioPago,
                    abonoHasta: p.abono_hasta,
                  }}
                />
              </li>
            ))}
          </ul>
        )}

        <SeccionNotificaciones />

        <div className="modal-botones">
          <button type="button" className="link-secundario" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

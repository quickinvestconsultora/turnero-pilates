import { useEffect, useState } from 'react'
import { obtenerResumen } from '../servicios/gestion'
import type { Resumen as ResumenTipo } from '../servicios/gestion'
import { hoyIso, nombreMes } from '../fechas'

const pesos = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

// Variación contra el mes pasado, en palabras.
function Comparacion({ actual, anterior, plata = false }: { actual: number; anterior: number; plata?: boolean }) {
  const dif = actual - anterior
  if (anterior === 0 && actual === 0) return <span className="ayuda">Igual que el mes pasado</span>
  const texto = plata ? pesos(Math.abs(dif)) : String(Math.abs(dif))
  if (dif === 0) return <span className="ayuda">Igual que el mes pasado</span>
  return (
    <span className={dif > 0 ? 'variacion variacion--sube' : 'variacion variacion--baja'}>
      {dif > 0 ? '▲' : '▼'} {texto} {dif > 0 ? 'más' : 'menos'} que el mes pasado
    </span>
  )
}

// Tablero de Administración: lo que hay que mirar todos los días, en una pantalla.
export default function Resumen({ onIr }: { onIr: (seccion: 'clientes' | 'reactivar' | 'cobros' | 'egresos' | 'estadisticas') => void }) {
  const [r, setR] = useState<ResumenTipo | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    obtenerResumen()
      .then(setR)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar el resumen.'))
  }, [])

  if (error) return <p className="mensaje-error">{error}</p>
  if (!r) return <p className="vacio">Cargando...</p>

  const resultado = r.cobrado_mes - r.egresos_mes
  const resultadoAnterior = r.cobrado_mes_anterior - r.egresos_mes_anterior
  const ocupacion = r.cupo_30d > 0 ? Math.round((r.reservas_30d / r.cupo_30d) * 100) : null
  const mes = nombreMes(hoyIso())

  const alertas: { texto: string; ir: 'clientes' | 'reactivar' | 'egresos' }[] = []
  if (r.comprobantes_pendientes > 0) {
    alertas.push({
      texto: `${r.comprobantes_pendientes} comprobante${r.comprobantes_pendientes === 1 ? '' : 's'} esperando que lo${r.comprobantes_pendientes === 1 ? '' : 's'} confirmes`,
      ir: 'clientes',
    })
  }
  if (r.vencen_semana > 0) {
    alertas.push({
      texto: `${r.vencen_semana} abono${r.vencen_semana === 1 ? '' : 's'} vence${r.vencen_semana === 1 ? '' : 'n'} esta semana`,
      ir: 'clientes',
    })
  }
  if (r.vencidas + r.deben > 0) {
    alertas.push({
      texto: `${r.vencidas + r.deben} alumna${r.vencidas + r.deben === 1 ? '' : 's'} con abono vencido o pago pendiente`,
      ir: 'clientes',
    })
  }
  if (r.topes_superados > 0) {
    alertas.push({
      texto: `${r.topes_superados} categoría${r.topes_superados === 1 ? '' : 's'} de gasto pasó el tope de este mes`,
      ir: 'egresos',
    })
  }
  if (r.para_reactivar > 0) {
    alertas.push({
      texto: `${r.para_reactivar} alumna${r.para_reactivar === 1 ? '' : 's'} para volver a invitar`,
      ir: 'reactivar',
    })
  }

  return (
    <div>
      <h2>Resumen</h2>

      {alertas.length > 0 ? (
        <ul className="resumen-alertas">
          {alertas.map((a) => (
            <li key={a.texto}>
              <span>{a.texto}</span>
              <button type="button" className="link-secundario" onClick={() => onIr(a.ir)}>
                Ver
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mensaje-ok">Todo al día: no hay nada pendiente.</p>
      )}

      <h3>Plata de {mes}</h3>
      <div className="kpi-grid">
        <button type="button" className="kpi kpi-boton" onClick={() => onIr('cobros')}>
          <span className="kpi-valor">{pesos(r.cobrado_mes)}</span>
          <span className="kpi-etiqueta">Cobrado</span>
          <Comparacion actual={r.cobrado_mes} anterior={r.cobrado_mes_anterior} plata />
        </button>
        <button type="button" className="kpi kpi-boton" onClick={() => onIr('egresos')}>
          <span className="kpi-valor">{pesos(r.egresos_mes)}</span>
          <span className="kpi-etiqueta">Egresos (gastos y profesoras)</span>
          <Comparacion actual={r.egresos_mes} anterior={r.egresos_mes_anterior} plata />
        </button>
        <button type="button" className="kpi kpi-boton" onClick={() => onIr('egresos')}>
          <span className={resultado < 0 ? 'kpi-valor kpi-valor--negativo' : 'kpi-valor'}>{pesos(resultado)}</span>
          <span className="kpi-etiqueta">Resultado del mes</span>
          <Comparacion actual={resultado} anterior={resultadoAnterior} plata />
        </button>
      </div>

      {r.meta_ingresos > 0 && (
        <div className="meta-barra">
          <div className="meta-barra-texto">
            <span>
              Meta del mes: <strong>{pesos(r.meta_ingresos)}</strong>
            </span>
            <span className={r.cobrado_mes >= r.meta_ingresos ? 'mensaje-ok' : 'ayuda'}>
              {r.cobrado_mes >= r.meta_ingresos
                ? '¡Meta cumplida!'
                : `${Math.round((r.cobrado_mes / r.meta_ingresos) * 100)}% · faltan ${pesos(r.meta_ingresos - r.cobrado_mes)}`}
            </span>
          </div>
          <div className="meta-barra-fondo">
            <div
              className={r.cobrado_mes >= r.meta_ingresos ? 'meta-barra-relleno meta-barra-relleno--ok' : 'meta-barra-relleno'}
              style={{ width: `${Math.min(100, (r.cobrado_mes / r.meta_ingresos) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <h3>Alumnas</h3>
      <div className="kpi-grid">
        <button type="button" className="kpi kpi-boton" onClick={() => onIr('clientes')}>
          <span className="kpi-valor">{r.alumnas_activas}</span>
          <span className="kpi-etiqueta">Activas (vinieron en 30 días)</span>
          <span className="ayuda">de {r.alumnas_total} registradas</span>
        </button>
        <div className="kpi">
          <span className="kpi-valor">{r.altas_mes}</span>
          <span className="kpi-etiqueta">Altas este mes</span>
          <Comparacion actual={r.altas_mes} anterior={r.altas_mes_anterior} />
        </div>
        <div className="kpi">
          <span className="kpi-valor">{ocupacion === null ? '—' : `${ocupacion}%`}</span>
          <span className="kpi-etiqueta">Ocupación (30 días)</span>
          <span className="ayuda">
            {r.clases_30d} clases · {r.reservas_30d} lugares usados de {r.cupo_30d}
          </span>
        </div>
      </div>

      <h3>Cuentas</h3>
      <div className="kpi-grid">
        <div className="kpi">
          <span className="kpi-valor">{r.al_dia}</span>
          <span className="kpi-etiqueta">Al día</span>
        </div>
        <div className="kpi">
          <span className="kpi-valor">{r.en_prueba}</span>
          <span className="kpi-etiqueta">En clase de prueba</span>
        </div>
        <div className="kpi">
          <span className="kpi-valor">{r.vencidas + r.deben}</span>
          <span className="kpi-etiqueta">Vencidas o con pago pendiente</span>
        </div>
      </div>

      <button type="button" className="link-secundario" onClick={() => onIr('estadisticas')}>
        Ver estadísticas por horario
      </button>
    </div>
  )
}

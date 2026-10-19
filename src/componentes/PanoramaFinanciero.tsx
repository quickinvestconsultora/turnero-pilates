import { useEffect, useMemo, useState } from 'react'
import {
  ETIQUETA_CATEGORIA,
  ETIQUETA_INGRESO,
  obtenerDetalleFinanciero,
  obtenerPanorama,
  obtenerResumen,
} from '../servicios/gestion'
import type {
  CategoriaGasto,
  CategoriaIngreso,
  DetalleFinanciero,
  LineaDetalle,
  MesFinanciero,
  Resumen,
} from '../servicios/gestion'
import { ETIQUETA_CONCEPTO, ETIQUETA_MEDIO } from '../servicios/clientes'
import type { ConceptoPago, MedioPago } from '../servicios/clientes'
import { descargarCsv } from '../csv'
import { hoyIso, inicioDeMes, nombreMes } from '../fechas'

const pesos = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

const porcentaje = (n: number) => `${Math.round(n)}%`

const MESES = 12

function Lineas({
  titulo,
  filas,
  etiqueta,
  vacio,
}: {
  titulo: string
  filas: LineaDetalle[]
  etiqueta: (clave: string) => string
  vacio: string
}) {
  const total = filas.reduce((n, f) => n + f.monto, 0)
  return (
    <div className="panorama-bloque">
      <h3>{titulo}</h3>
      {filas.length === 0 ? (
        <p className="ayuda">{vacio}</p>
      ) : (
        <ul className="ficha-historial">
          {filas.map((f) => (
            <li key={f.clave}>
              <span>
                {etiqueta(f.clave)}
                {f.cantidad > 0 && (
                  <span className="ayuda">
                    {' '}
                    · {f.cantidad} {f.cantidad === 1 ? 'movimiento' : 'movimientos'}
                  </span>
                )}
                {total > 0 && <span className="ayuda"> · {porcentaje((f.monto / total) * 100)}</span>}
              </span>
              <strong>{pesos(f.monto)}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Gráfico de barras de los últimos meses: ingresos contra egresos.
function Grafico({ meses }: { meses: MesFinanciero[] }) {
  const ancho = 640
  const alto = 200
  const base = alto - 24
  const maximo = Math.max(1, ...meses.map((m) => Math.max(m.cobros + m.otros, m.gastos + m.liquidaciones)))
  const grupo = ancho / meses.length
  const barra = Math.min(22, grupo / 2 - 4)

  return (
    <div>
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="grafico-finanzas"
        role="img"
        aria-label="Ingresos y egresos de los últimos meses"
      >
        <line x1="0" y1={base} x2={ancho} y2={base} className="grafico-eje" />
        {meses.map((m, i) => {
          const ingresos = m.cobros + m.otros
          const egresos = m.gastos + m.liquidaciones
          const x = i * grupo + grupo / 2
          const hi = (ingresos / maximo) * (base - 16)
          const he = (egresos / maximo) * (base - 16)
          return (
            <g key={m.mes}>
              <rect x={x - barra - 1} y={base - hi} width={barra} height={hi} className="grafico-ingresos">
                <title>{`${nombreMes(m.mes)}: ingresos ${pesos(ingresos)}`}</title>
              </rect>
              <rect x={x + 1} y={base - he} width={barra} height={he} className="grafico-egresos">
                <title>{`${nombreMes(m.mes)}: egresos ${pesos(egresos)}`}</title>
              </rect>
              <text x={x} y={alto - 6} textAnchor="middle" className="grafico-mes">
                {nombreMes(m.mes).slice(0, 3)}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="grafico-leyenda">
        <span className="leyenda-punto leyenda-punto--ingresos" /> Ingresos{' '}
        <span className="leyenda-punto leyenda-punto--egresos" /> Egresos
      </p>
    </div>
  )
}

// Panorama financiero del negocio: cuánto entró, en qué se fue, cuánto quedó, y
// los números para decidir (costo por clase, punto de equilibrio, evolución).
export default function PanoramaFinanciero() {
  const [mes, setMes] = useState(0) // 0 = este mes, -1 = el anterior…
  const [meses, setMeses] = useState<MesFinanciero[] | null>(null)
  const [detalle, setDetalle] = useState<DetalleFinanciero | null>(null)
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [error, setError] = useState('')

  const referencia = useMemo(() => inicioDeMes(hoyIso(), mes), [mes])

  useEffect(() => {
    obtenerPanorama(MESES)
      .then(setMeses)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar el panorama.'))
    obtenerResumen()
      .then(setResumen)
      .catch(() => setResumen(null))
  }, [])

  useEffect(() => {
    setDetalle(null)
    obtenerDetalleFinanciero(referencia)
      .then(setDetalle)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar el detalle.'))
  }, [referencia])

  if (error) return <p className="mensaje-error">{error}</p>
  if (!meses || !detalle) return <p className="vacio">Cargando...</p>

  const fila = meses.find((m) => m.mes.slice(0, 7) === referencia.slice(0, 7))
  const cobros = fila?.cobros ?? 0
  const otros = fila?.otros ?? 0
  const ingresos = cobros + otros
  const gastos = fila?.gastos ?? 0
  const liquidaciones = fila?.liquidaciones ?? 0
  const egresos = gastos + liquidaciones
  const resultado = ingresos - egresos
  const margen = ingresos > 0 ? (resultado / ingresos) * 100 : null

  const ticket = detalle.alumnas_pagaron > 0 ? cobros / detalle.alumnas_pagaron : null
  const ingresoPorClase = detalle.clases_dadas > 0 ? ingresos / detalle.clases_dadas : null
  const costoPorClase = detalle.clases_dadas > 0 ? egresos / detalle.clases_dadas : null
  const lugaresPorClase = detalle.clases_dadas > 0 ? detalle.lugares_usados / detalle.clases_dadas : null
  const equilibrio = ticket && egresos > 0 ? Math.ceil(egresos / ticket) : null
  const porCobrar = resumen && ticket ? (resumen.vencidas + resumen.deben) * ticket : null

  const gastosLineas: LineaDetalle[] = [
    ...detalle.gastos_por_categoria,
    ...(liquidaciones > 0 ? [{ clave: '__profesoras', monto: liquidaciones, cantidad: 0 }] : []),
  ]
  const ingresosLineas: LineaDetalle[] = [
    ...detalle.cobros_por_concepto,
    ...detalle.otros_por_categoria.map((l) => ({ ...l, clave: 'otro:' + l.clave })),
  ]

  const descargar = () =>
    descargarCsv('finanzas-ultimos-12-meses.csv', [
      ['Mes', 'Cobros a alumnas', 'Otros ingresos', 'Ingresos', 'Gastos', 'Pagos a profesoras', 'Egresos', 'Resultado'],
      ...meses.map((m) => {
        const ing = m.cobros + m.otros
        const egr = m.gastos + m.liquidaciones
        return [m.mes.slice(0, 7), m.cobros, m.otros, ing, m.gastos, m.liquidaciones, egr, ing - egr]
      }),
    ])

  return (
    <div>
      <div className="fila-titulo">
        <h3>
          {nombreMes(referencia)} {referencia.slice(0, 4)}
        </h3>
        <div className="barra-acciones">
          <button
            type="button"
            className="link-secundario"
            disabled={mes <= -(MESES - 1)}
            onClick={() => setMes((m) => m - 1)}
          >
            ← Anterior
          </button>
          {mes !== 0 && (
            <button type="button" className="link-secundario" onClick={() => setMes(0)}>
              Este mes
            </button>
          )}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <span className="kpi-valor">{pesos(ingresos)}</span>
          <span className="kpi-etiqueta">Ingresos</span>
        </div>
        <div className="kpi">
          <span className="kpi-valor">{pesos(egresos)}</span>
          <span className="kpi-etiqueta">Egresos</span>
        </div>
        <div className="kpi">
          <span className={resultado < 0 ? 'kpi-valor kpi-valor--negativo' : 'kpi-valor'}>{pesos(resultado)}</span>
          <span className="kpi-etiqueta">
            {resultado < 0 ? 'Pérdida' : 'Ganancia'}
            {margen !== null && ` · margen ${porcentaje(margen)}`}
          </span>
        </div>
      </div>

      {detalle.cobros_sin_monto > 0 && (
        <p className="ayuda">
          {detalle.cobros_sin_monto} cobro{detalle.cobros_sin_monto === 1 ? '' : 's'} sin monto cargado: no suma
          {detalle.cobros_sin_monto === 1 ? '' : 'n'} a los ingresos. Podés completar el monto desde la ficha de la
          alumna.
        </p>
      )}

      <div className="panorama-columnas">
        <Lineas
          titulo="De dónde viene la plata"
          filas={ingresosLineas}
          etiqueta={(c) =>
            c.startsWith('otro:')
              ? ETIQUETA_INGRESO[c.slice(5) as CategoriaIngreso] ?? c
              : ETIQUETA_CONCEPTO[c as ConceptoPago] ?? c
          }
          vacio="Todavía no hay ingresos en este mes."
        />
        <Lineas
          titulo="En qué se va"
          filas={gastosLineas}
          etiqueta={(c) =>
            c === '__profesoras' ? 'Pagos a profesoras' : ETIQUETA_CATEGORIA[c as CategoriaGasto] ?? c
          }
          vacio="Todavía no hay gastos en este mes."
        />
      </div>

      <Lineas
        titulo="Caja: por dónde entró"
        filas={detalle.ingresos_por_medio}
        etiqueta={(c) => ETIQUETA_MEDIO[c as MedioPago] ?? c}
        vacio="Todavía no entró plata en este mes."
      />

      <h3>Números del negocio</h3>
      <ul className="ficha-historial">
        <li>
          <span>Ticket promedio por alumna</span>
          <strong>{ticket === null ? '—' : pesos(ticket)}</strong>
        </li>
        <li>
          <span>
            Clases dadas <span className="ayuda">· lugares usados por clase</span>
          </span>
          <strong>
            {detalle.clases_dadas}
            {lugaresPorClase !== null && ` · ${lugaresPorClase.toFixed(1).replace('.', ',')}`}
          </strong>
        </li>
        <li>
          <span>Ingreso por clase dada</span>
          <strong>{ingresoPorClase === null ? '—' : pesos(ingresoPorClase)}</strong>
        </li>
        <li>
          <span>Costo por clase dada</span>
          <strong>{costoPorClase === null ? '—' : pesos(costoPorClase)}</strong>
        </li>
        <li>
          <span>Ganancia por clase</span>
          <strong>
            {ingresoPorClase === null || costoPorClase === null ? '—' : pesos(ingresoPorClase - costoPorClase)}
          </strong>
        </li>
      </ul>

      {equilibrio !== null && (
        <p className={detalle.alumnas_pagaron >= equilibrio ? 'mensaje-ok' : 'mensaje-error'}>
          Punto de equilibrio: con el ticket promedio hacen falta unas <strong>{equilibrio}</strong> alumnas pagando
          para cubrir los egresos de este mes. Pagaron <strong>{detalle.alumnas_pagaron}</strong>.
        </p>
      )}

      {porCobrar !== null && porCobrar > 0 && (
        <p className="ayuda">
          Por cobrar (estimado): {resumen!.vencidas + resumen!.deben} alumna
          {resumen!.vencidas + resumen!.deben === 1 ? '' : 's'} con abono vencido o pago pendiente, a ese ticket
          promedio, serían unos <strong>{pesos(porCobrar)}</strong>.
        </p>
      )}

      <h3>Últimos {MESES} meses</h3>
      <Grafico meses={meses} />

      <div className="grilla-semana-scroll">
        <table className="tabla-informe">
          <thead>
            <tr>
              <th>Mes</th>
              <th>Ingresos</th>
              <th>Egresos</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {[...meses].reverse().map((m) => {
              const ing = m.cobros + m.otros
              const egr = m.gastos + m.liquidaciones
              return (
                <tr key={m.mes}>
                  <th scope="row">
                    {nombreMes(m.mes).slice(0, 3)} {m.mes.slice(2, 4)}
                  </th>
                  <td>{pesos(ing)}</td>
                  <td>{pesos(egr)}</td>
                  <td className={ing - egr < 0 ? 'kpi-valor--negativo' : ''}>{pesos(ing - egr)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td>{pesos(meses.reduce((n, m) => n + m.cobros + m.otros, 0))}</td>
              <td>{pesos(meses.reduce((n, m) => n + m.gastos + m.liquidaciones, 0))}</td>
              <td>
                {pesos(meses.reduce((n, m) => n + m.cobros + m.otros - m.gastos - m.liquidaciones, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <button type="button" className="link-secundario" onClick={descargar}>
        Descargar para Excel
      </button>
    </div>
  )
}

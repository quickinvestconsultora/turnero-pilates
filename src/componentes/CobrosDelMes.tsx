import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ETIQUETA_MEDIO } from '../servicios/clientes'
import type { MedioPago } from '../servicios/clientes'
import { descargarCsv } from '../csv'
import { hoyIso, inicioDeMes, nombreMes } from '../fechas'
import { nombreCompleto } from '../personas'

type Cobro = {
  id: string
  alumna_id: string
  monto: number | null
  medio: MedioPago
  abono_hasta: string | null
  creado_en: string
  perfiles: { nombre: string; apellido: string } | null
}

const formatoPesos = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

// Resumen de lo cobrado en el mes: total, por medio de pago y detalle, para la
// contabilidad. Sale del historial de pagos que se carga al marcar "Al día".
export default function CobrosDelMes() {
  const [mes, setMes] = useState(0) // 0 = este mes, -1 = el anterior…
  const [cobros, setCobros] = useState<Cobro[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const referencia = useMemo(() => inicioDeMes(hoyIso(), mes), [mes])
  const titulo = nombreMes(referencia) + ' ' + referencia.slice(0, 4)

  const cargar = useCallback(async () => {
    setError('')
    setCargando(true)
    try {
      const [y, m] = referencia.split('-').map(Number)
      const desde = new Date(y, m - 1, 1).toISOString()
      const hasta = new Date(y, m, 1).toISOString()
      const { data, error: err } = await supabase
        .from('pagos_clientes')
        .select('id, alumna_id, monto, medio, abono_hasta, creado_en, perfiles ( nombre, apellido )')
        .gte('creado_en', desde)
        .lt('creado_en', hasta)
        .order('creado_en', { ascending: false })
      if (err) throw new Error(err.message)
      // numeric llega como texto desde la base.
      setCobros(
        ((data ?? []) as unknown as (Omit<Cobro, 'monto'> & { monto: string | null })[]).map((c) => ({
          ...c,
          monto: c.monto === null ? null : Number(c.monto),
        })),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los cobros.')
    } finally {
      setCargando(false)
    }
  }, [referencia])

  useEffect(() => {
    cargar()
  }, [cargar])

  const total = cobros.reduce((n, c) => n + (c.monto ?? 0), 0)
  const sinMonto = cobros.filter((c) => c.monto === null).length
  const alumnas = new Set(cobros.map((c) => c.alumna_id)).size

  const porMedio = (Object.keys(ETIQUETA_MEDIO) as MedioPago[])
    .map((medio) => {
      const delMedio = cobros.filter((c) => c.medio === medio)
      return {
        medio,
        cantidad: delMedio.length,
        monto: delMedio.reduce((n, c) => n + (c.monto ?? 0), 0),
      }
    })
    .filter((f) => f.cantidad > 0)

  const descargar = () =>
    descargarCsv('cobros-' + referencia.slice(0, 7) + '.csv', [
      ['Fecha', 'Alumna', 'Monto', 'Medio', 'Abono cubre hasta'],
      ...cobros.map((c) => [
        new Date(c.creado_en).toLocaleDateString('es-AR'),
        c.perfiles ? nombreCompleto(c.perfiles) : '',
        c.monto,
        ETIQUETA_MEDIO[c.medio],
        c.abono_hasta ? c.abono_hasta.split('-').reverse().join('/') : '',
      ]),
    ])

  return (
    <section>
      <div className="fila-titulo">
        <h2>Cobros</h2>
        <div className="barra-acciones">
          <button
            type="button"
            className="link-secundario"
            disabled={mes <= -12}
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
      <p className="ayuda hoy-fecha">{titulo}</p>

      {error && <p className="mensaje-error">{error}</p>}

      {cargando ? (
        <p className="vacio">Cargando...</p>
      ) : cobros.length === 0 ? (
        <p className="vacio">No hay pagos registrados en este mes.</p>
      ) : (
        <>
          <div className="cobros-resumen">
            <div>
              <span className="ayuda">Total cobrado</span>
              <strong>{formatoPesos(total)}</strong>
            </div>
            <div>
              <span className="ayuda">Pagos</span>
              <strong>{cobros.length}</strong>
            </div>
            <div>
              <span className="ayuda">Alumnas</span>
              <strong>{alumnas}</strong>
            </div>
          </div>
          {sinMonto > 0 && (
            <p className="ayuda">
              {sinMonto} pago{sinMonto === 1 ? '' : 's'} sin monto cargado: no suma{sinMonto === 1 ? '' : 'n'} al total.
            </p>
          )}

          <h3>Por medio de pago</h3>
          <ul className="ficha-historial">
            {porMedio.map((f) => (
              <li key={f.medio}>
                <span>
                  {ETIQUETA_MEDIO[f.medio]} <span className="ayuda">· {f.cantidad} pago{f.cantidad === 1 ? '' : 's'}</span>
                </span>
                <strong>{formatoPesos(f.monto)}</strong>
              </li>
            ))}
          </ul>

          <h3>Detalle</h3>
          <ul className="ficha-historial">
            {cobros.map((c) => (
              <li key={c.id}>
                <span>
                  {new Date(c.creado_en).toLocaleDateString('es-AR')} ·{' '}
                  {c.perfiles ? nombreCompleto(c.perfiles) : 'Alumna'}
                  <span className="ayuda"> · {ETIQUETA_MEDIO[c.medio]}</span>
                </span>
                <strong>{c.monto === null ? 'Sin monto' : formatoPesos(c.monto)}</strong>
              </li>
            ))}
          </ul>

          <button type="button" className="link-secundario" onClick={descargar}>
            Descargar para Excel
          </button>
        </>
      )}
    </section>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  adjuntarComprobanteGasto,
  agregarGasto,
  borrarGasto,
  ETIQUETA_CATEGORIA,
  listarGastos,
  obtenerBalance,
  quitarComprobanteGasto,
  urlComprobanteGasto,
} from '../servicios/gestion'
import { descargarPaqueteContador } from '../servicios/contador'
import type { Balance, CategoriaGasto, Gasto } from '../servicios/gestion'
import { descargarCsv } from '../csv'
import type { ChangeEvent } from 'react'
import { finDeMes, hoyIso, inicioDeMes, nombreMes } from '../fechas'

const pesos = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

const fechaAr = (iso: string) => iso.split('-').reverse().join('/')

// Egresos del estudio y resultado del mes: lo cobrado a las alumnas, menos los
// gastos cargados acá y lo pagado a las profesoras (ver Profesores → Liquidación).
export default function Egresos() {
  const [mes, setMes] = useState(0)
  const [balance, setBalance] = useState<Balance | null>(null)
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [agregando, setAgregando] = useState(false)
  const [armandoPaquete, setArmandoPaquete] = useState(false)
  const [aviso, setAviso] = useState('')

  const referencia = useMemo(() => inicioDeMes(hoyIso(), mes), [mes])
  const titulo = `${nombreMes(referencia)} ${referencia.slice(0, 4)}`

  const cargar = useCallback(async () => {
    setError('')
    setCargando(true)
    try {
      const [b, g] = await Promise.all([
        obtenerBalance(referencia),
        listarGastos(referencia, finDeMes(referencia)),
      ])
      setBalance(b)
      setGastos(g)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los egresos.')
    } finally {
      setCargando(false)
    }
  }, [referencia])

  useEffect(() => {
    cargar()
  }, [cargar])

  const quitar = async (g: Gasto) => {
    if (!window.confirm(`¿Borrar el gasto "${g.concepto}" de ${pesos(g.monto)}?`)) return
    setError('')
    try {
      await borrarGasto(g.id, g.comprobante_ruta)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar.')
    }
  }

  const ingresos = balance ? balance.cobrado + balance.otros : 0
  const egresos = balance ? balance.gastos + balance.liquidaciones : 0
  const resultado = balance ? ingresos - egresos : 0

  const porCategoria = (Object.keys(ETIQUETA_CATEGORIA) as CategoriaGasto[])
    .map((c) => ({
      categoria: c,
      monto: gastos.filter((g) => g.categoria === c).reduce((n, g) => n + g.monto, 0),
    }))
    .filter((f) => f.monto > 0)

  const paqueteContador = async () => {
    setError('')
    setAviso('')
    setArmandoPaquete(true)
    try {
      const r = await descargarPaqueteContador(referencia)
      setAviso(
        'Paquete listo: resumen, cobros, gastos, otros ingresos y pagos a profesoras' +
          (r.comprobantes > 0 ? ', con ' + r.comprobantes + ' comprobante' + (r.comprobantes === 1 ? '' : 's') : '') +
          (r.faltantes > 0 ? '. No se pudieron bajar ' + r.faltantes + ' archivo' + (r.faltantes === 1 ? '' : 's') : '') +
          '.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo armar el paquete.')
    } finally {
      setArmandoPaquete(false)
    }
  }

  const descargar = () =>
    descargarCsv(`egresos-${referencia.slice(0, 7)}.csv`, [
      ['Fecha', 'Categoría', 'Concepto', 'Monto', 'Nota'],
      ...gastos.map((g) => [fechaAr(g.fecha), ETIQUETA_CATEGORIA[g.categoria], g.concepto, g.monto, g.nota ?? '']),
    ])

  return (
    <section>
      <div className="fila-titulo">
        <h3>Gastos</h3>
        <div className="barra-acciones">
          <button type="button" className="link-secundario" disabled={mes <= -12} onClick={() => setMes((m) => m - 1)}>
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
      {aviso && <p className="mensaje-ok">{aviso}</p>}

      {balance && (
        <div className="cobros-resumen">
          <div>
            <span className="ayuda">Cobrado a alumnas</span>
            <strong>{pesos(balance.cobrado)}</strong>
          </div>
          <div>
            <span className="ayuda">Otros ingresos</span>
            <strong>{pesos(balance.otros)}</strong>
          </div>
          <div>
            <span className="ayuda">Gastos</span>
            <strong>{pesos(balance.gastos)}</strong>
          </div>
          <div>
            <span className="ayuda">Pagado a profesoras</span>
            <strong>{pesos(balance.liquidaciones)}</strong>
          </div>
          <div>
            <span className="ayuda">Resultado</span>
            <strong className={resultado < 0 ? 'kpi-valor--negativo' : ''}>{pesos(resultado)}</strong>
          </div>
        </div>
      )}

      <div className="fila-titulo">
        <h3>Detalle de gastos</h3>
        <div className="barra-acciones">
          <button type="button" className="link-secundario" disabled={armandoPaquete} onClick={paqueteContador}>
            {armandoPaquete ? 'Armando...' : 'Paquete para el contador'}
          </button>
          <button type="button" className="link-secundario" onClick={() => setAgregando((v) => !v)}>
            {agregando ? 'Cerrar' : '+ Cargar un gasto'}
          </button>
        </div>
      </div>

      {agregando && (
        <FormGasto
          onGuardado={() => {
            setAgregando(false)
            cargar()
          }}
          onCerrar={() => setAgregando(false)}
        />
      )}

      {cargando ? (
        <p className="vacio">Cargando...</p>
      ) : gastos.length === 0 ? (
        <p className="vacio">No hay gastos cargados en este mes.</p>
      ) : (
        <>
          <ul className="ficha-historial">
            {porCategoria.map((f) => (
              <li key={f.categoria}>
                <span>{ETIQUETA_CATEGORIA[f.categoria]}</span>
                <strong>{pesos(f.monto)}</strong>
              </li>
            ))}
          </ul>

          <h3>Detalle</h3>
          <ul className="ficha-historial">
            {gastos.map((g) => (
              <li key={g.id}>
                <span>
                  {fechaAr(g.fecha)} · {g.concepto}
                  <span className="ayuda"> · {ETIQUETA_CATEGORIA[g.categoria]}</span>
                  {g.nota && <span className="ayuda"> · {g.nota}</span>}
                </span>
                <span className="acciones-pago">
                  <strong>{pesos(g.monto)}</strong>
                  <AdjuntoGasto gasto={g} onCambio={cargar} onError={setError} />
                  <button type="button" className="link-secundario" onClick={() => quitar(g)}>
                    Borrar
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <div className="barra-acciones">
            <button type="button" className="link-secundario" onClick={descargar}>
              Descargar para Excel
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function FormGasto({ onGuardado, onCerrar }: { onGuardado: () => void; onCerrar: () => void }) {
  const hoy = hoyIso()
  const [fecha, setFecha] = useState(hoy)
  const [categoria, setCategoria] = useState<CategoriaGasto>('alquiler')
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const montoNum = Number(monto.replace(',', '.'))
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      setError('Poné un monto mayor a cero.')
      return
    }
    setEnviando(true)
    try {
      const id = await agregarGasto({
        fecha,
        categoria,
        concepto: concepto.trim() || ETIQUETA_CATEGORIA[categoria],
        monto: montoNum,
        nota,
      })
      if (archivo) {
        try {
          await adjuntarComprobanteGasto(id, archivo)
        } catch (errAdjunto) {
          // El gasto ya quedó cargado: se puede adjuntar después desde la lista.
          setError(
            'El gasto se guardó, pero no se pudo adjuntar el comprobante: ' +
              (errAdjunto instanceof Error ? errAdjunto.message : 'error desconocido'),
          )
          setEnviando(false)
          return
        }
      }
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el gasto.')
      setEnviando(false)
    }
  }

  return (
    <form className="form-caja" onSubmit={guardar}>
      <div className="grilla-campos">
        <div>
          <label htmlFor="gasto-fecha">Fecha</label>
          <input id="gasto-fecha" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="gasto-cat">Categoría</label>
          <select id="gasto-cat" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaGasto)}>
            {(Object.keys(ETIQUETA_CATEGORIA) as CategoriaGasto[]).map((c) => (
              <option key={c} value={c}>
                {ETIQUETA_CATEGORIA[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="gasto-concepto">Concepto</label>
          <input
            id="gasto-concepto"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej: alquiler de octubre"
          />
        </div>
        <div>
          <label htmlFor="gasto-monto">Monto</label>
          <input
            id="gasto-monto"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="decimal"
            placeholder="$"
            required
          />
        </div>
      </div>
      <label htmlFor="gasto-nota">Nota (opcional)</label>
      <input id="gasto-nota" value={nota} onChange={(e) => setNota(e.target.value)} />
      <label htmlFor="gasto-archivo">Factura o ticket (foto o PDF, opcional)</label>
      <input
        id="gasto-archivo"
        type="file"
        accept="image/*,application/pdf"
        onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
      />
      {error && <p className="mensaje-error">{error}</p>}
      <div className="barra-acciones">
        <button type="submit" disabled={enviando}>
          {enviando ? 'Guardando...' : 'Guardar gasto'}
        </button>
        <button type="button" className="link-secundario" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

// Comprobante de un gasto: ver, adjuntar, cambiar o quitar.
function AdjuntoGasto({
  gasto,
  onCambio,
  onError,
}: {
  gasto: Gasto
  onCambio: () => void
  onError: (m: string) => void
}) {
  const [ocupado, setOcupado] = useState(false)

  const ver = async () => {
    if (!gasto.comprobante_ruta) return
    onError('')
    try {
      const url = await urlComprobanteGasto(gasto.comprobante_ruta)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo abrir el comprobante.')
    }
  }

  const elegir = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    onError('')
    setOcupado(true)
    try {
      await adjuntarComprobanteGasto(gasto.id, archivo, gasto.comprobante_ruta)
      onCambio()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo adjuntar el archivo.')
    } finally {
      setOcupado(false)
    }
  }

  const quitar = async () => {
    if (!gasto.comprobante_ruta) return
    if (!window.confirm('¿Quitar el comprobante de este gasto?')) return
    onError('')
    try {
      await quitarComprobanteGasto(gasto.id, gasto.comprobante_ruta)
      onCambio()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo quitar el comprobante.')
    }
  }

  return (
    <span className="boton-recibo">
      {gasto.comprobante_ruta && (
        <button type="button" className="link-secundario" onClick={ver}>
          Ver comprobante
        </button>
      )}
      <label className="link-secundario boton-archivo-chico">
        {ocupado ? 'Subiendo...' : gasto.comprobante_ruta ? 'Cambiar' : 'Adjuntar'}
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={elegir}
          disabled={ocupado}
          className="oculto-visualmente"
        />
      </label>
      {gasto.comprobante_ruta && (
        <button type="button" className="link-secundario" onClick={quitar}>
          Quitar
        </button>
      )}
    </span>
  )
}

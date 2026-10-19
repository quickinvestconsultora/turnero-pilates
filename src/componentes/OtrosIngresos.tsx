import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  agregarIngresoExtra,
  borrarIngresoExtra,
  ETIQUETA_INGRESO,
  listarIngresosExtra,
} from '../servicios/gestion'
import type { CategoriaIngreso, IngresoExtra } from '../servicios/gestion'
import { ETIQUETA_MEDIO } from '../servicios/clientes'
import type { MedioPago } from '../servicios/clientes'
import { finDeMes, hoyIso, inicioDeMes, nombreMes } from '../fechas'

const pesos = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

const fechaAr = (iso: string) => iso.split('-').reverse().join('/')

// Ingresos que no son cobros a alumnas: alquiler de la sala, venta de productos,
// eventos. Los cobros de cada alumna se cargan desde su ficha o desde la pestaña Cobros.
export default function OtrosIngresos() {
  const [mes, setMes] = useState(0)
  const [lista, setLista] = useState<IngresoExtra[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [agregando, setAgregando] = useState(false)

  const referencia = useMemo(() => inicioDeMes(hoyIso(), mes), [mes])

  const cargar = useCallback(async () => {
    setError('')
    setCargando(true)
    try {
      setLista(await listarIngresosExtra(referencia, finDeMes(referencia)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los ingresos.')
    } finally {
      setCargando(false)
    }
  }, [referencia])

  useEffect(() => {
    cargar()
  }, [cargar])

  const quitar = async (i: IngresoExtra) => {
    if (!window.confirm(`¿Borrar "${i.concepto}" de ${pesos(i.monto)}?`)) return
    setError('')
    try {
      await borrarIngresoExtra(i.id)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar.')
    }
  }

  const total = lista.reduce((n, i) => n + i.monto, 0)

  return (
    <section>
      <div className="fila-titulo">
        <h3>
          Otros ingresos · {nombreMes(referencia)} {referencia.slice(0, 4)}
        </h3>
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
      <p className="ayuda">
        Plata que entra y no es el pago de una alumna: alquiler de la sala, venta de productos, talleres.
      </p>

      {error && <p className="mensaje-error">{error}</p>}

      <button type="button" className="link-secundario" onClick={() => setAgregando((v) => !v)}>
        {agregando ? 'Cerrar' : '+ Cargar un ingreso'}
      </button>

      {agregando && (
        <FormIngreso
          onGuardado={() => {
            setAgregando(false)
            cargar()
          }}
          onCerrar={() => setAgregando(false)}
        />
      )}

      {cargando ? (
        <p className="vacio">Cargando...</p>
      ) : lista.length === 0 ? (
        <p className="vacio">No hay otros ingresos en este mes.</p>
      ) : (
        <>
          <p className="ficha-resumen">
            Total del mes: <strong>{pesos(total)}</strong>
          </p>
          <ul className="ficha-historial">
            {lista.map((i) => (
              <li key={i.id}>
                <span>
                  {fechaAr(i.fecha)} · {i.concepto}
                  <span className="ayuda">
                    {' '}
                    · {ETIQUETA_INGRESO[i.categoria]} · {ETIQUETA_MEDIO[i.medio]}
                  </span>
                  {i.nota && <span className="ayuda"> · {i.nota}</span>}
                </span>
                <span className="acciones-pago">
                  <strong>{pesos(i.monto)}</strong>
                  <button type="button" className="link-secundario" onClick={() => quitar(i)}>
                    Borrar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function FormIngreso({ onGuardado, onCerrar }: { onGuardado: () => void; onCerrar: () => void }) {
  const hoy = hoyIso()
  const [fecha, setFecha] = useState(hoy)
  const [categoria, setCategoria] = useState<CategoriaIngreso>('productos')
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [medio, setMedio] = useState<MedioPago>('efectivo')
  const [nota, setNota] = useState('')
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
      await agregarIngresoExtra({
        fecha,
        categoria,
        concepto: concepto.trim() || ETIQUETA_INGRESO[categoria],
        monto: montoNum,
        medio,
        nota,
      })
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el ingreso.')
      setEnviando(false)
    }
  }

  return (
    <form className="form-caja" onSubmit={guardar}>
      <div className="grilla-campos">
        <div>
          <label htmlFor="ing-fecha">Fecha</label>
          <input id="ing-fecha" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="ing-cat">Tipo</label>
          <select id="ing-cat" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaIngreso)}>
            {(Object.keys(ETIQUETA_INGRESO) as CategoriaIngreso[]).map((c) => (
              <option key={c} value={c}>
                {ETIQUETA_INGRESO[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ing-concepto">Concepto</label>
          <input
            id="ing-concepto"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej: venta de medias antideslizantes"
          />
        </div>
        <div>
          <label htmlFor="ing-monto">Monto</label>
          <input
            id="ing-monto"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="decimal"
            placeholder="$"
            required
          />
        </div>
        <div>
          <label htmlFor="ing-medio">Medio</label>
          <select id="ing-medio" value={medio} onChange={(e) => setMedio(e.target.value as MedioPago)}>
            {(Object.keys(ETIQUETA_MEDIO) as MedioPago[]).map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_MEDIO[m]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label htmlFor="ing-nota">Nota (opcional)</label>
      <input id="ing-nota" value={nota} onChange={(e) => setNota(e.target.value)} />
      {error && <p className="mensaje-error">{error}</p>}
      <div className="barra-acciones">
        <button type="submit" disabled={enviando}>
          {enviando ? 'Guardando...' : 'Guardar ingreso'}
        </button>
        <button type="button" className="link-secundario" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  borrarPagoProfesora,
  guardarTarifa,
  liquidacionDelMes,
  listarPagosProfesoras,
  registrarPagoProfesora,
} from '../servicios/gestion'
import type { FilaLiquidacion, PagoProfesora } from '../servicios/gestion'
import { ETIQUETA_MEDIO } from '../servicios/clientes'
import type { MedioPago } from '../servicios/clientes'
import { descargarCsv } from '../csv'
import { hoyIso, inicioDeMes, nombreMes } from '../fechas'

const pesos = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

const fechaAr = (iso: string) => iso.split('-').reverse().join('/')

// Liquidación del mes por profesora: clases dadas × valor por clase, lo que ya
// se le pagó y lo que falta. Cada pago queda registrado y la profesora lo ve en
// su pantalla ("Mis pagos").
export default function LiquidacionProfesoras() {
  const [mes, setMes] = useState(0)
  const [filas, setFilas] = useState<FilaLiquidacion[]>([])
  const [pagos, setPagos] = useState<PagoProfesora[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const referencia = useMemo(() => inicioDeMes(hoyIso(), mes), [mes])
  const titulo = `${nombreMes(referencia)} ${referencia.slice(0, 4)}`

  const cargar = useCallback(async () => {
    setError('')
    setCargando(true)
    try {
      const [f, p] = await Promise.all([
        liquidacionDelMes(referencia),
        listarPagosProfesoras({ periodo: referencia }),
      ])
      setFilas(f)
      setPagos(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la liquidación.')
    } finally {
      setCargando(false)
    }
  }, [referencia])

  useEffect(() => {
    cargar()
  }, [cargar])

  const totalAPagar = filas.reduce((n, f) => n + (f.a_pagar ?? 0), 0)
  const totalPagado = filas.reduce((n, f) => n + f.pagado, 0)

  const descargar = () =>
    descargarCsv(`liquidacion-profesoras-${referencia.slice(0, 7)}.csv`, [
      ['Profesora', 'Clases dadas', 'Valor por clase', 'A pagar', 'Pagado', 'Saldo'],
      ...filas.map((f) => [f.nombre, f.clases, f.valor_clase ?? '', f.a_pagar ?? '', f.pagado, f.saldo ?? '']),
    ])

  return (
    <section className="informe-profesoras">
      <div className="fila-titulo">
        <h3>Liquidación del mes</h3>
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
      <p className="ayuda hoy-fecha">
        {titulo}: clases ya dadas (sin las canceladas) por el valor por clase de cada profesora. El valor
        que ves es el actual; al registrar un pago podés poner el monto que corresponda.
      </p>

      {error && <p className="mensaje-error">{error}</p>}

      {cargando ? (
        <p className="vacio">Cargando...</p>
      ) : filas.length === 0 ? (
        <p className="vacio">Todavía no hay profesoras con clases en este mes.</p>
      ) : (
        <>
          <div className="cobros-resumen">
            <div>
              <span className="ayuda">A pagar</span>
              <strong>{pesos(totalAPagar)}</strong>
            </div>
            <div>
              <span className="ayuda">Pagado</span>
              <strong>{pesos(totalPagado)}</strong>
            </div>
            <div>
              <span className="ayuda">Falta</span>
              <strong>{pesos(Math.max(totalAPagar - totalPagado, 0))}</strong>
            </div>
          </div>

          <ul className="lista-liquidacion">
            {filas.map((f) => (
              <FilaProfesora
                key={f.profesora_id}
                fila={f}
                periodo={referencia}
                pagos={pagos.filter((p) => p.profesora_id === f.profesora_id)}
                onCambio={cargar}
                onError={setError}
              />
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

function FilaProfesora({
  fila,
  periodo,
  pagos,
  onCambio,
  onError,
}: {
  fila: FilaLiquidacion
  periodo: string
  pagos: PagoProfesora[]
  onCambio: () => void
  onError: (m: string) => void
}) {
  const [editandoValor, setEditandoValor] = useState(false)
  const [valor, setValor] = useState(fila.valor_clase === null ? '' : String(fila.valor_clase))
  const [pagando, setPagando] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  const guardarValor = async (e: FormEvent) => {
    e.preventDefault()
    const n = Number(valor.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) {
      onError('El valor por clase tiene que ser un número.')
      return
    }
    setOcupado(true)
    onError('')
    try {
      await guardarTarifa(fila.profesora_id, n)
      setEditandoValor(false)
      onCambio()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo guardar el valor.')
    } finally {
      setOcupado(false)
    }
  }

  const quitarPago = async (p: PagoProfesora) => {
    if (!window.confirm(`¿Borrar el pago de ${pesos(p.monto)} del ${fechaAr(p.fecha)}?`)) return
    onError('')
    try {
      await borrarPagoProfesora(p.id)
      onCambio()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo borrar el pago.')
    }
  }

  const saldo = fila.saldo
  return (
    <li className="liquidacion-item">
      <div className="liquidacion-cabecera">
        <strong>{fila.nombre}</strong>
        <span className="turno-detalle">
          {fila.clases} clase{fila.clases === 1 ? '' : 's'}
          {fila.valor_clase !== null && ` × ${pesos(fila.valor_clase)}`}
        </span>
      </div>

      <div className="liquidacion-numeros">
        <div>
          <span className="ayuda">A pagar</span>
          <strong>{fila.a_pagar === null ? 'Sin valor por clase' : pesos(fila.a_pagar)}</strong>
        </div>
        <div>
          <span className="ayuda">Pagado</span>
          <strong>{pesos(fila.pagado)}</strong>
        </div>
        <div>
          <span className="ayuda">Saldo</span>
          <strong className={saldo !== null && saldo > 0 ? 'hoy-alerta' : ''}>
            {saldo === null ? '—' : saldo === 0 ? 'Al día' : pesos(saldo)}
          </strong>
        </div>
      </div>

      <div className="barra-acciones">
        <button type="button" className="link-secundario" onClick={() => setEditandoValor((v) => !v)}>
          {fila.valor_clase === null ? 'Cargar valor por clase' : 'Cambiar valor por clase'}
        </button>
        <button type="button" className="link-secundario" onClick={() => setPagando((v) => !v)}>
          {pagando ? 'Cerrar' : '+ Registrar un pago'}
        </button>
      </div>

      {editandoValor && (
        <form className="form-caja" onSubmit={guardarValor}>
          <label htmlFor={'valor-' + fila.profesora_id}>Valor por clase dada</label>
          <input
            id={'valor-' + fila.profesora_id}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            placeholder="$"
            required
          />
          <div className="barra-acciones">
            <button type="submit" disabled={ocupado}>
              {ocupado ? 'Guardando...' : 'Guardar'}
            </button>
            <button type="button" className="link-secundario" onClick={() => setEditandoValor(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {pagando && (
        <FormPagoProfesora
          fila={fila}
          periodo={periodo}
          onGuardado={() => {
            setPagando(false)
            onCambio()
          }}
          onCerrar={() => setPagando(false)}
        />
      )}

      {pagos.length > 0 && (
        <ul className="ficha-historial">
          {pagos.map((p) => (
            <li key={p.id}>
              <span>
                {fechaAr(p.fecha)} · <strong>{pesos(p.monto)}</strong> · {ETIQUETA_MEDIO[p.medio]}
                {p.nota && <span className="ayuda"> · {p.nota}</span>}
              </span>
              <button type="button" className="link-secundario" onClick={() => quitarPago(p)}>
                Borrar
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function FormPagoProfesora({
  fila,
  periodo,
  onGuardado,
  onCerrar,
}: {
  fila: FilaLiquidacion
  periodo: string
  onGuardado: () => void
  onCerrar: () => void
}) {
  const hoy = hoyIso()
  const sugerido = fila.saldo !== null && fila.saldo > 0 ? fila.saldo : fila.a_pagar && fila.pagado === 0 ? fila.a_pagar : 0
  const [monto, setMonto] = useState(sugerido > 0 ? String(sugerido) : '')
  const [medio, setMedio] = useState<MedioPago>('transferencia')
  const [fecha, setFecha] = useState(hoy)
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const n = Number(monto.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      setError('Poné un monto mayor a cero.')
      return
    }
    setEnviando(true)
    try {
      await registrarPagoProfesora({
        profesoraId: fila.profesora_id,
        periodo,
        clases: fila.clases,
        valorClase: fila.valor_clase,
        monto: n,
        medio,
        fecha,
        nota,
      })
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago.')
      setEnviando(false)
    }
  }

  const id = (c: string) => `pp-${c}-${fila.profesora_id}`
  return (
    <form className="form-caja" onSubmit={guardar}>
      <p>
        <strong>Pago a {fila.nombre}</strong>
        <br />
        <span className="ayuda">Queda en su registro de pagos, que ella ve en la app.</span>
      </p>
      <div className="grilla-campos">
        <div>
          <label htmlFor={id('monto')}>Monto</label>
          <input
            id={id('monto')}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="decimal"
            placeholder="$"
            required
          />
        </div>
        <div>
          <label htmlFor={id('fecha')}>Fecha del pago</label>
          <input id={id('fecha')} type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} required />
        </div>
        <div>
          <label htmlFor={id('medio')}>Medio</label>
          <select id={id('medio')} value={medio} onChange={(e) => setMedio(e.target.value as MedioPago)}>
            {(Object.keys(ETIQUETA_MEDIO) as MedioPago[]).map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_MEDIO[m]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label htmlFor={id('nota')}>Nota (opcional)</label>
      <input
        id={id('nota')}
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Ej: adelanto, ajuste por clase extra"
      />
      {error && <p className="mensaje-error">{error}</p>}
      <div className="barra-acciones">
        <button type="submit" disabled={enviando}>
          {enviando ? 'Guardando...' : 'Guardar pago'}
        </button>
        <button type="button" className="link-secundario" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

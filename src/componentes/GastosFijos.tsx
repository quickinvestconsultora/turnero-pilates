import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  borrarGastoFijo,
  cambiarGastoFijoActivo,
  cargarGastosFijos,
  ETIQUETA_CATEGORIA,
  guardarGastoFijo,
  listarGastosFijos,
} from '../servicios/gestion'
import type { CategoriaGasto, GastoFijo } from '../servicios/gestion'
import { hoyIso, inicioDeMes, nombreMes } from '../fechas'

const pesos = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

// Gastos que se repiten todos los meses (alquiler, internet, sueldos fijos…). Se
// definen una vez y cada mes se cargan con un clic, sin volver a tipearlos.
export default function GastosFijos() {
  const [lista, setLista] = useState<GastoFijo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [editando, setEditando] = useState<GastoFijo | 'nuevo' | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const mes = inicioDeMes(hoyIso())

  const cargar = useCallback(async () => {
    setError('')
    try {
      setLista(await listarGastosFijos())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los gastos fijos.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const activos = lista.filter((g) => g.activo)
  const totalMensual = activos.reduce((n, g) => n + g.monto, 0)

  const cargarDelMes = async () => {
    setError('')
    setAviso('')
    setOcupado(true)
    try {
      const n = await cargarGastosFijos(mes)
      setAviso(
        n === 0
          ? `Los gastos fijos de ${nombreMes(mes)} ya estaban cargados.`
          : `Listo: se cargaron ${n} gasto${n === 1 ? '' : 's'} fijo${n === 1 ? '' : 's'} de ${nombreMes(mes)}.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los gastos del mes.')
    } finally {
      setOcupado(false)
    }
  }

  const alternar = async (g: GastoFijo) => {
    setError('')
    try {
      await cambiarGastoFijoActivo(g.id, !g.activo)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar.')
    }
  }

  const quitar = async (g: GastoFijo) => {
    if (!window.confirm(`¿Borrar el gasto fijo "${g.concepto}"? Los gastos ya cargados se mantienen.`)) return
    setError('')
    try {
      await borrarGastoFijo(g.id)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar.')
    }
  }

  return (
    <section>
      <h3>Gastos fijos</h3>
      <p className="ayuda">
        Definí una vez lo que pagás todos los meses. Cada mes tocás el botón y se cargan solos en Gastos; si ya
        estaban, no se repiten. Si un monto cambia, editalo acá y vale para los meses que cargues desde ese momento.
      </p>

      {error && <p className="mensaje-error">{error}</p>}
      {aviso && <p className="mensaje-ok">{aviso}</p>}

      <div className="barra-acciones">
        <button type="button" disabled={ocupado || activos.length === 0} onClick={cargarDelMes}>
          {ocupado ? 'Cargando...' : `Cargar los fijos de ${nombreMes(mes)}`}
        </button>
        <button type="button" className="link-secundario" onClick={() => setEditando(editando === 'nuevo' ? null : 'nuevo')}>
          {editando === 'nuevo' ? 'Cerrar' : '+ Nuevo gasto fijo'}
        </button>
      </div>

      {editando === 'nuevo' && (
        <FormFijo
          onGuardado={() => {
            setEditando(null)
            cargar()
          }}
          onCerrar={() => setEditando(null)}
        />
      )}

      {cargando ? (
        <p className="vacio">Cargando...</p>
      ) : lista.length === 0 ? (
        <p className="vacio">Todavía no definiste gastos fijos. Empezá por el alquiler.</p>
      ) : (
        <>
          <p className="ficha-resumen">
            Fijos activos: <strong>{pesos(totalMensual)}</strong> por mes.
          </p>
          <ul className="lista-clientes">
            {lista.map((g) => (
              <li key={g.id} className="cliente">
                <div className="cliente-datos">
                  <strong>
                    {g.concepto} · {pesos(g.monto)}
                  </strong>
                  <span className="turno-detalle">
                    {ETIQUETA_CATEGORIA[g.categoria]} · se carga el día {g.dia}
                    {!g.activo && ' · Desactivado'}
                  </span>
                </div>
                <div className="cliente-enlaces">
                  <button type="button" className="link-secundario" onClick={() => setEditando(g)}>
                    Editar
                  </button>
                  <button type="button" className="link-secundario" onClick={() => alternar(g)}>
                    {g.activo ? 'Desactivar' : 'Activar'}
                  </button>
                  <button type="button" className="link-secundario" onClick={() => quitar(g)}>
                    Borrar
                  </button>
                </div>
                {editando !== null && editando !== 'nuevo' && editando.id === g.id && (
                  <FormFijo
                    fijo={g}
                    onGuardado={() => {
                      setEditando(null)
                      cargar()
                    }}
                    onCerrar={() => setEditando(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function FormFijo({
  fijo,
  onGuardado,
  onCerrar,
}: {
  fijo?: GastoFijo
  onGuardado: () => void
  onCerrar: () => void
}) {
  const [concepto, setConcepto] = useState(fijo?.concepto ?? '')
  const [categoria, setCategoria] = useState<CategoriaGasto>(fijo?.categoria ?? 'alquiler')
  const [monto, setMonto] = useState(fijo ? String(fijo.monto) : '')
  const [dia, setDia] = useState(String(fijo?.dia ?? 1))
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const montoNum = Number(monto.replace(',', '.'))
    const diaNum = Number(dia)
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      setError('Poné un monto mayor a cero.')
      return
    }
    if (!Number.isInteger(diaNum) || diaNum < 1 || diaNum > 28) {
      setError('El día tiene que estar entre 1 y 28.')
      return
    }
    setEnviando(true)
    try {
      await guardarGastoFijo({
        id: fijo?.id,
        concepto: concepto.trim() || ETIQUETA_CATEGORIA[categoria],
        categoria,
        monto: montoNum,
        dia: diaNum,
      })
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
      setEnviando(false)
    }
  }

  const id = (c: string) => `gf-${c}-${fijo?.id ?? 'nuevo'}`
  return (
    <form className="form-caja" onSubmit={guardar}>
      <div className="grilla-campos">
        <div>
          <label htmlFor={id('concepto')}>Concepto</label>
          <input
            id={id('concepto')}
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej: alquiler del local"
          />
        </div>
        <div>
          <label htmlFor={id('cat')}>Categoría</label>
          <select id={id('cat')} value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaGasto)}>
            {(Object.keys(ETIQUETA_CATEGORIA) as CategoriaGasto[]).map((c) => (
              <option key={c} value={c}>
                {ETIQUETA_CATEGORIA[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={id('monto')}>Monto por mes</label>
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
          <label htmlFor={id('dia')}>Día del mes (1 a 28)</label>
          <input
            id={id('dia')}
            value={dia}
            onChange={(e) => setDia(e.target.value)}
            inputMode="numeric"
            required
          />
        </div>
      </div>
      {error && <p className="mensaje-error">{error}</p>}
      <div className="barra-acciones">
        <button type="submit" disabled={enviando}>
          {enviando ? 'Guardando...' : 'Guardar'}
        </button>
        <button type="button" className="link-secundario" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

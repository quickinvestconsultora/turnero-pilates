import { useState } from 'react'
import type { FormEvent } from 'react'
import { ETIQUETA_CONCEPTO, ETIQUETA_MEDIO, registrarPagoManual } from '../servicios/clientes'
import type { ConceptoPago, MedioPago } from '../servicios/clientes'
import { PRECIO_CLASE_SUELTA, PRECIOS_MENSUALES } from '../config/precios'
import { diaMes } from '../cuenta'
import { finDeMes, hoyIso } from '../fechas'

// Los precios de config/precios.ts vienen como texto ("$45.000").
const aNumero = (texto: string) => Number(texto.replace(/\D/g, ''))

// Carga manual de un pago: con la fecha real (se puede cargar uno de días
// atrás), el concepto, el monto y hasta cuándo cubre. Puede dejar a la alumna
// "al día" hasta esa fecha o solo guardarlo en el historial.
export default function PagoManual({
  alumna,
  inicial,
  onRegistrado,
  onCerrar,
}: {
  alumna: { id: string; nombre: string }
  // Valores con los que arranca el formulario (por ejemplo, regalar una clase).
  inicial?: { monto?: string; concepto?: ConceptoPago; nota?: string }
  onRegistrado: () => void
  onCerrar: () => void
}) {
  const hoy = hoyIso()
  const [fecha, setFecha] = useState(hoy)
  const [concepto, setConcepto] = useState<ConceptoPago>(inicial?.concepto ?? 'mes')
  const [monto, setMonto] = useState(inicial?.monto ?? '')
  const [medio, setMedio] = useState<MedioPago>('transferencia')
  const [hasta, setHasta] = useState(inicial?.concepto && inicial.concepto !== 'mes' ? hoy : finDeMes(hoy))
  const [dejarAlDia, setDejarAlDia] = useState(true)
  const [nota, setNota] = useState(inicial?.nota ?? '')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const atajos: { etiqueta: string; valor: number }[] = [
    ...(PRECIO_CLASE_SUELTA
      ? [{ etiqueta: 'Clase ' + PRECIO_CLASE_SUELTA, valor: aNumero(PRECIO_CLASE_SUELTA) }]
      : []),
    ...PRECIOS_MENSUALES.map((p) => ({
      etiqueta: p.clasesPorSemana + ' por semana ' + p.precio,
      valor: aNumero(p.precio),
    })),
  ]

  // Al cambiar el concepto o la fecha, se sugiere hasta cuándo cubre: el mes
  // entero hasta fin de mes; una clase suelta, ese mismo día. Se puede corregir.
  const elegirConcepto = (c: ConceptoPago) => {
    setConcepto(c)
    setHasta(c === 'mes' ? finDeMes(fecha) : fecha)
    setDejarAlDia(c !== 'otro')
  }
  const elegirFecha = (f: string) => {
    setFecha(f)
    if (concepto === 'mes' && f) setHasta(finDeMes(f))
    if (concepto === 'clase' && f) setHasta(f)
  }

  const confirmar = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    const montoNum = monto.trim() === '' ? null : Number(monto.replace(',', '.'))
    if (montoNum !== null && (!Number.isFinite(montoNum) || montoNum < 0)) {
      setError('El monto tiene que ser un número.')
      return
    }
    if (dejarAlDia && !hasta) {
      setError('Indicá hasta cuándo cubre el pago.')
      return
    }

    setEnviando(true)
    try {
      await registrarPagoManual({
        alumnaId: alumna.id,
        monto: montoNum,
        medio,
        concepto,
        nota,
        fecha,
        hasta: hasta || null,
        dejarAlDia,
      })
      onRegistrado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago.')
      setEnviando(false)
    }
  }

  return (
    <form className="form-caja registrar-pago" onSubmit={confirmar}>
      <p>
        <strong>Cargar un pago de {alumna.nombre.trim() || 'la alumna'}</strong>
        <br />
        <span className="ayuda">
          Con la fecha en que se pagó de verdad: queda en ese mes en el resumen de Cobros.
        </span>
      </p>

      <div className="grilla-campos">
        <div>
          <label htmlFor={'pm-fecha-' + alumna.id}>Fecha del pago</label>
          <input
            id={'pm-fecha-' + alumna.id}
            type="date"
            value={fecha}
            max={hoy}
            onChange={(e) => elegirFecha(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor={'pm-concepto-' + alumna.id}>Qué pagó</label>
          <select
            id={'pm-concepto-' + alumna.id}
            value={concepto}
            onChange={(e) => elegirConcepto(e.target.value as ConceptoPago)}
          >
            {(Object.keys(ETIQUETA_CONCEPTO) as ConceptoPago[]).map((c) => (
              <option key={c} value={c}>
                {ETIQUETA_CONCEPTO[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {atajos.length > 0 && (
        <div className="filtros-clientes" role="group" aria-label="Montos habituales">
          {atajos.map((a) => (
            <button
              key={a.etiqueta}
              type="button"
              className={monto === String(a.valor) ? 'chip activo' : 'chip'}
              onClick={() => setMonto(String(a.valor))}
            >
              {a.etiqueta}
            </button>
          ))}
        </div>
      )}

      <div className="grilla-campos">
        <div>
          <label htmlFor={'pm-monto-' + alumna.id}>Monto (opcional)</label>
          <input
            id={'pm-monto-' + alumna.id}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="decimal"
            placeholder="$"
          />
        </div>
        <div>
          <label htmlFor={'pm-medio-' + alumna.id}>Medio</label>
          <select
            id={'pm-medio-' + alumna.id}
            value={medio}
            onChange={(e) => setMedio(e.target.value as MedioPago)}
          >
            {(Object.keys(ETIQUETA_MEDIO) as MedioPago[]).map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_MEDIO[m]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="deslinde-check">
        <input
          type="checkbox"
          checked={dejarAlDia}
          onChange={(e) => setDejarAlDia(e.target.checked)}
        />
        <span>Dejarla al día: puede reservar hasta la fecha que indiques</span>
      </label>

      {dejarAlDia && (
        <div>
          <label htmlFor={'pm-hasta-' + alumna.id}>Cubre turnos hasta</label>
          <input
            id={'pm-hasta-' + alumna.id}
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            required
          />
          {hasta && <span className="ayuda"> Hasta el {diaMes(hasta)}.</span>}
        </div>
      )}

      <label htmlFor={'pm-nota-' + alumna.id}>Nota (opcional)</label>
      <input
        id={'pm-nota-' + alumna.id}
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Ej: pagó en el estudio, 2 clases por semana"
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

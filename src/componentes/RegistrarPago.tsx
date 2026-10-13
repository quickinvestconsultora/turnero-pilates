import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Perfil } from '../tipos'
import { ETIQUETA_MEDIO, registrarPago } from '../servicios/clientes'
import type { MedioPago } from '../servicios/clientes'
import { PRECIO_CLASE_SUELTA, PRECIOS_MENSUALES } from '../config/precios'
import { diaMes } from '../cuenta'
import { finDeMes, hoyIso } from '../fechas'

export type ModoPago = 'este-mes' | 'sumar'

// Los precios de config/precios.ts vienen como texto ("$45.000"): nos quedamos
// con el número para poder usarlos como atajos.
function aNumero(texto: string): number {
  return Number(texto.replace(/\D/g, ''))
}

// Panel con el que el staff confirma un cobro: deja a la alumna "al día", cubre
// hasta fin de este mes (o suma un mes más) y guarda el pago en el historial.
export default function RegistrarPago({
  cliente,
  modo,
  onRegistrado,
  onCerrar,
}: {
  cliente: Pick<Perfil, 'id' | 'nombre' | 'al_dia_hasta'>
  modo: ModoPago
  onRegistrado: () => void
  onCerrar: () => void
}) {
  const [monto, setMonto] = useState('')
  const [medio, setMedio] = useState<MedioPago>('transferencia')
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const hoy = hoyIso()
  const base = cliente.al_dia_hasta && cliente.al_dia_hasta > hoy ? cliente.al_dia_hasta : hoy
  const hasta = modo === 'este-mes' ? finDeMes(hoy) : finDeMes(base, 1)

  const atajos: { etiqueta: string; valor: number }[] = [
    ...(PRECIO_CLASE_SUELTA
      ? [{ etiqueta: `Clase ${PRECIO_CLASE_SUELTA}`, valor: aNumero(PRECIO_CLASE_SUELTA) }]
      : []),
    ...PRECIOS_MENSUALES.map((p) => ({
      etiqueta: `${p.clasesPorSemana} por semana ${p.precio}`,
      valor: aNumero(p.precio),
    })),
  ]

  const confirmar = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    const montoNum = monto.trim() === '' ? null : Number(monto.replace(',', '.'))
    if (montoNum !== null && (!Number.isFinite(montoNum) || montoNum < 0)) {
      setError('El monto tiene que ser un número.')
      return
    }

    setEnviando(true)
    try {
      await registrarPago({ alumnaId: cliente.id, monto: montoNum, medio, nota, hasta })
      onRegistrado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago.')
      setEnviando(false)
    }
  }

  return (
    <form className="form-caja registrar-pago" onSubmit={confirmar}>
      <p>
        <strong>Registrar pago de {cliente.nombre.trim() || 'la alumna'}</strong>
        <br />
        <span className="ayuda">
          Queda al día y cubre turnos hasta el <strong>{diaMes(hasta)}</strong>.
        </span>
      </p>

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
          <label htmlFor={`pg-monto-${cliente.id}`}>Monto (opcional)</label>
          <input
            id={`pg-monto-${cliente.id}`}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="decimal"
            placeholder="$"
          />
        </div>
        <div>
          <label htmlFor={`pg-medio-${cliente.id}`}>Medio</label>
          <select
            id={`pg-medio-${cliente.id}`}
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

      <label htmlFor={`pg-nota-${cliente.id}`}>Nota (opcional)</label>
      <input
        id={`pg-nota-${cliente.id}`}
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Ej: pagó 2 clases por semana"
      />

      {error && <p className="mensaje-error">{error}</p>}
      <div className="barra-acciones">
        <button type="submit" disabled={enviando}>
          {enviando ? 'Guardando...' : 'Confirmar pago'}
        </button>
        <button type="button" className="link-secundario" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

import { useState } from 'react'
import { crearPagoMp } from '../servicios/pagosMp'
import type { PlanMp } from '../servicios/pagosMp'
import { PRECIO_CLASE_SUELTA, PRECIOS_MENSUALES } from '../config/precios'

type Opcion = { plan: PlanMp; etiqueta: string; precio: string }

// Pago online con Mercado Pago: la alumna elige qué paga y la app la lleva a la
// pantalla de pago; al aprobarse, su cuenta queda al día sola.
export default function PagarOnline() {
  const opciones: Opcion[] = [
    ...PRECIOS_MENSUALES.map((p) => ({
      plan: `mes-${p.clasesPorSemana}` as PlanMp,
      etiqueta: `Mes · ${p.clasesPorSemana} ${p.clasesPorSemana === 1 ? 'vez' : 'veces'} por semana`,
      precio: p.precio,
    })),
    ...(PRECIO_CLASE_SUELTA ? [{ plan: 'clase' as PlanMp, etiqueta: 'Una clase suelta', precio: PRECIO_CLASE_SUELTA }] : []),
  ]

  const [plan, setPlan] = useState<PlanMp | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  if (opciones.length === 0) return null

  const elegida = opciones.find((o) => o.plan === plan) ?? null

  const pagar = async () => {
    if (!plan) return
    setError('')
    setEnviando(true)
    try {
      window.location.href = await crearPagoMp(plan)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo preparar el pago.')
      setEnviando(false)
    }
  }

  return (
    <div className="pagar-online">
      <p className="pagar-online-titulo">¿Qué querés pagar?</p>
      <div className="pagar-online-opciones" role="radiogroup" aria-label="Qué querés pagar">
        {opciones.map((o) => (
          <button
            key={o.plan}
            type="button"
            role="radio"
            aria-checked={plan === o.plan}
            className={plan === o.plan ? 'chip activo' : 'chip'}
            onClick={() => setPlan(o.plan)}
          >
            {o.etiqueta} · {o.precio}
          </button>
        ))}
      </div>
      <button type="button" disabled={!elegida || enviando} onClick={pagar}>
        {enviando ? 'Abriendo Mercado Pago...' : elegida ? `Pagar ${elegida.precio} con Mercado Pago` : 'Elegí una opción'}
      </button>
      {error && <p className="mensaje-error">{error}</p>}
      <p className="ayuda">
        Pagás en la pantalla segura de Mercado Pago (tarjeta, dinero en cuenta u otros medios). Cuando se aprueba, tu
        cuenta queda al día sola.
      </p>
    </div>
  )
}

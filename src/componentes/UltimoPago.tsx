import { useEffect, useState } from 'react'
import type { Perfil } from '../tipos'
import { misPagos } from '../servicios/miCuenta'
import type { PagoMio } from '../servicios/miCuenta'
import type { ConceptoPago, MedioPago } from '../servicios/clientes'
import BotonRecibo from './BotonRecibo'

const formatoPesos = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

// Renglón en la pantalla principal de la alumna con su último pago y el recibo
// para descargar o compartir, sin tener que entrar a "Mi cuenta". No se muestra
// si todavía no tiene pagos.
export default function UltimoPago({
  perfil,
  onVerTodos,
}: {
  perfil: Perfil
  onVerTodos: () => void
}) {
  const [pago, setPago] = useState<PagoMio | null>(null)

  useEffect(() => {
    misPagos()
      .then((lista) => setPago(lista[0] ?? null))
      .catch(() => setPago(null))
  }, [perfil.al_dia_hasta, perfil.estado_cuenta])

  if (!pago) return null

  return (
    <div className="ultimo-pago">
      <span>
        Tu último pago:{' '}
        <strong>{pago.monto === null ? 'sin monto' : formatoPesos(pago.monto)}</strong> el{' '}
        {new Date(pago.fecha).toLocaleDateString('es-AR')}.
      </span>
      <span className="acciones-pago">
        <BotonRecibo
          datos={{
            numero: pago.numero ?? null,
            fecha: pago.fecha,
            alumna: `${perfil.nombre} ${perfil.apellido}`.trim(),
            dni: perfil.dni,
            concepto: (pago.concepto as ConceptoPago | null) ?? 'mes',
            monto: pago.monto,
            medio: pago.medio as MedioPago,
            abonoHasta: pago.abono_hasta,
          }}
        />
        <button type="button" className="link-secundario" onClick={onVerTodos}>
          Ver todos mis pagos
        </button>
      </span>
    </div>
  )
}

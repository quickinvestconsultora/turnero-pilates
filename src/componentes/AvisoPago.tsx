import type { Perfil } from '../tipos'
import OpcionesPago from './OpcionesPago'

// Cartel para la alumna cuando el staff la marcó como "pendiente" de pago.
export default function AvisoPago({ perfil }: { perfil: Perfil }) {
  if (perfil.estado_cuenta !== 'pendiente') return null

  return (
    <div className="aviso-pago">
      <p>
        <strong>Tenés un pago pendiente.</strong> Podés regularizarlo así:
      </p>
      <OpcionesPago perfil={perfil} />
    </div>
  )
}

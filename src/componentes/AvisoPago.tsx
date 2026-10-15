import type { Perfil } from '../tipos'
import OpcionesPago from './OpcionesPago'
import SubirComprobante from './SubirComprobante'
import { abonoVencido, diaMes } from '../cuenta'

// Cartel para la alumna cuando el staff la marcó como "pendiente" de pago o
// cuando su abono mensual ya venció.
export default function AvisoPago({
  perfil,
  onComprobante,
}: {
  perfil: Perfil
  onComprobante: () => void
}) {
  const vencido = abonoVencido(perfil)
  if (perfil.estado_cuenta !== 'pendiente' && !vencido) return null

  return (
    <div className="aviso-pago">
      <p>
        {vencido && perfil.al_dia_hasta ? (
          <>
            <strong>Tu abono venció el {diaMes(perfil.al_dia_hasta)}.</strong> Para reservar más
            turnos, renovalo así:
          </>
        ) : (
          <>
            <strong>Tenés un pago pendiente.</strong> Para reservar más turnos, abonalo así:
          </>
        )}
      </p>
      <OpcionesPago perfil={perfil} />
      <SubirComprobante alumnaId={perfil.id} onSubido={onComprobante} />
    </div>
  )
}

import type { Perfil } from '../tipos'
import OpcionesPago from './OpcionesPago'
import PreciosInfo from './PreciosInfo'
import SubirComprobante from './SubirComprobante'
import { diaMes } from '../cuenta'

type Props = {
  perfil: Perfil
  onCerrar: () => void
  onComprobante: () => void
}

// Aparece cuando reservar_turno() rechaza la reserva con 'PAGO_REQUERIDO':
// ya usó la clase de prueba gratis, o el staff la marcó como pendiente.
export default function ModalPago({ perfil, onCerrar, onComprobante }: Props) {
  const debe = perfil.estado_cuenta === 'pendiente'
  const abonoCorto = perfil.estado_cuenta === 'al_dia' && perfil.al_dia_hasta

  const titulo = debe
    ? 'Tenés un pago pendiente'
    : abonoCorto
      ? 'Tu abono no cubre este turno'
      : 'Ya reservaste tu clase de prueba'
  const subtitulo = debe
    ? 'Para reservar más turnos primero hay que regularizarlo. Elegí cómo pagar:'
    : abonoCorto
      ? `Tu abono cubre hasta el ${diaMes(perfil.al_dia_hasta!)}. Para reservar turnos de después, renovalo. Elegí cómo pagar:`
      : 'Para reservar más turnos tenés que abonar la clase o el mes. Elegí cómo pagar:'

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{titulo}</h2>
        <p className="subtitulo">{subtitulo}</p>
        <PreciosInfo />
        <OpcionesPago perfil={perfil} />
        <SubirComprobante alumnaId={perfil.id} onSubido={onComprobante} />
        <p className="ayuda">
          Cuando pagues, avisale al estudio para que confirme tu pago y te habilite los turnos.
        </p>
        <div className="modal-botones">
          <button type="button" className="link-secundario" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

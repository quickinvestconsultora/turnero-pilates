import type { Perfil } from '../tipos'
import OpcionesPago from './OpcionesPago'
import PreciosInfo from './PreciosInfo'
import SubirComprobante from './SubirComprobante'
import { diaMes } from '../cuenta'

type Props = {
  perfil: Perfil
  // 'mes': quiso reservar todos los turnos de un mes y todavía no tiene el mes abonado.
  motivo?: 'turno' | 'mes'
  onCerrar: () => void
  onComprobante: () => void
}

// Aparece cuando reservar_turno() rechaza la reserva con 'PAGO_REQUERIDO':
// todavía no abonó, ya usó la clase de prueba, o el staff la marcó como pendiente.
export default function ModalPago({ perfil, motivo = 'turno', onCerrar, onComprobante }: Props) {
  const debe = perfil.estado_cuenta === 'pendiente'
  const abonoCorto = perfil.estado_cuenta === 'al_dia' && perfil.al_dia_hasta

  const titulo = debe
    ? 'Tenés un pago pendiente'
    : abonoCorto
      ? 'Tu abono no cubre este turno'
      : motivo === 'mes'
        ? 'Para reservar todo el mes tenés que abonarlo'
        : 'Para reservar tenés que abonar'
  const subtitulo = debe
    ? 'Para reservar más turnos primero hay que regularizarlo. Elegí cómo pagar:'
    : abonoCorto
      ? `Tu abono cubre hasta el ${diaMes(perfil.al_dia_hasta!)}. Para reservar turnos de después, renovalo. Elegí cómo pagar:`
      : motivo === 'mes'
        ? 'Reservar todos los turnos del mes es para quien ya pagó el mes. Pagá con transferencia al alias o con Mercado Pago y avisanos para que te lo habiliten:'
        : 'Abonás la clase o el mes y ya podés reservar. Elegí cómo pagar:'

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

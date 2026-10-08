import type { Perfil } from '../tipos'
import OpcionesPago from './OpcionesPago'
import PreciosInfo from './PreciosInfo'

type Props = {
  perfil: Perfil
  onCerrar: () => void
}

// Aparece cuando reservar_turno() rechaza la reserva con 'PAGO_REQUERIDO':
// ya usó la clase de prueba gratis, o el staff la marcó como pendiente.
export default function ModalPago({ perfil, onCerrar }: Props) {
  const debe = perfil.estado_cuenta === 'pendiente'

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{debe ? 'Tenés un pago pendiente' : 'Ya reservaste tu clase de prueba'}</h2>
        <p className="subtitulo">
          {debe
            ? 'Para reservar más turnos primero hay que regularizarlo. Elegí cómo pagar:'
            : 'Para reservar más turnos tenés que abonar la clase o el mes. Elegí cómo pagar:'}
        </p>
        <PreciosInfo />
        <OpcionesPago perfil={perfil} />
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

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
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Necesitás abonar para reservar</h2>
        <p className="subtitulo">
          Para reservar este turno tenés que regularizar el pago primero. Podés hacerlo así:
        </p>
        <PreciosInfo />
        <OpcionesPago perfil={perfil} />
        <p className="ayuda">
          En cuanto el estudio confirme tu pago vas a poder elegir turnos con normalidad.
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

import type { Perfil } from '../tipos'
import { EMAIL_ADMINISTRACION } from '../config/pagos'
import OpcionesPago from './OpcionesPago'
import PreciosInfo from './PreciosInfo'

type Props = {
  perfil: Perfil
  onCerrar: () => void
}

// Aparece justo después de reservar la primera clase: es la clase de prueba y
// es gratis, pero para reservar la siguiente hay que abonar la cuota. Es solo
// una advertencia: la reserva ya quedó hecha.
export default function AvisoPrimeraClase({ perfil, onCerrar }: Props) {
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>¡Reservaste tu clase de prueba!</h2>
        <p className="subtitulo">
          Esta es tu <strong>clase de prueba</strong> y es gratis. Para poder reservar la
          siguiente clase vas a necesitar abonar la cuota.
        </p>
        <PreciosInfo />
        <OpcionesPago perfil={perfil} />
        <p className="ayuda">
          Si ya abonaste, avisá en administración para que lo registren:{' '}
          <a href={`mailto:${EMAIL_ADMINISTRACION}`}>{EMAIL_ADMINISTRACION}</a>
        </p>
        <div className="modal-botones">
          <button type="button" onClick={onCerrar}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}

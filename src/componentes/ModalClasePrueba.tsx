import type { Perfil } from '../tipos'
import OpcionesPago from './OpcionesPago'
import PreciosInfo from './PreciosInfo'

type Props = {
  perfil: Perfil
  onCerrar: () => void
}

// Aparece una sola vez, justo después de la primera reserva de la alumna
// (la clase de prueba gratis) — ver 'primera_clase' en reservar_turno().
export default function ModalClasePrueba({ perfil, onCerrar }: Props) {
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>¡Reservaste tu clase de prueba!</h2>
        <p className="subtitulo">
          Esta clase es gratis. Para reservar otro turno vas a tener que abonar la clase
          (con la reserva previa) o el mes completo por transferencia.
        </p>
        <PreciosInfo />
        <OpcionesPago perfil={perfil} />
        <div className="modal-botones">
          <button type="button" onClick={onCerrar}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}

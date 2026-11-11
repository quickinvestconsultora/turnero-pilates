import { diaSemanaPlural, horaCorta } from '../fechas'

// Se muestra apenas la alumna reserva un turno que sale de un turno fijo: le ofrece quedarse
// fija en ese día y horario (se anota sola en los turnos nuevos).
export default function PreguntaFija({
  fecha,
  hora,
  ocupada,
  onSi,
  onNo,
}: {
  fecha: string
  hora: string
  ocupada: boolean
  onSi: () => void
  onNo: () => void
}) {
  return (
    <div className="modal-fondo" onClick={onNo}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>¡Turno reservado!</h2>
        <p className="subtitulo">
          ¿Querés dejarlo <strong>fijo</strong> todos los {diaSemanaPlural(fecha)} a las {horaCorta(hora)}?
        </p>
        <p className="ayuda">
          Te anotamos sola en cada turno nuevo de ese día y horario, mientras tu abono lo cubra y haya lugar.
          Si un día no podés venir, cancelás ese turno. Lo podés sacar cuando quieras desde "Mis turnos".
        </p>
        <div className="modal-botones">
          <button type="button" disabled={ocupada} onClick={onSi}>
            {ocupada ? 'Un momento...' : 'Sí, dejarlo fijo'}
          </button>
          <button type="button" className="link-secundario" disabled={ocupada} onClick={onNo}>
            No, solo este
          </button>
        </div>
      </div>
    </div>
  )
}

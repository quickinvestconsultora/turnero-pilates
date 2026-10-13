import type { TurnoDisponible } from '../tipos'
import { encabezadoDia, horaCorta } from '../fechas'

// Aparece cuando una alumna estaba en lista de espera y se liberó un lugar: la
// base la anotó sola y acá se lo contamos, una sola vez.
export default function AvisoPromocion({
  turnos,
  onEntendido,
}: {
  turnos: TurnoDisponible[]
  onEntendido: () => void
}) {
  if (turnos.length === 0) return null

  return (
    <div className="aviso-promocion" role="status">
      <p>
        <strong>¡Se liberó un lugar!</strong> Estabas en lista de espera y ya quedaste anotada en:
      </p>
      <ul>
        {turnos.map((t) => (
          <li key={t.id}>
            {encabezadoDia(t.fecha)} a las {horaCorta(t.hora)}
          </li>
        ))}
      </ul>
      <button type="button" onClick={onEntendido}>
        Entendido
      </button>
    </div>
  )
}

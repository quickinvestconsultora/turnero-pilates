import { EMAIL_ADMINISTRACION } from '../config/pagos'

// Cartel que sale cuando la alumna ya usó todas las cancelaciones del mes (las reglas
// están en cancelar_reserva, en supabase/schema.sql).
export default function AvisoLimiteCambios({ onCerrar }: { onCerrar: () => void }) {
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Ya no podés cancelar más turnos este mes</h2>
        <p className="subtitulo">
          Llegaste al máximo de <strong>3 cancelaciones por mes</strong>. Este turno se mantiene.
        </p>
        <p className="ayuda">
          Si de verdad no podés venir, escribile al estudio:{' '}
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

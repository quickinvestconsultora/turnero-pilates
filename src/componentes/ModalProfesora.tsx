import type { Profesora } from '../tipos'
import FotoProfe from './FotoProfe'

// Lo que ven las alumnas al tocar el nombre de la profesora en un turno.
export default function ModalProfesora({
  profesora,
  onCerrar,
}: {
  profesora: Profesora
  onCerrar: () => void
}) {
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal modal-profesora" onClick={(e) => e.stopPropagation()}>
        <FotoProfe url={profesora.foto_url} nombre={profesora.nombre} tam={96} />
        <h2>{profesora.nombre}</h2>
        <p className="etiqueta-rol">Profesora</p>
        <p className="profesora-bio">
          {profesora.bio || 'Todavía no cargó su descripción.'}
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

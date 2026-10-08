import type { Profesora } from '../tipos'
import TarjetaProfesora from './TarjetaProfesora'

// Lo que ven las alumnas al tocar el nombre de la profesora en un turno.
export default function ModalProfesora({
  profesora,
  fotos,
  onCerrar,
}: {
  profesora: Profesora
  fotos: string[]
  onCerrar: () => void
}) {
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal modal-profesora" onClick={(e) => e.stopPropagation()}>
        <TarjetaProfesora profesora={profesora} fotos={fotos} />
        <div className="modal-botones">
          <button type="button" className="link-secundario" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

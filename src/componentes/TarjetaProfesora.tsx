import type { Profesora } from '../tipos'
import FotoProfe from './FotoProfe'

// La ficha de la profesora tal como la ven las alumnas. La usa el modal que
// se abre desde un turno y la vista previa de "Mi perfil".
export default function TarjetaProfesora({
  profesora,
  fotos = [],
}: {
  profesora: Profesora
  fotos?: string[]
}) {
  const especialidades = (profesora.especialidades ?? '')
    .split(/[,\n]/)
    .map((e) => e.trim())
    .filter(Boolean)

  const sinNada =
    !profesora.bio && !profesora.formacion && !profesora.frase && especialidades.length === 0

  return (
    <div className="tarjeta-profesora">
      <FotoProfe url={profesora.foto_url} nombre={profesora.nombre || 'Profe'} tam={96} />
      <h2>{profesora.nombre || 'Profesora'}</h2>
      <p className="etiqueta-rol">
        Profesora
        {profesora.experiencia ? ` · ${profesora.experiencia}` : ''}
      </p>

      {profesora.frase && <p className="profesora-frase">“{profesora.frase}”</p>}

      {especialidades.length > 0 && (
        <ul className="profesora-chips">
          {especialidades.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {profesora.bio && (
        <section className="profesora-seccion">
          <h3>Sobre mí</h3>
          <p>{profesora.bio}</p>
        </section>
      )}

      {profesora.formacion && (
        <section className="profesora-seccion">
          <h3>Formación</h3>
          <p>{profesora.formacion}</p>
        </section>
      )}

      {fotos.length > 0 && (
        <div className="profesora-galeria">
          {fotos.map((url) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer">
              <img src={url} alt={`Foto de ${profesora.nombre || 'la profesora'}`} loading="lazy" />
            </a>
          ))}
        </div>
      )}

      {sinNada && fotos.length === 0 && <p className="ayuda">Todavía no cargó su descripción.</p>}

      {profesora.instagram && (
        <a
          className="profesora-instagram"
          href={`https://instagram.com/${profesora.instagram}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          @{profesora.instagram}
        </a>
      )}
    </div>
  )
}

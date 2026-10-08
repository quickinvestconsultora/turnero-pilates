// Foto redonda de una profesora; si todavía no subió una, muestra su inicial.
export default function FotoProfe({
  url,
  nombre,
  tam = 72,
}: {
  url: string | null
  nombre: string
  tam?: number
}) {
  const estilo = { width: tam, height: tam, fontSize: tam * 0.42 }

  if (url) {
    return <img className="foto-profe" style={estilo} src={url} alt={`Foto de ${nombre}`} />
  }
  return (
    <span className="foto-profe foto-profe--inicial" style={estilo} aria-hidden="true">
      {(nombre.trim()[0] ?? '?').toUpperCase()}
    </span>
  )
}

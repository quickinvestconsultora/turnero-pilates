import { useEffect, useState } from 'react'
import { urlFicha } from '../servicios/ficha'
import FotoProfe from './FotoProfe'

// Foto de la alumna (opcional, en un bucket privado): pide un link temporal y
// la muestra; si no tiene o falla, queda la inicial de su nombre.
export default function FotoAlumna({
  ruta,
  nombre,
  tam = 64,
}: {
  ruta: string | null
  nombre: string
  tam?: number
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    if (!ruta) {
      setUrl(null)
      return
    }
    urlFicha(ruta)
      .then((u) => vigente && setUrl(u))
      .catch(() => vigente && setUrl(null))
    return () => {
      vigente = false
    }
  }, [ruta])

  return <FotoProfe url={url} nombre={nombre || '?'} tam={tam} />
}

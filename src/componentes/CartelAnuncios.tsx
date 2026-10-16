import { useEffect, useState } from 'react'
import { listarAnuncios } from '../servicios/gestion'
import type { Anuncio } from '../servicios/gestion'

const CLAVE = 'forteva-anuncios-cerrados'

function leerCerrados(): string[] {
  try {
    const texto = localStorage.getItem(CLAVE)
    const lista = texto ? JSON.parse(texto) : []
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

// Carteles del estudio (feriados, cambios de horario, novedades) arriba de la
// pantalla de alumnas y profesoras. Cada persona los puede cerrar; vuelven a
// aparecer solo si el estudio publica uno nuevo. La base entrega únicamente los
// vigentes que le corresponden a cada rol.
export default function CartelAnuncios() {
  const [anuncios, setAnuncios] = useState<Anuncio[]>([])
  const [cerrados, setCerrados] = useState<string[]>(leerCerrados)

  useEffect(() => {
    listarAnuncios()
      .then(setAnuncios)
      .catch(() => setAnuncios([]))
  }, [])

  const cerrar = (id: string) => {
    const nuevos = [...cerrados, id]
    setCerrados(nuevos)
    try {
      localStorage.setItem(CLAVE, JSON.stringify(nuevos.slice(-50)))
    } catch {
      // Sin almacenamiento: vuelve a aparecer al recargar, no pasa nada.
    }
  }

  const visibles = anuncios.filter((a) => !cerrados.includes(a.id))
  if (visibles.length === 0) return null

  return (
    <div className="anuncios">
      {visibles.map((a) => (
        <div key={a.id} className={a.importante ? 'anuncio anuncio--importante' : 'anuncio'} role="note">
          <div className="anuncio-texto">
            {a.titulo && <strong>{a.titulo}</strong>}
            <p>{a.mensaje}</p>
          </div>
          <button type="button" className="anuncio-cerrar" onClick={() => cerrar(a.id)} aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { NOTA_CLASE_SUELTA, PRECIO_CLASE_SUELTA, PRECIOS_MENSUALES } from '../config/precios'
import { urlFotoPrecios } from '../servicios/precios'

// Si el estudio cargó la foto con los precios (Administración → Más → Precios), se muestra
// esa; si no, la lista de config/precios.ts. Si tampoco hay nada cargado, no se muestra nada.
export default function PreciosInfo() {
  const [foto, setFoto] = useState<string | null>(null)

  useEffect(() => {
    urlFotoPrecios()
      .then(setFoto)
      .catch(() => setFoto(null))
  }, [])

  if (foto) {
    return (
      <div className="precios-foto">
        <a href={foto} target="_blank" rel="noopener noreferrer">
          <img src={foto} alt="Valores de FORTEVA Studio" />
        </a>
        <p className="ayuda">Tocá la imagen para verla más grande.</p>
      </div>
    )
  }

  if (!PRECIO_CLASE_SUELTA && PRECIOS_MENSUALES.length === 0) return null

  return (
    <div className="precios-info">
      {PRECIOS_MENSUALES.map(({ clasesPorSemana, precio }) => (
        <p key={clasesPorSemana}>
          {clasesPorSemana} {clasesPorSemana === 1 ? 'vez' : 'veces'} por semana: <strong>{precio}</strong> por mes
        </p>
      ))}
      {PRECIO_CLASE_SUELTA && (
        <p>
          Clase de prueba: <strong>{PRECIO_CLASE_SUELTA}</strong>
          {NOTA_CLASE_SUELTA ? ` (${NOTA_CLASE_SUELTA})` : ''}
        </p>
      )}
    </div>
  )
}

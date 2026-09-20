import { PRECIO_CLASE_SUELTA, PRECIO_MES } from '../config/precios'

// Se muestra solo si el estudio ya cargó algún valor en config/precios.ts.
export default function PreciosInfo() {
  if (!PRECIO_CLASE_SUELTA && !PRECIO_MES) return null

  return (
    <div className="precios-info">
      {PRECIO_CLASE_SUELTA && (
        <p>
          Clase suelta: <strong>{PRECIO_CLASE_SUELTA}</strong>
        </p>
      )}
      {PRECIO_MES && (
        <p>
          Mes completo: <strong>{PRECIO_MES}</strong>
        </p>
      )}
    </div>
  )
}

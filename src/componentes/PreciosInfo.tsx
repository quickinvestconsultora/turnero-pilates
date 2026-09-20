import { PRECIO_CLASE_SUELTA, PRECIOS_MENSUALES } from '../config/precios'

// Se muestra solo si el estudio ya cargó algún valor en config/precios.ts.
export default function PreciosInfo() {
  if (!PRECIO_CLASE_SUELTA && PRECIOS_MENSUALES.length === 0) return null

  return (
    <div className="precios-info">
      {PRECIO_CLASE_SUELTA && (
        <p>
          Clase suelta: <strong>{PRECIO_CLASE_SUELTA}</strong>
        </p>
      )}
      {PRECIOS_MENSUALES.map(({ clasesPorSemana, precio }) => (
        <p key={clasesPorSemana}>
          {clasesPorSemana} clase{clasesPorSemana === 1 ? '' : 's'} por semana:{' '}
          <strong>{precio}</strong> por mes
        </p>
      ))}
    </div>
  )
}

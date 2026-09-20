import { useCallback, useEffect, useState } from 'react'
import type { Estadisticas as EstadisticasTipo } from '../tipos'
import { DIAS_PERIODO, obtenerEstadisticas } from '../servicios/estadisticas'
import { NOMBRE_DIA, horaCorta } from '../fechas'

export default function Estadisticas() {
  const [datos, setDatos] = useState<EstadisticasTipo | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      setDatos(await obtenerEstadisticas())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las estadísticas.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (cargando) return <p className="vacio">Cargando...</p>
  if (error) return <p className="mensaje-error">{error}</p>
  if (!datos) return null

  const ocupacion = datos.cupo_total > 0 ? (datos.reservas_totales / datos.cupo_total) * 100 : 0
  const marcadas = datos.asistieron + datos.ausentes
  const ausentismo = marcadas > 0 ? (datos.ausentes / marcadas) * 100 : null

  return (
    <div>
      <h2>Últimos {DIAS_PERIODO} días</h2>

      <div className="kpi-grid">
        <div className="kpi">
          <span className="kpi-valor">{datos.turnos_dictados}</span>
          <span className="kpi-etiqueta">Turnos dictados</span>
        </div>
        <div className="kpi">
          <span className="kpi-valor">{Math.round(ocupacion)}%</span>
          <span className="kpi-etiqueta">Ocupación promedio</span>
        </div>
        <div className="kpi">
          <span className="kpi-valor">{datos.alumnas_activas}</span>
          <span className="kpi-etiqueta">Alumnas activas</span>
        </div>
        <div className="kpi">
          <span className="kpi-valor">{ausentismo === null ? '—' : `${Math.round(ausentismo)}%`}</span>
          <span className="kpi-etiqueta">Ausentismo</span>
        </div>
      </div>

      {marcadas === 0 && (
        <p className="ayuda">
          El ausentismo se calcula con lo que se carga en Agenda → Cargar asistencia. Todavía no
          hay nada marcado en este período.
        </p>
      )}

      <h3 className="subtitulo-seccion">Ocupación por horario</h3>
      {datos.por_horario.length === 0 ? (
        <p className="vacio">No hubo turnos dictados en este período.</p>
      ) : (
        <ul className="lista-estadistica">
          {datos.por_horario.map((h) => {
            const pct = h.cupo_total > 0 ? Math.round((h.reservas / h.cupo_total) * 100) : 0
            return (
              <li key={`${h.dia_semana}-${h.hora}`}>
                <span className="lista-estadistica-etiqueta">
                  {NOMBRE_DIA[h.dia_semana]} {horaCorta(h.hora)}
                  <span className="turno-detalle">
                    {' '}
                    · {h.turnos} clase{h.turnos === 1 ? '' : 's'}
                  </span>
                </span>
                <span className="barra-ocupacion">
                  <span className="barra-ocupacion-relleno" style={{ width: `${Math.min(pct, 100)}%` }} />
                </span>
                <span className="lista-estadistica-valor">{pct}%</span>
              </li>
            )
          })}
        </ul>
      )}

      {datos.ausencias_por_alumna.length > 0 && (
        <>
          <h3 className="subtitulo-seccion">Ausencias</h3>
          <ul className="lista-estadistica">
            {datos.ausencias_por_alumna.map((a) => (
              <li key={a.nombre}>
                <span className="lista-estadistica-etiqueta">{a.nombre}</span>
                <span className="lista-estadistica-valor">
                  {a.ausencias} falta{a.ausencias === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

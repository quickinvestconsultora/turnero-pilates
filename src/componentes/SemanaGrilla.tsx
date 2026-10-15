import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TurnoConReservas } from '../tipos'
import { listarTurnosStaff } from '../servicios/agenda'
import {
  NOMBRE_DIA_CORTO,
  fechaCorta,
  horaCorta,
  hoyIso,
  lunesDeLaSemana,
  sumarDias,
} from '../fechas'

// Agenda de la semana en grilla (días en columnas, horarios en filas) para ver
// de un vistazo qué horarios están llenos y cuáles tienen lugar. En el celular
// se desliza hacia los costados.
export default function SemanaGrilla({ instructoraId }: { instructoraId?: string }) {
  const [semana, setSemana] = useState(0) // 0 = esta semana, 1 = la que viene…
  const [turnos, setTurnos] = useState<TurnoConReservas[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const lunes = useMemo(() => sumarDias(lunesDeLaSemana(hoyIso()), semana * 7), [semana])
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)), [lunes])

  const cargar = useCallback(async () => {
    setError('')
    setCargando(true)
    try {
      setTurnos(await listarTurnosStaff({ desde: lunes, dias: 6 }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la semana.')
    } finally {
      setCargando(false)
    }
  }, [lunes])

  useEffect(() => {
    cargar()
  }, [cargar])

  const horas = useMemo(
    () => [...new Set(turnos.map((t) => horaCorta(t.hora)))].sort(),
    [turnos],
  )
  const porCelda = useMemo(() => {
    const mapa = new Map<string, TurnoConReservas>()
    for (const t of turnos) mapa.set(`${t.fecha}|${horaCorta(t.hora)}`, t)
    return mapa
  }, [turnos])

  const ocupados = (t: TurnoConReservas) =>
    t.reservas.filter((r) => r.estado === 'reservada').length + (t.reservas_invitadas?.length ?? 0)

  const hoy = hoyIso()

  return (
    <div>
      <div className="fila-titulo">
        <h2>Semana</h2>
        <div className="barra-acciones">
          <button
            type="button"
            className="link-secundario"
            disabled={semana <= -4}
            onClick={() => setSemana((s) => s - 1)}
          >
            ← Anterior
          </button>
          {semana !== 0 && (
            <button type="button" className="link-secundario" onClick={() => setSemana(0)}>
              Esta semana
            </button>
          )}
          <button
            type="button"
            className="link-secundario"
            disabled={semana >= 8}
            onClick={() => setSemana((s) => s + 1)}
          >
            Siguiente →
          </button>
        </div>
      </div>
      <p className="ayuda hoy-fecha">
        Del {fechaCorta(dias[0])} al {fechaCorta(dias[6])}
      </p>

      {error && <p className="mensaje-error">{error}</p>}

      {cargando ? (
        <p className="vacio">Cargando...</p>
      ) : horas.length === 0 ? (
        <p className="vacio">No hay turnos esta semana.</p>
      ) : (
        <>
          <div className="grilla-semana-scroll">
            <table className="grilla-semana">
              <thead>
                <tr>
                  <th aria-label="Horario" />
                  {dias.map((d, i) => (
                    <th key={d} className={d === hoy ? 'hoy' : ''}>
                      {NOMBRE_DIA_CORTO[(i + 1) % 7]}
                      <br />
                      <span>{fechaCorta(d).split(' ')[1]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {horas.map((h) => (
                  <tr key={h}>
                    <th scope="row">{h}</th>
                    {dias.map((d) => {
                      const t = porCelda.get(`${d}|${h}`)
                      if (!t) return <td key={d} className="vacia" />
                      const n = ocupados(t)
                      const estado = t.cancelado
                        ? 'cancelado'
                        : n >= t.cupo
                          ? 'lleno'
                          : t.cupo - n <= 2
                            ? 'casi'
                            : 'libre'
                      const mio = Boolean(instructoraId) && t.instructora_id === instructoraId
                      return (
                        <td key={d}>
                          <div className={`celda-turno celda-turno--${estado}${mio ? ' celda-turno--mio' : ''}`}>
                            <strong>{t.cancelado ? '—' : `${n}/${t.cupo}`}</strong>
                            <span>
                              {t.cancelado ? 'cancelado' : (t.instructor ?? '').split(' ')[0] || 'sin profe'}
                            </span>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="leyenda-grilla">
            <span className="punto-leyenda punto-leyenda--libre" /> con lugar{' '}
            <span className="punto-leyenda punto-leyenda--casi" /> casi lleno{' '}
            <span className="punto-leyenda punto-leyenda--lleno" /> completo{' '}
            <span className="punto-leyenda punto-leyenda--cancelado" /> cancelado
          </p>
        </>
      )}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import type { TurnoConReservas } from '../tipos'
import { listarTurnosStaff } from '../servicios/agenda'
import { abonoVencido } from '../cuenta'
import { fechaLarga, horaCorta, hoyIso, yaPaso } from '../fechas'
import { nombreCompleto } from '../personas'
import { mensajeTurno } from '../whatsapp'
import EnlaceWhatsApp from './EnlaceWhatsApp'
import Cumpleanos from './Cumpleanos'

// Pantalla de inicio del estudio: las clases de hoy, con quién viene a cada
// una, las lesiones a tener presentes y (solo el staff) quién tiene algo para
// regularizar. La profesora ve el detalle de sus clases y solo el conteo de
// las demás.
export default function Hoy({ instructoraId }: { instructoraId?: string }) {
  const [turnos, setTurnos] = useState<TurnoConReservas[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      setTurnos(await listarTurnosStaff({ desde: hoyIso(), dias: 0 }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el día.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const esStaff = !instructoraId
  const vigentes = turnos.filter((t) => !t.cancelado)
  const canceladas = turnos.length - vigentes.length
  const lugaresOcupados = (t: TurnoConReservas) =>
    t.reservas.filter((r) => r.estado === 'reservada').length + (t.reservas_invitadas?.length ?? 0)
  const totalAnotadas = vigentes.reduce((n, t) => n + lugaresOcupados(t), 0)

  const conPendiente = vigentes
    .flatMap((t) => t.reservas.filter((r) => r.estado === 'reservada'))
    .filter(
      (r) =>
        r.perfiles && (r.perfiles.estado_cuenta === 'pendiente' || abonoVencido(r.perfiles)),
    ).length

  return (
    <div>
      <div className="fila-titulo">
        <h2>Hoy</h2>
        <button type="button" className="link-secundario" onClick={cargar}>
          Actualizar
        </button>
      </div>
      <p className="ayuda hoy-fecha">{fechaLarga(hoyIso())}</p>

      <Cumpleanos paraProfesora={!esStaff} />

      {error && <p className="mensaje-error">{error}</p>}

      {cargando ? (
        <p className="vacio">Cargando...</p>
      ) : vigentes.length === 0 ? (
        <p className="vacio">
          No hay clases hoy{canceladas > 0 ? ` (${canceladas} cancelada${canceladas === 1 ? '' : 's'})` : ''}.
        </p>
      ) : (
        <>
          <p className="hoy-resumen">
            <strong>{vigentes.length}</strong> clase{vigentes.length === 1 ? '' : 's'} ·{' '}
            <strong>{totalAnotadas}</strong> anotada{totalAnotadas === 1 ? '' : 's'}
            {esStaff && conPendiente > 0 && (
              <>
                {' · '}
                <span className="hoy-alerta">
                  {conPendiente} con pago pendiente o abono vencido
                </span>
              </>
            )}
            {canceladas > 0 && ` · ${canceladas} cancelada${canceladas === 1 ? '' : 's'}`}
          </p>

          <div className="hoy-lista">
            {vigentes.map((t) => {
              const soloLectura = Boolean(instructoraId) && t.instructora_id !== instructoraId
              const anotadas = t.reservas.filter((r) => r.estado === 'reservada')
              const pasada = yaPaso(t.fecha, t.hora)
              return (
                <section key={t.id} className={pasada ? 'hoy-turno hoy-turno--pasado' : 'hoy-turno'}>
                  <div className="hoy-turno-cabecera">
                    <span className="turno-hora">{horaCorta(t.hora)}</span>
                    <span className="turno-detalle">
                      {lugaresOcupados(t)}/{t.cupo}
                      {pasada && ' · ya pasó'}
                    </span>
                    {t.instructor && <span className="turno-profesora">Profesora: {t.instructor}</span>}
                  </div>

                  {!soloLectura && (
                    <ul className="hoy-anotadas">
                      {lugaresOcupados(t) === 0 && <li className="vacio-inline">Nadie anotada</li>}
                      {anotadas.map((r) => {
                        const p = r.perfiles
                        return (
                          <li key={r.id}>
                            <div className="fila-anotada">
                              <span>
                                {p ? nombreCompleto(p) : 'Sin nombre'}
                                {esStaff && p?.estado_cuenta === 'prueba' && (
                                  <span className="etiqueta-prueba">Clase de prueba</span>
                                )}
                                {esStaff && p?.estado_cuenta === 'pendiente' && (
                                  <span className="etiqueta-sin-registrar">Debe</span>
                                )}
                                {esStaff && p && abonoVencido(p) && (
                                  <span className="etiqueta-sin-registrar">Abono vencido</span>
                                )}
                                {p && (
                                  <EnlaceWhatsApp
                                    telefono={p.telefono}
                                    mensaje={mensajeTurno(p.nombre, t.fecha, t.hora)}
                                  />
                                )}
                              </span>
                            </div>
                            {p?.lesiones && (
                              <p className="alerta-lesion">
                                <strong>Atención:</strong> {p.lesiones}
                              </p>
                            )}
                          </li>
                        )
                      })}
                      {(t.reservas_invitadas ?? []).map((i) => (
                        <li key={i.id}>
                          <div className="fila-anotada">
                            <span>
                              {nombreCompleto(i)}
                              <span className="etiqueta-sin-registrar">Sin registrar</span>
                              <EnlaceWhatsApp
                                telefono={i.telefono}
                                mensaje={mensajeTurno(i.nombre, t.fecha, t.hora)}
                              />
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

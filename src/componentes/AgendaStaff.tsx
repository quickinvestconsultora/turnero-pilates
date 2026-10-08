import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { TurnoConReservas } from '../tipos'
import {
  actualizarTurno,
  cancelarTurno,
  crearTurno,
  listarTurnosStaff,
  marcarAsistencia,
  marcarAsistenciaInvitada,
  quitarInvitada,
  quitarReserva,
} from '../servicios/agenda'
import { encabezadoDia, horaCorta, hoyIso, sumarDias, yaPaso } from '../fechas'
import { nombreCompleto } from '../personas'
import AgregarAlumna from './AgregarAlumna'
import CampoProfesora from './CampoProfesora'
import type { ValorProfesora } from './CampoProfesora'

// instructoraId: cuando una profesora usa esta pantalla ve toda la agenda,
// pero solo maneja (cupo, cancelar, anotadas, asistencia) los turnos suyos y
// los que crea quedan a su nombre. Sin eso (staff), maneja todo.
export default function AgendaStaff({ instructoraId }: { instructoraId?: string }) {
  const [turnos, setTurnos] = useState<TurnoConReservas[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [verPasados, setVerPasados] = useState(false)
  const [soloMios, setSoloMios] = useState(false)

  const cargar = useCallback(async () => {
    setError('')
    try {
      const periodo = verPasados ? { desde: sumarDias(hoyIso(), -7), dias: 7 } : {}
      setTurnos(
        await listarTurnosStaff({ ...periodo, instructoraId: soloMios ? instructoraId : undefined }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la agenda.')
    } finally {
      setCargando(false)
    }
  }, [verPasados, instructoraId, soloMios])

  useEffect(() => {
    setCargando(true)
    cargar()
  }, [cargar])

  const porDia = new Map<string, TurnoConReservas[]>()
  for (const t of turnos) {
    const arr = porDia.get(t.fecha) ?? []
    arr.push(t)
    porDia.set(t.fecha, arr)
  }

  return (
    <div>
      <div className="fila-titulo">
        <h2>{verPasados ? 'Última semana' : 'Próximas 3 semanas'}</h2>
        <div className="barra-acciones">
          <button
            type="button"
            className="link-secundario"
            onClick={() => setVerPasados((v) => !v)}
          >
            {verPasados ? 'Ver próximos' : 'Cargar asistencia'}
          </button>
          {instructoraId && (
            <button
              type="button"
              className="link-secundario"
              onClick={() => setSoloMios((v) => !v)}
            >
              {soloMios ? 'Ver todos' : 'Ver solo los míos'}
            </button>
          )}
          <button type="button" onClick={() => setMostrarAlta((v) => !v)}>
            {mostrarAlta ? 'Cerrar' : '+ Turno suelto'}
          </button>
        </div>
      </div>

      {mostrarAlta && (
        <FormAltaTurno
          instructoraId={instructoraId}
          onCreado={() => {
            setMostrarAlta(false)
            cargar()
          }}
        />
      )}

      {error && <p className="mensaje-error">{error}</p>}

      {cargando ? (
        <p className="vacio">Cargando...</p>
      ) : turnos.length === 0 ? (
        <p className="vacio">
          No hay turnos en la agenda. Creá un turno suelto o generá desde un turno fijo.
        </p>
      ) : (
        <div className="grupos-dia">
          {[...porDia.entries()].map(([fecha, delDia]) => (
            <section key={fecha} className="grupo-dia">
              <h2>{encabezadoDia(fecha)}</h2>
              {delDia.map((t) => (
                <TurnoStaff
                  key={t.id}
                  turno={t}
                  miId={instructoraId}
                  onCambio={cargar}
                  onError={setError}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function TurnoStaff({
  turno,
  miId,
  onCambio,
  onError,
}: {
  turno: TurnoConReservas
  miId?: string
  onCambio: () => void
  onError: (m: string) => void
}) {
  // Una profesora ve los turnos de las demás pero no los toca ni ve sus anotadas.
  const soloLectura = Boolean(miId) && turno.instructora_id !== miId
  const [ocupado, setOcupado] = useState(false)
  const anotados = turno.reservas.filter((r) => r.estado === 'reservada')
  const espera = turno.reservas.filter((r) => r.estado === 'lista_espera')
  const invitadas = turno.reservas_invitadas ?? []
  const pasado = yaPaso(turno.fecha, turno.hora)
  const [agregando, setAgregando] = useState(false)

  const conManejo = async (fn: () => Promise<void>) => {
    setOcupado(true)
    onError('')
    try {
      await fn()
      onCambio()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo completar la acción.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className={turno.cancelado ? 'turno-staff cancelado' : 'turno-staff'}>
      <div className="turno-staff-cabecera">
        <span className="turno-hora">{horaCorta(turno.hora)}</span>
        <span className="turno-detalle">
          {anotados.length + invitadas.length}/{turno.cupo}
          {turno.cancelado && ' · CANCELADO'}
        </span>
        {!turno.cancelado && !pasado && !soloLectura && (
          <div className="barra-acciones">
            <button
              type="button"
              className="link-secundario"
              disabled={ocupado}
              onClick={() => {
                const valor = prompt('Nuevo cupo', String(turno.cupo))
                if (valor == null) return
                const cupo = Number(valor)
                if (!Number.isInteger(cupo) || cupo < 1) {
                  onError('El cupo tiene que ser un número mayor a 0.')
                  return
                }
                conManejo(() => actualizarTurno(turno.id, { cupo }))
              }}
            >
              Editar cupo
            </button>
            <button
              type="button"
              className="link-peligro"
              disabled={ocupado}
              onClick={() => {
                if (confirm('¿Cancelar este turno? Se avisa que quedó sin efecto.')) {
                  conManejo(() => cancelarTurno(turno.id))
                }
              }}
            >
              Cancelar turno
            </button>
          </div>
        )}
        {pasado && !turno.cancelado && <span className="etiqueta-rol">Ya pasó</span>}
      </div>

      {turno.instructor && <p className="turno-profesora">Profesora: {turno.instructor}</p>}
      {turno.nota && <p className="turno-nota">{turno.nota}</p>}

      {!turno.cancelado && !soloLectura && (
        <ul className="anotados">
          {anotados.length + invitadas.length === 0 && (
            <li className="vacio-inline">Nadie anotado todavía</li>
          )}
          {anotados.map((r) => (
            <li key={r.id}>
              <div className="fila-anotada">
                <span>
                  {r.perfiles ? nombreCompleto(r.perfiles) : 'Sin nombre'}
                  {r.perfiles?.telefono ? ` · ${r.perfiles.telefono}` : ''}
                </span>
                {pasado ? (
                  <div className="asistencia">
                    <button
                      type="button"
                      className={r.asistencia === 'asistio' ? 'activo-si' : ''}
                      disabled={ocupado}
                      onClick={() =>
                        conManejo(() =>
                          marcarAsistencia(r.id, r.asistencia === 'asistio' ? null : 'asistio'),
                        )
                      }
                    >
                      Asistió
                    </button>
                    <button
                      type="button"
                      className={r.asistencia === 'ausente' ? 'activo-no' : ''}
                      disabled={ocupado}
                      onClick={() =>
                        conManejo(() =>
                          marcarAsistencia(r.id, r.asistencia === 'ausente' ? null : 'ausente'),
                        )
                      }
                    >
                      Ausente
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="link-peligro"
                    disabled={ocupado}
                    onClick={() => {
                      const nombre = r.perfiles ? nombreCompleto(r.perfiles) : 'esta persona'
                      if (confirm(`¿Sacar a ${nombre} del turno?`)) {
                        conManejo(() => quitarReserva(r.id))
                      }
                    }}
                  >
                    Sacar
                  </button>
                )}
              </div>
              {r.perfiles?.lesiones && (
                <p className="alerta-lesion">
                  <strong>Atención:</strong> {r.perfiles.lesiones}
                </p>
              )}
            </li>
          ))}
          {invitadas.map((i) => (
            <li key={i.id}>
              <div className="fila-anotada">
                <span>
                  {nombreCompleto(i)} · {i.telefono}
                  <span className="etiqueta-sin-registrar">Sin registrar</span>
                </span>
                {pasado ? (
                  <div className="asistencia">
                    <button
                      type="button"
                      className={i.asistencia === 'asistio' ? 'activo-si' : ''}
                      disabled={ocupado}
                      onClick={() =>
                        conManejo(() =>
                          marcarAsistenciaInvitada(i.id, i.asistencia === 'asistio' ? null : 'asistio'),
                        )
                      }
                    >
                      Asistió
                    </button>
                    <button
                      type="button"
                      className={i.asistencia === 'ausente' ? 'activo-no' : ''}
                      disabled={ocupado}
                      onClick={() =>
                        conManejo(() =>
                          marcarAsistenciaInvitada(i.id, i.asistencia === 'ausente' ? null : 'ausente'),
                        )
                      }
                    >
                      Ausente
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="link-peligro"
                    disabled={ocupado}
                    onClick={() => {
                      if (confirm(`¿Sacar a ${nombreCompleto(i)} del turno?`)) {
                        conManejo(() => quitarInvitada(i.id))
                      }
                    }}
                  >
                    Sacar
                  </button>
                )}
              </div>
            </li>
          ))}
          {espera.map((r) => (
            <li key={r.id} className="en-espera">
              <span>{r.perfiles ? nombreCompleto(r.perfiles) : 'Sin nombre'} — en espera</span>
              {!pasado && (
                <button
                  type="button"
                  className="link-secundario"
                  disabled={ocupado}
                  onClick={() => conManejo(() => quitarReserva(r.id))}
                >
                  Sacar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!turno.cancelado && !pasado && !soloLectura &&
        (agregando ? (
          <AgregarAlumna
            turnoId={turno.id}
            paraProfesora={Boolean(miId)}
            onAgregada={() => {
              setAgregando(false)
              onCambio()
            }}
            onCerrar={() => setAgregando(false)}
          />
        ) : (
          <button type="button" className="link-secundario" onClick={() => setAgregando(true)}>
            + Agregar alumna
          </button>
        ))}
    </div>
  )
}

function FormAltaTurno({
  onCreado,
  instructoraId,
}: {
  onCreado: () => void
  instructoraId?: string
}) {
  const [fecha, setFecha] = useState(hoyIso())
  const [hora, setHora] = useState('09:00')
  const [cupo, setCupo] = useState('6')
  const [profesora, setProfesora] = useState<ValorProfesora>({})
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const cupoNum = Number(cupo)
    if (!Number.isInteger(cupoNum) || cupoNum < 1) {
      setError('El cupo tiene que ser un número mayor a 0.')
      return
    }
    setEnviando(true)
    try {
      await crearTurno({
        fecha,
        hora,
        cupo: cupoNum,
        instructor: profesora.instructor,
        instructoraId: instructoraId ?? profesora.instructoraId,
        nota,
      })
      onCreado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el turno.')
      setEnviando(false)
    }
  }

  return (
    <form className="form-caja" onSubmit={enviar}>
      <div className="grilla-campos">
        <div>
          <label htmlFor="a-fecha">Fecha</label>
          <input
            id="a-fecha"
            type="date"
            value={fecha}
            min={hoyIso()}
            onChange={(e) => setFecha(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="a-hora">Hora</label>
          <input
            id="a-hora"
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="a-cupo">Cupo</label>
          <input
            id="a-cupo"
            type="number"
            min={1}
            value={cupo}
            onChange={(e) => setCupo(e.target.value)}
            required
          />
        </div>
        {!instructoraId && <CampoProfesora id="a-profesora" onCambio={setProfesora} />}
      </div>
      <label htmlFor="a-nota">Nota (opcional)</label>
      <input id="a-nota" value={nota} onChange={(e) => setNota(e.target.value)} />

      {error && <p className="mensaje-error">{error}</p>}
      <button type="submit" disabled={enviando}>
        {enviando ? 'Creando...' : 'Crear turno'}
      </button>
    </form>
  )
}

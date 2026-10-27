import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Profesora, TurnoConReservas } from '../tipos'
import {
  actualizarTurno,
  cancelarTurno,
  cancelarTurnos,
  crearTurno,
  editarTurno,
  listarTurnosStaff,
  marcarAsistencia,
  marcarAsistenciaInvitada,
  quitarInvitada,
  quitarReserva,
} from '../servicios/agenda'
import {
  diaSemanaPlural,
  encabezadoDia,
  encabezadoDiaCorto,
  horaCorta,
  hoyIso,
  sumarDias,
  yaPaso,
} from '../fechas'
import { nombreCompleto } from '../personas'
import { dejarFija, fijarAlumna, listarFijasStaff } from '../servicios/fijas'
import { listarProfesoras } from '../servicios/profesoras'

import AgregarAlumna from './AgregarAlumna'
import EditarTurno from './EditarTurno'
import EnlaceWhatsApp from './EnlaceWhatsApp'
import VincularInvitada from './VincularInvitada'
import { mensajeCancelacion, mensajeTurno } from '../whatsapp'
import CampoProfesora from './CampoProfesora'
import type { ValorProfesora } from './CampoProfesora'

// A quién avisar después de cancelar un día entero.
type AvisoDia = {
  fecha: string
  motivo: string
  cantidad: number
  personas: { nombre: string; primerNombre: string; telefono: string; hora: string }[]
}

// instructoraId: cuando una profesora usa esta pantalla ve toda la agenda,
// pero solo maneja (cupo, cancelar, anotadas, asistencia) los turnos suyos y
// los que crea quedan a su nombre. Sin eso (staff), maneja todo.
export default function AgendaStaff({ instructoraId }: { instructoraId?: string }) {
  const [turnos, setTurnos] = useState<TurnoConReservas[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [avisoFija, setAvisoFija] = useState('')
  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [verPasados, setVerPasados] = useState(false)
  const [soloMios, setSoloMios] = useState(false)
  const [avisoDia, setAvisoDia] = useState<AvisoDia | null>(null)
  // Quiénes son fijas de qué turno fijo (solo lo ve el staff; null = no se pudo cargar).
  const [fijas, setFijas] = useState<Set<string> | null>(null)
  // Profesoras para asignar desde el listado (solo el staff).
  const [profesoras, setProfesoras] = useState<Profesora[]>([])

  useEffect(() => {
    if (instructoraId) return
    listarProfesoras()
      .then(setProfesoras)
      .catch(() => setProfesoras([]))
  }, [instructoraId])

  const asignarProfesora = async (t: TurnoConReservas, instructoraIdNueva: string) => {
    if (!instructoraIdNueva) return
    const aSerie =
      Boolean(t.plantilla_id) &&
      confirm(
        `¿Asignarla a todos los ${diaSemanaPlural(t.fecha)} de este horario, desde hoy en adelante?\n\n` +
          'Aceptar = todos esos turnos. Cancelar = solo este turno.',
      )
    setError('')
    try {
      await editarTurno(t, { profesora: { instructoraId: instructoraIdNueva } }, aSerie)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo asignar la profesora.')
    }
  }
  const [vista, setVista] = useState<'listado' | 'tarjetas'>(() => {
    try {
      return localStorage.getItem('agenda-vista') === 'tarjetas' ? 'tarjetas' : 'listado'
    } catch {
      return 'listado'
    }
  })

  const cambiarVista = (v: 'listado' | 'tarjetas') => {
    setVista(v)
    try {
      localStorage.setItem('agenda-vista', v)
    } catch {
      // sin almacenamiento: se usa solo en esta sesión
    }
  }

  const cancelarDia = async (fecha: string, delDia: TurnoConReservas[]) => {
    const aCancelar = delDia.filter((t) => !t.cancelado && !yaPaso(t.fecha, t.hora))
    if (aCancelar.length === 0) return

    const motivo = prompt(
      `Vas a cancelar ${aCancelar.length} turno${aCancelar.length === 1 ? '' : 's'} del ` +
        `${encabezadoDia(fecha)}.\n\nMotivo (opcional, va en el mensaje a las alumnas). ` +
        'Tocá Cancelar para no hacer nada.',
      'Feriado',
    )
    if (motivo === null) return

    // Armamos la lista de a quién avisar ANTES de cancelar, con lo que hay anotado.
    const personas: AvisoDia['personas'] = []
    for (const t of aCancelar) {
      for (const r of t.reservas.filter((x) => x.estado === 'reservada')) {
        if (r.perfiles) {
          personas.push({
            nombre: nombreCompleto(r.perfiles),
            primerNombre: r.perfiles.nombre,
            telefono: r.perfiles.telefono,
            hora: t.hora,
          })
        }
      }
      for (const i of t.reservas_invitadas ?? []) {
        personas.push({
          nombre: nombreCompleto(i),
          primerNombre: i.nombre,
          telefono: i.telefono,
          hora: t.hora,
        })
      }
    }

    setError('')
    try {
      await cancelarTurnos(aCancelar.map((t) => t.id))
      setAvisoDia({ fecha, motivo, cantidad: aCancelar.length, personas })
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cancelar el día.')
    }
  }

  const cargar = useCallback(async () => {
    setError('')
    try {
      const periodo = verPasados ? { desde: sumarDias(hoyIso(), -7), dias: 7 } : {}
      setTurnos(
        await listarTurnosStaff({ ...periodo, instructoraId: soloMios ? instructoraId : undefined }),
      )
      if (!instructoraId) {
        try {
          setFijas(await listarFijasStaff())
        } catch {
          setFijas(null)
        }
      }
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
        <h2>{verPasados ? 'Última semana' : 'Hasta fin del mes que viene'}</h2>
        <div className="barra-acciones">
          <button
            type="button"
            className="link-secundario"
            onClick={() => setVerPasados((v) => !v)}
          >
            {verPasados ? 'Ver próximos' : 'Cargar asistencia'}
          </button>
          <button
            type="button"
            className="link-secundario"
            onClick={() => cambiarVista(vista === 'listado' ? 'tarjetas' : 'listado')}
          >
            {vista === 'listado' ? 'Ver en tarjetas' : 'Ver en listado'}
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
      {avisoFija && <p className="mensaje-ok">{avisoFija}</p>}

      {avisoDia && (
        <div className="aviso-cancelacion">
          <p>
            <strong>
              Se cancelaron {avisoDia.cantidad} turno{avisoDia.cantidad === 1 ? '' : 's'} del{' '}
              {encabezadoDia(avisoDia.fecha)}.
            </strong>{' '}
            {avisoDia.personas.length > 0
              ? 'Avisale a cada una por WhatsApp:'
              : 'No había nadie anotado, no hay a quién avisar.'}
          </p>
          {avisoDia.personas.length > 0 && (
            <ul>
              {avisoDia.personas.map((p, n) => (
                <li key={n}>
                  <span>
                    {p.nombre} <span className="ayuda">· {horaCorta(p.hora)}</span>
                  </span>
                  {p.telefono ? (
                    <EnlaceWhatsApp
                      telefono={p.telefono}
                      mensaje={mensajeCancelacion(
                        p.primerNombre,
                        avisoDia.fecha,
                        p.hora,
                        avisoDia.motivo,
                      )}
                      etiqueta="Avisar"
                    />
                  ) : (
                    <span className="ayuda">sin celular</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="link-secundario" onClick={() => setAvisoDia(null)}>
            Listo, cerrar
          </button>
        </div>
      )}

      {cargando ? (
        <p className="vacio">Cargando...</p>
      ) : turnos.length === 0 ? (
        <p className="vacio">
          No hay turnos en la agenda. Creá un turno suelto o generá desde un turno fijo.
        </p>
      ) : (
        <div className={vista === 'listado' ? 'grupos-dia grupos-dia--listado' : 'grupos-dia grupos-dia--agenda'}>
          {[...porDia.entries()].map(([fecha, delDia]) => (
            <section key={fecha} className="grupo-dia">
              <div className="fila-dia">
                <h2>{encabezadoDiaCorto(fecha)}</h2>
                {!instructoraId && delDia.some((t) => !t.cancelado && !yaPaso(t.fecha, t.hora)) && (
                  <button
                    type="button"
                    className="boton-mini"
                    onClick={() => void cancelarDia(fecha, delDia)}
                  >
                    Cancelar todo el día
                  </button>
                )}
              </div>
              {delDia.map((t) => {
                const tarjeta = (
                  <TurnoStaff
                    key={t.id}
                    turno={t}
                    miId={instructoraId}
                    fijas={fijas}
                    onCambio={cargar}
                    onError={setError}
                    onAviso={setAvisoFija}
                  />
                )
                if (vista === 'tarjetas') return tarjeta
                const anotadas = t.reservas.filter((r) => r.estado === 'reservada')
                const nombres = [
                  ...anotadas.map((r) => ({
                    texto: r.perfiles ? r.perfiles.nombre : 'Sin nombre',
                    fija: Boolean(t.plantilla_id && fijas?.has(`${t.plantilla_id}|${r.alumno_id}`)),
                  })),
                  ...(t.reservas_invitadas ?? []).map((i) => ({ texto: i.nombre, fija: false })),
                ]
                return (
                  <details key={t.id} className="fila-agenda">
                    <summary>
                      <span className="turno-hora">{horaCorta(t.hora)}</span>
                      <span className="fila-agenda-datos">
                        <span className="fila-agenda-cupo">
                          {nombres.length}/{t.cupo}
                          {t.instructor ? ` · ${t.instructor}` : ' · sin profesora'}
                        </span>
                        <span className="fila-agenda-nombres">
                          {nombres.length === 0
                            ? 'Nadie anotado'
                            : nombres.map((n) => (n.fija ? `${n.texto} (fija)` : n.texto)).join(', ')}
                        </span>
                      </span>
                      {!instructoraId && profesoras.length > 0 && !yaPaso(t.fecha, t.hora) && (
                        <select
                          className="fila-agenda-profe"
                          aria-label={`Asignar profesora al turno de las ${horaCorta(t.hora)}`}
                          value=""
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => void asignarProfesora(t, e.target.value)}
                        >
                          <option value="">{t.instructor ? 'Cambiar profe' : 'Asignar profe'}</option>
                          {profesoras.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre || 'Sin nombre todavía'}
                            </option>
                          ))}
                        </select>
                      )}
                    </summary>
                    {tarjeta}
                  </details>
                )
              })}
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
  fijas,
  onCambio,
  onError,
  onAviso,
}: {
  turno: TurnoConReservas
  miId?: string
  fijas: Set<string> | null
  onCambio: () => void
  onError: (m: string) => void
  onAviso: (m: string) => void
}) {
  // Una profesora ve los turnos de las demás pero no los toca ni ve sus anotadas.
  const soloLectura = Boolean(miId) && turno.instructora_id !== miId
  const [ocupado, setOcupado] = useState(false)
  const anotados = turno.reservas.filter((r) => r.estado === 'reservada')
  const espera = turno.reservas.filter((r) => r.estado === 'lista_espera')
  const invitadas = turno.reservas_invitadas ?? []
  const pasado = yaPaso(turno.fecha, turno.hora)
  const [agregando, setAgregando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [vinculandoId, setVinculandoId] = useState<string | null>(null)

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
                // El staff abre el panel completo (profesora y cupo, también
                // para toda la serie); la profesora solo cambia el cupo.
                if (!miId) {
                  setEditando((v) => !v)
                  return
                }
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
              {miId ? 'Editar cupo' : 'Editar'}
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

      {editando && !miId && (
        <EditarTurno
          turno={turno}
          onGuardado={() => {
            setEditando(false)
            onCambio()
          }}
          onCerrar={() => setEditando(false)}
        />
      )}

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
                  {r.perfiles && (
                    <EnlaceWhatsApp
                      telefono={r.perfiles.telefono}
                      mensaje={mensajeTurno(r.perfiles.nombre, turno.fecha, turno.hora)}
                    />
                  )}
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
                  <div className="barra-acciones">
                    {turno.plantilla_id && fijas && (
                      <BotonFija
                        turno={turno}
                        alumnaId={r.alumno_id}
                        nombre={r.perfiles ? nombreCompleto(r.perfiles) : 'esta persona'}
                        esFija={fijas.has(`${turno.plantilla_id}|${r.alumno_id}`)}
                        deshabilitado={ocupado}
                        conManejo={conManejo}
                        onAviso={onAviso}
                      />
                    )}
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
                  </div>
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
                  {nombreCompleto(i)}
                  {i.telefono ? ` · ${i.telefono}` : ''}
                  <EnlaceWhatsApp
                    telefono={i.telefono}
                    mensaje={mensajeTurno(i.nombre, turno.fecha, turno.hora)}
                  />
                  <span className="etiqueta-sin-registrar">Sin registrar</span>
                  <button
                    type="button"
                    className="boton-mini boton-vincular"
                    onClick={() => setVinculandoId(vinculandoId === i.id ? null : i.id)}
                  >
                    Vincular a una cuenta
                  </button>
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
              {vinculandoId === i.id && (
                <VincularInvitada
                  invitada={i}
                  paraProfesora={Boolean(miId)}
                  onVinculada={() => {
                    setVinculandoId(null)
                    onCambio()
                  }}
                  onCerrar={() => setVinculandoId(null)}
                />
              )}
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
            plantillaId={turno.plantilla_id}
            fecha={turno.fecha}
            hora={turno.hora}
            onAviso={onAviso}
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

// Deja fija a una alumna ya anotada en este horario, o le saca lo fijo (sigue anotada
// en los turnos que ya tiene).
function BotonFija({
  turno,
  alumnaId,
  nombre,
  esFija,
  deshabilitado,
  conManejo,
  onAviso,
}: {
  turno: TurnoConReservas
  alumnaId: string
  nombre: string
  esFija: boolean
  deshabilitado: boolean
  conManejo: (fn: () => Promise<void>) => Promise<void>
  onAviso: (m: string) => void
}) {
  const plantillaId = turno.plantilla_id as string
  return (
    <button
      type="button"
      className={esFija ? 'boton-mini boton-fija boton-fija--si' : 'boton-mini boton-fija'}
      disabled={deshabilitado}
      title={esFija ? 'Es fija en este horario: tocá para sacarle lo fijo' : 'Dejarla fija en este horario'}
      onClick={() => {
        if (esFija) {
          if (!confirm(`¿Sacarle lo fijo a ${nombre}? Sigue anotada en los turnos que ya tiene.`)) return
          void conManejo(async () => {
            await dejarFija(alumnaId, plantillaId)
            onAviso(`${nombre} ya no es fija en este horario.`)
          })
          return
        }
        void conManejo(async () => {
          const n = await fijarAlumna(alumnaId, plantillaId)
          onAviso(
            `${nombre} quedó fija en este horario` +
              (n > 0 ? ` y se la anotó en ${n} turno${n === 1 ? '' : 's'} más.` : '.'),
          )
        })
      }}
    >
      {esFija ? 'Fija ✓' : 'Dejar fija'}
    </button>
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

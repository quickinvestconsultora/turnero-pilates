import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { PlantillaTurno, TurnoConReservas } from '../tipos'
import {
  borrarPlantilla,
  cambiarPlantillaActiva,
  crearPlantilla,
  generarTurnos,
  listarPlantillas,
  listarTurnosStaff,
} from '../servicios/agenda'
import { contarFijasPorPlantilla } from '../servicios/fijas'
import { NOMBRE_DIA, fechaCorta, horaCorta, hoyIso } from '../fechas'
import { nombreCompleto } from '../personas'
import CampoProfesora from './CampoProfesora'
import AlumnasFijas from './AlumnasFijas'
import type { ValorProfesora } from './CampoProfesora'

// Semana arrancando en lunes, que es lo natural para el estudio.
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0]

// Turnos fijos como listado agrupado por día. Al tocar uno se entra a su detalle: sus
// acciones, sus alumnas fijas y los próximos turnos con quiénes están anotadas.
// instructoraId: cuando la usa una profesora, solo ve y crea sus turnos fijos.
export default function PlantillasStaff({ instructoraId }: { instructoraId?: string }) {
  const [plantillas, setPlantillas] = useState<PlantillaTurno[]>([])
  const [fijas, setFijas] = useState<Record<string, number>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [mostrarAlta, setMostrarAlta] = useState(false)

  const cargar = useCallback(async () => {
    setError('')
    try {
      const [lista, cuenta] = await Promise.all([
        listarPlantillas(instructoraId),
        contarFijasPorPlantilla().catch(() => ({}) as Record<string, number>),
      ])
      setPlantillas(lista)
      setFijas(cuenta)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los turnos fijos.')
    } finally {
      setCargando(false)
    }
  }, [instructoraId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const porDia = useMemo(
    () =>
      ORDEN_DIAS.map((d) => ({
        dia: d,
        items: plantillas.filter((p) => p.dia_semana === d).sort((a, b) => a.hora.localeCompare(b.hora)),
      })).filter((g) => g.items.length > 0),
    [plantillas],
  )

  const elegido = seleccion ? plantillas.find((p) => p.id === seleccion) ?? null : null

  if (elegido) {
    return (
      <DetalleTurnoFijo
        plantilla={elegido}
        plantillas={plantillas}
        instructoraId={instructoraId}
        onVolver={() => {
          setSeleccion(null)
          cargar()
        }}
        onCambio={cargar}
      />
    )
  }

  return (
    <div>
      <div className="fila-titulo">
        <h2>Turnos fijos semanales</h2>
        <button type="button" className="link-secundario" onClick={() => setMostrarAlta((v) => !v)}>
          {mostrarAlta ? 'Cerrar' : '+ Nuevo'}
        </button>
      </div>

      <details className="ayuda-plegable">
        <summary>Cómo funcionan los turnos fijos</summary>
        <p className="ayuda">
          Los turnos fijos <strong>quedan para siempre</strong>: se publican solos en la agenda todos los días, hasta
          el fin del mes que viene, hasta que los desactives o los borres. Para sacar una fecha puntual (un feriado),
          cancelá ese turno desde la Agenda; no lo borres, porque se volvería a publicar. Las{' '}
          <strong>alumnas fijas</strong> de cada horario se anotan solas en cada turno nuevo. Tocá un horario para ver
          su detalle.
        </p>
      </details>

      {mostrarAlta && (
        <FormAltaPlantilla
          instructoraId={instructoraId}
          onCreada={() => {
            setMostrarAlta(false)
            cargar()
          }}
        />
      )}

      {error && <p className="mensaje-error">{error}</p>}

      {cargando ? (
        <p className="vacio">Cargando...</p>
      ) : plantillas.length === 0 ? (
        <p className="vacio">Todavía no cargaste ningún turno fijo.</p>
      ) : (
        <div className="lista-fijos">
          {porDia.map((g) => (
            <section key={g.dia} className="grupo-fijo">
              <h3>{NOMBRE_DIA[g.dia]}</h3>
              <ul>
                {g.items.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={p.activa ? 'fila-fijo' : 'fila-fijo fila-fijo--inactivo'}
                      onClick={() => setSeleccion(p.id)}
                    >
                      <span className="fila-fijo-hora">{horaCorta(p.hora)}</span>
                      <span className="fila-fijo-datos">
                        <span>{p.instructor ? p.instructor : 'Sin profesora'}</span>
                        <span className="ayuda">
                          cupo {p.cupo}
                          {!instructoraId && ` · ${fijas[p.id] ?? 0} alumna${(fijas[p.id] ?? 0) === 1 ? '' : 's'} fija${(fijas[p.id] ?? 0) === 1 ? '' : 's'}`}
                          {!p.activa && ' · inactivo'}
                        </span>
                      </span>
                      <span className="fila-fijo-flecha" aria-hidden="true">
                        ›
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

// Detalle de un turno fijo: acciones, alumnas fijas y próximos turnos.
function DetalleTurnoFijo({
  plantilla,
  plantillas,
  instructoraId,
  onVolver,
  onCambio,
}: {
  plantilla: PlantillaTurno
  plantillas: PlantillaTurno[]
  instructoraId?: string
  onVolver: () => void
  onCambio: () => void
}) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [proximos, setProximos] = useState<TurnoConReservas[] | null>(null)

  const cargarProximos = useCallback(async () => {
    try {
      const todos = await listarTurnosStaff({ desde: hoyIso(), instructoraId })
      setProximos(todos.filter((t) => t.plantilla_id === plantilla.id))
    } catch (e) {
      setProximos([])
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los próximos turnos.')
    }
  }, [plantilla.id, instructoraId])

  useEffect(() => {
    cargarProximos()
  }, [cargarProximos])

  const conManejo = async (fn: () => Promise<void>) => {
    setOcupado(true)
    setError('')
    setAviso('')
    try {
      await fn()
      onCambio()
      await cargarProximos()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div>
      <button type="button" className="link-secundario" onClick={onVolver}>
        ← Volver al listado
      </button>

      <div className="fila-titulo">
        <h2>
          {NOMBRE_DIA[plantilla.dia_semana]} {horaCorta(plantilla.hora)}
        </h2>
        <span className="turno-detalle">
          {plantilla.instructor ? `Profesora ${plantilla.instructor} · ` : ''}cupo {plantilla.cupo}
          {!plantilla.activa && ' · inactivo'}
        </span>
      </div>

      {error && <p className="mensaje-error">{error}</p>}
      {aviso && <p className="mensaje-ok">{aviso}</p>}

      <div className="barra-acciones">
        {(['este-mes', 'mes-que-viene'] as const).map((periodo) => (
          <button
            key={periodo}
            type="button"
            disabled={ocupado}
            onClick={() =>
              conManejo(async () => {
                const creados = await generarTurnos(plantilla.id, periodo)
                setAviso(
                  creados > 0
                    ? `Se publicaron ${creados} turno${creados === 1 ? '' : 's'} en la agenda.`
                    : 'No había turnos nuevos para publicar (ya estaban todos).',
                )
              })
            }
          >
            {periodo === 'este-mes' ? 'Publicar este mes' : 'Publicar mes que viene'}
          </button>
        ))}
        <button
          type="button"
          className="link-secundario"
          disabled={ocupado}
          onClick={() => conManejo(() => cambiarPlantillaActiva(plantilla.id, !plantilla.activa))}
        >
          {plantilla.activa ? 'Desactivar' : 'Activar'}
        </button>
        <button
          type="button"
          className="link-peligro"
          disabled={ocupado}
          onClick={async () => {
            if (!confirm('Borrar el turno fijo. Los turnos ya publicados en la agenda quedan como están.')) return
            setOcupado(true)
            try {
              await borrarPlantilla(plantilla.id)
              onVolver()
            } catch (e) {
              setError(e instanceof Error ? e.message : 'No se pudo borrar.')
              setOcupado(false)
            }
          }}
        >
          Borrar
        </button>
      </div>

      {!instructoraId && (
        <>
          <h3>Alumnas fijas</h3>
          <AlumnasFijas plantillaId={plantilla.id} plantillas={plantillas} abiertaDesdeElPrincipio />
        </>
      )}

      <h3>Próximos turnos de este horario</h3>
      {proximos === null ? (
        <p className="ayuda">Cargando...</p>
      ) : proximos.length === 0 ? (
        <p className="ayuda">
          Todavía no hay turnos publicados de este horario. Se publican solos todos los días mientras esté activo.
        </p>
      ) : (
        <ul className="lista-proximos">
          {proximos.map((t) => {
            const anotadas = t.reservas.filter((r) => r.estado === 'reservada')
            const espera = t.reservas.filter((r) => r.estado === 'lista_espera')
            const invitadas = t.reservas_invitadas ?? []
            const total = anotadas.length + invitadas.length
            return (
              <li key={t.id}>
                <details>
                  <summary>
                    <span>{fechaCorta(t.fecha)}</span>
                    <span className={total >= t.cupo ? 'hoy-alerta' : 'ayuda'}>
                      {t.cancelado ? 'cancelado' : `${total}/${t.cupo} anotadas`}
                    </span>
                  </summary>
                  {t.cancelado ? (
                    <p className="ayuda">Este turno está cancelado.</p>
                  ) : total === 0 && espera.length === 0 ? (
                    <p className="ayuda">Nadie anotada todavía.</p>
                  ) : (
                    <ul className="ficha-historial">
                      {anotadas.map((r) => (
                        <li key={r.id}>
                          <span>{r.perfiles ? nombreCompleto(r.perfiles) : 'Sin nombre'}</span>
                        </li>
                      ))}
                      {invitadas.map((i) => (
                        <li key={i.id}>
                          <span>
                            {nombreCompleto(i)} <span className="etiqueta-sin-registrar">Sin registrar</span>
                          </span>
                        </li>
                      ))}
                      {espera.map((r) => (
                        <li key={r.id}>
                          <span className="ayuda">
                            En espera: {r.perfiles ? nombreCompleto(r.perfiles) : 'Sin nombre'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function FormAltaPlantilla({
  onCreada,
  instructoraId,
}: {
  onCreada: () => void
  instructoraId?: string
}) {
  const [dia, setDia] = useState('1')
  const [hora, setHora] = useState('09:00')
  const [cupo, setCupo] = useState('6')
  const [profesora, setProfesora] = useState<ValorProfesora>({})
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
      await crearPlantilla({
        dia_semana: Number(dia),
        hora,
        cupo: cupoNum,
        instructor: profesora.instructor,
        instructoraId: instructoraId ?? profesora.instructoraId,
      })
      onCreada()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="form-caja" onSubmit={enviar}>
      <div className="grilla-campos">
        <div>
          <label htmlFor="pl-dia">Día</label>
          <select id="pl-dia" value={dia} onChange={(e) => setDia(e.target.value)}>
            {ORDEN_DIAS.map((d) => (
              <option key={d} value={d}>
                {NOMBRE_DIA[d]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pl-hora">Hora</label>
          <input
            id="pl-hora"
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="pl-cupo">Cupo</label>
          <input
            id="pl-cupo"
            type="number"
            min={1}
            value={cupo}
            onChange={(e) => setCupo(e.target.value)}
            required
          />
        </div>
        {!instructoraId && <CampoProfesora id="pl-profesora" onCambio={setProfesora} />}
      </div>

      {error && <p className="mensaje-error">{error}</p>}
      <button type="submit" disabled={enviando}>
        {enviando ? 'Guardando...' : 'Agregar turno fijo'}
      </button>
    </form>
  )
}

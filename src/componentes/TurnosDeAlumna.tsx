import { useCallback, useEffect, useState } from 'react'
import type { PlantillaTurno } from '../tipos'
import {
  agregarAlumnaATurno,
  listarPlantillas,
  listarTurnosStaff,
  quitarReserva,
} from '../servicios/agenda'
import { dejarFija, moverFija, turnosDeAlumna } from '../servicios/fijas'
import type { FijaDeAlumna, TurnoDeAlumna } from '../servicios/fijas'
import { NOMBRE_DIA, fechaMedia, hoyIso, horaCorta, yaPaso } from '../fechas'

type OpcionTurno = { id: string; texto: string }

// Resumen para el staff de todo lo que tiene asignado una alumna: sus turnos fijos y los turnos
// próximos en los que está anotada. Desde acá se saca, se mueve o se cambia de horario.
export default function TurnosDeAlumna({
  alumnaId,
  fijas,
  onFijasCambio,
}: {
  alumnaId: string
  fijas: FijaDeAlumna[]
  onFijasCambio: () => void
}) {
  const [turnos, setTurnos] = useState<TurnoDeAlumna[] | null>(null)
  const [plantillas, setPlantillas] = useState<PlantillaTurno[]>([])
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)
  // Qué fila tiene abierto el selector de cambio ('f:<plantilla>' o 't:<reserva>').
  const [editando, setEditando] = useState<string | null>(null)
  const [destino, setDestino] = useState('')
  const [opciones, setOpciones] = useState<OpcionTurno[]>([])

  const cargar = useCallback(async () => {
    try {
      setTurnos(await turnosDeAlumna(alumnaId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los turnos.')
    }
  }, [alumnaId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    listarPlantillas()
      .then(setPlantillas)
      .catch(() => setPlantillas([]))
  }, [])

  const conManejo = async (fn: () => Promise<string | void>) => {
    setError('')
    setAviso('')
    setOcupado(true)
    try {
      const mensaje = await fn()
      if (mensaje) setAviso(mensaje)
      setEditando(null)
      setDestino('')
      await cargar()
      onFijasCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción.')
    } finally {
      setOcupado(false)
    }
  }

  const abrirCambioDeTurno = async (t: TurnoDeAlumna) => {
    if (editando === `t:${t.reserva_id}`) {
      setEditando(null)
      return
    }
    setEditando(`t:${t.reserva_id}`)
    setDestino('')
    setOpciones([])
    try {
      const todos = await listarTurnosStaff({ desde: hoyIso() })
      const suyos = new Set((turnos ?? []).map((x) => x.turno_id))
      setOpciones(
        todos
          .filter((x) => !x.cancelado && !yaPaso(x.fecha, x.hora) && !suyos.has(x.id))
          .map((x) => ({
            id: x.id,
            lugares: x.cupo - (x.reservas.filter((r) => r.estado === 'reservada').length + (x.reservas_invitadas?.length ?? 0)),
            texto: `${fechaMedia(x.fecha)} · ${horaCorta(x.hora)}${x.instructor ? ` · ${x.instructor}` : ''}`,
          }))
          .filter((x) => x.lugares > 0)
          .map((x) => ({ id: x.id, texto: `${x.texto} (${x.lugares} lugar${x.lugares === 1 ? '' : 'es'})` })),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los turnos disponibles.')
    }
  }

  const cambiarTurno = (t: TurnoDeAlumna) =>
    conManejo(async () => {
      // Primero la anotamos en el nuevo: si no hay lugar, no pierde el que tiene.
      await agregarAlumnaATurno(destino, alumnaId)
      await quitarReserva(t.reserva_id)
      return 'Listo: la pasaste al turno nuevo.'
    })

  const sacarTurno = (t: TurnoDeAlumna) => {
    if (!window.confirm(`¿Sacarla del turno del ${fechaMedia(t.fecha)} a las ${horaCorta(t.hora)}?`)) return
    void conManejo(async () => {
      await quitarReserva(t.reserva_id)
      return 'La sacaste de ese turno.'
    })
  }

  const sacarFija = (f: FijaDeAlumna) => {
    if (
      !window.confirm(
        `¿Sacarle el turno fijo de los ${NOMBRE_DIA[f.dia_semana].toLowerCase()} a las ${horaCorta(f.hora)}? Los turnos que ya tiene anotados de ese horario se mantienen.`,
      )
    ) {
      return
    }
    void conManejo(async () => {
      await dejarFija(alumnaId, f.plantilla_id)
      return 'Ya no es fija en ese horario.'
    })
  }

  const moverFijaA = (f: FijaDeAlumna) => {
    const nuevo = plantillas.find((p) => p.id === destino)
    if (!nuevo) return
    if (
      !window.confirm(
        `¿Pasarla al horario fijo de los ${NOMBRE_DIA[nuevo.dia_semana].toLowerCase()} a las ${horaCorta(nuevo.hora)}?\n\nSe anulan sus reservas futuras del horario anterior y se la anota en los turnos ya publicados del nuevo.`,
      )
    ) {
      return
    }
    void conManejo(async () => {
      const r = await moverFija(alumnaId, f.plantilla_id, destino)
      return `Listo: ahora es fija los ${NOMBRE_DIA[nuevo.dia_semana].toLowerCase()} a las ${horaCorta(nuevo.hora)}. Se anularon ${r.anuladas} reserva${r.anuladas === 1 ? '' : 's'} del horario anterior y se la anotó en ${r.anotadas} turno${r.anotadas === 1 ? '' : 's'} del nuevo.`
    })
  }

  const horariosParaMover = (f: FijaDeAlumna) =>
    plantillas.filter((p) => p.activa && p.id !== f.plantilla_id && !fijas.some((x) => x.plantilla_id === p.id))

  return (
    <div>
      <h3>Turnos fijos</h3>
      {fijas.length === 0 ? (
        <p className="ayuda">No tiene turnos fijos.</p>
      ) : (
        <ul className="lista-asignados">
          {fijas.map((f) => (
            <li key={f.plantilla_id}>
              <div className="fila-asignado">
                <span>
                  {NOMBRE_DIA[f.dia_semana]} {horaCorta(f.hora)}
                  {f.instructor ? <span className="ayuda"> · {f.instructor}</span> : null}
                </span>
                <span className="acciones-pago">
                  <button
                    type="button"
                    className="link-secundario"
                    disabled={ocupado}
                    onClick={() => {
                      setEditando(editando === `f:${f.plantilla_id}` ? null : `f:${f.plantilla_id}`)
                      setDestino('')
                    }}
                  >
                    Mover
                  </button>
                  <button type="button" className="link-peligro" disabled={ocupado} onClick={() => sacarFija(f)}>
                    Sacar
                  </button>
                </span>
              </div>
              {editando === `f:${f.plantilla_id}` && (
                <div className="form-caja">
                  <label htmlFor={`mover-fija-${f.plantilla_id}`}>Pasarla a este horario fijo:</label>
                  <select id={`mover-fija-${f.plantilla_id}`} value={destino} onChange={(e) => setDestino(e.target.value)}>
                    <option value="">Elegí un horario</option>
                    {horariosParaMover(f).map((p) => (
                      <option key={p.id} value={p.id}>
                        {NOMBRE_DIA[p.dia_semana]} {horaCorta(p.hora)}
                        {p.instructor ? ` · ${p.instructor}` : ''}
                      </option>
                    ))}
                  </select>
                  <div className="barra-acciones">
                    <button type="button" disabled={!destino || ocupado} onClick={() => moverFijaA(f)}>
                      {ocupado ? 'Moviendo...' : 'Mover'}
                    </button>
                    <button type="button" className="link-secundario" onClick={() => setEditando(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3>Próximos turnos {turnos && turnos.length > 0 ? `(${turnos.length})` : ''}</h3>
      {error && <p className="mensaje-error">{error}</p>}
      {aviso && <p className="mensaje-ok">{aviso}</p>}
      {turnos === null ? (
        <p className="ayuda">Cargando...</p>
      ) : turnos.length === 0 ? (
        <p className="ayuda">No tiene turnos próximos anotados.</p>
      ) : (
        <ul className="lista-asignados">
          {turnos.map((t) => {
            const esFija = t.plantilla_id !== null && fijas.some((f) => f.plantilla_id === t.plantilla_id)
            return (
              <li key={t.reserva_id}>
                <div className="fila-asignado">
                  <span>
                    {fechaMedia(t.fecha)} · {horaCorta(t.hora)}
                    {t.instructor ? <span className="ayuda"> · {t.instructor}</span> : null}
                    {esFija && <span className="etiqueta-fija">fijo</span>}
                    {t.estado === 'lista_espera' && <span className="etiqueta-fija">en espera</span>}
                  </span>
                  <span className="acciones-pago">
                    <button
                      type="button"
                      className="link-secundario"
                      disabled={ocupado}
                      onClick={() => void abrirCambioDeTurno(t)}
                    >
                      Cambiar
                    </button>
                    <button type="button" className="link-peligro" disabled={ocupado} onClick={() => sacarTurno(t)}>
                      Sacar
                    </button>
                  </span>
                </div>
                {editando === `t:${t.reserva_id}` && (
                  <div className="form-caja">
                    <label htmlFor={`cambiar-${t.reserva_id}`}>Pasarla a este turno:</label>
                    <select id={`cambiar-${t.reserva_id}`} value={destino} onChange={(e) => setDestino(e.target.value)}>
                      <option value="">{opciones.length === 0 ? 'No hay turnos con lugar' : 'Elegí un turno'}</option>
                      {opciones.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.texto}
                        </option>
                      ))}
                    </select>
                    <div className="barra-acciones">
                      <button type="button" disabled={!destino || ocupado} onClick={() => void cambiarTurno(t)}>
                        {ocupado ? 'Cambiando...' : 'Cambiar'}
                      </button>
                      <button type="button" className="link-secundario" onClick={() => setEditando(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

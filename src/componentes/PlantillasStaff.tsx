import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { PlantillaTurno } from '../tipos'
import {
  borrarPlantilla,
  cambiarPlantillaActiva,
  crearPlantilla,
  generarTurnos,
  listarPlantillas,
} from '../servicios/agenda'
import { NOMBRE_DIA, horaCorta } from '../fechas'

export default function PlantillasStaff() {
  const [plantillas, setPlantillas] = useState<PlantillaTurno[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupadoId, setOcupadoId] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError('')
    try {
      setPlantillas(await listarPlantillas())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los turnos fijos.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const conManejo = async (id: string, fn: () => Promise<void>) => {
    setOcupadoId(id)
    setError('')
    setAviso('')
    try {
      await fn()
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción.')
    } finally {
      setOcupadoId(null)
    }
  }

  return (
    <div>
      <h2>Turnos fijos semanales</h2>
      <p className="ayuda">
        Definí acá los turnos que se repiten todas las semanas. Después tocá{' '}
        <em>Generar</em> para publicarlos en la agenda de las próximas 4 semanas.
      </p>

      <FormAltaPlantilla onCreada={cargar} />

      {error && <p className="mensaje-error">{error}</p>}
      {aviso && <p className="mensaje-ok">{aviso}</p>}

      {cargando ? (
        <p className="vacio">Cargando...</p>
      ) : plantillas.length === 0 ? (
        <p className="vacio">Todavía no cargaste ningún turno fijo.</p>
      ) : (
        <ul className="lista-plantillas">
          {plantillas.map((p) => (
            <li key={p.id} className={p.activa ? 'plantilla' : 'plantilla inactiva'}>
              <div>
                <strong>
                  {NOMBRE_DIA[p.dia_semana]} {horaCorta(p.hora)}
                </strong>
                <span className="turno-detalle">
                  {p.instructor ? `${p.instructor} · ` : ''}
                  cupo {p.cupo}
                  {!p.activa && ' · inactiva'}
                </span>
              </div>
              <div className="barra-acciones">
                <button
                  type="button"
                  disabled={ocupadoId === p.id}
                  onClick={() =>
                    conManejo(p.id, async () => {
                      const creados = await generarTurnos(p.id, 4)
                      setAviso(
                        creados > 0
                          ? `Se publicaron ${creados} turno${creados === 1 ? '' : 's'} en la agenda.`
                          : 'No había turnos nuevos para publicar (ya estaban todos).',
                      )
                    })
                  }
                >
                  Generar
                </button>
                <button
                  type="button"
                  className="link-secundario"
                  disabled={ocupadoId === p.id}
                  onClick={() => conManejo(p.id, () => cambiarPlantillaActiva(p.id, !p.activa))}
                >
                  {p.activa ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  type="button"
                  className="link-peligro"
                  disabled={ocupadoId === p.id}
                  onClick={() => {
                    if (
                      confirm(
                        'Borrar el turno fijo. Los turnos ya publicados en la agenda quedan como están.',
                      )
                    ) {
                      conManejo(p.id, () => borrarPlantilla(p.id))
                    }
                  }}
                >
                  Borrar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FormAltaPlantilla({ onCreada }: { onCreada: () => void }) {
  const [dia, setDia] = useState('1')
  const [hora, setHora] = useState('09:00')
  const [cupo, setCupo] = useState('6')
  const [instructor, setInstructor] = useState('')
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
      await crearPlantilla({ dia_semana: Number(dia), hora, cupo: cupoNum, instructor })
      setInstructor('')
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
            {/* Semana arrancando en lunes, que es lo natural para el estudio. */}
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
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
        <div>
          <label htmlFor="pl-instructor">Instructor (opcional)</label>
          <input
            id="pl-instructor"
            value={instructor}
            onChange={(e) => setInstructor(e.target.value)}
          />
        </div>
      </div>

      {error && <p className="mensaje-error">{error}</p>}
      <button type="submit" disabled={enviando}>
        {enviando ? 'Guardando...' : 'Agregar turno fijo'}
      </button>
    </form>
  )
}

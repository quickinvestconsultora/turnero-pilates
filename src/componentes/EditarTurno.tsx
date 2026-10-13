import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Profesora, TurnoConReservas } from '../tipos'
import { editarTurno } from '../servicios/agenda'
import type { CambiosTurno } from '../servicios/agenda'
import { listarProfesoras } from '../servicios/profesoras'
import { diaSemanaPlural } from '../fechas'

const SIN_CAMBIO = '__sin-cambio'
const SIN_PROFESORA = '__ninguna'
const OTRA = '__otra'

// Panel que usa el staff para cambiar la profesora o el cupo de un turno ya
// creado. Si el turno viene de un turno fijo, ofrece aplicar el cambio a todos
// los siguientes del mismo horario.
export default function EditarTurno({
  turno,
  onGuardado,
  onCerrar,
}: {
  turno: TurnoConReservas
  onGuardado: () => void
  onCerrar: () => void
}) {
  const [profesoras, setProfesoras] = useState<Profesora[]>([])
  const [profesora, setProfesora] = useState(SIN_CAMBIO)
  const [otroNombre, setOtroNombre] = useState('')
  const [cupo, setCupo] = useState(String(turno.cupo))
  const [aSerie, setASerie] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listarProfesoras()
      .then(setProfesoras)
      .catch(() => setProfesoras([]))
  }, [])

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    const cupoNum = Number(cupo)
    if (!Number.isInteger(cupoNum) || cupoNum < 1) {
      setError('El cupo tiene que ser un número mayor a 0.')
      return
    }

    const cambios: CambiosTurno = {}
    if (cupoNum !== turno.cupo) cambios.cupo = cupoNum
    if (profesora === SIN_PROFESORA) cambios.profesora = null
    else if (profesora === OTRA) cambios.profesora = { instructor: otroNombre }
    else if (profesora !== SIN_CAMBIO) cambios.profesora = { instructoraId: profesora }

    if (Object.keys(cambios).length === 0) {
      onCerrar()
      return
    }

    setGuardando(true)
    try {
      await editarTurno(turno, cambios, aSerie)
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
      setGuardando(false)
    }
  }

  return (
    <form className="form-caja editar-turno" onSubmit={guardar}>
      <div className="grilla-campos">
        <div>
          <label htmlFor={`et-prof-${turno.id}`}>Profesora</label>
          <select
            id={`et-prof-${turno.id}`}
            value={profesora}
            onChange={(e) => setProfesora(e.target.value)}
          >
            <option value={SIN_CAMBIO}>
              {turno.instructor ? `Sigue: ${turno.instructor}` : 'Sigue sin asignar'}
            </option>
            {profesoras.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre || 'Sin nombre todavía'}
              </option>
            ))}
            <option value={OTRA}>Otra (escribir nombre)</option>
            <option value={SIN_PROFESORA}>Sin asignar</option>
          </select>
          {profesora === OTRA && (
            <input
              aria-label="Nombre de la profesora"
              value={otroNombre}
              onChange={(e) => setOtroNombre(e.target.value)}
              placeholder="Nombre"
            />
          )}
        </div>
        <div>
          <label htmlFor={`et-cupo-${turno.id}`}>Cupo</label>
          <input
            id={`et-cupo-${turno.id}`}
            type="number"
            min={1}
            value={cupo}
            onChange={(e) => setCupo(e.target.value)}
          />
        </div>
      </div>

      {turno.plantilla_id && (
        <label className="deslinde-check">
          <input type="checkbox" checked={aSerie} onChange={(e) => setASerie(e.target.checked)} />
          <span>
            Aplicar a todos los {diaSemanaPlural(turno.fecha)} de este horario, desde hoy en
            adelante
          </span>
        </label>
      )}

      {error && <p className="mensaje-error">{error}</p>}
      <div className="barra-acciones">
        <button type="submit" disabled={guardando}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
        <button type="button" className="link-secundario" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

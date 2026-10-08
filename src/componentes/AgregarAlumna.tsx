import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Perfil } from '../tipos'
import { agregarAlumnaATurno, agregarInvitadaATurno } from '../servicios/agenda'
import { listarClientes } from '../servicios/clientes'
import { nombreCompleto } from '../personas'

type Modo = 'registrada' | 'nueva'

// Formulario para anotar a alguien en un turno. Si la persona ya tiene cuenta
// se la busca y se la suma; si no, se piden los datos mínimos (nombre,
// apellido y celular) y queda anotada igual, con la marca "sin registrar".
export default function AgregarAlumna({
  turnoId,
  paraProfesora,
  onAgregada,
  onCerrar,
}: {
  turnoId: string
  paraProfesora: boolean
  onAgregada: () => void
  onCerrar: () => void
}) {
  const [modo, setModo] = useState<Modo>('registrada')
  const [clientes, setClientes] = useState<Perfil[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listarClientes(paraProfesora)
      .then(setClientes)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar la lista.'))
  }, [paraProfesora])

  const coincidencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (q.length < 2) return []
    return clientes
      .filter((c) => nombreCompleto(c).toLowerCase().includes(q) || c.telefono.includes(q))
      .slice(0, 6)
  }, [clientes, busqueda])

  const conManejo = async (fn: () => Promise<void>) => {
    setError('')
    setEnviando(true)
    try {
      await fn()
      onAgregada()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo agregar.')
      setEnviando(false)
    }
  }

  const enviarNueva = (e: FormEvent) => {
    e.preventDefault()
    void conManejo(() => agregarInvitadaATurno(turnoId, { nombre, apellido, telefono, email }))
  }

  return (
    <div className="agregar-alumna">
      <div className="asistencia">
        <button
          type="button"
          className={modo === 'registrada' ? 'activo-neutro' : ''}
          onClick={() => setModo('registrada')}
        >
          Ya registrada
        </button>
        <button
          type="button"
          className={modo === 'nueva' ? 'activo-neutro' : ''}
          onClick={() => setModo('nueva')}
        >
          Todavía no se registró
        </button>
      </div>

      {modo === 'registrada' ? (
        <div>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o celular"
            aria-label="Buscar alumna"
            autoFocus
          />
          {busqueda.trim().length >= 2 && coincidencias.length === 0 && (
            <p className="ayuda">
              No hay nadie con ese dato. Si todavía no se registró, usá la otra pestaña.
            </p>
          )}
          <ul className="agregar-resultados">
            {coincidencias.map((c) => (
              <li key={c.id}>
                <span>
                  {nombreCompleto(c)}
                  <span className="ayuda"> · {c.telefono || 'sin celular'}</span>
                </span>
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => void conManejo(() => agregarAlumnaATurno(turnoId, c.id))}
                >
                  Agregar
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <form onSubmit={enviarNueva}>
          <div className="grilla-campos">
            <div>
              <label htmlFor={`ag-nombre-${turnoId}`}>Nombre</label>
              <input
                id={`ag-nombre-${turnoId}`}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor={`ag-apellido-${turnoId}`}>Apellido</label>
              <input
                id={`ag-apellido-${turnoId}`}
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor={`ag-tel-${turnoId}`}>Celular</label>
              <input
                id={`ag-tel-${turnoId}`}
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                inputMode="tel"
                placeholder="Con código de área"
                required
              />
            </div>
            <div>
              <label htmlFor={`ag-mail-${turnoId}`}>Mail (opcional)</label>
              <input
                id={`ag-mail-${turnoId}`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Para avisarle más adelante"
              />
            </div>
          </div>
          <button type="submit" disabled={enviando}>
            {enviando ? 'Agregando...' : 'Agregar al turno'}
          </button>
        </form>
      )}

      {error && <p className="mensaje-error">{error}</p>}

      <button type="button" className="link-secundario" onClick={onCerrar}>
        Cancelar
      </button>
    </div>
  )
}

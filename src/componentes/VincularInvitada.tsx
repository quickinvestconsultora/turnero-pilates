import { useEffect, useMemo, useState } from 'react'
import type { Invitada, Perfil } from '../tipos'
import { vincularInvitada } from '../servicios/agenda'
import { listarClientes } from '../servicios/clientes'
import { nombreCompleto } from '../personas'

// Cuando alguien se anotó "sin registrar" y después se sabe quién es: se la
// busca entre las alumnas registradas y su anotación pasa a su cuenta.
export default function VincularInvitada({
  invitada,
  paraProfesora,
  onVinculada,
  onCerrar,
}: {
  invitada: Invitada
  paraProfesora: boolean
  onVinculada: () => void
  onCerrar: () => void
}) {
  const [clientes, setClientes] = useState<Perfil[]>([])
  const [busqueda, setBusqueda] = useState(nombreCompleto(invitada))
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

  const vincular = async (alumna: Perfil) => {
    if (
      !window.confirm(
        `¿Pasar la anotación de ${nombreCompleto(invitada)} a la cuenta de ${nombreCompleto(alumna)}?`,
      )
    ) {
      return
    }
    setError('')
    setEnviando(true)
    try {
      await vincularInvitada(invitada.id, alumna.id)
      onVinculada()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo vincular.')
      setEnviando(false)
    }
  }

  return (
    <div className="agregar-alumna">
      <p className="ayuda">
        Buscá la cuenta de <strong>{nombreCompleto(invitada)}</strong> para pasarle este turno.
      </p>
      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre o celular"
        aria-label="Buscar cuenta"
        autoFocus
      />
      {busqueda.trim().length >= 2 && coincidencias.length === 0 && (
        <p className="ayuda">No hay ninguna cuenta con ese dato todavía.</p>
      )}
      <ul className="agregar-resultados">
        {coincidencias.map((c) => (
          <li key={c.id}>
            <span>
              {nombreCompleto(c)}
              <span className="ayuda"> · {c.telefono || 'sin celular'}</span>
            </span>
            <button type="button" disabled={enviando} onClick={() => void vincular(c)}>
              Vincular
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mensaje-error">{error}</p>}
      <button type="button" className="link-secundario" onClick={onCerrar}>
        Cancelar
      </button>
    </div>
  )
}

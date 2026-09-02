import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Perfil } from '../tipos'
import { actualizarMiPerfil } from '../servicios/perfil'

type Props = {
  perfil: Perfil
  onCerrar: () => void
  onGuardado: (p: Perfil) => void
}

export default function EditarPerfil({ perfil, onCerrar, onGuardado }: Props) {
  const [nombre, setNombre] = useState(perfil.nombre)
  const [telefono, setTelefono] = useState(perfil.telefono ?? '')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setGuardando(true)
    try {
      await actualizarMiPerfil({ nombre, telefono })
      onGuardado({ ...perfil, nombre: nombre.trim(), telefono: telefono.trim() || null })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
      setGuardando(false)
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Mis datos</h2>
        <form onSubmit={guardar}>
          <label htmlFor="p-nombre">Nombre y apellido</label>
          <input
            id="p-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />

          <label htmlFor="p-telefono">Teléfono</label>
          <input
            id="p-telefono"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            inputMode="tel"
          />

          {error && <p className="mensaje-error">{error}</p>}

          <div className="modal-botones">
            <button type="button" className="btn-fantasma" onClick={onCerrar}>
              Cancelar
            </button>
            <button type="submit" disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

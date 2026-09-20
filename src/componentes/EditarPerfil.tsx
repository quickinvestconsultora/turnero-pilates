import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Nivel, Perfil } from '../tipos'
import { actualizarMiPerfil } from '../servicios/perfil'

type Props = {
  perfil: Perfil
  onCerrar: () => void
  onGuardado: (p: Perfil) => void
}

export default function EditarPerfil({ perfil, onCerrar, onGuardado }: Props) {
  const [nombre, setNombre] = useState(perfil.nombre)
  const [telefono, setTelefono] = useState(perfil.telefono)
  const [nivel, setNivel] = useState<Nivel | ''>(perfil.nivel ?? '')
  const [lesiones, setLesiones] = useState(perfil.lesiones ?? '')
  const [contactoNombre, setContactoNombre] = useState(perfil.contacto_emergencia_nombre ?? '')
  const [contactoTelefono, setContactoTelefono] = useState(
    perfil.contacto_emergencia_telefono ?? '',
  )
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setGuardando(true)
    try {
      await actualizarMiPerfil({
        nombre,
        telefono,
        nivel: nivel || null,
        lesiones,
        contactoEmergenciaNombre: contactoNombre,
        contactoEmergenciaTelefono: contactoTelefono,
      })
      onGuardado({
        ...perfil,
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        nivel: nivel || null,
        lesiones: lesiones.trim() || null,
        contacto_emergencia_nombre: contactoNombre.trim() || null,
        contacto_emergencia_telefono: contactoTelefono.trim() || null,
      })
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
            required
          />

          <label htmlFor="p-nivel">Nivel</label>
          <select id="p-nivel" value={nivel} onChange={(e) => setNivel(e.target.value as Nivel | '')}>
            <option value="">Sin especificar</option>
            <option value="principiante">Principiante</option>
            <option value="intermedio">Intermedio</option>
            <option value="avanzado">Avanzado</option>
          </select>

          <label htmlFor="p-lesiones">Lesiones u observaciones</label>
          <input
            id="p-lesiones"
            value={lesiones}
            onChange={(e) => setLesiones(e.target.value)}
            placeholder="Lo que el instructor debería saber antes de la clase"
          />

          <label htmlFor="p-contacto-nombre">Contacto de emergencia</label>
          <input
            id="p-contacto-nombre"
            value={contactoNombre}
            onChange={(e) => setContactoNombre(e.target.value)}
            placeholder="Nombre"
          />
          <label htmlFor="p-contacto-telefono" className="oculto-visualmente">
            Teléfono del contacto de emergencia
          </label>
          <input
            id="p-contacto-telefono"
            value={contactoTelefono}
            onChange={(e) => setContactoTelefono(e.target.value)}
            inputMode="tel"
            placeholder="Teléfono"
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

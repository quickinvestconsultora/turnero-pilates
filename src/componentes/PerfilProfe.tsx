import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { Perfil } from '../tipos'
import { guardarPerfilProfe, subirFotoPerfil } from '../servicios/profesoras'
import FotoProfe from './FotoProfe'

// "Mi perfil" de la profesora: lo que las alumnas ven al tocar su nombre.
export default function PerfilProfe({
  perfil,
  onGuardado,
}: {
  perfil: Perfil
  onGuardado: (p: Perfil) => void
}) {
  const [nombre, setNombre] = useState(perfil.nombre)
  const [apellido, setApellido] = useState(perfil.apellido)
  const [telefono, setTelefono] = useState(perfil.telefono)
  const [bio, setBio] = useState(perfil.bio ?? '')
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  const elegirFoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setError('')
    setAviso('')
    setSubiendo(true)
    try {
      const url = await subirFotoPerfil(perfil.id, archivo)
      onGuardado({ ...perfil, foto_url: url })
      setAviso('Foto actualizada.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la foto.')
    } finally {
      setSubiendo(false)
    }
  }

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setAviso('')
    setGuardando(true)
    try {
      await guardarPerfilProfe(perfil.id, { nombre, apellido, telefono, bio })
      onGuardado({
        ...perfil,
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        telefono: telefono.trim(),
        bio: bio.trim() || null,
      })
      setAviso('Guardado.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <h2>Mi perfil</h2>
      <p className="ayuda">
        Esto es lo que ven las alumnas cuando tocan tu nombre en un turno.
      </p>

      <div className="perfil-profe-foto">
        <FotoProfe url={perfil.foto_url} nombre={perfil.nombre || 'Profe'} tam={96} />
        <label className="boton-archivo">
          {subiendo ? 'Subiendo...' : perfil.foto_url ? 'Cambiar foto' : 'Subir foto'}
          <input
            type="file"
            accept="image/*"
            onChange={elegirFoto}
            disabled={subiendo}
            className="oculto-visualmente"
          />
        </label>
      </div>

      <form className="form-caja" onSubmit={guardar}>
        <div className="grilla-campos">
          <div>
            <label htmlFor="pp-nombre">Nombre</label>
            <input
              id="pp-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="pp-apellido">Apellido</label>
            <input
              id="pp-apellido"
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="pp-telefono">Celular</label>
            <input
              id="pp-telefono"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              inputMode="tel"
            />
          </div>
        </div>

        <label htmlFor="pp-bio">Sobre mí</label>
        <textarea
          id="pp-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={5}
          maxLength={600}
          placeholder="Contales a las alumnas quién sos: tu formación, cómo das tus clases, qué te gusta…"
        />
        <span className="ayuda">{bio.length}/600</span>

        {error && <p className="mensaje-error">{error}</p>}
        {aviso && <p className="mensaje-ok">{aviso}</p>}
        <button type="submit" disabled={guardando}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </form>
    </div>
  )
}

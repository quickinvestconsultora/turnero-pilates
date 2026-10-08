import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { Perfil, Profesora } from '../tipos'
import {
  borrarFotoGaleria,
  guardarPerfilProfe,
  listarFotosGaleria,
  subirFotoGaleria,
  subirFotoPerfil,
  usuarioInstagram,
} from '../servicios/profesoras'
import type { FotoGaleria } from '../servicios/profesoras'
import { nombreCompleto } from '../personas'
import FotoProfe from './FotoProfe'
import TarjetaProfesora from './TarjetaProfesora'

// "Mi perfil" de la profesora: lo que las alumnas ven al tocar su nombre en
// un turno. Abajo hay una vista previa en vivo de cómo queda.
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
  const [frase, setFrase] = useState(perfil.frase ?? '')
  const [experiencia, setExperiencia] = useState(perfil.experiencia ?? '')
  const [especialidades, setEspecialidades] = useState(perfil.especialidades ?? '')
  const [formacion, setFormacion] = useState(perfil.formacion ?? '')
  const [instagram, setInstagram] = useState(perfil.instagram ?? '')
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [galeria, setGaleria] = useState<FotoGaleria[]>([])
  const [subiendoGaleria, setSubiendoGaleria] = useState(false)

  useEffect(() => {
    listarFotosGaleria()
      .then((todas) => setGaleria(todas.filter((f) => f.profesora_id === perfil.id)))
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudieron cargar las fotos.'))
  }, [perfil.id])

  const agregarFotos = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivos = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (archivos.length === 0) return
    setError('')
    setAviso('')
    setSubiendoGaleria(true)
    try {
      // De a una: el tope de 8 lo controla la base y corta con un mensaje claro.
      for (const archivo of archivos) await subirFotoGaleria(perfil.id, archivo)
      setAviso(archivos.length === 1 ? 'Foto agregada.' : 'Fotos agregadas.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la foto.')
    } finally {
      const todas = await listarFotosGaleria().catch(() => [])
      setGaleria(todas.filter((f) => f.profesora_id === perfil.id))
      setSubiendoGaleria(false)
    }
  }

  const quitarFoto = async (foto: FotoGaleria) => {
    if (!window.confirm('¿Borrar esta foto de tu ficha?')) return
    setError('')
    try {
      await borrarFotoGaleria(foto)
      setGaleria((g) => g.filter((f) => f.id !== foto.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar la foto.')
    }
  }

  const previa: Profesora = {
    id: perfil.id,
    nombre: nombreCompleto({ nombre, apellido }) === 'Sin nombre' ? '' : nombreCompleto({ nombre, apellido }),
    bio: bio.trim() || null,
    foto_url: perfil.foto_url,
    formacion: formacion.trim() || null,
    especialidades: especialidades.trim() || null,
    experiencia: experiencia.trim() || null,
    frase: frase.trim() || null,
    instagram: usuarioInstagram(instagram) || null,
  }

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
      await guardarPerfilProfe(perfil.id, {
        nombre,
        apellido,
        telefono,
        bio,
        formacion,
        especialidades,
        experiencia,
        frase,
        instagram,
      })
      onGuardado({
        ...perfil,
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        telefono: telefono.trim(),
        bio: previa.bio,
        formacion: previa.formacion,
        especialidades: previa.especialidades,
        experiencia: previa.experiencia,
        frase: previa.frase,
        instagram: previa.instagram,
      })
      setAviso('Guardado. Las alumnas ya ven tu perfil actualizado.')
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
        Armá tu ficha: es lo que ven las alumnas cuando tocan tu nombre en un turno. Completá solo
        lo que quieras mostrar.
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

      <h3 className="previa-titulo">Más fotos ({galeria.length}/8)</h3>
      <p className="ayuda">
        Sumá fotos tuyas dando clase, del espacio, de lo que quieras mostrar. Se suben al instante.
      </p>
      <div className="galeria-editor">
        {galeria.map((f) => (
          <div key={f.id} className="galeria-item">
            <img src={f.url} alt="Foto de tu ficha" loading="lazy" />
            <button
              type="button"
              className="galeria-borrar"
              aria-label="Borrar foto"
              onClick={() => quitarFoto(f)}
            >
              ×
            </button>
          </div>
        ))}
        {galeria.length < 8 && (
          <label className="galeria-agregar">
            {subiendoGaleria ? 'Subiendo...' : '+ Agregar fotos'}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={agregarFotos}
              disabled={subiendoGaleria}
              className="oculto-visualmente"
            />
          </label>
        )}
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
            <label htmlFor="pp-telefono">Celular (no se muestra)</label>
            <input
              id="pp-telefono"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              inputMode="tel"
            />
          </div>
          <div>
            <label htmlFor="pp-experiencia">Experiencia</label>
            <input
              id="pp-experiencia"
              value={experiencia}
              onChange={(e) => setExperiencia(e.target.value)}
              maxLength={60}
              placeholder="Ej: 8 años enseñando"
            />
          </div>
        </div>

        <label htmlFor="pp-frase">Una frase tuya</label>
        <input
          id="pp-frase"
          value={frase}
          onChange={(e) => setFrase(e.target.value)}
          maxLength={140}
          placeholder="Ej: El movimiento es la mejor medicina"
        />

        <label htmlFor="pp-esp">Especialidades</label>
        <input
          id="pp-esp"
          value={especialidades}
          onChange={(e) => setEspecialidades(e.target.value)}
          maxLength={200}
          placeholder="Separadas por coma: Pilates mat, Reformer, Embarazadas"
        />

        <label htmlFor="pp-bio">Sobre mí</label>
        <textarea
          id="pp-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          maxLength={600}
          placeholder="Contales a las alumnas quién sos y cómo das tus clases."
        />
        <span className="ayuda">{bio.length}/600</span>

        <label htmlFor="pp-formacion">Formación</label>
        <textarea
          id="pp-formacion"
          value={formacion}
          onChange={(e) => setFormacion(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Títulos, cursos, certificaciones…"
        />

        <label htmlFor="pp-ig">Instagram</label>
        <input
          id="pp-ig"
          value={instagram}
          onChange={(e) => setInstagram(e.target.value)}
          placeholder="@tuusuario"
          autoCapitalize="none"
        />

        {error && <p className="mensaje-error">{error}</p>}
        {aviso && <p className="mensaje-ok">{aviso}</p>}
        <button type="submit" disabled={guardando}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </form>

      <h3 className="previa-titulo">Así te ven las alumnas</h3>
      <div className="previa-profesora">
        <TarjetaProfesora profesora={previa} fotos={galeria.map((f) => f.url)} />
      </div>
    </div>
  )
}

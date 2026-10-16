import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { Nivel, Perfil } from '../tipos'
import { actualizarMiPerfil } from '../servicios/perfil'
import { quitarFotoAlumna, subirFotoAlumna } from '../servicios/ficha'
import DocumentosAlumna from './DocumentosAlumna'
import FotoAlumna from './FotoAlumna'

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
  const [fechaNacimiento, setFechaNacimiento] = useState(perfil.fecha_nacimiento ?? '')
  const [objetivo, setObjetivo] = useState(perfil.objetivo ?? '')
  const [experiencia, setExperiencia] = useState(perfil.experiencia_previa ?? '')
  const [fotoRuta, setFotoRuta] = useState(perfil.foto_ruta)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const elegirFoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setError('')
    setSubiendoFoto(true)
    try {
      setFotoRuta(await subirFotoAlumna(perfil.id, archivo))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la foto.')
    } finally {
      setSubiendoFoto(false)
    }
  }

  const sacarFoto = async () => {
    if (!fotoRuta || !window.confirm('¿Sacar tu foto?')) return
    setError('')
    try {
      await quitarFotoAlumna(perfil.id, fotoRuta)
      setFotoRuta(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo sacar la foto.')
    }
  }

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
        fechaNacimiento,
        objetivo,
        experienciaPrevia: experiencia,
      })
      onGuardado({
        ...perfil,
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        nivel: nivel || null,
        fecha_nacimiento: fechaNacimiento || null,
        objetivo: objetivo.trim() || null,
        experiencia_previa: experiencia.trim() || null,
        foto_ruta: fotoRuta,
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
      <div className="modal mi-cuenta" onClick={(e) => e.stopPropagation()}>
        <h2>Mis datos</h2>

        <div className="perfil-profe-foto">
          <FotoAlumna ruta={fotoRuta} nombre={nombre} tam={72} />
          <div className="barra-acciones">
            <label className="boton-archivo">
              {subiendoFoto ? 'Subiendo...' : fotoRuta ? 'Cambiar foto' : 'Subir foto (opcional)'}
              <input
                type="file"
                accept="image/*"
                onChange={elegirFoto}
                disabled={subiendoFoto}
                className="oculto-visualmente"
              />
            </label>
            {fotoRuta && (
              <button type="button" className="link-secundario" onClick={sacarFoto}>
                Sacar
              </button>
            )}
          </div>
        </div>
        <p className="ayuda">
          Tu foto, tus datos y tus documentos solo los ven el estudio y tus profesoras.
        </p>

        <form onSubmit={guardar}>
          <label htmlFor="p-nombre">Nombre y apellido</label>
          <input
            id="p-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />

          <label htmlFor="p-telefono">Celular</label>
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

          <label htmlFor="p-nacimiento">Fecha de nacimiento</label>
          <input
            id="p-nacimiento"
            type="date"
            value={fechaNacimiento}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setFechaNacimiento(e.target.value)}
          />

          <label htmlFor="p-objetivo">¿Qué querés lograr?</label>
          <textarea
            id="p-objetivo"
            value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
            rows={2}
            maxLength={400}
            placeholder="Ej: fortalecer la espalda, mejorar la postura, bajar el estrés"
          />

          <label htmlFor="p-experiencia">Experiencia previa</label>
          <textarea
            id="p-experiencia"
            value={experiencia}
            onChange={(e) => setExperiencia(e.target.value)}
            rows={2}
            maxLength={400}
            placeholder="Ej: hice pilates 2 años, nunca entrené con máquinas"
          />

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

        <h3 className="documentos-titulo">Mis documentos</h3>
        <p className="ayuda">
          Si querés, subí tu certificado médico, estudios u otros papeles que el estudio deba tener.
        </p>
        <DocumentosAlumna alumnaId={perfil.id} puedeEditar />
      </div>
    </div>
  )
}

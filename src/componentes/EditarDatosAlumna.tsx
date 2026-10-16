import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { Nivel, Perfil } from '../tipos'
import { actualizarDatosAlumna } from '../servicios/clientes'
import { quitarFotoAlumna, subirFotoAlumna } from '../servicios/ficha'
import FotoAlumna from './FotoAlumna'

// El staff corrige o completa los datos de una alumna desde su ficha (por
// ejemplo, de alguien que no usa la app o cargó algo mal).
export default function EditarDatosAlumna({
  alumna,
  onGuardado,
  onCerrar,
}: {
  alumna: Perfil
  onGuardado: () => void
  onCerrar: () => void
}) {
  const [nombre, setNombre] = useState(alumna.nombre)
  const [apellido, setApellido] = useState(alumna.apellido)
  const [dni, setDni] = useState(alumna.dni ?? '')
  const [telefono, setTelefono] = useState(alumna.telefono)
  const [nivel, setNivel] = useState<Nivel | ''>(alumna.nivel ?? '')
  const [nacimiento, setNacimiento] = useState(alumna.fecha_nacimiento ?? '')
  const [objetivo, setObjetivo] = useState(alumna.objetivo ?? '')
  const [experiencia, setExperiencia] = useState(alumna.experiencia_previa ?? '')
  const [lesiones, setLesiones] = useState(alumna.lesiones ?? '')
  const [contactoNombre, setContactoNombre] = useState(alumna.contacto_emergencia_nombre ?? '')
  const [contactoTelefono, setContactoTelefono] = useState(
    alumna.contacto_emergencia_telefono ?? '',
  )
  const [fotoRuta, setFotoRuta] = useState(alumna.foto_ruta)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const elegirFoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setError('')
    setSubiendoFoto(true)
    try {
      setFotoRuta(await subirFotoAlumna(alumna.id, archivo))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la foto.')
    } finally {
      setSubiendoFoto(false)
    }
  }

  const sacarFoto = async () => {
    if (!fotoRuta || !window.confirm('¿Sacar la foto de esta alumna?')) return
    setError('')
    try {
      await quitarFotoAlumna(alumna.id, fotoRuta)
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
      await actualizarDatosAlumna(alumna.id, {
        nombre,
        apellido,
        dni,
        telefono,
        nivel: nivel || null,
        fecha_nacimiento: nacimiento || null,
        objetivo,
        experiencia_previa: experiencia,
        lesiones,
        contacto_emergencia_nombre: contactoNombre,
        contacto_emergencia_telefono: contactoTelefono,
      })
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
      setGuardando(false)
    }
  }

  const id = (campo: string) => 'eda-' + campo + '-' + alumna.id

  return (
    <form className="form-caja editar-datos-alumna" onSubmit={guardar}>
      <div className="perfil-profe-foto">
        <FotoAlumna ruta={fotoRuta} nombre={nombre} tam={64} />
        <div className="barra-acciones">
          <label className="boton-archivo">
            {subiendoFoto ? 'Subiendo...' : fotoRuta ? 'Cambiar foto' : 'Subir foto'}
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

      <div className="grilla-campos">
        <div>
          <label htmlFor={id('nombre')}>Nombre</label>
          <input id={id('nombre')} value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </div>
        <div>
          <label htmlFor={id('apellido')}>Apellido</label>
          <input id={id('apellido')} value={apellido} onChange={(e) => setApellido(e.target.value)} />
        </div>
        <div>
          <label htmlFor={id('dni')}>DNI</label>
          <input
            id={id('dni')}
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            inputMode="numeric"
          />
        </div>
        <div>
          <label htmlFor={id('tel')}>Celular</label>
          <input
            id={id('tel')}
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            inputMode="tel"
          />
        </div>
        <div>
          <label htmlFor={id('nac')}>Fecha de nacimiento</label>
          <input
            id={id('nac')}
            type="date"
            value={nacimiento}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setNacimiento(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={id('nivel')}>Nivel</label>
          <select id={id('nivel')} value={nivel} onChange={(e) => setNivel(e.target.value as Nivel | '')}>
            <option value="">Sin especificar</option>
            <option value="principiante">Principiante</option>
            <option value="intermedio">Intermedio</option>
            <option value="avanzado">Avanzado</option>
          </select>
        </div>
      </div>

      <label htmlFor={id('objetivo')}>Objetivo</label>
      <textarea
        id={id('objetivo')}
        value={objetivo}
        onChange={(e) => setObjetivo(e.target.value)}
        rows={2}
        maxLength={400}
      />

      <label htmlFor={id('exp')}>Experiencia previa</label>
      <textarea
        id={id('exp')}
        value={experiencia}
        onChange={(e) => setExperiencia(e.target.value)}
        rows={2}
        maxLength={400}
      />

      <label htmlFor={id('les')}>Lesiones u observaciones</label>
      <textarea
        id={id('les')}
        value={lesiones}
        onChange={(e) => setLesiones(e.target.value)}
        rows={2}
      />

      <div className="grilla-campos">
        <div>
          <label htmlFor={id('cn')}>Contacto de emergencia</label>
          <input
            id={id('cn')}
            value={contactoNombre}
            onChange={(e) => setContactoNombre(e.target.value)}
            placeholder="Nombre"
          />
        </div>
        <div>
          <label htmlFor={id('ct')}>Teléfono del contacto</label>
          <input
            id={id('ct')}
            value={contactoTelefono}
            onChange={(e) => setContactoTelefono(e.target.value)}
            inputMode="tel"
          />
        </div>
      </div>

      {error && <p className="mensaje-error">{error}</p>}
      <div className="barra-acciones">
        <button type="submit" disabled={guardando}>
          {guardando ? 'Guardando...' : 'Guardar datos'}
        </button>
        <button type="button" className="link-secundario" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

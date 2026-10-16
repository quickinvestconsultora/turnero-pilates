import { useState } from 'react'
import { TABLAS_RESPALDO, descargarRespaldo } from '../servicios/respaldo'

// Copia de seguridad: baja los datos del estudio a archivos para Excel. Sirve
// para tener una copia propia por si algo se borra o se rompe.
export default function Respaldo() {
  const [descargando, setDescargando] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')

  const bajar = async (clave: string, etiqueta: string) => {
    setError('')
    setAviso('')
    setDescargando(clave)
    try {
      const n = await descargarRespaldo(clave)
      setAviso(`${etiqueta}: ${n} fila${n === 1 ? '' : 's'} descargada${n === 1 ? '' : 's'}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar.')
    } finally {
      setDescargando(null)
    }
  }

  const bajarTodo = async () => {
    setError('')
    setAviso('')
    try {
      for (const t of TABLAS_RESPALDO) {
        setDescargando(t.clave)
        await descargarRespaldo(t.clave)
        // Pausa corta: algunos navegadores bloquean varias descargas seguidas.
        await new Promise((r) => setTimeout(r, 600))
      }
      setAviso('Listo: se descargaron todos los archivos. Guardalos en un lugar seguro.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la descarga.')
    } finally {
      setDescargando(null)
    }
  }

  return (
    <div>
      <div className="fila-titulo">
        <h2>Copia de seguridad</h2>
        <button type="button" disabled={descargando !== null} onClick={bajarTodo}>
          {descargando ? 'Descargando...' : 'Descargar todo'}
        </button>
      </div>
      <p className="ayuda">
        Baja los datos del estudio en archivos que abre Excel. Conviene hacerlo cada tanto y
        guardarlos fuera de la app (en tu computadora o en Drive). Si el navegador pregunta si
        permitís varias descargas, decile que sí.
      </p>

      {error && <p className="mensaje-error">{error}</p>}
      {aviso && <p className="mensaje-ok">{aviso}</p>}

      <ul className="lista-respaldo">
        {TABLAS_RESPALDO.map((t) => (
          <li key={t.clave}>
            <div>
              <strong>{t.etiqueta}</strong>
              <span className="turno-detalle">{t.descripcion}</span>
            </div>
            <button
              type="button"
              className="link-secundario"
              disabled={descargando !== null}
              onClick={() => bajar(t.clave, t.etiqueta)}
            >
              {descargando === t.clave ? '...' : 'Descargar'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

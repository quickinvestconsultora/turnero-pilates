import { useCallback, useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  ETIQUETA_CATEGORIA,
  borrarDocumento,
  listarDocumentos,
  subirDocumento,
  urlFicha,
} from '../servicios/ficha'
import type { CategoriaDocumento, Documento } from '../servicios/ficha'

// Documentos de la ficha de una alumna (certificado médico, estudios, etc.).
// puedeEditar: ella misma y el staff suben y borran; las profesoras solo miran.
export default function DocumentosAlumna({
  alumnaId,
  puedeEditar,
}: {
  alumnaId: string
  puedeEditar: boolean
}) {
  const [docs, setDocs] = useState<Documento[] | null>(null)
  const [categoria, setCategoria] = useState<CategoriaDocumento>('certificado')
  const [nombre, setNombre] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    try {
      setDocs(await listarDocumentos(alumnaId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los documentos.')
    }
  }, [alumnaId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const elegir = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setError('')
    setSubiendo(true)
    try {
      await subirDocumento(alumnaId, archivo, nombre, categoria)
      setNombre('')
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el documento.')
    } finally {
      setSubiendo(false)
    }
  }

  const ver = async (d: Documento) => {
    setError('')
    try {
      window.open(await urlFicha(d.ruta), '_blank', 'noopener')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el documento.')
    }
  }

  const quitar = async (d: Documento) => {
    if (!window.confirm(`¿Borrar "${d.nombre}"?`)) return
    setError('')
    try {
      await borrarDocumento(d)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar.')
    }
  }

  return (
    <div className="documentos-alumna">
      {docs === null ? (
        <p className="ayuda">Cargando...</p>
      ) : docs.length === 0 ? (
        <p className="ayuda">Todavía no hay documentos cargados.</p>
      ) : (
        <ul className="ficha-historial">
          {docs.map((d) => (
            <li key={d.id}>
              <span>
                <strong>{d.nombre}</strong>{' '}
                <span className="ayuda">
                  · {ETIQUETA_CATEGORIA[d.categoria]} ·{' '}
                  {new Date(d.creado_en).toLocaleDateString('es-AR')}
                </span>
              </span>
              <span className="barra-acciones">
                <button type="button" className="link-secundario" onClick={() => ver(d)}>
                  Ver
                </button>
                {puedeEditar && (
                  <button type="button" className="link-secundario" onClick={() => quitar(d)}>
                    Borrar
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {puedeEditar && (
        <div className="documentos-subir">
          <div className="grilla-campos">
            <div>
              <label htmlFor={`doc-cat-${alumnaId}`}>Tipo</label>
              <select
                id={`doc-cat-${alumnaId}`}
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CategoriaDocumento)}
              >
                {(Object.keys(ETIQUETA_CATEGORIA) as CategoriaDocumento[]).map((c) => (
                  <option key={c} value={c}>
                    {ETIQUETA_CATEGORIA[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`doc-nombre-${alumnaId}`}>Nombre (opcional)</label>
              <input
                id={`doc-nombre-${alumnaId}`}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Apto físico 2026"
                maxLength={80}
              />
            </div>
          </div>
          <label className="boton-archivo">
            {subiendo ? 'Subiendo...' : '+ Subir foto o PDF'}
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={elegir}
              disabled={subiendo}
              className="oculto-visualmente"
            />
          </label>
        </div>
      )}

      {error && <p className="mensaje-error">{error}</p>}
    </div>
  )
}

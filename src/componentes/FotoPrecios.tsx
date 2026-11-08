import { useCallback, useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { quitarFotoPrecios, subirFotoPrecios, urlFotoPrecios } from '../servicios/precios'

// Staff: carga la foto con la lista de precios. Es la que ven las alumnas cuando tienen que
// pagar para reservar.
export default function FotoPrecios() {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    setUrl(await urlFotoPrecios())
  }, [])

  useEffect(() => {
    cargar().catch(() => setUrl(null))
  }, [cargar])

  const elegir = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setError('')
    setOcupado(true)
    try {
      await subirFotoPrecios(archivo)
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la foto.')
    } finally {
      setOcupado(false)
    }
  }

  const quitar = async () => {
    if (!window.confirm('¿Sacar la foto de precios? Las alumnas van a ver la lista de texto.')) return
    setError('')
    setOcupado(true)
    try {
      await quitarFotoPrecios()
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo sacar la foto.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div>
      <h2>Precios</h2>
      <p className="ayuda">
        Subí la foto con los valores. Es lo que ven las alumnas cuando tienen que pagar para reservar. Al subir
        una nueva, reemplaza a la anterior.
      </p>

      {error && <p className="mensaje-error">{error}</p>}

      {url === undefined ? (
        <p className="vacio">Cargando...</p>
      ) : url ? (
        <div className="precios-foto">
          <img src={url} alt="Valores de FORTEVA Studio" />
        </div>
      ) : (
        <p className="vacio">Todavía no cargaste la foto: se ve la lista de texto de config/precios.ts.</p>
      )}

      <div className="barra-acciones">
        <label className="boton-archivo">
          {ocupado ? 'Subiendo...' : url ? 'Reemplazar foto' : 'Subir foto de precios'}
          <input type="file" accept="image/*" onChange={elegir} disabled={ocupado} hidden />
        </label>
        {url && (
          <button type="button" className="link-peligro" disabled={ocupado} onClick={quitar}>
            Sacar la foto
          </button>
        )}
      </div>
    </div>
  )
}

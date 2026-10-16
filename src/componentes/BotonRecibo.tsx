import { useState } from 'react'
import { compartirRecibo, descargarRecibo, puedeCompartirArchivos } from '../servicios/recibo'
import type { DatosRecibo } from '../servicios/recibo'

// Recibo en PDF de un pago: se descarga, y en el celular también se puede
// compartir directo (WhatsApp, mail…).
export default function BotonRecibo({ datos }: { datos: DatosRecibo }) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  const correr = async (accion: (d: DatosRecibo) => Promise<void>) => {
    setError('')
    setOcupado(true)
    try {
      await accion(datos)
    } catch {
      setError('No se pudo generar el recibo.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <span className="boton-recibo">
      <button
        type="button"
        className="link-secundario"
        disabled={ocupado}
        onClick={() => correr(descargarRecibo)}
      >
        {ocupado ? 'Generando...' : 'Descargar recibo'}
      </button>
      {puedeCompartirArchivos() && (
        <button
          type="button"
          className="link-secundario"
          disabled={ocupado}
          onClick={() => correr(compartirRecibo)}
        >
          Compartir
        </button>
      )}
      {error && <span className="mensaje-error">{error}</span>}
    </span>
  )
}

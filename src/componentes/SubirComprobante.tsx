import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { subirComprobante } from '../servicios/comprobantes'

// "Ya pagué": la alumna manda la foto (o PDF) de su transferencia y el estudio
// la ve en Clientes → Pagos para confirmar.
export default function SubirComprobante({
  alumnaId,
  onSubido,
}: {
  alumnaId: string
  onSubido: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  const [enviado, setEnviado] = useState(false)

  const elegir = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setError('')
    setSubiendo(true)
    try {
      await subirComprobante(alumnaId, archivo, nota)
      setEnviado(true)
      setAbierto(false)
      setNota('')
      onSubido()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el comprobante.')
    } finally {
      setSubiendo(false)
    }
  }

  if (enviado) {
    return (
      <p className="mensaje-ok">
        ¡Listo! Recibimos tu comprobante. El estudio lo va a confirmar y te habilita los turnos.
      </p>
    )
  }

  return (
    <div className="subir-comprobante">
      {!abierto ? (
        <button type="button" className="btn-fantasma" onClick={() => setAbierto(true)}>
          Ya pagué: subir comprobante
        </button>
      ) : (
        <div className="subir-comprobante-form">
          <label htmlFor="comprobante-nota">Aclaración (opcional)</label>
          <input
            id="comprobante-nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej: pagué el mes de octubre"
            maxLength={200}
          />
          <label className="boton-archivo">
            {subiendo ? 'Enviando...' : 'Elegir foto o PDF del comprobante'}
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={elegir}
              disabled={subiendo}
              className="oculto-visualmente"
            />
          </label>
          <button type="button" className="link-secundario" onClick={() => setAbierto(false)}>
            Cancelar
          </button>
        </div>
      )}
      {error && <p className="mensaje-error">{error}</p>}
    </div>
  )
}

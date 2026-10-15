import { useCallback, useEffect, useState } from 'react'
import { cambiarRecordatorios, leerRecordatorios } from '../servicios/configuracion'
import type { EstadoRecordatorios } from '../servicios/configuracion'

// Interruptor de emergencia de los recordatorios automáticos ("tu clase es en
// 2 horas"). Pausados, la función programada sigue corriendo pero no manda
// ningún mail. Se puede reanudar cuando se quiera.
export default function ControlRecordatorios() {
  const [estado, setEstado] = useState<EstadoRecordatorios | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    try {
      setEstado(await leerRecordatorios())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el estado.')
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (!estado && !error) return null

  const cambiar = async (activos: boolean) => {
    if (
      !activos &&
      !window.confirm(
        '¿Pausar los recordatorios? No se va a mandar ningún mail de "tu clase es en 2 horas" hasta que los reanudes.',
      )
    ) {
      return
    }
    setError('')
    setGuardando(true)
    try {
      await cambiarRecordatorios(activos)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar.')
    } finally {
      setGuardando(false)
    }
  }

  const activos = estado?.activos ?? true
  const desde =
    estado?.actualizadoEn &&
    new Date(estado.actualizadoEn).toLocaleString('es-AR', {
      day: 'numeric',
      month: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div className={activos ? 'control-recordatorios' : 'control-recordatorios control-recordatorios--pausado'}>
      <div className="control-recordatorios-texto">
        <strong>
          <span className={activos ? 'punto-estado punto-estado--ok' : 'punto-estado punto-estado--pausa'} />
          Recordatorios por mail: {activos ? 'activos' : 'PAUSADOS'}
        </strong>
        <span className="ayuda">
          {activos
            ? 'Se avisa a cada alumna 2 horas antes de su clase.'
            : `No se manda ningún aviso${desde ? ` (pausados desde el ${desde})` : ''}.`}
        </span>
      </div>
      <button
        type="button"
        className={activos ? 'link-peligro' : ''}
        disabled={guardando}
        onClick={() => cambiar(!activos)}
      >
        {activos ? 'Pausar' : 'Reanudar'}
      </button>
      {error && <p className="mensaje-error">{error}</p>}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import {
  activarPush,
  appInstalada,
  desactivarPush,
  ES_IOS,
  estadoPush,
  probarNotificacion,
  pushSoportado,
  reasociarPush,
} from '../push'
import type { EstadoPush } from '../push'

const CLAVE_OCULTO = 'forteva-notificaciones-oculto'

function leerOculto(): boolean {
  try {
    return localStorage.getItem(CLAVE_OCULTO) === '1'
  } catch {
    return false
  }
}

function useNotificaciones() {
  const [estado, setEstado] = useState<EstadoPush | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  const refrescar = useCallback(async () => {
    try {
      setEstado(await estadoPush())
    } catch {
      setEstado('no_disponible')
    }
  }, [])

  useEffect(() => {
    refrescar()
    // Si el celular ya estaba suscripto, queda ligado a quien entró ahora.
    reasociarPush().catch(() => undefined)
  }, [refrescar])

  const activar = async () => {
    setError('')
    setOcupado(true)
    try {
      await activarPush()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron activar las notificaciones.')
    } finally {
      setOcupado(false)
      refrescar()
    }
  }

  const desactivar = async () => {
    setError('')
    setOcupado(true)
    try {
      await desactivarPush()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron desactivar.')
    } finally {
      setOcupado(false)
      refrescar()
    }
  }

  return { estado, ocupado, error, activar, desactivar }
}

// Cartel en la pantalla principal para activar los avisos en el celular. No se
// muestra si ya están activos, si el dispositivo no los admite, si los bloqueó
// o si ya dijo "Ahora no".
export function TarjetaNotificaciones() {
  const { estado, ocupado, error, activar } = useNotificaciones()
  const [oculto, setOculto] = useState(leerOculto)

  if (oculto || estado !== 'inactivo') return null
  // En iPhone solo funcionan con la app agregada al inicio; esa explicación ya la da el cartel de instalar.
  if (ES_IOS && !appInstalada()) return null

  const cerrar = () => {
    try {
      localStorage.setItem(CLAVE_OCULTO, '1')
    } catch {
      // Sin almacenamiento: el cartel puede volver a aparecer, no pasa nada.
    }
    setOculto(true)
  }

  return (
    <div className="instalar-app">
      <p>
        <strong>¿Te avisamos en el celular?</strong> Recordatorio de tu clase, lugares que se liberan y
        novedades del estudio, directo en la pantalla.
      </p>
      {error && <p className="mensaje-error">{error}</p>}
      <div className="barra-acciones">
        <button type="button" disabled={ocupado} onClick={activar}>
          {ocupado ? 'Activando...' : 'Activar avisos'}
        </button>
        <button type="button" className="link-secundario" onClick={cerrar}>
          Ahora no
        </button>
      </div>
    </div>
  )
}

// Sección dentro de "Mi cuenta": estado, activar/desactivar y una prueba.
export function SeccionNotificaciones() {
  const { estado, ocupado, error, activar, desactivar } = useNotificaciones()
  const [probada, setProbada] = useState('')

  if (!pushSoportado()) return null

  const probar = async () => {
    setProbada('')
    try {
      await probarNotificacion()
      setProbada('Listo: tendría que haberte llegado una notificación.')
    } catch (e) {
      setProbada(e instanceof Error ? e.message : 'No se pudo mostrar la prueba.')
    }
  }

  return (
    <>
      <h3>Avisos en el celular</h3>
      {ES_IOS && !appInstalada() ? (
        <p className="ayuda">
          En iPhone los avisos funcionan cuando la app está agregada a tu inicio: tocá Compartir →
          &quot;Agregar a inicio&quot; y abrila desde ahí.
        </p>
      ) : estado === 'bloqueado' ? (
        <p className="ayuda">
          Bloqueaste las notificaciones de este sitio. Para activarlas, habilitalas desde los ajustes del
          navegador o de la app.
        </p>
      ) : estado === 'activo' ? (
        <>
          <p className="mensaje-ok">Los avisos están activados en este celular.</p>
          <div className="barra-acciones">
            <button type="button" className="link-secundario" onClick={probar}>
              Probar
            </button>
            <button type="button" className="link-secundario" disabled={ocupado} onClick={desactivar}>
              {ocupado ? '...' : 'Desactivar'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="ayuda">
            Recibí en el celular el recordatorio de tu clase, los lugares que se liberan y las novedades
            del estudio.
          </p>
          <button type="button" disabled={ocupado || estado === null} onClick={activar}>
            {ocupado ? 'Activando...' : 'Activar avisos'}
          </button>
        </>
      )}
      {probada && <p className="ayuda">{probada}</p>}
      {error && <p className="mensaje-error">{error}</p>}
    </>
  )
}

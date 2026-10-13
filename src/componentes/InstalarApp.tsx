import { useEffect, useState } from 'react'

const CLAVE_OCULTO = 'forteva-instalar-oculto'

// Evento no estándar de Chrome/Android que permite disparar la instalación.
type EventoInstalar = Event & { prompt: () => Promise<void> }

function leerOculto(): boolean {
  try {
    return localStorage.getItem(CLAVE_OCULTO) === '1'
  } catch {
    return false
  }
}

function yaInstalada(): boolean {
  const standalone = window.matchMedia('(display-mode: standalone)').matches
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true
  return standalone || iosStandalone
}

const ES_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent)

// Cartel para que la alumna agregue el turnero a la pantalla de inicio, como
// si fuera una app. En Android muestra un botón de instalar; en iPhone explica
// los pasos (Safari no permite instalarla con un botón). No aparece si ya está
// instalada o si ya lo cerró.
export default function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null)
  const [oculto, setOculto] = useState(() => leerOculto() || yaInstalada())

  useEffect(() => {
    const alPoderInstalar = (e: Event) => {
      e.preventDefault()
      setEvento(e as EventoInstalar)
    }
    window.addEventListener('beforeinstallprompt', alPoderInstalar)
    return () => window.removeEventListener('beforeinstallprompt', alPoderInstalar)
  }, [])

  const cerrar = () => {
    try {
      localStorage.setItem(CLAVE_OCULTO, '1')
    } catch {
      // Sin almacenamiento: el cartel puede volver a aparecer, no pasa nada.
    }
    setOculto(true)
  }

  if (oculto || (!evento && !ES_IOS)) return null

  return (
    <div className="instalar-app">
      <p>
        <strong>Tenela a mano.</strong>{' '}
        {evento
          ? 'Agregá FORTEVA a tu pantalla de inicio y reservá más rápido.'
          : 'En Safari tocá el botón Compartir y elegí "Agregar a inicio" para tenerla como una app.'}
      </p>
      <div className="barra-acciones">
        {evento && (
          <button
            type="button"
            onClick={async () => {
              await evento.prompt()
              setEvento(null)
            }}
          >
            Instalar
          </button>
        )}
        <button type="button" className="link-secundario" onClick={cerrar}>
          Ahora no
        </button>
      </div>
    </div>
  )
}

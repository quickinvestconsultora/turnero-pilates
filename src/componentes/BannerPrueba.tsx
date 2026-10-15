import { useState } from 'react'
import { EMAIL_ADMINISTRACION } from '../config/pagos'
import { TEXTO_FEEDBACK, WHATSAPP_FEEDBACK } from '../config/feedback'

const CLAVE = 'forteva-banner-prueba-oculto'

function estabaOculto(): boolean {
  try {
    return sessionStorage.getItem(CLAVE) === '1'
  } catch {
    return false
  }
}

// Franja finita arriba de toda la app: avisa que es una versión de prueba y
// invita a dejar sugerencias por WhatsApp (o por mail si no hay número cargado).
// Se puede cerrar y vuelve a aparecer en la próxima visita.
export default function BannerPrueba() {
  const [oculto, setOculto] = useState(estabaOculto)
  if (oculto) return null

  const href = WHATSAPP_FEEDBACK
    ? `https://wa.me/${WHATSAPP_FEEDBACK}?text=${encodeURIComponent(TEXTO_FEEDBACK)}`
    : `mailto:${EMAIL_ADMINISTRACION}?subject=${encodeURIComponent('Sugerencia para el turnero')}&body=${encodeURIComponent(TEXTO_FEEDBACK)}`

  const cerrar = () => {
    try {
      sessionStorage.setItem(CLAVE, '1')
    } catch {
      // Sin almacenamiento: vuelve a aparecer al recargar, no pasa nada.
    }
    setOculto(true)
  }

  return (
    <div className="banner-prueba" role="note">
      <span>
        Estamos en versión de prueba. <strong>¿Qué podemos mejorar?</strong>
      </span>
      <a href={href} target="_blank" rel="noopener noreferrer" className="banner-prueba-boton">
        {WHATSAPP_FEEDBACK ? 'Escribinos por WhatsApp' : 'Contanos'}
      </a>
      <button type="button" className="banner-prueba-cerrar" onClick={cerrar} aria-label="Cerrar">
        ×
      </button>
    </div>
  )
}

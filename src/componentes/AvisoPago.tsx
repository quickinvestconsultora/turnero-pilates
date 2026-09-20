import type { Perfil } from '../tipos'
import {
  LINK_MERCADO_PAGO,
  TRANSFERENCIA_ALIAS,
  TRANSFERENCIA_TITULAR,
  WHATSAPP_NUMERO,
  linkWhatsApp,
} from '../config/pagos'

// Cartel para la alumna cuando el staff la marcó como "pendiente" de pago.
// Cada forma de pago aparece solo si el estudio cargó ese dato en
// src/config/pagos.ts — nada de links o números inventados.
export default function AvisoPago({ perfil }: { perfil: Perfil }) {
  if (perfil.estado_cuenta !== 'pendiente') return null

  const mensaje = `Hola! Soy ${perfil.nombre || 'una alumna'}, te aviso que ya hice la transferencia de mi clase en FORTEVA.`
  const hayAlgunaOpcion = Boolean(LINK_MERCADO_PAGO || TRANSFERENCIA_ALIAS || WHATSAPP_NUMERO)

  return (
    <div className="aviso-pago">
      <p>
        <strong>Tenés un pago pendiente.</strong> Podés regularizarlo así:
      </p>

      <div className="aviso-pago-opciones">
        {LINK_MERCADO_PAGO && (
          <a className="btn-fantasma" href={LINK_MERCADO_PAGO} target="_blank" rel="noopener noreferrer">
            Pagar con Mercado Pago
          </a>
        )}

        {TRANSFERENCIA_ALIAS && (
          <p className="aviso-pago-transferencia">
            Transferencia a <strong>{TRANSFERENCIA_ALIAS}</strong>
            {TRANSFERENCIA_TITULAR ? ` (${TRANSFERENCIA_TITULAR})` : ''}
          </p>
        )}

        {WHATSAPP_NUMERO && (
          <a
            className="btn-fantasma"
            href={linkWhatsApp(mensaje)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Avisar que ya transferí
          </a>
        )}
      </div>

      {!hayAlgunaOpcion && (
        <p className="ayuda">El estudio todavía no cargó una forma de pago acá. Consultale directamente.</p>
      )}
    </div>
  )
}

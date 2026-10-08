import type { Perfil } from '../tipos'
import {
  LINK_MERCADO_PAGO,
  TRANSFERENCIA_ALIAS,
  TRANSFERENCIA_TITULAR,
  WHATSAPP_NUMERO,
  linkWhatsApp,
} from '../config/pagos'
import { nombreCompleto } from '../personas'

// Botones de pago, compartidos entre el cartel de AvisoPago y el modal que
// aparece al intentar reservar sin poder. Cada uno aparece solo si el
// estudio cargó ese dato en src/config/pagos.ts — nada de links inventados.
export default function OpcionesPago({ perfil }: { perfil: Perfil }) {
  const mensaje = `Hola! Soy ${nombreCompleto(perfil)}, te aviso que ya hice el pago de mi reserva en FORTEVA Studio.`
  const hayAlgunaOpcion = Boolean(LINK_MERCADO_PAGO || TRANSFERENCIA_ALIAS || WHATSAPP_NUMERO)

  return (
    <div className="aviso-pago-opciones">
      {LINK_MERCADO_PAGO && (
        <a className="btn-fantasma" href={LINK_MERCADO_PAGO} target="_blank" rel="noopener noreferrer">
          Pagar con Mercado Pago
        </a>
      )}

      {TRANSFERENCIA_ALIAS && (
        <p className="aviso-pago-transferencia">
          Transferí al alias <strong>{TRANSFERENCIA_ALIAS}</strong>
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
          Avisar que ya pagué
        </a>
      )}

      {!hayAlgunaOpcion && (
        <p className="ayuda">El estudio todavía no cargó una forma de pago acá. Consultale directamente.</p>
      )}
    </div>
  )
}

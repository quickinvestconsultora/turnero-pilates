// Datos de pago del estudio. Completá lo que uses y dejá vacío ("") lo que
// no — la app solo muestra el botón de las formas de pago que tengan datos
// cargados acá.
export const LINK_MERCADO_PAGO = '' // ej: 'https://mpago.la/2AbC3dE'

export const TRANSFERENCIA_ALIAS = '' // ej: 'forteva.studio.mp'
export const TRANSFERENCIA_TITULAR = '' // ej: 'Vanesa Vieyra'

// Con código de país, sin espacios ni signos: ej. '5492291234567'.
export const WHATSAPP_NUMERO = ''

export function linkWhatsApp(mensaje: string): string {
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`
}

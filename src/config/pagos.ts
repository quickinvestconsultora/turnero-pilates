// Datos de pago del estudio. Completá lo que uses y dejá vacío ("") lo que
// no — la app solo muestra el botón de las formas de pago que tengan datos
// cargados acá.
export const LINK_MERCADO_PAGO = 'https://mpago.la/2yrkbKh'

export const TRANSFERENCIA_ALIAS = 'vanesa.vieyra'
export const TRANSFERENCIA_TITULAR = 'Vanesa Vieyra'

// A dónde avisar cuando una alumna ya pagó pero la app todavía no lo refleja.
export const EMAIL_ADMINISTRACION = 'fortevastudio@gmail.com'

// Con código de país, sin espacios ni signos: ej. '5492291234567'.
export const WHATSAPP_NUMERO = ''

export function linkWhatsApp(mensaje: string): string {
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`
}

// Pago online con Mercado Pago (funciones crear-pago-mp y mp-webhook en Supabase).
//   'apagado': la app sigue ofreciendo el link y la transferencia de siempre.
//   'prueba':  el botón solo lo ve quien entró una vez a /app/?mp=prueba desde ese
//              navegador (para probar con las credenciales de prueba sin exponerlo).
//   'activo':  el botón lo ven todas las alumnas.
export const PAGO_ONLINE: 'apagado' | 'prueba' | 'activo' = 'prueba'

const CLAVE_PRUEBA_MP = 'forteva-mp-prueba'

// Si la dirección trae ?mp=prueba (o ?mp=no para sacarlo), se recuerda en este navegador.
export function pagoOnlineVisible(): boolean {
  if (PAGO_ONLINE === 'activo') return true
  if (PAGO_ONLINE === 'apagado') return false
  try {
    const param = new URLSearchParams(window.location.search).get('mp')
    if (param === 'prueba') localStorage.setItem(CLAVE_PRUEBA_MP, '1')
    if (param === 'no') localStorage.removeItem(CLAVE_PRUEBA_MP)
    return localStorage.getItem(CLAVE_PRUEBA_MP) === '1'
  } catch {
    return false
  }
}

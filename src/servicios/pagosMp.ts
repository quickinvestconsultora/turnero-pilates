import { supabase } from '../lib/supabase'

export type PlanMp = 'clase' | 'mes-1' | 'mes-2' | 'mes-3'

// Pide al servidor un pago de Mercado Pago para el plan elegido y devuelve el
// link donde se paga. El monto lo define el servidor, no el navegador.
export async function crearPagoMp(plan: PlanMp): Promise<string> {
  const { data, error } = await supabase.functions.invoke('crear-pago-mp', { body: { plan } })
  if (error) {
    // Cuando la función responde con un error, el detalle viene en el cuerpo.
    let mensaje = 'No se pudo preparar el pago. Probá de nuevo en unos minutos.'
    try {
      const contexto = (error as { context?: Response }).context
      if (contexto) {
        const cuerpo = await contexto.json()
        if (cuerpo && typeof cuerpo.error === 'string') mensaje = cuerpo.error
      }
    } catch {
      // Se queda el mensaje general.
    }
    throw new Error(mensaje)
  }
  const url = (data as { url?: string } | null)?.url
  if (!url) throw new Error('Mercado Pago no devolvió el link de pago.')
  return url
}

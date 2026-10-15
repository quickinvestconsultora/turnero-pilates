import { supabase } from '../lib/supabase'

export type EstadoRecordatorios = {
  activos: boolean
  actualizadoEn: string | null
}

// Si nunca se tocó el interruptor, los recordatorios están activos.
export async function leerRecordatorios(): Promise<EstadoRecordatorios> {
  const { data, error } = await supabase
    .from('configuracion')
    .select('valor, actualizado_en')
    .eq('clave', 'recordatorios_activos')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return { activos: true, actualizadoEn: null }
  return { activos: data.valor === true, actualizadoEn: data.actualizado_en }
}

export async function cambiarRecordatorios(activos: boolean): Promise<void> {
  const { error } = await supabase.rpc('cambiar_recordatorios', { p_activos: activos })
  if (error) throw new Error(error.message)
}

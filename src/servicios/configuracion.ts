import { supabase } from '../lib/supabase'

export type EstadoRecordatorios = {
  activos: boolean
  actualizadoEn: string | null
  horas: number // cuántas horas antes de la clase se avisa (1, 2 o 3)
}

export const OPCIONES_HORAS = [1, 2, 3] as const

// Si nunca se tocaron los ajustes: avisos activos y 2 horas antes.
export async function leerRecordatorios(): Promise<EstadoRecordatorios> {
  const { data, error } = await supabase
    .from('configuracion')
    .select('clave, valor, actualizado_en')
    .in('clave', ['recordatorios_activos', 'recordatorio_horas'])
  if (error) throw new Error(error.message)

  const activo = data?.find((f) => f.clave === 'recordatorios_activos')
  const horas = data?.find((f) => f.clave === 'recordatorio_horas')
  return {
    activos: activo ? activo.valor === true : true,
    actualizadoEn: activo?.actualizado_en ?? null,
    horas: horas && [1, 2, 3].includes(Number(horas.valor)) ? Number(horas.valor) : 2,
  }
}

export async function cambiarRecordatorios(activos: boolean): Promise<void> {
  const { error } = await supabase.rpc('cambiar_recordatorios', { p_activos: activos })
  if (error) throw new Error(error.message)
}

export async function cambiarRecordatorioHoras(horas: number): Promise<void> {
  const { error } = await supabase.rpc('cambiar_recordatorio_horas', { p_horas: horas })
  if (error) throw new Error(error.message)
}

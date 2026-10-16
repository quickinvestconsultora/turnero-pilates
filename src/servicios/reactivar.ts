import { supabase } from '../lib/supabase'

export type MotivoReactivar = 'sin_venir' | 'vencido' | 'sin_empezar'

export type AlumnaParaReactivar = {
  alumna_id: string
  nombre: string
  apellido: string
  telefono: string
  estado_cuenta: string
  al_dia_hasta: string | null
  ultima_clase: string | null
  clases: number
  motivo: MotivoReactivar
  avisada_en: string | null
}

// Alumnas sin ninguna clase por delante que dejaron de venir hace `dias` días o
// más (más las de abono vencido sin renovar y las que nunca empezaron).
export async function listarParaReactivar(dias: number): Promise<AlumnaParaReactivar[]> {
  const { data, error } = await supabase.rpc('alumnas_para_reactivar', { p_dias: dias })
  if (error) throw new Error(error.message)
  return ((data ?? []) as (Omit<AlumnaParaReactivar, 'clases'> & { clases: number | string })[]).map(
    (a) => ({ ...a, clases: Number(a.clases) }),
  )
}

export async function marcarReactivacion(alumnaId: string): Promise<void> {
  const { error } = await supabase.rpc('marcar_reactivacion', { p_alumna_id: alumnaId })
  if (error) throw new Error(error.message)
}

import { supabase } from '../lib/supabase'
import type { Estadisticas } from '../tipos'
import { hoyIso, sumarDias } from '../fechas'

// Ventana fija de los últimos 30 días (incluye hoy). Simple para arrancar;
// si hace falta elegir el rango a mano, se agrega después.
export const DIAS_PERIODO = 30

export async function obtenerEstadisticas(): Promise<Estadisticas> {
  const hasta = hoyIso()
  const desde = sumarDias(hasta, -DIAS_PERIODO)

  const { data, error } = await supabase.rpc('estadisticas', {
    p_desde: desde,
    p_hasta: hasta,
  })

  if (error) throw new Error(error.message)
  return data as Estadisticas
}

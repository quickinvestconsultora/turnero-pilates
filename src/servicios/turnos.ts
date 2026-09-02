import { supabase } from '../lib/supabase'
import type { TurnoDisponible } from '../tipos'
import { hoyIso, sumarDias } from '../fechas'

// Ventana de días hacia adelante que ve el alumno.
export const DIAS_VISIBLES = 14

export async function listarTurnos(): Promise<TurnoDisponible[]> {
  const desde = hoyIso()
  const hasta = sumarDias(desde, DIAS_VISIBLES)

  const { data, error } = await supabase.rpc('listar_turnos', {
    p_desde: desde,
    p_hasta: hasta,
  })

  if (error) throw new Error(error.message)
  return (data ?? []) as TurnoDisponible[]
}

// Devuelve el estado final: 'reservada' o 'lista_espera'.
export async function reservar(turnoId: string): Promise<'reservada' | 'lista_espera'> {
  const { data, error } = await supabase.rpc('reservar_turno', { p_turno_id: turnoId })
  if (error) throw new Error(limpiarError(error.message))
  return data as 'reservada' | 'lista_espera'
}

export async function cancelar(turnoId: string): Promise<void> {
  const { error } = await supabase.rpc('cancelar_reserva', { p_turno_id: turnoId })
  if (error) throw new Error(limpiarError(error.message))
}

// Postgres antepone cosas como 'P0001: '. Nos quedamos con el texto.
function limpiarError(mensaje: string): string {
  return mensaje.replace(/^[A-Z0-9]{5}:\s*/, '')
}

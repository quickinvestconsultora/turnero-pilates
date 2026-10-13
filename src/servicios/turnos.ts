import { supabase } from '../lib/supabase'
import type { TurnoDisponible } from '../tipos'
import { hoyIso, sumarDias } from '../fechas'

// Ventana de días hacia adelante que ve el alumno.
export const DIAS_VISIBLES = 31

// Hasta cuántas horas antes del turno se puede cancelar o cambiar un lugar
// confirmado. Tiene que coincidir con el margen de cancelar_reserva() en
// supabase/schema.sql (la base es la que lo hace cumplir de verdad).
export const HORAS_LIMITE_CANCELAR = 2

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

export type ResultadoReserva = {
  estado: 'reservada' | 'lista_espera'
  primeraClase: boolean
}

export async function reservar(turnoId: string): Promise<ResultadoReserva> {
  const { data, error } = await supabase.rpc('reservar_turno', { p_turno_id: turnoId })
  if (error) throw new Error(limpiarError(error.message))
  const resultado = data as { estado: 'reservada' | 'lista_espera'; primera_clase: boolean }
  return { estado: resultado.estado, primeraClase: resultado.primera_clase }
}

export type ResultadoSerie = {
  reservadas: number
  ya_anotada: number
  sin_lugar: string[] // fechas 'YYYY-MM-DD' que estaban completas
  sin_cobertura: string[] // fechas posteriores al fin del abono
}

// Anota a la alumna en todos los turnos del mismo turno fijo dentro del mes.
export async function reservarSerie(turnoId: string): Promise<ResultadoSerie> {
  const { data, error } = await supabase.rpc('reservar_serie', { p_turno_id: turnoId })
  if (error) throw new Error(limpiarError(error.message))
  return data as ResultadoSerie
}

// La alumna ya vio el aviso de "se liberó un lugar y quedaste anotada".
export async function marcarPromocionVista(turnoId: string): Promise<void> {
  const { error } = await supabase.rpc('marcar_promocion_vista', { p_turno_id: turnoId })
  if (error) throw new Error(limpiarError(error.message))
}

export async function cancelar(turnoId: string): Promise<void> {
  const { error } = await supabase.rpc('cancelar_reserva', { p_turno_id: turnoId })
  if (error) throw new Error(limpiarError(error.message))
}

// Postgres antepone cosas como 'P0001: '. Nos quedamos con el texto.
function limpiarError(mensaje: string): string {
  return mensaje.replace(/^[A-Z0-9]{5}:\s*/, '')
}

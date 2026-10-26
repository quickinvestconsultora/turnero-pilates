import { supabase } from '../lib/supabase'

export type Fija = { plantilla_id: string; dia_semana: number; hora: string; instructor: string | null }

// Los horarios fijos de la alumna que tiene la sesión abierta.
export async function misFijas(): Promise<Fija[]> {
  const { data, error } = await supabase.rpc('mis_fijas')
  if (error) throw new Error(error.message)
  return (data ?? []) as Fija[]
}

// Deja a la alumna fija en un horario (turno fijo) y la anota en los turnos que ya
// están publicados. Devuelve a cuántos la anotó.
export async function fijarAlumna(alumnaId: string, plantillaId: string): Promise<number> {
  const { data, error } = await supabase.rpc('fijar_alumna', {
    p_alumna_id: alumnaId,
    p_plantilla_id: plantillaId,
  })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

// Deja de ser fija en ese horario; las reservas que ya tenía se mantienen.
export async function dejarFija(alumnaId: string, plantillaId: string): Promise<void> {
  const { error } = await supabase.rpc('dejar_fija', {
    p_alumna_id: alumnaId,
    p_plantilla_id: plantillaId,
  })
  if (error) throw new Error(error.message)
}

export type FijaDePlantilla = {
  alumna_id: string
  nombre: string
  apellido: string
  telefono: string
  creada_en: string
}

// Staff: las alumnas fijas de un turno fijo.
export async function fijasDePlantilla(plantillaId: string): Promise<FijaDePlantilla[]> {
  const { data, error } = await supabase.rpc('fijas_de_plantilla', { p_plantilla_id: plantillaId })
  if (error) throw new Error(error.message)
  return (data ?? []) as FijaDePlantilla[]
}

// Staff: mueve a una alumna fija de un horario a otro. Devuelve cuántas reservas
// del horario viejo se anularon y a cuántos turnos del nuevo se la anotó.
export async function moverFija(
  alumnaId: string,
  desdePlantillaId: string,
  haciaPlantillaId: string,
): Promise<{ anuladas: number; anotadas: number }> {
  const { data, error } = await supabase.rpc('mover_fija', {
    p_alumna_id: alumnaId,
    p_desde: desdePlantillaId,
    p_hasta: haciaPlantillaId,
  })
  if (error) throw new Error(error.message)
  const r = (data ?? {}) as { anuladas?: number; anotadas?: number }
  return { anuladas: Number(r.anuladas ?? 0), anotadas: Number(r.anotadas ?? 0) }
}

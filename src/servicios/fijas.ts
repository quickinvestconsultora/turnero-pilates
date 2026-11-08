import { supabase } from '../lib/supabase'
import { yaPaso } from '../fechas'

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

// Staff: cuántas alumnas fijas tiene cada turno fijo (por id de turno fijo).
export async function contarFijasPorPlantilla(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('inscripciones_fijas').select('plantilla_id')
  if (error) throw new Error(error.message)
  const cuenta: Record<string, number> = {}
  for (const f of (data ?? []) as { plantilla_id: string }[]) {
    cuenta[f.plantilla_id] = (cuenta[f.plantilla_id] ?? 0) + 1
  }
  return cuenta
}

// Staff: qué alumnas son fijas de qué turno fijo, como "plantilla|alumna".
export async function listarFijasStaff(): Promise<Set<string>> {
  const { data, error } = await supabase.from('inscripciones_fijas').select('plantilla_id, alumna_id')
  if (error) throw new Error(error.message)
  return new Set(
    ((data ?? []) as { plantilla_id: string; alumna_id: string }[]).map(
      (f) => `${f.plantilla_id}|${f.alumna_id}`,
    ),
  )
}

// Staff: los horarios fijos de una alumna.
export type FijaDeAlumna = { plantilla_id: string; dia_semana: number; hora: string; instructor: string | null }

export async function fijasDeAlumna(alumnaId: string): Promise<FijaDeAlumna[]> {
  const { data, error } = await supabase
    .from('inscripciones_fijas')
    .select('plantilla_id, plantillas_turno ( dia_semana, hora, instructor )')
    .eq('alumna_id', alumnaId)
  if (error) throw new Error(error.message)
  type Fila = {
    plantilla_id: string
    plantillas_turno: { dia_semana: number; hora: string; instructor: string | null } | null
  }
  return ((data ?? []) as unknown as Fila[])
    .flatMap((f) => (f.plantillas_turno ? [{ plantilla_id: f.plantilla_id, ...f.plantillas_turno }] : []))
    .sort((a, b) => ((a.dia_semana + 6) % 7) - ((b.dia_semana + 6) % 7) || a.hora.localeCompare(b.hora))
}

// Staff: le saca a la alumna todos sus horarios fijos de una vez. Con `tambienTurnos`
// también la baja de los turnos ya publicados (de hoy en adelante) de esos horarios.
// Devuelve cuántos horarios fijos le sacó y de cuántos turnos la bajó.
export async function sacarTodasLasFijas(
  alumnaId: string,
  tambienTurnos: boolean,
): Promise<{ fijas: number; turnos: number }> {
  const lista = await fijasDeAlumna(alumnaId)
  for (const f of lista) await dejarFija(alumnaId, f.plantilla_id)
  let turnos = 0
  if (tambienTurnos && lista.length > 0) {
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
    const { data: futuros, error: e1 } = await supabase
      .from('turnos')
      .select('id')
      .in('plantilla_id', lista.map((f) => f.plantilla_id))
      .eq('cancelado', false)
      .gte('fecha', hoy)
    if (e1) throw new Error(e1.message)
    const ids = ((futuros ?? []) as { id: string }[]).map((t) => t.id)
    if (ids.length > 0) {
      const { data: bajadas, error: e2 } = await supabase
        .from('reservas')
        .update({ estado: 'cancelada' })
        .eq('alumno_id', alumnaId)
        .eq('estado', 'reservada')
        .in('turno_id', ids)
        .select('id')
      if (e2) throw new Error(e2.message)
      turnos = (bajadas ?? []).length
    }
  }
  return { fijas: lista.length, turnos }
}

// Staff: da de baja a una alumna que ya no viene. Le saca todos los turnos fijos y la
// baja de todos los turnos que todavía no pasaron (anotada o en lista de espera). Lo ya
// dado (asistencia, pagos, ficha) no se toca. Devuelve cuántos fijos y cuántos turnos.
export async function darDeBajaAlumna(alumnaId: string): Promise<{ fijas: number; turnos: number }> {
  const lista = await fijasDeAlumna(alumnaId)
  for (const f of lista) await dejarFija(alumnaId, f.plantilla_id)

  const { data, error } = await supabase
    .from('reservas')
    .select('id, turnos!inner ( fecha, hora, cancelado )')
    .eq('alumno_id', alumnaId)
    .in('estado', ['reservada', 'lista_espera'])
  if (error) throw new Error(error.message)
  type Fila = { id: string; turnos: { fecha: string; hora: string; cancelado: boolean } }
  const ids = ((data ?? []) as unknown as Fila[])
    .filter((r) => !r.turnos.cancelado && !yaPaso(r.turnos.fecha, r.turnos.hora))
    .map((r) => r.id)
  if (ids.length > 0) {
    const { error: e2 } = await supabase.from("reservas").update({ estado: "cancelada" }).in("id", ids)
    if (e2) throw new Error(e2.message)
  }
  return { fijas: lista.length, turnos: ids.length }
}

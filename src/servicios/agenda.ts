import { supabase } from '../lib/supabase'
import type { PlantillaTurno, TurnoConReservas } from '../tipos'
import { hoyIso, sumarDias } from '../fechas'

// ---------------------------------------------------------------------------
// Turnos concretos (la agenda que ve y edita el staff)
// ---------------------------------------------------------------------------

export async function listarTurnosStaff(opciones?: {
  desde?: string
  dias?: number
}): Promise<TurnoConReservas[]> {
  const desde = opciones?.desde ?? hoyIso()
  const hasta = sumarDias(desde, opciones?.dias ?? 21)

  const { data, error } = await supabase
    .from('turnos')
    .select(
      'id, fecha, hora, duracion_min, cupo, instructor, plantilla_id, cancelado, nota, ' +
        'reservas ( id, estado, creado_en, perfiles ( nombre, telefono ) )',
    )
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: true })
    .order('hora', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as TurnoConReservas[]
}

export async function crearTurno(datos: {
  fecha: string
  hora: string
  cupo: number
  duracion_min?: number
  instructor?: string
  nota?: string
}): Promise<void> {
  const { error } = await supabase.from('turnos').insert({
    fecha: datos.fecha,
    hora: datos.hora,
    cupo: datos.cupo,
    duracion_min: datos.duracion_min ?? 60,
    instructor: datos.instructor?.trim() || null,
    nota: datos.nota?.trim() || null,
  })
  if (error) {
    if (error.code === '23505') throw new Error('Ya hay un turno en esa fecha y hora.')
    throw new Error(error.message)
  }
}

export async function actualizarTurno(
  id: string,
  cambios: Partial<{ cupo: number; instructor: string | null; nota: string | null; cancelado: boolean }>,
): Promise<void> {
  const { error } = await supabase.from('turnos').update(cambios).eq('id', id)
  if (error) throw new Error(error.message)
}

// Cancela el turno (no lo borra: preserva el historial de reservas).
export async function cancelarTurno(id: string): Promise<void> {
  await actualizarTurno(id, { cancelado: true })
}

// El staff saca a alguien de un turno.
export async function quitarReserva(reservaId: string): Promise<void> {
  const { error } = await supabase
    .from('reservas')
    .update({ estado: 'cancelada' })
    .eq('id', reservaId)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Plantillas (turnos recurrentes semanales)
// ---------------------------------------------------------------------------

export async function listarPlantillas(): Promise<PlantillaTurno[]> {
  const { data, error } = await supabase
    .from('plantillas_turno')
    .select('*')
    .order('dia_semana', { ascending: true })
    .order('hora', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as PlantillaTurno[]
}

export async function crearPlantilla(datos: {
  dia_semana: number
  hora: string
  cupo: number
  duracion_min?: number
  instructor?: string
}): Promise<void> {
  const { error } = await supabase.from('plantillas_turno').insert({
    dia_semana: datos.dia_semana,
    hora: datos.hora,
    cupo: datos.cupo,
    duracion_min: datos.duracion_min ?? 60,
    instructor: datos.instructor?.trim() || null,
  })
  if (error) throw new Error(error.message)
}

export async function cambiarPlantillaActiva(id: string, activa: boolean): Promise<void> {
  const { error } = await supabase.from('plantillas_turno').update({ activa }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function borrarPlantilla(id: string): Promise<void> {
  const { error } = await supabase.from('plantillas_turno').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Genera turnos concretos desde una plantilla, desde hoy hasta N semanas.
// Devuelve cuántos turnos nuevos se crearon.
export async function generarTurnos(plantillaId: string, semanas = 4): Promise<number> {
  const desde = hoyIso()
  const hasta = sumarDias(desde, semanas * 7)

  const { data, error } = await supabase.rpc('generar_turnos', {
    p_plantilla_id: plantillaId,
    p_desde: desde,
    p_hasta: hasta,
  })
  if (error) throw new Error(error.message)
  return (data as number) ?? 0
}

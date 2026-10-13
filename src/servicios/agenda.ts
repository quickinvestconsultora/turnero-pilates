import { supabase } from '../lib/supabase'
import type { EstadoAsistencia, PlantillaTurno, TurnoConReservas } from '../tipos'
import { finDeMes, hoyIso, inicioDeMes, sumarDias } from '../fechas'

// ---------------------------------------------------------------------------
// Turnos concretos (la agenda que ve y edita el staff)
// ---------------------------------------------------------------------------

// instructoraId: si viene, solo los turnos de esa profesora (su propia agenda).
export async function listarTurnosStaff(opciones?: {
  desde?: string
  dias?: number
  instructoraId?: string
}): Promise<TurnoConReservas[]> {
  const desde = opciones?.desde ?? hoyIso()
  const hasta = sumarDias(desde, opciones?.dias ?? 45)

  let consulta = supabase
    .from('turnos')
    .select(
      'id, fecha, hora, duracion_min, cupo, instructor, instructora_id, plantilla_id, cancelado, nota, ' +
        'reservas_invitadas ( id, nombre, apellido, telefono, asistencia ), ' +
        'reservas ( id, estado, creado_en, asistencia, perfiles ( nombre, apellido, telefono, lesiones ) )',
    )
    .gte('fecha', desde)
    .lte('fecha', hasta)
  if (opciones?.instructoraId) consulta = consulta.eq('instructora_id', opciones.instructoraId)

  const { data, error } = await consulta
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
  instructoraId?: string
  nota?: string
}): Promise<void> {
  const { error } = await supabase.from('turnos').insert({
    fecha: datos.fecha,
    hora: datos.hora,
    cupo: datos.cupo,
    duracion_min: datos.duracion_min ?? 60,
    instructor: datos.instructor?.trim() || null,
    instructora_id: datos.instructoraId ?? null,
    nota: datos.nota?.trim() || null,
  })
  if (error) {
    if (error.code === '23505') throw new Error('Ya hay un turno en esa fecha y hora.')
    throw new Error(error.message)
  }
}

// Cambios que el staff hace desde la agenda sobre un turno ya creado. Si el
// turno viene de un turno fijo y `aplicarASerie` es true, el cambio también
// alcanza a todos los turnos futuros de ese horario y al turno fijo en sí
// (así lo que se genere después sale igual).
export type CambiosTurno = {
  cupo?: number
  // undefined = no tocar la profesora; null = dejar sin profesora.
  profesora?: { instructoraId: string } | { instructor: string } | null
}

export async function editarTurno(
  turno: { id: string; plantilla_id: string | null },
  cambios: CambiosTurno,
  aplicarASerie: boolean,
): Promise<void> {
  const campos: Record<string, unknown> = {}
  if (cambios.cupo !== undefined) campos.cupo = cambios.cupo
  if (cambios.profesora !== undefined) {
    if (cambios.profesora === null) {
      campos.instructora_id = null
      campos.instructor = null
    } else if ('instructoraId' in cambios.profesora) {
      // El nombre visible lo completa la base a partir de la profesora.
      campos.instructora_id = cambios.profesora.instructoraId
    } else {
      campos.instructora_id = null
      campos.instructor = cambios.profesora.instructor.trim() || null
    }
  }
  if (Object.keys(campos).length === 0) return

  if (aplicarASerie && turno.plantilla_id) {
    const { error: errorPlantilla } = await supabase
      .from('plantillas_turno')
      .update(campos)
      .eq('id', turno.plantilla_id)
    if (errorPlantilla) throw new Error(errorPlantilla.message)

    const { error } = await supabase
      .from('turnos')
      .update(campos)
      .eq('plantilla_id', turno.plantilla_id)
      .eq('cancelado', false)
      .gte('fecha', hoyIso())
    if (error) throw new Error(error.message)
    return
  }

  const { error } = await supabase.from('turnos').update(campos).eq('id', turno.id)
  if (error) throw new Error(error.message)
}

export async function actualizarTurno(
  id: string,
  cambios: Partial<{ cupo: number; instructor: string | null; nota: string | null; cancelado: boolean }>,
): Promise<void> {
  const { error } = await supabase.from('turnos').update(cambios).eq('id', id)
  if (error) throw new Error(error.message)
}

// Cancela varios turnos de una vez (por ejemplo, un día entero por feriado).
export async function cancelarTurnos(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('turnos').update({ cancelado: true }).in('id', ids)
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

// Anota a una alumna ya registrada en un turno (profesora dueña o staff).
export async function agregarAlumnaATurno(turnoId: string, alumnaId: string): Promise<void> {
  const { error } = await supabase.rpc('agregar_alumna_a_turno', {
    p_turno_id: turnoId,
    p_alumna_id: alumnaId,
  })
  if (error) throw new Error(error.message)
}

// Anota a alguien sin cuenta: nombre, apellido y teléfono son obligatorios.
export async function agregarInvitadaATurno(
  turnoId: string,
  datos: { nombre: string; apellido: string; telefono: string; email?: string },
): Promise<void> {
  const { error } = await supabase.rpc('agregar_invitada_a_turno', {
    p_turno_id: turnoId,
    p_nombre: datos.nombre,
    p_apellido: datos.apellido,
    p_telefono: datos.telefono,
    p_email: datos.email?.trim() || null,
  })
  if (error) throw new Error(error.message)
}

// Pasa la anotación de alguien "sin registrar" a la cuenta de una alumna.
export async function vincularInvitada(invitadaId: string, alumnaId: string): Promise<void> {
  const { error } = await supabase.rpc('vincular_invitada', {
    p_invitada_id: invitadaId,
    p_alumna_id: alumnaId,
  })
  if (error) throw new Error(error.message)
}

export async function quitarInvitada(id: string): Promise<void> {
  const { error } = await supabase.from('reservas_invitadas').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function marcarAsistenciaInvitada(
  id: string,
  asistencia: EstadoAsistencia | null,
): Promise<void> {
  const { error } = await supabase.from('reservas_invitadas').update({ asistencia }).eq('id', id)
  if (error) throw new Error(error.message)
}

// El staff marca (o corrige) la asistencia de una reserva ya pasada.
// null = sin marcar.
export async function marcarAsistencia(
  reservaId: string,
  asistencia: EstadoAsistencia | null,
): Promise<void> {
  const { error } = await supabase.from('reservas').update({ asistencia }).eq('id', reservaId)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Plantillas (turnos recurrentes semanales)
// ---------------------------------------------------------------------------

export async function listarPlantillas(instructoraId?: string): Promise<PlantillaTurno[]> {
  let consulta = supabase.from('plantillas_turno').select('*')
  if (instructoraId) consulta = consulta.eq('instructora_id', instructoraId)

  const { data, error } = await consulta
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
  instructoraId?: string
}): Promise<void> {
  const { error } = await supabase.from('plantillas_turno').insert({
    dia_semana: datos.dia_semana,
    hora: datos.hora,
    cupo: datos.cupo,
    duracion_min: datos.duracion_min ?? 60,
    instructor: datos.instructor?.trim() || null,
    instructora_id: datos.instructoraId ?? null,
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

// Genera turnos concretos desde una plantilla para el período indicado:
// "este-mes" va de hoy al último día del mes; "mes-que-viene" cubre el mes
// calendario siguiente completo. Devuelve cuántos turnos nuevos se crearon.
export type PeriodoGenerar = 'este-mes' | 'mes-que-viene'

export async function generarTurnos(
  plantillaId: string,
  periodo: PeriodoGenerar,
): Promise<number> {
  const hoy = hoyIso()
  const desde = periodo === 'este-mes' ? hoy : inicioDeMes(hoy, 1)
  const hasta = finDeMes(hoy, periodo === 'este-mes' ? 0 : 1)

  const { data, error } = await supabase.rpc('generar_turnos', {
    p_plantilla_id: plantillaId,
    p_desde: desde,
    p_hasta: hasta,
  })
  if (error) throw new Error(error.message)
  return (data as number) ?? 0
}

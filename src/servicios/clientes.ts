import { supabase } from '../lib/supabase'
import type { EstadoAsistencia, EstadoCuenta, ItemHistorial, Observacion, Perfil } from '../tipos'
import { finDeMes, hoyIso, yaPaso } from '../fechas'

export async function listarObservaciones(alumnaId: string): Promise<Observacion[]> {
  const { data, error } = await supabase
    .from('observaciones_clientes')
    .select('id, alumna_id, autor_id, texto, creado_en')
    .eq('alumna_id', alumnaId)
    .order('creado_en', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as Observacion[]
}

export async function agregarObservacion(alumnaId: string, texto: string): Promise<void> {
  const { error } = await supabase
    .from('observaciones_clientes')
    .insert({ alumna_id: alumnaId, texto: texto.trim() })

  if (error) throw new Error(error.message)
}

export async function borrarObservacion(id: string): Promise<void> {
  const { error } = await supabase.from('observaciones_clientes').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// paraProfesora: la lista que ve una profesora, que sale de una función de la
// base que no incluye el estado de cuenta ni ningún dato de pagos.
export async function listarClientes(paraProfesora = false): Promise<Perfil[]> {
  if (paraProfesora) {
    const { data, error } = await supabase.rpc('clientes_para_instructora')
    if (error) throw new Error(error.message)
    return (data ?? []) as unknown as Perfil[]
  }

  const { data, error } = await supabase
    .from('perfiles')
    .select('*')
    .eq('rol', 'alumno')
    .order('nombre', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as Perfil[]
}

// El staff convierte a una alumna registrada en profesora (o la devuelve).
export async function actualizarRol(id: string, rol: 'alumno' | 'instructora'): Promise<void> {
  const { error } = await supabase.from('perfiles').update({ rol }).eq('id', id)
  if (error) throw new Error(error.message)
}

// Clases que la alumna reservó y ya pasaron, de la más reciente a la más
// vieja, con la asistencia que cargó el staff (null = sin marcar).
export async function listarHistorial(alumnaId: string): Promise<ItemHistorial[]> {
  const { data, error } = await supabase
    .from('reservas')
    .select('asistencia, turnos ( fecha, hora, instructor, cancelado )')
    .eq('alumno_id', alumnaId)
    .eq('estado', 'reservada')

  if (error) throw new Error(error.message)

  type Fila = {
    asistencia: EstadoAsistencia | null
    turnos: { fecha: string; hora: string; instructor: string | null; cancelado: boolean } | null
  }
  return ((data ?? []) as unknown as Fila[])
    .filter((f) => f.turnos && !f.turnos.cancelado && yaPaso(f.turnos.fecha, f.turnos.hora))
    .map((f) => ({
      fecha: f.turnos!.fecha,
      hora: f.turnos!.hora,
      instructor: f.turnos!.instructor,
      asistencia: f.asistencia,
    }))
    .sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora))
}

// Al pasar a "al día" el abono cubre hasta fin del mes actual; con cualquier
// otro estado se borra la fecha.
export async function actualizarEstadoCuenta(id: string, estado: EstadoCuenta): Promise<void> {
  const { error } = await supabase
    .from('perfiles')
    .update({
      estado_cuenta: estado,
      pago_actualizado_en: new Date().toISOString(),
      al_dia_hasta: estado === 'al_dia' ? finDeMes(hoyIso()) : null,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

// Suma un mes de abono: desde la fecha en que vence (o desde hoy, si ya venció)
// hasta el fin del mes siguiente.
export async function sumarMesDeAbono(id: string, alDiaHasta: string | null): Promise<void> {
  const hoy = hoyIso()
  const base = alDiaHasta && alDiaHasta > hoy ? alDiaHasta : hoy
  const { error } = await supabase
    .from('perfiles')
    .update({
      estado_cuenta: 'al_dia',
      pago_actualizado_en: new Date().toISOString(),
      al_dia_hasta: finDeMes(base, 1),
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

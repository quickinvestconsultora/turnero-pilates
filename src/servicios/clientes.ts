import { supabase } from '../lib/supabase'
import type { EstadoAsistencia, EstadoCuenta, ItemHistorial, Observacion, Perfil } from '../tipos'
import { yaPaso } from '../fechas'

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

// Cambia el estado a "prueba" o "debe" (sin fecha de abono). Pasar a "al día"
// se hace siempre registrando el pago: ver registrarPago.
export async function actualizarEstadoCuenta(
  id: string,
  estado: Exclude<EstadoCuenta, 'al_dia'>,
): Promise<void> {
  const { error } = await supabase
    .from('perfiles')
    .update({
      estado_cuenta: estado,
      pago_actualizado_en: new Date().toISOString(),
      al_dia_hasta: null,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export type MedioPago = 'transferencia' | 'mercado_pago' | 'efectivo' | 'otro'

export const ETIQUETA_MEDIO: Record<MedioPago, string> = {
  transferencia: 'Transferencia',
  mercado_pago: 'Mercado Pago',
  efectivo: 'Efectivo',
  otro: 'Otro',
}

export type Pago = {
  id: string
  monto: number | null
  medio: MedioPago
  nota: string | null
  abono_hasta: string | null
  creado_en: string
}

// Registra el cobro en el historial y deja a la alumna "al día" hasta `hasta`,
// todo en un paso (lo hace la base, solo el staff).
export async function registrarPago(datos: {
  alumnaId: string
  monto: number | null
  medio: MedioPago
  nota: string
  hasta: string
}): Promise<void> {
  const { error } = await supabase.rpc('registrar_pago', {
    p_alumna_id: datos.alumnaId,
    p_monto: datos.monto,
    p_medio: datos.medio,
    p_nota: datos.nota,
    p_hasta: datos.hasta,
  })
  if (error) throw new Error(error.message)
}

export async function listarPagos(alumnaId: string): Promise<Pago[]> {
  const { data, error } = await supabase
    .from('pagos_clientes')
    .select('id, monto, medio, nota, abono_hasta, creado_en')
    .eq('alumna_id', alumnaId)
    .order('creado_en', { ascending: false })

  if (error) throw new Error(error.message)
  // numeric llega como texto desde la base.
  return ((data ?? []) as unknown as (Omit<Pago, 'monto'> & { monto: string | null })[]).map(
    (p) => ({ ...p, monto: p.monto === null ? null : Number(p.monto) }),
  )
}

export async function borrarPago(id: string): Promise<void> {
  const { error } = await supabase.from('pagos_clientes').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

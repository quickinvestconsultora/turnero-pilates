import { supabase } from '../lib/supabase'
import type { EstadoCuenta, Observacion, Perfil } from '../tipos'

export async function listarObservaciones(alumnaId: string): Promise<Observacion[]> {
  const { data, error } = await supabase
    .from('observaciones_clientes')
    .select('id, alumna_id, texto, creado_en')
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

export async function listarClientes(): Promise<Perfil[]> {
  const { data, error } = await supabase
    .from('perfiles')
    .select('*')
    .eq('rol', 'alumno')
    .order('nombre', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as Perfil[]
}

export async function actualizarEstadoCuenta(id: string, estado: EstadoCuenta): Promise<void> {
  const { error } = await supabase
    .from('perfiles')
    .update({ estado_cuenta: estado, pago_actualizado_en: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

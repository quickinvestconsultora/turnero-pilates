import { supabase } from '../lib/supabase'
import type { EstadoCuenta, Perfil } from '../tipos'

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

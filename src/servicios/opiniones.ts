import { supabase } from '../lib/supabase'

// ---- Alumna ------------------------------------------------------------------

export async function hayEncuestaPendiente(): Promise<boolean> {
  const { data, error } = await supabase.rpc('encuesta_pendiente')
  if (error) return false
  return data === true
}

export async function enviarEncuesta(estrellas: number, comentario: string): Promise<void> {
  const { error } = await supabase.from('encuestas').insert({
    estado: 'respondida',
    estrellas,
    comentario: comentario.trim() || null,
  })
  if (error) throw new Error(error.message)
}

// "Ahora no": no se le vuelve a preguntar por un tiempo.
export async function omitirEncuesta(): Promise<void> {
  const { error } = await supabase.from('encuestas').insert({ estado: 'omitida' })
  if (error) throw new Error(error.message)
}

// ---- Staff -------------------------------------------------------------------

export type Opinion = {
  id: string
  estrellas: number
  comentario: string | null
  revisada: boolean
  creado_en: string
  perfiles: { nombre: string; apellido: string; telefono: string } | null
}

export async function listarOpiniones(): Promise<Opinion[]> {
  const { data, error } = await supabase
    .from('encuestas')
    .select('id, estrellas, comentario, revisada, creado_en, perfiles ( nombre, apellido, telefono )')
    .eq('estado', 'respondida')
    .order('creado_en', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Opinion[]
}

export async function marcarOpinionRevisada(id: string, revisada: boolean): Promise<void> {
  const { error } = await supabase.from('encuestas').update({ revisada }).eq('id', id)
  if (error) throw new Error(error.message)
}

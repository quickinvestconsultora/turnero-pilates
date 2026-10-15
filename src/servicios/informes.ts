import { supabase } from '../lib/supabase'

export type FilaInformeProfesora = {
  clave: string
  nombre: string
  clases: number
  anotadas: number
  asistieron: number
  ausentes: number
}

// Por profesora y período: clases ya dadas, anotadas, y cuántas asistieron o
// faltaron según lo cargado. Solo el staff (lo hace cumplir la base).
export async function informeProfesoras(
  desde: string,
  hasta: string,
): Promise<FilaInformeProfesora[]> {
  const { data, error } = await supabase.rpc('informe_profesoras', {
    p_desde: desde,
    p_hasta: hasta,
  })
  if (error) throw new Error(error.message)

  // Los bigint llegan como número o como texto según el cliente.
  return ((data ?? []) as Record<string, unknown>[]).map((f) => ({
    clave: String(f.clave),
    nombre: String(f.nombre),
    clases: Number(f.clases),
    anotadas: Number(f.anotadas),
    asistieron: Number(f.asistieron),
    ausentes: Number(f.ausentes),
  }))
}

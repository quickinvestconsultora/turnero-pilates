import { supabase } from '../lib/supabase'
import { descargarCsv } from '../csv'
import { hoyIso } from '../fechas'

type Fila = Record<string, unknown>

// Cada archivo de la copia de seguridad: qué tabla y cómo se llama.
export const TABLAS_RESPALDO: { clave: string; etiqueta: string; descripcion: string }[] = [
  { clave: 'perfiles', etiqueta: 'Personas', descripcion: 'Alumnas, profesoras y staff, con su mail y estado de cuenta' },
  { clave: 'turnos', etiqueta: 'Turnos', descripcion: 'Todos los turnos de la agenda' },
  { clave: 'reservas', etiqueta: 'Reservas', descripcion: 'Quién se anotó en cada turno y su asistencia' },
  { clave: 'reservas_invitadas', etiqueta: 'Anotadas sin registrar', descripcion: 'Personas anotadas por las profesoras sin cuenta' },
  { clave: 'pagos_clientes', etiqueta: 'Pagos', descripcion: 'Historial de cobros registrados' },
  { clave: 'documentos_alumnas', etiqueta: 'Documentos de alumnas', descripcion: 'La lista de documentos subidos (los archivos se bajan desde cada ficha)' },
  { clave: 'observaciones_clientes', etiqueta: 'Observaciones', descripcion: 'Notas internas sobre cada alumna' },
  { clave: 'plantillas_turno', etiqueta: 'Turnos fijos', descripcion: 'Los horarios que se repiten cada semana' },
]

// Trae todas las filas de una tabla de a 1000 (el máximo por consulta).
async function traerTabla(tabla: string): Promise<Fila[]> {
  if (tabla === 'perfiles') {
    // El mail vive en auth.users: sale por una función solo para el staff.
    const { data, error } = await supabase.rpc('respaldo_perfiles')
    if (error) throw new Error(error.message)
    return (data ?? []) as Fila[]
  }

  const filas: Fila[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from(tabla).select('*').range(desde, desde + 999)
    if (error) throw new Error(error.message)
    filas.push(...((data ?? []) as Fila[]))
    if (!data || data.length < 1000) break
  }
  return filas
}

function aTexto(valor: unknown): string | number | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'number' || typeof valor === 'string') return valor
  return JSON.stringify(valor)
}

// Descarga una tabla como CSV para Excel. Devuelve cuántas filas tenía.
export async function descargarRespaldo(tabla: string): Promise<number> {
  const filas = await traerTabla(tabla)
  const columnas = [...new Set(filas.flatMap((f) => Object.keys(f)))]
  descargarCsv(`respaldo-${tabla}-${hoyIso()}.csv`, [
    columnas,
    ...filas.map((f) => columnas.map((c) => aTexto(f[c]))),
  ])
  return filas.length
}

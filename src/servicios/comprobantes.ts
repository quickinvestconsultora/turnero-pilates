import { supabase } from '../lib/supabase'

export type Comprobante = {
  id: string
  alumna_id: string
  ruta: string
  nota: string | null
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  creado_en: string
}

export type ComprobanteConAlumna = Comprobante & {
  perfiles: {
    nombre: string
    apellido: string
    telefono: string
    al_dia_hasta: string | null
  } | null
}

const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp']
const MAX_PDF = 5 * 1024 * 1024

// Las fotos de celular pesan varios MB: se achican a 1400 px de lado mayor.
async function achicar(archivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo)
  const escala = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(bitmap.width * escala)
  lienzo.height = Math.round(bitmap.height * escala)
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen.')
  ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height)
  return new Promise((resolve, reject) =>
    lienzo.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen.'))),
      'image/jpeg',
      0.82,
    ),
  )
}

// La alumna sube la foto (o PDF) de su transferencia y queda pendiente de
// confirmación por el estudio.
export async function subirComprobante(
  alumnaId: string,
  archivo: File,
  nota: string,
): Promise<void> {
  const esPdf = archivo.type === 'application/pdf'
  if (!esPdf && !TIPOS_IMAGEN.includes(archivo.type) && !archivo.type.startsWith('image/')) {
    throw new Error('Subí una foto o un PDF del comprobante.')
  }
  if (esPdf && archivo.size > MAX_PDF) throw new Error('El PDF pesa más de 5 MB.')

  const contenido: Blob = esPdf ? archivo : await achicar(archivo)
  const ruta = `${alumnaId}/${crypto.randomUUID()}.${esPdf ? 'pdf' : 'jpg'}`

  const { error } = await supabase.storage
    .from('comprobantes')
    .upload(ruta, contenido, { contentType: esPdf ? 'application/pdf' : 'image/jpeg' })
  if (error) throw new Error(error.message)

  const { error: errorFila } = await supabase
    .from('comprobantes_pago')
    .insert({ alumna_id: alumnaId, ruta, nota: nota.trim() || null })
  if (errorFila) {
    // No dejamos el archivo huérfano si la fila fue rechazada (por ejemplo, el tope).
    await supabase.storage.from('comprobantes').remove([ruta])
    throw new Error(errorFila.message)
  }
}

export async function listarMisComprobantes(): Promise<Comprobante[]> {
  const { data, error } = await supabase
    .from('comprobantes_pago')
    .select('id, alumna_id, ruta, nota, estado, creado_en')
    .order('creado_en', { ascending: false })
    .limit(10)
  if (error) throw new Error(error.message)
  return (data ?? []) as Comprobante[]
}

export async function listarComprobantesPendientes(): Promise<ComprobanteConAlumna[]> {
  const { data, error } = await supabase
    .from('comprobantes_pago')
    .select(
      'id, alumna_id, ruta, nota, estado, creado_en, ' +
        'perfiles ( nombre, apellido, telefono, al_dia_hasta )',
    )
    .eq('estado', 'pendiente')
    .order('creado_en', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ComprobanteConAlumna[]
}

export async function contarComprobantesPendientes(): Promise<number> {
  const { count, error } = await supabase
    .from('comprobantes_pago')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'pendiente')
  if (error) throw new Error(error.message)
  return count ?? 0
}

// Link temporal para que el staff abra el comprobante (el bucket es privado).
export async function urlComprobante(ruta: string): Promise<string> {
  const { data, error } = await supabase.storage.from('comprobantes').createSignedUrl(ruta, 120)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

export async function resolverComprobante(
  id: string,
  estado: 'aprobado' | 'rechazado',
): Promise<void> {
  const { data: sesion } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('comprobantes_pago')
    .update({
      estado,
      resuelto_en: new Date().toISOString(),
      resuelto_por: sesion.user?.id ?? null,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

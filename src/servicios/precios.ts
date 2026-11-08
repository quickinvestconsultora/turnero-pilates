import { supabase } from '../lib/supabase'

// La foto con la lista de precios vive en el bucket público "publico", siempre con el
// mismo nombre: subir una nueva reemplaza a la anterior.
const BUCKET = 'publico'
const ARCHIVO = 'precios.jpg'

// Dirección pública de la foto (con la fecha de subida para que nadie vea una vieja en
// caché), o null si todavía no se cargó ninguna.
export async function urlFotoPrecios(): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).list("", { search: ARCHIVO })
  if (error) return null
  const archivo = (data ?? []).find((a) => a.name === ARCHIVO)
  if (!archivo) return null
  const version = Date.parse(archivo.updated_at ?? archivo.created_at ?? "") || Date.now()
  return `${supabase.storage.from(BUCKET).getPublicUrl(ARCHIVO).data.publicUrl}?v=${version}`
}

// Staff: sube o reemplaza la foto. Se achica a 1600 px de largo para que cargue rápido sin
// perder legibilidad.
export async function subirFotoPrecios(archivo: File): Promise<void> {
  if (!archivo.type.startsWith('image/')) throw new Error('El archivo tiene que ser una imagen.')
  const bitmap = await createImageBitmap(archivo)
  const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(bitmap.width * escala)
  lienzo.height = Math.round(bitmap.height * escala)
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la foto.')
  ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height)
  const blob = await new Promise<Blob>((resolve, reject) =>
    lienzo.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la foto.'))), 'image/jpeg', 0.9),
  )
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(ARCHIVO, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '60' })
  if (error) throw new Error(error.message)
}

export async function quitarFotoPrecios(): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([ARCHIVO])
  if (error) throw new Error(error.message)
}

import { supabase } from '../lib/supabase'

export type CategoriaDocumento = 'certificado' | 'estudio' | 'otro'

export const ETIQUETA_CATEGORIA: Record<CategoriaDocumento, string> = {
  certificado: 'Certificado médico',
  estudio: 'Estudio',
  otro: 'Otro',
}

export type Documento = {
  id: string
  alumna_id: string
  nombre: string
  categoria: CategoriaDocumento
  ruta: string
  creado_en: string
}

const MAX_BYTES = 8 * 1024 * 1024

// Achica las fotos a 1400 px de lado mayor (las de celular pesan varios MB).
async function achicar(archivo: File, ladoMax: number): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo)
  const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height))
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

// Link temporal para ver un archivo del bucket privado (foto o documento).
export async function urlFicha(ruta: string): Promise<string> {
  const { data, error } = await supabase.storage.from('fichas').createSignedUrl(ruta, 300)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

export async function subirFotoAlumna(alumnaId: string, archivo: File): Promise<string> {
  if (!archivo.type.startsWith('image/')) throw new Error('La foto tiene que ser una imagen.')

  const foto = await achicar(archivo, 700)
  const ruta = `${alumnaId}/foto.jpg`
  const { error } = await supabase.storage
    .from('fichas')
    .upload(ruta, foto, { contentType: 'image/jpeg', upsert: true })
  if (error) throw new Error(error.message)

  const { error: errorPerfil } = await supabase
    .from('perfiles')
    .update({ foto_ruta: ruta })
    .eq('id', alumnaId)
  if (errorPerfil) throw new Error(errorPerfil.message)
  return ruta
}

export async function quitarFotoAlumna(alumnaId: string, ruta: string): Promise<void> {
  const { error } = await supabase.from('perfiles').update({ foto_ruta: null }).eq('id', alumnaId)
  if (error) throw new Error(error.message)
  await supabase.storage.from('fichas').remove([ruta])
}

export async function listarDocumentos(alumnaId: string): Promise<Documento[]> {
  const { data, error } = await supabase
    .from('documentos_alumnas')
    .select('id, alumna_id, nombre, categoria, ruta, creado_en')
    .eq('alumna_id', alumnaId)
    .order('creado_en', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Documento[]
}

export async function subirDocumento(
  alumnaId: string,
  archivo: File,
  nombre: string,
  categoria: CategoriaDocumento,
): Promise<void> {
  const esPdf = archivo.type === 'application/pdf'
  if (!esPdf && !archivo.type.startsWith('image/')) {
    throw new Error('Subí una foto o un PDF.')
  }
  if (esPdf && archivo.size > MAX_BYTES) throw new Error('El PDF pesa más de 8 MB.')

  const contenido: Blob = esPdf ? archivo : await achicar(archivo, 1600)
  const ruta = `${alumnaId}/docs/${crypto.randomUUID()}.${esPdf ? 'pdf' : 'jpg'}`

  const { error } = await supabase.storage
    .from('fichas')
    .upload(ruta, contenido, { contentType: esPdf ? 'application/pdf' : 'image/jpeg' })
  if (error) throw new Error(error.message)

  const { error: errorFila } = await supabase.from('documentos_alumnas').insert({
    alumna_id: alumnaId,
    nombre: nombre.trim() || archivo.name.replace(/\.[^.]+$/, ''),
    categoria,
    ruta,
  })
  if (errorFila) {
    // No dejamos el archivo huérfano si la fila fue rechazada (por ejemplo, el tope).
    await supabase.storage.from('fichas').remove([ruta])
    throw new Error(errorFila.message)
  }
}

export async function borrarDocumento(doc: Documento): Promise<void> {
  const { error } = await supabase.from('documentos_alumnas').delete().eq('id', doc.id)
  if (error) throw new Error(error.message)
  await supabase.storage.from('fichas').remove([doc.ruta])
}

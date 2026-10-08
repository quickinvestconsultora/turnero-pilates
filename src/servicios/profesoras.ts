import { supabase } from '../lib/supabase'
import type { Profesora } from '../tipos'

export async function listarProfesoras(): Promise<Profesora[]> {
  const { data, error } = await supabase.rpc('listar_profesoras')
  if (error) throw new Error(error.message)
  return (data ?? []) as Profesora[]
}

export type DatosPerfilProfe = {
  nombre: string
  apellido: string
  telefono: string
  bio: string
  formacion: string
  especialidades: string
  experiencia: string
  frase: string
  instagram: string
}

// Deja solo el usuario de Instagram, aunque peguen "@usuario" o el link entero.
export function usuarioInstagram(texto: string): string {
  return texto
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?].*$/, '')
}

export async function guardarPerfilProfe(id: string, datos: DatosPerfilProfe): Promise<void> {
  const instagram = usuarioInstagram(datos.instagram)
  if (instagram && !/^[A-Za-z0-9._]{1,30}$/.test(instagram)) {
    throw new Error('El usuario de Instagram no parece válido (solo letras, números, punto y guion bajo).')
  }

  const { error } = await supabase
    .from('perfiles')
    .update({
      nombre: datos.nombre.trim(),
      apellido: datos.apellido.trim(),
      telefono: datos.telefono.trim(),
      bio: datos.bio.trim() || null,
      formacion: datos.formacion.trim() || null,
      especialidades: datos.especialidades.trim() || null,
      experiencia: datos.experiencia.trim() || null,
      frase: datos.frase.trim() || null,
      instagram: instagram || null,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// Achica la foto a un cuadrado de 400 px (JPEG) en el navegador: las fotos de
// celular pesan varios MB y acá se muestran chiquitas.
async function achicar(archivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo)
  const lado = Math.min(bitmap.width, bitmap.height)
  const lienzo = document.createElement('canvas')
  lienzo.width = 400
  lienzo.height = 400
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la foto.')
  ctx.drawImage(
    bitmap,
    (bitmap.width - lado) / 2,
    (bitmap.height - lado) / 2,
    lado,
    lado,
    0,
    0,
    400,
    400,
  )
  return new Promise((resolve, reject) =>
    lienzo.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la foto.'))),
      'image/jpeg',
      0.85,
    ),
  )
}

// Para la galería: mantiene la proporción y limita el lado mayor a 1100 px.
async function achicarProporcional(archivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo)
  const escala = Math.min(1, 1100 / Math.max(bitmap.width, bitmap.height))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(bitmap.width * escala)
  lienzo.height = Math.round(bitmap.height * escala)
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la foto.')
  ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height)
  return new Promise((resolve, reject) =>
    lienzo.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la foto.'))),
      'image/jpeg',
      0.82,
    ),
  )
}

export type FotoGaleria = { id: string; profesora_id: string; url: string; ruta: string }

export async function listarFotosGaleria(): Promise<FotoGaleria[]> {
  const { data, error } = await supabase
    .from('fotos_profesoras')
    .select('id, profesora_id, url, ruta')
    .order('creado_en', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as FotoGaleria[]
}

export async function subirFotoGaleria(id: string, archivo: File): Promise<void> {
  if (!archivo.type.startsWith('image/')) throw new Error('El archivo tiene que ser una imagen.')

  const foto = await achicarProporcional(archivo)
  const ruta = `${id}/galeria/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from('profes')
    .upload(ruta, foto, { contentType: 'image/jpeg' })
  if (error) throw new Error(error.message)

  const url = supabase.storage.from('profes').getPublicUrl(ruta).data.publicUrl
  const { error: errorFila } = await supabase
    .from('fotos_profesoras')
    .insert({ profesora_id: id, url, ruta })
  if (errorFila) {
    // No dejamos un archivo huérfano si el tope de fotos u otra regla lo rechazó.
    await supabase.storage.from('profes').remove([ruta])
    throw new Error(errorFila.message)
  }
}

export async function borrarFotoGaleria(foto: FotoGaleria): Promise<void> {
  const { error } = await supabase.from('fotos_profesoras').delete().eq('id', foto.id)
  if (error) throw new Error(error.message)
  await supabase.storage.from('profes').remove([foto.ruta])
}

// Sube la foto al bucket público "profes" y deja la URL en el perfil.
export async function subirFotoPerfil(id: string, archivo: File): Promise<string> {
  if (!archivo.type.startsWith('image/')) throw new Error('El archivo tiene que ser una imagen.')

  const foto = await achicar(archivo)
  const ruta = `${id}/foto.jpg`
  const { error } = await supabase.storage
    .from('profes')
    .upload(ruta, foto, { contentType: 'image/jpeg', upsert: true })
  if (error) throw new Error(error.message)

  // El "?v=" evita que el navegador siga mostrando la foto vieja.
  const url = `${supabase.storage.from('profes').getPublicUrl(ruta).data.publicUrl}?v=${Date.now()}`
  const { error: errorPerfil } = await supabase
    .from('perfiles')
    .update({ foto_url: url })
    .eq('id', id)
  if (errorPerfil) throw new Error(errorPerfil.message)
  return url
}

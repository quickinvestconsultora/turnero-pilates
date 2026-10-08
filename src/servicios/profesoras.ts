import { supabase } from '../lib/supabase'
import type { Profesora } from '../tipos'

export async function listarProfesoras(): Promise<Profesora[]> {
  const { data, error } = await supabase.rpc('listar_profesoras')
  if (error) throw new Error(error.message)
  return (data ?? []) as Profesora[]
}

export async function guardarPerfilProfe(
  id: string,
  datos: { nombre: string; apellido: string; telefono: string; bio: string },
): Promise<void> {
  const { error } = await supabase
    .from('perfiles')
    .update({
      nombre: datos.nombre.trim(),
      apellido: datos.apellido.trim(),
      telefono: datos.telefono.trim(),
      bio: datos.bio.trim() || null,
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

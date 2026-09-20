import { supabase } from '../lib/supabase'
import type { Perfil } from '../tipos'
import { TEXTO_DESLINDE } from '../config/deslinde'

const RUTA = (alumnoId: string) => `${alumnoId}/deslinde.pdf`

// jsPDF pesa bastante (~130 KB gzip) y solo hace falta para generar este
// PDF puntual, así que se carga recién cuando se necesita en vez de sumarse
// al bundle principal que descarga todo el mundo (incluido el staff, que
// nunca genera un PDF).
async function generarPdf(perfil: Perfil, email: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margen = 20
  const ancho = 210 - margen * 2
  let y = 24

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('FORTEVA Studio', margen, y)
  y += 6
  doc.setFontSize(11)
  doc.text('Ficha de registro y deslinde de responsabilidad', margen, y)
  y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const fecha = perfil.deslinde_aceptado_en ? new Date(perfil.deslinde_aceptado_en) : new Date()
  const datos = [
    `Nombre: ${perfil.nombre} ${perfil.apellido}`.trim(),
    `DNI: ${perfil.dni || '—'}`,
    `Teléfono: ${perfil.telefono || '—'}`,
    `Correo: ${email}`,
    `Fecha de aceptación: ${fecha.toLocaleString('es-AR')}`,
  ]
  for (const linea of datos) {
    doc.text(linea, margen, y)
    y += 6
  }

  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Deslinde de responsabilidad', margen, y)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const parrafos = TEXTO_DESLINDE.split('\n\n')
  for (const parrafo of parrafos) {
    const lineas = doc.splitTextToSize(parrafo, ancho) as string[]
    if (y + lineas.length * 5 > 280) {
      doc.addPage()
      y = 24
    }
    doc.text(lineas, margen, y)
    y += lineas.length * 5 + 4
  }

  return doc.output('blob')
}

// Genera el PDF y lo sube al storage privado. Se llama automáticamente
// (ver App.tsx) apenas hay una sesión activa y el perfil todavía no lo tiene
// subido — cubre tanto el registro directo como el caso de "falta confirmar
// el mail", donde recién hay sesión más tarde.
export async function generarYSubirDeslinde(perfil: Perfil): Promise<void> {
  const { data: sesion } = await supabase.auth.getUser()
  const email = sesion.user?.email ?? '—'

  const pdf = await generarPdf(perfil, email)

  const { error: errorSubida } = await supabase.storage
    .from('deslindes')
    .upload(RUTA(perfil.id), pdf, { contentType: 'application/pdf', upsert: true })
  if (errorSubida) throw new Error(errorSubida.message)

  const { error: errorPerfil } = await supabase
    .from('perfiles')
    .update({ deslinde_pdf_subido: true })
    .eq('id', perfil.id)
  if (errorPerfil) throw new Error(errorPerfil.message)
}

// Para el staff: link temporal de descarga (el bucket es privado).
export async function obtenerUrlDeslinde(alumnoId: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('deslindes')
    .createSignedUrl(RUTA(alumnoId), 60)

  if (error) throw new Error(error.message)
  return data.signedUrl
}

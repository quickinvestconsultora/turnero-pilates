import { ETIQUETA_CONCEPTO, ETIQUETA_MEDIO } from './clientes'
import type { ConceptoPago, MedioPago } from './clientes'
import { TRANSFERENCIA_TITULAR } from '../config/pagos'

export type DatosRecibo = {
  numero: number | null
  fecha: string // timestamp del pago
  alumna: string
  dni: string | null
  concepto: ConceptoPago
  monto: number | null
  medio: MedioPago
  abonoHasta: string | null // 'YYYY-MM-DD'
}

const formatoPesos = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  })

function nombreArchivo(d: DatosRecibo): string {
  const numero = d.numero ? String(d.numero).padStart(4, '0') : 'pago'
  const quien = d.alumna.normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `recibo-${numero}-${quien || 'alumna'}.pdf`
}

// jsPDF se carga recién cuando hace falta (ver servicios/deslinde.ts).
async function generarPdf(d: DatosRecibo): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margen = 20
  const derecha = 210 - margen
  let y = 28

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('FORTEVA Studio', margen, y)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('Pilates & Strength', margen, y + 6)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('Recibo de pago', derecha, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  if (d.numero) doc.text('N° ' + String(d.numero).padStart(4, '0'), derecha, y + 6, { align: 'right' })

  y += 16
  doc.setDrawColor(190)
  doc.line(margen, y, derecha, y)
  y += 12

  const fila = (etiqueta: string, valor: string) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(110)
    doc.text(etiqueta, margen, y)
    doc.setTextColor(20)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(valor, margen + 48, y)
    y += 9
  }

  fila('Fecha', fechaLarga(d.fecha))
  fila('Recibimos de', d.alumna)
  if (d.dni) fila('DNI', d.dni)
  fila('Concepto', ETIQUETA_CONCEPTO[d.concepto] ?? d.concepto)
  fila('Medio de pago', ETIQUETA_MEDIO[d.medio] ?? d.medio)
  if (d.abonoHasta) {
    const [yy, mm, dd] = d.abonoHasta.split('-').map(Number)
    fila('Cubre turnos hasta', `${dd}/${mm}/${yy}`)
  }

  y += 4
  doc.setDrawColor(190)
  doc.line(margen, y, derecha, y)
  y += 12
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(110)
  doc.text('Importe recibido', margen, y)
  doc.setTextColor(20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(d.monto === null ? 'Sin monto indicado' : formatoPesos(d.monto), derecha, y, { align: 'right' })

  y += 24
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(60)
  doc.text(
    TRANSFERENCIA_TITULAR ? `Recibió: ${TRANSFERENCIA_TITULAR} - FORTEVA Studio` : 'Recibió: FORTEVA Studio',
    margen,
    y,
  )
  y += 8
  doc.text('¡Gracias por entrenar con nosotras!', margen, y)

  doc.setFontSize(8)
  doc.setTextColor(130)
  doc.text(
    'Comprobante interno de pago. No es una factura ni tiene validez fiscal.',
    margen,
    283,
  )

  return doc.output('blob')
}

// ¿Este dispositivo puede compartir un PDF desde el navegador (el menú de
// compartir del celular, con WhatsApp, mail, etc.)?
export function puedeCompartirArchivos(): boolean {
  try {
    return (
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File(['x'], 'recibo.pdf', { type: 'application/pdf' })] })
    )
  } catch {
    return false
  }
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function descargarRecibo(d: DatosRecibo): Promise<void> {
  descargar(await generarPdf(d), nombreArchivo(d))
}

// Abre el menú de compartir del celular con el PDF adjunto. Si la persona
// cierra el menú sin elegir nada, no es un error.
export async function compartirRecibo(d: DatosRecibo): Promise<void> {
  const blob = await generarPdf(d)
  const archivo = new File([blob], nombreArchivo(d), { type: 'application/pdf' })
  try {
    await navigator.share({ files: [archivo], title: 'Recibo de pago - FORTEVA Studio' })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    throw e
  }
}

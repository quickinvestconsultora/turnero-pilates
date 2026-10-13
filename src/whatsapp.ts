import type { Perfil } from './tipos'
import { abonoVencido, diaMes } from './cuenta'
import { fechaLarga, horaCorta } from './fechas'
import { LINK_MERCADO_PAGO, TRANSFERENCIA_ALIAS, TRANSFERENCIA_TITULAR } from './config/pagos'

// Deja el celular en el formato internacional que pide wa.me para Argentina:
// 549 + código de área + número, sin 0 ni 15. Devuelve null si no alcanza para
// armar un número (vacío o demasiado corto).
export function numeroWhatsApp(telefono: string): string | null {
  let d = telefono.replace(/\D/g, '')
  if (d.length < 8) return null

  if (d.startsWith('54')) {
    d = d.slice(2)
    if (d.startsWith('9')) d = d.slice(1)
  }
  if (d.startsWith('0')) d = d.slice(1)

  // Escrito "a lo local" con 15: código de área (2 a 4 dígitos) + 15 + número.
  if (d.length === 12) {
    for (const largoArea of [2, 3, 4]) {
      if (d.slice(largoArea, largoArea + 2) === '15') {
        d = d.slice(0, largoArea) + d.slice(largoArea + 2)
        break
      }
    }
  }

  return d.length === 10 ? `549${d}` : null
}

export function enlaceWhatsApp(telefono: string, mensaje: string): string | null {
  const numero = numeroWhatsApp(telefono)
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}` : null
}

const FIRMA = 'FORTEVA Studio'

function datosDePago(): string {
  const lineas: string[] = []
  if (LINK_MERCADO_PAGO) lineas.push(`Mercado Pago: ${LINK_MERCADO_PAGO}`)
  if (TRANSFERENCIA_ALIAS) {
    lineas.push(
      `Transferencia al alias ${TRANSFERENCIA_ALIAS}${TRANSFERENCIA_TITULAR ? ` (${TRANSFERENCIA_TITULAR})` : ''}`,
    )
  }
  return lineas.length > 0 ? `\n\n${lineas.join('\n')}` : ''
}

// Mensaje para una alumna desde Clientes: si el abono venció o debe, es un
// recordatorio de cobro con los datos de pago; si no, un saludo.
export function mensajeCliente(
  p: Pick<Perfil, 'nombre' | 'estado_cuenta' | 'al_dia_hasta'>,
): string {
  const nombre = p.nombre.trim() || 'hola'
  if (abonoVencido(p) && p.al_dia_hasta) {
    return (
      `Hola ${nombre}! Te escribimos de ${FIRMA}: tu abono venció el ${diaMes(p.al_dia_hasta)}. ` +
      `Si querés renovarlo para seguir reservando, te dejo los datos de pago.${datosDePago()}`
    )
  }
  if (p.estado_cuenta === 'pendiente') {
    return (
      `Hola ${nombre}! Te escribimos de ${FIRMA}: tenés un pago pendiente. ` +
      `Cuando puedas, te dejo los datos para regularizarlo.${datosDePago()}`
    )
  }
  return `Hola ${nombre}! Te escribimos de ${FIRMA}.`
}

// Mensaje para alguien anotada en un turno concreto.
export function mensajeTurno(nombre: string, fecha: string, hora: string): string {
  return (
    `Hola ${nombre.trim() || 'hola'}! Te escribimos de ${FIRMA} por tu clase del ` +
    `${fechaLarga(fecha)} a las ${horaCorta(hora)}.`
  )
}

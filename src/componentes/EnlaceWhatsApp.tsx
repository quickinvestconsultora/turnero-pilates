import { enlaceWhatsApp } from '../whatsapp'

// Abre el chat de WhatsApp con la persona y el mensaje ya escrito. No se
// muestra si el celular no alcanza para armar un número válido.
export default function EnlaceWhatsApp({
  telefono,
  mensaje,
  etiqueta = 'WhatsApp',
  onClick,
}: {
  telefono: string | null | undefined
  mensaje: string
  etiqueta?: string
  onClick?: () => void
}) {
  const href = telefono ? enlaceWhatsApp(telefono, mensaje) : null
  if (!href) return null

  return (
    <a
      className="enlace-whatsapp"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      title="Abrir WhatsApp con el mensaje escrito"
    >
      {etiqueta}
    </a>
  )
}

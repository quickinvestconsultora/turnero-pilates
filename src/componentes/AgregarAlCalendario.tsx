import { useState } from 'react'
import { descargarIcs, enlaceGoogleCalendar } from '../calendario'
import type { EventoTurno } from '../calendario'

// "Agregar al calendario" de un turno reservado: Google Calendar o archivo .ics
// (Apple y otras agendas). Incluye un aviso 1 hora antes.
export default function AgregarAlCalendario({ turno }: { turno: EventoTurno }) {
  const [abierto, setAbierto] = useState(false)

  if (!abierto) {
    return (
      <button type="button" className="link-secundario" onClick={() => setAbierto(true)}>
        Agregar al calendario
      </button>
    )
  }

  return (
    <span className="opciones-calendario">
      <a
        className="link-secundario"
        href={enlaceGoogleCalendar(turno)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Google Calendar
      </a>
      <button
        type="button"
        className="link-secundario"
        onClick={() => descargarIcs([turno], 'turno-forteva')}
      >
        Apple / otra agenda
      </button>
    </span>
  )
}

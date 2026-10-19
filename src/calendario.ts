// Agregar turnos al calendario del celular: archivo .ics (Apple, Google y casi
// cualquier agenda) o link directo a Google Calendar. El estudio está en
// Argentina, que no tiene horario de verano, así que la zona es fija (-03:00).

const ZONA = 'America/Argentina/Buenos_Aires'

export type EventoTurno = {
  id: string
  fecha: string // 'YYYY-MM-DD'
  hora: string // 'HH:MM' o 'HH:MM:SS'
  duracion_min: number
  instructor: string | null
}

// '2026-10-19' + '07:00:00' (+ minutos) -> '20261019T070000'
function fechaLocal(fecha: string, hora: string, minutosExtra = 0): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const [hh, mm] = hora.split(':').map(Number)
  const f = new Date(Date.UTC(y, m - 1, d, hh, mm + minutosExtra))
  const dos = (n: number) => String(n).padStart(2, '0')
  return (
    `${f.getUTCFullYear()}${dos(f.getUTCMonth() + 1)}${dos(f.getUTCDate())}` +
    `T${dos(f.getUTCHours())}${dos(f.getUTCMinutes())}00`
  )
}

const escapar = (texto: string) =>
  texto.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

function descripcion(t: EventoTurno): string {
  return t.instructor ? `Profesora: ${t.instructor}` : 'Clase en FORTEVA Studio'
}

function crearIcs(turnos: EventoTurno[]): string {
  const ahora = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FORTEVA Studio//Turnero//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE',
    `TZID:${ZONA}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:-0300',
    'TZOFFSETTO:-0300',
    'TZNAME:-03',
    'END:STANDARD',
    'END:VTIMEZONE',
  ]
  for (const t of turnos) {
    lineas.push(
      'BEGIN:VEVENT',
      `UID:turno-${t.id}@turnero-pilates`,
      `DTSTAMP:${ahora}`,
      `DTSTART;TZID=${ZONA}:${fechaLocal(t.fecha, t.hora)}`,
      `DTEND;TZID=${ZONA}:${fechaLocal(t.fecha, t.hora, t.duracion_min || 60)}`,
      `SUMMARY:${escapar('Clase en FORTEVA Studio')}`,
      `DESCRIPTION:${escapar(descripcion(t))}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT60M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapar('Tu clase empieza en 1 hora')}`,
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lineas.push('END:VCALENDAR')
  return lineas.join('\r\n') + '\r\n'
}

export function descargarIcs(turnos: EventoTurno[], nombre = 'turnos-forteva'): void {
  const blob = new Blob([crearIcs(turnos)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombre}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function enlaceGoogleCalendar(t: EventoTurno): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'Clase en FORTEVA Studio',
    dates: `${fechaLocal(t.fecha, t.hora)}/${fechaLocal(t.fecha, t.hora, t.duracion_min || 60)}`,
    ctz: ZONA,
    details: descripcion(t),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

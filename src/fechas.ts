// Helpers de fecha. Todo el turnero trabaja en horario local (el del estudio);
// no manejamos zonas horarias porque alumno y estudio están en el mismo lugar.

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export const NOMBRE_DIA = DIAS
export const NOMBRE_DIA_CORTO = DIAS_CORTOS

// 'YYYY-MM-DD' de una fecha, en local (no UTC).
export function isoLocal(fecha: Date): string {
  const y = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function hoyIso(): string {
  return isoLocal(new Date())
}

// Suma días a una fecha 'YYYY-MM-DD' y devuelve otra 'YYYY-MM-DD'.
export function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const fecha = new Date(y, m - 1, d + dias)
  return isoLocal(fecha)
}

// 'HH:MM:SS' o 'HH:MM' -> 'HH:MM'
export function horaCorta(hora: string): string {
  return hora.slice(0, 5)
}

// '2026-09-03' -> 'Jueves 3 de septiembre'
export function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const fecha = new Date(y, m - 1, d)
  return `${DIAS[fecha.getDay()]} ${d} de ${MESES[m - 1]}`
}

// '2026-09-03' -> 'Jue 3/9'
export function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const fecha = new Date(y, m - 1, d)
  return `${DIAS_CORTOS[fecha.getDay()]} ${d}/${m}`
}

// ¿La fecha+hora del turno ya pasó?
export function yaPaso(fechaIso: string, hora: string): boolean {
  const [y, m, d] = fechaIso.split('-').map(Number)
  const [hh, mm] = hora.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm).getTime() < Date.now()
}

// Etiqueta relativa amigable para encabezar la lista: "Hoy", "Mañana" o el día.
export function encabezadoDia(iso: string): string {
  if (iso === hoyIso()) return 'Hoy'
  if (iso === sumarDias(hoyIso(), 1)) return 'Mañana'
  return fechaLarga(iso)
}

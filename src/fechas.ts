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

// '2026-10-19' -> 'lunes' (en plural: 'lunes', 'martes', 'sábados', 'domingos'…)
export function diaSemanaPlural(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dia = DIAS[new Date(y, m - 1, d).getDay()].toLowerCase()
  return dia.endsWith('s') ? dia : `${dia}s`
}

// '2026-10-19' -> 'octubre'
export function nombreMes(iso: string): string {
  return MESES[Number(iso.split('-')[1]) - 1]
}

// Lunes de la semana de la fecha dada ('YYYY-MM-DD').
export function lunesDeLaSemana(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const fecha = new Date(y, m - 1, d)
  const atras = (fecha.getDay() + 6) % 7 // lunes = 0 ... domingo = 6
  return isoLocal(new Date(y, m - 1, d - atras))
}

// Primer y último día del mes (calendario) que está `mesesDespues` meses
// adelante del de la fecha dada. 0 = el mismo mes, 1 = el que viene.
export function inicioDeMes(iso: string, mesesDespues = 0): string {
  const [y, m] = iso.split('-').map(Number)
  return isoLocal(new Date(y, m - 1 + mesesDespues, 1))
}

export function finDeMes(iso: string, mesesDespues = 0): string {
  const [y, m] = iso.split('-').map(Number)
  return isoLocal(new Date(y, m + mesesDespues, 0))
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

// ¿Faltan menos de `horas` horas para la fecha+hora del turno (o ya pasó)?
export function faltanMenosDe(fechaIso: string, hora: string, horas: number): boolean {
  const [y, m, d] = fechaIso.split('-').map(Number)
  const [hh, mm] = hora.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm).getTime() - horas * 3600_000 < Date.now()
}

// Etiqueta relativa amigable para encabezar la lista: "Hoy", "Mañana" o el día.
export function encabezadoDia(iso: string): string {
  if (iso === hoyIso()) return 'Hoy'
  if (iso === sumarDias(hoyIso(), 1)) return 'Mañana'
  return fechaLarga(iso)
}

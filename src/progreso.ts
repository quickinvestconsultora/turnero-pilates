import type { ClaseMia } from './servicios/miCuenta'
import { hoyIso, lunesDeLaSemana, sumarDias } from './fechas'

export type Progreso = {
  esteMes: number
  total: number
  semanasSeguidas: number
}

// Cuenta las clases ya dadas en las que no faltó (asistió o quedó sin marcar).
// La racha son las semanas seguidas (lunes a domingo) con al menos una clase,
// contando hacia atrás; si esta semana todavía no tuvo ninguna, no corta la
// racha: se cuenta desde la semana pasada.
export function calcularProgreso(clases: ClaseMia[]): Progreso {
  const validas = clases.filter((c) => c.asistencia !== 'ausente')
  const hoy = hoyIso()
  const mes = hoy.slice(0, 7)

  const semanas = new Set(validas.map((c) => lunesDeLaSemana(c.fecha)))
  let semana = lunesDeLaSemana(hoy)
  if (!semanas.has(semana)) semana = sumarDias(semana, -7)
  let semanasSeguidas = 0
  while (semanas.has(semana)) {
    semanasSeguidas++
    semana = sumarDias(semana, -7)
  }

  return {
    esteMes: validas.filter((c) => c.fecha.startsWith(mes)).length,
    total: validas.length,
    semanasSeguidas,
  }
}

export function mensajeProgreso(p: Progreso): string {
  if (p.total === 0) return 'Tu primera clase te está esperando.'
  if (p.semanasSeguidas >= 4) return `¡${p.semanasSeguidas} semanas seguidas entrenando! Qué constancia.`
  if (p.semanasSeguidas >= 2) return `¡Vas ${p.semanasSeguidas} semanas seguidas! Seguí así.`
  if (p.esteMes >= 8) return '¡Mes a pleno! Se nota el esfuerzo.'
  if (p.esteMes >= 1) return '¡Buen comienzo de mes! Cada clase suma.'
  return 'Cuando quieras volver, te esperamos.'
}

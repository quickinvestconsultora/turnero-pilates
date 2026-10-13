import type { Perfil } from './tipos'
import { hoyIso } from './fechas'

// "Al día" no se renueva solo: cubre turnos hasta `al_dia_hasta`. Pasada esa
// fecha el abono está vencido y hay que volver a confirmar el pago.
export function abonoVencido(p: Pick<Perfil, 'estado_cuenta' | 'al_dia_hasta'>): boolean {
  return p.estado_cuenta === 'al_dia' && p.al_dia_hasta !== null && p.al_dia_hasta < hoyIso()
}

// '2026-10-31' -> '31/10'
export function diaMes(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d}/${m}`
}

import type { Perfil } from '../tipos'
import { abonoVencido, diaMes } from '../cuenta'
import { hoyIso, sumarDias } from '../fechas'

// Renglón informativo para la alumna con abono al día: hasta cuándo cubre. Si
// vence en una semana o menos, lo avisa con más énfasis (el cartel de pago
// aparece recién cuando ya venció o intenta reservar fuera de lo que cubre).
export default function EstadoAbono({ perfil }: { perfil: Perfil }) {
  if (perfil.estado_cuenta !== 'al_dia' || !perfil.al_dia_hasta || abonoVencido(perfil)) return null

  const pronto = perfil.al_dia_hasta <= sumarDias(hoyIso(), 7)

  return (
    <p className={pronto ? 'estado-abono estado-abono--pronto' : 'estado-abono'}>
      Tu abono cubre turnos hasta el <strong>{diaMes(perfil.al_dia_hasta)}</strong>.
      {pronto && ' Está por vencer: avisale al estudio cuando quieras renovarlo.'}
    </p>
  )
}

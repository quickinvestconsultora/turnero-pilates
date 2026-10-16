import { isoLocal } from './fechas'

// Días que faltan para el próximo cumpleaños (0 = hoy) y la edad que cumple.
// `nacimiento` es 'YYYY-MM-DD'. Quien nació un 29/2 festeja el 28/2 en los años
// que no son bisiestos.
export function proximoCumple(
  nacimiento: string | null,
  hoy = new Date(),
): { dias: number; edad: number; fecha: string } | null {
  if (!nacimiento) return null
  const [y, m, d] = nacimiento.split('-').map(Number)
  if (!y || !m || !d) return null

  const desdeHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const enAnio = (anio: number) => {
    const f = new Date(anio, m - 1, d)
    // 29/2 en año no bisiesto: JavaScript lo pasa a marzo; lo volvemos al 28/2.
    return f.getMonth() === m - 1 ? f : new Date(anio, 1, 28)
  }

  let cumple = enAnio(desdeHoy.getFullYear())
  if (cumple < desdeHoy) cumple = enAnio(desdeHoy.getFullYear() + 1)

  const dias = Math.round((cumple.getTime() - desdeHoy.getTime()) / 86_400_000)
  return { dias, edad: cumple.getFullYear() - y, fecha: isoLocal(cumple) }
}

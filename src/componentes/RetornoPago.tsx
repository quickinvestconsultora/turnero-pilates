import { useEffect, useRef, useState } from 'react'
import type { Perfil } from '../tipos'
import { obtenerMiPerfil } from '../servicios/perfil'

type Estado = 'confirmando' | 'listo' | 'pendiente' | 'error' | 'demora'

// Cuando la alumna vuelve de Mercado Pago (la app se abre con ?pago=ok, pendiente o
// error) muestra qué pasó. Si el pago se aprobó, consulta su cuenta unos segundos
// hasta que el aviso de Mercado Pago llegue y quede al día.
export default function RetornoPago({
  perfil,
  onPerfilActualizado,
}: {
  perfil: Perfil
  onPerfilActualizado: (p: Perfil) => void
}) {
  const [estado, setEstado] = useState<Estado | null>(null)
  const inicial = useRef({ estado: perfil.estado_cuenta, hasta: perfil.al_dia_hasta })
  // Siempre la versión más reciente de la función, sin reiniciar el efecto de abajo.
  const alActualizar = useRef(onPerfilActualizado)
  alActualizar.current = onPerfilActualizado

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const valor = params.get('pago')
    if (!valor) return

    // Dejamos la dirección limpia para que al recargar no vuelva a aparecer.
    params.delete('pago')
    const resto = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (resto ? '?' + resto : '') + window.location.hash)

    if (valor === 'error') {
      setEstado('error')
      return
    }
    if (valor === 'pendiente') setEstado('pendiente')
    else setEstado('confirmando')

    let intentos = 0
    const reloj = window.setInterval(async () => {
      intentos++
      try {
        const nuevo = await obtenerMiPerfil()
        if (
          nuevo &&
          nuevo.estado_cuenta === 'al_dia' &&
          (inicial.current.estado !== 'al_dia' || nuevo.al_dia_hasta !== inicial.current.hasta)
        ) {
          alActualizar.current(nuevo)
          setEstado('listo')
          window.clearInterval(reloj)
          return
        }
      } catch {
        // Se reintenta en el próximo ciclo.
      }
      if (intentos >= 15) {
        setEstado((e) => (e === 'confirmando' ? 'demora' : e))
        window.clearInterval(reloj)
      }
    }, 3000)
    return () => window.clearInterval(reloj)
  }, [])

  if (!estado) return null

  const mensajes: Record<Estado, { texto: string; clase: string }> = {
    confirmando: { texto: '¡Gracias! Estamos confirmando tu pago con Mercado Pago...', clase: 'mensaje-ok' },
    listo: { texto: '¡Listo! Tu pago quedó registrado y tu cuenta está al día. Ya podés reservar.', clase: 'mensaje-ok' },
    pendiente: {
      texto: 'Tu pago está pendiente de acreditación en Mercado Pago. Cuando se apruebe, tu cuenta queda al día sola.',
      clase: 'ayuda',
    },
    error: { texto: 'El pago no se completó. Podés intentar de nuevo cuando quieras.', clase: 'mensaje-error' },
    demora: {
      texto:
        'Todavía no vemos el pago acreditado. Si ya pagaste, puede demorar unos minutos: tu cuenta se actualiza sola. Si pasa mucho tiempo, avisale al estudio.',
      clase: 'ayuda',
    },
  }
  const { texto, clase } = mensajes[estado]

  return (
    <p className={clase} role="status">
      {texto}
    </p>
  )
}

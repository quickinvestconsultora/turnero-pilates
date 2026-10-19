// Edge Function de Supabase: manda notificaciones al celular (Web Push).
//
// No la llama nadie de afuera: la llama la función enviar-recordatorios, justo
// después de mandar cada mail, con la lista de avisos a empujar. Así, si algo
// falla acá, los mails siguen saliendo igual.
//
// Cuerpo: {"avisos": [{"perfil_id": "...", "titulo": "...", "cuerpo": "...", "url": "..."}]}
// Para probar sin esperar a un aviso real: {"prueba": true} manda una notificación
// de prueba a todos los dispositivos suscriptos.
//
// Secretos (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY    clave pública (la misma que va en src/config/push.ts)
//   VAPID_PRIVATE_KEY   clave privada (solo acá, nunca en el código ni en el chat)
//   VAPID_SUBJECT       (opcional) mailto: de contacto. Por defecto
//                       mailto:fortevastudio@gmail.com
//   CRON_SECRET         el mismo de enviar-recordatorios (encabezado x-cron-secret)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya los pone Supabase solo.
//
// Nota: este archivo no usa acentos graves ni plantillas de texto a propósito,
// para que se pueda copiar y pegar en el editor de Supabase sin que se rompa.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

type Aviso = { perfil_id: string; titulo: string; cuerpo: string; url?: string }
type Suscripcion = { perfil_id: string; endpoint: string; p256dh: string; auth: string }

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function motivo(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

Deno.serve(async (req) => {
  const secreto = Deno.env.get('CRON_SECRET')
  if (!secreto || req.headers.get('x-cron-secret') !== secreto) {
    return json({ error: 'No autorizado' }, 401)
  }

  const publica = Deno.env.get('VAPID_PUBLIC_KEY')
  const privada = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!publica || !privada) {
    return json({ error: 'Faltan los secretos VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY' }, 500)
  }
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:fortevastudio@gmail.com',
    publica,
    privada,
  )

  const cuerpo = await req.json().catch(() => ({}))
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const errores: string[] = []
  const vencidas: string[] = []
  let enviados = 0

  async function mandar(s: Suscripcion, aviso: { titulo: string; cuerpo: string; url?: string }) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ titulo: aviso.titulo, cuerpo: aviso.cuerpo, url: aviso.url || '/app/' }),
        { TTL: 3600 },
      )
      enviados++
    } catch (e) {
      const codigo = e && typeof e === 'object' && 'statusCode' in e ? (e as { statusCode: number }).statusCode : 0
      // 404 y 410: el dispositivo ya no existe (desinstalaron la app o quitaron el permiso).
      if (codigo === 404 || codigo === 410) vencidas.push(s.endpoint)
      else errores.push('push: ' + motivo(e))
    }
  }

  if (cuerpo && cuerpo.prueba) {
    const { data, error } = await supabase
      .from('suscripciones_push')
      .select('perfil_id, endpoint, p256dh, auth')
    if (error) return json({ error: error.message }, 500)
    const subs = (data ?? []) as Suscripcion[]
    for (const s of subs) {
      await mandar(s, { titulo: 'FORTEVA Studio', cuerpo: 'Así te van a llegar los avisos en el celular.' })
    }
    if (vencidas.length > 0) await supabase.from('suscripciones_push').delete().in('endpoint', vencidas)
    return json({ prueba: true, dispositivos: subs.length, enviados, vencidas: vencidas.length, errores })
  }

  const avisos: Aviso[] = Array.isArray(cuerpo && cuerpo.avisos) ? cuerpo.avisos.slice(0, 300) : []
  if (avisos.length === 0) return json({ avisos: 0, enviados: 0 })

  const ids = Array.from(new Set(avisos.map((a) => a.perfil_id).filter((x) => typeof x === 'string')))
  const { data, error } = await supabase
    .from('suscripciones_push')
    .select('perfil_id, endpoint, p256dh, auth')
    .in('perfil_id', ids)
  if (error) return json({ error: error.message }, 500)

  const porPerfil = new Map<string, Suscripcion[]>()
  for (const s of (data ?? []) as Suscripcion[]) {
    const lista = porPerfil.get(s.perfil_id) ?? []
    lista.push(s)
    porPerfil.set(s.perfil_id, lista)
  }

  for (const aviso of avisos) {
    for (const s of porPerfil.get(aviso.perfil_id) ?? []) {
      await mandar(s, aviso)
    }
  }

  if (vencidas.length > 0) {
    const { error: errorBorrar } = await supabase
      .from('suscripciones_push')
      .delete()
      .in('endpoint', vencidas)
    if (errorBorrar) errores.push('borrar vencidas: ' + errorBorrar.message)
  }

  return json({ avisos: avisos.length, enviados, vencidas: vencidas.length, errores })
})

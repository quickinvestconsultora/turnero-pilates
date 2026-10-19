// Edge Function de Supabase: recibe los avisos de pago de Mercado Pago (webhook).
//
// IMPORTANTE: al publicarla, DESACTIVÁ la opción "Verify JWT" de esta función:
// Mercado Pago no manda ningún token de Supabase. La seguridad no depende de eso:
// cada aviso se confirma consultando el pago directamente a la API de Mercado Pago
// con nuestro Access Token, se compara el monto con lo que esperábamos cobrar, y
// registrar_pago_mp no duplica nada si el aviso llega más de una vez.
//
// En Mercado Pago (Tus integraciones → tu aplicación → Webhooks → Configurar
// notificaciones) cargá esta URL, con el evento "Pagos":
//   https://TU-PROYECTO.supabase.co/functions/v1/mp-webhook
//
// Secretos (Supabase → Edge Functions → Secrets):
//   MP_ACCESS_TOKEN     Access Token de la aplicación de Mercado Pago
//   MP_WEBHOOK_SECRET   clave secreta de los webhooks (Webhooks → Configurar notificaciones)
//   MP_FIRMA_ESTRICTA   (opcional) poné "si" para rechazar los avisos cuya firma no
//                       coincida. Conviene activarlo después de ver en mp_eventos que
//                       los avisos reales llegan con firma_valida = true.
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya los pone Supabase solo.
//
// Nota: este archivo no usa acentos graves ni plantillas de texto a propósito,
// para que se pueda copiar y pegar en el editor de Supabase sin que se rompa.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function responder(texto: string, status = 200): Response {
  return new Response(texto, { status })
}

function aHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Firma de Mercado Pago: x-signature = "ts=...,v1=..."; v1 es el HMAC-SHA256 (hex) de
// "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" con la clave secreta.
async function firmaValida(req: Request, dataId: string, secreto: string): Promise<boolean> {
  const cabecera = req.headers.get('x-signature') ?? ''
  const requestId = req.headers.get('x-request-id') ?? ''
  let ts = ''
  let v1 = ''
  for (const parte of cabecera.split(',')) {
    const par = parte.split('=')
    if (par[0].trim() === 'ts') ts = (par[1] ?? '').trim()
    if (par[0].trim() === 'v1') v1 = (par[1] ?? '').trim()
  }
  if (!ts || !v1 || !secreto) return false

  const idParaFirma = /^[A-Za-z0-9]+$/.test(dataId) ? dataId.toLowerCase() : dataId
  const manifiesto = 'id:' + idParaFirma + ';request-id:' + requestId + ';ts:' + ts + ';'
  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const firma = aHex(await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(manifiesto)))
  return firma === v1
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const cuerpo = await req.json().catch(() => ({}))

  const tipo = String(url.searchParams.get('type') ?? url.searchParams.get('topic') ?? (cuerpo && cuerpo.type) ?? '')
  const dataId = String(
    url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? (cuerpo && cuerpo.data && cuerpo.data.id) ?? '',
  )

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  async function anotar(resultado: string, firma: boolean | null, detalle?: string) {
    await supabase
      .from('mp_eventos')
      .insert({ payment_id: dataId || null, tipo: tipo || null, firma_valida: firma, resultado, detalle: detalle ?? null })
  }

  // Solo nos interesan los pagos; el resto se confirma y se ignora.
  if (tipo !== 'payment' || !dataId) {
    return responder('ignorado')
  }

  const secreto = Deno.env.get('MP_WEBHOOK_SECRET') ?? ''
  const firmaOk = await firmaValida(req, dataId, secreto)
  if (!firmaOk && (Deno.env.get('MP_FIRMA_ESTRICTA') ?? '').toLowerCase() === 'si') {
    await anotar('firma_invalida', false)
    return responder('firma invalida', 401)
  }

  const token = Deno.env.get('MP_ACCESS_TOKEN')
  if (!token) {
    await anotar('sin_token', firmaOk)
    return responder('falta configurar', 500)
  }

  // Se confirma el pago directamente con Mercado Pago: lo que dice el aviso no se toma como cierto.
  const respuesta = await fetch('https://api.mercadopago.com/v1/payments/' + encodeURIComponent(dataId), {
    headers: { Authorization: 'Bearer ' + token },
  })
  if (!respuesta.ok) {
    await anotar('no_se_pudo_consultar', firmaOk, 'HTTP ' + respuesta.status)
    // 5xx de Mercado Pago o error nuestro: devolvemos error para que reintente.
    return responder('no se pudo consultar', respuesta.status >= 500 ? 502 : 200)
  }
  const pago = await respuesta.json()

  if (pago.status !== 'approved') {
    await anotar('estado_' + String(pago.status), firmaOk)
    return responder('ok')
  }
  if (pago.currency_id && pago.currency_id !== 'ARS') {
    await anotar('moneda_distinta', firmaOk, String(pago.currency_id))
    return responder('ok')
  }

  const referencia = String(pago.external_reference ?? '')
  if (!/^[0-9a-fA-F-]{36}$/.test(referencia)) {
    await anotar('referencia_invalida', firmaOk, referencia)
    return responder('ok')
  }

  const { data: resultado, error } = await supabase.rpc('registrar_pago_mp', {
    p_pago_mp_id: referencia,
    p_payment_id: dataId,
    p_monto: Number(pago.transaction_amount),
  })
  if (error) {
    await anotar('error_registrando', firmaOk, error.message)
    return responder('error', 500)
  }

  await anotar(String(resultado), firmaOk)
  return responder('ok')
})

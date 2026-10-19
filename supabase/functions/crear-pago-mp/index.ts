// Edge Function de Supabase: crea un pago de Mercado Pago (Checkout Pro) para la
// alumna que tiene la sesión abierta y devuelve el link para pagar.
//
// La llama la app con el usuario logueado (esta función SI verifica el JWT:
// dejá activada la opción "Verify JWT"). Cuerpo: {"plan": "clase" | "mes-1" | "mes-2" | "mes-3"}.
//
// Los precios se definen ACA (el navegador no decide cuánto se cobra). Tienen que
// coincidir con src/config/precios.ts; si cambian, actualizá los dos.
//
// Secretos (Supabase → Edge Functions → Secrets):
//   MP_ACCESS_TOKEN   Access Token de la aplicación de Mercado Pago (de prueba o de
//                     producción). Se carga solo en Supabase, nunca en el código.
//   APP_URL           (opcional) a dónde vuelve la alumna después de pagar. Por
//                     defecto https://turnero-pilates.vercel.app/app/
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY ya los pone Supabase.
//
// Nota: este archivo no usa acentos graves ni plantillas de texto a propósito,
// para que se pueda copiar y pegar en el editor de Supabase sin que se rompa.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PLANES: Record<string, { titulo: string; monto: number }> = {
  clase: { titulo: 'FORTEVA Studio - Clase suelta', monto: 15000 },
  'mes-1': { titulo: 'FORTEVA Studio - Abono mensual, 1 vez por semana', monto: 45000 },
  'mes-2': { titulo: 'FORTEVA Studio - Abono mensual, 2 veces por semana', monto: 50000 },
  'mes-3': { titulo: 'FORTEVA Studio - Abono mensual, 3 veces por semana', monto: 60000 },
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const token = Deno.env.get('MP_ACCESS_TOKEN')
  if (!token) return json({ error: 'Falta configurar Mercado Pago en el servidor.' }, 500)

  const autorizacion = req.headers.get('Authorization') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  // Quién es: se verifica con el token de sesión que manda la app.
  const comoUsuario = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacion } },
  })
  const { data: sesion } = await comoUsuario.auth.getUser()
  const usuario = sesion.user
  if (!usuario) return json({ error: 'Tenés que iniciar sesión.' }, 401)

  const cuerpo = await req.json().catch(() => ({}))
  const plan = PLANES[String(cuerpo && cuerpo.plan)]
  if (!plan) return json({ error: 'Plan inválido.' }, 400)
  const claveDelPlan = String(cuerpo.plan)

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: perfil } = await admin
    .from('perfiles')
    .select('id, rol, nombre, apellido')
    .eq('id', usuario.id)
    .maybeSingle()
  if (!perfil || perfil.rol !== 'alumno') {
    return json({ error: 'Solo las alumnas pueden pagar desde acá.' }, 403)
  }

  const { data: intento, error: errorIntento } = await admin
    .from('pagos_mp')
    .insert({ perfil_id: usuario.id, plan: claveDelPlan, monto: plan.monto })
    .select('id')
    .single()
  if (errorIntento || !intento) {
    return json({ error: 'No se pudo preparar el pago.' }, 500)
  }

  const appUrl = Deno.env.get('APP_URL') ?? 'https://turnero-pilates.vercel.app/app/'
  const separador = appUrl.indexOf('?') >= 0 ? '&' : '?'

  const preferencia = {
    items: [
      {
        id: claveDelPlan,
        title: plan.titulo,
        quantity: 1,
        currency_id: 'ARS',
        unit_price: plan.monto,
      },
    ],
    payer: { email: usuario.email, name: perfil.nombre, surname: perfil.apellido },
    external_reference: intento.id,
    notification_url: supabaseUrl + '/functions/v1/mp-webhook',
    back_urls: {
      success: appUrl + separador + 'pago=ok',
      pending: appUrl + separador + 'pago=pendiente',
      failure: appUrl + separador + 'pago=error',
    },
    auto_return: 'approved',
    statement_descriptor: 'FORTEVA',
  }

  const respuesta = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify(preferencia),
  })
  const datos = await respuesta.json().catch(() => ({}))
  if (!respuesta.ok || !datos.init_point) {
    await admin.from('pagos_mp').delete().eq('id', intento.id)
    return json({ error: 'Mercado Pago no pudo crear el pago.', detalle: datos && datos.message }, 502)
  }

  await admin.from('pagos_mp').update({ preference_id: datos.id }).eq('id', intento.id)

  return json({ url: datos.init_point, id: intento.id })
})

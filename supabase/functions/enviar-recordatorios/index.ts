// Edge Function de Supabase: manda el recordatorio de "tu clase es en 2 horas".
//
// La llama pg_cron cada 10 minutos (ver README, sección "Recordatorios por
// mail"). Pide a la base los avisos pendientes, los manda por la API de Brevo y
// los marca como enviados para que no se repitan.
//
// Secretos necesarios (Supabase → Edge Functions → Secrets):
//   BREVO_API_KEY   clave de la API de Brevo (no es la clave SMTP)
//   CRON_SECRET     texto largo inventado por vos; la tarea programada lo manda
//                   en el encabezado x-cron-secret para que nadie más la dispare
//   MAIL_REMITENTE  (opcional) remitente verificado en Brevo. Por defecto
//                   fortevastudio@gmail.com
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya los pone Supabase solo.
//
// Para probar sin mandar nada: invocarla con el cuerpo {"prueba": true} y te
// devuelve la lista de quién recibiría un mail.
//
// Nota: este archivo no usa acentos graves ni plantillas de texto a propósito,
// para que se pueda copiar y pegar en el editor de Supabase sin que se rompa.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const NOMBRE_ESTUDIO = 'FORTEVA Studio'
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

type Pendiente = {
  tipo: 'alumna' | 'invitada'
  reserva_id: string
  nombre: string
  email: string
  fecha: string // 'YYYY-MM-DD'
  hora: string // 'HH:MM:SS'
  profesora: string | null
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dia = DIAS[new Date(y, m - 1, d).getDay()]
  return dia + ' ' + d + ' de ' + MESES[m - 1]
}

function armarMail(p: Pendiente) {
  const hora = p.hora.slice(0, 5)
  const cuando = fechaLarga(p.fecha) + ' a las ' + hora
  const nombre = p.nombre.trim() || 'hola'
  const profesora = (p.profesora || '').trim()

  const texto =
    'Hola ' + nombre + '!\n\n' +
    'Te recordamos que en 2 horas tenés clase en ' + NOMBRE_ESTUDIO + '.\n\n' +
    cuando + (profesora ? ' con ' + profesora : '') + '.\n\n' +
    '¡Te esperamos!'

  const lineaProfesora = profesora
    ? '<br><span style="font-weight:normal;font-size:14px;color:#6d6455;">con ' + escapar(profesora) + '</span>'
    : ''

  const html =
    '<!doctype html>' +
    '<html lang="es"><body style="margin:0;background:#f5f1e8;font-family:Arial,Helvetica,sans-serif;color:#1c1813;">' +
    '<div style="max-width:480px;margin:0 auto;padding:28px 20px;">' +
    '<div style="background:#fffdf7;border:1px solid #e7dece;border-radius:12px;padding:28px 24px;">' +
    '<p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#948077;">' + NOMBRE_ESTUDIO + '</p>' +
    '<h1 style="margin:0 0 16px;font-size:22px;">Tu clase es en 2 horas</h1>' +
    '<p style="margin:0 0 14px;font-size:15px;line-height:1.5;">Hola ' + escapar(nombre) + ', te recordamos tu turno de hoy:</p>' +
    '<p style="margin:0 0 18px;padding:14px 16px;background:#f7f3ea;border-radius:8px;font-size:16px;font-weight:bold;">' +
    escapar(cuando) + lineaProfesora +
    '</p>' +
    '<p style="margin:0;font-size:15px;">¡Te esperamos!</p>' +
    '</div></div></body></html>'

  return { asunto: 'Hoy a las ' + hora + ': tu clase en ' + NOMBRE_ESTUDIO, texto, html }
}

async function enviarPorBrevo(p: Pendiente, apiKey: string, remitente: string): Promise<void> {
  const { asunto, texto, html } = armarMail(p)
  const respuesta = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: NOMBRE_ESTUDIO, email: remitente },
      to: [{ email: p.email, name: p.nombre || undefined }],
      subject: asunto,
      htmlContent: html,
      textContent: texto,
    }),
  })
  if (!respuesta.ok) {
    const detalle = (await respuesta.text()).slice(0, 300)
    throw new Error('Brevo respondió ' + respuesta.status + ': ' + detalle)
  }
}

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  const secreto = Deno.env.get('CRON_SECRET')
  if (!secreto || req.headers.get('x-cron-secret') !== secreto) {
    return json({ error: 'No autorizado' }, 401)
  }

  const cuerpo = await req.json().catch(() => ({}))
  const prueba = Boolean(cuerpo && cuerpo.prueba)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data, error } = await supabase.rpc('recordatorios_pendientes')
  if (error) return json({ error: error.message }, 500)
  const pendientes = (data ?? []) as Pendiente[]

  if (prueba) {
    return json({
      prueba: true,
      pendientes: pendientes.map((p) => ({
        tipo: p.tipo,
        nombre: p.nombre,
        email: p.email,
        fecha: p.fecha,
        hora: p.hora,
      })),
    })
  }

  const apiKey = Deno.env.get('BREVO_API_KEY')
  if (!apiKey) return json({ error: 'Falta el secreto BREVO_API_KEY' }, 500)
  const remitente = Deno.env.get('MAIL_REMITENTE') ?? 'fortevastudio@gmail.com'

  const enviadasAlumnas: string[] = []
  const enviadasInvitadas: string[] = []
  const fallidos: { email: string; error: string }[] = []

  for (const p of pendientes) {
    try {
      await enviarPorBrevo(p, apiKey, remitente)
      if (p.tipo === 'alumna') enviadasAlumnas.push(p.reserva_id)
      else enviadasInvitadas.push(p.reserva_id)
    } catch (e) {
      fallidos.push({ email: p.email, error: e instanceof Error ? e.message : String(e) })
    }
  }

  if (enviadasAlumnas.length > 0 || enviadasInvitadas.length > 0) {
    const { error: errorMarca } = await supabase.rpc('marcar_recordatorios', {
      p_reservas: enviadasAlumnas,
      p_invitadas: enviadasInvitadas,
    })
    if (errorMarca) return json({ error: errorMarca.message, fallidos }, 500)
  }

  return json({
    pendientes: pendientes.length,
    enviados: enviadasAlumnas.length + enviadasInvitadas.length,
    fallidos,
  })
})

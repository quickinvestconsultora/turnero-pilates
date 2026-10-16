// Edge Function de Supabase: manda los avisos automáticos por mail del turnero.
//
// La llama pg_cron cada 10 minutos (ver README, sección "Recordatorios por
// mail"). Pide a la base lo que hay pendiente, lo manda por la API de Brevo y lo
// marca como enviado para que no se repita. Tipos de aviso:
//   1. Recordatorio: tu clase es en 2 horas.
//   2. Abono por vencer: tu abono vence en los próximos 3 días.
//   3. Subió de la lista de espera: se liberó un lugar y quedaste anotada.
//   4. Deslinde firmado: PDF de cada alumna nueva, a la administradora.
//
// Secretos (Supabase → Edge Functions → Secrets):
//   BREVO_API_KEY   clave de la API de Brevo (no es la clave SMTP)
//   CRON_SECRET     texto largo inventado por vos; la tarea programada lo manda
//                   en el encabezado x-cron-secret para que nadie más la dispare
//   MAIL_REMITENTE  (opcional) remitente verificado en Brevo. Por defecto
//                   fortevastudio@gmail.com
//   MAIL_ADMIN      (opcional) a dónde va el deslinde. Por defecto
//                   mariavanesavieyra@hotmail.com
//   APP_URL, LINK_MERCADO_PAGO, ALIAS_TRANSFERENCIA, TITULAR_TRANSFERENCIA
//                   (opcionales) para el botón y los datos de pago del mail de
//                   vencimiento; por defecto, los mismos de src/config/pagos.ts
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya los pone Supabase solo.
//
// Para probar sin mandar nada: invocarla con el cuerpo {"prueba": true} y te
// devuelve la lista de quién recibiría cada mail.
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

const APP_URL = Deno.env.get('APP_URL') ?? 'https://turnero-pilates.vercel.app/app/'
const LINK_MP = Deno.env.get('LINK_MERCADO_PAGO') ?? 'https://mpago.la/2yrkbKh'
const ALIAS = Deno.env.get('ALIAS_TRANSFERENCIA') ?? 'vanesa.vieyra'
const TITULAR = Deno.env.get('TITULAR_TRANSFERENCIA') ?? 'Vanesa Vieyra'

type Recordatorio = {
  tipo: 'alumna' | 'invitada'
  reserva_id: string
  nombre: string
  email: string
  fecha: string
  hora: string
  profesora: string | null
}
type Vencimiento = { alumna_id: string; nombre: string; email: string; al_dia_hasta: string }
type Promocion = {
  reserva_id: string
  nombre: string
  email: string
  fecha: string
  hora: string
  profesora: string | null
}
type Deslinde = {
  alumna_id: string
  nombre: string
  apellido: string
  dni: string | null
  telefono: string
  email: string
  aceptado_en: string | null
}

type Mail = {
  para: { email: string; nombre?: string }
  asunto: string
  texto: string
  html: string
  adjuntos?: { name: string; content: string }[]
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

function diaMes(iso: string): string {
  const partes = iso.split('-').map(Number)
  return partes[2] + '/' + partes[1]
}

// Arma el mail con el mismo diseño para todos los avisos. "contenido" es HTML ya
// escapado; "boton" es opcional (texto y link).
function envolver(titulo: string, contenido: string, boton?: { texto: string; url: string }): string {
  const html =
    '<!doctype html><html lang="es"><body style="margin:0;background:#f5f1e8;font-family:Arial,Helvetica,sans-serif;color:#1c1813;">' +
    '<div style="max-width:480px;margin:0 auto;padding:28px 20px;">' +
    '<div style="background:#fffdf7;border:1px solid #e7dece;border-radius:12px;padding:28px 24px;">' +
    '<p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#948077;">' +
    NOMBRE_ESTUDIO + '</p>' +
    '<h1 style="margin:0 0 16px;font-size:22px;">' + escapar(titulo) + '</h1>' +
    contenido +
    (boton
      ? '<p style="margin:20px 0 0;text-align:center;"><a href="' + escapar(boton.url) +
        '" style="display:inline-block;padding:12px 26px;background:#1c1813;color:#f7f3ea;font-size:15px;font-weight:bold;text-decoration:none;border-radius:999px;">' +
        escapar(boton.texto) + '</a></p>'
      : '') +
    '</div></div></body></html>'
  return html
}

function parrafo(texto: string): string {
  return '<p style="margin:0 0 14px;font-size:15px;line-height:1.5;">' + texto + '</p>'
}

function destacado(texto: string): string {
  return '<p style="margin:0 0 18px;padding:14px 16px;background:#f7f3ea;border-radius:8px;font-size:16px;font-weight:bold;">' +
    texto + '</p>'
}

function mailRecordatorio(p: Recordatorio): Mail {
  const hora = p.hora.slice(0, 5)
  const cuando = fechaLarga(p.fecha) + ' a las ' + hora
  const nombre = p.nombre.trim() || 'hola'
  const profesora = (p.profesora || '').trim()
  const linea = profesora
    ? '<br><span style="font-weight:normal;font-size:14px;color:#6d6455;">con ' + escapar(profesora) + '</span>'
    : ''

  return {
    para: { email: p.email, nombre: p.nombre },
    asunto: 'Hoy a las ' + hora + ': tu clase en ' + NOMBRE_ESTUDIO,
    texto:
      'Hola ' + nombre + '!\n\nTe recordamos que en 2 horas tenés clase en ' + NOMBRE_ESTUDIO + '.\n\n' +
      cuando + (profesora ? ' con ' + profesora : '') + '.\n\n¡Te esperamos!',
    html: envolver(
      'Tu clase es en 2 horas',
      parrafo('Hola ' + escapar(nombre) + ', te recordamos tu turno de hoy:') +
        destacado(escapar(cuando) + linea) +
        parrafo('¡Te esperamos!'),
    ),
  }
}

function mailVencimiento(v: Vencimiento): Mail {
  const nombre = v.nombre.trim() || 'hola'
  const hasta = fechaLarga(v.al_dia_hasta)
  const formas: string[] = []
  if (LINK_MP) formas.push('Mercado Pago: ' + LINK_MP)
  if (ALIAS) formas.push('Transferencia al alias ' + ALIAS + (TITULAR ? ' (' + TITULAR + ')' : ''))

  const formasHtml = formas.length
    ? parrafo(formas.map((f) => escapar(f)).join('<br>'))
    : ''

  return {
    para: { email: v.email, nombre: v.nombre },
    asunto: 'Tu abono en ' + NOMBRE_ESTUDIO + ' vence el ' + diaMes(v.al_dia_hasta),
    texto:
      'Hola ' + nombre + '!\n\nTe avisamos que tu abono en ' + NOMBRE_ESTUDIO + ' cubre hasta el ' + hasta +
      '. Si querés seguir reservando, podés renovarlo así:\n\n' + formas.join('\n') +
      '\n\nDespués de pagar, subí el comprobante desde el turnero o avisanos.\n\n' + APP_URL,
    html: envolver(
      'Tu abono está por vencer',
      parrafo('Hola ' + escapar(nombre) + ', tu abono cubre turnos hasta el:') +
        destacado(escapar(hasta)) +
        parrafo('Si querés seguir reservando, podés renovarlo así:') +
        formasHtml +
        parrafo('Después de pagar, subí el comprobante desde el turnero o avisanos.'),
      { texto: 'Entrar al turnero', url: APP_URL },
    ),
  }
}

function mailPromocion(p: Promocion): Mail {
  const hora = p.hora.slice(0, 5)
  const cuando = fechaLarga(p.fecha) + ' a las ' + hora
  const nombre = p.nombre.trim() || 'hola'
  const profesora = (p.profesora || '').trim()
  const linea = profesora
    ? '<br><span style="font-weight:normal;font-size:14px;color:#6d6455;">con ' + escapar(profesora) + '</span>'
    : ''

  return {
    para: { email: p.email, nombre: p.nombre },
    asunto: '¡Se liberó un lugar! Quedaste anotada el ' + diaMes(p.fecha),
    texto:
      'Hola ' + nombre + '!\n\nEstabas en lista de espera y se liberó un lugar: ya quedaste anotada en ' +
      cuando + (profesora ? ' con ' + profesora : '') + '.\n\nSi no podés ir, cancelá desde el turnero: ' + APP_URL,
    html: envolver(
      '¡Se liberó un lugar!',
      parrafo('Hola ' + escapar(nombre) + ', estabas en lista de espera y ya quedaste anotada en:') +
        destacado(escapar(cuando) + linea) +
        parrafo('Si no podés ir, cancelá desde el turnero para que otra persona use el lugar.'),
      { texto: 'Entrar al turnero', url: APP_URL },
    ),
  }
}

function mailDeslinde(d: Deslinde, adminEmail: string, pdfBase64: string): Mail {
  const nombre = (d.nombre + ' ' + d.apellido).trim()
  const filas: [string, string][] = [
    ['Nombre', nombre],
    ['DNI', d.dni || '—'],
    ['Celular', d.telefono || '—'],
    ['Correo', d.email],
    ['Aceptó el deslinde', d.aceptado_en ? new Date(d.aceptado_en).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '—'],
  ]
  const tabla =
    '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 14px;">' +
    filas.map((f) =>
      '<tr><td style="padding:6px 0;color:#6d6455;width:42%;">' + escapar(f[0]) + '</td><td style="padding:6px 0;"><strong>' +
      escapar(f[1]) + '</strong></td></tr>').join('') +
    '</table>'

  return {
    para: { email: adminEmail },
    asunto: 'Nueva alumna registrada: ' + nombre,
    texto:
      'Se registró una alumna nueva.\n\n' + filas.map((f) => f[0] + ': ' + f[1]).join('\n') +
      '\n\nEl deslinde firmado va adjunto en PDF.',
    html: envolver(
      'Nueva alumna registrada',
      parrafo('Se registró una alumna nueva y aceptó el deslinde de responsabilidad. El PDF firmado va adjunto.') + tabla,
    ),
    adjuntos: [{ name: 'deslinde-' + nombre.replace(/[^A-Za-z0-9]+/g, '-') + '.pdf', content: pdfBase64 }],
  }
}

function aBase64(bytes: Uint8Array): string {
  let texto = ''
  const paso = 8192
  for (let i = 0; i < bytes.length; i += paso) {
    texto += String.fromCharCode(...bytes.subarray(i, i + paso))
  }
  return btoa(texto)
}

async function enviarPorBrevo(mail: Mail, apiKey: string, remitente: string): Promise<void> {
  const cuerpo: Record<string, unknown> = {
    sender: { name: NOMBRE_ESTUDIO, email: remitente },
    to: [{ email: mail.para.email, name: mail.para.nombre || undefined }],
    subject: mail.asunto,
    htmlContent: mail.html,
    textContent: mail.texto,
  }
  if (mail.adjuntos) cuerpo.attachment = mail.adjuntos

  const respuesta = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(cuerpo),
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

  // Cada tipo de aviso se pide por separado: si uno falla (por ejemplo, falta
  // correr el SQL de uno nuevo), los demás siguen funcionando.
  const errores: string[] = []
  async function pedir<T>(rpc: string): Promise<T[]> {
    const { data, error } = await supabase.rpc(rpc)
    if (error) {
      errores.push(rpc + ': ' + error.message)
      return []
    }
    return (data ?? []) as T[]
  }

  const recordatorios = await pedir<Recordatorio>('recordatorios_pendientes')
  const vencimientos = await pedir<Vencimiento>('avisos_vencimiento_pendientes')
  const promociones = await pedir<Promocion>('avisos_promocion_pendientes')
  const deslindes = await pedir<Deslinde>('deslindes_pendientes')

  if (prueba) {
    return json({
      prueba: true,
      recordatorios: recordatorios.map((p) => ({ nombre: p.nombre, email: p.email, fecha: p.fecha, hora: p.hora })),
      vencimientos: vencimientos.map((v) => ({ nombre: v.nombre, email: v.email, vence: v.al_dia_hasta })),
      promociones: promociones.map((p) => ({ nombre: p.nombre, email: p.email, fecha: p.fecha, hora: p.hora })),
      deslindes: deslindes.map((d) => ({ nombre: d.nombre + ' ' + d.apellido, email: d.email })),
      errores,
    })
  }

  const total = recordatorios.length + vencimientos.length + promociones.length + deslindes.length
  if (total === 0) return json({ pendientes: 0, enviados: 0, fallidos: [], errores })

  const apiKey = Deno.env.get('BREVO_API_KEY')
  if (!apiKey) return json({ error: 'Falta el secreto BREVO_API_KEY' }, 500)
  const remitente = Deno.env.get('MAIL_REMITENTE') ?? 'fortevastudio@gmail.com'
  const adminEmail = Deno.env.get('MAIL_ADMIN') ?? 'mariavanesavieyra@hotmail.com'

  const fallidos: { email: string; error: string }[] = []
  const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e))

  const enviadasAlumnas: string[] = []
  const enviadasInvitadas: string[] = []
  for (const p of recordatorios) {
    try {
      await enviarPorBrevo(mailRecordatorio(p), apiKey, remitente)
      if (p.tipo === 'alumna') enviadasAlumnas.push(p.reserva_id)
      else enviadasInvitadas.push(p.reserva_id)
    } catch (e) {
      fallidos.push({ email: p.email, error: motivo(e) })
    }
  }

  const enviadosVencimiento: string[] = []
  for (const v of vencimientos) {
    try {
      await enviarPorBrevo(mailVencimiento(v), apiKey, remitente)
      enviadosVencimiento.push(v.alumna_id)
    } catch (e) {
      fallidos.push({ email: v.email, error: motivo(e) })
    }
  }

  const enviadosPromocion: string[] = []
  for (const p of promociones) {
    try {
      await enviarPorBrevo(mailPromocion(p), apiKey, remitente)
      enviadosPromocion.push(p.reserva_id)
    } catch (e) {
      fallidos.push({ email: p.email, error: motivo(e) })
    }
  }

  const enviadosDeslinde: string[] = []
  for (const d of deslindes) {
    try {
      const { data: archivo, error: errorArchivo } = await supabase.storage
        .from('deslindes')
        .download(d.alumna_id + '/deslinde.pdf')
      if (errorArchivo || !archivo) throw new Error('No se pudo leer el PDF: ' + (errorArchivo ? errorArchivo.message : 'vacío'))
      const pdf = aBase64(new Uint8Array(await archivo.arrayBuffer()))
      await enviarPorBrevo(mailDeslinde(d, adminEmail, pdf), apiKey, remitente)
      enviadosDeslinde.push(d.alumna_id)
    } catch (e) {
      fallidos.push({ email: d.email, error: motivo(e) })
    }
  }

  if (enviadasAlumnas.length > 0 || enviadasInvitadas.length > 0) {
    const { error } = await supabase.rpc('marcar_recordatorios', {
      p_reservas: enviadasAlumnas,
      p_invitadas: enviadasInvitadas,
    })
    if (error) errores.push('marcar_recordatorios: ' + error.message)
  }
  if (enviadosVencimiento.length > 0 || enviadosPromocion.length > 0 || enviadosDeslinde.length > 0) {
    const { error } = await supabase.rpc('marcar_avisos', {
      p_vencimiento: enviadosVencimiento,
      p_promocion: enviadosPromocion,
      p_deslinde: enviadosDeslinde,
    })
    if (error) errores.push('marcar_avisos: ' + error.message)
  }

  return json({
    pendientes: total,
    enviados:
      enviadasAlumnas.length + enviadasInvitadas.length + enviadosVencimiento.length +
      enviadosPromocion.length + enviadosDeslinde.length,
    detalle: {
      recordatorios: enviadasAlumnas.length + enviadasInvitadas.length,
      vencimientos: enviadosVencimiento.length,
      promociones: enviadosPromocion.length,
      deslindes: enviadosDeslinde.length,
    },
    fallidos,
    errores,
  })
})

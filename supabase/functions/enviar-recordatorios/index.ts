// Edge Function de Supabase: manda los avisos automáticos por mail del turnero.
//
// La llama pg_cron cada 10 minutos (ver README, sección "Recordatorios por
// mail"). Pide a la base lo que hay pendiente, lo manda por la API de Brevo y lo
// marca como enviado para que no se repita. Tipos de aviso:
//   1. Recordatorio: tu clase es en 2 horas.
//   2. Abono por vencer: tu abono vence en los próximos 3 días.
//   3. Subió de la lista de espera: se liberó un lugar y quedaste anotada.
//   4. Deslinde firmado: PDF de cada alumna nueva, a la administradora.
//   5. Cumpleaños: saludo el día que cumple años (desde las 9, hora argentina).
//   6. Anuncios: los que el estudio carga con "mandar también por mail" (de a
//      40 por corrida).
//   8. Opinión baja: cuando una alumna responde la encuesta con 3 estrellas o menos,
//      le llega un aviso (con su comentario) a la administradora.
//   7. Informe mensual: el día 1 de cada mes (desde las 9), el cierre del mes
//      anterior a la administradora, con el detalle en Excel adjunto.
// Después de cada mail se manda, si la persona lo activó, la misma novedad como
// notificación al celular, a través de la función enviar-push (si esa falla, los
// mails salen igual).
//
// Secretos (Supabase → Edge Functions → Secrets):
//   MAIL_INFORME    (opcional) a dónde va el informe mensual; uno o varios mails
//                   separados por coma. Por defecto, el mismo de MAIL_ADMIN
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
  horas: number | null // cuántas horas antes se avisa (1, 2 o 3)
  perfil_id: string | null // para la notificación al celular (null si es invitada)
}
type Vencimiento = { alumna_id: string; nombre: string; email: string; al_dia_hasta: string }
type Promocion = {
  perfil_id: string | null
  reserva_id: string
  nombre: string
  email: string
  fecha: string
  hora: string
  profesora: string | null
}
type Cumple = { alumna_id: string; nombre: string; email: string }
type AnuncioMail = {
  anuncio_id: string
  titulo: string
  mensaje: string
  importante: boolean
  perfil_id: string
  nombre: string
  email: string
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

type Informe = Record<string, unknown>
type OpinionBaja = {
  opinion_id: string
  nombre: string
  apellido: string
  telefono: string
  estrellas: number
  comentario: string | null
  creada_en: string
}

type AvisoPush = { perfil_id: string; titulo: string; cuerpo: string; url?: string }

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
  const horas = p.horas === 1 ? '1 hora' : (p.horas || 2) + ' horas'
  const linea = profesora
    ? '<br><span style="font-weight:normal;font-size:14px;color:#6d6455;">con ' + escapar(profesora) + '</span>'
    : ''

  return {
    para: { email: p.email, nombre: p.nombre },
    asunto: 'Hoy a las ' + hora + ': tu clase en ' + NOMBRE_ESTUDIO,
    texto:
      'Hola ' + nombre + '!\n\nTe recordamos que en ' + horas + ' tenés clase en ' + NOMBRE_ESTUDIO + '.\n\n' +
      cuando + (profesora ? ' con ' + profesora : '') + '.\n\n¡Te esperamos!',
    html: envolver(
      'Tu clase es en ' + horas,
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

function mailCumple(c: Cumple): Mail {
  const nombre = c.nombre.trim() || 'hola'
  return {
    para: { email: c.email, nombre: c.nombre },
    asunto: '¡Feliz cumpleaños, ' + nombre + '!',
    texto:
      'Hola ' + nombre + '!\n\nEn ' + NOMBRE_ESTUDIO + ' te mandamos un abrazo enorme en tu día. ' +
      '¡Que tengas un cumpleaños hermoso!\n\nTe esperamos pronto para seguir entrenando juntas.\n\n' + APP_URL,
    html: envolver(
      '¡Feliz cumpleaños, ' + nombre + '! 🎂',
      parrafo('En ' + escapar(NOMBRE_ESTUDIO) + ' te mandamos un abrazo enorme en tu día.') +
        parrafo('¡Que tengas un cumpleaños hermoso! Te esperamos pronto para seguir entrenando juntas.'),
      { texto: 'Reservar mi próxima clase', url: APP_URL },
    ),
  }
}

function mailAnuncio(a: AnuncioMail): Mail {
  const nombre = a.nombre.trim() || 'hola'
  const titulo = a.titulo.trim() || (a.importante ? 'Aviso importante' : 'Novedades')
  const lineas = a.mensaje.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)

  return {
    para: { email: a.email, nombre: a.nombre },
    asunto: titulo + ' - ' + NOMBRE_ESTUDIO,
    texto: 'Hola ' + nombre + '!\n\n' + lineas.join('\n\n') + '\n\n' + APP_URL,
    html: envolver(
      titulo,
      parrafo('Hola ' + escapar(nombre) + ',') +
        lineas.map((l) => (a.importante ? destacado(escapar(l)) : parrafo(escapar(l)))).join(''),
      { texto: 'Entrar al turnero', url: APP_URL },
    ),
  }
}

function mailOpinionBaja(o: OpinionBaja, adminEmail: string): Mail {
  const nombre = (o.nombre + ' ' + o.apellido).trim() || 'Una alumna'
  const estrellas = o.estrellas + ' de 5'
  const comentario = (o.comentario || '').trim() || '(sin comentario)'
  const filas: [string, string][] = [
    ['Alumna', nombre],
    ['Celular', o.telefono || '-'],
    ['Puntuación', estrellas],
    ['Comentario', comentario],
  ]
  const tabla =
    '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 14px;">' +
    filas.map((fila) =>
      '<tr><td style="padding:6px 0;color:#6d6455;width:34%;vertical-align:top;">' + escapar(fila[0]) + '</td><td style="padding:6px 0;"><strong>' +
      escapar(fila[1]) + '</strong></td></tr>').join('') +
    '</table>'
  return {
    para: { email: adminEmail },
    asunto: 'Opinión de ' + nombre + ': ' + estrellas + ' estrellas',
    texto:
      'Una alumna dejó una opinión baja en la encuesta.' + String.fromCharCode(10) + String.fromCharCode(10) +
      filas.map((fila) => fila[0] + ': ' + fila[1]).join(String.fromCharCode(10)) +
      String.fromCharCode(10) + String.fromCharCode(10) + 'Conviene escribirle para entender qué pasó.',
    html: envolver(
      'Opinión para atender',
      parrafo('Una alumna respondió la encuesta con una puntuación baja. Conviene escribirle y entender qué pasó:') + tabla,
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

const MEDIOS: Record<string, string> = {
  transferencia: 'Transferencia',
  mercado_pago: 'Mercado Pago',
  efectivo: 'Efectivo',
  otro: 'Otro',
}

function pesosAr(n: number): string {
  const entero = Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return (n < 0 ? '-$' : '$') + entero
}

function nombreMesAr(ym: string): string {
  const partes = ym.split('-').map(Number)
  return MESES[partes[1] - 1] + ' ' + partes[0]
}

// Escapa una celda para CSV con separador punto y coma (Excel en espanol).
function celdaCsv(valor: unknown): string {
  let texto = valor === null || valor === undefined ? '' : String(valor)
  if (typeof valor === 'string' && /^[=+\-@]/.test(texto)) texto = "'" + texto
  return /[";\n\r]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto
}

function comparar(actual: number, anterior: number): string {
  const dif = actual - anterior
  if (dif === 0) return 'igual que el mes pasado'
  return pesosAr(Math.abs(dif)) + (dif > 0 ? ' mas' : ' menos') + ' que el mes pasado'
}

function mailInforme(d: Informe, destinatario: string): Mail {
  const n = (clave: string) => Number(d[clave] || 0)
  const mes = String(d.mes)
  const ingresos = n('cobrado') + n('otros')
  const ingresosAnt = n('cobrado_ant') + n('otros_ant')
  const egresos = n('gastos') + n('liquidaciones')
  const egresosAnt = n('gastos_ant') + n('liquidaciones_ant')
  const resultado = ingresos - egresos
  const resultadoAnt = ingresosAnt - egresosAnt
  const margen = ingresos > 0 ? Math.round((resultado / ingresos) * 100) + '%' : '-'
  const meta = n('meta_ingresos')

  const filas: [string, string, string][] = [
    ['Ingresos', pesosAr(ingresos), comparar(ingresos, ingresosAnt)],
    ['   Cobros a alumnas', pesosAr(n('cobrado')), ''],
    ['   Otros ingresos', pesosAr(n('otros')), ''],
    ['Egresos', pesosAr(egresos), comparar(egresos, egresosAnt)],
    ['   Gastos', pesosAr(n('gastos')), ''],
    ['   Pagos a profesoras', pesosAr(n('liquidaciones')), ''],
    [resultado < 0 ? 'Perdida' : 'Ganancia', pesosAr(resultado), 'margen ' + margen + '; ' + comparar(resultado, resultadoAnt)],
    ['Alumnas que vinieron', String(n('alumnas_activas')), ''],
    ['Altas nuevas', String(n('altas')), 'el mes pasado: ' + n('altas_ant')],
  ]
  if (meta > 0) {
    filas.push(['Meta de ingresos', pesosAr(meta), ingresos >= meta ? 'cumplida' : 'se llego al ' + Math.round((ingresos / meta) * 100) + '%'])
  }

  const tabla =
    '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 14px;">' +
    filas.map((fila) =>
      '<tr><td style="padding:6px 0;color:#6d6455;">' + escapar(fila[0]).replace(/ /g, '&nbsp;') + '</td>' +
      '<td style="padding:6px 8px;text-align:right;"><strong>' + escapar(fila[1]) + '</strong></td>' +
      '<td style="padding:6px 0;font-size:12px;color:#948077;">' + escapar(fila[2]) + '</td></tr>').join('') +
    '</table>'

  const texto =
    'Resumen de ' + nombreMesAr(mes) + '\n\n' + filas.map((fila) => fila[0].trim() + ': ' + fila[1] + (fila[2] ? ' (' + fila[2] + ')' : '')).join('\n') +
    '\n\nEl detalle completo va adjunto en un archivo para Excel.'

  // Detalle para Excel: un renglon por movimiento, ingresos y egresos juntos.
  const lineas: unknown[][] = [['Tipo', 'Fecha', 'Detalle', 'Categoria o medio', 'Monto']]
  const lista = (clave: string) => (Array.isArray(d[clave]) ? (d[clave] as Record<string, unknown>[]) : [])
  for (const c of lista('cobros')) lineas.push(['Cobro a alumna', c.fecha, c.alumna, (MEDIOS[String(c.medio)] || c.medio) + ' / ' + c.concepto, c.monto])
  for (const i of lista('ingresos_extra')) lineas.push(['Otro ingreso', i.fecha, i.concepto, i.categoria, i.monto])
  for (const g of lista('gastos_detalle')) lineas.push(['Gasto', g.fecha, g.concepto, g.categoria, g.monto === null ? '' : -Number(g.monto)])
  for (const l of lista('liquidaciones_detalle')) lineas.push(['Pago a profesora', l.fecha, l.profesora, MEDIOS[String(l.medio)] || l.medio, -Number(l.monto)])
  const csv = '\ufeff' + lineas.map((fila) => fila.map(celdaCsv).join(';')).join('\r\n')

  return {
    para: { email: destinatario },
    asunto: 'Cierre de ' + nombreMesAr(mes) + ' - ' + NOMBRE_ESTUDIO,
    texto: texto,
    html: envolver(
      'Cierre de ' + nombreMesAr(mes),
      parrafo('Este es el resumen del mes que termino en ' + escapar(NOMBRE_ESTUDIO) + ':') + tabla +
        parrafo('El detalle de cada cobro, gasto y pago va adjunto en un archivo para Excel.'),
    ),
    adjuntos: [{ name: 'detalle-' + mes + '.csv', content: aBase64(new TextEncoder().encode(csv)) }],
  }
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
  const cumples = await pedir<Cumple>('avisos_cumple_pendientes')
  const anuncios = await pedir<AnuncioMail>('anuncios_mail_pendientes')
  const opiniones = await pedir<OpinionBaja>('opiniones_bajas_pendientes')
  let mesInforme: string | null = null
  {
    const { data, error } = await supabase.rpc('informe_mensual_pendiente')
    if (error) errores.push('informe_mensual_pendiente: ' + error.message)
    else if (data) mesInforme = String(data)
  }

  if (prueba) {
    return json({
      prueba: true,
      recordatorios: recordatorios.map((p) => ({ nombre: p.nombre, email: p.email, fecha: p.fecha, hora: p.hora })),
      vencimientos: vencimientos.map((v) => ({ nombre: v.nombre, email: v.email, vence: v.al_dia_hasta })),
      promociones: promociones.map((p) => ({ nombre: p.nombre, email: p.email, fecha: p.fecha, hora: p.hora })),
      deslindes: deslindes.map((d) => ({ nombre: d.nombre + ' ' + d.apellido, email: d.email })),
      cumples: cumples.map((c) => ({ nombre: c.nombre, email: c.email })),
      anuncios: anuncios.map((a) => ({ titulo: a.titulo, nombre: a.nombre, email: a.email })),
      informe_mensual: mesInforme,
      opiniones_bajas: opiniones.map((o) => ({ alumna: (o.nombre + ' ' + o.apellido).trim(), estrellas: o.estrellas })),
      errores,
    })
  }

  const total = recordatorios.length + vencimientos.length + promociones.length + deslindes.length +
    cumples.length + anuncios.length + opiniones.length + (mesInforme ? 1 : 0)
  if (total === 0) return json({ pendientes: 0, enviados: 0, fallidos: [], errores })

  const apiKey = Deno.env.get('BREVO_API_KEY')
  if (!apiKey) return json({ error: 'Falta el secreto BREVO_API_KEY' }, 500)
  const remitente = Deno.env.get('MAIL_REMITENTE') ?? 'fortevastudio@gmail.com'
  const adminEmail = Deno.env.get('MAIL_ADMIN') ?? 'mariavanesavieyra@hotmail.com'

  const fallidos: { email: string; error: string }[] = []
  const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e))

  // Avisos para el celular: se arman después de cada mail enviado con éxito.
  const avisosPush: AvisoPush[] = []

  const enviadasAlumnas: string[] = []
  const enviadasInvitadas: string[] = []
  for (const p of recordatorios) {
    try {
      await enviarPorBrevo(mailRecordatorio(p), apiKey, remitente)
      if (p.perfil_id) {
        avisosPush.push({
          perfil_id: p.perfil_id,
          titulo: 'Tu clase es en ' + (p.horas === 1 ? '1 hora' : (p.horas || 2) + ' horas'),
          cuerpo: 'Hoy a las ' + p.hora.slice(0, 5) + (p.profesora ? ' con ' + p.profesora : '') + '. ¡Te esperamos!',
        })
      }
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
      avisosPush.push({
        perfil_id: v.alumna_id,
        titulo: 'Tu abono está por vencer',
        cuerpo: 'Cubre turnos hasta el ' + fechaLarga(v.al_dia_hasta) + '. Renovalo para seguir reservando.',
      })
      enviadosVencimiento.push(v.alumna_id)
    } catch (e) {
      fallidos.push({ email: v.email, error: motivo(e) })
    }
  }

  const enviadosPromocion: string[] = []
  for (const p of promociones) {
    try {
      await enviarPorBrevo(mailPromocion(p), apiKey, remitente)
      if (p.perfil_id) {
        avisosPush.push({
          perfil_id: p.perfil_id,
          titulo: '¡Se liberó un lugar!',
          cuerpo: 'Quedaste anotada el ' + fechaLarga(p.fecha) + ' a las ' + p.hora.slice(0, 5) + '.',
        })
      }
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

  const enviadosCumple: string[] = []
  for (const c of cumples) {
    try {
      await enviarPorBrevo(mailCumple(c), apiKey, remitente)
      avisosPush.push({
        perfil_id: c.alumna_id,
        titulo: '¡Feliz cumpleaños, ' + (c.nombre.trim() || 'hola') + '!',
        cuerpo: 'Un abrazo enorme de todo el equipo de ' + NOMBRE_ESTUDIO + '.',
      })
      enviadosCumple.push(c.alumna_id)
    } catch (e) {
      fallidos.push({ email: c.email, error: motivo(e) })
    }
  }

  // Informe mensual: se manda a cada destinatario; se marca como enviado si salio al menos uno.
  let informeEnviado = false
  if (mesInforme) {
    const { data: datos, error: errorInforme } = await supabase.rpc('informe_mensual_datos', { p_mes: mesInforme })
    if (errorInforme || !datos) {
      errores.push('informe_mensual_datos: ' + (errorInforme ? errorInforme.message : 'vacio'))
    } else {
      const destinatarios = (Deno.env.get('MAIL_INFORME') ?? adminEmail)
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x.length > 0)
      for (const destino of destinatarios) {
        try {
          await enviarPorBrevo(mailInforme(datos as Informe, destino), apiKey, remitente)
          informeEnviado = true
        } catch (e) {
          fallidos.push({ email: destino, error: motivo(e) })
        }
      }
    }
  }

  const opinionesAvisadas: string[] = []
  for (const o of opiniones) {
    try {
      await enviarPorBrevo(mailOpinionBaja(o, adminEmail), apiKey, remitente)
      opinionesAvisadas.push(o.opinion_id)
    } catch (e) {
      fallidos.push({ email: adminEmail, error: motivo(e) })
    }
  }

  const anunciosEnviados: string[] = []
  const perfilesAnuncio: string[] = []
  for (const a of anuncios) {
    try {
      await enviarPorBrevo(mailAnuncio(a), apiKey, remitente)
      avisosPush.push({
        perfil_id: a.perfil_id,
        titulo: a.titulo.trim() || (a.importante ? 'Aviso importante' : 'Novedades de ' + NOMBRE_ESTUDIO),
        cuerpo: a.mensaje.length > 160 ? a.mensaje.slice(0, 157) + '...' : a.mensaje,
      })
      anunciosEnviados.push(a.anuncio_id)
      perfilesAnuncio.push(a.perfil_id)
    } catch (e) {
      fallidos.push({ email: a.email, error: motivo(e) })
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

  if (opinionesAvisadas.length > 0) {
    const { error } = await supabase.rpc('marcar_opiniones_avisadas', { p_ids: opinionesAvisadas })
    if (error) errores.push('marcar_opiniones_avisadas: ' + error.message)
  }

  if (informeEnviado && mesInforme) {
    const { error } = await supabase.rpc('marcar_informe_enviado', { p_mes: mesInforme })
    if (error) errores.push('marcar_informe_enviado: ' + error.message)
  }

  if (anunciosEnviados.length > 0) {
    const { error } = await supabase.rpc('marcar_anuncios_enviados', {
      p_anuncios: anunciosEnviados,
      p_perfiles: perfilesAnuncio,
    })
    if (error) errores.push('marcar_anuncios_enviados: ' + error.message)
  }

  if (enviadosCumple.length > 0) {
    const { error } = await supabase.rpc('marcar_avisos_cumple', { p_alumnas: enviadosCumple })
    if (error) errores.push('marcar_avisos_cumple: ' + error.message)
  }

  // Notificaciones al celular: función aparte, así un problema ahí no frena los mails.
  let push = 0
  if (avisosPush.length > 0) {
    try {
      const respuesta = await fetch(Deno.env.get('SUPABASE_URL')! + '/functions/v1/enviar-push', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-cron-secret': secreto,
          Authorization: 'Bearer ' + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        },
        body: JSON.stringify({ avisos: avisosPush }),
        signal: AbortSignal.timeout(25000),
      })
      if (respuesta.ok) {
        const r = await respuesta.json().catch(() => ({}))
        push = Number(r.enviados) || 0
      } else if (respuesta.status !== 404) {
        errores.push('enviar-push: ' + respuesta.status)
      }
    } catch (e) {
      errores.push('enviar-push: ' + motivo(e))
    }
  }

  return json({
    pendientes: total,
    enviados:
      enviadasAlumnas.length + enviadasInvitadas.length + enviadosVencimiento.length +
      enviadosPromocion.length + enviadosDeslinde.length + enviadosCumple.length + anunciosEnviados.length,
    detalle: {
      recordatorios: enviadasAlumnas.length + enviadasInvitadas.length,
      vencimientos: enviadosVencimiento.length,
      promociones: enviadosPromocion.length,
      deslindes: enviadosDeslinde.length,
      cumples: enviadosCumple.length,
      anuncios: anunciosEnviados.length,
      notificaciones: push,
      informe: informeEnviado ? 1 : 0,
      opiniones: opinionesAvisadas.length,
    },
    fallidos,
    errores,
  })
})

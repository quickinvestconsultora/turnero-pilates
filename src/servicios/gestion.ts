import { supabase } from '../lib/supabase'
import type { MedioPago } from './clientes'

// numeric y bigint llegan como texto en algunas respuestas.
const num = (v: unknown): number => Number(v ?? 0)
const numONull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

// ---- Resumen del estudio ----------------------------------------------------

export type Resumen = {
  meta_ingresos: number
  topes_superados: number
  cobrado_mes: number
  cobrado_mes_anterior: number
  egresos_mes: number
  egresos_mes_anterior: number
  alumnas_total: number
  alumnas_activas: number
  altas_mes: number
  altas_mes_anterior: number
  al_dia: number
  vencen_semana: number
  vencidas: number
  deben: number
  en_prueba: number
  comprobantes_pendientes: number
  para_reactivar: number
  clases_30d: number
  reservas_30d: number
  cupo_30d: number
}

export async function obtenerResumen(): Promise<Resumen> {
  const { data, error } = await supabase.rpc('resumen_estudio')
  if (error) throw new Error(error.message)
  const r = (data ?? {}) as Record<string, unknown>
  const out = {} as Record<string, number>
  for (const k of Object.keys(r)) out[k] = num(r[k])
  return out as unknown as Resumen
}

// ---- Balance y egresos ------------------------------------------------------

export type Balance = { cobrado: number; otros: number; gastos: number; liquidaciones: number }

export async function obtenerBalance(mes: string): Promise<Balance> {
  const { data, error } = await supabase.rpc('balance_mes', { p_mes: mes })
  if (error) throw new Error(error.message)
  const f = ((data ?? []) as Record<string, unknown>[])[0] ?? {}
  return {
    cobrado: num(f.cobrado),
    otros: num(f.otros_ingresos),
    gastos: num(f.gastos),
    liquidaciones: num(f.liquidaciones),
  }
}

export type CategoriaGasto =
  | 'alquiler'
  | 'servicios'
  | 'insumos'
  | 'sueldos'
  | 'impuestos'
  | 'marketing'
  | 'otro'

export const ETIQUETA_CATEGORIA: Record<CategoriaGasto, string> = {
  alquiler: 'Alquiler',
  servicios: 'Servicios (luz, internet…)',
  insumos: 'Insumos y mantenimiento',
  sueldos: 'Sueldos',
  impuestos: 'Impuestos',
  marketing: 'Publicidad',
  otro: 'Otro',
}

export type Gasto = {
  id: string
  fecha: string
  categoria: CategoriaGasto
  concepto: string
  monto: number
  nota: string | null
  comprobante_ruta: string | null
}

export async function listarGastos(desde: string, hasta: string): Promise<Gasto[]> {
  const { data, error } = await supabase
    .from('gastos')
    .select('id, fecha, categoria, concepto, monto, nota, comprobante_ruta')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })
    .order('creado_en', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as (Omit<Gasto, 'monto'> & { monto: string })[]).map((g) => ({
    ...g,
    monto: Number(g.monto),
  }))
}

export async function agregarGasto(g: {
  fecha: string
  categoria: CategoriaGasto
  concepto: string
  monto: number
  nota: string
}): Promise<string> {
  const { data, error } = await supabase
    .from('gastos')
    .insert({
      fecha: g.fecha,
      categoria: g.categoria,
      concepto: g.concepto.trim(),
      monto: g.monto,
      nota: g.nota.trim() || null,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return String((data as { id: string }).id)
}

export async function borrarGasto(id: string, rutaComprobante?: string | null): Promise<void> {
  const { error } = await supabase.from('gastos').delete().eq('id', id)
  if (error) throw new Error(error.message)
  if (rutaComprobante) await supabase.storage.from('gastos').remove([rutaComprobante])
}

// ---- Liquidación de profesoras ---------------------------------------------

export type FilaLiquidacion = {
  profesora_id: string
  nombre: string
  clases: number
  valor_clase: number | null
  a_pagar: number | null
  pagado: number
  saldo: number | null
}

export async function liquidacionDelMes(mes: string): Promise<FilaLiquidacion[]> {
  const { data, error } = await supabase.rpc('liquidacion_mes', { p_mes: mes })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((f) => ({
    profesora_id: String(f.profesora_id),
    nombre: String(f.nombre),
    clases: num(f.clases),
    valor_clase: numONull(f.valor_clase),
    a_pagar: numONull(f.a_pagar),
    pagado: num(f.pagado),
    saldo: numONull(f.saldo),
  }))
}

export type MiLiquidacion = Omit<FilaLiquidacion, 'profesora_id' | 'nombre'>

export async function miLiquidacion(mes: string): Promise<MiLiquidacion> {
  const { data, error } = await supabase.rpc('mi_liquidacion', { p_mes: mes })
  if (error) throw new Error(error.message)
  const f = ((data ?? []) as Record<string, unknown>[])[0] ?? {}
  return {
    clases: num(f.clases),
    valor_clase: numONull(f.valor_clase),
    a_pagar: numONull(f.a_pagar),
    pagado: num(f.pagado),
    saldo: numONull(f.saldo),
  }
}

export async function guardarTarifa(profesoraId: string, valor: number): Promise<void> {
  const { error } = await supabase.from('tarifas_profesoras').upsert({
    profesora_id: profesoraId,
    valor_clase: valor,
    actualizado_en: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

export type PagoProfesora = {
  id: string
  profesora_id: string
  periodo: string
  clases: number
  valor_clase: number | null
  monto: number
  medio: MedioPago
  fecha: string
  nota: string | null
}

const COLUMNAS_PAGO_PROFE = 'id, profesora_id, periodo, clases, valor_clase, monto, medio, fecha, nota'

function aPagoProfesora(f: Record<string, unknown>): PagoProfesora {
  return {
    id: String(f.id),
    profesora_id: String(f.profesora_id),
    periodo: String(f.periodo),
    clases: num(f.clases),
    valor_clase: numONull(f.valor_clase),
    monto: num(f.monto),
    medio: f.medio as MedioPago,
    fecha: String(f.fecha),
    nota: (f.nota as string | null) ?? null,
  }
}

// Pagos del mes (staff: de todas las profesoras) o, con profesoraId, todos los
// de una profesora. Una profesora solo puede leer los suyos (lo hace cumplir la base).
export async function listarPagosProfesoras(opciones: {
  periodo?: string
  profesoraId?: string
}): Promise<PagoProfesora[]> {
  let consulta = supabase.from('pagos_profesoras').select(COLUMNAS_PAGO_PROFE)
  if (opciones.periodo) consulta = consulta.eq('periodo', opciones.periodo)
  if (opciones.profesoraId) consulta = consulta.eq('profesora_id', opciones.profesoraId)
  const { data, error } = await consulta
    .order('periodo', { ascending: false })
    .order('fecha', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(aPagoProfesora)
}

export async function registrarPagoProfesora(p: {
  profesoraId: string
  periodo: string
  clases: number
  valorClase: number | null
  monto: number
  medio: MedioPago
  fecha: string
  nota: string
}): Promise<void> {
  const { error } = await supabase.from('pagos_profesoras').insert({
    profesora_id: p.profesoraId,
    periodo: p.periodo,
    clases: p.clases,
    valor_clase: p.valorClase,
    monto: p.monto,
    medio: p.medio,
    fecha: p.fecha,
    nota: p.nota.trim() || null,
  })
  if (error) throw new Error(error.message)
}

export async function borrarPagoProfesora(id: string): Promise<void> {
  const { error } = await supabase.from('pagos_profesoras').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- Anuncios ---------------------------------------------------------------

export type PublicoAnuncio = 'alumnas' | 'profesoras' | 'todas'

export const ETIQUETA_PUBLICO: Record<PublicoAnuncio, string> = {
  alumnas: 'Alumnas',
  profesoras: 'Profesoras',
  todas: 'Todas (alumnas y profesoras)',
}

export type Anuncio = {
  id: string
  titulo: string
  mensaje: string
  para: PublicoAnuncio
  importante: boolean
  desde: string
  hasta: string | null
  activo: boolean
  enviar_mail: boolean
  creado_en: string
}

const COLUMNAS_ANUNCIO = 'id, titulo, mensaje, para, importante, desde, hasta, activo, enviar_mail, creado_en'

// Staff: todos los anuncios. El resto: la base solo devuelve los vigentes que
// les corresponden.
export async function listarAnuncios(): Promise<Anuncio[]> {
  const { data, error } = await supabase
    .from('anuncios')
    .select(COLUMNAS_ANUNCIO)
    .order('creado_en', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Anuncio[]
}

export async function crearAnuncio(a: {
  titulo: string
  mensaje: string
  para: PublicoAnuncio
  importante: boolean
  desde: string
  hasta: string | null
  enviarMail: boolean
}): Promise<void> {
  const { error } = await supabase.from('anuncios').insert({
    titulo: a.titulo.trim(),
    mensaje: a.mensaje.trim(),
    para: a.para,
    importante: a.importante,
    desde: a.desde,
    hasta: a.hasta || null,
    enviar_mail: a.enviarMail,
  })
  if (error) throw new Error(error.message)
}

export async function cambiarAnuncioActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from('anuncios').update({ activo }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function borrarAnuncio(id: string): Promise<void> {
  const { error } = await supabase.from('anuncios').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- Finanzas: panorama, gastos fijos y otros ingresos -----------------------

export type LineaDetalle = { clave: string; monto: number; cantidad: number }

export type DetalleFinanciero = {
  cobros_por_concepto: LineaDetalle[]
  otros_por_categoria: LineaDetalle[]
  ingresos_por_medio: LineaDetalle[]
  gastos_por_categoria: LineaDetalle[]
  cobros_sin_monto: number
  pagos: number
  alumnas_pagaron: number
  clases_dadas: number
  lugares_usados: number
}

function lineas(v: unknown): LineaDetalle[] {
  return ((v ?? []) as Record<string, unknown>[]).map((l) => ({
    clave: String(l.clave),
    monto: num(l.monto),
    cantidad: num(l.cantidad),
  }))
}

export async function obtenerDetalleFinanciero(mes: string): Promise<DetalleFinanciero> {
  const { data, error } = await supabase.rpc('detalle_financiero', { p_mes: mes })
  if (error) throw new Error(error.message)
  const d = (data ?? {}) as Record<string, unknown>
  return {
    cobros_por_concepto: lineas(d.cobros_por_concepto),
    otros_por_categoria: lineas(d.otros_por_categoria),
    ingresos_por_medio: lineas(d.ingresos_por_medio),
    gastos_por_categoria: lineas(d.gastos_por_categoria),
    cobros_sin_monto: num(d.cobros_sin_monto),
    pagos: num(d.pagos),
    alumnas_pagaron: num(d.alumnas_pagaron),
    clases_dadas: num(d.clases_dadas),
    lugares_usados: num(d.lugares_usados),
  }
}

export type MesFinanciero = {
  mes: string
  cobros: number
  otros: number
  gastos: number
  liquidaciones: number
}

export async function obtenerPanorama(meses = 12): Promise<MesFinanciero[]> {
  const { data, error } = await supabase.rpc('panorama_financiero', { p_meses: meses })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((f) => ({
    mes: String(f.mes),
    cobros: num(f.cobros),
    otros: num(f.otros),
    gastos: num(f.gastos),
    liquidaciones: num(f.liquidaciones),
  }))
}

export type GastoFijo = {
  id: string
  concepto: string
  categoria: CategoriaGasto
  monto: number
  dia: number
  activo: boolean
}

export async function listarGastosFijos(): Promise<GastoFijo[]> {
  const { data, error } = await supabase
    .from('gastos_fijos')
    .select('id, concepto, categoria, monto, dia, activo')
    .order('activo', { ascending: false })
    .order('concepto', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as (Omit<GastoFijo, 'monto'> & { monto: string })[]).map((g) => ({
    ...g,
    monto: Number(g.monto),
  }))
}

export async function guardarGastoFijo(g: {
  id?: string
  concepto: string
  categoria: CategoriaGasto
  monto: number
  dia: number
}): Promise<void> {
  const fila = { concepto: g.concepto.trim(), categoria: g.categoria, monto: g.monto, dia: g.dia }
  const { error } = g.id
    ? await supabase.from('gastos_fijos').update(fila).eq('id', g.id)
    : await supabase.from('gastos_fijos').insert(fila)
  if (error) throw new Error(error.message)
}

export async function cambiarGastoFijoActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from('gastos_fijos').update({ activo }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function borrarGastoFijo(id: string): Promise<void> {
  const { error } = await supabase.from('gastos_fijos').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Carga en el mes los gastos fijos activos que todavía no están. Devuelve cuántos cargó.
export async function cargarGastosFijos(mes: string): Promise<number> {
  const { data, error } = await supabase.rpc('cargar_gastos_fijos', { p_mes: mes })
  if (error) throw new Error(error.message)
  return num(data)
}

export type CategoriaIngreso = 'alquiler_sala' | 'productos' | 'eventos' | 'otro'

export const ETIQUETA_INGRESO: Record<CategoriaIngreso, string> = {
  alquiler_sala: 'Alquiler de la sala',
  productos: 'Venta de productos',
  eventos: 'Eventos y talleres',
  otro: 'Otro',
}

export type IngresoExtra = {
  id: string
  fecha: string
  categoria: CategoriaIngreso
  concepto: string
  monto: number
  medio: MedioPago
  nota: string | null
}

export async function listarIngresosExtra(desde: string, hasta: string): Promise<IngresoExtra[]> {
  const { data, error } = await supabase
    .from('ingresos_extra')
    .select('id, fecha, categoria, concepto, monto, medio, nota')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })
    .order('creado_en', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as (Omit<IngresoExtra, 'monto'> & { monto: string })[]).map((i) => ({
    ...i,
    monto: Number(i.monto),
  }))
}

export async function agregarIngresoExtra(i: {
  fecha: string
  categoria: CategoriaIngreso
  concepto: string
  monto: number
  medio: MedioPago
  nota: string
}): Promise<void> {
  const { error } = await supabase.from('ingresos_extra').insert({
    fecha: i.fecha,
    categoria: i.categoria,
    concepto: i.concepto.trim(),
    monto: i.monto,
    medio: i.medio,
    nota: i.nota.trim() || null,
  })
  if (error) throw new Error(error.message)
}

export async function borrarIngresoExtra(id: string): Promise<void> {
  const { error } = await supabase.from('ingresos_extra').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- Comprobantes de gastos (factura o ticket adjunto) -----------------------

const MAX_PDF_GASTO = 5 * 1024 * 1024

// Sube la foto o el PDF y lo deja ligado al gasto. Reemplaza el anterior, si había.
export async function adjuntarComprobanteGasto(
  gastoId: string,
  archivo: File,
  rutaAnterior?: string | null,
): Promise<string> {
  const esPdf = archivo.type === 'application/pdf'
  if (!esPdf && !archivo.type.startsWith('image/')) {
    throw new Error('Subí una foto o un PDF del comprobante.')
  }
  if (esPdf && archivo.size > MAX_PDF_GASTO) throw new Error('El PDF pesa más de 5 MB.')

  const { achicar } = await import('./comprobantes')
  const contenido: Blob = esPdf ? archivo : await achicar(archivo)
  const ruta = gastoId + '/' + crypto.randomUUID() + (esPdf ? '.pdf' : '.jpg')

  const { error } = await supabase.storage
    .from('gastos')
    .upload(ruta, contenido, { contentType: esPdf ? 'application/pdf' : 'image/jpeg' })
  if (error) throw new Error(error.message)

  const { error: errorFila } = await supabase.from('gastos').update({ comprobante_ruta: ruta }).eq('id', gastoId)
  if (errorFila) {
    await supabase.storage.from('gastos').remove([ruta])
    throw new Error(errorFila.message)
  }
  if (rutaAnterior) await supabase.storage.from('gastos').remove([rutaAnterior])
  return ruta
}

export async function quitarComprobanteGasto(gastoId: string, ruta: string): Promise<void> {
  const { error } = await supabase.from('gastos').update({ comprobante_ruta: null }).eq('id', gastoId)
  if (error) throw new Error(error.message)
  await supabase.storage.from('gastos').remove([ruta])
}

// Link temporal para abrir el comprobante (el bucket es privado).
export async function urlComprobanteGasto(ruta: string): Promise<string> {
  const { data, error } = await supabase.storage.from('gastos').createSignedUrl(ruta, 120)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

// ---- Metas y topes ----------------------------------------------------------

export type Presupuesto = {
  metaIngresos: number // 0 = sin meta
  topes: Partial<Record<CategoriaGasto, number>>
}

export async function leerPresupuesto(): Promise<Presupuesto> {
  const { data, error } = await supabase.from('presupuesto').select('clave, monto')
  if (error) throw new Error(error.message)
  const p: Presupuesto = { metaIngresos: 0, topes: {} }
  for (const f of (data ?? []) as { clave: string; monto: string | number }[]) {
    const monto = Number(f.monto)
    if (f.clave === 'meta_ingresos') p.metaIngresos = monto
    else if (f.clave.startsWith('tope_')) p.topes[f.clave.slice(5) as CategoriaGasto] = monto
  }
  return p
}

// monto vacío o cero: se quita la meta o el tope.
export async function guardarPresupuesto(clave: string, monto: number | null): Promise<void> {
  if (monto === null || monto <= 0) {
    const { error } = await supabase.from('presupuesto').delete().eq('clave', clave)
    if (error) throw new Error(error.message)
    return
  }
  const { error } = await supabase
    .from('presupuesto')
    .upsert({ clave, monto, actualizado_en: new Date().toISOString() })
  if (error) throw new Error(error.message)
}

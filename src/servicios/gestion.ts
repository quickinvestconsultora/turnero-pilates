import { supabase } from '../lib/supabase'
import type { MedioPago } from './clientes'

// numeric y bigint llegan como texto en algunas respuestas.
const num = (v: unknown): number => Number(v ?? 0)
const numONull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

// ---- Resumen del estudio ----------------------------------------------------

export type Resumen = {
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

export type Balance = { cobrado: number; gastos: number; liquidaciones: number }

export async function obtenerBalance(mes: string): Promise<Balance> {
  const { data, error } = await supabase.rpc('balance_mes', { p_mes: mes })
  if (error) throw new Error(error.message)
  const f = ((data ?? []) as Record<string, unknown>[])[0] ?? {}
  return { cobrado: num(f.cobrado), gastos: num(f.gastos), liquidaciones: num(f.liquidaciones) }
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
}

export async function listarGastos(desde: string, hasta: string): Promise<Gasto[]> {
  const { data, error } = await supabase
    .from('gastos')
    .select('id, fecha, categoria, concepto, monto, nota')
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
}): Promise<void> {
  const { error } = await supabase.from('gastos').insert({
    fecha: g.fecha,
    categoria: g.categoria,
    concepto: g.concepto.trim(),
    monto: g.monto,
    nota: g.nota.trim() || null,
  })
  if (error) throw new Error(error.message)
}

export async function borrarGasto(id: string): Promise<void> {
  const { error } = await supabase.from('gastos').delete().eq('id', id)
  if (error) throw new Error(error.message)
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

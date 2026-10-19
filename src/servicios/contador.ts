import { supabase } from '../lib/supabase'
import { textoCsv } from '../csv'
import { ETIQUETA_CATEGORIA, ETIQUETA_INGRESO, listarGastos, listarIngresosExtra, obtenerBalance } from './gestion'
import { ETIQUETA_CONCEPTO, ETIQUETA_MEDIO } from './clientes'
import type { ConceptoPago, MedioPago } from './clientes'
import { finDeMes } from '../fechas'

const fechaAr = (iso: string) => iso.split('-').reverse().join('/')

// Deja un texto apto para nombre de archivo.
function nombreSeguro(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'comprobante'
  )
}

// Paquete del mes para el contador: un ZIP con el resumen, el detalle de cobros,
// gastos, otros ingresos y pagos a profesoras (todo en CSV para Excel) y una
// carpeta con las facturas y tickets adjuntos a los gastos.
export async function descargarPaqueteContador(mes: string): Promise<{ comprobantes: number; faltantes: number }> {
  const desde = mes
  const hasta = finDeMes(mes)
  const [y, m] = mes.split('-').map(Number)
  const desdeTs = new Date(y, m - 1, 1).toISOString()
  const hastaTs = new Date(y, m, 1).toISOString()

  const [balance, gastos, otros, cobrosRes, pagosProfesRes] = await Promise.all([
    obtenerBalance(mes),
    listarGastos(desde, hasta),
    listarIngresosExtra(desde, hasta),
    supabase
      .from('pagos_clientes')
      .select('creado_en, monto, medio, concepto, perfiles ( nombre, apellido )')
      .gte('creado_en', desdeTs)
      .lt('creado_en', hastaTs)
      .order('creado_en', { ascending: true }),
    supabase
      .from('pagos_profesoras')
      .select('fecha, monto, medio, perfiles ( nombre, apellido )')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true }),
  ])
  if (cobrosRes.error) throw new Error(cobrosRes.error.message)
  if (pagosProfesRes.error) throw new Error(pagosProfesRes.error.message)

  type Persona = { nombre: string; apellido: string } | null
  const nombre = (p: Persona) => (p ? `${p.nombre} ${p.apellido}`.trim() : '')
  const cobros = (cobrosRes.data ?? []) as unknown as {
    creado_en: string
    monto: string | null
    medio: MedioPago
    concepto: ConceptoPago
    perfiles: Persona
  }[]
  const pagosProfes = (pagosProfesRes.data ?? []) as unknown as {
    fecha: string
    monto: string
    medio: MedioPago
    perfiles: Persona
  }[]

  const ingresos = balance.cobrado + balance.otros
  const egresos = balance.gastos + balance.liquidaciones
  const BOM = '﻿'

  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()

  zip.file(
    'resumen.csv',
    BOM +
      textoCsv([
        ['Concepto', 'Monto'],
        ['Cobros a alumnas', balance.cobrado],
        ['Otros ingresos', balance.otros],
        ['Total ingresos', ingresos],
        ['Gastos', balance.gastos],
        ['Pagos a profesoras', balance.liquidaciones],
        ['Total egresos', egresos],
        ['Resultado', ingresos - egresos],
      ]),
  )

  zip.file(
    'cobros-alumnas.csv',
    BOM +
      textoCsv([
        ['Fecha', 'Alumna', 'Concepto', 'Medio', 'Monto'],
        ...cobros.map((c) => [
          new Date(c.creado_en).toLocaleDateString('es-AR'),
          nombre(c.perfiles),
          ETIQUETA_CONCEPTO[c.concepto] ?? c.concepto,
          ETIQUETA_MEDIO[c.medio] ?? c.medio,
          c.monto === null ? '' : Number(c.monto),
        ]),
      ]),
  )

  zip.file(
    'otros-ingresos.csv',
    BOM +
      textoCsv([
        ['Fecha', 'Tipo', 'Concepto', 'Medio', 'Monto'],
        ...otros.map((i) => [
          fechaAr(i.fecha),
          ETIQUETA_INGRESO[i.categoria],
          i.concepto,
          ETIQUETA_MEDIO[i.medio],
          i.monto,
        ]),
      ]),
  )

  zip.file(
    'gastos.csv',
    BOM +
      textoCsv([
        ['Fecha', 'Categoría', 'Concepto', 'Monto', 'Nota', 'Comprobante'],
        ...gastos.map((g) => [
          fechaAr(g.fecha),
          ETIQUETA_CATEGORIA[g.categoria],
          g.concepto,
          g.monto,
          g.nota ?? '',
          g.comprobante_ruta ? 'Sí' : 'No',
        ]),
      ]),
  )

  zip.file(
    'pagos-profesoras.csv',
    BOM +
      textoCsv([
        ['Fecha', 'Profesora', 'Medio', 'Monto'],
        ...pagosProfes.map((p) => [fechaAr(p.fecha), nombre(p.perfiles), ETIQUETA_MEDIO[p.medio] ?? p.medio, Number(p.monto)]),
      ]),
  )

  // Facturas y tickets adjuntos.
  let comprobantes = 0
  let faltantes = 0
  for (const g of gastos) {
    if (!g.comprobante_ruta) continue
    const { data, error } = await supabase.storage.from('gastos').download(g.comprobante_ruta)
    if (error || !data) {
      faltantes++
      continue
    }
    const extension = g.comprobante_ruta.split('.').pop() || 'jpg'
    comprobantes++
    zip.file(`comprobantes/${g.fecha}-${nombreSeguro(g.concepto)}-${comprobantes}.${extension}`, data)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `paquete-contador-${mes.slice(0, 7)}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)

  return { comprobantes, faltantes }
}

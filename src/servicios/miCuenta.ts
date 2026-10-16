import { supabase } from '../lib/supabase'
import type { EstadoAsistencia } from '../tipos'

export type ClaseMia = {
  fecha: string
  hora: string
  instructor: string | null
  asistencia: EstadoAsistencia | null
}

export type PagoMio = {
  numero: number | null
  fecha: string
  monto: number | null
  medio: string
  concepto: string | null
  abono_hasta: string | null
}

export async function miHistorial(): Promise<ClaseMia[]> {
  const { data, error } = await supabase.rpc('mi_historial')
  if (error) throw new Error(error.message)
  return (data ?? []) as ClaseMia[]
}

export async function misPagos(): Promise<PagoMio[]> {
  const { data, error } = await supabase.rpc('mis_pagos')
  if (error) throw new Error(error.message)
  // numeric llega como texto desde la base.
  return ((data ?? []) as (Omit<PagoMio, 'monto'> & { monto: string | null })[]).map((p) => ({
    ...p,
    monto: p.monto === null ? null : Number(p.monto),
  }))
}

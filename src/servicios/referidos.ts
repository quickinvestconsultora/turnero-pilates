import { supabase } from '../lib/supabase'

const CLAVE_CODIGO = 'forteva-codigo-referido'

// ---- Código que llega por el link (?ref=CODIGO) -------------------------------

// Guarda en este navegador el código del link, para usarlo al registrarse aunque
// la persona recorra otras pantallas antes. Devuelve el código guardado, si hay.
export function recordarCodigoDelLink(): string {
  try {
    const param = new URLSearchParams(window.location.search).get('ref')
    if (param) {
      const limpio = param.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
      if (limpio) localStorage.setItem(CLAVE_CODIGO, limpio)
    }
    return localStorage.getItem(CLAVE_CODIGO) ?? ''
  } catch {
    return ''
  }
}

export function olvidarCodigoGuardado(): void {
  try {
    localStorage.removeItem(CLAVE_CODIGO)
  } catch {
    // Sin almacenamiento: no hay nada que borrar.
  }
}

// ---- Interruptor y datos de la alumna ----------------------------------------

export async function referidosActivos(): Promise<boolean> {
  const { data, error } = await supabase.rpc('referidos_activos')
  if (error) return false
  return data === true
}

export async function cambiarReferidos(activos: boolean): Promise<void> {
  const { error } = await supabase.rpc('cambiar_referidos', { p_activos: activos })
  if (error) throw new Error(error.message)
}

export async function miCodigoReferido(): Promise<string | null> {
  const { data, error } = await supabase.rpc('mi_codigo_referido')
  if (error) throw new Error(error.message)
  return (data as string | null) ?? null
}

export type MiReferida = { nombre: string; estado: 'registrada' | 'vino' | 'pago'; creado_en: string }

export async function misReferidos(): Promise<MiReferida[]> {
  const { data, error } = await supabase.rpc('mis_referidos')
  if (error) throw new Error(error.message)
  return (data ?? []) as MiReferida[]
}

export function linkDeReferido(codigo: string): string {
  return `${window.location.origin}/app/?ref=${codigo}`
}

// ---- Staff -------------------------------------------------------------------

export type Referido = {
  referida_id: string
  referida_nombre: string
  referida_telefono: string
  referente_id: string
  referente_nombre: string
  referente_telefono: string
  creada_en: string
  clases: number
  pagos: number
  beneficio_en: string | null
}

export async function listarReferidos(): Promise<Referido[]> {
  const { data, error } = await supabase.rpc('referidos_lista')
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    referida_id: String(r.referida_id),
    referida_nombre: String(r.referida_nombre ?? ''),
    referida_telefono: String(r.referida_telefono ?? ''),
    referente_id: String(r.referente_id),
    referente_nombre: String(r.referente_nombre ?? ''),
    referente_telefono: String(r.referente_telefono ?? ''),
    creada_en: String(r.creada_en),
    clases: Number(r.clases),
    pagos: Number(r.pagos),
    beneficio_en: (r.beneficio_en as string | null) ?? null,
  }))
}

export async function marcarBeneficioReferido(referidaId: string, entregado: boolean): Promise<void> {
  const { error } = await supabase.rpc('marcar_beneficio_referido', {
    p_referida_id: referidaId,
    p_entregado: entregado,
  })
  if (error) throw new Error(error.message)
}

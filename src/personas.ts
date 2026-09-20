// Nombre completo para mostrar. Tolera perfiles viejos sin apellido cargado.
export function nombreCompleto(p: { nombre: string; apellido?: string | null }): string {
  return `${p.nombre} ${p.apellido ?? ''}`.trim() || 'Sin nombre'
}

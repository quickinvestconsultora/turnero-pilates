// Descarga una tabla como CSV pensado para abrir en Excel en español:
// separador ";" y BOM UTF-8 (para que los acentos se vean bien).

type Celda = string | number | null | undefined

function escapar(valor: Celda): string {
  let texto = valor === null || valor === undefined ? '' : String(valor)
  // Evita que Excel interprete como fórmula un texto que empieza con = + - @.
  if (/^[=+\-@]/.test(texto)) texto = `'${texto}`
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

export function descargarCsv(nombreArchivo: string, filas: Celda[][]): void {
  const contenido = filas.map((fila) => fila.map(escapar).join(';')).join('\r\n')
  const blob = new Blob(['﻿', contenido], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombreArchivo
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  URL.revokeObjectURL(url)
}

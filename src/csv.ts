// Descarga una tabla como CSV pensado para abrir en Excel en español:
// separador ";" y BOM UTF-8 (para que los acentos se vean bien).

type Celda = string | number | null | undefined

function escapar(valor: Celda): string {
  let texto = valor === null || valor === undefined ? '' : String(valor)
  // Evita que Excel interprete como fórmula un texto que empieza con = + - @.
  if (typeof valor === 'string' && /^[=+\-@]/.test(texto)) texto = `'${texto}`
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

export function textoCsv(filas: Celda[][]): string {
  return filas.map((fila) => fila.map(escapar).join(';')).join('\r\n')
}

export function descargarCsv(nombreArchivo: string, filas: Celda[][]): void {
  const contenido = textoCsv(filas)
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

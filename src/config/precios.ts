// Valores que se muestran en el modal de pago cuando hay que abonar para
// reservar. Dejá vacío el array si todavía no cargaste nada: no se muestra
// nada inventado ni de relleno.
export const PRECIO_CLASE_SUELTA = '$15.000' // clase de prueba (se descuenta del abono al inscribirse)
export const NOTA_CLASE_SUELTA = 'se descuenta de tu abono al inscribirte'

export const PRECIOS_MENSUALES: { clasesPorSemana: number; precio: string }[] = [
  { clasesPorSemana: 1, precio: '$42.000' },
  { clasesPorSemana: 2, precio: '$52.000' },
  { clasesPorSemana: 3, precio: '$63.000' },
  { clasesPorSemana: 4, precio: '$70.000' },
  { clasesPorSemana: 5, precio: '$75.000' },
]

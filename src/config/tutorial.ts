// Contenido del tutorial que ven las alumnas ("Ayuda" en la app). Si cambia algo de cómo
// funciona la app (reglas, textos, pantallas), se actualiza acá y listo: cada apartado es un
// título y una lista de pasos o ideas.
//
// Reglas que mencionan los textos y que viven en otro lado (si las cambiás, cambiá también acá):
//   - Cancelar hasta 2 horas antes ........ HORAS_LIMITE_CANCELAR (src/servicios/turnos.ts)
//   - 3 cancelaciones por mes .............. clave 'cambios_por_mes' de la tabla configuracion
//   - Formas de pago y precios ............. src/config/pagos.ts y src/config/precios.ts

export type ApartadoTutorial = {
  titulo: string
  pasos: string[]
}

export const TUTORIAL: ApartadoTutorial[] = [
  {
    titulo: 'Reservar un turno',
    pasos: [
      'En "Turnos disponibles" tocá el día para desplegarlo y ver sus horarios.',
      'Elegí el horario y tocá "Reservar".',
      'Para reservar tenés que tener tu abono o clase abonados: si todavía no pagaste, te mostramos cómo hacerlo.',
      'Si el horario está completo, tocá "Anotarme en espera": si se libera un lugar, te anotamos sola y te avisamos.',
      'Tus reservas las ves en la solapa "Mis turnos".',
    ],
  },
  {
    titulo: 'Dejar un turno fijo',
    pasos: [
      'Apenas reservás un turno de un horario que se repite, te preguntamos si querés dejarlo fijo.',
      'Si decís que sí, te anotamos sola todas las semanas en ese día y horario, mientras tu abono lo cubra y haya lugar.',
      'Si un día no podés venir, cancelás solo ese turno y el resto sigue igual.',
      'Para dejar de ser fija: Mis turnos → "Mis horarios fijos" → "Dejar de ser fija".',
      'También podés reservar todos los turnos del mes de un mismo horario con el botón "Reservar los ... de [mes]" (necesitás tener el mes abonado).',
    ],
  },
  {
    titulo: 'Cancelar o cambiar un turno',
    pasos: [
      'Entrá a "Mis turnos" y tocá "Cancelar" en el turno que no podés usar.',
      'Podés cancelar hasta 2 horas antes del turno. Después de ese momento ya no se puede desde la app: escribile al estudio.',
      'Podés cancelar hasta 3 turnos por mes. Cuando llegás al límite, te avisamos y el turno se mantiene.',
      'Salir de una lista de espera no cuenta como cancelación.',
      'Para cambiar de horario, cancelá el turno y reservá otro.',
    ],
  },
  {
    titulo: 'Pagar tu abono o tu clase',
    pasos: [
      'Cuando tengas que pagar, la app te muestra los valores y las formas de pago.',
      'Podés pagar con transferencia al alias que ves en pantalla o con el link de Mercado Pago.',
      'Después de pagar, subí el comprobante desde la misma pantalla o avisale al estudio.',
      'El estudio confirma tu pago y te habilita los turnos. Desde ese momento ves "Tu abono está al día".',
      'Tus pagos y recibos quedan en "Mi cuenta" → "Mis pagos".',
    ],
  },
  {
    titulo: 'Feriados y clases suspendidas',
    pasos: [
      'Los días sin clases (por ejemplo un feriado) aparecen en la lista con una etiqueta roja y no se pueden reservar.',
      'Si tenías un turno ese día, en "Mis turnos" te figura como sin efecto. No cuenta como una cancelación tuya.',
    ],
  },
  {
    titulo: 'Tener la app en el celular y recibir avisos',
    pasos: [
      'En iPhone: abrí la app en Safari, tocá "Compartir" y elegí "Agregar a inicio".',
      'En Android: abrila en Chrome y tocá "Instalar" (o el menú ⋮ → "Agregar a pantalla de inicio").',
      'En "Mi cuenta" podés activar las notificaciones para recibir recordatorios de tus clases.',
      'Cada turno tiene "Agregar al calendario" para que te avise en tu agenda.',
    ],
  },
  {
    titulo: 'Mi cuenta y mis datos',
    pasos: [
      '"Mis datos" (arriba): completá tu ficha, objetivo, lesiones y contacto de emergencia, para que las profesoras te conozcan.',
      '"Mi cuenta": tu progreso, tus clases, tus pagos y las notificaciones.',
    ],
  },
]

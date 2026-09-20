export type Rol = 'alumno' | 'staff'
export type Nivel = 'principiante' | 'intermedio' | 'avanzado'
export type EstadoCuenta = 'prueba' | 'al_dia' | 'pendiente'

export type Perfil = {
  id: string
  nombre: string
  telefono: string | null
  rol: Rol
  nivel: Nivel | null
  lesiones: string | null
  contacto_emergencia_nombre: string | null
  contacto_emergencia_telefono: string | null
  estado_cuenta: EstadoCuenta
  pago_actualizado_en: string | null
  creado_en: string
}

export type EstadoReserva = 'reservada' | 'lista_espera' | 'cancelada'
export type EstadoAsistencia = 'asistio' | 'ausente'

// Fila que devuelve la función listar_turnos (vista del alumno).
export type TurnoDisponible = {
  id: string
  fecha: string // 'YYYY-MM-DD'
  hora: string // 'HH:MM:SS'
  duracion_min: number
  cupo: number
  instructor: string | null
  nota: string | null
  ocupados: number
  mi_estado: EstadoReserva | null
}

export type PlantillaTurno = {
  id: string
  dia_semana: number // 0 = domingo
  hora: string
  duracion_min: number
  cupo: number
  instructor: string | null
  activa: boolean
  creado_en: string
}

// Turno con sus reservas embebidas (vista del staff).
export type TurnoConReservas = {
  id: string
  fecha: string
  hora: string
  duracion_min: number
  cupo: number
  instructor: string | null
  plantilla_id: string | null
  cancelado: boolean
  nota: string | null
  reservas: {
    id: string
    estado: EstadoReserva
    creado_en: string
    asistencia: EstadoAsistencia | null
    perfiles: { nombre: string; telefono: string | null; lesiones: string | null } | null
  }[]
}

// Lo que devuelve la función estadisticas(desde, hasta).
export type Estadisticas = {
  turnos_dictados: number
  cupo_total: number
  reservas_totales: number
  alumnas_activas: number
  asistieron: number
  ausentes: number
  por_horario: {
    dia_semana: number
    hora: string
    turnos: number
    cupo_total: number
    reservas: number
  }[]
  ausencias_por_alumna: { nombre: string; ausencias: number }[]
}

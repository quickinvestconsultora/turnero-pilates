export type Rol = 'alumno' | 'staff'

export type Perfil = {
  id: string
  nombre: string
  telefono: string | null
  rol: Rol
  creado_en: string
}

export type EstadoReserva = 'reservada' | 'lista_espera' | 'cancelada'

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
    perfiles: { nombre: string; telefono: string | null } | null
  }[]
}

import { supabase } from '../lib/supabase'
import type { Nivel, Perfil } from '../tipos'

export async function registrarse(datos: {
  email: string
  password: string
  nombre: string
  telefono: string
}): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email: datos.email.trim(),
    password: datos.password,
    options: {
      // El trigger crear_perfil_para_usuario_nuevo lee estos campos.
      data: { nombre: datos.nombre.trim(), telefono: datos.telefono.trim() },
    },
  })
  if (error) throw new Error(traducirError(error.message))
}

export async function iniciarSesion(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) throw new Error(traducirError(error.message))
}

export async function cerrarSesion(): Promise<void> {
  await supabase.auth.signOut()
}

// Manda el correo de "elegir contraseña nueva". El link vuelve acá mismo
// (/app/), donde App.tsx detecta el token en la URL y muestra CrearPassword.
export async function pedirRecuperacion(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/app/`,
  })
  if (error) throw new Error(traducirError(error.message))
}

export async function cambiarMiPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new Error(traducirError(error.message))
}

export async function obtenerMiPerfil(): Promise<Perfil | null> {
  const { data: sesion } = await supabase.auth.getUser()
  if (!sesion.user) return null

  const { data, error } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', sesion.user.id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as Perfil | null
}

export async function actualizarMiPerfil(cambios: {
  nombre: string
  telefono: string
  nivel: Nivel | null
  lesiones: string
  contactoEmergenciaNombre: string
  contactoEmergenciaTelefono: string
}): Promise<void> {
  const { data: sesion } = await supabase.auth.getUser()
  if (!sesion.user) throw new Error('No hay sesión.')

  const { error } = await supabase
    .from('perfiles')
    .update({
      nombre: cambios.nombre.trim(),
      telefono: cambios.telefono.trim() || null,
      nivel: cambios.nivel,
      lesiones: cambios.lesiones.trim() || null,
      contacto_emergencia_nombre: cambios.contactoEmergenciaNombre.trim() || null,
      contacto_emergencia_telefono: cambios.contactoEmergenciaTelefono.trim() || null,
    })
    .eq('id', sesion.user.id)

  if (error) throw new Error(error.message)
}

function traducirError(mensaje: string): string {
  const m = mensaje.toLowerCase()
  if (m.includes('invalid login credentials')) return 'El correo o la contraseña no son correctos.'
  if (m.includes('user already registered')) return 'Ya existe una cuenta con ese correo.'
  if (m.includes('password should be at least')) return 'La contraseña es demasiado corta (mínimo 6).'
  if (m.includes('unable to validate email') || m.includes('email address') || m.includes('is invalid')) {
    return 'Revisá el correo, no parece válido.'
  }
  if (m.includes('email rate limit') || m.includes('over_email_send_rate_limit')) {
    return (
      'Supabase bloqueó el envío de correos por unos minutos (límite del servidor de mails ' +
      'gratis). Si desactivás "Confirm email" en Authentication → Providers → Email, el ' +
      'registro no manda correo y este error desaparece.'
    )
  }
  if (m.includes('email not confirmed')) {
    return 'Falta confirmar el correo. Revisá tu casilla o desactivá "Confirm email" en Supabase.'
  }
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) {
    return 'El registro está deshabilitado en Supabase (Authentication → Providers → Email).'
  }
  return mensaje
}

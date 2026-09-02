import { supabase } from '../lib/supabase'
import type { Perfil } from '../tipos'

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
}): Promise<void> {
  const { data: sesion } = await supabase.auth.getUser()
  if (!sesion.user) throw new Error('No hay sesión.')

  const { error } = await supabase
    .from('perfiles')
    .update({ nombre: cambios.nombre.trim(), telefono: cambios.telefono.trim() })
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

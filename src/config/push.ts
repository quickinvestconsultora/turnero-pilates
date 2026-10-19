// Clave PÚBLICA de las notificaciones push (VAPID). Es pública: va en el código.
// La clave privada va solo en los secretos de Supabase (VAPID_PRIVATE_KEY).
// Mientras esté vacía, la app no ofrece activar las notificaciones.
export const VAPID_PUBLIC_KEY = ''

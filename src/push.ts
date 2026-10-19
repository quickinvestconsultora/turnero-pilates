import { supabase } from './lib/supabase'
import { VAPID_PUBLIC_KEY } from './config/push'

export type EstadoPush = 'activo' | 'inactivo' | 'bloqueado' | 'no_disponible'

// La clave pública viene en base64 "url-safe"; el navegador la pide como bytes.
function aBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + relleno).replace(/-/g, '+').replace(/_/g, '/')
  const crudo = atob(base64)
  return Uint8Array.from(crudo, (c) => c.charCodeAt(0))
}

function aBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return ''
  let texto = ''
  for (const b of new Uint8Array(buffer)) texto += String.fromCharCode(b)
  return btoa(texto)
}

export function pushSoportado(): boolean {
  return (
    VAPID_PUBLIC_KEY !== '' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export const ES_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent)

export function appInstalada(): boolean {
  const standalone = window.matchMedia('(display-mode: standalone)').matches
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true
  return standalone || iosStandalone
}

async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  // `ready` espera a que haya un service worker activo (se registra en main.tsx).
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolver) => setTimeout(() => resolver(null), 4000)),
  ])
}

async function guardar(sub: PushSubscription): Promise<void> {
  const { error } = await supabase.rpc('guardar_suscripcion_push', {
    p_endpoint: sub.endpoint,
    p_p256dh: aBase64(sub.getKey('p256dh')),
    p_auth: aBase64(sub.getKey('auth')),
    p_agente: navigator.userAgent,
  })
  if (error) throw new Error(error.message)
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!pushSoportado()) return 'no_disponible'
  if (Notification.permission === 'denied') return 'bloqueado'
  const reg = await registro()
  const sub = reg ? await reg.pushManager.getSubscription() : null
  return sub && Notification.permission === 'granted' ? 'activo' : 'inactivo'
}

// Si el celular ya está suscripto, asegura que quede ligado a quien tiene la
// sesión abierta (por si dos personas usan el mismo teléfono).
export async function reasociarPush(): Promise<void> {
  if (!pushSoportado() || Notification.permission !== 'granted') return
  const reg = await registro()
  const sub = reg ? await reg.pushManager.getSubscription() : null
  if (sub) await guardar(sub)
}

export async function activarPush(): Promise<void> {
  if (!pushSoportado()) throw new Error('Este dispositivo no permite notificaciones.')
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('No diste permiso para las notificaciones.')
  const reg = await registro()
  if (!reg) throw new Error('No se pudo preparar las notificaciones. Probá de nuevo en unos segundos.')
  const existente = await reg.pushManager.getSubscription()
  const sub =
    existente ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: aBytes(VAPID_PUBLIC_KEY),
    }))
  await guardar(sub)
}

export async function desactivarPush(): Promise<void> {
  const reg = await registro()
  const sub = reg ? await reg.pushManager.getSubscription() : null
  if (!sub) return
  await supabase.rpc('quitar_suscripcion_push', { p_endpoint: sub.endpoint })
  await sub.unsubscribe()
}

// Notificación local de prueba: sirve para ver cómo se muestran los avisos.
export async function probarNotificacion(): Promise<void> {
  const reg = await registro()
  if (!reg) throw new Error('Las notificaciones no están listas todavía.')
  await reg.showNotification('FORTEVA Studio', {
    body: 'Así te van a llegar los avisos en el celular.',
    icon: '/icon-512.png',
    data: { url: '/app/' },
  })
}

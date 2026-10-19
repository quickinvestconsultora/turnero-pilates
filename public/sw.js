// Service worker: no guarda nada en caché (la app siempre trae lo último de la
// red). Sirve para que Android ofrezca instalar la app y para mostrar las
// notificaciones push que manda el estudio.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})

self.addEventListener('push', (event) => {
  let datos = {}
  try {
    datos = event.data ? event.data.json() : {}
  } catch {
    datos = { titulo: 'FORTEVA Studio', cuerpo: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(datos.titulo || 'FORTEVA Studio', {
      body: datos.cuerpo || '',
      icon: '/icon-512.png',
      badge: '/favicon.png',
      data: { url: datos.url || '/app/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/app/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const ventana of ventanas) {
        if ('focus' in ventana) return ventana.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})

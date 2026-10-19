// Service worker mínimo: no guarda nada en caché (la app siempre trae lo último
// de la red). Existe para que Chrome en Android ofrezca instalar la app.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})

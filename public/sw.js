self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', () => {
  // Intentionally no-op: this worker only exists to clear stale caches safely.
})

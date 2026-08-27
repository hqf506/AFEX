'use strict'

const AFEX_SHELL_CACHE_PREFIX = 'afex-pos-shell-'
const AFEX_SHELL_CACHE = 'afex-pos-shell-v1'
const AFEX_COMPATIBLE_SHELL_CACHES = new Set([
  AFEX_SHELL_CACHE,
  'afex-pos-shell-v0',
])
const AFEX_OFFLINE_SHELL = '/pos/offline-shell.html'
let afexShellEnabled = true

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(AFEX_SHELL_CACHE).then((cache) =>
      cache.add(new Request(AFEX_OFFLINE_SHELL, { cache: 'reload' }))
    )
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'AFEX_ACTIVATE_SHELL_V1') {
    self.skipWaiting()
    return
  }
  if (event.data?.type === 'AFEX_DISABLE_SHELL_V1') {
    afexShellEnabled = false
    event.waitUntil(
      (async () => {
        const cacheNames = await caches.keys()
        await Promise.all(
          cacheNames
            .filter((cacheName) =>
              cacheName.startsWith(AFEX_SHELL_CACHE_PREFIX)
            )
            .map((cacheName) => caches.delete(cacheName))
        )
        await self.registration.unregister()
        event.ports[0]?.postMessage({ type: 'AFEX_SHELL_DISABLED_V1' })
      })()
    )
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys()
      await Promise.all(
        cacheNames
          .filter(
            (cacheName) =>
              cacheName.startsWith(AFEX_SHELL_CACHE_PREFIX) &&
              !AFEX_COMPATIBLE_SHELL_CACHES.has(cacheName)
          )
          .map((cacheName) => caches.delete(cacheName))
      )
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  if (!afexShellEnabled) return
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return
  }

  if (request.mode === 'navigate' && url.pathname.startsWith('/pos')) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(AFEX_SHELL_CACHE)
        return (
          (await cache.match(AFEX_OFFLINE_SHELL)) ||
          Response.error()
        )
      })
    )
    return
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(AFEX_SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok && response.type === 'basic') {
          await cache.put(request, response.clone())
        }
        return response
      })
    )
  }
})

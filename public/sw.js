'use strict'

const AFEX_SHELL_CACHE_PREFIX = 'afex-pos-shell-'
const AFEX_SHELL_CACHE = 'afex-pos-shell-v3'
const AFEX_COMPATIBLE_SHELL_CACHES = new Set([
  AFEX_SHELL_CACHE,
])
const AFEX_OFFLINE_SHELL = '/pos/offline-shell.html'
const AFEX_STATIC_SHELL_ASSETS = Object.freeze([
  AFEX_OFFLINE_SHELL,
  '/brand/afex-logo.png',
])
let afexShellEnabled = true

const AFEX_ALLOWED_POS_SHELL_ROUTES = new Set([
  '/pos',
  '/pos/employee-pin',
  '/pos/sale/customer',
  '/pos/sale/items',
  '/pos/sale/checkout',
  '/pos/settings',
  '/pos/order-status',
  '/pos/order-history',
  '/pos/invoices',
])
const AFEX_SENSITIVE_SHELL_MARKERS =
  /(?:access_token|refresh_token|pinVerifier|wrappedDek|wrappedKey|customerPhone|[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?966|0)5\d{8})/iu

async function installPosRouteShells(routes) {
  const normalizedRoutes = Array.isArray(routes)
    ? [...new Set(routes.filter((route) => AFEX_ALLOWED_POS_SHELL_ROUTES.has(route)))]
    : []
  if (normalizedRoutes.length !== AFEX_ALLOWED_POS_SHELL_ROUTES.size) {
    throw new Error('AFEX_POS_SHELL_ROUTE_SET_INVALID')
  }

  const cache = await caches.open(AFEX_SHELL_CACHE)
  const staticAssetUrls = new Set()
  const routeResponses = []
  for (const route of normalizedRoutes) {
    const response = await fetch(
      new Request(route, {
        method: 'GET',
        credentials: 'include',
        cache: 'reload',
      })
    )
    const contentType = response.headers.get('content-type') || ''
    if (!response.ok || !contentType.includes('text/html')) {
      throw new Error('AFEX_POS_SHELL_ROUTE_UNAVAILABLE')
    }
    const body = await response.text()
    if (AFEX_SENSITIVE_SHELL_MARKERS.test(body)) {
      throw new Error('AFEX_POS_SHELL_CONTAINS_SENSITIVE_DATA')
    }
    for (const match of body.matchAll(/(?:src|href)=["']([^"']+)["']/giu)) {
      const assetUrl = new URL(match[1], self.location.origin)
      if (
        assetUrl.origin === self.location.origin &&
        assetUrl.pathname.startsWith('/_next/static/')
      ) {
        staticAssetUrls.add(assetUrl.href)
      }
    }
    routeResponses.push([
      new Request(new URL(route, self.location.origin)),
      new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-AFEX-Offline-Shell': 'static-application-shell-v2',
        },
      }),
    ])
  }

  const assetResponses = await Promise.all(
    [...staticAssetUrls].map(async (assetUrl) => {
      const request = new Request(assetUrl, { cache: 'reload' })
      const response = await fetch(request)
      if (!response.ok || response.type !== 'basic') {
        throw new Error('AFEX_POS_SHELL_ASSET_UNAVAILABLE')
      }
      return [request, response]
    })
  )
  await Promise.all([
    ...routeResponses.map(([request, response]) => cache.put(request, response)),
    ...assetResponses.map(([request, response]) => cache.put(request, response)),
  ])
  return {
    routeCount: routeResponses.length,
    assetCount: assetResponses.length,
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(AFEX_SHELL_CACHE).then((cache) =>
      cache.addAll(
        AFEX_STATIC_SHELL_ASSETS.map(
          (path) => new Request(path, { cache: 'reload' })
        )
      )
    )
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'AFEX_OFFLINE_COORDINATION_V1') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(
        (clients) =>
          Promise.all(
            clients.map((client) =>
              client.postMessage({
                type: 'AFEX_OFFLINE_COORDINATION_V1',
                payload: event.data.payload,
              })
            )
          )
      )
    )
    return
  }
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
    return
  }
  if (event.data?.type === 'AFEX_INSTALL_POS_SHELL_V2') {
    event.waitUntil(
      installPosRouteShells(event.data.routes)
        .then(({ routeCount, assetCount }) => {
          event.ports[0]?.postMessage({
            type: 'AFEX_POS_SHELL_INSTALLED_V2',
            routeCount,
            assetCount,
          })
        })
        .catch(() => {
          event.ports[0]?.postMessage({
            type: 'AFEX_POS_SHELL_INSTALL_FAILED_V2',
          })
        })
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

  const isPosNavigation =
    request.mode === 'navigate' &&
    (url.pathname === '/pos' || url.pathname.startsWith('/pos/')) &&
    !url.pathname.startsWith('/pos/login')
  if (isPosNavigation) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(AFEX_SHELL_CACHE)
        return (
          (await cache.match(new Request(new URL(url.pathname, url.origin)))) ||
          (await cache.match(AFEX_OFFLINE_SHELL)) ||
          Response.error()
        )
      })
    )
    return
  }

  if (
    url.pathname.startsWith('/_next/static/') ||
    AFEX_STATIC_SHELL_ASSETS.includes(url.pathname)
  ) {
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

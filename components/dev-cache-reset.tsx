'use client'

import { useEffect } from 'react'

const AFEX_CACHE_PREFIX = 'afex-pos-'

export function DevCacheReset() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') {
      return
    }

    let cancelled = false

    void (async () => {
      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations()
          await Promise.all(
            registrations
              .filter((registration) => {
                const worker =
                  registration.active ||
                  registration.waiting ||
                  registration.installing
                return worker ? new URL(worker.scriptURL).pathname === '/sw.js' : false
              })
              .map((registration) => registration.unregister())
          )
        }

        if ('caches' in window) {
          const cacheKeys = await caches.keys()
          await Promise.all(
            cacheKeys
              .filter((cacheKey) => cacheKey.startsWith(AFEX_CACHE_PREFIX))
              .map((cacheKey) => caches.delete(cacheKey))
          )
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('[DEV CACHE] failed to clear browser cache state', error)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return null
}

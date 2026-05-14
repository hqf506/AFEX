'use client'

import { useEffect } from 'react'

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
          await Promise.all(registrations.map((registration) => registration.unregister()))
        }

        if ('caches' in window) {
          const cacheKeys = await caches.keys()
          await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)))
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

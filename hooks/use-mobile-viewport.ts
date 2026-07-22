'use client'

import { useSyncExternalStore } from 'react'

const MOBILE_VIEWPORT_QUERY = '(max-width: 639px)'

function subscribeToMobileViewport(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(MOBILE_VIEWPORT_QUERY)
  mediaQuery.addEventListener('change', onStoreChange)

  return () => mediaQuery.removeEventListener('change', onStoreChange)
}

function getMobileViewportSnapshot() {
  return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
}

function getServerMobileViewportSnapshot() {
  return false
}

export function useMobileViewport() {
  return useSyncExternalStore(
    subscribeToMobileViewport,
    getMobileViewportSnapshot,
    getServerMobileViewportSnapshot
  )
}

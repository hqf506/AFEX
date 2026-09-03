'use client'

import { useSyncExternalStore } from 'react'

const MOBILE_VIEWPORT_QUERY = '(max-width: 639px), (max-height: 500px) and (pointer: coarse)'

function subscribeToMobileViewport(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(MOBILE_VIEWPORT_QUERY)
  mediaQuery.addEventListener('change', onStoreChange)

  return () => mediaQuery.removeEventListener('change', onStoreChange)
}

function getMobileViewportSnapshot() {
  return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
}

function getDesktopServerSnapshot() {
  return false
}

function getMobileServerSnapshot() {
  return true
}

export function useMobileViewport(serverMobileFirst = false) {
  return useSyncExternalStore(
    subscribeToMobileViewport,
    getMobileViewportSnapshot,
    serverMobileFirst ? getMobileServerSnapshot : getDesktopServerSnapshot
  )
}

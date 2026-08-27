'use client'

import { useEffect } from 'react'
import { initializeOfflinePhase1Runtime } from '@/lib/offline/phase1'
import {
  OFFLINE_PHASE2_CAPABILITIES,
  neutralizeAfexOfflineShell,
} from '@/lib/offline/phase2'

const ACTIVATE_MESSAGE = Object.freeze({ type: 'AFEX_ACTIVATE_SHELL_V1' })

function activateWaitingWorker(registration: ServiceWorkerRegistration) {
  registration.waiting?.postMessage(ACTIVATE_MESSAGE)
}

export function PosOfflineShellRegistration() {
  useEffect(() => {
    let cancelled = false
    let registration: ServiceWorkerRegistration | null = null
    let cleanupRetry: number | null = null

    if (!OFFLINE_PHASE2_CAPABILITIES.offlineShell) {
      const cleanup = async () => {
        const result = await neutralizeAfexOfflineShell()
        if (!cancelled && result.status === 'incomplete') {
          cleanupRetry = window.setTimeout(cleanup, 5_000)
        }
      }
      void cleanup().catch(() => {
        if (!cancelled) cleanupRetry = window.setTimeout(cleanup, 5_000)
      })
      return () => {
        cancelled = true
        if (cleanupRetry !== null) window.clearTimeout(cleanupRetry)
      }
    }

    if (!('serviceWorker' in navigator)) return

    void (async () => {
      const initialization = await initializeOfflinePhase1Runtime()
      if (
        cancelled ||
        initialization.status === 'offline_store_unavailable_locked'
      ) {
        return
      }

      registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/pos/',
        updateViaCache: 'none',
      })
      if (cancelled) return
      activateWaitingWorker(registration)
      registration.addEventListener('updatefound', () => {
        const installing = registration?.installing
        installing?.addEventListener('statechange', () => {
          if (!cancelled && installing.state === 'installed' && registration) {
            activateWaitingWorker(registration)
          }
        })
      })
    })().catch(() => {
      // The online POS remains available when the optional shell cannot register.
    })

    return () => {
      cancelled = true
      if (cleanupRetry !== null) window.clearTimeout(cleanupRetry)
      registration = null
    }
  }, [])

  return null
}

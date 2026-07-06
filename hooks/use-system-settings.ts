'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  createProtectedResourceAuthError,
  isClientResourceFresh,
  isProtectedResourceAuthError,
  loadClientResource,
  markProtectedResourcesUnauthorized,
  peekClientResource,
} from '@/lib/client-resource-cache'

export type SystemSettings = {
  id: string
  store_name: string
  branch_name: string
  logo_url: string | null
  whatsapp_provider: string
  whatsapp_phone: string | null
  ultramsg_instance_id: string | null
  ultramsg_token: string | null
  ultramsg_api_url: string | null
  whatsapp_order_ready_message_template: string | null
  whatsapp_order_delivered_message_template: string | null
  enable_whatsapp: boolean
  enable_printing: boolean
  enable_pos: boolean
  enable_invoices: boolean
  enable_orders: boolean
  enable_reports: boolean
  enable_users: boolean
  created_at: string
  updated_at: string
}

type SystemSettingsHookResult = {
  settings: SystemSettings | null
  loading: boolean
  error: string
  refresh: () => Promise<void>
}

const SYSTEM_SETTINGS_CACHE_KEY = 'admin-system-settings'
const SYSTEM_SETTINGS_CACHE_TTL_MS = 60_000

export function useSystemSettings(enabled = true): SystemSettingsHookResult {
  const pathname = usePathname()
  const isPosLoginPage = pathname?.startsWith('/pos/login') ?? false
  const shouldFetch = enabled && !isPosLoginPage
  const [settings, setSettings] = useState<SystemSettings | null>(() =>
    shouldFetch ? peekClientResource<SystemSettings>(SYSTEM_SETTINGS_CACHE_KEY) : null
  )
  const [loading, setLoading] = useState(
    shouldFetch && !peekClientResource<SystemSettings>(SYSTEM_SETTINGS_CACHE_KEY)
  )
  const [error, setError] = useState('')

  const refresh = useCallback(async (force = false) => {
    if (!shouldFetch) {
      setLoading(false)
      return
    }

    const cachedSettings = peekClientResource<SystemSettings>(
      SYSTEM_SETTINGS_CACHE_KEY
    )

    if (cachedSettings) {
      setSettings(cachedSettings)
      setLoading(false)
    } else {
      setLoading(true)
    }

    setError('')

    try {
      const nextSettings = await loadClientResource(
        SYSTEM_SETTINGS_CACHE_KEY,
        async () => {
          const response = await fetch('/api/admin/system-settings', {
            method: 'GET',
            credentials: 'include',
          })

          if (response.status === 401) {
            markProtectedResourcesUnauthorized()
            throw createProtectedResourceAuthError()
          }

          const result = await response.json().catch(() => null)

          if (!response.ok || !result?.success) {
            throw new Error(result?.error || 'فشل تحميل إعدادات النظام')
          }

          return (result.settings || null) as SystemSettings | null
        },
        {
          ttlMs: SYSTEM_SETTINGS_CACHE_TTL_MS,
          force,
          logLabel: 'fetch system settings',
          protectedResource: true,
        }
      )

      setSettings(nextSettings)
      setLoading(false)
    } catch (fetchError) {
      if (isProtectedResourceAuthError(fetchError)) {
        if (typeof window !== 'undefined' && window.location.pathname.startsWith('/pos')) {
          window.location.href = '/pos/login'
          return
        }
      }

      setSettings(cachedSettings || null)
      setError(
        fetchError instanceof Error ? fetchError.message : 'فشل تحميل إعدادات النظام'
      )
      setLoading(false)
    }
  }, [shouldFetch])

  useEffect(() => {
    if (!shouldFetch) {
      const timeoutId = window.setTimeout(() => {
        setSettings(null)
        setError('')
        setLoading(false)
      }, 0)

      return () => window.clearTimeout(timeoutId)
    }

    if (
      settings &&
      isClientResourceFresh(
        SYSTEM_SETTINGS_CACHE_KEY,
        SYSTEM_SETTINGS_CACHE_TTL_MS
      )
    ) {
      const timeoutId = window.setTimeout(() => {
        setLoading(false)
      }, 0)

      return () => window.clearTimeout(timeoutId)
    }

    const timeoutId = window.setTimeout(() => {
      void refresh()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [refresh, settings, shouldFetch])

  return {
    settings,
    loading,
    error,
    refresh: () => refresh(true),
  }
}

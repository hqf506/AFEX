'use client'

import { useCallback, useEffect, useState } from 'react'

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

export function useSystemSettings(enabled = true): SystemSettingsHookResult {
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/admin/system-settings', {
        method: 'GET',
        credentials: 'include',
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        setSettings(null)
        setError(result?.error || 'فشل تحميل إعدادات النظام')
        setLoading(false)
        return
      }

      setSettings((result.settings || null) as SystemSettings | null)
      setLoading(false)
    } catch (fetchError) {
      setSettings(null)
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : 'فشل تحميل إعدادات النظام'
      )
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refresh()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [refresh])

  return {
    settings,
    loading,
    error,
    refresh,
  }
}

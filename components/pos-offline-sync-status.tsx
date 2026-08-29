'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  APP_COMPAT_CLIENT_FLAGS,
  deriveLocalSyncPresentation,
  type LocalSyncCounters,
} from '@/lib/offline/application-compatibility'
import { getActiveOfflineNamespace } from '@/lib/offline/phase1'
import { Phase3CommandRepository } from '@/lib/offline/phase3'
import { readOfflineReadinessStatus } from '@/lib/offline/complete-runtime'

const phase3StatusRepository = new Phase3CommandRepository()

type SyncPresentation = ReturnType<typeof deriveLocalSyncPresentation>

const initialPresentation = deriveLocalSyncPresentation(
  'unknown',
  null,
  null
)

function stateLabel(state: SyncPresentation['state']) {
  if (state === 'online') return 'متصل'
  if (state === 'offline') return 'غير متصل'
  if (state === 'syncing') return 'جارٍ التزامن'
  if (state === 'attention') return 'يتطلب الانتباه'
  return 'حالة الاتصال غير معروفة'
}

export function PosOfflineSyncStatus() {
  const [presentation, setPresentation] =
    useState<SyncPresentation>(initialPresentation)
  const [snapshot, setSnapshot] = useState<{
    confirmedAt: string
    stale: boolean
  } | null>(null)

  const revalidate = useCallback(async () => {
    const connectionState =
      typeof navigator === 'undefined'
        ? 'unknown'
        : navigator.onLine
          ? 'online'
          : 'offline'
    const namespace = getActiveOfflineNamespace()
    if (!namespace) {
      setPresentation(deriveLocalSyncPresentation(connectionState, null, null))
      setSnapshot(null)
      return
    }

    try {
      const [result, readiness] = await Promise.all([
        phase3StatusRepository.getSafeShadowStatus(namespace.namespaceId),
        readOfflineReadinessStatus(),
      ])
      const counters: LocalSyncCounters | null =
        'pending' in result
          ? {
              pending: result.pending,
              syncing: result.syncing,
              failed: result.failed,
              conflict: result.conflict,
              blocked: result.blocked,
            }
          : null

      setPresentation(
        deriveLocalSyncPresentation(result.connectionState, counters, null)
      )
      setSnapshot({
        confirmedAt: readiness.confirmedAt,
        stale: readiness.stale,
      })
    } catch {
      setPresentation(deriveLocalSyncPresentation(connectionState, null, null))
      setSnapshot(null)
    }
  }, [])

  useEffect(() => {
    if (!APP_COMPAT_CLIENT_FLAGS.syncStatusUi) return

    const handleConnectivityChange = () => void revalidate()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void revalidate()
    }

    const timeoutId = window.setTimeout(() => void revalidate(), 0)
    window.addEventListener('online', handleConnectivityChange)
    window.addEventListener('offline', handleConnectivityChange)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener('online', handleConnectivityChange)
      window.removeEventListener('offline', handleConnectivityChange)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [revalidate])

  if (!APP_COMPAT_CLIENT_FLAGS.syncStatusUi) return null

  return (
    <aside
      dir="rtl"
      aria-live="polite"
      aria-label="حالة الاتصال والمزامنة"
      className="pointer-events-none absolute bottom-3 left-3 z-40 max-w-[min(22rem,calc(100%-1.5rem))] rounded-xl border border-[var(--afex-border,#d8c9b5)] bg-[var(--afex-surface,#fffaf2)] px-3 py-2 text-xs text-[var(--afex-text,#2d251e)] shadow-lg"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <strong>{stateLabel(presentation.state)}</strong>
        <span>المعلّق: {presentation.pendingCount ?? 'غير متاح'}</span>
        <span>التنبيهات: {presentation.attentionCount ?? 'غير متاح'}</span>
        <span>
          {snapshot
            ? `آخر لقطة مكتملة: ${new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
                dateStyle: 'short',
                timeStyle: 'short',
                timeZone: 'Asia/Riyadh',
              }).format(new Date(snapshot.confirmedAt))}${snapshot.stale ? ' — قديمة' : ''}`
            : 'اللقطة المحلية غير مكتملة'}
        </span>
      </div>
    </aside>
  )
}

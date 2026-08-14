import type { InvoiceLineItem } from '@/lib/invoices/items'
import type { PosPaymentMethod } from '@/lib/invoices/payment-method'
import type { ActivePosEmployee } from '@/lib/pos-employee-session'

export const POS_OFFLINE_DRAFTS_STORAGE_KEY = 'leather_fix_pos_offline_drafts'
export const POS_OFFLINE_DRAFTS_UPDATED_EVENT =
  'leather_fix_pos_offline_drafts_updated'
export const POS_OFFLINE_DRAFTS_SYNC_EVENT =
  'leather_fix_pos_offline_drafts_sync'

const MAX_AUTO_SYNC_ATTEMPTS = 5
let isSyncingPosOfflineDrafts = false

export type PosOfflineInvoiceDraft = {
  localDraftId: string
  clientIdempotencyKey: string
  createdAt: string
  attempts: number
  lastAttemptAt: string | null
  customerId: string | null
  customerName: string
  customerPhone: string
  paymentMethod: PosPaymentMethod
  note: string
  items: InvoiceLineItem[]
  totalsSnapshot: {
    subtotal: number
    discountAmount: number
    taxAmount: number
    finalTotal: number
    cashReceived: string
    numericCashReceived: number
    remainingFromCustomer: number
    cashChange: number
  }
  employee: ActivePosEmployee | null
}

type SavePosOfflineInvoiceDraftInput = Omit<
  PosOfflineInvoiceDraft,
  'attempts' | 'createdAt' | 'lastAttemptAt' | 'localDraftId'
>

type CreateOrderResponse = {
  success?: boolean
  data?: {
    invoice_id?: string
    invoiceId?: string
  }
  error?: string
  message?: string
}

export type PosOfflineDraftSyncState = {
  draftsCount: number
  isSyncing: boolean
}

function createLocalDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `pos-draft-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createPosClientIdempotencyKey() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `pos_${crypto.randomUUID()}`
  }

  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    return `pos_${Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('')}`
  }

  throw new Error('Secure idempotency key generation is unavailable')
}

function isPosOfflineInvoiceDraft(value: unknown): value is PosOfflineInvoiceDraft {
  if (!value || typeof value !== 'object') {
    return false
  }

  const draft = value as Partial<PosOfflineInvoiceDraft>

  return (
    typeof draft.localDraftId === 'string' &&
    typeof draft.createdAt === 'string' &&
    (draft.customerId === null ||
      draft.customerId === undefined ||
      typeof draft.customerId === 'string') &&
    typeof draft.customerName === 'string' &&
    typeof draft.customerPhone === 'string' &&
    Array.isArray(draft.items)
  )
}

function normalizeOfflineDraft(
  draft: PosOfflineInvoiceDraft
): PosOfflineInvoiceDraft {
  return {
    ...draft,
    customerId:
      typeof draft.customerId === 'string' && draft.customerId.trim()
        ? draft.customerId.trim()
        : null,
    clientIdempotencyKey:
      typeof draft.clientIdempotencyKey === 'string' &&
      draft.clientIdempotencyKey.trim()
        ? draft.clientIdempotencyKey.trim()
        : createPosClientIdempotencyKey(),
    attempts: Number.isFinite(Number(draft.attempts))
      ? Number(draft.attempts)
      : 0,
    lastAttemptAt:
      typeof draft.lastAttemptAt === 'string' ? draft.lastAttemptAt : null,
  }
}

function writePosOfflineInvoiceDrafts(drafts: PosOfflineInvoiceDraft[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    POS_OFFLINE_DRAFTS_STORAGE_KEY,
    JSON.stringify(drafts)
  )
  emitPosOfflineDraftsUpdated(drafts.length)
}

function emitPosOfflineDraftsUpdated(draftsCount = readPosOfflineInvoiceDrafts().length) {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(
    new CustomEvent<PosOfflineDraftSyncState>(
      POS_OFFLINE_DRAFTS_UPDATED_EVENT,
      {
        detail: {
          draftsCount,
          isSyncing: isSyncingPosOfflineDrafts,
        },
      }
    )
  )
}

function emitPosOfflineDraftSyncState() {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(
    new CustomEvent<PosOfflineDraftSyncState>(POS_OFFLINE_DRAFTS_SYNC_EVENT, {
      detail: {
        draftsCount: readPosOfflineInvoiceDrafts().length,
        isSyncing: isSyncingPosOfflineDrafts,
      },
    })
  )
}

export function readPosOfflineInvoiceDrafts() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(POS_OFFLINE_DRAFTS_STORAGE_KEY) || '[]'
    )

    return Array.isArray(parsed)
      ? parsed.filter(isPosOfflineInvoiceDraft).map(normalizeOfflineDraft)
      : []
  } catch {
    return []
  }
}

export function savePosOfflineInvoiceDraft(
  input: SavePosOfflineInvoiceDraftInput
) {
  if (typeof window === 'undefined') {
    throw new Error('Offline drafts can only be saved in the browser')
  }

  const draft: PosOfflineInvoiceDraft = {
    ...input,
    attempts: 0,
    localDraftId: createLocalDraftId(),
    lastAttemptAt: null,
    createdAt: new Date().toISOString(),
  }

  writePosOfflineInvoiceDrafts([...readPosOfflineInvoiceDrafts(), draft])

  return draft
}

export function deletePosOfflineInvoiceDraft(localDraftId: string) {
  if (typeof window === 'undefined') {
    return []
  }

  const nextDrafts = readPosOfflineInvoiceDrafts().filter(
    (draft) => draft.localDraftId !== localDraftId
  )

  writePosOfflineInvoiceDrafts(nextDrafts)

  return nextDrafts
}

function updatePosOfflineInvoiceDraft(
  localDraftId: string,
  patch: Partial<Pick<PosOfflineInvoiceDraft, 'attempts' | 'lastAttemptAt'>>
) {
  const nextDrafts = readPosOfflineInvoiceDrafts().map((draft) =>
    draft.localDraftId === localDraftId ? { ...draft, ...patch } : draft
  )

  writePosOfflineInvoiceDrafts(nextDrafts)

  return nextDrafts.find((draft) => draft.localDraftId === localDraftId) || null
}

async function sendOfflineDraft(draft: PosOfflineInvoiceDraft) {
  const validItems = draft.items.filter(
    (item) =>
      typeof item.item_id === 'string' && item.item_id.trim().length > 0
  )

  if (validItems.length === 0) {
    throw new Error('لا توجد عناصر صالحة لإرسال هذه المسودة')
  }

  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customerName: draft.customerName,
      customerPhone: draft.customerPhone,
      customerId: draft.customerId,
      clientIdempotencyKey: draft.clientIdempotencyKey,
      employee_id: draft.employee?.id ?? null,
      paymentMethod: draft.paymentMethod,
      cashReceived: draft.totalsSnapshot.numericCashReceived,
      remainingFromCustomer: draft.totalsSnapshot.remainingFromCustomer,
      cashChange: draft.totalsSnapshot.cashChange,
      discountAmount: draft.totalsSnapshot.discountAmount,
      taxAmount: draft.totalsSnapshot.taxAmount,
      note: draft.note,
      items: validItems,
    }),
  })

  const result = (await response.json().catch(() => null)) as
    | CreateOrderResponse
    | null

  if (!response.ok || !result?.success || !result.data) {
    throw new Error(result?.error || result?.message || 'تعذر إرسال المسودة')
  }

  const invoiceId = result.data.invoice_id || result.data.invoiceId || ''

  if (!invoiceId) {
    return
  }

  await fetch('/api/invoices/cost-snapshot', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      invoice_id: invoiceId,
      items: validItems,
    }),
  }).catch((error) => {
    console.warn('[POS OFFLINE] Cost snapshot update failed.', error)
  })
}

export async function syncNextPosOfflineDraft() {
  if (typeof window === 'undefined') {
    return { synced: false, reason: 'server' as const }
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synced: false, reason: 'offline' as const }
  }

  const drafts = readPosOfflineInvoiceDrafts()
  const draft = drafts[0]

  if (!draft) {
    return { synced: false, reason: 'empty' as const }
  }

  if (draft.attempts >= MAX_AUTO_SYNC_ATTEMPTS) {
    return { synced: false, reason: 'max-attempts' as const }
  }

  const nextAttempt = draft.attempts + 1
  const attemptedDraft =
    updatePosOfflineInvoiceDraft(draft.localDraftId, {
      attempts: nextAttempt,
      lastAttemptAt: new Date().toISOString(),
    }) || {
      ...draft,
      attempts: nextAttempt,
      lastAttemptAt: new Date().toISOString(),
    }

  await sendOfflineDraft(attemptedDraft)
  deletePosOfflineInvoiceDraft(attemptedDraft.localDraftId)

  return { synced: true, reason: 'synced' as const }
}

export async function syncPosOfflineDrafts() {
  if (typeof window === 'undefined') {
    return
  }

  if (isSyncingPosOfflineDrafts) {
    return
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return
  }

  isSyncingPosOfflineDrafts = true
  emitPosOfflineDraftSyncState()

  try {
    while (true) {
      const result = await syncNextPosOfflineDraft()

      if (!result.synced) {
        break
      }

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        break
      }
    }
  } catch (error) {
    console.warn('[POS OFFLINE] Auto sync stopped after a draft failed.', error)
  } finally {
    isSyncingPosOfflineDrafts = false
    emitPosOfflineDraftSyncState()
    emitPosOfflineDraftsUpdated()
  }
}

export function getPosOfflineDraftSyncState(): PosOfflineDraftSyncState {
  return {
    draftsCount: readPosOfflineInvoiceDrafts().length,
    isSyncing: isSyncingPosOfflineDrafts,
  }
}

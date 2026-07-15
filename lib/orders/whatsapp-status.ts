export type WhatsAppDeliveryStatus = 'sent' | 'failed' | 'not_sent' | 'pending'

type WhatsAppAuditLog = {
  action?: unknown
  created_at?: unknown
  metadata?: unknown
}

const SUCCESS_STATUSES = new Set(['sent', 'delivered', 'success'])
const FAILURE_STATUSES = new Set(['failed', 'error'])

function getMetadata(log: WhatsAppAuditLog) {
  return log.metadata && typeof log.metadata === 'object'
    ? (log.metadata as Record<string, unknown>)
    : null
}

function normalizeAuditStatus(
  log: WhatsAppAuditLog,
  metadata: Record<string, unknown>
): WhatsAppDeliveryStatus | null {
  if (log.action === 'whatsapp.message_sent') return 'sent'
  if (log.action === 'whatsapp.message_failed') return 'failed'

  const storedStatus = [
    metadata.provider_status,
    metadata.providerStatus,
    metadata.status,
  ].find((value): value is string => typeof value === 'string')
  const normalizedStatus = storedStatus?.trim().toLowerCase() || ''

  if (SUCCESS_STATUSES.has(normalizedStatus)) return 'sent'
  if (FAILURE_STATUSES.has(normalizedStatus)) return 'failed'
  return null
}

export function buildWhatsAppStatusByOrderId(
  logs: WhatsAppAuditLog[],
  orderIds: Iterable<string>
) {
  const expectedOrderIds = new Set(orderIds)
  const statuses: Record<string, WhatsAppDeliveryStatus> = {}
  const sortedLogs = [...logs].sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || ''))
  )

  for (const log of sortedLogs) {
    const metadata = getMetadata(log)
    if (!metadata) continue

    const orderId =
      typeof metadata.order_id === 'string' ? metadata.order_id : ''

    if (!orderId || !expectedOrderIds.has(orderId) || statuses[orderId]) {
      continue
    }

    const status = normalizeAuditStatus(log, metadata)
    if (status) statuses[orderId] = status
  }

  return statuses
}

export function mergePersistentWhatsAppStatuses(
  current: Record<string, WhatsAppDeliveryStatus>,
  persistent: Record<string, WhatsAppDeliveryStatus>
) {
  return {
    ...current,
    ...persistent,
  }
}

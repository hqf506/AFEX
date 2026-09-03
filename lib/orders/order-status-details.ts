import type { OrderStatus } from './normalize'

export type OrderStatusHistorySourceRow = {
  id?: unknown
  action?: unknown
  actor_user_id?: unknown
  created_at?: unknown
  metadata?: unknown
}

export type OrderStatusHistoryEntry = {
  id: string
  status: Exclude<OrderStatus, 'unknown'>
  createdAt: string
  employeeName?: string
  isCurrent: boolean
}

const STATUS_HISTORY_ACTION = 'order.status_updated'
const ALLOWED_HISTORY_STATUSES = new Set<Exclude<OrderStatus, 'unknown'>>([
  'in_progress',
  'ready',
  'closed',
])
const RIYADH_TIME_ZONE = 'Asia/Riyadh'
const POS_GREGORIAN_LOCALE = 'ar-SA-u-ca-gregory-nu-latn'

function readNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function readHistoryStatus(value: unknown): Exclude<OrderStatus, 'unknown'> | null {
  const status = readNonEmptyString(value)
  return ALLOWED_HISTORY_STATUSES.has(status as Exclude<OrderStatus, 'unknown'>)
    ? status as Exclude<OrderStatus, 'unknown'>
    : null
}

export function normalizeOrderStatusHistory(
  rows: OrderStatusHistorySourceRow[],
  employeeNames: Record<string, string>,
  currentStatus: OrderStatus,
): OrderStatusHistoryEntry[] {
  const entries = rows.flatMap((row, index) => {
    if (row.action !== STATUS_HISTORY_ACTION || !row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata)) {
      return []
    }

    const metadata = row.metadata as Record<string, unknown>
    const status = readHistoryStatus(metadata.new_status)
    const createdAt = readNonEmptyString(row.created_at)
    const timestamp = new Date(createdAt).getTime()

    if (!status || !createdAt || Number.isNaN(timestamp)) return []

    const actorId = readNonEmptyString(row.actor_user_id)
    const employeeName = actorId ? readNonEmptyString(employeeNames[actorId]) : ''

    return [{
      id: readNonEmptyString(row.id) || `status-event-${index}`,
      status,
      createdAt,
      employeeName: employeeName || undefined,
      isCurrent: false,
    }]
  }).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

  let currentMarked = false
  return entries.map((entry) => {
    const isCurrent = !currentMarked && entry.status === currentStatus
    if (isCurrent) currentMarked = true
    return { ...entry, isCurrent }
  })
}

export function parseOrderStatusHistoryEntries(value: unknown): OrderStatusHistoryEntry[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const source = entry as Record<string, unknown>
    const id = readNonEmptyString(source.id)
    const status = readHistoryStatus(source.status)
    const createdAt = readNonEmptyString(source.createdAt)
    const timestamp = new Date(createdAt).getTime()
    const employeeName = readNonEmptyString(source.employeeName)

    if (!id || !status || !createdAt || Number.isNaN(timestamp) || typeof source.isCurrent !== 'boolean') return []

    return [{
      id,
      status,
      createdAt,
      employeeName: employeeName || undefined,
      isCurrent: source.isCurrent,
    }]
  })
}

export function formatOrderStatusHistoryDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  const dateParts = Object.fromEntries(new Intl.DateTimeFormat(POS_GREGORIAN_LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: RIYADH_TIME_ZONE,
  }).formatToParts(date).map((part) => [part.type, part.value]))
  const time = new Intl.DateTimeFormat(POS_GREGORIAN_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: RIYADH_TIME_ZONE,
  }).format(date)

  return `${dateParts.day}/${dateParts.month}/${dateParts.year}، ${time}`
}

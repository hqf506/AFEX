import type { OrderRecord } from '@/lib/orders/orders-page'

export type PosOperation = {
  id: string
  kind: 'invoice'
  kindLabel: string
  title: string
  description: string
  reference: string
  customerName: string
  createdAt: string
  statusLabel: string
  statusTone: 'success' | 'neutral' | 'danger'
  order: OrderRecord
}

const riyadhDateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Riyadh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const riyadhDateLabel = new Intl.DateTimeFormat('ar-SA', {
  timeZone: 'Asia/Riyadh',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

const riyadhTime = new Intl.DateTimeFormat('ar-SA', {
  timeZone: 'Asia/Riyadh',
  hour: 'numeric',
  minute: '2-digit',
})

function toDayKey(value: Date) {
  const parts = Object.fromEntries(riyadhDateParts.formatToParts(value).map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function getRiyadhDayKey(now = new Date()) {
  return toDayKey(now)
}

export function getRiyadhDayLabel(now = new Date()) {
  return `اليوم — ${riyadhDateLabel.format(now)}`
}

function dateFromOperation(operation: PosOperation) {
  const value = new Date(operation.createdAt)
  return Number.isNaN(value.getTime()) ? null : value
}

export function mapOrdersToPosOperations(orders: OrderRecord[]): PosOperation[] {
  return orders.map((order): PosOperation => {
    const reference = order.invoice_number && order.invoice_number !== '—'
      ? order.invoice_number
      : order.order_number
    const statusTone: PosOperation['statusTone'] = order.status === 'closed' ? 'success' : order.status === 'unknown' ? 'danger' : 'neutral'

    return {
      id: order.id,
      kind: 'invoice',
      kindLabel: 'فاتورة',
      title: `فاتورة ${reference}`,
      description: order.customer_name && order.customer_name !== '—' ? `للعميل ${order.customer_name}` : 'عملية بيع نقدية',
      reference,
      customerName: order.customer_name && order.customer_name !== '—' ? order.customer_name : '',
      createdAt: order.created_at,
      statusLabel: order.status === 'closed' ? 'مكتملة' : order.status === 'ready' ? 'جاهزة' : order.status === 'in_progress' ? 'قيد التنفيذ' : 'حالة غير معروفة',
      statusTone,
      order,
    }
  }).sort((left, right) => {
    const leftTime = dateFromOperation(left)?.getTime() || 0
    const rightTime = dateFromOperation(right)?.getTime() || 0
    return rightTime - leftTime
  })
}

export function filterPosOperations(operations: PosOperation[], search: string, kind: 'all' | 'invoice') {
  const query = search.trim().toLocaleLowerCase('ar')
  return operations.filter((operation) => {
    if (kind !== 'all' && operation.kind !== kind) return false
    if (!query) return true
    return [operation.title, operation.description, operation.reference, operation.customerName, operation.statusLabel, operation.kindLabel]
      .some((value) => value.toLocaleLowerCase('ar').includes(query))
  })
}

export function currentRiyadhDayOperations(operations: PosOperation[], now = new Date()) {
  const todayKey = toDayKey(now)
  return operations.filter((operation) => {
    const date = dateFromOperation(operation)
    return date !== null && toDayKey(date) === todayKey
  })
}

export function countUniqueOperationCustomers(operations: PosOperation[]) {
  return new Set(operations.map((operation) => operation.customerName.trim()).filter(Boolean)).size
}

export function millisecondsUntilNextRiyadhMidnight(now = new Date()) {
  const currentKey = toDayKey(now)
  const [year, month, day] = currentKey.split('-').map(Number)
  const nextRiyadhMidnight = new Date(Date.UTC(year, month - 1, day + 1, -3, 0, 0, 0))
  return Math.max(1, nextRiyadhMidnight.getTime() - now.getTime())
}

export function formatPosOperationTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : riyadhTime.format(date)
}

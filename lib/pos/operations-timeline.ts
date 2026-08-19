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

export type PosOperationGroup = {
  key: string
  label: string
  operations: PosOperation[]
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

export function groupPosOperations(operations: PosOperation[], now = new Date()): PosOperationGroup[] {
  const todayKey = toDayKey(now)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const yesterdayKey = toDayKey(yesterday)
  const grouped = new Map<string, PosOperation[]>()

  for (const operation of operations) {
    const date = dateFromOperation(operation)
    const key = date ? toDayKey(date) : 'unknown'
    grouped.set(key, [...(grouped.get(key) || []), operation])
  }

  return [...grouped.entries()].map(([key, group]) => ({
    key,
    label: key === todayKey ? 'اليوم' : key === yesterdayKey ? 'أمس' : key === 'unknown' ? 'تاريخ غير متاح' : riyadhDateLabel.format(dateFromOperation(group[0])!),
    operations: group,
  }))
}

export function formatPosOperationTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : riyadhTime.format(date)
}

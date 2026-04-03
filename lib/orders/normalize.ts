export type OrderStatus = 'new' | 'in_progress' | 'ready' | 'delivered'

export type PaymentMethodKey = 'cash' | 'card' | 'transfer' | 'unknown'

export type RawInvoiceItem = {
  item_name_snapshot?: string
  item_type_snapshot?: string
  quantity?: number | string
  unit_price?: number | string
  line_total?: number | string
  [key: string]: unknown
}

export type RawInvoice = {
  invoice_number?: string
  payment_method?: string
  payment_status?: string
  note?: string
  total?: number | string
  subtotal?: number | string
  discount?: number | string
  tax?: number | string
  cash_received?: number | string
  remaining_from_customer?: number | string
  cash_change?: number | string
  invoice_items?: RawInvoiceItem[]
}

export type RawCustomer = {
  name?: string
  phone?: string
  phone_number?: string
}

export type RawOrder = {
  id?: string
  order_number?: string
  status?: string
  created_at?: string
  customers?: RawCustomer | RawCustomer[]
  invoices?: RawInvoice[] | RawInvoice
  [key: string]: unknown
}

export type NormalizedOrderItem = {
  name: string
  type: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export type NormalizedOrderRecord = {
  id: string
  orderNumber: string
  customerName: string
  customerPhone: string
  total: number
  subtotal: number
  discount: number
  tax: number
  status: OrderStatus
  statusRaw: string
  createdAt: string
  invoiceNumber: string
  paymentMethod: PaymentMethodKey
  paymentMethodRaw: string
  paymentStatus: string
  note: string
  cashReceived: number
  remainingFromCustomer: number
  cashChange: number
  items: NormalizedOrderItem[]
}

export function getStringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return '—'
}

export function getNumberValue(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (!Number.isNaN(parsed)) {
        return parsed
      }
    }
  }

  return 0
}

export function getPrimaryInvoice(invoices: RawOrder['invoices']): RawInvoice | null {
  if (Array.isArray(invoices)) {
    return invoices[0] || null
  }

  if (invoices && typeof invoices === 'object') {
    return invoices
  }

  return null
}

export function getPrimaryCustomer(customers: RawOrder['customers']): RawCustomer | null {
  if (Array.isArray(customers)) {
    return customers[0] || null
  }

  if (customers && typeof customers === 'object') {
    return customers
  }

  return null
}

export function normalizeOrderStatus(value: unknown): OrderStatus {
  if (value === 'in_progress') return 'in_progress'
  if (value === 'ready') return 'ready'
  if (value === 'delivered') return 'delivered'
  return 'new'
}

export function normalizePaymentMethod(value: unknown): PaymentMethodKey {
  if (value === 'cash') return 'cash'
  if (value === 'card') return 'card'
  if (value === 'transfer') return 'transfer'
  return 'unknown'
}

export function normalizeOrderItems(items: RawInvoiceItem[] | undefined): NormalizedOrderItem[] {
  if (!Array.isArray(items)) return []

  return items.map((item) => {
    const quantity = getNumberValue(item.quantity, 1)
    const unitPrice = getNumberValue(item.unit_price)
    const lineTotal = getNumberValue(item.line_total, quantity * unitPrice)

    return {
      name: getStringValue(item.item_name_snapshot),
      type: getStringValue(item.item_type_snapshot),
      quantity,
      unitPrice,
      lineTotal,
    }
  })
}

export function normalizeOrderRecord(
  row: RawOrder,
  index: number
): NormalizedOrderRecord {
  const primaryInvoice = getPrimaryInvoice(row.invoices)
  const primaryCustomer = getPrimaryCustomer(row.customers)
  const paymentMethodRaw = getStringValue(primaryInvoice?.payment_method)

  return {
    id:
      typeof row.id === 'string' && row.id.trim() ? row.id : `row-${index}`,
    orderNumber: getStringValue(row.order_number),
    customerName: getStringValue(primaryCustomer?.name),
    customerPhone: getStringValue(
      primaryCustomer?.phone,
      primaryCustomer?.phone_number
    ),
    total: getNumberValue(primaryInvoice?.total, primaryInvoice?.subtotal),
    subtotal: getNumberValue(primaryInvoice?.subtotal),
    discount: getNumberValue(primaryInvoice?.discount),
    tax: getNumberValue(primaryInvoice?.tax),
    status: normalizeOrderStatus(row.status),
    statusRaw: getStringValue(row.status),
    createdAt: getStringValue(row.created_at),
    invoiceNumber: getStringValue(primaryInvoice?.invoice_number),
    paymentMethod: normalizePaymentMethod(primaryInvoice?.payment_method),
    paymentMethodRaw,
    paymentStatus: getStringValue(primaryInvoice?.payment_status),
    note: getStringValue(primaryInvoice?.note),
    cashReceived: getNumberValue(primaryInvoice?.cash_received),
    remainingFromCustomer: getNumberValue(
      primaryInvoice?.remaining_from_customer
    ),
    cashChange: getNumberValue(primaryInvoice?.cash_change),
    items: normalizeOrderItems(primaryInvoice?.invoice_items),
  }
}

export function isSameDay(dateString: string): boolean {
  if (!dateString || dateString === '—') return false

  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return false

  const now = new Date()

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

export function isWithinCurrentWeek(dateString: string): boolean {
  if (!dateString || dateString === '—') return false

  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return false

  const now = new Date()
  const currentDay = now.getDay()
  const diffToWeekStart = currentDay === 0 ? 6 : currentDay - 1

  const weekStart = new Date(now)
  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(now.getDate() - diffToWeekStart)

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 7)

  return date >= weekStart && date < weekEnd
}

export function isWithinCurrentMonth(dateString: string): boolean {
  if (!dateString || dateString === '—') return false

  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return false

  const now = new Date()

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  )
}

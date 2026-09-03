export type OrderStatus = 'in_progress' | 'ready' | 'closed' | 'unknown'

export type PaymentMethodKey = 'cash' | 'card' | 'transfer' | 'unknown'

export type OrderInvoiceLineItemSource = {
  item_name_snapshot?: string
  item_type_snapshot?: string
  item_category_snapshot?: string
  quantity?: number | string
  unit_price?: number | string
  line_total?: number | string
  cost_price?: number | string
  [key: string]: unknown
}

export type OrderInvoiceSource = {
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
  invoice_items?: OrderInvoiceLineItemSource[]
}

export type OrderCustomerSource = {
  name?: string
  phone?: string
  phone_number?: string
}

export type OrderSourceRow = {
  id?: string
  order_number?: string
  branch_id?: string
  status?: string
  created_at?: string
  customers?: OrderCustomerSource | OrderCustomerSource[]
  invoices?: OrderInvoiceSource[] | OrderInvoiceSource
  [key: string]: unknown
}

export type OrderLineItemSummary = {
  name: string
  type: string
  category: string
  quantity: number
  unitPrice: number
  lineTotal: number
  costPrice: number
}

export type OrderSummary = {
  id: string
  orderNumber: string
  branchId: string
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
  cashReceivedAvailable: boolean
  appliedAmountAvailable: boolean
  remainingFromCustomerAvailable: boolean
  cashChangeAvailable: boolean
  items: OrderLineItemSummary[]
}

export function readOrderStringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return '—'
}

export function readOrderOptionalStringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

export function readOrderNumberValue(...values: unknown[]): number {
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

export function hasOrderNumberValue(value: unknown): boolean {
  return (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
}

export function getPrimaryOrderInvoice(invoices: OrderSourceRow['invoices']): OrderInvoiceSource | null {
  if (Array.isArray(invoices)) {
    return invoices[0] || null
  }

  if (invoices && typeof invoices === 'object') {
    return invoices
  }

  return null
}

export function getPrimaryOrderCustomer(customers: OrderSourceRow['customers']): OrderCustomerSource | null {
  if (Array.isArray(customers)) {
    return customers[0] || null
  }

  if (customers && typeof customers === 'object') {
    return customers
  }

  return null
}

export function normalizeOrderStatus(value: unknown): OrderStatus {
  if (
    value === 'new' ||
    value === 'pending' ||
    value === 'processing' ||
    value === 'in_progress'
  ) {
    return 'in_progress'
  }

  if (value === 'ready') {
    return 'ready'
  }

  if (value === 'delivered' || value === 'completed' || value === 'closed') {
    return 'closed'
  }

  return 'unknown'
}

export function normalizePaymentMethod(value: unknown): PaymentMethodKey {
  if (value === 'cash') return 'cash'
  if (value === 'card') return 'card'
  if (value === 'transfer') return 'transfer'
  return 'unknown'
}

export function normalizeOrderItems(items: OrderInvoiceLineItemSource[] | undefined): OrderLineItemSummary[] {
  if (!Array.isArray(items)) return []

  return items.map((item) => {
    const quantity = readOrderNumberValue(item.quantity, 1)
    const unitPrice = readOrderNumberValue(item.unit_price)
    const lineTotal = readOrderNumberValue(item.line_total, quantity * unitPrice)
    const costPrice = readOrderNumberValue(item.cost_price)

    return {
      name: readOrderOptionalStringValue(item.item_name_snapshot),
      type: readOrderOptionalStringValue(item.item_type_snapshot),
      category: readOrderOptionalStringValue(item.item_category_snapshot),
      quantity,
      unitPrice,
      lineTotal,
      costPrice,
    }
  })
}

export function normalizeOrderRecord(
  row: OrderSourceRow,
  index: number
): OrderSummary {
  const primaryInvoice = getPrimaryOrderInvoice(row.invoices)
  const primaryCustomer = getPrimaryOrderCustomer(row.customers)
  const paymentMethodRaw = readOrderStringValue(primaryInvoice?.payment_method)

  return {
    id:
      typeof row.id === 'string' && row.id.trim() ? row.id : `row-${index}`,
    orderNumber: readOrderStringValue(row.order_number),
    branchId: readOrderOptionalStringValue(row.branch_id),
    customerName: readOrderStringValue(primaryCustomer?.name),
    customerPhone: readOrderStringValue(
      primaryCustomer?.phone,
      primaryCustomer?.phone_number
    ),
    total: readOrderNumberValue(primaryInvoice?.total, primaryInvoice?.subtotal),
    subtotal: readOrderNumberValue(primaryInvoice?.subtotal),
    discount: readOrderNumberValue(primaryInvoice?.discount),
    tax: readOrderNumberValue(primaryInvoice?.tax),
    status: normalizeOrderStatus(row.status),
    statusRaw: readOrderStringValue(row.status),
    createdAt: readOrderStringValue(row.created_at),
    invoiceNumber: readOrderStringValue(primaryInvoice?.invoice_number),
    paymentMethod: normalizePaymentMethod(primaryInvoice?.payment_method),
    paymentMethodRaw,
    paymentStatus: readOrderStringValue(primaryInvoice?.payment_status),
    note: readOrderStringValue(primaryInvoice?.note),
    cashReceived: readOrderNumberValue(primaryInvoice?.cash_received),
    remainingFromCustomer: readOrderNumberValue(
      primaryInvoice?.remaining_from_customer
    ),
    cashChange: readOrderNumberValue(primaryInvoice?.cash_change),
    cashReceivedAvailable: hasOrderNumberValue(primaryInvoice?.cash_received),
    appliedAmountAvailable: hasOrderNumberValue(primaryInvoice?.total),
    remainingFromCustomerAvailable: hasOrderNumberValue(primaryInvoice?.remaining_from_customer),
    cashChangeAvailable: hasOrderNumberValue(primaryInvoice?.cash_change),
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

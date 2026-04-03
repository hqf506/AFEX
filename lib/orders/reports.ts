import { normalizeOrderRecord, type PaymentMethodKey, type OrderSourceRow } from '@/lib/orders/normalize'

export type ReportRange = 'daily' | 'monthly' | 'yearly' | 'custom'

export type ReportOrderRecord = {
  id: string
  order_number: string
  customer_name: string
  customer_phone: string
  status: string
  created_at: string
  invoice_number: string
  payment_method: PaymentMethodKey
  payment_status: string
  total: number
  subtotal: number
  discount: number
  tax: number
  cash_received: number
  remaining_from_customer: number
  cash_change: number
  note: string
  items: {
    name: string
    quantity: number
    line_total: number
  }[]
}

export type ReportOrderSummary = {
  totalOrders: number
  totalSales: number
  totalSubtotal: number
  totalDiscount: number
  totalTax: number
  cashTotal: number
  cardTotal: number
  transferTotal: number
  cashReceived: number
  outstandingFromCustomers: number
  changeForCustomers: number
  newCount: number
  inProgressCount: number
  readyCount: number
  deliveredCount: number
}

export type ReportTopService = {
  name: string
  qty: number
  total: number
}

export function mapOrderSourceRowToReportOrderRecord(
  row: OrderSourceRow,
  index: number
): ReportOrderRecord {
  const record = normalizeOrderRecord(row, index)

  return {
    id: record.id,
    order_number: record.orderNumber,
    customer_name: record.customerName,
    customer_phone: record.customerPhone,
    status: record.statusRaw,
    created_at: record.createdAt,
    invoice_number: record.invoiceNumber,
    payment_method: record.paymentMethod,
    payment_status: record.paymentStatus,
    total: record.total,
    subtotal: record.subtotal,
    discount: record.discount,
    tax: record.tax,
    cash_received: record.cashReceived,
    remaining_from_customer: record.remainingFromCustomer,
    cash_change: record.cashChange,
    note: record.note,
    items: record.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      line_total: item.lineTotal,
    })),
  }
}

export function sanitizeExportValue(value: string | number) {
  return String(value ?? '')
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/\r?\n/g, ' ')
    .trim()
}

export function escapeCsvValue(value: string | number) {
  const text = sanitizeExportValue(value)
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function buildReportDateRange(
  range: ReportRange,
  dateFrom: string,
  dateTo: string
) {
  if (!dateFrom) {
    return {
      fromIso: '',
      toIso: '',
    }
  }

  if (range === 'daily') {
    return {
      fromIso: `${dateFrom}T00:00:00.000`,
      toIso: `${dateFrom}T23:59:59.999`,
    }
  }

  if (range === 'monthly') {
    const baseDate = new Date(`${dateFrom}T12:00:00`)
    const year = baseDate.getFullYear()
    const month = baseDate.getMonth()

    const start = new Date(year, month, 1, 0, 0, 0, 0)
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999)

    return {
      fromIso: start.toISOString(),
      toIso: end.toISOString(),
    }
  }

  if (range === 'yearly') {
    const baseDate = new Date(`${dateFrom}T12:00:00`)
    const year = baseDate.getFullYear()

    const start = new Date(year, 0, 1, 0, 0, 0, 0)
    const end = new Date(year, 11, 31, 23, 59, 59, 999)

    return {
      fromIso: start.toISOString(),
      toIso: end.toISOString(),
    }
  }

  const safeDateTo = dateTo || dateFrom

  return {
    fromIso: `${dateFrom}T00:00:00.000`,
    toIso: `${safeDateTo}T23:59:59.999`,
  }
}

export function buildReportOrderSummary(filteredOrders: ReportOrderRecord[]): ReportOrderSummary {
  const totalSales = filteredOrders.reduce((sum, order) => sum + order.total, 0)
  const totalSubtotal = filteredOrders.reduce(
    (sum, order) => sum + order.subtotal,
    0
  )
  const totalDiscount = filteredOrders.reduce(
    (sum, order) => sum + order.discount,
    0
  )
  const totalTax = filteredOrders.reduce((sum, order) => sum + order.tax, 0)

  const cashTotal = filteredOrders
    .filter((order) => order.payment_method === 'cash')
    .reduce((sum, order) => sum + order.total, 0)

  const cardTotal = filteredOrders
    .filter((order) => order.payment_method === 'card')
    .reduce((sum, order) => sum + order.total, 0)

  const transferTotal = filteredOrders
    .filter((order) => order.payment_method === 'transfer')
    .reduce((sum, order) => sum + order.total, 0)

  const cashReceived = filteredOrders.reduce(
    (sum, order) => sum + order.cash_received,
    0
  )

  const outstandingFromCustomers = filteredOrders.reduce(
    (sum, order) => sum + order.remaining_from_customer,
    0
  )

  const changeForCustomers = filteredOrders.reduce(
    (sum, order) => sum + order.cash_change,
    0
  )

  return {
    totalOrders: filteredOrders.length,
    totalSales,
    totalSubtotal,
    totalDiscount,
    totalTax,
    cashTotal,
    cardTotal,
    transferTotal,
    cashReceived,
    outstandingFromCustomers,
    changeForCustomers,
    newCount: filteredOrders.filter((o) => o.status === 'new').length,
    inProgressCount: filteredOrders.filter((o) => o.status === 'in_progress')
      .length,
    readyCount: filteredOrders.filter((o) => o.status === 'ready').length,
    deliveredCount: filteredOrders.filter((o) => o.status === 'delivered')
      .length,
  }
}

export function getReportTopServices(
  filteredOrders: ReportOrderRecord[]
): ReportTopService[] {
  const map = new Map<string, { qty: number; total: number }>()

  for (const order of filteredOrders) {
    for (const item of order.items) {
      if (!item.name || item.name === '—') continue
      const prev = map.get(item.name) || { qty: 0, total: 0 }
      map.set(item.name, {
        qty: prev.qty + item.quantity,
        total: prev.total + item.line_total,
      })
    }
  }

  return [...map.entries()]
    .map(([name, values]) => ({
      name,
      qty: values.qty,
      total: values.total,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
}

export function getReportRangeLabel(range: ReportRange) {
  return range === 'daily'
    ? 'تقرير يومي'
    : range === 'monthly'
    ? 'تقرير شهري'
    : range === 'yearly'
    ? 'تقرير سنوي'
    : 'تقرير بين تاريخين'
}

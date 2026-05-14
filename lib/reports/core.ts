import {
  normalizeOrderRecord,
  type OrderSourceRow,
  type OrderStatus,
  type PaymentMethodKey,
} from '@/lib/orders/normalize'

export type ReportRange = 'daily' | 'monthly' | 'yearly' | 'custom'

export type ReportOrderItemRecord = {
  name: string
  type: string
  category: string
  quantity: number
  unit_price: number
  line_total: number
  cost_price: number
  cost_total: number
  profit: number
  has_known_cost: boolean
}

export type ReportOrderRecord = {
  id: string
  order_number: string
  customer_name: string
  customer_phone: string
  status: OrderStatus
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
  items: ReportOrderItemRecord[]
}

export type ReportOrderSummary = {
  totalOrders: number
  totalSales: number
  totalCost: number
  totalProfit: number
  profitMarginPercent: number
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
  closedCount: number
}

export type ReportTopService = {
  name: string
  qty: number
  total: number
}

export type SalesByItemRow = {
  itemKey: string
  itemName: string
  itemType: string
  itemCategory: string
  quantitySold: number
  salePrice: number
  costPrice: number
  grossSales: number
  totalCost: number
  profit: number
  knownCostQuantity: number
  ordersCount: number
  averageUnitPrice: number
}

export type SalesByCategoryRow = {
  categoryKey: string
  categoryName: string
  quantitySold: number
  grossSales: number
  totalCost: number
  profit: number
  knownCostQuantity: number
  ordersCount: number
  averageUnitPrice: number
}

export type SalesByCustomerRow = {
  customerKey: string
  customerName: string
  customerPhone: string
  ordersCount: number
  quantitySold: number
  grossSales: number
  totalCost: number
  profit: number
  knownCostQuantity: number
  averageOrderValue: number
}

export type CatalogFinancialSource = {
  name: string
  item_type?: string | null
  category?: string | null
  default_price?: number | string | null
  cost_price?: number | string | null
}

type CatalogFinancialRecord = {
  name: string
  itemType: string
  category: string
  salePrice: number
  costPrice: number
}

function coerceReportStatus(status: OrderStatus): Exclude<OrderStatus, 'unknown'> {
  if (status === 'ready' || status === 'closed') {
    return status
  }

  return 'in_progress'
}

function normalizeReportText(value: unknown, fallback = '') {
  if (typeof value === 'string') {
    return value.trim()
  }

  return fallback
}

export function mapOrderSourceRowToReportOrderRecord(
  row: OrderSourceRow,
  index: number
): ReportOrderRecord {
  const record = normalizeOrderRecord(row, index)
  const status = coerceReportStatus(record.status)

  return {
    id: record.id,
    order_number: record.orderNumber,
    customer_name: record.customerName,
    customer_phone: record.customerPhone,
    status,
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
      type: item.type,
      category: item.category,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      line_total: item.lineTotal,
      cost_price: item.costPrice,
      cost_total: item.costPrice > 0 ? item.costPrice * item.quantity : 0,
      profit:
        item.costPrice > 0
          ? item.lineTotal - item.costPrice * item.quantity
          : 0,
      has_known_cost: item.costPrice > 0,
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
      fromIso: toUtcDayBoundaryIso(dateFrom, 'start'),
      toIso: toUtcDayBoundaryIso(dateFrom, 'end'),
    }
  }

  if (range === 'monthly') {
    const { year, month } = parseDateParts(dateFrom)

    if (!year || !month) {
      return {
        fromIso: '',
        toIso: '',
      }
    }

    return {
      fromIso: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)).toISOString(),
      toIso: new Date(
        Date.UTC(year, month, 0, 23, 59, 59, 999)
      ).toISOString(),
    }
  }

  if (range === 'yearly') {
    const { year } = parseDateParts(dateFrom)

    if (!year) {
      return {
        fromIso: '',
        toIso: '',
      }
    }

    return {
      fromIso: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)).toISOString(),
      toIso: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)).toISOString(),
    }
  }

  const safeDateTo = dateTo || dateFrom

  return {
    fromIso: toUtcDayBoundaryIso(dateFrom, 'start'),
    toIso: toUtcDayBoundaryIso(safeDateTo, 'end'),
  }
}

export function enrichOrdersWithCatalogFinancials(
  orders: ReportOrderRecord[],
  catalogItems: CatalogFinancialSource[]
) {
  const lookup = buildCatalogFinancialLookup(catalogItems)

  return orders.map((order) => ({
    ...order,
    items: order.items.map((item) => {
      const matched = findCatalogFinancialRecord(item, lookup)
      const quantity = Number(item.quantity) || 0
      const salePrice =
        Number(item.unit_price) > 0
          ? Number(item.unit_price)
          : matched?.salePrice || 0
      const snapshotCostPrice =
        Number(item.cost_price) > 0 ? Number(item.cost_price) : 0
      const fallbackCostPrice = matched?.costPrice || 0
      const costPrice =
        snapshotCostPrice > 0 ? snapshotCostPrice : fallbackCostPrice
      const hasKnownCost = costPrice > 0
      const costTotal = hasKnownCost ? costPrice * quantity : 0
      const lineTotal =
        Number(item.line_total) > 0 ? Number(item.line_total) : salePrice * quantity
      const profit = hasKnownCost ? lineTotal - costTotal : 0

      return {
        ...item,
        unit_price: salePrice,
        line_total: lineTotal,
        cost_price: costPrice,
        cost_total: costTotal,
        profit,
        has_known_cost: hasKnownCost,
      }
    }),
  }))
}

export function buildReportOrderSummary(
  filteredOrders: ReportOrderRecord[]
): ReportOrderSummary {
  let totalSales = 0
  let totalCost = 0
  let totalProfit = 0
  let totalSubtotal = 0
  let totalDiscount = 0
  let totalTax = 0
  let cashTotal = 0
  let cardTotal = 0
  let transferTotal = 0
  let cashReceived = 0
  let outstandingFromCustomers = 0
  let changeForCustomers = 0
  let inProgressCount = 0
  let readyCount = 0
  let closedCount = 0

  for (const order of filteredOrders) {
    totalSales += order.total
    totalSubtotal += order.subtotal
    totalDiscount += order.discount
    totalTax += order.tax
    cashReceived += order.cash_received
    outstandingFromCustomers += order.remaining_from_customer
    changeForCustomers += order.cash_change
    totalCost += order.items.reduce((sum, item) => sum + item.cost_total, 0)
    totalProfit += order.items.reduce((sum, item) => sum + item.profit, 0)

    if (order.payment_method === 'cash') {
      cashTotal += order.total
    } else if (order.payment_method === 'card') {
      cardTotal += order.total
    } else if (order.payment_method === 'transfer') {
      transferTotal += order.total
    }

    if (order.status === 'in_progress') {
      inProgressCount += 1
    } else if (order.status === 'ready') {
      readyCount += 1
    } else if (order.status === 'closed') {
      closedCount += 1
    }
  }

  return {
    totalOrders: filteredOrders.length,
    totalSales,
    totalCost,
    totalProfit,
    profitMarginPercent: totalSales > 0 ? (totalProfit / totalSales) * 100 : 0,
    totalSubtotal,
    totalDiscount,
    totalTax,
    cashTotal,
    cardTotal,
    transferTotal,
    cashReceived,
    outstandingFromCustomers,
    changeForCustomers,
    newCount: 0,
    inProgressCount,
    readyCount,
    deliveredCount: closedCount,
    closedCount,
  }
}

export function getReportTopServices(
  filteredOrders: ReportOrderRecord[]
): ReportTopService[] {
  const map = new Map<string, { qty: number; total: number }>()

  for (const order of filteredOrders) {
    for (const item of order.items) {
      const itemName = normalizeReportText(item.name)

      if (!itemName || itemName === '—') continue

      const prev = map.get(itemName) || { qty: 0, total: 0 }
      map.set(itemName, {
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

function parseDateParts(value: string) {
  const [yearText = '', monthText = '', dayText = '1'] = value.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)

  return {
    year,
    month,
    day,
  }
}

function toUtcDayBoundaryIso(value: string, boundary: 'start' | 'end') {
  const { year, month, day } = parseDateParts(value)

  if (!year || !month || !day) {
    return ''
  }

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      boundary === 'start' ? 0 : 23,
      boundary === 'start' ? 0 : 59,
      boundary === 'start' ? 0 : 59,
      boundary === 'start' ? 0 : 999
    )
  ).toISOString()
}

function normalizeCatalogLookupText(value: string | null | undefined) {
  return (value || '').trim().toLowerCase()
}

function normalizeCatalogLookupNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

function buildCatalogFinancialLookup(catalogItems: CatalogFinancialSource[]) {
  const lookup = new Map<string, CatalogFinancialRecord>()

  for (const item of catalogItems) {
    const normalizedName = normalizeCatalogLookupText(item.name)
    if (!normalizedName) continue

    const normalizedType = normalizeCatalogLookupText(item.item_type)
    const normalizedCategory = normalizeCatalogLookupText(item.category)
    const record: CatalogFinancialRecord = {
      name: item.name,
      itemType: normalizedType,
      category: normalizedCategory,
      salePrice: normalizeCatalogLookupNumber(item.default_price),
      costPrice: normalizeCatalogLookupNumber(item.cost_price),
    }

    lookup.set(`name:${normalizedName}`, record)

    if (normalizedType) {
      lookup.set(`type:${normalizedType}::name:${normalizedName}`, record)
    }

    if (normalizedCategory) {
      lookup.set(`category:${normalizedCategory}::name:${normalizedName}`, record)
    }
  }

  return lookup
}

function findCatalogFinancialRecord(
  item: ReportOrderItemRecord,
  lookup: Map<string, CatalogFinancialRecord>
) {
  const normalizedName = normalizeCatalogLookupText(item.name)
  const normalizedType = normalizeCatalogLookupText(item.type)
  const normalizedCategory = normalizeCatalogLookupText(item.category)

  if (!normalizedName) return null

  if (normalizedType) {
    const byType = lookup.get(`type:${normalizedType}::name:${normalizedName}`)
    if (byType) return byType
  }

  if (normalizedCategory) {
    const byCategory = lookup.get(
      `category:${normalizedCategory}::name:${normalizedName}`
    )
    if (byCategory) return byCategory
  }

  return lookup.get(`name:${normalizedName}`) || null
}

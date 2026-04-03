import {
  isSameDay,
  type OrderSummary,
  type OrderStatus,
} from '@/lib/orders/normalize'
import { formatPaymentMethod } from '@/lib/orders/format'

export type OrderFilter = 'all' | 'today' | OrderStatus

export type OrderLineItemRecord = {
  item_name: string
  item_type: string
  quantity: number
  unit_price: number
  line_total: number
}

export type OrderRecord = {
  id: string
  order_number: string
  customer_name: string
  customer_phone: string
  total: number
  status: OrderStatus
  created_at: string
  invoice_number: string
  payment_method: string
  payment_status: string
  note: string
  cash_received: number
  remaining_from_customer: number
  cash_change: number
  items: OrderLineItemRecord[]
}

export type OrdersPageSummary = {
  totalOrders: number
  newCount: number
  inProgressCount: number
  readyCount: number
  deliveredCount: number
  revenue: number
  todayOrdersCount: number
  todayRevenue: number
}

export const ORDERS_FETCH_LIMIT = 100

export const ORDER_STATUS_MAP: Record<
  OrderStatus,
  { label: string; className: string }
> = {
  new: {
    label: 'جديد',
    className: 'badge badge-blue',
  },
  in_progress: {
    label: 'قيد التنفيذ',
    className: 'badge badge-amber',
  },
  ready: {
    label: 'جاهز',
    className: 'badge badge-green',
  },
  delivered: {
    label: 'مستلم',
    className: 'badge badge-slate',
  },
}

export const ORDER_FILTERS: { key: OrderFilter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'today', label: 'اليوم' },
  { key: 'new', label: 'جديد' },
  { key: 'in_progress', label: 'قيد التنفيذ' },
  { key: 'ready', label: 'جاهز' },
  { key: 'delivered', label: 'مستلم' },
]

export function mapOrderSummaryToOrderRecord(record: OrderSummary): OrderRecord {
  return {
    id: record.id,
    order_number: record.orderNumber,
    customer_name: record.customerName,
    customer_phone: record.customerPhone,
    total: record.total,
    status: record.status,
    created_at: record.createdAt,
    invoice_number: record.invoiceNumber,
    payment_method: formatPaymentMethod(
      record.paymentMethod,
      record.paymentMethodRaw
    ),
    payment_status: record.paymentStatus,
    note: record.note,
    cash_received: record.cashReceived,
    remaining_from_customer: record.remainingFromCustomer,
    cash_change: record.cashChange,
    items: record.items.map((item) => ({
      item_name: item.name,
      item_type: item.type,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      line_total: item.lineTotal,
    })),
  }
}

export function getTodayOrderRecords(orders: OrderRecord[]) {
  return orders.filter((order) => isSameDay(order.created_at))
}

export function filterOrders(
  orders: OrderRecord[],
  search: string,
  filter: OrderFilter
) {
  const normalizedSearch = search.trim()

  return orders.filter((order) => {
    const matchesSearch =
      normalizedSearch === '' ||
      order.customer_name.includes(normalizedSearch) ||
      order.customer_phone.includes(normalizedSearch) ||
      order.order_number.includes(normalizedSearch) ||
      order.invoice_number.includes(normalizedSearch)

    const matchesFilter =
      filter === 'all'
        ? true
        : filter === 'today'
        ? isSameDay(order.created_at)
        : order.status === filter

    return matchesSearch && matchesFilter
  })
}

export function buildOrdersPageSummary(
  filteredOrders: OrderRecord[],
  todayOrders: OrderRecord[]
): OrdersPageSummary {
  let newCount = 0
  let inProgressCount = 0
  let readyCount = 0
  let deliveredCount = 0
  let revenue = 0

  for (const order of filteredOrders) {
    revenue += order.total

    if (order.status === 'new') {
      newCount += 1
    } else if (order.status === 'in_progress') {
      inProgressCount += 1
    } else if (order.status === 'ready') {
      readyCount += 1
    } else if (order.status === 'delivered') {
      deliveredCount += 1
    }
  }

  let todayRevenue = 0

  for (const order of todayOrders) {
    todayRevenue += order.total
  }

  return {
    totalOrders: filteredOrders.length,
    newCount,
    inProgressCount,
    readyCount,
    deliveredCount,
    revenue,
    todayOrdersCount: todayOrders.length,
    todayRevenue,
  }
}

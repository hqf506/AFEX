import {
  isSameDay,
  type NormalizedOrderRecord,
  type OrderStatus,
} from '@/lib/orders/normalize'
import { formatPaymentMethod } from '@/lib/orders/format'

export type OrderFilter = 'all' | 'today' | OrderStatus

export type OrderItem = {
  item_name: string
  item_type: string
  quantity: number
  unit_price: number
  line_total: number
}

export type Order = {
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
  items: OrderItem[]
}

export type OrdersPageStats = {
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

export function mapOrderRecordToOrder(record: NormalizedOrderRecord): Order {
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

export function getTodayOrders(orders: Order[]) {
  return orders.filter((order) => isSameDay(order.created_at))
}

export function filterOrders(
  orders: Order[],
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

export function buildOrdersPageStats(
  filteredOrders: Order[],
  todayOrders: Order[]
): OrdersPageStats {
  return {
    totalOrders: filteredOrders.length,
    newCount: filteredOrders.filter((order) => order.status === 'new').length,
    inProgressCount: filteredOrders.filter(
      (order) => order.status === 'in_progress'
    ).length,
    readyCount: filteredOrders.filter((order) => order.status === 'ready')
      .length,
    deliveredCount: filteredOrders.filter(
      (order) => order.status === 'delivered'
    ).length,
    revenue: filteredOrders.reduce((sum, order) => sum + order.total, 0),
    todayOrdersCount: todayOrders.length,
    todayRevenue: todayOrders.reduce((sum, order) => sum + order.total, 0),
  }
}

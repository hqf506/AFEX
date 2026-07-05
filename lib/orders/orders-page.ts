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
  branch_id: string
  customer_name: string
  customer_phone: string
  total: number
  subtotal: number
  discount: number
  tax: number
  status: OrderStatus
  created_at: string
  invoice_number: string
  payment_method: string
  payment_method_key: string
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
  closedCount: number
  revenue: number
  todayOrdersCount: number
  todayRevenue: number
}

export const ORDER_STATUS_MAP: Record<
  OrderStatus,
  { label: string; className: string }
> = {
  in_progress: {
    label: 'قيد التنفيذ',
    className: 'badge badge-amber',
  },
  ready: {
    label: 'جاهز',
    className: 'badge badge-green',
  },
  closed: {
    label: 'تم تسليم',
    className: 'badge badge-slate',
  },
  unknown: {
    label: 'غير معروفة',
    className: 'badge badge-rose',
  },
}

export const ORDER_FILTERS: { key: OrderFilter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'today', label: 'اليوم' },
  { key: 'in_progress', label: 'قيد التنفيذ' },
  { key: 'ready', label: 'جاهز' },
  { key: 'closed', label: 'تم تسليم' },
]

export function mapOrderSummaryToOrderRecord(record: OrderSummary): OrderRecord {
  return {
    id: record.id,
    order_number: record.orderNumber,
    branch_id: record.branchId,
    customer_name: record.customerName,
    customer_phone: record.customerPhone,
    total: record.total,
    subtotal: record.subtotal,
    discount: record.discount,
    tax: record.tax,
    status: record.status,
    created_at: record.createdAt,
    invoice_number: record.invoiceNumber,
    payment_method: formatPaymentMethod(
      record.paymentMethod,
      record.paymentMethodRaw
    ),
    payment_method_key: record.paymentMethod,
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

export function buildOrdersPageSummary(
  visibleOrders: OrderRecord[],
  todayOrders: OrderRecord[]
): OrdersPageSummary {
  let inProgressCount = 0
  let readyCount = 0
  let closedCount = 0
  let revenue = 0

  for (const order of visibleOrders) {
    revenue += order.total

    if (order.status === 'in_progress') {
      inProgressCount += 1
    } else if (order.status === 'ready') {
      readyCount += 1
    } else if (order.status === 'closed') {
      closedCount += 1
    }
  }

  let todayRevenue = 0

  for (const order of todayOrders) {
    todayRevenue += order.total
  }

  return {
    totalOrders: visibleOrders.length,
    newCount: 0,
    inProgressCount,
    readyCount,
    deliveredCount: closedCount,
    closedCount,
    revenue,
    todayOrdersCount: todayOrders.length,
    todayRevenue,
  }
}

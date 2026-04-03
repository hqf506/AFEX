import {
  isSameDay,
  isWithinCurrentMonth,
  isWithinCurrentWeek,
  normalizeOrderRecord,
  type OrderStatus,
  type PaymentMethodKey,
  type RawOrder,
} from '@/lib/orders/normalize'

export type DashboardRange = 'today' | 'week' | 'month'
export type DashboardSection =
  | 'full'
  | 'latest'
  | 'status'
  | 'summary'
  | 'activity'
  | 'cash'

export type DashboardOrder = {
  id: string
  order_number: string
  customer_name: string
  customer_phone: string
  total: number
  status: OrderStatus
  created_at: string
  invoice_number: string
  payment_method: PaymentMethodKey
  payment_status: string
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

export type DashboardStats = {
  totalOrders: number
  rangeOrdersCount: number
  todayOrdersCount: number
  totalRevenue: number
  cashTotal: number
  cardTotal: number
  transferTotal: number
  outstandingFromCustomers: number
  changeForCustomers: number
  cashReceived: number
  newCount: number
  inProgressCount: number
  readyCount: number
  deliveredCount: number
}

export const DASHBOARD_FETCH_LIMIT = 100

export const DASHBOARD_STATUS_MAP: Record<
  DashboardOrder['status'],
  { label: string; className: string }
> = {
  new: { label: 'جديد', className: 'badge badge-blue' },
  in_progress: { label: 'قيد التنفيذ', className: 'badge badge-amber' },
  ready: { label: 'جاهز', className: 'badge badge-green' },
  delivered: { label: 'تم التسليم', className: 'badge badge-slate' },
}

export const DASHBOARD_QUICK_ACTIONS = [
  { label: 'الصفحة الرئيسية', href: '/' },
  { label: 'فاتورة جديدة', href: '/invoice/new' },
  { label: 'الطلبات', href: '/orders' },
  { label: 'التقارير', href: '/admin/reports' },
  { label: 'المستخدمون', href: '/admin/users' },
]

export const DASHBOARD_NAV_ITEMS = [
  { label: 'الرئيسية', href: '/' },
  { label: 'الفواتير', href: '/invoice/new' },
  { label: 'الطلبات', href: '/orders' },
  { label: 'التقارير', href: '/admin/reports' },
  { label: 'المستخدمون', href: '/admin/users' },
]

export const DASHBOARD_SECTION_TITLES: Record<DashboardSection, string> = {
  full: 'لوحة تحكم الأدمن',
  latest: 'آخر الطلبات',
  status: 'حالة الطلبات',
  summary: 'ملخص سريع',
  activity: 'النشاط الأخير',
  cash: 'النقدية',
}

export function mapOrderRecordToDashboardOrder(
  row: RawOrder,
  index: number
): DashboardOrder {
  const record = normalizeOrderRecord(row, index)

  return {
    id: record.id,
    order_number: record.orderNumber,
    customer_name: record.customerName,
    customer_phone: record.customerPhone,
    total: record.total,
    status: record.status,
    created_at: record.createdAt,
    invoice_number: record.invoiceNumber,
    payment_method: record.paymentMethod,
    payment_status: record.paymentStatus,
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

export function resolveDashboardSection(
  value: string | null | undefined
): DashboardSection {
  if (value === 'latest') return 'latest'
  if (value === 'status') return 'status'
  if (value === 'summary') return 'summary'
  if (value === 'activity') return 'activity'
  if (value === 'cash') return 'cash'
  return 'full'
}

export function getDashboardRangeOrders(
  orders: DashboardOrder[],
  range: DashboardRange
) {
  if (range === 'today') {
    return orders.filter((order) => isSameDay(order.created_at))
  }

  if (range === 'week') {
    return orders.filter((order) => isWithinCurrentWeek(order.created_at))
  }

  return orders.filter((order) => isWithinCurrentMonth(order.created_at))
}

export function buildDashboardStats(
  orders: DashboardOrder[],
  rangeOrders: DashboardOrder[],
  todayOrders: DashboardOrder[]
): DashboardStats {
  const cashTotal = rangeOrders
    .filter((order) => order.payment_method === 'cash')
    .reduce((sum, order) => sum + order.total, 0)

  const cardTotal = rangeOrders
    .filter((order) => order.payment_method === 'card')
    .reduce((sum, order) => sum + order.total, 0)

  const transferTotal = rangeOrders
    .filter((order) => order.payment_method === 'transfer')
    .reduce((sum, order) => sum + order.total, 0)

  const outstandingFromCustomers = rangeOrders.reduce(
    (sum, order) => sum + order.remaining_from_customer,
    0
  )

  const changeForCustomers = rangeOrders.reduce(
    (sum, order) => sum + order.cash_change,
    0
  )

  const cashReceived = rangeOrders.reduce(
    (sum, order) => sum + order.cash_received,
    0
  )

  return {
    totalOrders: orders.length,
    rangeOrdersCount: rangeOrders.length,
    todayOrdersCount: todayOrders.length,
    totalRevenue: rangeOrders.reduce((sum, order) => sum + order.total, 0),
    cashTotal,
    cardTotal,
    transferTotal,
    outstandingFromCustomers,
    changeForCustomers,
    cashReceived,
    newCount: rangeOrders.filter((order) => order.status === 'new').length,
    inProgressCount: rangeOrders.filter(
      (order) => order.status === 'in_progress'
    ).length,
    readyCount: rangeOrders.filter((order) => order.status === 'ready').length,
    deliveredCount: rangeOrders.filter(
      (order) => order.status === 'delivered'
    ).length,
  }
}

export function getDashboardStatusItems(stats: DashboardStats) {
  return [
    { label: 'جديد', count: stats.newCount, color: 'bg-blue-900' },
    { label: 'قيد التنفيذ', count: stats.inProgressCount, color: 'bg-amber-500' },
    { label: 'جاهز', count: stats.readyCount, color: 'bg-emerald-500' },
    { label: 'تم التسليم', count: stats.deliveredCount, color: 'bg-slate-700' },
  ]
}

export function getDashboardRangeLabel(range: DashboardRange) {
  return range === 'today'
    ? 'اليوم'
    : range === 'week'
    ? 'هذا الأسبوع'
    : 'هذا الشهر'
}

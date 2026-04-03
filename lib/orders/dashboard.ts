import {
  isSameDay,
  isWithinCurrentMonth,
  isWithinCurrentWeek,
  normalizeOrderRecord,
  type OrderStatus,
  type PaymentMethodKey,
  type OrderSourceRow,
} from '@/lib/orders/normalize'

export type DashboardRange = 'today' | 'week' | 'month'
export type DashboardSection =
  | 'full'
  | 'latest'
  | 'status'
  | 'summary'
  | 'activity'
  | 'cash'

export type DashboardOrderRecord = {
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

export type DashboardOrderSummary = {
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
  DashboardOrderRecord['status'],
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

export function mapOrderSourceRowToDashboardOrderRecord(
  row: OrderSourceRow,
  index: number
): DashboardOrderRecord {
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
  orders: DashboardOrderRecord[],
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

export function buildDashboardOrderSummary(
  orders: DashboardOrderRecord[],
  rangeOrders: DashboardOrderRecord[],
  todayOrders: DashboardOrderRecord[]
): DashboardOrderSummary {
  let totalRevenue = 0
  let cashTotal = 0
  let cardTotal = 0
  let transferTotal = 0
  let outstandingFromCustomers = 0
  let changeForCustomers = 0
  let cashReceived = 0
  let newCount = 0
  let inProgressCount = 0
  let readyCount = 0
  let deliveredCount = 0

  for (const order of rangeOrders) {
    totalRevenue += order.total
    outstandingFromCustomers += order.remaining_from_customer
    changeForCustomers += order.cash_change
    cashReceived += order.cash_received

    if (order.payment_method === 'cash') {
      cashTotal += order.total
    } else if (order.payment_method === 'card') {
      cardTotal += order.total
    } else if (order.payment_method === 'transfer') {
      transferTotal += order.total
    }

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

  return {
    totalOrders: orders.length,
    rangeOrdersCount: rangeOrders.length,
    todayOrdersCount: todayOrders.length,
    totalRevenue,
    cashTotal,
    cardTotal,
    transferTotal,
    outstandingFromCustomers,
    changeForCustomers,
    cashReceived,
    newCount,
    inProgressCount,
    readyCount,
    deliveredCount,
  }
}

export function getDashboardStatusItems(stats: DashboardOrderSummary) {
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

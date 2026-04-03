'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { usePageAccess } from '@/hooks/use-page-access'

type DashboardRange = 'today' | 'week' | 'month'
type DashboardSection = 'full' | 'latest' | 'status' | 'summary' | 'activity' | 'cash'

type RawInvoiceItem = {
  item_name_snapshot?: string
  quantity?: number | string
  line_total?: number | string
}

type RawInvoice = {
  invoice_number?: string
  payment_method?: string
  payment_status?: string
  total?: number | string
  subtotal?: number | string
  discount?: number | string
  tax?: number | string
  cash_received?: number | string
  remaining_from_customer?: number | string
  cash_change?: number | string
  note?: string
  invoice_items?: RawInvoiceItem[]
}

type RawCustomer = {
  name?: string
  phone?: string
}

type RawOrder = {
  id?: string
  order_number?: string
  status?: string
  created_at?: string
  customers?: RawCustomer | RawCustomer[]
  invoices?: RawInvoice[] | RawInvoice
}

type DashboardOrder = {
  id: string
  order_number: string
  customer_name: string
  customer_phone: string
  total: number
  status: 'new' | 'in_progress' | 'ready' | 'delivered'
  created_at: string
  invoice_number: string
  payment_method: 'cash' | 'card' | 'transfer' | 'unknown'
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

const DASHBOARD_FETCH_LIMIT = 100

const statusMap: Record<
  DashboardOrder['status'],
  { label: string; className: string }
> = {
  new: { label: 'جديد', className: 'badge badge-blue' },
  in_progress: { label: 'قيد التنفيذ', className: 'badge badge-amber' },
  ready: { label: 'جاهز', className: 'badge badge-green' },
  delivered: { label: 'تم التسليم', className: 'badge badge-slate' },
}

function getStringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return '—'
}

function getNumberValue(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && !Number.isNaN(value)) return value

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (!Number.isNaN(parsed)) return parsed
    }
  }

  return 0
}

function normalizeStatus(value: unknown): DashboardOrder['status'] {
  if (value === 'in_progress') return 'in_progress'
  if (value === 'ready') return 'ready'
  if (value === 'delivered') return 'delivered'
  return 'new'
}

function getPrimaryInvoice(invoices: RawOrder['invoices']): RawInvoice | null {
  if (Array.isArray(invoices)) return invoices[0] || null
  if (invoices && typeof invoices === 'object') return invoices
  return null
}

function getPrimaryCustomer(customers: RawOrder['customers']): RawCustomer | null {
  if (Array.isArray(customers)) return customers[0] || null
  if (customers && typeof customers === 'object') return customers
  return null
}

function normalizePaymentMethod(
  value: unknown
): DashboardOrder['payment_method'] {
  if (value === 'cash') return 'cash'
  if (value === 'card') return 'card'
  if (value === 'transfer') return 'transfer'
  return 'unknown'
}

function formatPaymentMethod(value: DashboardOrder['payment_method']) {
  if (value === 'cash') return 'كاش'
  if (value === 'card') return 'شبكة'
  if (value === 'transfer') return 'تحويل'
  return 'غير محدد'
}

function normalizeOrder(row: RawOrder, index: number): DashboardOrder {
  const primaryInvoice = getPrimaryInvoice(row.invoices)
  const primaryCustomer = getPrimaryCustomer(row.customers)

  return {
    id: getStringValue(row.id, `row-${index}`),
    order_number: getStringValue(row.order_number),
    customer_name: getStringValue(primaryCustomer?.name),
    customer_phone: getStringValue(primaryCustomer?.phone),
    total: getNumberValue(primaryInvoice?.total, primaryInvoice?.subtotal),
    status: normalizeStatus(row.status),
    created_at: getStringValue(row.created_at),
    invoice_number: getStringValue(primaryInvoice?.invoice_number),
    payment_method: normalizePaymentMethod(primaryInvoice?.payment_method),
    payment_status: getStringValue(primaryInvoice?.payment_status),
    cash_received: getNumberValue(primaryInvoice?.cash_received),
    remaining_from_customer: getNumberValue(
      primaryInvoice?.remaining_from_customer
    ),
    cash_change: getNumberValue(primaryInvoice?.cash_change),
    note: getStringValue(primaryInvoice?.note),
    items: Array.isArray(primaryInvoice?.invoice_items)
      ? primaryInvoice.invoice_items.map((item) => ({
          name: getStringValue(item.item_name_snapshot),
          quantity: getNumberValue(item.quantity, 1),
          line_total: getNumberValue(item.line_total),
        }))
      : [],
  }
}

function isSameDay(dateString: string) {
  if (!dateString || dateString === '—') return false

  const date = new Date(dateString)
  const now = new Date()

  if (Number.isNaN(date.getTime())) return false

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

function isWithinCurrentWeek(dateString: string) {
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

function isWithinCurrentMonth(dateString: string) {
  if (!dateString || dateString === '—') return false

  const date = new Date(dateString)
  const now = new Date()

  if (Number.isNaN(date.getTime())) return false

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  )
}

function formatCurrency(value: number) {
  return `${value.toFixed(2)} ر.س`
}

function DashboardPageContent() {
  const searchParams = useSearchParams()

  const access = usePageAccess(['admin'])
  const authLoading = access.loading
  const allowed = access.allowed
  const roleLabel =
    access.userRole === 'admin'
      ? 'أدمن'
      : access.userRole === 'employee'
      ? 'موظف'
      : access.userRole === 'cashier'
      ? 'كاشير'
      : ''

  const section = useMemo<DashboardSection>(() => {
    const value = searchParams.get('section')
    if (value === 'latest') return 'latest'
    if (value === 'status') return 'status'
    if (value === 'summary') return 'summary'
    if (value === 'activity') return 'activity'
    if (value === 'cash') return 'cash'
    return 'full'
  }, [searchParams])

  const [orders, setOrders] = useState<DashboardOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [range, setRange] = useState<DashboardRange>('today')
  const [lastUpdated, setLastUpdated] = useState('')

  const fetchDashboardData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)

    setErrorMessage('')

    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        status,
        created_at,
        customers (
          name,
          phone
        ),
        invoices (
          invoice_number,
          payment_method,
          payment_status,
          subtotal,
          discount,
          tax,
          total,
          note,
          cash_received,
          remaining_from_customer,
          cash_change,
          invoice_items (
            item_name_snapshot,
            quantity,
            line_total
          )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(DASHBOARD_FETCH_LIMIT)

    if (error) {
      setErrorMessage(`فشل تحميل لوحة التحكم: ${error.message}`)
      setOrders([])
      setLoading(false)
      setRefreshing(false)
      return
    }

    const normalized = Array.isArray(data)
      ? data.map((row, index) => normalizeOrder(row as RawOrder, index))
      : []

    setOrders(normalized)
    setLastUpdated(new Date().toLocaleTimeString('ar-SA'))
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    if (!allowed) return

    const timeoutId = window.setTimeout(() => {
      void fetchDashboardData()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [allowed, fetchDashboardData])

  useEffect(() => {
    if (!allowed) return

    const interval = setInterval(() => {
      fetchDashboardData(true)
    }, 15000)

    return () => clearInterval(interval)
  }, [allowed, fetchDashboardData])

  const todayOrders = useMemo(
    () => orders.filter((order) => isSameDay(order.created_at)),
    [orders]
  )

  const rangeOrders = useMemo(() => {
    if (range === 'today') {
      return orders.filter((order) => isSameDay(order.created_at))
    }

    if (range === 'week') {
      return orders.filter((order) => isWithinCurrentWeek(order.created_at))
    }

    return orders.filter((order) => isWithinCurrentMonth(order.created_at))
  }, [orders, range])

  const stats = useMemo(() => {
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
  }, [orders, rangeOrders, todayOrders])

  const recentOrders = useMemo(() => orders.slice(0, 6), [orders])

  const statusItems = [
    { label: 'جديد', count: stats.newCount, color: 'bg-blue-900' },
    { label: 'قيد التنفيذ', count: stats.inProgressCount, color: 'bg-amber-500' },
    { label: 'جاهز', count: stats.readyCount, color: 'bg-emerald-500' },
    { label: 'تم التسليم', count: stats.deliveredCount, color: 'bg-slate-700' },
  ]

  const maxStatusCount = Math.max(...statusItems.map((item) => item.count), 1)

  const quickActions = [
    { label: 'الصفحة الرئيسية', href: '/' },
    { label: 'فاتورة جديدة', href: '/invoice/new' },
    { label: 'الطلبات', href: '/orders' },
    { label: 'التقارير', href: '/admin/reports' },
    { label: 'المستخدمون', href: '/admin/users' },
  ]

  const navItems = [
    { label: 'الرئيسية', href: '/' },
    { label: 'الفواتير', href: '/invoice/new' },
    { label: 'الطلبات', href: '/orders' },
    { label: 'التقارير', href: '/admin/reports' },
    { label: 'المستخدمون', href: '/admin/users' },
  ]

  const rangeLabel =
    range === 'today' ? 'اليوم' : range === 'week' ? 'هذا الأسبوع' : 'هذا الشهر'

  const sectionTitleMap: Record<DashboardSection, string> = {
    full: 'لوحة تحكم الأدمن',
    latest: 'آخر الطلبات',
    status: 'حالة الطلبات',
    summary: 'ملخص سريع',
    activity: 'النشاط الأخير',
    cash: 'النقدية',
  }

  if (authLoading) {
    return (
      <div className="app-shell">
        <div className="page-wrap">
          <div className="page-card">جاري التحقق من الصلاحية...</div>
        </div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="app-shell">
        <div className="page-wrap">
          <div className="page-card">جارٍ التحويل...</div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="app-shell">
        <div className="page-wrap">
          <div className="page-card">جاري تحميل لوحة التحكم...</div>
        </div>
      </div>
    )
  }

  const latestOrdersCard = (
    <div className="page-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="section-title">آخر الطلبات</h2>
        <button
          onClick={() => fetchDashboardData()}
          className="secondary-btn"
        >
          تحديث
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-3 py-3 text-right">رقم الطلب</th>
              <th className="px-3 py-3 text-right">العميل</th>
              <th className="px-3 py-3 text-right">الدفع</th>
              <th className="px-3 py-3 text-right">الحالة</th>
              <th className="px-3 py-3 text-right">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {recentOrders.map((order) => (
              <tr key={order.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-4 font-bold text-slate-900">
                  {order.order_number}
                </td>
                <td className="px-3 py-4 text-slate-700">
                  {order.customer_name}
                </td>
                <td className="px-3 py-4 text-slate-700">
                  {formatPaymentMethod(order.payment_method)}
                </td>
                <td className="px-3 py-4">
                  <span className={statusMap[order.status].className}>
                    {statusMap[order.status].label}
                  </span>
                </td>
                <td className="px-3 py-4 font-bold text-slate-900">
                  {formatCurrency(order.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  const statusCard = (
    <div className="page-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="section-title">حالة الطلبات</h2>
        <button
          onClick={() => {
            if (range === 'today') setRange('week')
            else if (range === 'week') setRange('month')
            else setRange('today')
          }}
          className="secondary-btn"
        >
          {rangeLabel}
        </button>
      </div>

      <div className="space-y-5">
        {statusItems.map((item) => {
          const percentage =
            maxStatusCount === 0 ? 0 : (item.count / maxStatusCount) * 100

          return (
            <div key={item.label}>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-bold text-slate-700">{item.label}</span>
                <span className="text-slate-500">{item.count} طلب</span>
              </div>

              <div className="h-3 rounded-full bg-slate-100">
                <div
                  className={`h-3 rounded-full ${item.color}`}
                  style={{ width: `${Math.max(percentage, item.count > 0 ? 12 : 0)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const activityCard = (
    <div className="page-card">
      <h2 className="section-title">النشاط الأخير</h2>

      <div className="mt-4 space-y-3">
        {recentOrders.length === 0 ? (
          <div className="inner-card text-sm text-slate-500">
            لا يوجد نشاط حديث
          </div>
        ) : (
          recentOrders.map((order) => (
            <div key={order.id} className="inner-card text-sm text-slate-700">
              تم تسجيل الطلب {order.order_number} للعميل {order.customer_name}
            </div>
          ))
        )}
      </div>
    </div>
  )

  const summaryCard = (
    <div className="page-card">
      <h2 className="section-title">ملخص سريع</h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <SummaryRow
          label="إجمالي الطلبات"
          value={stats.totalOrders.toString()}
        />
        <SummaryRow
          label="طلبات اليوم"
          value={stats.todayOrdersCount.toString()}
        />
        <SummaryRow
          label="إجمالي الكاش"
          value={formatCurrency(stats.cashTotal)}
        />
        <SummaryRow
          label="إجمالي الشبكة"
          value={formatCurrency(stats.cardTotal)}
        />
      </div>
    </div>
  )

  const cashCard = (
    <div className="page-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="section-title">النقدية</h2>
        <span className="badge badge-slate">{rangeLabel}</span>
      </div>

      <div className="space-y-3">
        <SummaryRow
          label="المبالغ المستلمة نقدًا"
          value={formatCurrency(stats.cashReceived)}
        />
        <SummaryRow
          label="المتبقي من العملاء"
          value={formatCurrency(stats.outstandingFromCustomers)}
        />
        <SummaryRow
          label="الباقي للعملاء"
          value={formatCurrency(stats.changeForCustomers)}
        />
      </div>
    </div>
  )

  if (section !== 'full') {
    return (
      <div className="app-shell">
        <div className="page-wrap">
          {errorMessage && <div className="error-alert">{errorMessage}</div>}

          <main className="space-y-5">
            <div className="page-card">
              <div className="mb-2 flex items-center justify-between">
                <h1 className="text-3xl font-extrabold text-slate-900">
                  {sectionTitleMap[section]}
                </h1>
                {refreshing ? (
                  <span className="badge badge-slate">جاري التحديث...</span>
                ) : null}
              </div>
              <p className="text-sm text-slate-500">
                المحتوى يفتح هنا داخل نفس الصفحة
              </p>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              يتم عرض آخر {DASHBOARD_FETCH_LIMIT} طلب فقط لتحسين السرعة والأداء.
            </div>

            {section === 'latest' ? latestOrdersCard : null}
            {section === 'status' ? statusCard : null}
            {section === 'summary' ? summaryCard : null}
            {section === 'activity' ? activityCard : null}
            {section === 'cash' ? cashCard : null}
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="page-wrap">
        {errorMessage && <div className="error-alert">{errorMessage}</div>}

        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 mb-5">
          يتم عرض آخر {DASHBOARD_FETCH_LIMIT} طلب فقط لتحسين السرعة والأداء.
        </div>

        <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
          <aside className="space-y-5 xl:order-1">
            <div className="page-card bg-slate-950 text-white ring-0 shadow-none">
              <p className="text-xs text-slate-400">Admin Panel</p>
              <h2 className="mt-3 text-3xl font-extrabold">Leather Fix APP</h2>
              <p className="mt-4 text-sm leading-8 text-slate-300">
                لوحة تحكم أنيقة لإدارة التشغيل والفواتير والطلبات بشكل يومي.
              </p>
              <div className="mt-4">
                <span className="badge badge-green">الصلاحية: {roleLabel}</span>
              </div>
            </div>

            <div className="page-card !p-4">
              <div className="mb-3">
                <Link
                  href="/admin/dashboard"
                  className="inline-flex w-full items-center justify-between rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition"
                >
                  <span>لوحة التحكم</span>
                  <span>•</span>
                </Link>
              </div>

              <div className="space-y-2">
                {navItems.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="inline-flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-900 hover:text-white"
                  >
                    <span>{item.label}</span>
                    <span>•</span>
                  </Link>
                ))}
              </div>
            </div>

            {cashCard}
          </aside>

          <main className="space-y-5 xl:order-2">
            <div className="page-hero">
              <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                <div>
                  <p className="text-sm text-slate-500">أهلاً بك من جديد</p>
                  <h1 className="mt-2 text-4xl font-extrabold text-slate-900">
                    لوحة تحكم الأدمن
                  </h1>
                  <p className="mt-3 max-w-[760px] text-base leading-8 text-slate-500">
                    هذه النسخة مخصصة للإدارة، وواجهة الموظف بنخليها أبسط وأسرع
                    لاحقًا، مع الحفاظ على نفس البيانات والوظائف الحالية.
                  </p>

                  <div className="mt-6 flex flex-wrap gap-3">
                    {quickActions.map((item) => (
                      <Link
                        key={item.label}
                        href={item.href}
                        className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-900 hover:text-white"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <StatCard
                    title="إجمالي اليوم"
                    value={formatCurrency(stats.totalRevenue)}
                  />
                  <StatCard
                    title="طلبات اليوم"
                    value={stats.todayOrdersCount.toString()}
                  />
                  <StatCard
                    title="فواتير النطاق"
                    value={stats.rangeOrdersCount.toString()}
                  />
                  <StatCard
                    title="آخر تحديث"
                    value={lastUpdated || '—'}
                    valueClassName="text-lg sm:text-xl"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard title="طلبات جديدة" value={stats.newCount.toString()} valueClassName="text-blue-700" />
              <StatCard title="قيد التنفيذ" value={stats.inProgressCount.toString()} valueClassName="text-amber-700" />
              <StatCard title="جاهز" value={stats.readyCount.toString()} valueClassName="text-emerald-700" />
              <StatCard title="تم التسليم" value={stats.deliveredCount.toString()} valueClassName="text-slate-800" />
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.25fr_0.95fr]">
              {latestOrdersCard}
              {statusCard}
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              {activityCard}
              {summaryCard}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  title,
  value,
  valueClassName = 'text-slate-900',
}: {
  title: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="stat-card !p-5">
      <p className="stat-label">{title}</p>
      <p className={`stat-value ${valueClassName}`}>{value}</p>
    </div>
  )
}

function SummaryRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-bold text-slate-900">{value}</span>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="app-shell">
          <div className="page-wrap">
            <div className="page-card">جاري تحميل لوحة التحكم...</div>
          </div>
        </div>
      }
    >
      <DashboardPageContent />
    </Suspense>
  )
}

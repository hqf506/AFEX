'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { getRoleLabel } from '@/lib/app-roles'
import {
  buildDashboardOrderSummary,
  DASHBOARD_FETCH_LIMIT,
  DASHBOARD_NAV_ITEMS,
  DASHBOARD_QUICK_ACTIONS,
  DASHBOARD_SECTION_TITLES,
  DASHBOARD_STATUS_MAP,
  getDashboardRangeLabel,
  getDashboardRangeOrders,
  getDashboardStatusItems,
  mapOrderSourceRowToDashboardOrderRecord,
  resolveDashboardSection,
  type DashboardOrderRecord,
  type DashboardRange,
  type DashboardSection,
} from '@/lib/orders/dashboard'
import { supabase } from '@/lib/supabase/client'
import { usePageAccess } from '@/hooks/use-page-access'
import { isSameDay, type OrderSourceRow } from '@/lib/orders/normalize'
import { formatCurrency, formatPaymentMethod } from '@/lib/orders/format'

function buildDashboardOrderComparisonSignature(orders: DashboardOrderRecord[]) {
  return orders
    .map((order) =>
      [
        order.id,
        order.status,
        order.created_at,
        order.total,
        order.invoice_number,
      ].join('|')
    )
    .join('||')
}

function DashboardPageContent() {
  const searchParams = useSearchParams()

  const access = usePageAccess(['admin'])
  const authLoading = access.loading
  const allowed = access.allowed
  const roleLabel = getRoleLabel(access.userRole)

  const section = useMemo<DashboardSection>(() => {
    return resolveDashboardSection(searchParams.get('section'))
  }, [searchParams])

  const [orders, setOrders] = useState<DashboardOrderRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [range, setRange] = useState<DashboardRange>('today')
  const [lastUpdated, setLastUpdated] = useState('')
  const isFetchInFlightRef = useRef(false)
  const ordersSignatureRef = useRef('')

  const fetchDashboardData = useCallback(async (silent = false) => {
    if (isFetchInFlightRef.current) return
    isFetchInFlightRef.current = true

    if (silent) setRefreshing(true)
    else setLoading(true)

    setErrorMessage('')

    try {
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
      ordersSignatureRef.current = ''
      setLoading(false)
      setRefreshing(false)
      return
    }

    const normalized = Array.isArray(data)
      ? data.map((row, index) => mapOrderSourceRowToDashboardOrderRecord(row as OrderSourceRow, index))
      : []

    const nextSignature = buildDashboardOrderComparisonSignature(normalized)

    if (ordersSignatureRef.current !== nextSignature) {
      ordersSignatureRef.current = nextSignature
      setOrders(normalized)
    }

    setLastUpdated(new Date().toLocaleTimeString('ar-SA'))
    setLoading(false)
    setRefreshing(false)
    } finally {
      isFetchInFlightRef.current = false
    }
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
      if (document.hidden) return
      fetchDashboardData(true)
    }, 15000)

    return () => clearInterval(interval)
  }, [allowed, fetchDashboardData])

  useEffect(() => {
    if (!allowed) return

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void fetchDashboardData(true)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [allowed, fetchDashboardData])

  const todayOrders = useMemo(
    () => orders.filter((order) => isSameDay(order.created_at)),
    [orders]
  )

  const rangeOrders = useMemo(() => {
    return getDashboardRangeOrders(orders, range)
  }, [orders, range])

  const stats = useMemo(() => {
    return buildDashboardOrderSummary(orders, rangeOrders, todayOrders)
  }, [orders, rangeOrders, todayOrders])

  const recentOrders = useMemo(() => orders.slice(0, 6), [orders])

  const { statusItems, maxStatusCount } = useMemo(() => {
    const nextStatusItems = getDashboardStatusItems(stats)

    return {
      statusItems: nextStatusItems,
      maxStatusCount: Math.max(...nextStatusItems.map((item) => item.count), 1),
    }
  }, [stats])

  const quickActions = DASHBOARD_QUICK_ACTIONS

  const navItems = DASHBOARD_NAV_ITEMS

  const rangeLabel = getDashboardRangeLabel(range)

  const sectionTitleMap = DASHBOARD_SECTION_TITLES

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
                  <span className={DASHBOARD_STATUS_MAP[order.status].className}>
                    {DASHBOARD_STATUS_MAP[order.status].label}
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


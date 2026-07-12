'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdminDarkDateInput } from '@/components/admin-dark-date-input'
import { AdminDarkSelect } from '@/components/admin-dark-select'
import { AdminAlert, AdminEmptyState } from '@/components/admin-ui'
import { useAuthState } from '@/components/auth-state-provider'
import { getRoleLabel } from '@/lib/app-roles'
import { useAdminBranchFilter } from '@/hooks/use-admin-branch-filter'
import { ADMIN_BRANCH_FILTER_ALL } from '@/lib/admin/branch-filter'
import {
  isBranchScopedWithoutBranchId,
  shouldFilterByBranch,
} from '@/lib/branch-access'
import {
  buildReportDateRange,
  escapeCsvValue,
  sanitizeExportValue,
  type ReportOrderRecord,
  type ReportOrderSummary,
  type ReportTopService,
  type ReportRange,
} from '@/lib/reports/core'
import { usePageAccess } from '@/hooks/use-page-access'
import { canViewReportRange } from '@/lib/permissions'
import {
  formatCurrency,
  formatDateTime,
  formatPaymentMethod,
  getDateInputValue,
} from '@/lib/orders/format'

function ReportsShellPlaceholder() {
  return (
    <div className="min-h-full">
      <div className="w-full space-y-6">
        <div className="h-32 animate-pulse rounded-[30px] border border-white/10 bg-white/[0.055]" />
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-[24px] border border-white/10 bg-white/[0.055]"
            />
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <div className="h-80 animate-pulse rounded-[28px] border border-white/10 bg-white/[0.055]" />
          <div className="h-80 animate-pulse rounded-[28px] border border-white/10 bg-white/[0.055]" />
        </div>
        <div className="h-96 animate-pulse rounded-[28px] border border-white/10 bg-white/[0.055]" />
      </div>
    </div>
  )
}

const rangeOptions: Array<{ value: ReportRange; label: string }> = [
  { value: 'daily', label: 'اليوم' },
  { value: 'monthly', label: 'الشهر' },
  { value: 'yearly', label: 'السنة' },
  { value: 'custom', label: 'مخصص' },
]

function resolveReportStatusLabel(status: ReportOrderRecord['status']) {
  if (status === 'in_progress') return 'قيد التجهيز'
  if (status === 'ready') return 'جاهز'
  if (status === 'closed') return 'تم التسليم'
  return 'غير محدد'
}

function resolveReportStatusClassName(status: ReportOrderRecord['status']) {
  if (status === 'in_progress') {
    return 'border-sky-400/35 bg-sky-500/10 text-sky-200'
  }
  if (status === 'ready') {
    return 'border-amber-300/35 bg-amber-400/10 text-amber-100'
  }
  if (status === 'closed') {
    return 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'
  }
  return 'border-slate-400/20 bg-slate-400/10 text-slate-300'
}

function ReportIcon({ type }: { type: string }) {
  if (type === 'sales') {
    return (
      <path d="M5 6h2l1.4 9.2a2 2 0 0 0 2 1.8h5.8a2 2 0 0 0 1.9-1.4L20 9H8" />
    )
  }

  if (type === 'profit') {
    return <path d="M4 18 9 11l4 4 7-9M14 6h6v6" />
  }

  if (type === 'orders') {
    return (
      <>
        <rect x="6" y="4" width="12" height="16" rx="2" />
        <path d="M9 9h6M9 13h6M9 17h4" />
      </>
    )
  }

  return (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  )
}

type ReportKpiCardProps = {
  title: string
  value: string
  hint: string
  icon: string
}

type ReportOrderSummaryRow = Omit<ReportOrderRecord, 'items'> & {
  cost_total: number
  profit_total: number
}

type SalesTrendRow = {
  key: string
  label: string
  total: number
}

type ReportsSummaryPayload = {
  summary: ReportOrderSummary
  topServices: ReportTopService[]
  salesTrend: SalesTrendRow[]
  orders: ReportOrderSummaryRow[]
}

const emptyReportSummary: ReportOrderSummary = {
  totalOrders: 0,
  totalSales: 0,
  totalCost: 0,
  totalProfit: 0,
  profitMarginPercent: 0,
  totalSubtotal: 0,
  totalDiscount: 0,
  totalTax: 0,
  cashTotal: 0,
  cardTotal: 0,
  transferTotal: 0,
  cashReceived: 0,
  outstandingFromCustomers: 0,
  changeForCustomers: 0,
  newCount: 0,
  inProgressCount: 0,
  readyCount: 0,
  deliveredCount: 0,
  closedCount: 0,
}

function ReportKpiCard({ title, value, hint, icon }: ReportKpiCardProps) {
  return (
    <div className="rounded-[24px] border border-cyan-300/15 bg-white/[0.045] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.18)] backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.12)]">
          <svg
            viewBox="0 0 24 24"
            className="h-7 w-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <ReportIcon type={icon} />
          </svg>
        </div>
        <div className="min-w-0 text-left">
          <p className="text-sm font-bold text-slate-400">{title}</p>
          <p className="mt-2 truncate text-3xl font-black text-white">{value}</p>
          <p className="mt-2 text-xs font-black text-emerald-300">{hint}</p>
        </div>
      </div>
    </div>
  )
}

function DarkSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3">
      <span className="text-sm font-black text-white">{value}</span>
      <span className="text-sm text-slate-400">{label}</span>
    </div>
  )
}

export default function ReportsPage() {
  const authState = useAuthState()
  const access = usePageAccess(['admin', 'employee'])
  const authLoading = access.loading
  const allowed = access.allowed
  const roleLabel = getRoleLabel(access.userRole)
  const branchId = access.branchId
  const scopeType = access.scopeType
  const tenantId = authState.profile?.tenant_id ?? null
  const {
    isSystemAdmin,
    branches,
    loadingBranches,
    selectedBranchId,
    effectiveBranchId,
    setSelectedBranchId,
  } = useAdminBranchFilter(scopeType, branchId, allowed, tenantId)

  const todayString = getDateInputValue(new Date())

  const [orders, setOrders] = useState<ReportOrderSummaryRow[]>([])
  const [stats, setStats] = useState<ReportOrderSummary>(emptyReportSummary)
  const [topServices, setTopServices] = useState<ReportTopService[]>([])
  const [salesTrend, setSalesTrend] = useState<SalesTrendRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [range, setRange] = useState<ReportRange>('daily')
  const [dateFrom, setDateFrom] = useState(todayString)
  const [dateTo, setDateTo] = useState(todayString)
  const [showAllOrders, setShowAllOrders] = useState(false)
  const [showAllServices, setShowAllServices] = useState(false)
  const reportsRequestSeqRef = useRef(0)

  const resetReportData = () => {
    setOrders([])
    setStats(emptyReportSummary)
    setTopServices([])
    setSalesTrend([])
  }

  const fetchReportsData = useCallback(
    async (silent = false) => {
      if (!dateFrom) {
        resetReportData()
        setLoading(false)
        setRefreshing(false)
        return
      }

      if (range === 'custom' && dateTo && dateTo < dateFrom) {
        setErrorMessage('تاريخ "إلى" يجب أن يكون بعد أو مساوياً لتاريخ "من"')
        resetReportData()
        setLoading(false)
        setRefreshing(false)
        return
      }

      if (silent) setRefreshing(true)
      else setLoading(true)

      setErrorMessage('')

      const { fromIso, toIso } = buildReportDateRange(range, dateFrom, dateTo)

      if (!canViewReportRange(access.userRole, fromIso, toIso)) {
        setErrorMessage('الإداري يمكنه عرض تقارير لمدة شهر واحد كحد أقصى')
        resetReportData()
        setLoading(false)
        setRefreshing(false)
        return
      }

      if (isBranchScopedWithoutBranchId(scopeType, branchId)) {
        resetReportData()
        setLastUpdated(new Date().toLocaleTimeString('en-GB'))
        setLoading(false)
        setRefreshing(false)
        return
      }

      if (!tenantId) {
        resetReportData()
        setLastUpdated(new Date().toLocaleTimeString('en-GB'))
        setLoading(false)
        setRefreshing(false)
        return
      }

      const params = new URLSearchParams({
        range,
        dateFrom,
        dateTo,
      })

      if (!shouldFilterByBranch(scopeType, branchId) && effectiveBranchId) {
        params.set('branchId', effectiveBranchId)
      }

      const requestSeq = reportsRequestSeqRef.current + 1
      reportsRequestSeqRef.current = requestSeq

      try {
        const response = await fetch(
          `/api/admin/reports/summary?${params.toString()}`,
          {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
          }
        )
        const result = (await response.json().catch(() => null)) as
          | ({ success?: boolean; message?: string } & Partial<ReportsSummaryPayload>)
          | null

        if (!response.ok || !result?.success) {
          throw new Error(result?.message || 'فشل تحميل التقارير')
        }

        if (reportsRequestSeqRef.current !== requestSeq) {
          return
        }

        setStats(result.summary || emptyReportSummary)
        setTopServices(result.topServices || [])
        setSalesTrend(result.salesTrend || [])
        setOrders(result.orders || [])
      } catch (reportError) {
        if (reportsRequestSeqRef.current !== requestSeq) {
          return
        }

        console.error('Reports page data fetch error:', reportError)
        setErrorMessage(
          reportError instanceof Error
            ? reportError.message
            : 'تعذر تحميل بيانات التقارير لهذه الفترة'
        )
        resetReportData()
      }

      setLastUpdated(new Date().toLocaleTimeString('en-GB'))
      setLoading(false)
      setRefreshing(false)
    },
    [
      range,
      dateFrom,
      dateTo,
      access.userRole,
      scopeType,
      branchId,
      effectiveBranchId,
      tenantId,
    ]
  )
  useEffect(() => {
    if (!allowed) return

    const timeoutId = window.setTimeout(() => {
      void fetchReportsData()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [allowed, fetchReportsData])

  const visibleOrders = useMemo(
    () => (showAllOrders ? orders : orders.slice(0, 5)),
    [orders, showAllOrders]
  )

  const branchOptions = useMemo(() => {
    const normalizeBranchLabel = (name: string) => {
      const lowerName = name.toLowerCase()

      if (lowerName.includes('main') || name.includes('الرئيس')) {
        return 'الفرع الرئيسي'
      }

      if (lowerName.includes('leather-fix') || lowerName.includes('leather fix')) {
        return 'فرع Leather-Fix'
      }

      return name
    }

    return [
      {
        value: ADMIN_BRANCH_FILTER_ALL,
        label: 'كل الفروع',
      },
      ...branches.map((branch) => ({
        value: branch.id,
        label: normalizeBranchLabel(branch.name),
      })),
    ]
  }, [branches])

  const selectedBranchLabel = useMemo(() => {
    const activeBranchValue =
      selectedBranchId && selectedBranchId !== ADMIN_BRANCH_FILTER_ALL
        ? selectedBranchId
        : effectiveBranchId || ADMIN_BRANCH_FILTER_ALL

    return (
      branchOptions.find((option) => option.value === activeBranchValue)?.label ||
      (effectiveBranchId ? 'الفرع الحالي' : 'كل الفروع')
    )
  }, [branchOptions, effectiveBranchId, selectedBranchId])

  const visibleTopServices = useMemo(
    () => (showAllServices ? topServices : topServices.slice(0, 5)),
    [showAllServices, topServices]
  )

  const averageOrderValue = useMemo(() => {
    if (stats.totalOrders === 0) return 0
    return stats.totalSales / stats.totalOrders
  }, [stats.totalOrders, stats.totalSales])

  const paidAmount = useMemo(() => {
    return stats.cashTotal + stats.cardTotal + stats.transferTotal
  }, [stats.cashTotal, stats.cardTotal, stats.transferTotal])

  const kpiCards = useMemo(
    () => [
      {
        title: 'إجمالي المبيعات',
        value: formatCurrency(stats.totalSales),
        hint: '+0.0% ضمن الفترة',
        icon: 'sales',
      },
      {
        title: 'إجمالي الربح',
        value: formatCurrency(stats.totalProfit),
        hint: `${stats.profitMarginPercent.toFixed(1)}% هامش الربح`,
        icon: 'profit',
      },
      {
        title: 'عدد الطلبات',
        value: stats.totalOrders.toString(),
        hint: `${stats.inProgressCount + stats.readyCount} طلب نشط`,
        icon: 'orders',
      },
      {
        title: 'متوسط الطلب',
        value: formatCurrency(averageOrderValue),
        hint: `${stats.closedCount} طلب مكتمل`,
        icon: 'average',
      },
    ],
    [
      averageOrderValue,
      stats.closedCount,
      stats.inProgressCount,
      stats.profitMarginPercent,
      stats.readyCount,
      stats.totalOrders,
      stats.totalProfit,
      stats.totalSales,
    ]
  )

  const salesTrendPoints = useMemo(() => {
    if (salesTrend.length === 0) return ''

    const maxValue = Math.max(...salesTrend.map((item) => item.total), 1)
    const step = salesTrend.length > 1 ? 100 / (salesTrend.length - 1) : 0

    return salesTrend
      .map((item, index) => {
        const x = salesTrend.length > 1 ? index * step : 50
        const y = 100 - (item.total / maxValue) * 82 - 8
        return `${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(' ')
  }, [salesTrend])

  const topServicesTotal = useMemo(() => {
    return topServices.slice(0, 5).reduce((sum, item) => sum + item.total, 0)
  }, [topServices])

  const donutSegments = useMemo(() => {
    const items = topServices.slice(0, 5)
    const colors = ['#2dd4bf', '#22d3ee', '#38bdf8', '#0f766e', '#475569']

    return items.map((item, index) => {
      const percent =
        topServicesTotal > 0 ? (item.total / topServicesTotal) * 100 : 0
      const start = items.slice(0, index).reduce((sum, previousItem) => {
        return (
          sum +
          (topServicesTotal > 0
            ? (previousItem.total / topServicesTotal) * 100
            : 0)
        )
      }, 0)

      return {
        ...item,
        percent,
        color: colors[index] || colors[colors.length - 1],
        start,
        end: start + percent,
      }
    })
  }, [topServices, topServicesTotal])

  const donutGradient = useMemo(() => {
    if (donutSegments.length === 0) {
      return 'conic-gradient(rgba(45,212,191,0.16) 0 100%)'
    }

    return `conic-gradient(${donutSegments
      .map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`)
      .join(', ')})`
  }, [donutSegments])

  const exportExcel = () => {
    const headers = [
      'رقم الطلب',
      'رقم الفاتورة',
      'اسم العميل',
      'الجوال',
      'الحالة',
      'طريقة الدفع',
      'حالة الدفع',
      'إجمالي البيع',
      'إجمالي التكلفة',
      'إجمالي الربح',
      'المجموع الفرعي',
      'الخصم',
      'الضريبة',
      'المبلغ المستلم',
      'المتبقي من العميل',
      'الباقي للعميل',
      'التاريخ',
      'الملاحظة',
    ]

    const rows = orders.map((order) => {
      return [
        order.order_number,
        order.invoice_number,
        order.customer_name,
        order.customer_phone,
        order.status,
        formatPaymentMethod(order.payment_method),
        order.payment_status,
        order.total,
        order.cost_total,
        order.profit_total,
        order.subtotal,
        order.discount,
        order.tax,
        order.cash_received,
        order.remaining_from_customer,
        order.cash_change,
        formatDateTime(order.created_at, 'en-GB'),
        order.note === '—' ? '' : order.note,
      ]
    })

    const csvContent = [
      headers.map(escapeCsvValue).join(','),
      ...rows.map((row) => row.map(escapeCsvValue).join(',')),
    ].join('\n')

    const blob = new Blob(['\ufeff' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    })

    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `reports-${range}-${dateFrom}-to-${dateTo}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const exportPdf = () => {
    const printWindow = window.open('', '_blank', 'width=1200,height=900')
    if (!printWindow) return

    const rowsHtml =
      orders.length === 0
        ? `<tr><td colspan="9" style="text-align:center;padding:16px;">لا توجد بيانات</td></tr>`
        : orders
            .map((order) => {
              return `
                <tr>
                  <td>${sanitizeExportValue(order.order_number)}</td>
                  <td>${sanitizeExportValue(order.invoice_number)}</td>
                  <td>${sanitizeExportValue(order.customer_name)}</td>
                  <td>${sanitizeExportValue(formatPaymentMethod(order.payment_method))}</td>
                  <td>${order.total.toFixed(2)} ر.س</td>
                  <td>${order.cost_total.toFixed(2)} ر.س</td>
                  <td>${order.profit_total.toFixed(2)} ر.س</td>
                  <td>${sanitizeExportValue(order.status)}</td>
                  <td>${sanitizeExportValue(formatDateTime(order.created_at, 'en-GB'))}</td>
                </tr>
              `
            })
            .join('')

    const topServicesHtml =
      topServices.length === 0
        ? '<p>لا توجد بيانات كافية</p>'
        : topServices
            .map(
              (item) => `
                <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;">
                  <span>${sanitizeExportValue(item.name)}</span>
                  <span>${item.qty} | ${item.total.toFixed(2)} ر.س</span>
                </div>
              `
            )
            .join('')

    printWindow.document.write(`
      <html lang="ar" dir="rtl">
        <head>
          <title>التقارير</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 24px;
              color: #111827;
              direction: rtl;
            }
            .header {
              display:flex;
              justify-content:space-between;
              align-items:flex-start;
              margin-bottom:24px;
            }
            .title {
              font-size:28px;
              font-weight:700;
            }
            .muted {
              color:#6b7280;
              font-size:14px;
              margin-top:6px;
            }
            .box {
              border:1px solid #e5e7eb;
              border-radius:16px;
              padding:16px;
              margin-bottom:16px;
            }
            .stats {
              display:grid;
              grid-template-columns:repeat(4,1fr);
              gap:12px;
            }
            .stat {
              border:1px solid #e5e7eb;
              border-radius:14px;
              padding:12px;
            }
            .stat .label {
              font-size:13px;
              color:#64748b;
            }
            .stat .value {
              font-size:22px;
              font-weight:700;
              margin-top:8px;
            }
            table {
              width:100%;
              border-collapse:collapse;
              margin-top:12px;
            }
            th, td {
              border-bottom:1px solid #e5e7eb;
              padding:10px;
              text-align:right;
              font-size:13px;
            }
            th {
              background:#f8fafc;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">تقرير التقارير - AFEX</div>
              <div class="muted">الفترة: ${dateFrom} إلى ${dateTo}</div>
            </div>
            <div class="muted">تاريخ الطباعة: ${new Date().toLocaleString('en-GB')}</div>
          </div>

          <div class="box">
            <div class="stats">
              <div class="stat">
                <div class="label">عدد الطلبات</div>
                <div class="value">${stats.totalOrders}</div>
              </div>
              <div class="stat">
                <div class="label">إجمالي المبيعات</div>
                <div class="value">${stats.totalSales.toFixed(2)} ر.س</div>
              </div>
              <div class="stat">
                <div class="label">إجمالي التكلفة</div>
                <div class="value">${stats.totalCost.toFixed(2)} ر.س</div>
              </div>
              <div class="stat">
                <div class="label">إجمالي الربح</div>
                <div class="value">${stats.totalProfit.toFixed(2)} ر.س</div>
              </div>
            </div>
          </div>

          <div class="box">
            <h3>آخر الطلبات</h3>
            <table>
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>رقم الفاتورة</th>
                  <th>العميل</th>
                  <th>الدفع</th>
                  <th>إجمالي البيع</th>
                  <th>إجمالي التكلفة</th>
                  <th>الربح</th>
                  <th>الحالة</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>

          <div class="box">
            <h3>الخدمات الأكثر مبيعاً</h3>
            ${topServicesHtml}
          </div>

          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `)

    printWindow.document.close()
  }

  const rangeLabel =
    range === 'daily'
      ? 'تقرير يومي'
      : range === 'monthly'
        ? 'تقرير شهري'
        : range === 'yearly'
          ? 'تقرير سنوي'
          : 'تقرير مخصص'

  if (authLoading) {
    return (
      <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-6 text-slate-200">
        جارٍ التحقق من الصلاحية...
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-6 text-slate-200">
        جارٍ التحويل...
      </div>
    )
  }

  if (loading) {
    return <ReportsShellPlaceholder />
  }

  return (
    <div className="min-h-full">
      <div className="w-full space-y-6">
        {errorMessage ? (
          <AdminAlert tone="error">{errorMessage}</AdminAlert>
        ) : null}

        <section className="relative overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.045] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.24)] backdrop-blur">
          <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/15 blur-[90px]" />
          <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="text-right">
              <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">
                تحليلات AFEX
              </span>
              <h1 className="mt-4 text-3xl font-black text-white">التقارير</h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
                لوحة تحليلية لمتابعة المبيعات، الربحية، الطلبات، وأداء الخدمات ضمن الفترة المختارة.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                <span>آخر تحديث: {lastUpdated || 'لم يتم التحديث بعد'}</span>
                {roleLabel ? <span>الصلاحية: {roleLabel}</span> : null}
                <span>النطاق: {selectedBranchLabel}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {rangeOptions.map((option) => {
                const isActive = range === option.value

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRange(option.value)}
                    className={`rounded-xl px-4 py-2 text-sm font-black transition ${
                      isActive
                        ? 'border border-cyan-300/35 bg-cyan-300/10 text-cyan-100 shadow-[0_0_26px_rgba(34,211,238,0.18)]'
                        : 'border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section className="rounded-[26px] border border-white/10 bg-white/[0.035] p-4 backdrop-blur">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <label className="block text-right">
              <span className="mb-2 block text-xs font-bold text-slate-500">
                من تاريخ
              </span>
              <AdminDarkDateInput
                value={dateFrom}
                onChange={setDateFrom}
                ariaLabel="من تاريخ"
              />
            </label>

            <label className="block text-right">
              <span className="mb-2 block text-xs font-bold text-slate-500">
                إلى تاريخ
              </span>
              <AdminDarkDateInput
                value={dateTo}
                onChange={setDateTo}
                ariaLabel="إلى تاريخ"
              />
            </label>

            <label className="block text-right">
              <span className="mb-2 block text-xs font-bold text-slate-500">
                الفرع
              </span>
              {isSystemAdmin ? (
                <AdminDarkSelect
                  value={selectedBranchId}
                  disabled={loadingBranches}
                  onChange={setSelectedBranchId}
                  options={branchOptions}
                  ariaLabel="الفرع"
                />
              ) : (
                <div className="flex h-12 items-center rounded-2xl border border-white/10 bg-[#07111f] px-4 text-sm font-bold text-white">
                  {selectedBranchLabel}
                </div>
              )}
            </label>

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => fetchReportsData()}
                disabled={refreshing}
                className="h-12 rounded-2xl border border-cyan-300/30 bg-cyan-300/15 px-5 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? 'جارٍ التحديث...' : 'تطبيق'}
              </button>
              <button
                type="button"
                onClick={exportExcel}
                className="h-12 rounded-2xl border border-white/10 bg-white/[0.045] px-4 text-sm font-bold text-slate-200 transition hover:bg-white/[0.08]"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={exportPdf}
                className="h-12 rounded-2xl border border-white/10 bg-white/[0.045] px-4 text-sm font-bold text-slate-200 transition hover:bg-white/[0.08]"
              >
                PDF
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {kpiCards.map((card) => (
            <ReportKpiCard
              key={card.title}
              title={card.title}
              value={card.value}
              hint={card.hint}
              icon={card.icon}
            />
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
          <div className="min-w-0 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.045] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.22)] backdrop-blur">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="text-left">
                <p className="text-xs font-black text-emerald-300">
                  {rangeLabel}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {orders.length} طلب
                </p>
              </div>
              <div className="text-right">
                <h2 className="text-xl font-black text-white">منحنى المبيعات</h2>
                <p className="mt-1 text-sm text-slate-400">
                  قراءة سريعة لحركة المبيعات خلال الفترة
                </p>
              </div>
            </div>

            <div className="relative h-[320px] overflow-hidden rounded-3xl border border-white/[0.08] bg-[#07111f] p-5">
              <div className="absolute inset-x-5 top-10 h-px bg-white/[0.08]" />
              <div className="absolute inset-x-5 top-24 h-px bg-white/[0.08]" />
              <div className="absolute inset-x-5 top-40 h-px bg-white/[0.08]" />
              <div className="absolute inset-x-5 bottom-14 h-px bg-white/[0.08]" />
              {salesTrendPoints ? (
                <svg
                  viewBox="0 0 100 100"
                  className="absolute inset-x-5 top-10 h-[230px] w-[calc(100%-2.5rem)]"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <polyline
                    points={`${salesTrendPoints} 100,100 0,100`}
                    fill="rgba(45,212,191,0.12)"
                    stroke="none"
                  />
                  <polyline
                    points={salesTrendPoints}
                    fill="none"
                    stroke="rgba(45,212,191,0.95)"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-7 w-7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <ReportIcon type="profit" />
                    </svg>
                  </div>
                  <p className="text-sm font-black text-white">لا توجد مبيعات لعرضها</p>
                  <p className="mt-1 text-xs text-slate-500">
                    جرّب تغيير الفترة أو الفرع
                  </p>
                </div>
              )}
              <div className="absolute inset-x-5 bottom-4 flex justify-between gap-2 text-[10px] font-bold text-slate-500">
                {salesTrend.map((item) => (
                  <span key={item.key} className="truncate">
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="min-w-0 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.045] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.22)] backdrop-blur">
            <div className="mb-5 text-right">
              <h2 className="text-xl font-black text-white">توزيع الخدمات</h2>
              <p className="mt-1 text-sm text-slate-400">
                أعلى الخدمات حسب المبيعات
              </p>
            </div>

            <div className="flex flex-col items-center gap-5">
              <div
                className="relative h-48 w-48 rounded-full shadow-[0_0_50px_rgba(45,212,191,0.18)]"
                style={{ background: donutGradient }}
              >
                <div className="absolute inset-14 rounded-full border border-white/10 bg-[#07111f]" />
              </div>

              <div className="w-full space-y-3">
                {donutSegments.length > 0 ? (
                  donutSegments.map((item) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-sm"
                    >
                      <span className="font-black text-white">
                        %{item.percent.toFixed(0)}
                      </span>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-bold text-slate-300">
                          {item.name}
                        </span>
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-10 text-center text-sm text-slate-500">
                    لا توجد خدمات كافية لعرضها
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.22)] backdrop-blur">
            <div className="mb-5 flex items-center justify-between gap-3">
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">
                {orders.length} طلب
              </span>
              <div className="text-right">
                <h2 className="text-xl font-black text-white">النشاط الأخير</h2>
                <p className="mt-1 text-sm text-slate-400">
                  آخر الطلبات ضمن النتائج الحالية
                </p>
              </div>
            </div>

            {orders.length === 0 ? (
              <AdminEmptyState
                title="لا توجد بيانات في هذه الفترة"
                description="غيّر الفترة أو الفرع لعرض النتائج."
                className="bg-cyan-300/[0.035] px-4 py-14"
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    className="h-8 w-8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <ReportIcon type="orders" />
                  </svg>
                }
              />
            ) : (
              <div className="space-y-3">
                {visibleOrders.map((order) => {
                  return (
                    <div
                      key={order.id}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#07111f] px-4 py-3"
                    >
                      <div className="min-w-0 text-left">
                        <p className="text-sm font-black text-white">
                          {formatCurrency(order.total)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          تكلفة {formatCurrency(order.cost_total)} · ربح {formatCurrency(order.profit_total)}
                        </p>
                        <span
                          className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${resolveReportStatusClassName(order.status)}`}
                        >
                          {resolveReportStatusLabel(order.status)}
                        </span>
                      </div>

                      <div className="min-w-0 text-right">
                        <p className="truncate text-sm font-black text-white">
                          {order.order_number} · {order.invoice_number}
                        </p>
                        <p className="mt-1 truncate text-sm text-slate-400">
                          {order.customer_name} · {order.customer_phone}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDateTime(order.created_at, 'en-GB')} ·{' '}
                          {formatPaymentMethod(order.payment_method)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {orders.length > 5 ? (
              <button
                type="button"
                onClick={() => setShowAllOrders((current) => !current)}
                className="mt-4 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.045] text-sm font-bold text-slate-200 transition hover:bg-white/[0.08]"
              >
                {showAllOrders ? 'عرض أقل' : 'عرض المزيد'}
              </button>
            ) : null}
          </div>

          <div className="grid gap-6">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.22)] backdrop-blur">
              <div className="mb-5 text-right">
                <h2 className="text-xl font-black text-white">ملخص سريع</h2>
                <p className="mt-1 text-sm text-slate-400">
                  تفاصيل مالية وتشغيلية للفترة الحالية
                </p>
              </div>

              <div className="space-y-3">
                <DarkSummaryRow label="نوع التقرير" value={rangeLabel} />
                <DarkSummaryRow label="من تاريخ" value={dateFrom || '—'} />
                <DarkSummaryRow
                  label="إلى تاريخ"
                  value={range === 'custom' ? dateTo || '—' : 'تلقائي حسب النوع'}
                />
                <DarkSummaryRow
                  label="المبالغ المستلمة"
                  value={formatCurrency(stats.cashReceived)}
                />
                <DarkSummaryRow
                  label="المدفوع"
                  value={formatCurrency(paidAmount)}
                />
                <DarkSummaryRow
                  label="الباقي للعملاء"
                  value={formatCurrency(stats.changeForCustomers)}
                />
                <DarkSummaryRow
                  label="إجمالي الخصم"
                  value={formatCurrency(stats.totalDiscount)}
                />
                <DarkSummaryRow
                  label="إجمالي الضريبة"
                  value={formatCurrency(stats.totalTax)}
                />
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.22)] backdrop-blur">
              <div className="mb-5 flex items-center justify-between gap-3">
                <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-xs font-bold text-slate-300">
                  {rangeLabel}
                </span>
                <div className="text-right">
                  <h2 className="text-xl font-black text-white">الخدمات الأكثر مبيعاً</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    أهم العناصر خلال الفترة الحالية
                  </p>
                </div>
              </div>

              {topServices.length === 0 ? (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-10 text-center text-sm text-slate-500">
                  لا توجد بيانات كافية
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleTopServices.map((item, index) => (
                    <div
                      key={`${item.name}-${index}`}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#07111f] px-4 py-3"
                    >
                      <div className="text-left">
                        <p className="text-sm font-black text-white">
                          {formatCurrency(item.total)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          #{index + 1}
                        </p>
                      </div>

                      <div className="min-w-0 text-right">
                        <p className="truncate text-sm font-black text-white">
                          {item.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          الكمية: {item.qty}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {topServices.length > 5 ? (
                <button
                  type="button"
                  onClick={() => setShowAllServices((current) => !current)}
                  className="mt-4 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.045] text-sm font-bold text-slate-200 transition hover:bg-white/[0.08]"
                >
                  {showAllServices ? 'عرض أقل' : 'عرض المزيد'}
                </button>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

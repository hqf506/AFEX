'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdminDarkDateInput } from '@/components/admin-dark-date-input'
import { AdminDarkSelect } from '@/components/admin-dark-select'
import { useAuthState } from '@/components/auth-state-provider'
import { useAdminBranchFilter } from '@/hooks/use-admin-branch-filter'
import { usePageAccess } from '@/hooks/use-page-access'
import { ADMIN_BRANCH_FILTER_ALL } from '@/lib/admin/branch-filter'
import {
  isBranchScopedWithoutBranchId,
} from '@/lib/branch-access'
import { formatCurrency, getDateInputValue } from '@/lib/orders/format'
import {
  buildReportDateRange,
  escapeCsvValue,
  type ReportRange,
} from '@/lib/reports/core'
import {
  type SalesTrendGrouping,
  type SalesTrendRange,
  type SalesTrendRow,
} from '@/lib/reports/sales-trend'
import { canViewReportRange } from '@/lib/permissions'

type PeriodPresetKey = 'today' | 'this-week' | 'this-month' | 'custom'
type SalesTrendSortKey =
  | 'period'
  | 'ordersCount'
  | 'quantitySold'
  | 'grossSales'
  | 'averageOrderValue'
type SortDirection = 'asc' | 'desc'

function getPeriodLabel(period: PeriodPresetKey) {
  if (period === 'today') return 'اليوم'
  if (period === 'this-week') return 'هذا الأسبوع'
  if (period === 'this-month') return 'هذا الشهر'
  return 'مخصص'
}

function getGroupingLabel(grouping: SalesTrendGrouping) {
  if (grouping === 'day') return 'يومي'
  if (grouping === 'week') return 'أسبوعي'
  return 'شهري'
}

function startOfWeek(date: Date) {
  const next = new Date(date)
  const day = next.getDay()
  const diff = day === 0 ? -6 : 1 - day
  next.setDate(next.getDate() + diff)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfWeek(date: Date) {
  const next = startOfWeek(date)
  next.setDate(next.getDate() + 6)
  next.setHours(0, 0, 0, 0)
  return next
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function resolvePeriodPreset(period: PeriodPresetKey, anchorDate?: Date) {
  const baseDate = anchorDate ? new Date(anchorDate) : new Date()

  if (period === 'today') {
    const value = getDateInputValue(baseDate)
    return {
      range: 'daily' as ReportRange,
      dateFrom: value,
      dateTo: value,
    }
  }

  if (period === 'this-week') {
    return {
      range: 'custom' as ReportRange,
      dateFrom: getDateInputValue(startOfWeek(baseDate)),
      dateTo: getDateInputValue(endOfWeek(baseDate)),
    }
  }

  if (period === 'this-month') {
    return {
      range: 'monthly' as ReportRange,
      dateFrom: getDateInputValue(startOfMonth(baseDate)),
      dateTo: getDateInputValue(endOfMonth(baseDate)),
    }
  }

  const value = getDateInputValue(baseDate)
  return {
    range: 'custom' as ReportRange,
    dateFrom: value,
    dateTo: value,
  }
}

function ReportIcon({ type }: { type: string }) {
  if (type === 'orders') {
    return (
      <>
        <path d="M6 7h12l-1.2 11.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 7Z" />
        <path d="M9 7a3 3 0 0 1 6 0" />
      </>
    )
  }

  if (type === 'quantity') {
    return (
      <>
        <path d="M12 3 4 7l8 4 8-4-8-4Z" />
        <path d="M4 7v10l8 4 8-4V7" />
        <path d="M12 11v10" />
      </>
    )
  }

  if (type === 'sales') {
    return (
      <>
        <path d="M4 19h16" />
        <path d="M7 16V9" />
        <path d="M12 16V5" />
        <path d="M17 16v-4" />
      </>
    )
  }

  if (type === 'average') {
    return (
      <>
        <rect x="4" y="6" width="16" height="12" rx="2" />
        <path d="M8 10h8" />
        <path d="M8 14h4" />
      </>
    )
  }

  if (type === 'empty') {
    return (
      <>
        <path d="m4 16 5-5 4 4 7-8" />
        <path d="M14 7h6v6" />
      </>
    )
  }

  if (type === 'badge') {
    return (
      <>
        <path d="M12 3a9 9 0 1 0 9 9" />
        <path d="M12 7v5l3 2" />
        <path d="M18 3v4h4" />
      </>
    )
  }

  return (
    <>
      <path d="m4 16 5-5 4 4 7-8" />
      <path d="M14 7h6v6" />
    </>
  )
}

function IconFrame({ type }: { type: string }) {
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200 shadow-[0_0_32px_rgba(34,211,238,0.14)]">
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <ReportIcon type={type} />
      </svg>
    </div>
  )
}

function MetricCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string
  value: string
  hint: string
  icon: string
}) {
  return (
    <div className="rounded-[24px] border border-cyan-300/15 bg-white/[0.045] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.18)] backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <IconFrame type={icon} />
        <div className="min-w-0 text-left">
          <p className="text-sm font-bold text-slate-400">{title}</p>
          <p className="mt-2 truncate text-3xl font-black text-white">{value}</p>
          <p className="mt-2 text-xs font-black text-cyan-200">{hint}</p>
        </div>
      </div>
    </div>
  )
}

function SalesTrendPlaceholder() {
  return (
    <div className="min-h-full bg-[#020817] p-6 text-right text-white">
      <div className="space-y-5 rounded-[30px] border border-white/10 bg-white/[0.035] p-6 shadow-[0_28px_120px_rgba(0,0,0,0.28)]">
        <div className="min-h-[140px] animate-pulse rounded-[26px] border border-cyan-300/10 bg-white/[0.05]" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="min-h-[120px] animate-pulse rounded-[24px] border border-cyan-300/10 bg-white/[0.05]"
            />
          ))}
        </div>
        <div className="min-h-[360px] animate-pulse rounded-[26px] border border-cyan-300/10 bg-white/[0.05]" />
        <div className="min-h-[320px] animate-pulse rounded-[26px] border border-cyan-300/10 bg-white/[0.05]" />
      </div>
    </div>
  )
}

function sampleTrendLabelIndexes(length: number, maxLabels: number) {
  if (length <= maxLabels) {
    return new Set(Array.from({ length }, (_, index) => index))
  }

  if (maxLabels <= 3) {
    return new Set([0, Math.floor((length - 1) / 2), length - 1])
  }

  const indexes = new Set<number>()
  const lastIndex = Math.max(0, length - 1)

  for (let index = 0; index < maxLabels; index += 1) {
    indexes.add(Math.round((index * lastIndex) / Math.max(1, maxLabels - 1)))
  }

  return indexes
}

function shortenTrendLabel(value: string, maxLength = 12) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}...`
}

function compareTrendRows(
  left: SalesTrendRow,
  right: SalesTrendRow,
  sortKey: SalesTrendSortKey,
  sortDirection: SortDirection
) {
  const direction = sortDirection === 'asc' ? 1 : -1

  if (sortKey === 'period') {
    return left.periodKey.localeCompare(right.periodKey) * direction
  }

  const difference =
    sortKey === 'ordersCount'
      ? left.ordersCount - right.ordersCount
      : sortKey === 'quantitySold'
        ? left.quantitySold - right.quantitySold
        : sortKey === 'grossSales'
          ? left.grossSales - right.grossSales
          : left.averageOrderValue - right.averageOrderValue

  if (difference !== 0) {
    return difference * direction
  }

  return left.periodKey.localeCompare(right.periodKey)
}

function getTrendBadge(changeValue: number) {
  if (changeValue > 0) {
    return {
      label: 'صاعد',
      className: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200',
      dotClassName: 'bg-emerald-300',
      sign: '+',
    }
  }

  if (changeValue < 0) {
    return {
      label: 'منخفض',
      className: 'border-red-400/20 bg-red-500/10 text-red-200',
      dotClassName: 'bg-red-300',
      sign: '-',
    }
  }

  return {
    label: 'ثابت',
    className: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100',
    dotClassName: 'bg-cyan-300',
    sign: '',
  }
}

function getChangePercentage(changeValue: number, currentValue: number) {
  const previousValue = currentValue - changeValue

  if (previousValue <= 0) {
    return changeValue > 0 ? 100 : 0
  }

  return (changeValue / previousValue) * 100
}

export default function SalesTrendPage() {
  const authState = useAuthState()
  const access = usePageAccess(['admin', 'employee'])
  const authLoading = access.loading
  const allowed = access.allowed
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

  const initialPeriod = resolvePeriodPreset('today')
  const [period, setPeriod] = useState<PeriodPresetKey>('today')
  const [range, setRange] = useState<ReportRange>(initialPeriod.range)
  const [dateFrom, setDateFrom] = useState(initialPeriod.dateFrom)
  const [dateTo, setDateTo] = useState(initialPeriod.dateTo)
  const [trendGrouping, setTrendGrouping] =
    useState<SalesTrendGrouping>('day')
  const [sortKey, setSortKey] = useState<SalesTrendSortKey>('period')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [trendRows, setTrendRows] = useState<SalesTrendRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const requestSeqRef = useRef(0)

  const isCustomPeriod = period === 'custom'

  const trendRange = useMemo<SalesTrendRange>(() => {
    const { fromIso, toIso } = buildReportDateRange(range, dateFrom, dateTo)
    return { start: fromIso, end: toIso }
  }, [range, dateFrom, dateTo])

  const fetchSalesTrendData = useCallback(
    async (silent = false) => {
      const requestSeq = ++requestSeqRef.current
      if (!dateFrom) {
        setTrendRows([])
        setLoading(false)
        setRefreshing(false)
        return
      }

      if (silent) setRefreshing(true)
      else setLoading(true)

      setErrorMessage('')

      if (!canViewReportRange(access.userRole, trendRange.start, trendRange.end)) {
        setErrorMessage('يمكن للموظف عرض فترة لا تتجاوز 31 يومًا.')
        setTrendRows([])
        setLoading(false)
        setRefreshing(false)
        return
      }

      if (isBranchScopedWithoutBranchId(scopeType, branchId)) {
        setTrendRows([])
        setLastUpdated(new Date().toLocaleTimeString('ar-SA'))
        setLoading(false)
        setRefreshing(false)
        return
      }

      if (!tenantId) {
        setTrendRows([])
        setLastUpdated(new Date().toLocaleTimeString('ar-SA'))
        setLoading(false)
        setRefreshing(false)
        return
      }

      const params = new URLSearchParams({
        type: 'trend', range, dateFrom, dateTo, grouping: trendGrouping,
      })
      if (effectiveBranchId) params.set('branchId', effectiveBranchId)
      const response = await fetch(
        `/api/admin/reports/sales-performance?${params.toString()}`,
        { cache: 'no-store' }
      )
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; trendRows?: SalesTrendRow[] }
        | null
      if (requestSeqRef.current !== requestSeq) return

      if (!response.ok || !payload?.success) {
        setErrorMessage('تعذر تحميل التقرير. تحقق من الاتصال ثم حاول مرة أخرى.')
        setTrendRows([])
        setLoading(false)
        setRefreshing(false)
        return
      }

      setTrendRows(Array.isArray(payload.trendRows) ? payload.trendRows : [])
      setLastUpdated(new Date().toLocaleTimeString('ar-SA'))
      setLoading(false)
      setRefreshing(false)
    },
    [
      dateFrom,
      access.userRole,
      scopeType,
      branchId,
      effectiveBranchId,
      trendRange,
      trendGrouping,
      range,
      dateTo,
      tenantId,
    ]
  )

  useEffect(() => {
    if (!allowed) return

    const timeoutId = window.setTimeout(() => {
      void fetchSalesTrendData()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [allowed, fetchSalesTrendData])

  const sortedTrendRows = useMemo(() => {
    return [...trendRows].sort((left, right) =>
      compareTrendRows(left, right, sortKey, sortDirection)
    )
  }, [trendRows, sortKey, sortDirection])

  const chartRows = useMemo(() => trendRows, [trendRows])

  const visibleChartRows = useMemo(() => {
    return chartRows.slice(-14)
  }, [chartRows])

  const visibleChartLabelIndexes = useMemo(() => {
    return sampleTrendLabelIndexes(visibleChartRows.length, 3)
  }, [visibleChartRows.length])

  const maxChartValue = useMemo(() => {
    return visibleChartRows.reduce(
      (maxValue, row) => Math.max(maxValue, row.grossSales),
      0
    )
  }, [visibleChartRows])

  const highestChartRow = useMemo(() => {
    if (visibleChartRows.length === 0) return null

    return visibleChartRows.reduce((bestRow, row) =>
      row.grossSales > bestRow.grossSales ? row : bestRow
    )
  }, [visibleChartRows])

  const activeDaysCount = useMemo(() => {
    return visibleChartRows.filter((row) => row.grossSales > 0).length
  }, [visibleChartRows])

  const hasChartData = useMemo(() => {
    return chartRows.some((row) => row.grossSales > 0)
  }, [chartRows])

  const totalOrdersCount = useMemo(() => {
    return trendRows.reduce((sum, row) => sum + row.ordersCount, 0)
  }, [trendRows])

  const totalQuantitySold = useMemo(() => {
    return trendRows.reduce((sum, row) => sum + row.quantitySold, 0)
  }, [trendRows])

  const totalGrossSales = useMemo(() => {
    return trendRows.reduce((sum, row) => sum + row.grossSales, 0)
  }, [trendRows])

  const averageOrderValue = useMemo(() => {
    return totalOrdersCount > 0 ? totalGrossSales / totalOrdersCount : 0
  }, [totalGrossSales, totalOrdersCount])

  const lowestChartRow = useMemo(() => {
    const activeRows = visibleChartRows.filter((row) => row.grossSales > 0)

    if (activeRows.length === 0) return null

    return activeRows.reduce((lowestRow, row) =>
      row.grossSales < lowestRow.grossSales ? row : lowestRow
    )
  }, [visibleChartRows])

  const averagePeriodSales = useMemo(() => {
    return trendRows.length > 0 ? totalGrossSales / trendRows.length : 0
  }, [totalGrossSales, trendRows.length])

  const salesGrowthPercentage = useMemo(() => {
    const activeRows = trendRows.filter((row) => row.grossSales > 0)

    if (activeRows.length < 2) return 0

    const firstValue = activeRows[0].grossSales
    const lastValue = activeRows[activeRows.length - 1].grossSales

    if (firstValue <= 0) return lastValue > 0 ? 100 : 0

    return ((lastValue - firstValue) / firstValue) * 100
  }, [trendRows])

  const changeByPeriodKey = useMemo(() => {
    const changes = new Map<string, number>()

    trendRows.forEach((row, index) => {
      const previousRow = trendRows[index - 1]
      changes.set(
        row.periodKey,
        previousRow ? row.grossSales - previousRow.grossSales : 0
      )
    })

    return changes
  }, [trendRows])

  const metricCards = useMemo(
    () => [
      {
        title: 'عدد الفترات',
        value: trendRows.length.toString(),
        hint: getGroupingLabel(trendGrouping),
        icon: 'badge',
      },
      {
        title: 'إجمالي الطلبات',
        value: totalOrdersCount.toString(),
        hint: 'طلب',
        icon: 'orders',
      },
      {
        title: 'إجمالي الكمية المباعة',
        value: totalQuantitySold.toString(),
        hint: 'قطعة',
        icon: 'quantity',
      },
      {
        title: 'إجمالي المبيعات',
        value: formatCurrency(totalGrossSales),
        hint: getPeriodLabel(period),
        icon: 'sales',
      },
      {
        title: 'متوسط قيمة الطلب',
        value: formatCurrency(averageOrderValue),
        hint: 'لكل طلب',
        icon: 'average',
      },
    ],
    [
      averageOrderValue,
      period,
      totalGrossSales,
      totalOrdersCount,
      totalQuantitySold,
      trendGrouping,
      trendRows.length,
    ]
  )

  function setPresetPeriod(nextPeriod: Exclude<PeriodPresetKey, 'custom'>) {
    const nextState = resolvePeriodPreset(nextPeriod)
    setPeriod(nextPeriod)
    setRange(nextState.range)
    setDateFrom(nextState.dateFrom)
    setDateTo(nextState.dateTo)
  }

  function handleCustomPeriod() {
    setPeriod('custom')
    setRange('custom')
  }

  function handleSortChange(nextKey: SalesTrendSortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(nextKey)
    setSortDirection(nextKey === 'period' ? 'asc' : 'desc')
  }

  function exportSalesTrendCsv() {
    const header = [
      'Period',
      'Orders Count',
      'Quantity Sold',
      'Gross Sales',
      'Avg Order Value',
    ]

    const rows = sortedTrendRows.map((row) => [
      row.periodLabel,
      row.ordersCount.toString(),
      row.quantitySold.toString(),
      row.grossSales.toFixed(2),
      row.averageOrderValue.toFixed(2),
    ])

    const csv = [header, ...rows]
      .map((row) => row.map((value) => escapeCsvValue(value)).join(','))
      .join('\n')

    const blob = new Blob([`\ufeff${csv}`], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `sales-trend-${trendGrouping}-${dateFrom}-to-${dateTo || dateFrom}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  function getSortIndicator(columnKey: SalesTrendSortKey) {
    if (sortKey !== columnKey) return '-'
    return sortDirection === 'asc' ? '↑' : '↓'
  }

  if (authLoading) {
    return (
      <div className="min-h-full bg-[#020817] p-6 text-right text-white">
        <div className="rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-6 text-sm text-slate-300">
          جارٍ التحقق من الصلاحية...
        </div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="min-h-full bg-[#020817] p-6 text-right text-white">
        <div className="rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-6 text-sm text-slate-300">
          جارٍ التحويل...
        </div>
      </div>
    )
  }

  if (loading) {
    return <SalesTrendPlaceholder />
  }

  const growthBadge = getTrendBadge(salesGrowthPercentage)

  return (
    <div className="min-h-full overflow-hidden bg-[#020817] p-4 text-right text-white sm:p-6">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#020817]">
        <div className="absolute right-[-12%] top-[-20%] h-[420px] w-[420px] rounded-full bg-cyan-400/15 blur-[120px]" />
        <div className="absolute bottom-[-18%] left-[-10%] h-[520px] w-[520px] rounded-full bg-teal-300/10 blur-[150px]" />
      </div>

      <div className="w-full max-w-none space-y-5 rounded-[32px] border border-white/10 bg-white/[0.025] p-4 shadow-[0_28px_140px_rgba(0,0,0,0.34)] backdrop-blur sm:p-6">
        {errorMessage ? (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-[28px] border border-cyan-300/15 bg-gradient-to-br from-white/[0.07] via-white/[0.035] to-cyan-300/[0.035] p-5 shadow-[0_24px_100px_rgba(0,0,0,0.25)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <IconFrame type="sales" />
              <div>
                <div className="mb-2 inline-flex rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-200">
                  تحليل الاتجاه
                </div>
                <h1 className="text-3xl font-black tracking-tight text-white">
                  اتجاه المبيعات
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
                  عرض مبسط يوضح حركة المبيعات خلال الفترة الحالية مع قراءة سريعة للذروة والنمو ومتوسط الأداء.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-cyan-300/15 bg-black/20 px-4 py-3 text-sm font-semibold text-slate-300">
                آخر تحديث:{' '}
                <span className="font-black text-cyan-200">
                  {lastUpdated || '-'}
                </span>
                {refreshing ? (
                  <span className="mr-2 text-xs text-emerald-200">
                    جارٍ التحديث...
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[26px] border border-cyan-300/15 bg-white/[0.035] p-5 shadow-[0_22px_80px_rgba(0,0,0,0.2)]">
          <div data-responsive-filters className="grid gap-4 xl:grid-cols-[minmax(180px,0.9fr)_minmax(360px,1.5fr)_minmax(170px,0.75fr)_minmax(165px,0.7fr)_minmax(165px,0.7fr)_auto] xl:items-end">
            <div>
              <label className="mb-2 block text-xs font-bold text-slate-400">
                الفرع
              </label>
              {isSystemAdmin ? (
                <AdminDarkSelect
                  value={selectedBranchId}
                  onChange={setSelectedBranchId}
                  disabled={loadingBranches}
                  options={[
                    { value: ADMIN_BRANCH_FILTER_ALL, label: 'كل الفروع' },
                    ...branches.map((branch) => ({
                      value: branch.id,
                      label: branch.name,
                    })),
                  ]}
                  ariaLabel="الفرع"
                />
              ) : (
                <div className="flex h-12 items-center rounded-2xl border border-cyan-300/10 bg-[#06111f] px-4 text-sm font-semibold text-slate-400">
                  الفرع الحالي
                </div>
              )}
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold text-slate-400">
                الفترة
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['today', 'اليوم'],
                  ['this-week', 'الأسبوع'],
                  ['this-month', 'الشهر'],
                  ['custom', 'مخصص'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      key === 'custom'
                        ? handleCustomPeriod()
                        : setPresetPeriod(key as Exclude<PeriodPresetKey, 'custom'>)
                    }
                    className={`h-12 rounded-2xl border px-4 text-sm font-black transition ${
                      period === key
                        ? 'border-cyan-300/70 bg-cyan-300/15 text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.16)]'
                        : 'border-white/10 bg-black/15 text-slate-300 hover:border-cyan-300/25 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold text-slate-400">
                التجميع الزمني
              </label>
              <AdminDarkSelect
                value={trendGrouping}
                onChange={(nextValue) =>
                  setTrendGrouping(nextValue as SalesTrendGrouping)
                }
                options={[
                  { value: 'day', label: 'يومي' },
                  { value: 'week', label: 'أسبوعي' },
                  { value: 'month', label: 'شهري' },
                ]}
                ariaLabel="التجميع الزمني"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold text-slate-400">
                من تاريخ
              </label>
              <AdminDarkDateInput
                value={dateFrom}
                onChange={setDateFrom}
                disabled={!isCustomPeriod}
                ariaLabel="من تاريخ"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold text-slate-400">
                إلى تاريخ
              </label>
              <AdminDarkDateInput
                value={dateTo}
                onChange={setDateTo}
                disabled={!isCustomPeriod}
                ariaLabel="إلى تاريخ"
              />
            </div>

            <div className="flex flex-wrap items-end gap-2 xl:justify-end">
              <button
                type="button"
                onClick={() => void fetchSalesTrendData()}
                className="h-12 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-5 text-sm font-black text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-300/15 active:scale-[0.98]"
              >
                تحديث
              </button>
              <button
                type="button"
                onClick={exportSalesTrendCsv}
                disabled={sortedTrendRows.length === 0}
                className="h-12 rounded-2xl border border-white/10 bg-black/20 px-5 text-sm font-black text-white transition hover:border-cyan-300/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                تصدير CSV
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {metricCards.map((card) => (
            <MetricCard key={card.title} {...card} />
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.8fr)]">
          <div className="rounded-[26px] border border-cyan-300/15 bg-white/[0.035] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.2)]">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-white">اتجاه المبيعات</h2>
                <p className="mt-1 text-sm text-slate-400">
                  حركة المبيعات حسب التجميع الزمني المحدد.
                </p>
              </div>
              <div className="flex rounded-2xl border border-white/10 bg-black/20 p-1 text-xs font-bold text-slate-400">
                <span className="rounded-xl px-4 py-2">خطي</span>
                <span className="rounded-xl border border-cyan-300/40 bg-cyan-300/15 px-4 py-2 text-cyan-100">
                  أعمدة
                </span>
              </div>
            </div>

            {hasChartData ? (
              <div data-responsive-chart className="min-w-0 overflow-hidden">
                <div className="w-full min-w-0">
                  <div className="relative flex h-72 items-end gap-2 overflow-hidden rounded-[24px] border border-cyan-300/10 bg-[#040c18] px-4 py-5">
                    <div className="pointer-events-none absolute inset-x-4 top-6 h-px bg-white/10" />
                    <div className="pointer-events-none absolute inset-x-4 top-1/3 h-px bg-white/10" />
                    <div className="pointer-events-none absolute inset-x-4 top-2/3 h-px bg-white/10" />
                    {visibleChartRows.map((row) => {
                      const heightPercentage =
                        maxChartValue > 0
                          ? Math.max((row.grossSales / maxChartValue) * 100, 0)
                          : 0
                      const isMaxValue =
                        maxChartValue > 0 && row.grossSales === maxChartValue
                      const barHeight =
                        row.grossSales > 0
                          ? `${Math.max(heightPercentage, 10)}%`
                          : '5px'

                      return (
                        <div
                          key={row.periodKey}
                          className="relative z-10 flex min-w-0 flex-1 flex-col items-center justify-end"
                        >
                          {isMaxValue && row.grossSales > 0 ? (
                            <span className="mb-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[10px] font-black text-cyan-100">
                              الأعلى
                            </span>
                          ) : null}
                          <div
                            className={`w-full rounded-t-2xl transition ${
                              row.grossSales > 0
                                ? isMaxValue
                                  ? 'bg-gradient-to-t from-cyan-500 via-cyan-300 to-white shadow-[0_0_32px_rgba(34,211,238,0.25)]'
                                  : 'bg-gradient-to-t from-cyan-700 via-cyan-400 to-cyan-200'
                                : 'bg-white/10'
                            }`}
                            style={{ height: barHeight }}
                            aria-label={`${row.periodLabel}: ${formatCurrency(
                              row.grossSales
                            )}`}
                          />
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-3 flex items-start gap-2">
                    {visibleChartRows.map((row, index) => (
                      <div
                        key={`${row.periodKey}-label`}
                        className="min-w-0 flex-1 text-center"
                      >
                        {visibleChartLabelIndexes.has(index) ? (
                          <span className="text-xs font-semibold text-slate-500">
                            {shortenTrendLabel(row.periodLabel)}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[24px] border border-dashed border-cyan-300/15 bg-black/20 px-6 py-10 text-center">
                <IconFrame type="empty" />
                <h3 className="mt-4 text-lg font-black text-white">
                  لا توجد بيانات اتجاه المبيعات خلال الفترة الحالية
                </h3>
                <p className="mt-2 text-sm text-slate-400">
                  جرّب تغيير الفترة أو التجميع الزمني لعرض نتائج مختلفة.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-[26px] border border-cyan-300/15 bg-white/[0.035] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.2)]">
            <h2 className="text-xl font-black text-white">ملخص الاتجاه</h2>
            <p className="mt-1 text-sm text-slate-400">
              قراءة مختصرة لأبرز نقاط الحركة.
            </p>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs font-bold text-slate-400">
                  أعلى فترة مبيعات
                </p>
                <p className="mt-2 text-lg font-black text-white">
                  {highestChartRow
                    ? formatCurrency(highestChartRow.grossSales)
                    : '-'}
                </p>
                <p className="mt-1 text-xs font-semibold text-cyan-200">
                  {highestChartRow?.periodLabel ?? 'لا توجد بيانات'}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs font-bold text-slate-400">
                  أقل فترة مبيعات
                </p>
                <p className="mt-2 text-lg font-black text-white">
                  {lowestChartRow ? formatCurrency(lowestChartRow.grossSales) : '-'}
                </p>
                <p className="mt-1 text-xs font-semibold text-cyan-200">
                  {lowestChartRow?.periodLabel ?? 'لا توجد بيانات'}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs font-bold text-slate-400">نمو المبيعات</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-lg font-black text-white">
                    {growthBadge.sign}
                    {Math.abs(salesGrowthPercentage).toFixed(1)}%
                  </span>
                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black ${growthBadge.className}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${growthBadge.dotClassName}`}
                    />
                    {growthBadge.label}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs font-bold text-slate-400">
                  مقارنة بالمتوسط
                </p>
                <p className="mt-2 text-lg font-black text-white">
                  {formatCurrency(averagePeriodSales)}
                </p>
                <p className="mt-1 text-xs font-semibold text-cyan-200">
                  متوسط كل فترة
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs font-bold text-slate-400">
                  الفترات النشطة
                </p>
                <p className="mt-2 text-lg font-black text-white">
                  {activeDaysCount}
                </p>
                <p className="mt-1 text-xs font-semibold text-cyan-200">
                  من آخر {visibleChartRows.length} فترة ظاهرة
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[26px] border border-cyan-300/15 bg-white/[0.035] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.2)]">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-white">
                جدول اتجاه المبيعات
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {getPeriodLabel(period)} - {getGroupingLabel(trendGrouping)} -{' '}
                {trendRows.length} فترات
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-slate-300">
              النطاق:{' '}
              <span className="text-cyan-200">
                {dateFrom} إلى {dateTo}
              </span>
            </div>
          </div>

          {trendRows.length === 0 ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[24px] border border-dashed border-cyan-300/15 bg-black/20 px-6 py-10 text-center">
              <IconFrame type="empty" />
              <h3 className="mt-4 text-lg font-black text-white">
                لا توجد بيانات اتجاه المبيعات خلال الفترة الحالية
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                جرّب تغيير الفترة أو التجميع الزمني.
              </p>
            </div>
          ) : (
            <div className="hidden overflow-x-auto rounded-[24px] border border-white/10 xl:block">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="bg-white/[0.045] text-xs font-black text-slate-400">
                    <th className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleSortChange('period')}
                        className={`inline-flex items-center gap-2 transition ${
                          sortKey === 'period'
                            ? 'text-cyan-100'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <span>الفترة</span>
                        <span aria-hidden="true">{getSortIndicator('period')}</span>
                      </button>
                    </th>
                    <th className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleSortChange('ordersCount')}
                        className={`inline-flex items-center gap-2 transition ${
                          sortKey === 'ordersCount'
                            ? 'text-cyan-100'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <span>عدد الطلبات</span>
                        <span aria-hidden="true">
                          {getSortIndicator('ordersCount')}
                        </span>
                      </button>
                    </th>
                    <th className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleSortChange('quantitySold')}
                        className={`inline-flex items-center gap-2 transition ${
                          sortKey === 'quantitySold'
                            ? 'text-cyan-100'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <span>الكمية المباعة</span>
                        <span aria-hidden="true">
                          {getSortIndicator('quantitySold')}
                        </span>
                      </button>
                    </th>
                    <th className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleSortChange('grossSales')}
                        className={`inline-flex items-center gap-2 transition ${
                          sortKey === 'grossSales'
                            ? 'text-cyan-100'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <span>إجمالي المبيعات</span>
                        <span aria-hidden="true">
                          {getSortIndicator('grossSales')}
                        </span>
                      </button>
                    </th>
                    <th className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleSortChange('averageOrderValue')}
                        className={`inline-flex items-center gap-2 transition ${
                          sortKey === 'averageOrderValue'
                            ? 'text-cyan-100'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <span>متوسط الطلب</span>
                        <span aria-hidden="true">
                          {getSortIndicator('averageOrderValue')}
                        </span>
                      </button>
                    </th>
                    <th className="px-4 py-4 text-right">النمو</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTrendRows.map((row) => {
                    const changeValue = changeByPeriodKey.get(row.periodKey) ?? 0
                    const changePercentage = getChangePercentage(
                      changeValue,
                      row.grossSales
                    )
                    const badge = getTrendBadge(changeValue)
                    const salesShare =
                      totalGrossSales > 0
                        ? (row.grossSales / totalGrossSales) * 100
                        : 0

                    return (
                      <tr
                        key={row.periodKey}
                        className="border-t border-white/10 transition hover:bg-cyan-300/[0.04]"
                      >
                        <td className="px-4 py-4 font-black text-white">
                          {row.periodLabel}
                        </td>
                        <td className="px-4 py-4 font-semibold text-slate-300">
                          {row.ordersCount}
                        </td>
                        <td className="px-4 py-4 font-semibold text-slate-300">
                          {row.quantitySold}
                        </td>
                        <td className="px-4 py-4">
                          <div className="min-w-[160px]">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-black text-white">
                                {formatCurrency(row.grossSales)}
                              </span>
                              <span className="text-xs font-bold text-cyan-200">
                                {salesShare.toFixed(1)}%
                              </span>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full bg-gradient-to-l from-cyan-200 to-teal-400"
                                style={{
                                  width: `${Math.max(
                                    row.grossSales > 0 ? 5 : 0,
                                    Math.min(salesShare, 100)
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 font-semibold text-slate-300">
                          {formatCurrency(row.averageOrderValue)}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black ${badge.className}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${badge.dotClassName}`}
                            />
                            {badge.sign}
                            {Math.abs(changePercentage).toFixed(1)}% -{' '}
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

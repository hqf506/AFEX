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
  type SalesByCategoryRow,
} from '@/lib/reports/core'
import { canViewReportRange } from '@/lib/permissions'

type PeriodPresetKey = 'today' | 'this-week' | 'this-month' | 'custom'
type SalesByCategorySortKey =
  | 'categoryName'
  | 'quantitySold'
  | 'grossSales'
  | 'totalCost'
  | 'profit'
  | 'ordersCount'

type SortDirection = 'asc' | 'desc'

function getPeriodLabel(period: PeriodPresetKey) {
  if (period === 'today') return 'اليوم'
  if (period === 'this-week') return 'هذا الأسبوع'
  if (period === 'this-month') return 'هذا الشهر'
  return 'مخصص'
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
  if (type === 'quantity') {
    return (
      <>
        <path d="M6 7h12l-1.2 11.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 7Z" />
        <path d="M9 7a3 3 0 0 1 6 0" />
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

  if (type === 'profit') {
    return (
      <>
        <path d="m4 16 5-5 4 4 7-8" />
        <path d="M14 7h6v6" />
      </>
    )
  }

  if (type === 'empty') {
    return (
      <>
        <path d="M12 3 4 7l8 4 8-4-8-4Z" />
        <path d="M4 7v10l8 4 8-4V7" />
        <path d="M12 11v10" />
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
      <path d="M3 12h18" />
      <path d="M12 3v18" />
      <path d="M5.5 5.5 18.5 18.5" />
      <path d="M18.5 5.5 5.5 18.5" />
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

function Placeholder() {
  return (
    <div className="min-h-full bg-[#020817] p-6 text-right text-white">
      <div className="space-y-5 rounded-[30px] border border-white/10 bg-white/[0.035] p-6 shadow-[0_28px_120px_rgba(0,0,0,0.28)]">
        <div className="min-h-[140px] animate-pulse rounded-[26px] border border-cyan-300/10 bg-white/[0.05]" />
      <div className="mt-5 grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
              className="min-h-[120px] animate-pulse rounded-[24px] border border-cyan-300/10 bg-white/[0.05]"
          />
        ))}
      </div>
        <div className="mt-5 min-h-[280px] animate-pulse rounded-[26px] border border-cyan-300/10 bg-white/[0.05]" />
        <div className="mt-5 min-h-[320px] animate-pulse rounded-[26px] border border-cyan-300/10 bg-white/[0.05]" />
      </div>
    </div>
  )
}

function EmptyCategoriesState() {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[24px] border border-dashed border-cyan-300/20 bg-cyan-300/[0.035] px-6 py-10 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
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
          <ReportIcon type="empty" />
        </svg>
      </div>
      <p className="text-base font-black text-white">
        لا توجد بيانات كافية للفترة المحددة.
      </p>
      <p className="mt-2 text-sm text-slate-500">
        جرّب تغيير الفترة أو الفرع لعرض نتائج أكثر.
      </p>
    </div>
  )
}

function getRankBadge(rank: number) {
  if (rank === 1) return '01'
  if (rank === 2) return '02'
  if (rank === 3) return '03'
  return String(rank)
}

export default function SalesByCategoryPage() {
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
  const [categoryRows, setCategoryRows] = useState<SalesByCategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [sortKey, setSortKey] = useState<SalesByCategorySortKey>('grossSales')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [showAllCategories, setShowAllCategories] = useState(false)
  const requestSeqRef = useRef(0)

  const isCustomPeriod = period === 'custom'

  const fetchData = useCallback(
    async (silent = false) => {
      const requestSeq = ++requestSeqRef.current
      if (!dateFrom) {
        setCategoryRows([])
        setLoading(false)
        setRefreshing(false)
        return
      }

      if (silent) setRefreshing(true)
      else setLoading(true)
      setErrorMessage('')

      if (isBranchScopedWithoutBranchId(scopeType, branchId)) {
        setCategoryRows([])
        setLastUpdated(new Date().toLocaleTimeString('ar-SA'))
        setLoading(false)
        setRefreshing(false)
        return
      }

      if (!tenantId) {
        setCategoryRows([])
        setLastUpdated(new Date().toLocaleTimeString('ar-SA'))
        setLoading(false)
        setRefreshing(false)
        return
      }

      const { fromIso, toIso } = buildReportDateRange(range, dateFrom, dateTo)

      if (!canViewReportRange(access.userRole, fromIso, toIso)) {
        setErrorMessage('يمكن للموظف عرض فترة لا تتجاوز 31 يومًا.')
        setCategoryRows([])
        setLoading(false)
        setRefreshing(false)
        return
      }

      const params = new URLSearchParams({
        type: 'category', range, dateFrom, dateTo,
      })
      if (effectiveBranchId) params.set('branchId', effectiveBranchId)
      const response = await fetch(
        `/api/admin/reports/sales-performance?${params.toString()}`,
        { cache: 'no-store' }
      )
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; categoryRows?: SalesByCategoryRow[] }
        | null
      if (requestSeqRef.current !== requestSeq) return

      if (!response.ok || !payload?.success) {
        setErrorMessage('تعذر تحميل التقرير. تحقق من الاتصال ثم حاول مرة أخرى.')
        setCategoryRows([])
        setLoading(false)
        setRefreshing(false)
        return
      }

      setCategoryRows(
        Array.isArray(payload.categoryRows) ? payload.categoryRows : []
      )
      setLastUpdated(new Date().toLocaleTimeString('ar-SA'))
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
      void fetchData()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [allowed, fetchData])

  const sortedCategoryRows = useMemo(() => {
    const directionFactor = sortDirection === 'asc' ? 1 : -1
    return [...categoryRows].sort((left, right) => {
      let comparison = 0
      if (sortKey === 'categoryName') {
        comparison = left.categoryName.localeCompare(right.categoryName)
      } else {
        comparison = left[sortKey] - right[sortKey]
      }
      if (comparison !== 0) return comparison * directionFactor
      return left.categoryName.localeCompare(right.categoryName)
    })
  }, [categoryRows, sortDirection, sortKey])

  const topRows = useMemo(
    () => [...categoryRows].sort((a, b) => b.grossSales - a.grossSales || b.profit - a.profit),
    [categoryRows]
  )

  const visibleTopRows = useMemo(
    () => (showAllCategories ? topRows : topRows.slice(0, 5)),
    [showAllCategories, topRows]
  )

  const totalQuantitySold = useMemo(
    () => categoryRows.reduce((sum, row) => sum + row.quantitySold, 0),
    [categoryRows]
  )
  const totalGrossSales = useMemo(
    () => categoryRows.reduce((sum, row) => sum + row.grossSales, 0),
    [categoryRows]
  )
  const totalProfit = useMemo(
    () => categoryRows.reduce((sum, row) => sum + row.profit, 0),
    [categoryRows]
  )

  const rankByCategoryKey = useMemo(() => {
    const rankMap = new Map<string, number>()
    topRows.forEach((row, index) => {
      rankMap.set(row.categoryKey || row.categoryName || `category-${index}`, index + 1)
    })
    return rankMap
  }, [topRows])

  const metricCards = useMemo(
    () => [
      {
        title: 'عدد الفئات',
        value: categoryRows.length.toString(),
        hint: 'فئة',
        icon: 'categories',
      },
      {
        title: 'إجمالي الكمية المباعة',
        value: totalQuantitySold.toString(),
        hint: 'قطعة',
        icon: 'quantity',
      },
      {
        title: 'إجمالي البيع',
        value: formatCurrency(totalGrossSales),
        hint: getPeriodLabel(period),
        icon: 'sales',
      },
      {
        title: 'إجمالي الربح',
        value: formatCurrency(totalProfit),
        hint: 'ربح تقديري',
        icon: 'profit',
      },
    ],
    [categoryRows.length, period, totalGrossSales, totalProfit, totalQuantitySold]
  )

  function getCategoryShare(rowGrossSales: number) {
    if (!Number.isFinite(totalGrossSales) || totalGrossSales <= 0) return 0
    return Math.min(100, Math.max(0, (rowGrossSales / totalGrossSales) * 100))
  }

  function getCategoryStatus(rowGrossSales: number) {
    if (rowGrossSales <= 0) {
      return {
        label: 'بدون مبيعات',
        className: 'border-red-400/20 bg-red-500/10 text-red-200',
        dotClassName: 'bg-red-300',
      }
    }

    return {
      label: 'نشطة',
      className: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200',
      dotClassName: 'bg-emerald-300',
    }
  }

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

  function handleSortChange(nextSortKey: SalesByCategorySortKey) {
    setSortKey((currentSortKey) => {
      if (currentSortKey === nextSortKey) {
        setSortDirection((currentDirection) =>
          currentDirection === 'asc' ? 'desc' : 'asc'
        )
        return currentSortKey
      }

      setSortDirection(nextSortKey === 'categoryName' ? 'asc' : 'desc')
      return nextSortKey
    })
  }

  function getSortIndicator(columnKey: SalesByCategorySortKey) {
    if (sortKey !== columnKey) return '·'
    return sortDirection === 'asc' ? '↑' : '↓'
  }

  function exportCsv() {
    if (sortedCategoryRows.length === 0) return

    const headers = [
      'الفئة',
      'إجمالي الكمية',
      'إجمالي البيع',
      'إجمالي التكلفة',
      'الربح',
      'عدد الطلبات',
    ]

    const rows = sortedCategoryRows.map((row) => [
      row.categoryName || '—',
      row.quantitySold,
      row.grossSales.toFixed(2),
      row.totalCost.toFixed(2),
      row.profit.toFixed(2),
      row.ordersCount,
    ])

    const csvContent = [
      headers.map(escapeCsvValue).join(','),
      ...rows.map((row) => row.map(escapeCsvValue).join(',')),
    ].join('\n')

    const filePeriod = period.replace(/[^a-z0-9-]/gi, '-')
    const blob = new Blob(['\ufeff' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    })

    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `sales-by-category-${filePeriod}-${dateFrom}-to-${dateTo}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  if (authLoading) {
    return (
      <div className="min-h-full bg-[#020817] p-6 text-right">
        <div className="rounded-[26px] border border-white/10 bg-white/[0.045] px-6 py-8 text-sm font-bold text-slate-300">
          جارٍ التحقق من الصلاحية...
        </div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="min-h-full bg-[#020817] p-6 text-right">
        <div className="rounded-[26px] border border-white/10 bg-white/[0.045] px-6 py-8 text-sm font-bold text-slate-300">
          جارٍ التحويل...
        </div>
      </div>
    )
  }

  if (loading) return <Placeholder />

  return (
    <div className="min-h-full overflow-hidden bg-[#020817] p-4 text-right text-white sm:p-6">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute right-[-12%] top-[-10%] h-[360px] w-[360px] rounded-full bg-cyan-400/15 blur-[100px]" />
        <div className="absolute bottom-[-12%] left-[-10%] h-[420px] w-[420px] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <div className="w-full max-w-none space-y-5 rounded-[32px] border border-white/10 bg-white/[0.025] p-4 shadow-[0_28px_140px_rgba(0,0,0,0.34)] backdrop-blur sm:p-6">
        {errorMessage ? (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-100">
            {errorMessage}
          </div>
        ) : null}

        <section className="relative overflow-hidden rounded-[28px] border border-cyan-300/15 bg-[#07111f]/90 p-5 shadow-[0_24px_100px_rgba(0,0,0,0.28)]">
          <div className="absolute left-8 top-8 h-28 w-28 rounded-full bg-cyan-300/10 blur-3xl" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <IconFrame type="badge" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-black tracking-tight text-white md:text-3xl">
                    المبيعات حسب الفئة
                  </h1>
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">
                    تحليل الفئات
                  </span>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
                  نظرة مفصلة على أداء الفئات والمبيعات خلال الفترة الحالية.
                </p>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 self-start rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm font-bold text-slate-300 lg:self-auto">
              <span className="text-cyan-200">آخر تحديث:</span>
              <span dir="ltr">{lastUpdated || '—'}</span>
              {refreshing ? <span className="text-cyan-200">جارٍ التحديث...</span> : null}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.20)] backdrop-blur">
          <div data-responsive-filters className="grid gap-4 xl:grid-cols-[minmax(0,260px)_minmax(0,1fr)_minmax(0,180px)_minmax(0,180px)_auto] xl:items-end">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400">الفرع</label>
              {isSystemAdmin ? (
                <AdminDarkSelect
                  value={selectedBranchId}
                  onChange={setSelectedBranchId}
                  disabled={loadingBranches}
                  options={[
                    { value: ADMIN_BRANCH_FILTER_ALL, label: 'كل الفروع' },
                    ...branches.map((branch) => ({
                      value: branch.id,
                      label: `${branch.name}${!branch.is_active ? ' - معطل' : ''}`,
                    })),
                  ]}
                  ariaLabel="الفرع"
                />
              ) : (
                <div className="flex h-12 items-center rounded-2xl border border-white/10 bg-[#050b16] px-4 text-right text-sm font-bold text-slate-400">
                  الفرع الحالي
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400">الفترة</label>
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-[#050b16] p-1 sm:grid-cols-4">
                {(['today', 'this-week', 'this-month'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setPresetPeriod(preset)}
                    className={`h-10 rounded-xl px-4 text-sm font-black transition ${
                      period === preset
                        ? 'bg-cyan-300 text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.22)]'
                        : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    {preset === 'today'
                      ? 'اليوم'
                      : preset === 'this-week'
                        ? 'الأسبوع'
                        : 'الشهر'}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleCustomPeriod}
                  className={`h-10 rounded-xl px-4 text-sm font-black transition ${
                    period === 'custom'
                      ? 'bg-cyan-300 text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.22)]'
                      : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  مخصص
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400">من تاريخ</label>
              <AdminDarkDateInput
                value={dateFrom}
                onChange={setDateFrom}
                disabled={!isCustomPeriod}
                ariaLabel="من تاريخ"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400">إلى تاريخ</label>
              <AdminDarkDateInput
                value={dateTo}
                onChange={setDateTo}
                disabled={!isCustomPeriod}
                ariaLabel="إلى تاريخ"
              />
            </div>

            <div className="flex items-end justify-end gap-2 xl:justify-start">
              <button
                type="button"
                onClick={() => void fetchData()}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] px-5 text-sm font-black text-white transition hover:border-cyan-300/25 hover:bg-white/[0.08]"
              >
                تحديث
              </button>
              <button
                type="button"
                onClick={exportCsv}
                disabled={sortedCategoryRows.length === 0}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-5 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                تصدير CSV
              </button>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-4">
          {metricCards.map((metric) => (
            <MetricCard
              key={metric.title}
              title={metric.title}
              value={metric.value}
              hint={metric.hint}
              icon={metric.icon}
            />
          ))}
        </div>

        <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.20)] backdrop-blur">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-white">الفئات الأكثر مبيعاً</h2>
              <p className="mt-1 text-sm text-slate-500">
                أفضل الفئات خلال {getPeriodLabel(period)} مرتبة حسب إجمالي البيع.
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs font-black text-slate-300">
              {topRows.length} فئة
            </span>
          </div>

          {topRows.length === 0 ? (
            <EmptyCategoriesState />
          ) : (
            <>
              <div data-responsive-report-cards className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {visibleTopRows.map((row, index) => {
                  const rank = index + 1
                  const share = getCategoryShare(row.grossSales)
                  return (
                    <div
                      key={row.categoryKey || `category-${rank}`}
                      className="rounded-[22px] border border-white/10 bg-[#07111f]/80 p-4 transition hover:border-cyan-300/20 hover:bg-white/[0.055]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-black text-white">
                            {row.categoryName || 'بدون فئة محددة'}
                          </p>
                          <p className="mt-1 text-xs font-bold text-slate-500">
                            {row.ordersCount} طلب
                          </p>
                        </div>
                        <span className="rounded-xl border border-cyan-300/15 bg-cyan-300/10 px-2.5 py-1 text-xs font-black text-cyan-100">
                          {getRankBadge(rank)}
                        </span>
                      </div>
                      <p className="mt-5 text-2xl font-black text-white">
                        {formatCurrency(row.grossSales)}
                      </p>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.08]">
                        <div
                          className="h-full rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.35)]"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs font-bold text-slate-500">
                        <span>{share.toFixed(1)}%</span>
                        <span>{row.quantitySold} قطعة</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {topRows.length > 5 ? (
                <div className="mt-5 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowAllCategories((current) => !current)}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm font-bold text-slate-200 transition hover:bg-white/[0.08]"
                  >
                    {showAllCategories ? 'عرض أقل ↑' : 'عرض كل الفئات ↓'}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.20)] backdrop-blur">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-white">جدول الفئات</h2>
              <p className="mt-1 text-sm text-slate-500">
                مرجع تفصيلي لكل الفئات ضمن النتائج الحالية.
              </p>
            </div>
            <div className="hidden items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm font-bold text-slate-300 md:flex">
              <span className="text-slate-500">النطاق</span>
              <span dir="ltr">{dateFrom} → {dateTo}</span>
            </div>
          </div>

          {categoryRows.length === 0 ? (
            <EmptyCategoriesState />
          ) : (
            <div className="hidden overflow-hidden rounded-[24px] border border-white/10 bg-[#07111f]/80 xl:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px] text-[15px]">
                  <thead className="border-b border-white/10 bg-[#091424]">
                    <tr className="text-slate-400">
                      {[
                        ['categoryName', 'الفئة'],
                        ['ordersCount', 'عدد الطلبات'],
                        ['quantitySold', 'الكمية المباعة'],
                        ['grossSales', 'إجمالي المبيعات'],
                        ['profit', 'الربح'],
                        ['grossSales', 'النسبة من الإجمالي'],
                        ['grossSales', 'ترتيب المبيعات'],
                        ['grossSales', 'الحالة'],
                      ].map(([key, label]) => (
                        <th key={`${key}-${label}`} className="px-4 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleSortChange(key as SalesByCategorySortKey)}
                            className={`inline-flex items-center gap-1 font-semibold transition ${
                              sortKey === key ? 'text-cyan-100' : 'hover:text-white'
                            }`}
                          >
                            <span>{label}</span>
                            <span className="text-xs text-slate-500">
                              {getSortIndicator(key as SalesByCategorySortKey)}
                            </span>
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.08]">
                    {sortedCategoryRows.map((row, index) => {
                      const key = row.categoryKey || row.categoryName || `category-${index}`
                      const share = getCategoryShare(row.grossSales)
                      const rank = rankByCategoryKey.get(key) ?? index + 1
                      const status = getCategoryStatus(row.grossSales)

                      return (
                      <tr
                        key={key}
                        className="transition hover:bg-cyan-300/[0.035]"
                      >
                        <td className="px-4 py-4 font-black text-white">
                          {row.categoryName || 'بدون فئة محددة'}
                        </td>
                        <td className="px-4 py-4 font-bold text-slate-300">{row.ordersCount}</td>
                        <td className="px-4 py-4 font-bold text-slate-300">{row.quantitySold}</td>
                        <td className="px-4 py-4 font-black text-white">{formatCurrency(row.grossSales)}</td>
                        <td className="px-4 py-4 font-bold text-slate-200">{formatCurrency(row.profit)}</td>
                        <td className="px-4 py-4">
                          <div className="flex min-w-[160px] items-center gap-3">
                            <span className="w-12 text-xs font-black text-slate-300">
                              {share.toFixed(1)}%
                            </span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                              <div
                                className="h-full rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.35)]"
                                style={{ width: `${share}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] px-2 text-xs font-black text-cyan-100">
                            {getRankBadge(rank)}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black ${status.className}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${status.dotClassName}`} />
                            {status.label}
                          </span>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

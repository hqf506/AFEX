'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminBranchFilter } from '@/components/admin-branch-filter'
import { useAuthState } from '@/components/auth-state-provider'
import { getRoleLabel } from '@/lib/app-roles'
import { useAdminBranchFilter } from '@/hooks/use-admin-branch-filter'
import { usePageAccess } from '@/hooks/use-page-access'
import {
  isBranchScopedWithoutBranchId,
  shouldFilterByBranch,
} from '@/lib/branch-access'
import {
  buildReportDateRange,
  mapOrderSourceRowToReportOrderRecord,
  type ReportOrderRecord,
  type ReportRange,
} from '@/lib/reports/core'
import { buildPreviousComparisonRange } from '@/lib/reports/comparison'
import { buildExecutiveDashboardData } from '@/lib/reports/executive-dashboard'
import { type OrderSourceRow } from '@/lib/orders/normalize'
import { formatCurrency, getDateInputValue } from '@/lib/orders/format'
import { supabase } from '@/lib/supabase/client'
import { applyTenantFilter } from '@/lib/tenant-filter'

type PeriodPresetKey =
  | 'today'
  | 'yesterday'
  | 'this-week'
  | 'this-month'
  | 'last-7-days'
  | 'last-30-days'

function getPeriodLabel(period: PeriodPresetKey) {
  if (period === 'today') return 'اليوم'
  if (period === 'yesterday') return 'الأمس'
  if (period === 'this-week') return 'هذا الأسبوع'
  if (period === 'this-month') return 'هذا الشهر'
  if (period === 'last-7-days') return 'آخر 7 أيام'
  return 'آخر 30 يوماً'
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
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

  if (period === 'yesterday') {
    const target = addDays(baseDate, -1)
    const value = getDateInputValue(target)
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

  if (period === 'last-7-days') {
    return {
      range: 'custom' as ReportRange,
      dateFrom: getDateInputValue(addDays(baseDate, -6)),
      dateTo: getDateInputValue(baseDate),
    }
  }

  return {
    range: 'custom' as ReportRange,
    dateFrom: getDateInputValue(addDays(baseDate, -29)),
    dateTo: getDateInputValue(baseDate),
  }
}

function filterOrdersByRange(
  orders: ReportOrderRecord[],
  range: { start: string; end: string }
) {
  const start = new Date(range.start)
  const end = new Date(range.end)

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start > end
  ) {
    return []
  }

  const startMs = start.getTime()
  const endMs = end.getTime()

  return orders.filter((order) => {
    const createdAt = new Date(order.created_at)

    if (Number.isNaN(createdAt.getTime())) {
      return false
    }

    const createdAtMs = createdAt.getTime()
    return createdAtMs >= startMs && createdAtMs <= endMs
  })
}

function getDisplayText(value: string, fallback: string) {
  const normalized = value.trim()
  if (!normalized || normalized === '?' || normalized === '???') {
    return fallback
  }
  return normalized
}

function resolveDashboardOrderStatusLabel(status: ReportOrderRecord['status']) {
  if (status === 'in_progress') return 'قيد التنفيذ'
  if (status === 'ready') return 'جاهز'
  if (status === 'closed') return 'مكتمل'
  return 'غير محدد'
}

function resolveDashboardOrderStatusBadgeClassName(
  status: ReportOrderRecord['status']
) {
  if (status === 'in_progress') return 'bg-amber-300/10 text-amber-200'
  if (status === 'ready') return 'bg-cyan-300/10 text-cyan-200'
  if (status === 'closed') return 'bg-emerald-300/10 text-emerald-200'
  return 'bg-slate-300/10 text-slate-300'
}

function resolveGrowthPercent(current: number, previous: number) {
  if (previous <= 0) {
    return current > 0 ? '+100%' : '+0%'
  }

  const value = ((current - previous) / previous) * 100
  const prefix = value >= 0 ? '+' : ''
  return `${prefix}${value.toFixed(1)}%`
}

function buildLineChartPoints(values: number[]) {
  if (values.length === 0) return ''

  const maxValue = Math.max(...values, 1)
  const step = values.length > 1 ? 100 / (values.length - 1) : 100

  return values
    .map((value, index) => {
      const x = index * step
      const y = 100 - (value / maxValue) * 82 - 8
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

function DashboardIcon({ type }: { type: string }) {
  if (type === 'sales') {
    return (
      <path d="M5 6h2l1.4 9.2a2 2 0 0 0 2 1.8h5.8a2 2 0 0 0 1.9-1.4L20 9H8" />
    )
  }

  if (type === 'orders') {
    return (
      <>
        <rect x="6" y="4" width="12" height="16" rx="2" />
        <path d="M9 9h6M9 13h6M9 17h4" />
      </>
    )
  }

  if (type === 'customers') {
    return (
      <>
        <circle cx="12" cy="9" r="3" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>
    )
  }

  return <path d="M4 12h4l2-6 4 12 2-6h4" />
}

type KpiCardProps = {
  title: string
  value: string
  growth: string
  icon: string
}

function KpiCard({ title, value, growth, icon }: KpiCardProps) {
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
            <DashboardIcon type={icon} />
          </svg>
        </div>
        <div className="min-w-0 text-left">
          <p className="text-sm font-bold text-slate-400">{title}</p>
          <p className="mt-2 text-3xl font-black text-white">{value}</p>
          <p className="mt-2 text-xs font-black text-emerald-300">
            {growth} عن الفترة السابقة
          </p>
        </div>
      </div>
    </div>
  )
}

function ExecutiveDashboardPlaceholder() {
  return (
    <div className="min-h-full rounded-[30px] border border-white/10 bg-white/[0.035] p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="h-28 animate-pulse rounded-[28px] bg-white/[0.06]" />
        <div className="grid gap-6 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-[24px] bg-white/[0.06]"
            />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-80 animate-pulse rounded-[28px] bg-white/[0.06]" />
          <div className="h-80 animate-pulse rounded-[28px] bg-white/[0.06]" />
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const authState = useAuthState()
  const access = usePageAccess(['admin'])
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
  } = useAdminBranchFilter(scopeType, branchId, allowed)

  const initialPeriod = resolvePeriodPreset('today')
  const [period, setPeriod] = useState<PeriodPresetKey>('today')
  const [range, setRange] = useState<ReportRange>(initialPeriod.range)
  const [dateFrom, setDateFrom] = useState(initialPeriod.dateFrom)
  const [dateTo, setDateTo] = useState(initialPeriod.dateTo)
  const [orders, setOrders] = useState<ReportOrderRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')

  const currentRange = useMemo(() => {
    const { fromIso, toIso } = buildReportDateRange(range, dateFrom, dateTo)

    return {
      start: fromIso,
      end: toIso,
    }
  }, [range, dateFrom, dateTo])

  const previousRange = useMemo(() => {
    return buildPreviousComparisonRange(currentRange)
  }, [currentRange])

  const combinedRange = useMemo(() => {
    return {
      start: previousRange.start || currentRange.start,
      end: currentRange.end,
    }
  }, [currentRange.end, currentRange.start, previousRange.start])

  const fetchDashboardData = useCallback(
    async (silent = false) => {
      if (!dateFrom) {
        setOrders([])
        setLoading(false)
        setRefreshing(false)
        return
      }

      if (silent) setRefreshing(true)
      else setLoading(true)

      setErrorMessage('')

      if (isBranchScopedWithoutBranchId(scopeType, branchId)) {
        setOrders([])
        setLastUpdated(new Date().toLocaleTimeString('en-GB'))
        setLoading(false)
        setRefreshing(false)
        return
      }

      if (!tenantId) {
        setOrders([])
        setLastUpdated(new Date().toLocaleTimeString('en-GB'))
        setLoading(false)
        setRefreshing(false)
        return
      }

      let query = supabase
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
              item_type_snapshot,
              item_category_snapshot,
              quantity,
              unit_price,
              line_total
            )
          )
        `)
        .gte('created_at', combinedRange.start)
        .lte('created_at', combinedRange.end)
        .order('created_at', { ascending: false })

      query = applyTenantFilter(query, tenantId)

      if (shouldFilterByBranch(scopeType, branchId)) {
        query = query.eq('branch_id', branchId as string)
      } else if (effectiveBranchId) {
        query = query.eq('branch_id', effectiveBranchId)
      }

      const { data, error } = await query

      if (error) {
        setErrorMessage(`تعذر تحميل لوحة التحكم: ${error.message}`)
        setOrders([])
        setLoading(false)
        setRefreshing(false)
        return
      }

      const normalized = Array.isArray(data)
        ? data.map((row, index) =>
            mapOrderSourceRowToReportOrderRecord(row as OrderSourceRow, index)
          )
        : []

      setOrders(normalized)
      setLastUpdated(new Date().toLocaleTimeString('en-GB'))
      setLoading(false)
      setRefreshing(false)
    },
    [
      dateFrom,
      combinedRange.end,
      combinedRange.start,
      scopeType,
      branchId,
      effectiveBranchId,
      tenantId,
    ]
  )

  useEffect(() => {
    if (!allowed) return

    const timeoutId = window.setTimeout(() => {
      void fetchDashboardData()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [allowed, fetchDashboardData])

  const currentOrders = useMemo(() => {
    return filterOrdersByRange(orders, currentRange)
  }, [orders, currentRange])

  const previousOrders = useMemo(() => {
    if (!previousRange.start || !previousRange.end) {
      return []
    }

    return filterOrdersByRange(orders, previousRange)
  }, [orders, previousRange])

  const dashboardData = useMemo(() => {
    return buildExecutiveDashboardData(currentOrders, {
      range,
      dateFrom,
      dateTo,
      trendGrouping: 'day',
      topLimit: 5,
    })
  }, [currentOrders, range, dateFrom, dateTo])

  const previousDashboardData = useMemo(() => {
    return buildExecutiveDashboardData(previousOrders, {
      range,
      dateFrom,
      dateTo,
      trendGrouping: 'day',
      topLimit: 5,
    })
  }, [previousOrders, range, dateFrom, dateTo])

  const uniqueCustomersCount = useMemo(() => {
    return new Set(
      currentOrders
        .map((order) => getDisplayText(order.customer_name, ''))
        .filter(Boolean)
    ).size
  }, [currentOrders])

  const activeOrdersCount = useMemo(() => {
    return currentOrders.filter((order) => order.status !== 'closed').length
  }, [currentOrders])

  const previousUniqueCustomersCount = useMemo(() => {
    return new Set(
      previousOrders
        .map((order) => getDisplayText(order.customer_name, ''))
        .filter(Boolean)
    ).size
  }, [previousOrders])

  const previousActiveOrdersCount = useMemo(() => {
    return previousOrders.filter((order) => order.status !== 'closed').length
  }, [previousOrders])

  const recentOrders = useMemo(() => {
    return currentOrders.slice(0, 5)
  }, [currentOrders])

  const salesTrendPoints = useMemo(() => {
    return buildLineChartPoints(
      dashboardData.trend.map((item) => item.grossSales)
    )
  }, [dashboardData.trend])

  const categoryTotal = useMemo(() => {
    return dashboardData.topCategories.reduce(
      (sum, item) => sum + item.grossSales,
      0
    )
  }, [dashboardData.topCategories])

  const donutSegments = useMemo(() => {
    const colors = ['#2dd4bf', '#22d3ee', '#0ea5e9', '#155e75', '#334155']
    const topCategories = dashboardData.topCategories.slice(0, 5)

    return topCategories.map((item, index) => {
      const percent =
        categoryTotal > 0 ? (item.grossSales / categoryTotal) * 100 : 0
      const start = topCategories
        .slice(0, index)
        .reduce((sum, previousItem) => {
          return (
            sum +
            (categoryTotal > 0
              ? (previousItem.grossSales / categoryTotal) * 100
              : 0)
          )
        }, 0)

      const segment = {
        ...item,
        percent,
        color: colors[index] || colors[colors.length - 1],
        start,
        end: start + percent,
      }

      return segment
    })
  }, [categoryTotal, dashboardData.topCategories])

  const donutGradient = useMemo(() => {
    if (donutSegments.length === 0) {
      return 'conic-gradient(rgba(45,212,191,0.18) 0 100%)'
    }

    return `conic-gradient(${donutSegments
      .map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`)
      .join(', ')})`
  }, [donutSegments])

  const performanceChartData = useMemo(() => {
    const items = [
      {
        key: 'sales',
        label: 'المبيعات',
        value: dashboardData.summary.totalSales,
        displayValue: formatCurrency(dashboardData.summary.totalSales),
        barClassName: 'bg-black',
      },
      {
        key: 'orders',
        label: 'الطلبات',
        value: dashboardData.summary.totalOrders,
        displayValue: dashboardData.summary.totalOrders.toString(),
        barClassName: 'bg-slate-300',
      },
      {
        key: 'customers',
        label: 'العملاء',
        value: uniqueCustomersCount,
        displayValue: uniqueCustomersCount.toString(),
        barClassName: 'bg-slate-300',
      },
    ]

    const maxValue = Math.max(...items.map((item) => item.value), 0)

    return {
      maxValue,
      items: items.map((item) => ({
        ...item,
        heightPercentage:
          maxValue > 0 ? Math.max(16, (item.value / maxValue) * 100) : 0,
      })),
    }
  }, [
    dashboardData.summary.totalOrders,
    dashboardData.summary.totalSales,
    uniqueCustomersCount,
  ])

  const statCards = useMemo(
    () => [
      {
        title: 'المبيعات',
        value: formatCurrency(dashboardData.summary.totalSales),
        growth: resolveGrowthPercent(
          dashboardData.summary.totalSales,
          previousDashboardData.summary.totalSales
        ),
        icon: 'sales',
      },
      {
        title: 'عدد الطلبات',
        value: dashboardData.summary.totalOrders.toString(),
        growth: resolveGrowthPercent(
          dashboardData.summary.totalOrders,
          previousDashboardData.summary.totalOrders
        ),
        icon: 'orders',
      },
      {
        title: 'العملاء',
        value: uniqueCustomersCount.toString(),
        growth: resolveGrowthPercent(
          uniqueCustomersCount,
          previousUniqueCustomersCount
        ),
        icon: 'customers',
      },
      {
        title: 'الطلبات النشطة',
        value: activeOrdersCount.toString(),
        growth: resolveGrowthPercent(
          activeOrdersCount,
          previousActiveOrdersCount
        ),
        icon: 'active',
      },
    ],
    [
      dashboardData.summary.totalOrders,
      dashboardData.summary.totalSales,
      previousDashboardData.summary.totalOrders,
      previousDashboardData.summary.totalSales,
      uniqueCustomersCount,
      activeOrdersCount,
      previousUniqueCustomersCount,
      previousActiveOrdersCount,
    ]
  )

  if (authLoading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 text-slate-200">
        جارٍ التحقق من الصلاحية...
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 text-slate-200">
        جارٍ التحويل...
      </div>
    )
  }

  if (loading) {
    return <ExecutiveDashboardPlaceholder />
  }

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-7xl space-y-6">
        {errorMessage ? (
          <div className="rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-100">
            {errorMessage}
          </div>
        ) : null}

        <div className="rounded-[30px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_28px_110px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="text-right">
            <h1 className="text-4xl font-black text-white">لوحة التحكم</h1>
            <p className="mt-2 text-sm text-slate-300">
              مرحبًا بك في نظام AFEX
            </p>
            <p className="mt-3 text-xs font-semibold text-slate-500">
              آخر تحديث: {lastUpdated || '—'}
              {refreshing ? ' • جارٍ التحديث...' : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { key: 'today' as const, label: 'اليوم' },
              { key: 'this-week' as const, label: 'الأسبوع' },
              { key: 'this-month' as const, label: 'الشهر' },
            ].map((option) => {
              const isActive = period === option.key

              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    const nextState = resolvePeriodPreset(option.key)
                    setPeriod(option.key)
                    setRange(nextState.range)
                    setDateFrom(nextState.dateFrom)
                    setDateTo(nextState.dateTo)
                  }}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
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
        </div>

        <div className="flex flex-col gap-3 rounded-[24px] border border-white/10 bg-white/[0.035] p-4 backdrop-blur lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
            <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-slate-200">
              الفترة: {getPeriodLabel(period)}
            </span>
            {roleLabel ? (
              <span className="rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-cyan-100">
                الصلاحية: {roleLabel}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {isSystemAdmin ? (
              <AdminBranchFilter
                branches={branches}
                selectedBranchId={selectedBranchId}
                loading={loadingBranches}
                onChange={setSelectedBranchId}
                label="الفرع"
                allLabel="كل الفروع"
                className="min-w-[220px]"
              />
            ) : null}

            <button
              type="button"
              onClick={() => void fetchDashboardData(true)}
              className="rounded-xl border border-white/10 bg-white/[0.045] px-4 py-2 text-sm font-bold text-white transition hover:bg-white/[0.08]"
            >
              تحديث البيانات
            </button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <KpiCard
              key={card.title}
              title={card.title}
              value={card.value}
              growth={card.growth}
              icon={card.icon}
            />
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.9fr_0.95fr]">
          <div className="min-w-0 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.045] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.2)] backdrop-blur xl:col-span-1">
            <div className="mb-5 text-right">
              <h2 className="text-xl font-black text-white">نظرة الأداء</h2>
              <p className="mt-1 text-sm text-slate-400">
                مقارنة المبيعات خلال الفترة
              </p>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-3">
              {performanceChartData.items.map((item) => (
                <div
                  key={item.key}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-2"
                >
                  <p className="truncate text-xs text-slate-500">{item.label}</p>
                  <p className="mt-1 truncate text-sm font-black text-white">
                    {item.displayValue}
                  </p>
                </div>
              ))}
            </div>

            <div className="relative h-[300px] overflow-hidden rounded-3xl border border-white/[0.08] bg-[#07111f] p-5">
              <div className="absolute inset-x-5 top-10 h-px bg-white/[0.08]" />
              <div className="absolute inset-x-5 top-24 h-px bg-white/[0.08]" />
              <div className="absolute inset-x-5 top-40 h-px bg-white/[0.08]" />
              <div className="absolute inset-x-5 bottom-14 h-px bg-white/[0.08]" />
              {salesTrendPoints ? (
                <svg
                  viewBox="0 0 100 100"
                  className="absolute inset-x-5 top-10 h-[210px] w-[calc(100%-2.5rem)]"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <polyline
                    points={salesTrendPoints}
                    fill="none"
                    stroke="rgba(45,212,191,0.95)"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points={`${salesTrendPoints} 100,100 0,100`}
                    fill="rgba(45,212,191,0.12)"
                    stroke="none"
                  />
                </svg>
              ) : (
                <div className="flex h-full items-center justify-center text-sm font-bold text-slate-500">
                  لا توجد بيانات كافية لعرض الأداء
                </div>
              )}
              <div className="absolute inset-x-5 bottom-4 flex justify-between gap-2 text-[10px] font-bold text-slate-500">
                {dashboardData.trend.slice(0, 7).map((item) => (
                  <span key={item.periodKey} className="truncate">
                    {item.periodLabel.slice(5)}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="min-w-0 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.045] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.2)] backdrop-blur">
            <div className="mb-5 text-right">
              <h2 className="text-xl font-black text-white">توزيع المبيعات حسب الفئة</h2>
              <p className="mt-1 text-sm text-slate-400">
                نسبة المبيعات لكل فئة
              </p>
            </div>

            <div className="flex flex-col items-center gap-5">
              <div
                className="relative h-44 w-44 rounded-full shadow-[0_0_45px_rgba(45,212,191,0.16)]"
                style={{ background: donutGradient }}
              >
                <div className="absolute inset-12 rounded-full border border-white/10 bg-[#07111f]" />
              </div>

              <div className="w-full space-y-3">
                {donutSegments.length > 0 ? (
                  donutSegments.map((item) => (
                    <div key={item.categoryKey} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="font-bold text-slate-300">
                          {getDisplayText(item.categoryName, 'أخرى')}
                        </span>
                      </div>
                      <span className="font-black text-white">
                        %{item.percent.toFixed(0)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-8 text-center text-sm text-slate-500">
                    لا توجد فئات لعرضها
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="min-w-0 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.045] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.2)] backdrop-blur">
            <div className="mb-4 flex items-center justify-between gap-3">
              <Link
                href="/admin/orders"
                className="text-sm font-bold text-cyan-200 transition hover:text-cyan-100"
              >
                عرض الكل
              </Link>
              <div className="text-right">
                <h2 className="text-xl font-black text-white">آخر الطلبات</h2>
                <p className="mt-1 text-sm text-slate-400">
                  آخر 5 طلبات ضمن الفترة الحالية
                </p>
              </div>
            </div>

            <div className="max-w-full space-y-3 overflow-hidden">
              {recentOrders.length > 0 ? (
                recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex max-w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#07111f] px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3 overflow-hidden">
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${resolveDashboardOrderStatusBadgeClassName(order.status)}`}
                      >
                        {resolveDashboardOrderStatusLabel(order.status)}
                      </span>
                      <div className="min-w-0 text-left">
                        <div className="truncate text-sm font-black text-white">
                          {formatCurrency(order.total)}
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0 overflow-hidden text-right">
                      <div className="truncate text-sm font-black text-white">
                        {getDisplayText(order.order_number, 'طلب بدون رقم')}
                      </div>
                      <div className="mt-1 truncate text-sm text-slate-400">
                        {getDisplayText(order.customer_name, 'عميل بدون اسم')}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/[0.08] bg-[#07111f] px-4 py-10 text-center text-sm text-slate-500">
                  لا توجد طلبات لعرضها حالياً
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.2)] backdrop-blur">
          <div className="mb-5 text-right">
            <h2 className="text-xl font-black text-white">إجراءات سريعة</h2>
            <p className="mt-1 text-sm text-slate-400">
              الوصول السريع لأهم العمليات
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                href: '/admin/catalog',
                label: 'إضافة منتج',
                description: 'إضافة عنصر جديد للمخزون',
                icon: 'orders',
              },
              {
                href: '/pos',
                label: 'فتح POS',
                description: 'الانتقال لنقطة البيع',
                icon: 'sales',
              },
              {
                href: '/pos/sale/customer',
                label: 'إنشاء طلب',
                description: 'بدء طلب جديد للعميل',
                icon: 'orders',
              },
              {
                href: '/admin/reports',
                label: 'تقرير المبيعات',
                description: 'عرض تقارير المبيعات',
                icon: 'active',
              },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="group flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#07111f] px-5 py-4 text-right transition hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:shadow-[0_18px_50px_rgba(34,211,238,0.12)]"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200 transition group-hover:scale-105">
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
                    <DashboardIcon type={action.icon} />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-black text-white">
                    {action.label}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {action.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

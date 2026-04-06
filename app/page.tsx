'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdminBranchFilter } from '@/components/admin-branch-filter'
import { AdminButton } from '@/components/admin-button'
import { AdminInput } from '@/components/admin-input'
import { AdminSelect } from '@/components/admin-select'
import { PageHeader } from '@/components/page-header'
import { useAdminBranchFilter } from '@/hooks/use-admin-branch-filter'
import { usePageAccess } from '@/hooks/use-page-access'
import { SummaryRow } from '@/components/summary-row'
import {
  isBranchScopedWithoutBranchId,
  shouldFilterByBranch,
} from '@/lib/branch-access'
import {
  buildReportDateRange,
  buildReportOrderSummary,
  escapeCsvValue,
  mapOrderSourceRowToReportOrderRecord,
  type ReportOrderRecord,
  type ReportRange,
} from '@/lib/orders/reports'
import { type OrderSourceRow } from '@/lib/orders/normalize'
import { supabase } from '@/lib/supabase/client'
import { useSystemSettings } from '@/hooks/use-system-settings'

type Role = 'admin' | 'employee' | 'cashier'
type WorkspaceKey =
  | 'home'
  | 'dashboard'
  | 'catalog'
  | 'whatsapp'
  | 'customers'
  | 'orders'
  | 'reports'
  | 'users'
  | 'branches'
  | 'invoice'
  | 'settings'

type SidebarItem = {
  key: WorkspaceKey
  label: string
  path?: string
  roles: Role[]
  enabled?: boolean
}

type QuickAction = {
  key: WorkspaceKey
  label: string
  primary?: boolean
}

type ReportsSubmenuKey =
  | 'sales-summary'
  | 'sales-by-item'
  | 'sales-by-category'
  | 'sales-by-employee'
  | 'sales-by-payment'
  | 'receipts'
  | 'sales-by-editor'
  | 'discounts'
  | 'taxes'

type ReportPresetKey =
  | 'today'
  | 'yesterday'
  | 'this-week'
  | 'this-month'
  | 'custom'

type DatePickerPresetKey =
  | 'today'
  | 'yesterday'
  | 'this-week'
  | 'last-week'
  | 'this-month'
  | 'last-month'
  | 'last-7-days'
  | 'last-30-days'
  | 'custom'

type EmployeeOption = {
  id: string
  full_name: string | null
  username: string | null
  role: string | null
  is_active: boolean
  branch_id: string | null
}

type SalesSummaryDayRow = {
  dateKey: string
  dateLabel: string
  totalSales: number
  refunds: number
  discounts: number
  netSales: number
  cogs: number
  grossProfit: number
  ordersCount: number
}

type SalesSummaryCard = {
  title: string
  value: number
  note: string
}

type SalesChartType = 'area' | 'bar'
type SalesChartGrouping = 'days' | 'weeks' | 'months'
type ChartHoverState = {
  key: string
  x: number
  y: number
  label: string
  value: number
  color: string
}

const highlights = [
  'واتساب تلقائي للعملاء',
  'طباعة حرارية مباشرة',
  'تتبع حالات الطلبات',
  'دفع كاش / شبكة / تحويل',
]

const reportsSubmenuItems: Array<{
  key: ReportsSubmenuKey
  label: string
}> = [
  { key: 'sales-summary', label: 'ملخص المبيعات' },
  { key: 'sales-by-item', label: 'المبيعات حسب العنصر' },
  { key: 'sales-by-category', label: 'المبيعات حسب الفئة' },
  { key: 'sales-by-employee', label: 'المبيعات حسب الموظف' },
  { key: 'sales-by-payment', label: 'المبيعات حسب نوع الدفع' },
  { key: 'receipts', label: 'الإيصالات' },
  { key: 'sales-by-editor', label: 'المبيعات حسب المُعدّل' },
  { key: 'discounts', label: 'الخصومات' },
  { key: 'taxes', label: 'الضرائب' },
]

function getDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function addMonths(date: Date, amount: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + amount)
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

function parseDateValue(value: string) {
  return new Date(`${value}T12:00:00`)
}

function formatSar(value: number) {
  return new Intl.NumberFormat('ar-SA', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0)
}

function formatCompactSar(value: number) {
  return new Intl.NumberFormat('ar-SA', {
    style: 'currency',
    currency: 'SAR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value || 0)
}

function formatTooltipSar(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0)
}

function formatTooltipArabicRiyal(value: number) {
  const formatted = new Intl.NumberFormat('ar-SA', {
    maximumFractionDigits: 0,
  }).format(value || 0)

  return `${formatted} ريال`
}

function formatArabicDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  return new Intl.DateTimeFormat('ar-SA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function formatChartDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  return new Intl.DateTimeFormat('ar-SA', {
    day: 'numeric',
    month: 'short',
  }).format(date)
}

function formatShortArabicDate(value: string | Date) {
  const date =
    typeof value === 'string' ? new Date(`${value}T12:00:00`) : new Date(value)

  return new Intl.DateTimeFormat('ar-SA', {
    day: '2-digit',
    month: 'long',
  }).format(date)
}

function getPresetLabel(preset: ReportPresetKey) {
  if (preset === 'today') return 'اليوم بالكامل'
  if (preset === 'yesterday') return 'أمس'
  if (preset === 'this-week') return 'هذا الأسبوع'
  if (preset === 'this-month') return 'هذا الشهر'
  return 'فترة مخصصة'
}

function getDatePickerPresetLabel(preset: DatePickerPresetKey) {
  if (preset === 'today') return 'اليوم'
  if (preset === 'yesterday') return 'البارحة'
  if (preset === 'this-week') return 'هذا الأسبوع'
  if (preset === 'last-week') return 'الأسبوع الماضي'
  if (preset === 'this-month') return 'هذا الشهر'
  if (preset === 'last-month') return 'الشهر الماضي'
  if (preset === 'last-7-days') return 'آخر 7 أيام'
  if (preset === 'last-30-days') return 'آخر 30 يومًا'
  return 'فترة مخصصة'
}

function getDateRangeTriggerLabel(preset: DatePickerPresetKey) {
  if (preset === 'today') return 'اليوم'
  if (preset === 'this-week') return 'هذا الأسبوع'
  if (preset === 'this-month') return 'هذا الشهر'
  return 'فترة مخصصة'
}

function formatDateRangeLabel(dateFrom: string, dateTo: string) {
  if (!dateFrom) return 'اختر نطاق التاريخ'

  if (!dateTo || dateFrom === dateTo) {
    return formatArabicDate(dateFrom)
  }

  return `${formatShortArabicDate(dateFrom)} - ${formatShortArabicDate(dateTo)}`
}

function resolvePresetState(preset: ReportPresetKey, anchorDate?: string) {
  const baseDate = anchorDate ? parseDateValue(anchorDate) : new Date()

  if (preset === 'today') {
    const value = getDateInputValue(baseDate)
    return {
      range: 'daily' as ReportRange,
      dateFrom: value,
      dateTo: value,
    }
  }

  if (preset === 'yesterday') {
    const target = addDays(baseDate, -1)
    const value = getDateInputValue(target)
    return {
      range: 'daily' as ReportRange,
      dateFrom: value,
      dateTo: value,
    }
  }

  if (preset === 'this-week') {
    return {
      range: 'custom' as ReportRange,
      dateFrom: getDateInputValue(startOfWeek(baseDate)),
      dateTo: getDateInputValue(endOfWeek(baseDate)),
    }
  }

  if (preset === 'this-month') {
    return {
      range: 'monthly' as ReportRange,
      dateFrom: getDateInputValue(startOfMonth(baseDate)),
      dateTo: getDateInputValue(endOfMonth(baseDate)),
    }
  }

  return {
    range: 'custom' as ReportRange,
    dateFrom: getDateInputValue(baseDate),
    dateTo: getDateInputValue(baseDate),
  }
}

function resolveDatePickerPresetState(
  preset: DatePickerPresetKey,
  anchorDate?: string
) {
  const baseDate = anchorDate ? parseDateValue(anchorDate) : new Date()

  if (preset === 'today') {
    const value = getDateInputValue(baseDate)
    return {
      reportPreset: 'today' as ReportPresetKey,
      range: 'daily' as ReportRange,
      dateFrom: value,
      dateTo: value,
    }
  }

  if (preset === 'yesterday') {
    const target = addDays(baseDate, -1)
    const value = getDateInputValue(target)
    return {
      reportPreset: 'yesterday' as ReportPresetKey,
      range: 'daily' as ReportRange,
      dateFrom: value,
      dateTo: value,
    }
  }

  if (preset === 'this-week') {
    return {
      reportPreset: 'this-week' as ReportPresetKey,
      range: 'custom' as ReportRange,
      dateFrom: getDateInputValue(startOfWeek(baseDate)),
      dateTo: getDateInputValue(endOfWeek(baseDate)),
    }
  }

  if (preset === 'last-week') {
    const target = addDays(baseDate, -7)
    return {
      reportPreset: 'custom' as ReportPresetKey,
      range: 'custom' as ReportRange,
      dateFrom: getDateInputValue(startOfWeek(target)),
      dateTo: getDateInputValue(endOfWeek(target)),
    }
  }

  if (preset === 'this-month') {
    return {
      reportPreset: 'this-month' as ReportPresetKey,
      range: 'monthly' as ReportRange,
      dateFrom: getDateInputValue(startOfMonth(baseDate)),
      dateTo: getDateInputValue(endOfMonth(baseDate)),
    }
  }

  if (preset === 'last-month') {
    const target = addMonths(baseDate, -1)
    return {
      reportPreset: 'custom' as ReportPresetKey,
      range: 'monthly' as ReportRange,
      dateFrom: getDateInputValue(startOfMonth(target)),
      dateTo: getDateInputValue(endOfMonth(target)),
    }
  }

  if (preset === 'last-7-days') {
    return {
      reportPreset: 'custom' as ReportPresetKey,
      range: 'custom' as ReportRange,
      dateFrom: getDateInputValue(addDays(baseDate, -6)),
      dateTo: getDateInputValue(baseDate),
    }
  }

  if (preset === 'last-30-days') {
    return {
      reportPreset: 'custom' as ReportPresetKey,
      range: 'custom' as ReportRange,
      dateFrom: getDateInputValue(addDays(baseDate, -29)),
      dateTo: getDateInputValue(baseDate),
    }
  }

  const value = getDateInputValue(baseDate)
  return {
    reportPreset: 'custom' as ReportPresetKey,
    range: 'custom' as ReportRange,
    dateFrom: value,
    dateTo: value,
  }
}

function shiftPresetRange(
  preset: ReportPresetKey,
  dateFrom: string,
  dateTo: string,
  direction: -1 | 1
) {
  const fromDate = parseDateValue(dateFrom)
  const toDate = parseDateValue(dateTo)

  if (preset === 'today' || preset === 'yesterday') {
    const target = addDays(fromDate, direction)
    const value = getDateInputValue(target)
    return {
      range: 'daily' as ReportRange,
      dateFrom: value,
      dateTo: value,
    }
  }

  if (preset === 'this-week') {
    const target = addDays(fromDate, direction * 7)
    return {
      range: 'custom' as ReportRange,
      dateFrom: getDateInputValue(startOfWeek(target)),
      dateTo: getDateInputValue(endOfWeek(target)),
    }
  }

  if (preset === 'this-month') {
    const target = addMonths(fromDate, direction)
    return {
      range: 'monthly' as ReportRange,
      dateFrom: getDateInputValue(startOfMonth(target)),
      dateTo: getDateInputValue(endOfMonth(target)),
    }
  }

  const diffInDays = Math.max(
    1,
    Math.round(
      (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1
  )
  const nextFrom = addDays(fromDate, direction * diffInDays)
  const nextTo = addDays(toDate, direction * diffInDays)

  return {
    range: 'custom' as ReportRange,
    dateFrom: getDateInputValue(nextFrom),
    dateTo: getDateInputValue(nextTo),
  }
}

function shiftDatePickerRange(
  preset: DatePickerPresetKey,
  dateFrom: string,
  dateTo: string,
  direction: -1 | 1
) {
  const fromDate = parseDateValue(dateFrom)
  const toDate = parseDateValue(dateTo)

  if (preset === 'today' || preset === 'yesterday') {
    const target = addDays(fromDate, direction)
    const value = getDateInputValue(target)
    return {
      preset,
      reportPreset: preset,
      range: 'daily' as ReportRange,
      dateFrom: value,
      dateTo: value,
    }
  }

  if (preset === 'this-week' || preset === 'last-week') {
    const target = addDays(fromDate, direction * 7)
    return {
      preset,
      reportPreset:
        preset === 'this-week'
          ? ('this-week' as ReportPresetKey)
          : ('custom' as ReportPresetKey),
      range: 'custom' as ReportRange,
      dateFrom: getDateInputValue(startOfWeek(target)),
      dateTo: getDateInputValue(endOfWeek(target)),
    }
  }

  if (preset === 'this-month' || preset === 'last-month') {
    const target = addMonths(fromDate, direction)
    return {
      preset,
      reportPreset:
        preset === 'this-month'
          ? ('this-month' as ReportPresetKey)
          : ('custom' as ReportPresetKey),
      range: 'monthly' as ReportRange,
      dateFrom: getDateInputValue(startOfMonth(target)),
      dateTo: getDateInputValue(endOfMonth(target)),
    }
  }

  const diffInDays = Math.max(
    1,
    Math.round(
      (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1
  )
  const nextFrom = addDays(fromDate, direction * diffInDays)
  const nextTo = addDays(toDate, direction * diffInDays)

  return {
    preset,
    reportPreset: 'custom' as ReportPresetKey,
    range: 'custom' as ReportRange,
    dateFrom: getDateInputValue(nextFrom),
    dateTo: getDateInputValue(nextTo),
  }
}

function buildSalesSummaryRows(
  orders: ReportOrderRecord[],
  catalogCostMap: Record<string, number>
) {
  const rowsMap = new Map<string, SalesSummaryDayRow>()

  for (const order of orders) {
    if (!order.created_at || order.created_at === '—') continue

    const dateKey = order.created_at.slice(0, 10)
    const current = rowsMap.get(dateKey) || {
      dateKey,
      dateLabel: formatArabicDate(dateKey),
      totalSales: 0,
      refunds: 0,
      discounts: 0,
      netSales: 0,
      cogs: 0,
      grossProfit: 0,
      ordersCount: 0,
    }

    current.totalSales += order.total
    current.discounts += order.discount
    current.netSales += order.total - order.discount
    current.ordersCount += 1

    const orderCogs = order.items.reduce((sum, item) => {
      if (item.type !== 'product') return sum
      const normalizedName = normalizeItemName(item.name)
      const matchedCost = catalogCostMap[normalizedName]

      if (!Number.isFinite(matchedCost)) return sum

      return sum + matchedCost * item.quantity
    }, 0)

    current.cogs += orderCogs
    current.grossProfit += order.total - order.discount - orderCogs

    rowsMap.set(dateKey, current)
  }

  return [...rowsMap.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}

function normalizeItemName(value: string) {
  return value.trim().toLocaleLowerCase('ar')
}

function getWeekKey(value: string) {
  return getDateInputValue(startOfWeek(new Date(`${value}T12:00:00`)))
}

function getWeekLabel(value: string, endValue?: string) {
  const startDate = new Date(`${value}T12:00:00`)
  const endDate = endValue
    ? new Date(`${endValue}T12:00:00`)
    : addDays(startDate, 6)

  return `${formatShortArabicDate(value)} - ${formatShortArabicDate(endDate)}`
}

function getMonthKey(value: string) {
  return value.slice(0, 7)
}

function getMonthLabel(value: string, includeYear = false) {
  const date = new Date(`${value}-01T12:00:00`)
  return new Intl.DateTimeFormat('ar-SA', {
    month: 'long',
    ...(includeYear ? { year: 'numeric' as const } : {}),
  }).format(date)
}

function createEmptySalesSummaryRow(
  dateKey: string,
  dateLabel: string
): SalesSummaryDayRow {
  return {
    dateKey,
    dateLabel,
    totalSales: 0,
    refunds: 0,
    discounts: 0,
    netSales: 0,
    cogs: 0,
    grossProfit: 0,
    ordersCount: 0,
  }
}

function addSalesSummaryValues(
  base: SalesSummaryDayRow,
  row: SalesSummaryDayRow
): SalesSummaryDayRow {
  return {
    ...base,
    totalSales: base.totalSales + row.totalSales,
    refunds: base.refunds + row.refunds,
    discounts: base.discounts + row.discounts,
    netSales: base.netSales + row.netSales,
    cogs: base.cogs + row.cogs,
    grossProfit: base.grossProfit + row.grossProfit,
    ordersCount: base.ordersCount + row.ordersCount,
  }
}

function getGroupedPlaceholderRow(
  dateValue: string,
  grouping: SalesChartGrouping
): SalesSummaryDayRow {
  if (grouping === 'weeks') {
    return createEmptySalesSummaryRow(dateValue, getWeekLabel(dateValue))
  }

  if (grouping === 'months') {
    const key = getMonthKey(dateValue)
    return createEmptySalesSummaryRow(key, getMonthLabel(key))
  }

  return createEmptySalesSummaryRow(dateValue, formatArabicDate(dateValue))
}

function getGroupingDetailTitle(grouping: SalesChartGrouping) {
  if (grouping === 'weeks') return 'تفصيل الأسابيع'
  if (grouping === 'months') return 'تفصيل الأشهر'
  return 'تفصيل الأيام'
}

function getGroupingCountLabel(grouping: SalesChartGrouping, count: number) {
  if (grouping === 'weeks') return `${count} أسبوع`
  if (grouping === 'months') return `${count} شهر`
  return `${count} يوم`
}

function getGroupingSummaryLabel(grouping: SalesChartGrouping) {
  if (grouping === 'weeks') return 'حسب الأسابيع'
  if (grouping === 'months') return 'حسب الأشهر'
  return 'حسب الأيام'
}

function groupSalesSummaryRows(
  rows: SalesSummaryDayRow[],
  grouping: SalesChartGrouping
) {
  if (grouping === 'days') {
    return rows
  }

  const groupedMap = new Map<string, SalesSummaryDayRow>()

  for (const row of rows) {
    const key =
      grouping === 'weeks' ? getWeekKey(row.dateKey) : getMonthKey(row.dateKey)
    const label =
      grouping === 'weeks' ? getWeekLabel(key) : getMonthLabel(key)

    const current = groupedMap.get(key) || {
      dateKey: key,
      dateLabel: label,
      totalSales: 0,
      refunds: 0,
      discounts: 0,
      netSales: 0,
      cogs: 0,
      grossProfit: 0,
      ordersCount: 0,
    }

    current.totalSales += row.totalSales
    current.refunds += row.refunds
    current.discounts += row.discounts
    current.netSales += row.netSales
    current.cogs += row.cogs
    current.grossProfit += row.grossProfit
    current.ordersCount += row.ordersCount

    groupedMap.set(key, current)
  }

  return [...groupedMap.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}

function buildCompleteTimelineRows(
  rows: SalesSummaryDayRow[],
  grouping: SalesChartGrouping,
  dateFrom: string,
  dateTo: string
) {
  if (!dateFrom) return []

  const safeDateTo = dateTo || dateFrom

  if (grouping === 'days') {
    const existingMap = new Map(rows.map((row) => [row.dateKey, row]))
    const timelineRows: SalesSummaryDayRow[] = []
    let cursor = new Date(`${dateFrom}T12:00:00`)
    const end = new Date(`${safeDateTo}T12:00:00`)

    while (cursor <= end) {
      const key = getDateInputValue(cursor)
      timelineRows.push(
        existingMap.get(key) ?? createEmptySalesSummaryRow(key, formatArabicDate(key))
      )
      cursor = addDays(cursor, 1)
    }

    return timelineRows
  }

  if (grouping === 'weeks') {
    const groupedMap = new Map<string, SalesSummaryDayRow>()
    const start = new Date(`${dateFrom}T12:00:00`)
    const timelineRows: SalesSummaryDayRow[] = []
    const end = new Date(`${safeDateTo}T12:00:00`)

    for (const row of rows) {
      const currentDate = new Date(`${row.dateKey}T12:00:00`)
      const diffInDays = Math.floor(
        (currentDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
      )

      if (diffInDays < 0) continue

      const bucketStart = addDays(start, Math.floor(diffInDays / 7) * 7)
      const bucketStartKey = getDateInputValue(bucketStart)
      const bucketEnd = addDays(bucketStart, 6)
      const bucketEndKey = getDateInputValue(bucketEnd <= end ? bucketEnd : end)
      const base =
        groupedMap.get(bucketStartKey) ??
        createEmptySalesSummaryRow(
          bucketStartKey,
          getWeekLabel(bucketStartKey, bucketEndKey)
        )

      groupedMap.set(bucketStartKey, addSalesSummaryValues(base, row))
    }

    let cursor = new Date(start)

    while (cursor <= end) {
      const key = getDateInputValue(cursor)
      const bucketEnd = addDays(cursor, 6)
      const endKey = getDateInputValue(bucketEnd <= end ? bucketEnd : end)
      timelineRows.push(
        groupedMap.get(key) ??
          createEmptySalesSummaryRow(key, getWeekLabel(key, endKey))
      )
      cursor = addDays(cursor, 7)
    }

    return timelineRows
  }

  const fromDate = new Date(`${dateFrom}T12:00:00`)
  const toDate = new Date(`${safeDateTo}T12:00:00`)
  const startYear = fromDate.getFullYear()
  const endYear = toDate.getFullYear()
  const includeYear = startYear !== endYear
  const groupedMap = new Map<string, SalesSummaryDayRow>()

  for (const row of rows) {
    const key = getMonthKey(row.dateKey)
    const base =
      groupedMap.get(key) ??
      createEmptySalesSummaryRow(key, getMonthLabel(key, includeYear))
    groupedMap.set(key, addSalesSummaryValues(base, row))
  }

  const timelineRows: SalesSummaryDayRow[] = []

  for (let year = startYear; year <= endYear; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}`
      timelineRows.push(
        groupedMap.get(key) ??
          createEmptySalesSummaryRow(key, getMonthLabel(key, includeYear))
      )
    }
  }

  return timelineRows
}

function buildSmoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  let path = `M ${points[0].x} ${points[0].y}`

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index]
    const current = points[index]
    const next = points[index + 1]
    const following = points[index + 2] ?? next
    const currentDx = next.x - previous.x
    const nextDx = following.x - current.x
    const tension = 0.18
    const control1X = current.x + currentDx * tension
    const control1Y = current.y + (next.y - previous.y) * tension
    const control2X = next.x - nextDx * tension
    const control2Y = next.y - (following.y - current.y) * tension

    path += ` C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${next.x} ${next.y}`
  }

  return path
}

function sampleRows<T>(rows: T[], maxPoints: number) {
  if (rows.length <= maxPoints) return rows

  const step = Math.ceil(rows.length / maxPoints)
  const sampled: T[] = []

  for (let index = 0; index < rows.length; index += step) {
    sampled.push(rows[index])
  }

  return sampled.slice(0, maxPoints)
}

export default function HomePage() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const previousIframePathRef = useRef<string | null>(null)
  const access = usePageAccess(['admin', 'employee', 'cashier'])

  const authLoading = access.loading
  const allowed = access.allowed
  const role = access.userRole as Role | null
  const branchId = access.branchId
  const scopeType = access.scopeType
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceKey>('home')
  const [activeReportsSubmenu, setActiveReportsSubmenu] =
    useState<ReportsSubmenuKey | null>(null)
  const [reportsMenuOpen, setReportsMenuOpen] = useState(false)
  const [iframeLoading, setIframeLoading] = useState(false)
  const todayString = getDateInputValue(new Date())
  const [reportPreset, setReportPreset] = useState<ReportPresetKey>('today')
  const [reportRange, setReportRange] = useState<ReportRange>('daily')
  const [reportDateFrom, setReportDateFrom] = useState(todayString)
  const [reportDateTo, setReportDateTo] = useState(todayString)
  const [datePickerPreset, setDatePickerPreset] =
    useState<DatePickerPresetKey>('today')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('all')
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([])
  const [employeesLoading, setEmployeesLoading] = useState(false)
  const [salesChartType, setSalesChartType] = useState<SalesChartType>('area')
  const [salesChartGrouping, setSalesChartGrouping] =
    useState<SalesChartGrouping>('days')
  const [chartHover, setChartHover] = useState<ChartHoverState | null>(null)
  const [reportOrders, setReportOrders] = useState<ReportOrderRecord[]>([])
  const [catalogCostMap, setCatalogCostMap] = useState<Record<string, number>>({})
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')
  const [reportLastUpdated, setReportLastUpdated] = useState('')

  const { settings, loading: settingsLoading } = useSystemSettings(!authLoading)
  const {
    isSystemAdmin,
    branches,
    loadingBranches,
    selectedBranchId,
    selectedBranchName,
    effectiveBranchId,
    setSelectedBranchId,
  } = useAdminBranchFilter(scopeType, branchId, !authLoading && allowed)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const roleLabel = access.roleLabel

  const storeName = settings?.store_name?.trim() || 'Leather Fix ERP'
  const branchName = settings?.branch_name?.trim() || 'الفرع الرئيسي'
  const displayedBranchName = isSystemAdmin ? selectedBranchName : branchName

  const systemStatus = useMemo<Record<string, boolean>>(
    () => ({
      'لوحة التحكم': true,
      'الطلبات': settings?.enable_orders ?? true,
      'الفواتير': settings?.enable_invoices ?? true,
      POS: settings?.enable_pos ?? true,
      'التقارير': settings?.enable_reports ?? true,
      'المستخدمون': settings?.enable_users ?? true,
      'الواتساب': settings?.enable_whatsapp ?? true,
      'الطباعة': settings?.enable_printing ?? true,
    }),
    [settings]
  )

  const allSidebarItems = useMemo<SidebarItem[]>(() => {
    return [
      {
        key: 'home',
        label: 'الرئيسية',
        roles: ['admin', 'employee', 'cashier'],
        enabled: true,
      },
      {
        key: 'dashboard',
        label: 'لوحة التحكم',
        roles: ['admin'],
        enabled: true,
      },
      {
        key: 'invoice',
        label: 'الفواتير',
        path: '/invoice/new',
        roles: ['admin', 'employee', 'cashier'],
        enabled: settings?.enable_invoices ?? true,
      },
      {
        key: 'catalog',
        label: 'الأصناف',
        path: '/admin/catalog',
        roles: ['admin'],
        enabled: true,
      },
      {
        key: 'whatsapp',
        label: 'WhatsApp',
        path: '/integrations/whatsapp',
        roles: ['admin'],
        enabled: true,
      },
      {
        key: 'customers',
        label: 'العملاء',
        path: '/customers',
        roles: ['admin', 'employee', 'cashier'],
        enabled: true,
      },
      {
        key: 'orders',
        label: 'إدارة الطلبات',
        path: '/orders',
        roles: ['admin'],
        enabled: settings?.enable_orders ?? true,
      },
      {
        key: 'reports',
        label: 'التقارير',
        path: '/admin/reports',
        roles: ['admin'],
        enabled: settings?.enable_reports ?? true,
      },
      {
        key: 'users',
        label: 'المستخدمون',
        path: '/admin/users',
        roles: ['admin'],
        enabled: settings?.enable_users ?? true,
      },
      {
        key: 'branches',
        label: 'إدارة الفروع',
        path: '/admin/branches',
        roles: ['admin'],
        enabled: true,
      },
      {
        key: 'settings',
        label: 'إعدادات النظام',
        path: '/admin/settings',
        roles: ['admin'],
        enabled: true,
      },
    ]
  }, [settings])

  const canAccess = (
    roles: Role[],
    currentRole: Role | null,
    enabled = true
  ) => {
    if (!currentRole) return false
    if (!enabled) return false
    return roles.includes(currentRole)
  }

  const activeWorkspacePath = useMemo(() => {
    if (
      activeWorkspace === 'reports' &&
      activeReportsSubmenu === 'sales-summary'
    ) {
      return undefined
    }

    return allSidebarItems.find((item) => item.key === activeWorkspace)?.path
  }, [activeReportsSubmenu, allSidebarItems, activeWorkspace])

  const activeWorkspaceTitle = useMemo(() => {
    if (
      activeWorkspace === 'reports' &&
      activeReportsSubmenu === 'sales-summary'
    ) {
      return 'ملخص المبيعات'
    }

    return (
      allSidebarItems.find((item) => item.key === activeWorkspace)?.label ||
      'الرئيسية'
    )
  }, [activeReportsSubmenu, allSidebarItems, activeWorkspace])

  const activeWorkspaceSubtitle = useMemo(() => {
    if (activeWorkspace === 'home') {
      return 'نقطة الانطلاق الرئيسية للنظام'
    }

    if (activeWorkspace === 'dashboard') {
      return 'ملخص سريع لحالة النظام والتشغيل'
    }

    if (
      activeWorkspace === 'reports' &&
      activeReportsSubmenu === 'sales-summary'
    ) {
      return `التقارير • ${getDatePickerPresetLabel(datePickerPreset)}`
    }

    return 'المحتوى يفتح هنا داخل نفس الصفحة'
  }, [activeReportsSubmenu, activeWorkspace, datePickerPreset])

  useEffect(() => {
    if (activeWorkspace === 'home') {
      previousIframePathRef.current = null
      const timeoutId = window.setTimeout(() => {
        setIframeLoading(false)
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }

    if (activeWorkspacePath) {
      const nextPath = activeWorkspacePath
      const pathChanged = previousIframePathRef.current !== nextPath
      previousIframePathRef.current = nextPath

      const timeoutId = window.setTimeout(() => {
        setIframeLoading(pathChanged)
      }, 0)

      return () => window.clearTimeout(timeoutId)
    } else {
      previousIframePathRef.current = null
      const timeoutId = window.setTimeout(() => {
        setIframeLoading(false)
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }
  }, [activeWorkspace, activeWorkspacePath])

  useEffect(() => {
    if (!role) return

    const allowedKeys = allSidebarItems
      .filter((item) => item.roles.includes(role) && (item.enabled ?? true))
      .map((item) => item.key)

    if (!allowedKeys.includes(activeWorkspace)) {
      const timeoutId = window.setTimeout(() => {
        setActiveWorkspace('home')
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }
  }, [role, allSidebarItems, activeWorkspace])

  const openWorkspace = (key: WorkspaceKey) => {
    const target = allSidebarItems.find((item) => item.key === key)
    if (!target || !(target.enabled ?? true)) return
    if (key !== 'reports') {
      setActiveReportsSubmenu(null)
      setReportsMenuOpen(false)
    }
    setActiveWorkspace(key)
  }

  const isSalesSummaryView =
    activeWorkspace === 'reports' && activeReportsSubmenu === 'sales-summary'

  const fetchSalesSummaryData = useCallback(async () => {
    if (!allowed || !isSalesSummaryView) return

    if (!reportDateFrom) {
      setReportOrders([])
      return
    }

    if (reportRange === 'custom' && reportDateTo && reportDateTo < reportDateFrom) {
      setReportError('تاريخ النهاية يجب أن يكون بعد تاريخ البداية')
      setReportOrders([])
      return
    }

    setReportLoading(true)
    setReportError('')

    try {
      if (isBranchScopedWithoutBranchId(scopeType, branchId)) {
        setReportOrders([])
        setReportLastUpdated(new Date().toLocaleTimeString('ar-SA'))
        setReportLoading(false)
        return
      }

      const { fromIso, toIso } = buildReportDateRange(
        reportRange,
        reportDateFrom,
        reportDateTo
      )

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
              unit_price,
              quantity,
              line_total
            )
          )
        `)
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: false })

      if (shouldFilterByBranch(scopeType, branchId)) {
        query = query.eq('branch_id', branchId as string)
      } else if (effectiveBranchId) {
        query = query.eq('branch_id', effectiveBranchId)
      }

      const { data, error } = await query

      if (error) {
        setReportError(`تعذر تحميل بيانات التقرير: ${error.message}`)
        setReportOrders([])
        setReportLoading(false)
        return
      }

      const { data: catalogItems, error: catalogError } = await supabase
        .from('catalog_items')
        .select('id, name, item_type, default_price, is_active')

      if (catalogError) {
        setReportError(`تعذر تحميل تكلفة الأصناف: ${catalogError.message}`)
        setReportOrders([])
        setReportLoading(false)
        return
      }

      let branchPricesByItemId = new Map<string, number>()

      if (effectiveBranchId || shouldFilterByBranch(scopeType, branchId)) {
        const scopedBranchId = effectiveBranchId || (branchId as string)
        const { data: branchCatalogItems, error: branchCatalogError } =
          await supabase
            .from('branch_catalog_items')
            .select('catalog_item_id, price, is_active')
            .eq('branch_id', scopedBranchId)

        if (branchCatalogError) {
          setReportError(
            `تعذر تحميل تكلفة الفرع: ${branchCatalogError.message}`
          )
          setReportOrders([])
          setReportLoading(false)
          return
        }

        branchPricesByItemId = new Map(
          ((branchCatalogItems || []) as Array<{
            catalog_item_id: string
            price: number
            is_active: boolean
          }>)
            .filter((item) => item.is_active)
            .map((item) => [item.catalog_item_id, Number(item.price) || 0])
        )
      }

      const normalized = Array.isArray(data)
        ? data.map((row, index) =>
            mapOrderSourceRowToReportOrderRecord(row as OrderSourceRow, index)
          )
        : []

      const nextCatalogCostMap = Object.fromEntries(
        ((catalogItems || []) as Array<{
          id: string
          name: string
          item_type: string
          default_price: number
          is_active: boolean
        }>)
          .filter((item) => item.is_active && item.item_type === 'product')
          .map((item) => [
            normalizeItemName(item.name),
            branchPricesByItemId.get(item.id) ?? Number(item.default_price) ?? 0,
          ])
      )

      setReportOrders(normalized)
      setCatalogCostMap(nextCatalogCostMap)
      setReportLastUpdated(new Date().toLocaleTimeString('ar-SA'))
    } finally {
      setReportLoading(false)
    }
  }, [
    allowed,
    branchId,
    effectiveBranchId,
    isSalesSummaryView,
    reportDateFrom,
    reportDateTo,
    reportRange,
    scopeType,
  ])

  useEffect(() => {
    if (!allowed || !isSalesSummaryView) return

    const timeoutId = window.setTimeout(() => {
      void fetchSalesSummaryData()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [allowed, fetchSalesSummaryData, isSalesSummaryView])

  useEffect(() => {
    if (!allowed || !isSalesSummaryView) return

    let cancelled = false

    async function loadEmployees() {
      try {
        setEmployeesLoading(true)

        const response = await fetch('/api/admin/list-users', {
          method: 'GET',
          cache: 'no-store',
        })
        const result = await response.json().catch(() => null)

        if (!response.ok || !result?.success) {
          if (!cancelled) {
            setEmployeeOptions([])
          }
          return
        }

        if (!cancelled) {
          setEmployeeOptions(
            Array.isArray(result.users) ? result.users : []
          )
        }
      } finally {
        if (!cancelled) {
          setEmployeesLoading(false)
        }
      }
    }

    void loadEmployees()

    return () => {
      cancelled = true
    }
  }, [allowed, isSalesSummaryView])

  const renderSystemSummaryContent = () => {
    return (
      <div className="page-card !p-6 text-right">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-slate-900">
            ملخص النظام
          </h2>
          <span className="badge badge-blue">ERP</span>
        </div>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="grid gap-3 md:grid-cols-2">
            <SummaryRow label="اسم المحل" value={storeName} />
            <SummaryRow label="اسم الفرع" value={branchName} />
          </div>
        </div>

        <div className="space-y-3">
          {Object.entries(systemStatus).map(([label, enabled]) => (
            <div
              key={label}
              className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl border px-4 py-4 text-right ${
                enabled
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              <span
                className={`text-sm font-extrabold ${
                  enabled ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {enabled ? 'مفعلة' : 'متوقفة'}
              </span>

              <span className="text-sm font-semibold text-slate-700">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderHomeContent = () => {
    const quickActions: QuickAction[] = []

    if (role === 'admin') {
      quickActions.push({
        key: 'dashboard',
        label: 'لوحة التحكم',
        primary: true,
      })

      quickActions.push({
        key: 'catalog',
        label: 'الأصناف',
      })

      quickActions.push({
        key: 'whatsapp',
        label: 'WhatsApp',
      })
    }

    if ((role === 'admin' || role === 'employee') && (settings?.enable_orders ?? true)) {
      quickActions.push({
        key: 'orders',
        label: 'إدارة الطلبات',
      })
    }

    if (settings?.enable_invoices ?? true) {
      quickActions.push({
        key: 'invoice',
        label: 'بدء فاتورة جديدة',
      })
    }

    quickActions.push({
      key: 'customers',
      label: 'العملاء',
    })

    if (role === 'admin' && (settings?.enable_reports ?? true)) {
      quickActions.push({
        key: 'reports',
        label: 'التقارير',
      })
    }

    return (
      <div className="space-y-5 text-right">
        <div className="page-hero overflow-hidden text-right">
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="text-right">
              <h1 className="page-title text-right text-3xl md:text-4xl">
                نظام موحد لإدارة الطلبات والفواتير والتشغيل اليومي
              </h1>

              <p className="mt-4 max-w-[760px] text-right text-base leading-8 text-slate-600 md:text-lg">
                واجهة سريعة وواضحة للمحل تجمع بين لوحة التحكم، إدارة الطلبات،
                الفواتير، الطباعة الحرارية، وإرسال الواتساب في مكان واحد.
              </p>

              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <span className="badge badge-blue">{storeName}</span>
                <span className="badge badge-slate">{displayedBranchName}</span>
                <span className="badge badge-green">الصلاحية: {roleLabel || 'غير معروفة'}</span>
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                {quickActions.map((action) => (
                  <button
                    key={action.key}
                    onClick={() => openWorkspace(action.key)}
                    className={action.primary ? 'primary-btn' : 'secondary-btn'}
                    type="button"
                  >
                    {action.label}
                  </button>
                ))}
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {highlights.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-right text-sm font-bold text-slate-700 md:text-base"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 text-right">
              <div className="page-card bg-slate-900 text-right text-white ring-0 shadow-none">
                <p className="text-sm font-bold text-slate-300">مساحة العمل</p>
                <h2 className="mt-2 text-2xl font-extrabold">{storeName}</h2>
                <p className="mt-2 text-sm font-semibold text-slate-300">
                  {displayedBranchName}
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-300 md:text-base">
                  الشريط الجانبي هو وسيلة التنقل الأساسية، وهذه المساحة تعرض
                  أقسام العمل السريعة والملخص العام فقط.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="stat-card !p-5 text-right">
                  <p className="stat-label text-right">الصلاحية</p>
                  <p className="stat-value text-right">{roleLabel || '—'}</p>
                </div>

                <div className="stat-card !p-5 text-right">
                  <p className="stat-label text-right">التشغيل</p>
                  <p className="stat-value text-right">
                    {settingsLoading ? '...' : 'سريع'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="page-card !p-6 text-right">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-extrabold text-slate-900">
              ملخص النظام
            </h2>
            <span className="badge badge-blue">ERP</span>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <SummaryRow label="اسم المحل" value={storeName} />
            <SummaryRow label="اسم الفرع" value={displayedBranchName} />
          </div>

          <div className="space-y-3">
            {Object.entries(systemStatus).map(([label, enabled]) => (
              <div
                key={label}
                className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl border px-4 py-4 text-right ${
                  enabled
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-red-200 bg-red-50'
                }`}
              >
                <span
                  className={`text-sm font-extrabold ${
                    enabled ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {enabled ? 'مفعلة' : 'متوقفة'}
                </span>

                <span className="text-sm font-semibold text-slate-700">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const visibleSidebarItems = useMemo(() => {
    return allSidebarItems.filter((item) =>
      canAccess(item.roles, role, item.enabled ?? true)
    )
  }, [allSidebarItems, role])

  const sidebarMenuItems = useMemo<
    Array<{
      key:
        | 'home'
        | 'dashboard'
        | 'invoice'
        | 'catalog'
        | 'customers'
        | 'orders'
        | 'reports'
        | 'users'
        | 'branches'
        | 'settings'
        | 'whatsapp'
      label: string
      visible: boolean
      active: boolean
    }>
  >(
    () => [
      {
        key: 'home',
        label: 'الرئيسية',
        visible: true,
        active: activeWorkspace === 'home',
      },
      {
        key: 'dashboard',
        label: 'لوحة التحكم',
        visible: visibleSidebarItems.some((item) => item.key === 'dashboard'),
        active: activeWorkspace === 'dashboard',
      },
      {
        key: 'invoice',
        label: 'الفواتير',
        visible: visibleSidebarItems.some((item) => item.key === 'invoice'),
        active: activeWorkspace === 'invoice',
      },
      {
        key: 'catalog',
        label: 'الأصناف',
        visible: visibleSidebarItems.some((item) => item.key === 'catalog'),
        active: activeWorkspace === 'catalog',
      },
      {
        key: 'customers',
        label: 'العملاء',
        visible: visibleSidebarItems.some((item) => item.key === 'customers'),
        active: activeWorkspace === 'customers',
      },
      {
        key: 'orders',
        label: 'الطلبات',
        visible: visibleSidebarItems.some((item) => item.key === 'orders'),
        active: activeWorkspace === 'orders',
      },
      {
        key: 'reports',
        label: 'التقارير',
        visible: visibleSidebarItems.some((item) => item.key === 'reports'),
        active: activeWorkspace === 'reports',
      },
      {
        key: 'users',
        label: 'المستخدمون',
        visible: visibleSidebarItems.some((item) => item.key === 'users'),
        active: activeWorkspace === 'users',
      },
      {
        key: 'branches',
        label: 'إدارة الفروع',
        visible: visibleSidebarItems.some((item) => item.key === 'branches'),
        active: activeWorkspace === 'branches',
      },
      {
        key: 'settings',
        label: 'إعدادات النظام',
        visible: visibleSidebarItems.some((item) => item.key === 'settings'),
        active: activeWorkspace === 'settings',
      },
      {
        key: 'whatsapp',
        label: 'WhatsApp',
        visible: visibleSidebarItems.some((item) => item.key === 'whatsapp'),
        active: activeWorkspace === 'whatsapp',
      },
    ],
    [activeWorkspace, visibleSidebarItems]
  )

  const visibleEmployeeOptions = useMemo(() => {
    let nextEmployees = employeeOptions.filter((employee) => employee.is_active)

    if (effectiveBranchId) {
      nextEmployees = nextEmployees.filter(
        (employee) => employee.branch_id === effectiveBranchId
      )
    }

    return nextEmployees
  }, [effectiveBranchId, employeeOptions])

  const reportSummary = useMemo(() => {
    return buildReportOrderSummary(reportOrders)
  }, [reportOrders])

  const salesSummaryRows = useMemo(() => {
    return buildSalesSummaryRows(reportOrders, catalogCostMap)
  }, [catalogCostMap, reportOrders])

  const chartRows = useMemo(() => {
    return buildCompleteTimelineRows(
      salesSummaryRows,
      salesChartGrouping,
      reportDateFrom,
      reportDateTo
    )
  }, [reportDateFrom, reportDateTo, salesChartGrouping, salesSummaryRows])

  const totalRefunds = 0
  const totalNetSales = reportSummary.totalSales - reportSummary.totalDiscount
  const totalCogs = salesSummaryRows.reduce((sum, row) => sum + row.cogs, 0)
  const totalGrossProfit = totalNetSales - totalCogs

  const salesSummaryCards = useMemo<SalesSummaryCard[]>(() => {
    const averageDaily =
      salesSummaryRows.length > 0 ? totalNetSales / salesSummaryRows.length : 0

    return [
      {
        title: 'إجمالي المبيعات',
        value: reportSummary.totalSales,
        note: `${reportSummary.totalOrders} طلب خلال الفترة`,
      },
      {
        title: 'المبالغ المستردة',
        value: totalRefunds,
        note: 'لا توجد مرتجعات مسجلة حالياً',
      },
      {
        title: 'الخصومات',
        value: reportSummary.totalDiscount,
        note: reportSummary.totalSales
          ? `${((reportSummary.totalDiscount / reportSummary.totalSales) * 100).toFixed(1)}% من المبيعات`
          : '0.0% من المبيعات',
      },
      {
        title: 'صافي المبيعات',
        value: totalNetSales,
        note: `متوسط يومي ${formatCompactSar(averageDaily)}`,
      },
      {
        title: 'إجمالي الربح',
        value: totalGrossProfit,
        note: 'بحسب البيانات المالية المتاحة',
      },
    ]
  }, [reportSummary, salesSummaryRows.length, totalGrossProfit, totalNetSales])

  const exportSalesSummary = useCallback(() => {
    const headers = [
      'التاريخ',
      'إجمالي المبيعات',
      'المبالغ المستردة',
      'الخصومات',
      'صافي المبيعات',
      'تكلفة البضاعة المباعة',
      'إجمالي الربح',
    ]

    const rows = chartRows.map((row) => [
      row.dateLabel,
      row.totalSales.toFixed(2),
      row.refunds.toFixed(2),
      row.discounts.toFixed(2),
      row.netSales.toFixed(2),
      row.cogs.toFixed(2),
      row.grossProfit.toFixed(2),
    ])

    const csvContent = [
      headers.map(escapeCsvValue).join(','),
      ...rows.map((row) => row.map(escapeCsvValue).join(',')),
    ].join('\n')

    const blob = new Blob(['\ufeff' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    })

    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `sales-summary-${reportDateFrom}-to-${reportDateTo}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }, [chartRows, reportDateFrom, reportDateTo])

  const renderSalesSummaryReport = () => {
    const todayAnchor = getDateInputValue(new Date())
    const resolvedGroupedRows =
      chartRows.length > 0
        ? chartRows
        : [getGroupedPlaceholderRow(reportDateFrom, salesChartGrouping)]
    const MAX_POINTS = 12
    const visibleChartRows =
      resolvedGroupedRows.length <= MAX_POINTS
        ? resolvedGroupedRows
        : sampleRows(resolvedGroupedRows, MAX_POINTS)
    const getChartTooltipLabel = (row: SalesSummaryDayRow) =>
      salesChartGrouping === 'days'
        ? formatShortArabicDate(row.dateKey)
        : row.dateLabel

    const maxChartValue = Math.max(
      ...resolvedGroupedRows.map((row) =>
        Math.max(row.totalSales, row.netSales, row.grossProfit)
      ),
      1
    )

    const chartWidth = 900
    const chartHeight = 140
    const chartPaddingTop = 6
    const chartPaddingBottom = 16
    const chartPaddingSide = 8
    const chartRenderedHeight = 110
    const plotHeight = chartHeight - chartPaddingTop - chartPaddingBottom
    const barAreaWidth = chartWidth - chartPaddingSide * 2
    const step = barAreaWidth / MAX_POINTS
    const totalBarWidth = Math.min(20, step * 0.34)
    const netBarWidth = Math.min(10, step * 0.18)
    const hoverBandWidth = Math.max(step, 18)
    const getChartX = (index: number) =>
      chartPaddingSide + index * step + step / 2
    const getChartY = (value: number) =>
      chartPaddingTop + plotHeight - (value / maxChartValue) * plotHeight
    const linePoints = visibleChartRows.map((row, index) => {
      const x = getChartX(index)
      const y = getChartY(row.netSales)

      return { x, y }
    })
    const areaLinePath = buildSmoothPath(linePoints)
    const areaFillPath = linePoints.length
      ? `${areaLinePath} L ${linePoints[linePoints.length - 1].x} ${
          chartPaddingTop + plotHeight
        } L ${linePoints[0].x} ${chartPaddingTop + plotHeight} Z`
      : ''
    const tooltipWidth = 120
    const tooltipHeight = 34
    const tooltipX = chartHover
      ? Math.min(
          Math.max(chartHover.x - tooltipWidth / 2, chartPaddingSide),
          chartWidth - chartPaddingSide - tooltipWidth
        )
      : 0
    const tooltipY = chartHover ? Math.max(chartHover.y - 50, 8) : 0
    const detailTitle = getGroupingDetailTitle(salesChartGrouping)
    const detailCountLabel = getGroupingCountLabel(
      salesChartGrouping,
      chartRows.length
    )
    const groupingSummaryLabel = getGroupingSummaryLabel(salesChartGrouping)
    const currentDateRangeLabel = formatDateRangeLabel(
      reportDateFrom,
      reportDateTo
    )
    return (
      <div className="grid gap-1.5 overflow-visible text-right">
        {reportError ? <div className="error-alert">{reportError}</div> : null}

        <div className="relative z-20 grid gap-2 overflow-visible rounded-[14px] border border-slate-200 bg-white px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center justify-end gap-2">
            {isSystemAdmin ? (
              <div className="w-[160px] shrink-0">
                <AdminBranchFilter
                  branches={branches}
                  selectedBranchId={selectedBranchId}
                  loading={loadingBranches}
                  onChange={setSelectedBranchId}
                  className="w-full"
                />
              </div>
            ) : (
              <div className="w-[160px] shrink-0 text-right">
                <label className="field-label">الفرع</label>
                <AdminSelect
                  disabled
                  value={displayedBranchName}
                  className="!min-w-0 !w-full !rounded-lg !text-[11px]"
                >
                  <option value={displayedBranchName}>{displayedBranchName}</option>
                </AdminSelect>
              </div>
            )}

            <div className="w-[160px] shrink-0 text-right">
              <label className="field-label">الموظف</label>
              <AdminSelect
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                disabled={employeesLoading}
                className="!min-w-0 !w-full !rounded-lg !text-[11px]"
              >
                <option value="all">كل الموظفين</option>
                {visibleEmployeeOptions.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name?.trim() ||
                      employee.username?.trim() ||
                      'مستخدم'}
                  </option>
                ))}
              </AdminSelect>
            </div>

              <div className="w-[160px] shrink-0 text-right">
                <label className="field-label">الفترة</label>
                <AdminSelect
                  value={datePickerPreset}
                  onChange={(e) => {
                    const preset = e.target.value as DatePickerPresetKey
                    const nextState = resolveDatePickerPresetState(preset)

                    setDatePickerPreset(preset)
                    setReportPreset(nextState.reportPreset)
                    setReportRange(nextState.range)
                    setReportDateFrom(nextState.dateFrom)
                    setReportDateTo(nextState.dateTo)
                  }}
                  className="!min-w-0 !w-[160px] !rounded-lg !text-[11px]"
                >
                  <option value="today">اليوم</option>
                  <option value="yesterday">البارحة</option>
                  <option value="this-week">هذا الأسبوع</option>
                  <option value="last-week">الأسبوع الماضي</option>
                  <option value="this-month">هذا الشهر</option>
                  <option value="last-month">الشهر الماضي</option>
                  <option value="last-7-days">آخر 7 أيام</option>
                  <option value="last-30-days">آخر 30 يوماً</option>
                </AdminSelect>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const nextState = shiftDatePickerRange(
                    datePickerPreset,
                    reportDateFrom,
                    reportDateTo,
                    -1
                  )
                  setDatePickerPreset(nextState.preset)
                  setReportPreset(nextState.reportPreset)
                  setReportRange(nextState.range)
                  setReportDateFrom(nextState.dateFrom)
                  setReportDateTo(nextState.dateTo)
                }}
                className="secondary-btn !min-h-[30px] !w-[30px] !rounded-md !px-0 !text-[11px]"
                aria-label="الفترة السابقة"
              >
                ‹
              </button>

              <button
                type="button"
                onClick={() => {
                  const nextState = shiftDatePickerRange(
                    datePickerPreset,
                    reportDateFrom,
                    reportDateTo,
                    1
                  )
                  setDatePickerPreset(nextState.preset)
                  setReportPreset(nextState.reportPreset)
                  setReportRange(nextState.range)
                  setReportDateFrom(nextState.dateFrom)
                  setReportDateTo(nextState.dateTo)
                }}
                className="secondary-btn !min-h-[30px] !w-[30px] !rounded-md !px-0 !text-[11px]"
                aria-label="الفترة التالية"
              >
                ›
              </button>

              <AdminButton
                onClick={() => void fetchSalesSummaryData()}
                className="!min-h-[30px] !rounded-md !px-2 !text-[10px]"
              >
                تحديث
              </AdminButton>

              <AdminButton
                onClick={exportSalesSummary}
                className="!min-h-[30px] !rounded-md !px-2 !text-[10px]"
              >
                تصدير
              </AdminButton>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-2">
            <div className="flex flex-wrap justify-end gap-2 text-right">
              <span className="badge badge-blue">
                {getDatePickerPresetLabel(datePickerPreset)}
              </span>
              <span className="badge badge-slate">{displayedBranchName}</span>
              <span className="badge badge-slate">{currentDateRangeLabel}</span>
            </div>

            <span className="text-xs font-bold text-slate-500">
              {reportLoading
                ? 'جارٍ تحديث التقرير...'
                : `آخر تحديث: ${reportLastUpdated || '—'}`}
            </span>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {salesSummaryCards.map((card) => (
            <div key={card.title} className="stat-card !p-3 text-right">
              <p className="text-[10px] font-bold text-slate-500">{card.title}</p>
              <p className="mt-1 text-[17px] font-black text-slate-900">
                {formatSar(card.value)}
              </p>
              <p className="mt-0.5 text-[9px] font-semibold text-slate-500">
                {card.note}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-[14px] border border-slate-300 bg-white p-2 shadow-[0_6px_18px_rgba(15,23,42,0.06)]">
          <div className="mb-1 flex flex-wrap items-start justify-between gap-1">
            <div className="text-right">
              <h2 className="section-title">أداء المبيعات</h2>
              <p className="mt-0 text-[10px] text-slate-500 md:text-[11px]">
                قراءة سريعة لحركة المبيعات وصافي المبيعات {groupingSummaryLabel}
              </p>
            </div>

            <div className="flex flex-col items-end gap-1">
              <div className="flex flex-wrap gap-0.5">
                <button
                  type="button"
                  onClick={() => setSalesChartType('area')}
                  className={`!min-h-0 rounded-full !px-1.5 !py-0.5 text-[9px] font-bold transition ${
                    salesChartType === 'area' ? 'primary-btn' : 'secondary-btn'
                  }`}
                >
                  خطي / مساحي
                </button>
                <button
                  type="button"
                  onClick={() => setSalesChartType('bar')}
                  className={`!min-h-0 rounded-full !px-1.5 !py-0.5 text-[9px] font-bold transition ${
                    salesChartType === 'bar' ? 'primary-btn' : 'secondary-btn'
                  }`}
                >
                  أعمدة
                </button>
              </div>

              <div className="flex flex-wrap gap-0.5">
                <button
                  type="button"
                  onClick={() => setSalesChartGrouping('days')}
                  className={`!min-h-0 rounded-full !px-1.5 !py-0.5 text-[9px] font-bold transition ${
                    salesChartGrouping === 'days'
                      ? 'primary-btn'
                      : 'secondary-btn'
                  }`}
                >
                  الأيام
                </button>
                <button
                  type="button"
                  onClick={() => setSalesChartGrouping('weeks')}
                  className={`!min-h-0 rounded-full !px-1.5 !py-0.5 text-[9px] font-bold transition ${
                    salesChartGrouping === 'weeks'
                      ? 'primary-btn'
                      : 'secondary-btn'
                  }`}
                >
                  الأسابيع
                </button>
                <button
                  type="button"
                  onClick={() => setSalesChartGrouping('months')}
                  className={`!min-h-0 rounded-full !px-1.5 !py-0.5 text-[9px] font-bold transition ${
                    salesChartGrouping === 'months'
                      ? 'primary-btn'
                      : 'secondary-btn'
                  }`}
                >
                  الأشهر
                </button>
              </div>
            </div>
          </div>

          <div className="mb-0.5 flex flex-wrap gap-1">
            <span className="badge badge-slate">إجمالي المبيعات</span>
            <span className="badge badge-blue">صافي المبيعات</span>
            <span className="badge badge-green">إجمالي الربح</span>
          </div>

          <div className="h-[110px] pt-0" onMouseLeave={() => setChartHover(null)}>
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="mx-auto block h-[110px] w-full max-w-[900px]"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <linearGradient
                  id="sales-summary-area-gradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#0f172a" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
                </linearGradient>
                <linearGradient
                  id="sales-summary-bar-gradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#0f172a" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#1e293b" stopOpacity="0.78" />
                </linearGradient>
                <filter
                  id="sales-summary-line-glow"
                  x="-20%"
                  y="-20%"
                  width="140%"
                  height="140%"
                >
                  <feGaussianBlur stdDeviation="1.2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <line
                x1={chartPaddingSide}
                y1={chartPaddingTop + plotHeight}
                x2={chartWidth - chartPaddingSide}
                y2={chartPaddingTop + plotHeight}
                stroke="#dbe3ef"
              />

              {[0, 0.25, 0.5, 0.75, 1].map((stepValue, index) => {
                const y =
                  chartPaddingTop + plotHeight - plotHeight * stepValue

                return (
                  <g key={index}>
                    <line
                      x1={chartPaddingSide}
                      y1={y}
                      x2={chartWidth - chartPaddingSide}
                      y2={y}
                      stroke="#edf2f8"
                      strokeDasharray="2 6"
                    />
                    <text
                      x={chartWidth - chartPaddingSide}
                      y={y - 6}
                      textAnchor="end"
                      fontSize="8"
                      fill="#94a3b8"
                    >
                      {formatCompactSar(maxChartValue * stepValue)}
                    </text>
                  </g>
                )
              })}

              {chartHover ? (
                <line
                  x1={chartHover.x}
                  y1={chartPaddingTop}
                  x2={chartHover.x}
                  y2={chartPaddingTop + plotHeight}
                  stroke="#cbd5e1"
                  strokeDasharray="3 5"
                />
              ) : null}

              {salesChartType === 'area' ? (
                <>
                  <path
                    d={areaFillPath}
                    fill="url(#sales-summary-area-gradient)"
                  />
                  <path
                    d={areaLinePath}
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    filter="url(#sales-summary-line-glow)"
                  />
                  {visibleChartRows.map((row, index) => {
                    const x = getChartX(index)
                    const netY = getChartY(row.netSales)
                    const profitY = getChartY(row.grossProfit)
                    const isNetActive =
                      chartHover?.key === `${row.dateKey}-net`
                    const isProfitActive =
                      chartHover?.key === `${row.dateKey}-profit`

                    return (
                      <g key={row.dateKey}>
                        <rect
                          x={x - hoverBandWidth / 2}
                          y={chartPaddingTop}
                          width={hoverBandWidth}
                          height={plotHeight}
                          fill="transparent"
                          onMouseEnter={() =>
                            setChartHover({
                              key: `${row.dateKey}-net`,
                              x,
                              y: netY,
                              label: getChartTooltipLabel(row),
                              value: row.netSales,
                              color: '#0f172a',
                            })
                          }
                        />
                        <circle
                          cx={x}
                          cy={netY}
                          r="7"
                          fill="transparent"
                          onMouseEnter={() =>
                            setChartHover({
                              key: `${row.dateKey}-net`,
                              x,
                              y: netY,
                              label: getChartTooltipLabel(row),
                              value: row.netSales,
                              color: '#0f172a',
                            })
                          }
                        />
                        <circle
                          cx={x}
                          cy={netY}
                          r={isNetActive ? '4' : '2.4'}
                          fill="#0f172a"
                          stroke="#ffffff"
                          strokeWidth="1.2"
                        />
                        {isNetActive ? (
                          <circle
                            cx={x}
                            cy={netY}
                            r="6"
                            fill="#0f172a"
                            opacity="0.10"
                          />
                        ) : null}
                        <circle
                          cx={x}
                          cy={profitY}
                          r="6.5"
                          fill="transparent"
                          onMouseEnter={() =>
                            setChartHover({
                              key: `${row.dateKey}-profit`,
                              x,
                              y: profitY,
                              label: getChartTooltipLabel(row),
                              value: row.grossProfit,
                              color: '#16a34a',
                            })
                          }
                        />
                        <circle
                          cx={x}
                          cy={profitY}
                          r={isProfitActive ? '4' : '2.2'}
                          fill="#16a34a"
                          stroke="#ffffff"
                          strokeWidth="1.1"
                          opacity="0.95"
                        />
                        {isProfitActive ? (
                          <circle
                            cx={x}
                            cy={profitY}
                            r="6"
                            fill="#16a34a"
                            opacity="0.10"
                          />
                        ) : null}
                        <text
                          x={x}
                          y={chartHeight - 10}
                          textAnchor="middle"
                          fontSize="7"
                          fill="#64748b"
                        >
                          {salesChartGrouping === 'days'
                            ? formatChartDate(row.dateKey)
                            : row.dateLabel}
                        </text>
                      </g>
                    )
                  })}
                </>
              ) : null}

              {salesChartType === 'bar'
                ? visibleChartRows.map((row, index) => {
                    const x = getChartX(index)
                    const totalHeight = (row.totalSales / maxChartValue) * plotHeight
                    const netHeight = (row.netSales / maxChartValue) * plotHeight
                    const profitHeight =
                      (row.grossProfit / maxChartValue) * plotHeight
                    const totalY = chartPaddingTop + plotHeight - totalHeight
                    const netY = chartPaddingTop + plotHeight - netHeight
                    const profitY = chartPaddingTop + plotHeight - profitHeight
                    const isNetActive =
                      chartHover?.key === `${row.dateKey}-net`
                    const isProfitActive =
                      chartHover?.key === `${row.dateKey}-profit`

                    return (
                      <g key={row.dateKey}>
                        <rect
                          x={x - hoverBandWidth / 2}
                          y={chartPaddingTop}
                          width={hoverBandWidth}
                          height={plotHeight}
                          fill="transparent"
                          onMouseEnter={() =>
                            setChartHover({
                              key: `${row.dateKey}-net`,
                              x,
                              y: netY,
                              label: getChartTooltipLabel(row),
                              value: row.netSales,
                              color: '#0f172a',
                            })
                          }
                        />
                        <rect
                          x={x - totalBarWidth}
                          y={totalY}
                          width={totalBarWidth}
                          height={Math.max(totalHeight, 3)}
                          rx="8"
                          fill="#e6edf6"
                          onMouseEnter={() =>
                            setChartHover({
                              key: `${row.dateKey}-total`,
                              x: x - totalBarWidth / 2,
                              y: totalY,
                              label: getChartTooltipLabel(row),
                              value: row.totalSales,
                              color: '#c9d6e6',
                            })
                          }
                        />
                        <rect
                          x={x - netBarWidth / 2}
                          y={netY}
                          width={netBarWidth}
                          height={Math.max(netHeight, 3)}
                          rx="7"
                          fill="url(#sales-summary-bar-gradient)"
                          stroke={isNetActive ? '#0f172a' : 'transparent'}
                          strokeWidth={isNetActive ? '0.8' : '0'}
                          onMouseEnter={() =>
                            setChartHover({
                              key: `${row.dateKey}-net`,
                              x,
                              y: netY,
                              label: getChartTooltipLabel(row),
                              value: row.netSales,
                              color: '#0f172a',
                            })
                          }
                        />
                        <rect
                          x={x + totalBarWidth * 0.3}
                          y={profitY}
                          width={netBarWidth}
                          height={Math.max(profitHeight, 3)}
                          rx="7"
                          fill="#16a34a"
                          stroke={isProfitActive ? '#15803d' : 'transparent'}
                          strokeWidth={isProfitActive ? '0.8' : '0'}
                          onMouseEnter={() =>
                            setChartHover({
                              key: `${row.dateKey}-profit`,
                              x: x + totalBarWidth * 0.3 + netBarWidth / 2,
                              y: profitY,
                              label: getChartTooltipLabel(row),
                              value: row.grossProfit,
                              color: '#16a34a',
                            })
                          }
                        />
                        <text
                          x={x}
                          y={chartHeight - 10}
                          textAnchor="middle"
                          fontSize="7"
                          fill="#64748b"
                        >
                          {salesChartGrouping === 'days'
                            ? formatChartDate(row.dateKey)
                            : row.dateLabel}
                        </text>
                      </g>
                    )
                  })
                : null}

              {chartHover ? (
                <g pointerEvents="none">
                  <rect
                    x={tooltipX}
                    y={tooltipY}
                    width={tooltipWidth}
                    height={tooltipHeight}
                    rx="7"
                    fill="#ffffff"
                    stroke="#dbe3ef"
                    filter="url(#sales-summary-line-glow)"
                  />
                  <rect
                    x={tooltipX + 12}
                    y={tooltipY + 11}
                    width="5"
                    height="5"
                    rx="999"
                    fill={chartHover.color}
                  />
                  <text
                    x={tooltipX + tooltipWidth - 12}
                    y={tooltipY + 14}
                    textAnchor="end"
                    fontSize="7"
                    fontWeight="700"
                    fill="#334155"
                  >
                    {chartHover.label}
                  </text>
                  <text
                    x={tooltipX + tooltipWidth - 12}
                    y={tooltipY + 25}
                    textAnchor="end"
                    fontSize="7.5"
                    fontWeight="800"
                    fill="#0f172a"
                  >
                    {formatTooltipArabicRiyal(chartHover.value)}
                  </text>
                </g>
              ) : null}
            </svg>
          </div>
        </div>

        <div className="rounded-[14px] border border-slate-200 bg-slate-50/55 p-2.5">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5">
            <div className="text-right">
              <h2 className="section-title">{detailTitle}</h2>
              <p className="mt-0 text-[10px] text-slate-500">
                ملخص للمبيعات والخصومات وصافي الربح ضمن نفس النطاق
              </p>
            </div>
            <span className="badge badge-slate">{detailCountLabel}</span>
          </div>

          {reportLoading && reportOrders.length === 0 ? (
            <div className="py-12 text-center text-sm font-bold text-slate-500">
              جاري تحميل بيانات التقرير...
            </div>
          ) : chartRows.length === 0 ? (
            <div className="py-12 text-center text-sm font-bold text-slate-500">
              لا توجد بيانات مبيعات ضمن الفترة الحالية
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-3 py-1.5 text-right">التاريخ</th>
                    <th className="px-3 py-1.5 text-right">إجمالي المبيعات</th>
                    <th className="px-3 py-1.5 text-right">المبالغ المستردة</th>
                    <th className="px-3 py-1.5 text-right">الخصومات</th>
                    <th className="px-3 py-1.5 text-right">صافي المبيعات</th>
                    <th className="px-3 py-1.5 text-right">
                      تكلفة البضاعة المباعة
                    </th>
                    <th className="px-3 py-1.5 text-right">إجمالي الربح</th>
                  </tr>
                </thead>
                <tbody>
                  {chartRows.map((row) => (
                    <tr
                      key={row.dateKey}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-3 py-2.5 font-bold text-slate-900">
                        {row.dateLabel}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-slate-900">
                        {formatSar(row.totalSales)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">
                        {formatSar(row.refunds)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">
                        {formatSar(row.discounts)}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-slate-900">
                        {formatSar(row.netSales)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">
                        {formatSar(row.cogs)}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-slate-900">
                        {formatSar(row.grossProfit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (authLoading) {
    return (
      <div className="app-shell" dir="rtl">
        <div className="page-wrap text-right">
          <div className="page-card text-right">جاري التحقق من الصلاحية...</div>
        </div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="app-shell" dir="rtl">
        <div className="page-wrap text-right">
          <div className="page-card text-right">جارٍ التحويل...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell" dir="rtl">
      <div className="page-wrap text-right">
        <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="w-full xl:w-[280px] xl:min-w-[280px]">
            <div className="page-card !p-4 text-right" dir="rtl">
              <div className="mb-4 text-right">
                <h3 className="mt-1 text-2xl font-black text-slate-900">
                  {storeName}
                </h3>
                <p className="mt-2 text-sm leading-7 text-slate-500">
                  {displayedBranchName}
                </p>
              </div>

              <div className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                {roleLabel ? (
                  <span className="badge badge-blue">الصلاحية: {roleLabel}</span>
                ) : (
                  <span className="badge badge-slate">الصلاحية: غير معروفة</span>
                )}

                {isSystemAdmin ? (
                  <AdminBranchFilter
                    branches={branches}
                    selectedBranchId={selectedBranchId}
                    loading={loadingBranches}
                    onChange={setSelectedBranchId}
                    className="w-full"
                  />
                ) : null}
              </div>

              <div className="space-y-2 text-right">
                {sidebarMenuItems
                  .filter((item) => item.key !== 'whatsapp')
                  .map((item) => {
                    if (!item.visible) return null

                    if (item.key === 'reports') {
                      return (
                        <div key={item.key} className="space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              setReportsMenuOpen((current) => !current)
                            }}
                            className={`flex w-full items-center justify-end rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                              item.active || reportsMenuOpen
                                ? 'bg-slate-950 text-white'
                                : 'bg-slate-100 text-slate-800 hover:bg-slate-950 hover:text-white'
                            }`}
                          >
                            <span className="flex w-full items-center justify-between text-right">
                              <span className="flex-1 text-right">{item.label}</span>
                              <svg
                                className={`h-3 w-3 shrink-0 transition-transform ${
                                  reportsMenuOpen ? 'rotate-180' : 'rotate-0'
                                }`}
                                viewBox="0 0 20 20"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                aria-hidden="true"
                              >
                                <path
                                  d="M5 7.5L10 12.5L15 7.5"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </span>
                          </button>

                          {reportsMenuOpen ? (
                            <div className="space-y-1.5 pr-3 pb-1">
                              {reportsSubmenuItems.map((submenuItem) => (
                                <button
                                  key={submenuItem.key}
                                  type="button"
                                  onClick={() => {
                                    setActiveReportsSubmenu(submenuItem.key)
                                    setActiveWorkspace('reports')
                                    setReportsMenuOpen(true)
                                  }}
                                  className={`flex w-full items-center justify-end rounded-2xl px-3 py-2 text-right text-[13px] font-bold transition ${
                                    activeReportsSubmenu === submenuItem.key
                                      ? 'bg-slate-950 text-white'
                                      : 'bg-slate-100 text-slate-800 hover:bg-slate-950 hover:text-white'
                                  }`}
                                >
                                  <span className="w-full text-right">
                                    {submenuItem.label}
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )
                    }

                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => openWorkspace(item.key)}
                        className={`flex w-full items-center justify-end rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                          item.active
                            ? 'bg-slate-950 text-white'
                            : 'bg-slate-100 text-slate-800 hover:bg-slate-950 hover:text-white'
                        }`}
                      >
                        <span className="w-full text-right">{item.label}</span>
                      </button>
                    )
                  })}

                {sidebarMenuItems.some(
                  (item) => item.key === 'whatsapp' && item.visible
                ) ? (
                  <>
                    <div className="mt-2 border-t border-slate-200 pt-4 text-right text-sm font-bold text-slate-500">
                      Integrations
                    </div>

                    <button
                      type="button"
                      onClick={() => openWorkspace('whatsapp')}
                      className={`flex w-full items-center justify-end rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                        sidebarMenuItems.find((item) => item.key === 'whatsapp')?.active
                          ? 'bg-slate-950 text-white'
                          : 'bg-slate-100 text-slate-800 hover:bg-slate-950 hover:text-white'
                      }`}
                    >
                      <span className="w-full text-right">WhatsApp</span>
                    </button>
                  </>
                ) : null}
              </div>

              <div className="mt-4 border-t border-slate-200 pt-4">
                <button
                  onClick={handleLogout}
                  className="secondary-btn w-full"
                  type="button"
                >
                  تسجيل الخروج
                </button>
              </div>
            </div>
          </aside>

          <div className="min-w-0 grid gap-4 text-right">
            {isSalesSummaryView ? (
              <>
                <PageHeader
                  className="mb-1"
                  title={activeWorkspaceTitle}
                  subtitle={activeWorkspaceSubtitle}
                  actions={
                    <button
                      type="button"
                      onClick={() => openWorkspace('home')}
                      className="secondary-btn"
                    >
                      الرجوع للرئيسية
                    </button>
                  }
                />
                {renderSalesSummaryReport()}
              </>
            ) : (
              <div className="page-card !p-5 md:!p-6 text-right">
                <PageHeader
                  className="mb-4"
                  title={activeWorkspaceTitle}
                  subtitle={activeWorkspaceSubtitle}
                  actions={
                    activeWorkspace !== 'home' ? (
                      <button
                        type="button"
                        onClick={() => openWorkspace('home')}
                        className="secondary-btn"
                      >
                        الرجوع للرئيسية
                      </button>
                    ) : null
                  }
                />

                {activeWorkspace === 'home' ? (
                  renderHomeContent()
                ) : activeWorkspace === 'dashboard' ? (
                  renderSystemSummaryContent()
                ) : activeWorkspacePath ? (
                  <div className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                    {iframeLoading ? (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm">
                        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm">
                          جاري فتح {activeWorkspaceTitle}...
                        </div>
                      </div>
                    ) : null}

                    <iframe
                      ref={iframeRef}
                      key={activeWorkspacePath}
                      src={activeWorkspacePath}
                      title={activeWorkspaceTitle}
                      className="h-[1150px] w-full bg-white"
                      onLoad={() => {
                        setIframeLoading(false)
                      }}
                    />
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


import {
  buildExecutiveDashboardSummary,
  type ExecutiveDashboardSummary,
} from '@/lib/reports/executive-dashboard'
import type { ReportOrderRecord } from '@/lib/reports/core'

export type ComparisonRange = {
  start: string
  end: string
}

export type ComparisonSummary = ExecutiveDashboardSummary

export type ComparisonDelta = {
  totalSales: number
  totalOrders: number
  totalQuantity: number
  averageOrderValue: number
}

export type ComparisonData = {
  current: ComparisonSummary
  previous: ComparisonSummary
  delta: ComparisonDelta
  deltaPercentage: ComparisonDelta
}

export function buildComparisonData(
  orders: ReportOrderRecord[],
  range: ComparisonRange
): ComparisonData {
  const previousRange = buildPreviousComparisonRange(range)
  const currentOrders = filterOrdersByIsoRange(orders, range)
  const previousOrders = filterOrdersByIsoRange(orders, previousRange)
  const current = buildExecutiveDashboardSummary(currentOrders)
  const previous = buildExecutiveDashboardSummary(previousOrders)
  const delta = buildComparisonDelta(current, previous)

  return {
    current,
    previous,
    delta,
    deltaPercentage: buildComparisonDeltaPercentage(current, previous),
  }
}

export function buildPreviousComparisonRange(
  range: ComparisonRange
): ComparisonRange {
  const start = new Date(range.start)
  const end = new Date(range.end)

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start > end
  ) {
    return {
      start: '',
      end: '',
    }
  }

  const durationMs = end.getTime() - start.getTime()
  const previousEnd = new Date(start.getTime() - 1)
  const previousStart = new Date(previousEnd.getTime() - durationMs)

  return {
    start: previousStart.toISOString(),
    end: previousEnd.toISOString(),
  }
}

function filterOrdersByIsoRange(
  orders: ReportOrderRecord[],
  range: ComparisonRange
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

function buildComparisonDelta(
  current: ComparisonSummary,
  previous: ComparisonSummary
): ComparisonDelta {
  return {
    totalSales: current.totalSales - previous.totalSales,
    totalOrders: current.totalOrders - previous.totalOrders,
    totalQuantity: current.totalQuantity - previous.totalQuantity,
    averageOrderValue:
      current.averageOrderValue - previous.averageOrderValue,
  }
}

function buildComparisonDeltaPercentage(
  current: ComparisonSummary,
  previous: ComparisonSummary
): ComparisonDelta {
  return {
    totalSales: calculateDeltaPercentage(
      current.totalSales,
      previous.totalSales
    ),
    totalOrders: calculateDeltaPercentage(
      current.totalOrders,
      previous.totalOrders
    ),
    totalQuantity: calculateDeltaPercentage(
      current.totalQuantity,
      previous.totalQuantity
    ),
    averageOrderValue: calculateDeltaPercentage(
      current.averageOrderValue,
      previous.averageOrderValue
    ),
  }
}

function calculateDeltaPercentage(current: number, previous: number) {
  if (previous === 0) {
    return 0
  }

  return ((current - previous) / previous) * 100
}

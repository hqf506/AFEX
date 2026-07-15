import {
  buildReportDateRange,
  type ReportOrderRecord,
  type ReportRange,
} from '@/lib/reports/core'
import { buildSalesTrendRows } from '@/lib/reports/sales-trend'

export function filterDashboardOrdersByRange(
  orders: ReportOrderRecord[],
  startValue: string,
  endValue: string
) {
  const start = new Date(startValue).getTime()
  const end = new Date(endValue).getTime()

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return []
  }

  return orders.filter((order) => {
    const createdAt = new Date(order.created_at).getTime()
    return Number.isFinite(createdAt) && createdAt >= start && createdAt <= end
  })
}

export function buildDashboardPeriodPayload(
  orders: ReportOrderRecord[],
  options: {
    range: ReportRange
    dateFrom: string
    dateTo: string
    includeDetails: boolean
  }
) {
  let totalSales = 0
  let activeOrdersCount = 0
  const customerNames = new Set<string>()

  for (const order of orders) {
    totalSales += order.total
    if (order.status !== 'closed') activeOrdersCount += 1

    const customerName = order.customer_name.trim()
    if (customerName) customerNames.add(customerName)
  }

  const summary = {
    totalSales,
    totalOrders: orders.length,
  }

  if (!options.includeDetails) {
    return {
      summary,
      uniqueCustomersCount: customerNames.size,
      activeOrdersCount,
    }
  }

  const categories = new Map<
    string,
    { categoryKey: string; categoryName: string; grossSales: number }
  >()

  for (const order of orders) {
    for (const item of order.items) {
      const categoryName = item.category.trim()
      const current = categories.get(categoryName) ?? {
        categoryKey: categoryName,
        categoryName,
        grossSales: 0,
      }
      current.grossSales += Number(item.line_total) || 0
      categories.set(categoryName, current)
    }
  }

  const { fromIso, toIso } = buildReportDateRange(
    options.range,
    options.dateFrom,
    options.dateTo
  )
  const topCategories = [...categories.values()]
    .sort((left, right) => {
      if (left.grossSales !== right.grossSales) {
        return right.grossSales - left.grossSales
      }

      return left.categoryKey.localeCompare(right.categoryKey)
    })
    .slice(0, 5)
  const trend = buildSalesTrendRows(orders, 'day', {
    start: fromIso,
    end: toIso,
  }).map((period) => ({
    periodKey: period.periodKey,
    periodLabel: period.periodLabel,
    grossSales: period.grossSales,
  }))

  return {
    summary,
    uniqueCustomersCount: customerNames.size,
    activeOrdersCount,
    topCategories,
    trend,
    recentOrders: orders.slice(0, 5).map((order) => ({
      id: order.id,
      order_number: order.order_number,
      customer_name: order.customer_name,
      status: order.status,
      total: order.total,
    })),
  }
}

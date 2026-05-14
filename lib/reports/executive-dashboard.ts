import {
  buildReportDateRange,
  type ReportOrderRecord,
  type ReportRange,
  type SalesByCategoryRow,
  type SalesByCustomerRow,
  type SalesByItemRow,
} from '@/lib/reports/core'
import { buildSalesByCategoryRows } from '@/lib/reports/sales-by-category'
import { buildSalesByCustomerRows } from '@/lib/reports/sales-by-customer'
import { buildSalesByItemRows } from '@/lib/reports/sales-by-item'
import {
  buildSalesTrendRows,
  type SalesTrendGrouping,
  type SalesTrendRange,
  type SalesTrendRow,
} from '@/lib/reports/sales-trend'

export type ExecutiveDashboardSummary = {
  totalSales: number
  totalOrders: number
  totalQuantity: number
  averageOrderValue: number
}

export type DashboardData = {
  summary: ExecutiveDashboardSummary
  topItems: SalesByItemRow[]
  topCategories: SalesByCategoryRow[]
  topCustomers: SalesByCustomerRow[]
  trend: SalesTrendRow[]
}

export type ExecutiveDashboardOptions = {
  range: ReportRange
  dateFrom: string
  dateTo?: string
  trendGrouping?: SalesTrendGrouping
  topLimit?: number
}

export function buildExecutiveDashboardData(
  orders: ReportOrderRecord[],
  options: ExecutiveDashboardOptions
): DashboardData {
  const topLimit = options.topLimit ?? 5
  const trendGrouping = options.trendGrouping ?? 'day'
  const trendRange = buildExecutiveDashboardTrendRange(
    options.range,
    options.dateFrom,
    options.dateTo || options.dateFrom
  )

  const summary = buildExecutiveDashboardSummary(orders)
  const topItems = buildSalesByItemRows(orders)
    .sort((left, right) => {
      if (left.grossSales !== right.grossSales) {
        return right.grossSales - left.grossSales
      }

      return left.itemKey.localeCompare(right.itemKey)
    })
    .slice(0, topLimit)
  const topCategories = buildSalesByCategoryRows(orders)
    .sort((left, right) => {
      if (left.grossSales !== right.grossSales) {
        return right.grossSales - left.grossSales
      }

      return left.categoryKey.localeCompare(right.categoryKey)
    })
    .slice(0, topLimit)
  const topCustomers = buildSalesByCustomerRows(orders)
    .sort((left, right) => {
      if (left.grossSales !== right.grossSales) {
        return right.grossSales - left.grossSales
      }

      return left.customerKey.localeCompare(right.customerKey)
    })
    .slice(0, topLimit)
  const trend = buildSalesTrendRows(orders, trendGrouping, trendRange)

  return {
    summary,
    topItems,
    topCategories,
    topCustomers,
    trend,
  }
}

export function buildExecutiveDashboardSummary(
  orders: ReportOrderRecord[]
): ExecutiveDashboardSummary {
  const totalSales = orders.reduce((sum, order) => sum + order.total, 0)
  const totalOrders = orders.length
  const totalQuantity = orders.reduce((sum, order) => {
    return (
      sum +
      order.items.reduce((itemSum, item) => itemSum + (Number(item.quantity) || 0), 0)
    )
  }, 0)

  return {
    totalSales,
    totalOrders,
    totalQuantity,
    averageOrderValue: totalOrders > 0 ? totalSales / totalOrders : 0,
  }
}

export function buildExecutiveDashboardTrendRange(
  range: ReportRange,
  dateFrom: string,
  dateTo: string
): SalesTrendRange {
  const { fromIso, toIso } = buildReportDateRange(range, dateFrom, dateTo)

  return {
    start: fromIso,
    end: toIso,
  }
}

import type {
  ReportOrderRecord,
  SalesByCategoryRow,
} from '@/lib/reports/core'

function normalizeCategoryText(value: string) {
  return typeof value === 'string' ? value.trim() : ''
}

export function buildSalesByCategoryRows(
  orders: ReportOrderRecord[]
): SalesByCategoryRow[] {
  const grouped = new Map<
    string,
    {
      categoryKey: string
      categoryName: string
      quantitySold: number
      grossSales: number
      totalCost: number
      profit: number
      knownCostQuantity: number
      orderIds: Set<string>
    }
  >()

  for (const order of orders) {
    for (const item of order.items) {
      const categoryName = normalizeCategoryText(item.category)
      const categoryKey = categoryName

      const current = grouped.get(categoryKey) ?? {
        categoryKey,
        categoryName,
        quantitySold: 0,
        grossSales: 0,
        totalCost: 0,
        profit: 0,
        knownCostQuantity: 0,
        orderIds: new Set<string>(),
      }

      current.quantitySold += Number(item.quantity) || 0
      current.grossSales += Number(item.line_total) || 0
      current.totalCost += Number(item.cost_total) || 0
      current.profit += Number(item.profit) || 0

      if (item.has_known_cost) {
        current.knownCostQuantity += Number(item.quantity) || 0
      }

      current.orderIds.add(order.id)
      grouped.set(categoryKey, current)
    }
  }

  return [...grouped.values()]
    .map((row) => ({
      categoryKey: row.categoryKey,
      categoryName: row.categoryName,
      quantitySold: row.quantitySold,
      grossSales: row.grossSales,
      totalCost: row.totalCost,
      profit: row.profit,
      knownCostQuantity: row.knownCostQuantity,
      ordersCount: row.orderIds.size,
      averageUnitPrice:
        row.quantitySold > 0 ? row.grossSales / row.quantitySold : 0,
    }))
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName))
}

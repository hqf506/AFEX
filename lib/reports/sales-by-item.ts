import type { ReportOrderRecord, SalesByItemRow } from '@/lib/reports/core'

function normalizeItemText(value: string) {
  return typeof value === 'string' ? value.trim() : ''
}

export function buildSalesByItemRows(
  orders: ReportOrderRecord[]
): SalesByItemRow[] {
  const grouped = new Map<
    string,
    {
      itemKey: string
      itemName: string
      itemType: string
      itemCategory: string
      quantitySold: number
      grossSales: number
      totalCost: number
      profit: number
      knownCostQuantity: number
      weightedSaleTotal: number
      weightedCostTotal: number
      orderIds: Set<string>
    }
  >()

  for (const order of orders) {
    for (const item of order.items) {
      const itemName = normalizeItemText(item.name)
      const itemType = normalizeItemText(item.type)
      const itemCategory = normalizeItemText(item.category)
      const itemKey = `${itemType}::${itemCategory}::${itemName}`

      const current = grouped.get(itemKey) ?? {
        itemKey,
        itemName,
        itemType,
        itemCategory,
        quantitySold: 0,
        grossSales: 0,
        totalCost: 0,
        profit: 0,
        knownCostQuantity: 0,
        weightedSaleTotal: 0,
        weightedCostTotal: 0,
        orderIds: new Set<string>(),
      }

      current.quantitySold += Number(item.quantity) || 0
      current.grossSales += Number(item.line_total) || 0
      current.totalCost += Number(item.cost_total) || 0
      current.profit += Number(item.profit) || 0
      current.weightedSaleTotal +=
        (Number(item.unit_price) || 0) * (Number(item.quantity) || 0)

      if (item.has_known_cost) {
        current.knownCostQuantity += Number(item.quantity) || 0
        current.weightedCostTotal +=
          (Number(item.cost_price) || 0) * (Number(item.quantity) || 0)
      }

      current.orderIds.add(order.id)
      grouped.set(itemKey, current)
    }
  }

  return [...grouped.values()]
    .map((row) => ({
      itemKey: row.itemKey,
      itemName: row.itemName,
      itemType: row.itemType,
      itemCategory: row.itemCategory,
      quantitySold: row.quantitySold,
      salePrice: row.quantitySold > 0 ? row.weightedSaleTotal / row.quantitySold : 0,
      costPrice:
        row.knownCostQuantity > 0
          ? row.weightedCostTotal / row.knownCostQuantity
          : 0,
      grossSales: row.grossSales,
      totalCost: row.totalCost,
      profit: row.profit,
      knownCostQuantity: row.knownCostQuantity,
      ordersCount: row.orderIds.size,
      averageUnitPrice:
        row.quantitySold > 0 ? row.grossSales / row.quantitySold : 0,
    }))
    .sort((a, b) => {
      if (a.itemName !== b.itemName) {
        return a.itemName.localeCompare(b.itemName)
      }

      if (a.itemCategory !== b.itemCategory) {
        return a.itemCategory.localeCompare(b.itemCategory)
      }

      return a.itemType.localeCompare(b.itemType)
    })
}

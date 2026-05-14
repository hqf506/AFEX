import type {
  ReportOrderRecord,
  SalesByCustomerRow,
} from '@/lib/reports/core'

export function normalizeCustomerText(value: string) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized && normalized !== '—' ? normalized : ''
}

export function normalizeCustomerPhone(value: string) {
  const normalized = normalizeCustomerText(value)

  if (!normalized) return ''

  return normalized.replace(/[\s()+-]/g, '')
}

export function resolveCustomerGroupingKey(order: ReportOrderRecord) {
  const customerName = normalizeCustomerText(order.customer_name)
  const customerPhone = normalizeCustomerPhone(order.customer_phone)

  if (customerPhone) {
    return {
      customerKey: `phone:${customerPhone}`,
      customerName,
      customerPhone,
    }
  }

  if (customerName) {
    return {
      customerKey: `name:${customerName.toLocaleLowerCase('ar')}`,
      customerName,
      customerPhone: '',
    }
  }

  return {
    customerKey: `unknown-order:${order.id}`,
    customerName: '',
    customerPhone: '',
  }
}

export function buildSalesByCustomerRows(
  orders: ReportOrderRecord[]
): SalesByCustomerRow[] {
  const grouped = new Map<
    string,
    {
      customerKey: string
      customerName: string
      customerPhone: string
      orderIds: Set<string>
      quantitySold: number
      grossSales: number
      totalCost: number
      profit: number
      knownCostQuantity: number
    }
  >()

  for (const order of orders) {
    const identity = resolveCustomerGroupingKey(order)
    const current = grouped.get(identity.customerKey) ?? {
      customerKey: identity.customerKey,
      customerName: identity.customerName,
      customerPhone: identity.customerPhone,
      orderIds: new Set<string>(),
      quantitySold: 0,
      grossSales: 0,
      totalCost: 0,
      profit: 0,
      knownCostQuantity: 0,
    }

    current.orderIds.add(order.id)
    current.quantitySold += order.items.reduce(
      (sum, item) => sum + (Number(item.quantity) || 0),
      0
    )
    current.grossSales += order.items.reduce(
      (sum, item) => sum + (Number(item.line_total) || 0),
      0
    )
    current.totalCost += order.items.reduce(
      (sum, item) => sum + (Number(item.cost_total) || 0),
      0
    )
    current.profit += order.items.reduce(
      (sum, item) => sum + (Number(item.profit) || 0),
      0
    )
    current.knownCostQuantity += order.items.reduce(
      (sum, item) => sum + (item.has_known_cost ? Number(item.quantity) || 0 : 0),
      0
    )

    if (!current.customerName && identity.customerName) {
      current.customerName = identity.customerName
    }

    if (!current.customerPhone && identity.customerPhone) {
      current.customerPhone = identity.customerPhone
    }

    grouped.set(identity.customerKey, current)
  }

  return [...grouped.values()]
    .map((row) => ({
      customerKey: row.customerKey,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      ordersCount: row.orderIds.size,
      quantitySold: row.quantitySold,
      grossSales: row.grossSales,
      totalCost: row.totalCost,
      profit: row.profit,
      knownCostQuantity: row.knownCostQuantity,
      averageOrderValue:
        row.orderIds.size > 0 ? row.grossSales / row.orderIds.size : 0,
    }))
    .sort((a, b) => {
      const nameComparison = a.customerName.localeCompare(b.customerName)

      if (nameComparison !== 0) {
        return nameComparison
      }

      const phoneComparison = a.customerPhone.localeCompare(b.customerPhone)

      if (phoneComparison !== 0) {
        return phoneComparison
      }

      return a.customerKey.localeCompare(b.customerKey)
    })
}

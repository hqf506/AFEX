import type { ReportOrderRecord } from '@/lib/reports/core'

export type SalesTrendGrouping = 'day' | 'week' | 'month'

export type SalesTrendRow = {
  periodKey: string
  periodLabel: string
  ordersCount: number
  quantitySold: number
  grossSales: number
  averageOrderValue: number
}

export type SalesTrendRange = {
  start: string
  end: string
}

type SalesTrendAccumulator = {
  periodKey: string
  periodLabel: string
  orderIds: Set<string>
  quantitySold: number
  grossSales: number
}

export function buildSalesTrendRows(
  orders: ReportOrderRecord[],
  grouping: SalesTrendGrouping,
  range: SalesTrendRange
): SalesTrendRow[] {
  const rangeStart = getOrderUtcDate(range.start)
  const rangeEnd = getOrderUtcDate(range.end)

  if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) {
    return []
  }

  const validOrders = orders.filter((order) => getOrderUtcDate(order.created_at))

  if (validOrders.length === 0) {
    return []
  }

  const grouped = new Map<string, SalesTrendAccumulator>()

  for (const order of validOrders) {
    const orderDate = getOrderUtcDate(order.created_at)

    if (!orderDate) continue

    const periodKey = getPeriodKey(orderDate, grouping)
    const periodLabel = getPeriodLabel(periodKey, grouping)
    const current = grouped.get(periodKey) ?? {
      periodKey,
      periodLabel,
      orderIds: new Set<string>(),
      quantitySold: 0,
      grossSales: 0,
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

    grouped.set(periodKey, current)
  }
  const timelineKeys = buildTimelinePeriodKeys(rangeStart, rangeEnd, grouping)

  return timelineKeys.map((periodKey) => {
    const row = grouped.get(periodKey)

    if (!row) {
      return {
        periodKey,
        periodLabel: getPeriodLabel(periodKey, grouping),
        ordersCount: 0,
        quantitySold: 0,
        grossSales: 0,
        averageOrderValue: 0,
      }
    }

    return {
      periodKey: row.periodKey,
      periodLabel: row.periodLabel,
      ordersCount: row.orderIds.size,
      quantitySold: row.quantitySold,
      grossSales: row.grossSales,
      averageOrderValue:
        row.orderIds.size > 0 ? row.grossSales / row.orderIds.size : 0,
    }
  })
}

function getOrderUtcDate(value: string) {
  const normalized = value.trim()

  if (!normalized || normalized === '—') return null

  const parsed = new Date(normalized)

  if (Number.isNaN(parsed.getTime())) return null

  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate())
  )
}

function getPeriodKey(date: Date, grouping: SalesTrendGrouping) {
  if (grouping === 'day') {
    return formatUtcDateKey(date)
  }

  if (grouping === 'week') {
    return formatUtcDateKey(startOfUtcWeek(date))
  }

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function getPeriodLabel(periodKey: string, grouping: SalesTrendGrouping) {
  if (grouping === 'day') {
    return periodKey
  }

  if (grouping === 'week') {
    const start = parseUtcDateKey(periodKey)
    const end = addUtcDays(start, 6)
    return `${formatUtcDateKey(start)} - ${formatUtcDateKey(end)}`
  }

  return periodKey
}

function buildTimelinePeriodKeys(
  fromDate: Date,
  toDate: Date,
  grouping: SalesTrendGrouping
) {
  if (grouping === 'day') {
    const keys: string[] = []
    let cursor = fromDate

    while (cursor <= toDate) {
      keys.push(formatUtcDateKey(cursor))
      cursor = addUtcDays(cursor, 1)
    }

    return keys
  }

  if (grouping === 'week') {
    const keys: string[] = []
    let cursor = startOfUtcWeek(fromDate)
    const end = startOfUtcWeek(toDate)

    while (cursor <= end) {
      keys.push(formatUtcDateKey(cursor))
      cursor = addUtcDays(cursor, 7)
    }

    return keys
  }

  const keys: string[] = []
  let year = fromDate.getUTCFullYear()
  let month = fromDate.getUTCMonth()
  const endYear = toDate.getUTCFullYear()
  const endMonth = toDate.getUTCMonth()

  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${year}-${String(month + 1).padStart(2, '0')}`)
    month += 1

    if (month > 11) {
      month = 0
      year += 1
    }
  }

  return keys
}

function startOfUtcWeek(date: Date) {
  const next = new Date(date.getTime())
  const day = next.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  next.setUTCDate(next.getUTCDate() + diff)
  next.setUTCHours(0, 0, 0, 0)
  return next
}

function addUtcDays(date: Date, amount: number) {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + amount)
  next.setUTCHours(0, 0, 0, 0)
  return next
}

function formatUtcDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    '0'
  )}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function parseUtcDateKey(value: string) {
  const [yearText = '0', monthText = '1', dayText = '1'] = value.split('-')
  return new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText), 0, 0, 0, 0)
  )
}

import type { ReportOrderRecord } from '@/lib/reports/core'

export type EmployeeProfileSource = {
  id: string
  full_name?: string | null
  username?: string | null
  role?: string | null
}

export type EmployeeReportOrder = ReportOrderRecord & {
  employeeId: string | null
}

export type SalesByEmployeeRow = {
  employeeKey: string
  employeeId: string | null
  employeeName: string
  username: string | null
  role: string | null
  grossSales: number
  refunds: number
  discounts: number
  netSales: number
  receiptsCount: number
  averageSale: number
  registeredCustomersCount: number
}

function normalizeValue(value: string | null | undefined): string {
  return (value ?? '').trim()
}

function getCustomerKey(order: ReportOrderRecord): string | null {
  const phone = normalizeValue(order.customer_phone)
  if (phone && phone !== '—') {
    return `phone:${phone}`
  }

  const name = normalizeValue(order.customer_name)
  if (name && name !== 'عميل غير محدد') {
    return `name:${name}`
  }

  return null
}

export function buildSalesByEmployeeRows(
  orders: EmployeeReportOrder[],
  profiles: EmployeeProfileSource[],
): SalesByEmployeeRow[] {
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]))
  const customersByEmployee = new Map<string, Set<string>>()
  const rowsByEmployee = new Map<string, SalesByEmployeeRow>()

  orders.forEach((order) => {
    const employeeKey = order.employeeId ?? 'unknown'
    const profile = order.employeeId ? profilesById.get(order.employeeId) : undefined
    const employeeName = normalizeValue(profile?.full_name) || normalizeValue(profile?.username) || 'غير محدد'
    const username = normalizeValue(profile?.username) || null
    const role = normalizeValue(profile?.role) || null
    const existing = rowsByEmployee.get(employeeKey)

    const row =
      existing ??
      {
        employeeKey,
        employeeId: order.employeeId,
        employeeName,
        username,
        role,
        grossSales: 0,
        refunds: 0,
        discounts: 0,
        netSales: 0,
        receiptsCount: 0,
        averageSale: 0,
        registeredCustomersCount: 0,
      }

    const grossSale = order.subtotal > 0 ? order.subtotal : order.total
    const refund = 0

    row.grossSales += grossSale
    row.refunds += refund
    row.discounts += order.discount
    row.netSales += Math.max(order.total - refund, 0)
    row.receiptsCount += 1

    const customerKey = getCustomerKey(order)
    if (customerKey) {
      const customerSet = customersByEmployee.get(employeeKey) ?? new Set<string>()
      customerSet.add(customerKey)
      customersByEmployee.set(employeeKey, customerSet)
    }

    rowsByEmployee.set(employeeKey, row)
  })

  return Array.from(rowsByEmployee.values())
    .map((row) => {
      const customers = customersByEmployee.get(row.employeeKey)
      const averageSale = row.receiptsCount > 0 ? row.netSales / row.receiptsCount : 0

      return {
        ...row,
        averageSale,
        registeredCustomersCount: customers?.size ?? 0,
      }
    })
    .sort((a, b) => b.netSales - a.netSales)
}

'use client'

import { mapOrderSummaryToOrderRecord, type OrderRecord } from './orders-page'
import { normalizeOrderRecord, type OrderSourceRow } from './normalize'

export async function readOfflineOrderRecords(): Promise<OrderRecord[]> {
  const { readOfflineRecentOrders } = await import('@/lib/offline/complete-runtime')
  const rows = (await readOfflineRecentOrders()) as OrderSourceRow[]
  return rows.map((row, index) =>
    mapOrderSummaryToOrderRecord(normalizeOrderRecord(row, index))
  )
}

export async function readOfflineOrderRecord(orderId: string) {
  const orders = await readOfflineOrderRecords()
  return orders.find((order) => order.id === orderId) ?? null
}

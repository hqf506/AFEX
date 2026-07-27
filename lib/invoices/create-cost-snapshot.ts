import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

type CostSnapshotClient = Pick<SupabaseClient, 'from'>

type InvoiceItemRow = {
  id: string
  item_id: string | null
  item_name_snapshot: string
  item_type_snapshot: string
}

type CatalogCostRow = {
  id: string
  name: string
  item_type: string
  cost_price: number | string | null
}

export class InvoiceCostSnapshotError extends Error {
  constructor(
    readonly code:
      | 'INVOICE_LOOKUP_FAILED'
      | 'INVOICE_NOT_FOUND'
      | 'INVOICE_ITEMS_LOOKUP_FAILED'
      | 'CATALOG_LOOKUP_FAILED'
      | 'SNAPSHOT_UPDATE_FAILED'
  ) {
    super(code)
    this.name = 'InvoiceCostSnapshotError'
  }
}

function normalizeLookupText(value: string | null | undefined) {
  return (value || '').trim().toLowerCase()
}

function normalizeCost(value: number | string | null | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function createInvoiceCostSnapshot({
  supabase,
  tenantId,
  branchId,
  invoiceId,
}: {
  supabase: CostSnapshotClient
  tenantId: string
  branchId?: string | null
  invoiceId: string
}) {
  let invoiceQuery = supabase
    .from('invoices')
    .select('id')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)

  if (branchId) {
    invoiceQuery = invoiceQuery.eq('branch_id', branchId)
  }

  const { data: invoice, error: invoiceError } =
    await invoiceQuery.maybeSingle()

  if (invoiceError) {
    throw new InvoiceCostSnapshotError('INVOICE_LOOKUP_FAILED')
  }

  if (!invoice) {
    throw new InvoiceCostSnapshotError('INVOICE_NOT_FOUND')
  }

  const { data: persistedItems, error: invoiceItemsError } = await supabase
    .from('invoice_items')
    .select('id, item_id, item_name_snapshot, item_type_snapshot')
    .eq('invoice_id', invoiceId)
    .eq('tenant_id', tenantId)

  if (invoiceItemsError) {
    throw new InvoiceCostSnapshotError('INVOICE_ITEMS_LOOKUP_FAILED')
  }

  const invoiceItems = (persistedItems || []) as InvoiceItemRow[]

  if (invoiceItems.length === 0) {
    return { updated: 0 }
  }

  const itemIds = [
    ...new Set(
      invoiceItems
        .map((item) => item.item_id?.trim() || '')
        .filter(Boolean)
    ),
  ]
  const itemNames = [
    ...new Set(
      invoiceItems
        .map((item) => item.item_name_snapshot?.trim() || '')
        .filter(Boolean)
    ),
  ]

  let catalogQuery = supabase
    .from('catalog_items')
    .select('id, name, item_type, cost_price')
    .eq('tenant_id', tenantId)

  catalogQuery =
    itemIds.length > 0
      ? catalogQuery.in('id', itemIds)
      : catalogQuery.in('name', itemNames)

  const { data: catalogData, error: catalogError } = await catalogQuery

  if (catalogError) {
    throw new InvoiceCostSnapshotError('CATALOG_LOOKUP_FAILED')
  }

  const catalogRows = (catalogData || []) as CatalogCostRow[]
  const costsById = new Map<string, number>()
  const costsByNameAndType = new Map<string, number>()

  for (const item of catalogRows) {
    const cost = normalizeCost(item.cost_price)
    costsById.set(item.id, cost)
    costsByNameAndType.set(
      `${normalizeLookupText(item.item_type)}::${normalizeLookupText(item.name)}`,
      cost
    )
  }

  let updated = 0

  for (const item of invoiceItems) {
    const costPrice =
      (item.item_id ? costsById.get(item.item_id) : undefined) ??
      costsByNameAndType.get(
        `${normalizeLookupText(item.item_type_snapshot)}::${normalizeLookupText(item.item_name_snapshot)}`
      ) ??
      0

    const { error: updateError } = await supabase
      .from('invoice_items')
      .update({ cost_price: costPrice })
      .eq('id', item.id)
      .eq('invoice_id', invoiceId)
      .eq('tenant_id', tenantId)

    if (updateError) {
      throw new InvoiceCostSnapshotError('SNAPSHOT_UPDATE_FAILED')
    }

    updated += 1
  }

  return { updated }
}

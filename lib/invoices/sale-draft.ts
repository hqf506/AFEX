import type { InvoiceLineItem } from '@/lib/invoices/items'

export const INVOICE_SALE_ITEMS_STORAGE_KEY = 'invoice_sale_items'

export type InvoiceSaleItemsDraft = {
  items: InvoiceLineItem[]
}

export function serializeInvoiceSaleItemsDraft(
  draft: InvoiceSaleItemsDraft
) {
  return JSON.stringify({
    items: draft.items,
  })
}

export function parseStoredInvoiceSaleItemsDraft(raw: string | null) {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<InvoiceSaleItemsDraft> | null

    if (!parsed || !Array.isArray(parsed.items)) {
      return null
    }

    const items = parsed.items.filter(
      (item): item is InvoiceLineItem =>
        Boolean(item) &&
        typeof item.item_name === 'string' &&
        (item.item_type === 'product' || item.item_type === 'service') &&
        typeof item.quantity === 'number' &&
        typeof item.unit_price === 'number'
    )

    return {
      items,
    }
  } catch {
    return null
  }
}

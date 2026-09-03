export type PosSaleDraftStorageKeys = {
  customer: string
  items: string
  checkout: string
}

type ReadableStorage = Pick<Storage, 'getItem'>

export function hasPersistedInvoiceSaleDraft(storage: ReadableStorage, keys: PosSaleDraftStorageKeys) {
  const parse = (raw: string | null) => { try { return raw ? JSON.parse(raw) as Record<string, unknown> : null } catch { return null } }
  const customer = parse(storage.getItem(keys.customer))
  const items = parse(storage.getItem(keys.items))
  const checkout = parse(storage.getItem(keys.checkout))
  return Boolean(
    customer && (customer.customerId || customer.name || customer.phone) ||
    items && Array.isArray(items.items) && items.items.length > 0 ||
    checkout && (checkout.selectedDiscount || String(checkout.note || '').trim())
  )
}

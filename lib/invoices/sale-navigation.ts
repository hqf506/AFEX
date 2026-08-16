import { INVOICE_CUSTOMER_STORAGE_KEY } from './customer'
import { INVOICE_SALE_ITEMS_STORAGE_KEY } from './sale-draft'
import type { PosPaymentMethod } from './payment-method'
import { hasPersistedInvoiceSaleDraft as hasDraft } from './sale-navigation-decision'

export const INVOICE_SALE_CHECKOUT_STORAGE_KEY = 'invoice_sale_checkout'

export type InvoiceSaleCheckoutDraft = {
  paymentMethod: PosPaymentMethod
  selectedDiscount: { id: string; name: string; type: 'percentage' | 'fixed'; value: number; branch_id: string | null } | null
  note: string
  cashReceivedInput: string
}

export function parseStoredInvoiceSaleCheckoutDraft(raw: string | null): InvoiceSaleCheckoutDraft | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<InvoiceSaleCheckoutDraft> | null
    if (!parsed) return null
    const paymentMethod = ['mada', 'cash', 'visa', 'cod'].includes(String(parsed.paymentMethod))
      ? parsed.paymentMethod as PosPaymentMethod
      : 'mada'
    const discount = parsed.selectedDiscount
    const selectedDiscount = discount && typeof discount.id === 'string' && typeof discount.name === 'string' &&
      (discount.type === 'percentage' || discount.type === 'fixed') && Number.isFinite(Number(discount.value))
      ? { id: discount.id, name: discount.name, type: discount.type, value: Number(discount.value), branch_id: typeof discount.branch_id === 'string' ? discount.branch_id : null }
      : null
    return {
      paymentMethod,
      selectedDiscount,
      note: typeof parsed.note === 'string' ? parsed.note : '',
      cashReceivedInput: typeof parsed.cashReceivedInput === 'string' ? parsed.cashReceivedInput : '',
    }
  } catch {
    return null
  }
}

export function serializeInvoiceSaleCheckoutDraft(draft: InvoiceSaleCheckoutDraft) {
  return JSON.stringify(draft)
}

export function hasPersistedInvoiceSaleDraft(storage: Pick<Storage, 'getItem'>) {
  return hasDraft(storage, { customer: INVOICE_CUSTOMER_STORAGE_KEY, items: INVOICE_SALE_ITEMS_STORAGE_KEY, checkout: INVOICE_SALE_CHECKOUT_STORAGE_KEY })
}

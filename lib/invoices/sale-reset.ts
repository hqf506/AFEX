import { INVOICE_CUSTOMER_STORAGE_KEY } from '@/lib/invoices/customer'
import { INVOICE_SALE_ITEMS_STORAGE_KEY } from '@/lib/invoices/sale-draft'
import { INVOICE_SUCCESS_STORAGE_KEY } from '@/lib/invoices/success'
import { clearPosCheckoutIdentity } from '@/lib/pos-checkout-identity'

export function hasCompletedInvoiceSaleState() {
  if (typeof window === 'undefined') return false
  return Boolean(window.sessionStorage.getItem(INVOICE_SUCCESS_STORAGE_KEY))
}

export function clearCompletedInvoiceDraftState() {
  if (typeof window === 'undefined') return

  window.localStorage.removeItem(INVOICE_CUSTOMER_STORAGE_KEY)
  window.localStorage.removeItem(INVOICE_SALE_ITEMS_STORAGE_KEY)
  window.sessionStorage.removeItem(INVOICE_SUCCESS_STORAGE_KEY)
}

export function clearCompletedInvoiceSaleState() {
  clearCompletedInvoiceDraftState()
  clearPosCheckoutIdentity()
}

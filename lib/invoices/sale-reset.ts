import { INVOICE_CUSTOMER_STORAGE_KEY } from '@/lib/invoices/customer'
import { INVOICE_SALE_ITEMS_STORAGE_KEY } from '@/lib/invoices/sale-draft'
import { INVOICE_SUCCESS_STORAGE_KEY } from '@/lib/invoices/success'
import { INVOICE_SALE_CHECKOUT_STORAGE_KEY } from '@/lib/invoices/sale-navigation'
import { clearPosCheckoutIdentity } from '@/lib/pos-checkout-identity'
import { clearClientResourcesByPrefix } from '@/lib/client-resource-cache'

export const INVOICE_SALE_CYCLE_STORAGE_KEY = 'invoice_sale_cycle'

export function readInvoiceSaleCycle() {
  if (typeof window === 'undefined') return 0

  const stored = Number.parseInt(
    window.sessionStorage.getItem(INVOICE_SALE_CYCLE_STORAGE_KEY) || '0',
    10
  )
  return Number.isSafeInteger(stored) && stored >= 0 ? stored : 0
}

export function hasCompletedInvoiceSaleState() {
  if (typeof window === 'undefined') return false
  return Boolean(window.sessionStorage.getItem(INVOICE_SUCCESS_STORAGE_KEY))
}

export function clearCompletedInvoiceDraftState() {
  if (typeof window === 'undefined') return

  window.localStorage.removeItem(INVOICE_CUSTOMER_STORAGE_KEY)
  window.localStorage.removeItem(INVOICE_SALE_ITEMS_STORAGE_KEY)
  window.localStorage.removeItem(INVOICE_SALE_CHECKOUT_STORAGE_KEY)
  window.sessionStorage.removeItem(INVOICE_SUCCESS_STORAGE_KEY)
}

export function clearCompletedInvoiceSaleState() {
  clearCompletedInvoiceDraftState()
  clearPosCheckoutIdentity()
}

export function beginNewInvoiceSaleCycle() {
  if (typeof window === 'undefined') return 0

  clearCompletedInvoiceSaleState()
  clearClientResourcesByPrefix('recent-customers:')
  clearClientResourcesByPrefix('customer-search:')

  const nextCycle = readInvoiceSaleCycle() + 1
  window.sessionStorage.setItem(INVOICE_SALE_CYCLE_STORAGE_KEY, String(nextCycle))
  return nextCycle
}

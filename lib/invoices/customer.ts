export const INVOICE_CUSTOMER_STORAGE_KEY = 'invoice_customer'

export type InvoiceCustomerDraft = {
  name: string
  phone: string
}

export function isInvoiceCustomerDraftValid(name: string, phone: string) {
  return name.trim().length > 1 && phone.trim().length >= 9
}

export function serializeInvoiceCustomerDraft(customer: InvoiceCustomerDraft) {
  return JSON.stringify({
    name: customer.name,
    phone: customer.phone,
  })
}

export function parseStoredInvoiceCustomerDraft(raw: string | null) {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<InvoiceCustomerDraft> | null

    if (!parsed?.name || !parsed?.phone) {
      return null
    }

    return {
      name: parsed.name,
      phone: parsed.phone,
    }
  } catch {
    return null
  }
}

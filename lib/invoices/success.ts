import type { InvoiceLineItem, CreatedInvoiceRecord } from '@/lib/invoices/items'
import {
  normalizeUiPaymentMethod,
  type PosPaymentMethod,
} from '@/lib/invoices/payment-method'

export const INVOICE_SUCCESS_STORAGE_KEY = 'invoice_success_snapshot'

export type InvoiceSuccessSnapshot = {
  invoiceNumber: string
  orderNumber: string
  invoiceId: string
  orderId: string
  status: string
  customerName: string
  customerPhone: string
  subtotal: number
  discount: number
  tax: number
  finalTotal: number
  paymentMethod: PosPaymentMethod
  cashReceived?: number
  numericCashReceived: number
  remainingFromCustomer: number
  cashChange: number
  note: string
  createdAt: string
  invoiceItems: InvoiceLineItem[]
  shouldAutoPrintThermal: boolean
}

export function buildInvoiceSuccessSnapshot(params: {
  result: CreatedInvoiceRecord
  customerName: string
  customerPhone: string
  subtotal: number
  discount: number
  tax: number
  finalTotal: number
  paymentMethod: PosPaymentMethod
  cashReceived?: number
  numericCashReceived: number
  remainingFromCustomer: number
  cashChange: number
  note: string
  invoiceItems: InvoiceLineItem[]
  shouldAutoPrintThermal?: boolean
}): InvoiceSuccessSnapshot {
  const { result, ...rest } = params

  return {
    invoiceNumber: result.invoice_number || '',
    orderNumber: result.order_number || '',
    invoiceId: result.invoice_id || '',
    orderId: result.order_id || '',
    status: result.status || '',
    createdAt: new Date().toISOString(),
    shouldAutoPrintThermal: params.shouldAutoPrintThermal ?? false,
    cashReceived: rest.cashReceived ?? rest.numericCashReceived,
    ...rest,
  }
}

export function serializeInvoiceSuccessSnapshot(
  snapshot: InvoiceSuccessSnapshot
) {
  return JSON.stringify(snapshot)
}

export function parseStoredInvoiceSuccessSnapshot(
  raw: string | null
): InvoiceSuccessSnapshot | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<InvoiceSuccessSnapshot> | null

    if (!parsed || !Array.isArray(parsed.invoiceItems)) {
      return null
    }

    const rawPaymentMethod = String(
      (parsed as { paymentMethod?: unknown }).paymentMethod ?? ''
    )
      .trim()
      .toLowerCase()

    const paymentMethod = normalizeUiPaymentMethod(rawPaymentMethod)

    return {
      invoiceNumber: parsed.invoiceNumber || '',
      orderNumber: parsed.orderNumber || '',
      invoiceId: parsed.invoiceId || '',
      orderId: parsed.orderId || '',
      status: parsed.status || '',
      customerName: parsed.customerName || '',
      customerPhone: parsed.customerPhone || '',
      subtotal: Number(parsed.subtotal) || 0,
      discount: Number(parsed.discount) || 0,
      tax: Number(parsed.tax) || 0,
      finalTotal: Number(parsed.finalTotal) || 0,
      paymentMethod,
      cashReceived:
        Number(parsed.cashReceived ?? parsed.numericCashReceived) || 0,
      numericCashReceived: Number(parsed.numericCashReceived) || 0,
      remainingFromCustomer: Number(parsed.remainingFromCustomer) || 0,
      cashChange: Number(parsed.cashChange) || 0,
      note: parsed.note || '',
      createdAt: parsed.createdAt || '',
      shouldAutoPrintThermal: parsed.shouldAutoPrintThermal === true,
      invoiceItems: parsed.invoiceItems.filter(
        (item): item is InvoiceLineItem =>
          Boolean(item) &&
          typeof item.item_name === 'string' &&
          (item.item_type === 'product' || item.item_type === 'service') &&
          typeof item.quantity === 'number' &&
          typeof item.unit_price === 'number'
      ),
    }
  } catch {
    return null
  }
}

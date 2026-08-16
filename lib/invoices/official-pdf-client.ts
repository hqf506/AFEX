import type { InvoiceSuccessSnapshot } from '@/lib/invoices/success'

export function buildOfficialInvoicePdfPayload(snapshot: InvoiceSuccessSnapshot) {
  return {
    invoiceId: snapshot.invoiceId,
    orderId: snapshot.orderId,
    customerName: snapshot.customerName,
    customerPhone: snapshot.customerPhone,
    invoiceNumber: snapshot.invoiceNumber,
    orderNumber: snapshot.orderNumber,
    issuedAt: snapshot.createdAt,
    paymentMethod: snapshot.paymentMethod,
    cashReceived: snapshot.cashReceived,
    numericCashReceived: snapshot.numericCashReceived,
    remainingFromCustomer: snapshot.remainingFromCustomer,
    cashChange: snapshot.cashChange,
    invoiceItems: snapshot.invoiceItems,
    subtotal: snapshot.subtotal,
    discount: snapshot.discount,
    tax: snapshot.tax,
    finalTotal: snapshot.finalTotal,
    note: snapshot.note,
  }
}

export async function loadOfficialInvoicePdf(snapshot: InvoiceSuccessSnapshot) {
  if (!snapshot.invoiceId || !snapshot.orderId || !snapshot.invoiceNumber || !snapshot.orderNumber) {
    throw new Error('OFFICIAL_INVOICE_IDENTITY_UNAVAILABLE')
  }

  const response = await fetch('/api/invoices/pdf', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildOfficialInvoicePdfPayload(snapshot)),
  })

  if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf')) {
    throw new Error('OFFICIAL_INVOICE_PDF_UNAVAILABLE')
  }

  return response.blob()
}

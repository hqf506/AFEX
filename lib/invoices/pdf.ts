import { chromium } from 'playwright'
import type { DigitalInvoiceTemplateSettings } from '@/lib/admin/settings'
import type { InvoiceLineItem } from '@/lib/invoices/items'
import { renderInvoiceHtmlFromPayload } from '@/lib/invoices/receipt-template'

export type InvoicePdfPayload = {
  invoiceItems: InvoiceLineItem[]
  invoiceNumber?: string
  orderNumber?: string
  customerName: string
  customerPhone: string
  branchName?: string
  paymentMethod:
    | 'cash'
    | 'card'
    | 'transfer'
    | 'mada'
    | 'visa'
    | 'cod'
    | 'عند الاستلام'
  paymentMethodLabel?: string
  numericCashReceived: number
  remainingFromCustomer: number
  cashChange: number
  subtotal: number
  discount: number
  tax: number
  finalTotal: number
  note: string
  issuedAt?: string
  digitalInvoiceSettings?: DigitalInvoiceTemplateSettings
}

export function renderInvoiceHtmlDocument(payload: InvoicePdfPayload) {
  return renderInvoiceHtmlFromPayload({
    brandName: payload.digitalInvoiceSettings?.brandName,
    brandBackgroundColor: payload.digitalInvoiceSettings?.brandBackgroundColor,
    brandTextColor: payload.digitalInvoiceSettings?.brandTextColor,
    invoiceItems: payload.invoiceItems,
    invoiceNumber: payload.invoiceNumber,
    orderNumber: payload.orderNumber,
    customerName: payload.customerName,
    customerPhone: payload.customerPhone,
    addressLine1: payload.digitalInvoiceSettings?.addressLine1,
    addressLine2: payload.digitalInvoiceSettings?.addressLine2,
    whatsappNumber: payload.digitalInvoiceSettings?.whatsappNumber,
    whatsappEnabled: payload.digitalInvoiceSettings?.whatsappEnabled,
    googleReviewLink: payload.digitalInvoiceSettings?.googleReviewLink,
    googleReviewEnabled: payload.digitalInvoiceSettings?.googleReviewEnabled,
    mapLink: payload.digitalInvoiceSettings?.mapLink,
    mapEnabled: payload.digitalInvoiceSettings?.mapEnabled,
    instagramEnabled: payload.digitalInvoiceSettings?.instagramEnabled,
    instagramLink: payload.digitalInvoiceSettings?.instagramLink,
    tiktokEnabled: payload.digitalInvoiceSettings?.tiktokEnabled,
    tiktokLink: payload.digitalInvoiceSettings?.tiktokLink,
    branchName:
      payload.digitalInvoiceSettings?.branchName || payload.branchName,
    paymentMethod: payload.paymentMethodLabel || payload.paymentMethod,
    cashReceived: payload.numericCashReceived,
    numericCashReceived: payload.numericCashReceived,
    remainingFromCustomer: payload.remainingFromCustomer,
    cashChange: payload.cashChange,
    subtotal: payload.subtotal,
    discountAmount: payload.discount,
    taxAmount: payload.tax,
    finalTotal: payload.finalTotal,
    note: payload.note ?? payload.digitalInvoiceSettings?.note,
    issuedAt: payload.issuedAt,
  })
}

export function renderInvoicePrintHtml(payload: InvoicePdfPayload) {
  const templateHtml = renderInvoiceHtmlDocument(payload)

  if (templateHtml.includes('window.print(')) {
    return templateHtml
  }

  return templateHtml.replace(
    '</body>',
    `
<script>
window.onload = function() {
  window.print();
}
</script>
</body>`
  )
}

export async function generateInvoicePdf(payload: InvoicePdfPayload) {
  const browser = await chromium.launch({
    headless: true,
    args:
      process.platform === 'linux'
        ? ['--no-sandbox', '--disable-setuid-sandbox']
        : [],
  })

  try {
    const page = await browser.newPage()
    const html = renderInvoiceHtmlDocument(payload)

    await page.setContent(html, { waitUntil: 'load' })
    await page.emulateMedia({ media: 'screen' })
    await page.waitForTimeout(200)

    return await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0',
      },
    })
  } finally {
    await browser.close()
  }
}

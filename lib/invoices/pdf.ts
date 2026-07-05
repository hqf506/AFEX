import { randomUUID } from 'node:crypto'
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

export type GeneratedInvoicePdfFile = {
  fileId: string
  filename: string
  buffer: Buffer
  base64: string
  dataUrl: string
}

function serializeInvoicePdfError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause:
        error.cause instanceof Error
          ? {
              name: error.cause.name,
              message: error.cause.message,
              stack: error.cause.stack,
            }
          : error.cause,
    }
  }

  return {
    name: typeof error,
    message: String(error),
  }
}

function summarizeInvoicePdfPayload(payload: Partial<InvoicePdfPayload>) {
  return {
    invoiceNumber: payload.invoiceNumber || null,
    orderNumber: payload.orderNumber || null,
    hasCustomerName: Boolean(payload.customerName),
    hasCustomerPhone: Boolean(payload.customerPhone),
    itemCount: Array.isArray(payload.invoiceItems)
      ? payload.invoiceItems.length
      : 0,
    paymentMethod: payload.paymentMethod || null,
    subtotal: payload.subtotal ?? null,
    discount: payload.discount ?? null,
    tax: payload.tax ?? null,
    finalTotal: payload.finalTotal ?? null,
    hasIssuedAt: Boolean(payload.issuedAt),
    hasDigitalInvoiceSettings: Boolean(payload.digitalInvoiceSettings),
  }
}

function logInvoicePdfLibraryInfo(
  stage: string,
  details?: Record<string, unknown>
) {
  console.info({
    scope: 'invoice-pdf-library',
    stage,
    ...details,
  })
}

function logInvoicePdfLibraryError(
  stage: string,
  error: unknown,
  details?: Record<string, unknown>
) {
  console.error({
    scope: 'invoice-pdf-library',
    stage,
    error: serializeInvoicePdfError(error),
    ...details,
  })
}

function sanitizeFileNamePart(value?: string) {
  const normalized = value?.trim() || ''

  if (!normalized) {
    return 'invoice'
  }

  return normalized.replace(/[^\w\u0600-\u06FF-]+/g, '-').replace(/-+/g, '-')
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
  logInvoicePdfLibraryInfo('generate-start', {
    payload: summarizeInvoicePdfPayload(payload),
    renderer: 'html-playwright-core',
  })

  let browser: Awaited<
    ReturnType<
      (typeof import('playwright-core'))['chromium']['launch']
    >
  > | null = null

  try {
    logInvoicePdfLibraryInfo('chromium-import-start')
    const [{ default: serverlessChromium }, { chromium: playwrightChromium }] =
      await Promise.all([
        import('@sparticuz/chromium'),
        import('playwright-core'),
      ])
    logInvoicePdfLibraryInfo('chromium-import-success')

    logInvoicePdfLibraryInfo('chromium-executable-path-start', {
      platform: process.platform,
    })
    const executablePath =
      process.platform === 'linux'
        ? await serverlessChromium.executablePath()
        : undefined
    logInvoicePdfLibraryInfo('chromium-executable-path-success', {
      hasExecutablePath: Boolean(executablePath),
    })

    logInvoicePdfLibraryInfo('chromium-launch-start')
    browser = await playwrightChromium.launch({
      args:
        process.platform === 'linux'
          ? serverlessChromium.args
          : ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath,
      headless: true,
    })
    logInvoicePdfLibraryInfo('chromium-launch-success')

    logInvoicePdfLibraryInfo('chromium-page-start')
    const page = await browser.newPage({
      viewport: {
        width: 794,
        height: 1123,
      },
    })
    logInvoicePdfLibraryInfo('chromium-render-html-start', {
      payload: summarizeInvoicePdfPayload(payload),
    })
    const html = renderInvoiceHtmlDocument(payload)
    logInvoicePdfLibraryInfo('chromium-render-html-success', {
      htmlLength: html.length,
    })

    logInvoicePdfLibraryInfo('chromium-set-content-start')
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.emulateMedia({ media: 'screen' })
    logInvoicePdfLibraryInfo('chromium-pdf-start')

    const pdf = await page.pdf({
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
    logInvoicePdfLibraryInfo('chromium-pdf-success', {
      byteLength: pdf.byteLength,
    })

    return pdf
  } catch (error) {
    logInvoicePdfLibraryError('html-pdf-generate-error', error, {
      message:
        'HTML invoice PDF generation failed; legacy fallback is disabled for Arabic invoices',
    })
    throw new Error(
      error instanceof Error
        ? `HTML invoice PDF generation failed: ${error.message}`
        : 'HTML invoice PDF generation failed'
    )
  } finally {
    if (browser) {
      logInvoicePdfLibraryInfo('chromium-close-start')
      await browser.close()
      logInvoicePdfLibraryInfo('chromium-close-success')
    }
  }
}

export async function generateInvoicePdfFile(
  payload: InvoicePdfPayload
): Promise<GeneratedInvoicePdfFile> {
  logInvoicePdfLibraryInfo('memory-file-generate-start', {
    payload: summarizeInvoicePdfPayload(payload),
  })

  const fileId = randomUUID()
  const filename = `${sanitizeFileNamePart(
    payload.invoiceNumber || payload.orderNumber
  )}.pdf`
  logInvoicePdfLibraryInfo('memory-file-pdf-generate-start', {
    fileId,
    filename,
  })
  const pdfBytes = await generateInvoicePdf(payload)
  const buffer = Buffer.from(pdfBytes)
  const base64 = buffer.toString('base64')
  const dataUrl = `data:application/pdf;base64,${base64}`
  logInvoicePdfLibraryInfo('memory-file-pdf-generate-success', {
    fileId,
    byteLength: buffer.byteLength,
    base64Length: base64.length,
    dataUrlLength: dataUrl.length,
  })

  return {
    fileId,
    filename,
    buffer,
    base64,
    dataUrl,
  }
}

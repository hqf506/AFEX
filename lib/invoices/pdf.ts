import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
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

export type StoredInvoicePdf = {
  fileId: string
  filename: string
  filePath: string
}

const STORAGE_DIR = path.join(process.cwd(), '.runtime-data', 'invoice-pdfs')
const FONT_PATH = path.join(
  process.cwd(),
  'assets',
  'fonts',
  'NotoSansArabic-Regular.ttf'
)
const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89
const PAGE_MARGIN = 40

function getStoragePath(fileId: string) {
  return path.join(STORAGE_DIR, `${fileId}.pdf`)
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

async function generateInvoicePdfWithPlaywright(payload: InvoicePdfPayload) {
  const { chromium } = await import('playwright')
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

async function loadPdfFont(pdfDoc: PDFDocument) {
  try {
    const { readFile: readFontFile } = await import('node:fs/promises')
    const fontBytes = await readFontFile(FONT_PATH)
    pdfDoc.registerFontkit(fontkit)
    return await pdfDoc.embedFont(fontBytes)
  } catch {
    return pdfDoc.embedFont(StandardFonts.Helvetica)
  }
}

function formatCurrencyValue(value: number) {
  return `${Number(value || 0).toFixed(2)} SAR`
}

function drawRightAlignedText(params: {
  page: PDFPage
  text: string
  font: PDFFont
  fontSize: number
  rightX: number
  y: number
  color?: ReturnType<typeof rgb>
}) {
  const { page, text, font, fontSize, rightX, y, color = rgb(0.07, 0.09, 0.15) } =
    params
  const width = font.widthOfTextAtSize(text, fontSize)

  page.drawText(text, {
    x: rightX - width,
    y,
    size: fontSize,
    font,
    color,
  })
}

function drawLeftText(params: {
  page: PDFPage
  text: string
  font: PDFFont
  fontSize: number
  x: number
  y: number
  color?: ReturnType<typeof rgb>
}) {
  const { page, text, font, fontSize, x, y, color = rgb(0.07, 0.09, 0.15) } =
    params

  page.drawText(text, {
    x,
    y,
    size: fontSize,
    font,
    color,
  })
}

function safePdfText(value: unknown) {
  return typeof value === 'string'
    ? value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
    : ''
}

function drawInfoRow(params: {
  page: PDFPage
  font: PDFFont
  label: string
  value: string
  y: number
}) {
  const { page, font, label, value, y } = params
  drawLeftText({
    page,
    text: label,
    font,
    fontSize: 10,
    x: PAGE_MARGIN,
    y,
    color: rgb(0.42, 0.46, 0.52),
  })
  drawRightAlignedText({
    page,
    text: value || '-',
    font,
    fontSize: 11,
    rightX: A4_WIDTH - PAGE_MARGIN,
    y,
  })
}

async function generateInvoicePdfFallback(payload: InvoicePdfPayload) {
  const pdfDoc = await PDFDocument.create()
  const font = await loadPdfFont(pdfDoc)
  let page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT])
  let y = A4_HEIGHT - PAGE_MARGIN
  const rightX = A4_WIDTH - PAGE_MARGIN

  drawRightAlignedText({
    page,
    text:
      safePdfText(payload.digitalInvoiceSettings?.brandName) ||
      safePdfText(payload.branchName) ||
      'AFEX',
    font,
    fontSize: 22,
    rightX,
    y,
  })
  y -= 28
  drawRightAlignedText({
    page,
    text: 'Digital Invoice',
    font,
    fontSize: 12,
    rightX,
    y,
    color: rgb(0.35, 0.4, 0.48),
  })
  y -= 34

  const rows = [
    ['Invoice number', payload.invoiceNumber || '-'],
    ['Order number', payload.orderNumber || '-'],
    ['Customer', payload.customerName || '-'],
    ['Phone', payload.customerPhone || '-'],
    ['Branch', payload.digitalInvoiceSettings?.branchName || payload.branchName || '-'],
    ['Payment', payload.paymentMethodLabel || payload.paymentMethod || '-'],
    ['Issued at', payload.issuedAt ? new Date(payload.issuedAt).toLocaleString('ar-SA') : new Date().toLocaleString('ar-SA')],
  ]

  for (const [label, value] of rows) {
    drawInfoRow({ page, font, label, value, y })
    y -= 22
  }

  y -= 14
  page.drawRectangle({
    x: PAGE_MARGIN,
    y: y - 24,
    width: A4_WIDTH - PAGE_MARGIN * 2,
    height: 24,
    color: rgb(0.94, 0.97, 0.98),
    borderColor: rgb(0.82, 0.88, 0.9),
    borderWidth: 1,
  })
  drawLeftText({ page, text: 'Item', font, fontSize: 10, x: PAGE_MARGIN + 10, y: y - 16 })
  drawRightAlignedText({ page, text: 'Total', font, fontSize: 10, rightX: rightX - 10, y: y - 16 })
  y -= 32

  for (const item of payload.invoiceItems) {
    if (y < 140) {
      page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT])
      y = A4_HEIGHT - PAGE_MARGIN
    }

    const itemName = safePdfText(item.item_name) || 'Item'
    const lineTotal = Number(item.quantity || 0) * Number(item.unit_price || 0)
    drawLeftText({
      page,
      text: `${itemName} x ${item.quantity}`,
      font,
      fontSize: 10,
      x: PAGE_MARGIN + 10,
      y,
    })
    drawRightAlignedText({
      page,
      text: formatCurrencyValue(lineTotal),
      font,
      fontSize: 10,
      rightX: rightX - 10,
      y,
    })
    y -= 20
  }

  y -= 18
  const totals = [
    ['Subtotal', payload.subtotal],
    ['Discount', payload.discount],
    ['VAT', payload.tax],
    ['Final total', payload.finalTotal],
  ]

  for (const [label, value] of totals) {
    drawInfoRow({
      page,
      font,
      label: String(label),
      value: formatCurrencyValue(Number(value || 0)),
      y,
    })
    y -= 22
  }

  const note = safePdfText(payload.note || payload.digitalInvoiceSettings?.note)
  if (note && y > 80) {
    y -= 14
    drawLeftText({
      page,
      text: 'Note',
      font,
      fontSize: 10,
      x: PAGE_MARGIN,
      y,
      color: rgb(0.42, 0.46, 0.52),
    })
    y -= 18
    drawRightAlignedText({
      page,
      text: note.slice(0, 120),
      font,
      fontSize: 10,
      rightX,
      y,
    })
  }

  return pdfDoc.save()
}

export async function generateInvoicePdf(payload: InvoicePdfPayload) {
  try {
    return await generateInvoicePdfWithPlaywright(payload)
  } catch (error) {
    console.warn(
      '[invoice-pdf] Playwright PDF generation unavailable, using pdf-lib fallback',
      error instanceof Error ? error.message : error
    )
    return generateInvoicePdfFallback(payload)
  }
}

export async function storeInvoicePdf(
  payload: InvoicePdfPayload
): Promise<StoredInvoicePdf> {
  await mkdir(STORAGE_DIR, { recursive: true })

  const fileId = randomUUID()
  const filename = `${sanitizeFileNamePart(
    payload.invoiceNumber || payload.orderNumber
  )}.pdf`
  const filePath = getStoragePath(fileId)
  const pdfBytes = await generateInvoicePdf(payload)

  await writeFile(filePath, pdfBytes)

  return {
    fileId,
    filename,
    filePath,
  }
}

export async function readStoredInvoicePdf(fileId: string) {
  const sanitizedId = fileId.trim()

  if (!/^[a-f0-9-]{16,}$/i.test(sanitizedId)) {
    throw new Error('Invalid invoice PDF id')
  }

  return readFile(getStoragePath(sanitizedId))
}

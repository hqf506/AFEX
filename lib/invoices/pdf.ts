import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
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

const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89
const PAGE_MARGIN = 40
const ARABIC_FONT_PATH = path.join(
  process.cwd(),
  'assets',
  'fonts',
  'NotoSansArabic-Regular.ttf'
)
const ARABIC_LETTER_PATTERN = /[\u0621-\u064A\u0671-\u06D3]/
const ARABIC_RUN_PATTERN = /[\u0621-\u064A\u0671-\u06D3]+/g
const RIGHT_JOINING_ARABIC_LETTERS = new Set([
  'آ',
  'أ',
  'ؤ',
  'إ',
  'ا',
  'ة',
  'د',
  'ذ',
  'ر',
  'ز',
  'و',
  'ى',
])
const ARABIC_PRESENTATION_FORMS: Record<string, [string, string, string, string]> =
  {
    ء: ['\uFE80', '\uFE80', '\uFE80', '\uFE80'],
    آ: ['\uFE81', '\uFE82', '\uFE81', '\uFE82'],
    أ: ['\uFE83', '\uFE84', '\uFE83', '\uFE84'],
    ؤ: ['\uFE85', '\uFE86', '\uFE85', '\uFE86'],
    إ: ['\uFE87', '\uFE88', '\uFE87', '\uFE88'],
    ئ: ['\uFE89', '\uFE8A', '\uFE8B', '\uFE8C'],
    ا: ['\uFE8D', '\uFE8E', '\uFE8D', '\uFE8E'],
    ب: ['\uFE8F', '\uFE90', '\uFE91', '\uFE92'],
    ة: ['\uFE93', '\uFE94', '\uFE93', '\uFE94'],
    ت: ['\uFE95', '\uFE96', '\uFE97', '\uFE98'],
    ث: ['\uFE99', '\uFE9A', '\uFE9B', '\uFE9C'],
    ج: ['\uFE9D', '\uFE9E', '\uFE9F', '\uFEA0'],
    ح: ['\uFEA1', '\uFEA2', '\uFEA3', '\uFEA4'],
    خ: ['\uFEA5', '\uFEA6', '\uFEA7', '\uFEA8'],
    د: ['\uFEA9', '\uFEAA', '\uFEA9', '\uFEAA'],
    ذ: ['\uFEAB', '\uFEAC', '\uFEAB', '\uFEAC'],
    ر: ['\uFEAD', '\uFEAE', '\uFEAD', '\uFEAE'],
    ز: ['\uFEAF', '\uFEB0', '\uFEAF', '\uFEB0'],
    س: ['\uFEB1', '\uFEB2', '\uFEB3', '\uFEB4'],
    ش: ['\uFEB5', '\uFEB6', '\uFEB7', '\uFEB8'],
    ص: ['\uFEB9', '\uFEBA', '\uFEBB', '\uFEBC'],
    ض: ['\uFEBD', '\uFEBE', '\uFEBF', '\uFEC0'],
    ط: ['\uFEC1', '\uFEC2', '\uFEC3', '\uFEC4'],
    ظ: ['\uFEC5', '\uFEC6', '\uFEC7', '\uFEC8'],
    ع: ['\uFEC9', '\uFECA', '\uFECB', '\uFECC'],
    غ: ['\uFECD', '\uFECE', '\uFECF', '\uFED0'],
    ف: ['\uFED1', '\uFED2', '\uFED3', '\uFED4'],
    ق: ['\uFED5', '\uFED6', '\uFED7', '\uFED8'],
    ك: ['\uFED9', '\uFEDA', '\uFEDB', '\uFEDC'],
    ل: ['\uFEDD', '\uFEDE', '\uFEDF', '\uFEE0'],
    م: ['\uFEE1', '\uFEE2', '\uFEE3', '\uFEE4'],
    ن: ['\uFEE5', '\uFEE6', '\uFEE7', '\uFEE8'],
    ه: ['\uFEE9', '\uFEEA', '\uFEEB', '\uFEEC'],
    و: ['\uFEED', '\uFEEE', '\uFEED', '\uFEEE'],
    ى: ['\uFEEF', '\uFEF0', '\uFEEF', '\uFEF0'],
    ي: ['\uFEF1', '\uFEF2', '\uFEF3', '\uFEF4'],
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

async function generateInvoicePdfWithPlaywright(payload: InvoicePdfPayload) {
  logInvoicePdfLibraryInfo('playwright-import-start')
  const { chromium } = await import('playwright')
  logInvoicePdfLibraryInfo('playwright-import-success')
  logInvoicePdfLibraryInfo('playwright-launch-start', {
    platform: process.platform,
  })
  const browser = await chromium.launch({
    headless: true,
    args:
      process.platform === 'linux'
        ? ['--no-sandbox', '--disable-setuid-sandbox']
        : [],
  })
  logInvoicePdfLibraryInfo('playwright-launch-success')

  try {
    logInvoicePdfLibraryInfo('playwright-page-start')
    const page = await browser.newPage()
    logInvoicePdfLibraryInfo('playwright-render-html-start', {
      payload: summarizeInvoicePdfPayload(payload),
    })
    const html = renderInvoiceHtmlDocument(payload)
    logInvoicePdfLibraryInfo('playwright-render-html-success', {
      htmlLength: html.length,
    })

    logInvoicePdfLibraryInfo('playwright-set-content-start')
    await page.setContent(html, { waitUntil: 'load' })
    await page.emulateMedia({ media: 'screen' })
    await page.waitForTimeout(200)
    logInvoicePdfLibraryInfo('playwright-pdf-start')

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
    logInvoicePdfLibraryInfo('playwright-pdf-success', {
      byteLength: pdf.byteLength,
    })

    return pdf
  } finally {
    logInvoicePdfLibraryInfo('playwright-close-start')
    await browser.close()
    logInvoicePdfLibraryInfo('playwright-close-success')
  }
}

async function loadPdfFont(pdfDoc: PDFDocument) {
  try {
    logInvoicePdfLibraryInfo('fallback-arabic-font-load-start', {
      fontPath: ARABIC_FONT_PATH,
    })
    const fontBytes = readFileSync(ARABIC_FONT_PATH)
    pdfDoc.registerFontkit(fontkit)
    const font = await pdfDoc.embedFont(fontBytes, { subset: true })
    logInvoicePdfLibraryInfo('fallback-arabic-font-load-success', {
      byteLength: fontBytes.byteLength,
    })
    return font
  } catch (error) {
    logInvoicePdfLibraryError('fallback-arabic-font-load-error', error)
    throw error
  }
}

function formatCurrencyValue(value: number) {
  return `${Number(value || 0).toFixed(2)} SAR`
}

function canJoinPreviousArabicLetter(letter?: string) {
  return Boolean(letter && ARABIC_PRESENTATION_FORMS[letter])
}

function canJoinNextArabicLetter(letter?: string) {
  return Boolean(
    letter &&
      ARABIC_PRESENTATION_FORMS[letter] &&
      !RIGHT_JOINING_ARABIC_LETTERS.has(letter)
  )
}

function shapeArabicRun(value: string) {
  return Array.from(value, (letter, index) => {
    const forms = ARABIC_PRESENTATION_FORMS[letter]

    if (!forms) {
      return letter
    }

    const previousLetter = value[index - 1]
    const nextLetter = value[index + 1]
    const joinsPrevious =
      canJoinPreviousArabicLetter(letter) &&
      canJoinNextArabicLetter(previousLetter)
    const joinsNext =
      canJoinNextArabicLetter(letter) &&
      canJoinPreviousArabicLetter(nextLetter)

    if (joinsPrevious && joinsNext) {
      return forms[3]
    }

    if (joinsPrevious) {
      return forms[1]
    }

    if (joinsNext) {
      return forms[2]
    }

    return forms[0]
  }).join('')
}

function preparePdfText(value: string) {
  if (!ARABIC_LETTER_PATTERN.test(value)) {
    return value
  }

  const runs = value.split(ARABIC_RUN_PATTERN)
  const arabicRuns = value.match(ARABIC_RUN_PATTERN) ?? []
  const parts: string[] = []

  for (let index = 0; index < runs.length; index += 1) {
    if (runs[index]) {
      parts.push(runs[index])
    }

    const arabicRun = arabicRuns[index]

    if (arabicRun) {
      parts.push(Array.from(shapeArabicRun(arabicRun)).reverse().join(''))
    }
  }

  return parts.reverse().join('')
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
  const preparedText = preparePdfText(text)
  const width = font.widthOfTextAtSize(preparedText, fontSize)

  page.drawText(preparedText, {
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
  const preparedText = preparePdfText(text)

  page.drawText(preparedText, {
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
  logInvoicePdfLibraryInfo('fallback-generate-start', {
    payload: summarizeInvoicePdfPayload(payload),
  })
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
    ['رقم الفاتورة', payload.invoiceNumber || '-'],
    ['رقم الطلب', payload.orderNumber || '-'],
    ['العميل', payload.customerName || '-'],
    ['الجوال', payload.customerPhone || '-'],
    ['الفرع', payload.digitalInvoiceSettings?.branchName || payload.branchName || '-'],
    ['طريقة الدفع', payload.paymentMethodLabel || payload.paymentMethod || '-'],
    ['تاريخ الإصدار', payload.issuedAt ? new Date(payload.issuedAt).toLocaleString('ar-SA') : new Date().toLocaleString('ar-SA')],
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
  drawLeftText({ page, text: 'العنصر', font, fontSize: 10, x: PAGE_MARGIN + 10, y: y - 16 })
  drawRightAlignedText({ page, text: 'الإجمالي', font, fontSize: 10, rightX: rightX - 10, y: y - 16 })
  y -= 32

  for (const item of payload.invoiceItems) {
    if (y < 140) {
      page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT])
      y = A4_HEIGHT - PAGE_MARGIN
    }

    const itemName = safePdfText(item.item_name) || 'عنصر'
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
    ['المجموع الفرعي', payload.subtotal],
    ['الخصم', payload.discount],
    ['ضريبة القيمة المضافة', payload.tax],
    ['الإجمالي النهائي', payload.finalTotal],
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
      text: 'ملاحظة',
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

  const pdf = await pdfDoc.save()
  logInvoicePdfLibraryInfo('fallback-generate-success', {
    byteLength: pdf.byteLength,
  })

  return pdf
}

export async function generateInvoicePdf(payload: InvoicePdfPayload) {
  try {
    logInvoicePdfLibraryInfo('generate-start', {
      payload: summarizeInvoicePdfPayload(payload),
      renderer: 'playwright',
    })
    return await generateInvoicePdfWithPlaywright(payload)
  } catch (error) {
    logInvoicePdfLibraryError('playwright-generate-error', error, {
      message: 'Playwright PDF generation unavailable, using pdf-lib fallback',
    })

    try {
      return await generateInvoicePdfFallback(payload)
    } catch (fallbackError) {
      logInvoicePdfLibraryError('fallback-generate-error', fallbackError)
      throw fallbackError
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

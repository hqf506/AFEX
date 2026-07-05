import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { ArabicShaper } from 'arabic-persian-reshaper'
import bidiFactory from 'bidi-js'
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
const ARABIC_FONT_PATH = path.join(
  process.cwd(),
  'assets',
  'fonts',
  'NotoSansArabic-Regular.ttf'
)
const ARABIC_LETTER_PATTERN = /[\u0621-\u064A\u0671-\u06D3]/
const bidi = bidiFactory()

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

function preparePdfText(value: string) {
  if (!ARABIC_LETTER_PATTERN.test(value)) {
    return value
  }

  const shapedText = ArabicShaper.convertArabic(value)
  const embeddingLevels = bidi.getEmbeddingLevels(shapedText, 'rtl')

  return bidi.getReorderedString(shapedText, embeddingLevels)
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

function parsePdfColor(value: string | undefined, fallback: ReturnType<typeof rgb>) {
  const normalized = value?.trim().replace(/^#/, '')

  if (!normalized || !/^[\da-f]{6}$/i.test(normalized)) {
    return fallback
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16) / 255
  const green = Number.parseInt(normalized.slice(2, 4), 16) / 255
  const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255

  return rgb(red, green, blue)
}

function getTextWidth(font: PDFFont, text: string, fontSize: number) {
  return font.widthOfTextAtSize(preparePdfText(text), fontSize)
}

function drawCenteredText(params: {
  page: PDFPage
  text: string
  font: PDFFont
  fontSize: number
  centerX: number
  y: number
  maxWidth?: number
  color?: ReturnType<typeof rgb>
}) {
  const {
    page,
    text,
    font,
    fontSize,
    centerX,
    y,
    maxWidth,
    color = rgb(0.07, 0.09, 0.15),
  } = params
  const preparedText = preparePdfText(maxWidth ? fitText(text, font, fontSize, maxWidth) : text)
  const width = font.widthOfTextAtSize(preparedText, fontSize)

  drawLeftText({
    page,
    text: preparedText,
    font,
    fontSize,
    x: centerX - width / 2,
    y,
    color,
  })
}

function fitText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
) {
  const normalizedText = safePdfText(text)

  if (getTextWidth(font, normalizedText, fontSize) <= maxWidth) {
    return normalizedText
  }

  let fittedText = normalizedText

  while (
    fittedText.length > 1 &&
    getTextWidth(font, `${fittedText}...`, fontSize) > maxWidth
  ) {
    fittedText = fittedText.slice(0, -1)
  }

  return `${fittedText}...`
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
  maxLines = 2
) {
  const words = safePdfText(text).split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word

    if (getTextWidth(font, nextLine, fontSize) <= maxWidth) {
      currentLine = nextLine
      continue
    }

    if (currentLine) {
      lines.push(currentLine)
    }

    currentLine = word

    if (lines.length === maxLines) {
      break
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine)
  }

  if (lines.length === 0) {
    return ['-']
  }

  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    lines[maxLines - 1] = fitText(lines[maxLines - 1], font, fontSize, maxWidth)
  }

  return lines
}

function drawWrappedRightText(params: {
  page: PDFPage
  text: string
  font: PDFFont
  fontSize: number
  rightX: number
  y: number
  maxWidth: number
  lineHeight: number
  maxLines?: number
  color?: ReturnType<typeof rgb>
}) {
  const lines = wrapText(
    params.text,
    params.font,
    params.fontSize,
    params.maxWidth,
    params.maxLines
  )

  lines.forEach((line, index) => {
    drawRightAlignedText({
      page: params.page,
      text: line,
      font: params.font,
      fontSize: params.fontSize,
      rightX: params.rightX,
      y: params.y - index * params.lineHeight,
      color: params.color,
    })
  })
}

function drawSidebarBlock(params: {
  page: PDFPage
  font: PDFFont
  label: string
  value: string
  x: number
  rightX: number
  y: number
  width: number
}) {
  const { page, font, label, value, x, rightX, y, width } = params

  drawRightAlignedText({
    page,
    text: label,
    font,
    fontSize: 13,
    rightX,
    y,
  })
  drawWrappedRightText({
    page,
    text: value || '-',
    font,
    fontSize: 9,
    rightX,
    y: y - 17,
    maxWidth: width - 24,
    lineHeight: 12,
    maxLines: 2,
    color: rgb(0.43, 0.43, 0.43),
  })
  page.drawLine({
    start: { x: x + 12, y: y - 39 },
    end: { x: rightX, y: y - 39 },
    thickness: 0.7,
    color: rgb(0.86, 0.86, 0.86),
  })
}

function formatArabicDate(value?: string) {
  const date = value ? new Date(value) : new Date()

  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleString('ar-SA')
  }

  return date.toLocaleString('ar-SA')
}

function resolveFallbackInvoiceSettings(payload: InvoicePdfPayload) {
  const settings = payload.digitalInvoiceSettings

  return {
    brandName: safePdfText(settings?.brandName) || 'AFEX',
    branchName:
      safePdfText(settings?.branchName) || safePdfText(payload.branchName) || '-',
    brandBackgroundColor: settings?.brandBackgroundColor || '#2e3f1f',
    brandTextColor: settings?.brandTextColor || '#e6c58f',
    addressLine1: safePdfText(settings?.addressLine1) || 'Al Hasan Ibn Ali, Ar Rawdah',
    addressLine2: safePdfText(settings?.addressLine2) || '13213 الروضة، الرياض',
    whatsappNumber: safePdfText(settings?.whatsappNumber),
    whatsappEnabled: settings?.whatsappEnabled ?? true,
    googleReviewLink: safePdfText(settings?.googleReviewLink),
    googleReviewEnabled: settings?.googleReviewEnabled ?? true,
    mapLink: safePdfText(settings?.mapLink),
    mapEnabled: settings?.mapEnabled ?? true,
    instagramLink: safePdfText(settings?.instagramLink),
    instagramEnabled: settings?.instagramEnabled ?? false,
    tiktokLink: safePdfText(settings?.tiktokLink),
    tiktokEnabled: settings?.tiktokEnabled ?? false,
    note:
      safePdfText(payload.note) ||
      safePdfText(settings?.note) ||
      'ملاحظة: المحل غير مسؤول عن فقدان الأغراض بعد مضي ثلاث أشهر من تاريخ الفاتورة.',
  }
}

async function generateInvoicePdfFallback(payload: InvoicePdfPayload) {
  logInvoicePdfLibraryInfo('fallback-generate-start', {
    payload: summarizeInvoicePdfPayload(payload),
  })
  const pdfDoc = await PDFDocument.create()
  const font = await loadPdfFont(pdfDoc)
  let page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT])
  const settings = resolveFallbackInvoiceSettings(payload)
  const brandBackgroundColor = parsePdfColor(
    settings.brandBackgroundColor,
    rgb(0.18, 0.25, 0.12)
  )
  const brandTextColor = parsePdfColor(
    settings.brandTextColor,
    rgb(0.9, 0.77, 0.56)
  )
  const inkColor = rgb(0.07, 0.07, 0.07)
  const mutedColor = rgb(0.43, 0.43, 0.43)
  const borderColor = rgb(0.88, 0.88, 0.88)
  const pagePadding = 32
  const logoWidth = 180
  const logoHeight = 80
  const logoX = A4_WIDTH - pagePadding - logoWidth
  const logoTop = A4_HEIGHT - 32
  const sidebarWidth = 168
  const sidebarX = A4_WIDTH - sidebarWidth
  const sidebarTop = 540
  const sidebarBottom = 96
  const tableX = 26
  const tableRightX = sidebarX - 14
  const tableWidth = tableRightX - tableX
  const tableColumns = [tableWidth * 0.46, tableWidth * 0.14, tableWidth * 0.2, tableWidth * 0.2]

  drawLeftText({
    page,
    text: settings.addressLine1,
    font,
    fontSize: 9,
    x: pagePadding,
    y: A4_HEIGHT - 44,
    color: mutedColor,
  })
  drawLeftText({
    page,
    text: settings.addressLine2,
    font,
    fontSize: 9,
    x: pagePadding,
    y: A4_HEIGHT - 60,
    color: mutedColor,
  })

  page.drawRectangle({
    x: logoX,
    y: logoTop - logoHeight,
    width: logoWidth,
    height: logoHeight,
    color: brandBackgroundColor,
  })
  drawCenteredText({
    page,
    text: settings.brandName,
    font,
    fontSize: 24,
    centerX: logoX + logoWidth / 2,
    y: logoTop - 48,
    maxWidth: logoWidth - 18,
    color: brandTextColor,
  })
  drawCenteredText({
    page,
    text: settings.branchName,
    font,
    fontSize: 9,
    centerX: logoX + logoWidth / 2,
    y: logoTop - logoHeight - 16,
    maxWidth: logoWidth,
    color: mutedColor,
  })

  drawCenteredText({
    page,
    text: `طلبك، ${safePdfText(payload.customerName) || 'عميلنا العزيز'}`,
    font,
    fontSize: 20,
    centerX: A4_WIDTH / 2,
    y: 690,
    maxWidth: 360,
    color: inkColor,
  })
  drawCenteredText({
    page,
    text: 'شكراً لزيارتكم لنا، لقد أرفقنا تفاصيل طلبك.',
    font,
    fontSize: 10,
    centerX: A4_WIDTH / 2,
    y: 668,
    maxWidth: 380,
    color: mutedColor,
  })
  drawCenteredText({
    page,
    text: 'الطلب والإجمالي',
    font,
    fontSize: 18,
    centerX: A4_WIDTH / 2,
    y: 630,
    color: inkColor,
  })

  page.drawRectangle({
    x: sidebarX,
    y: sidebarBottom,
    width: sidebarWidth,
    height: sidebarTop - sidebarBottom,
    color: rgb(0.95, 0.95, 0.95),
  })

  const sidebarRightX = A4_WIDTH - 20
  const sidebarBlocks = [
    ['تاريخ الطلب:', formatArabicDate(payload.issuedAt)],
    ['رقم الفاتورة:', payload.invoiceNumber || payload.orderNumber || '-'],
    ['رقم العميل:', payload.customerPhone || '-'],
    ['طريقة الدفع:', payload.paymentMethodLabel || payload.paymentMethod || '-'],
  ]
  let sidebarY = sidebarTop - 34

  for (const [label, value] of sidebarBlocks) {
    drawSidebarBlock({
      page,
      font,
      label,
      value,
      x: sidebarX,
      rightX: sidebarRightX,
      y: sidebarY,
      width: sidebarWidth,
    })
    sidebarY -= 76
  }

  page.drawLine({
    start: { x: sidebarX + 12, y: 182 },
    end: { x: sidebarRightX, y: 182 },
    thickness: 0.8,
    color: rgb(0.78, 0.78, 0.78),
  })
  drawCenteredText({
    page,
    text: 'إجمالي المبلغ',
    font,
    fontSize: 15,
    centerX: sidebarX + sidebarWidth / 2,
    y: 156,
  })
  drawCenteredText({
    page,
    text: Number(payload.finalTotal || 0).toLocaleString('ar-SA'),
    font,
    fontSize: 22,
    centerX: sidebarX + sidebarWidth / 2,
    y: 126,
  })
  drawCenteredText({
    page,
    text: 'ريال',
    font,
    fontSize: 10,
    centerX: sidebarX + sidebarWidth / 2,
    y: 108,
    color: mutedColor,
  })

  page.drawRectangle({
    x: tableX,
    y: 594,
    width: tableWidth,
    height: 28,
    color: rgb(0.98, 0.98, 0.98),
  })
  const headerY = 604
  const columnRightEdges = [
    tableX + tableColumns[0],
    tableX + tableColumns[0] + tableColumns[1],
    tableX + tableColumns[0] + tableColumns[1] + tableColumns[2],
    tableRightX,
  ]
  ;['الوصف', 'الكمية', 'سعر الوحدة', 'الإجمالي'].forEach((label, index) => {
    drawCenteredText({
      page,
      text: label,
      font,
      fontSize: 9,
      centerX: columnRightEdges[index] - tableColumns[index] / 2,
      y: headerY,
    })
  })

  let y = 570
  for (const [index, item] of payload.invoiceItems.entries()) {
    if (y < 310) {
      page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT])
      y = A4_HEIGHT - 54
    }

    const itemName = safePdfText(item.item_name) || 'عنصر'
    const lineTotal = Number(item.quantity || 0) * Number(item.unit_price || 0)
    const rowTop = y + 20
    page.drawLine({
      start: { x: tableX, y: rowTop },
      end: { x: tableRightX, y: rowTop },
      thickness: 0.7,
      color: borderColor,
    })
    drawWrappedRightText({
      page,
      text: itemName,
      font,
      fontSize: 9,
      rightX: tableX + tableColumns[0] - 8,
      y,
      maxWidth: tableColumns[0] - 18,
      lineHeight: 12,
      maxLines: 2,
    })
    if (item.item_id) {
      drawRightAlignedText({
        page,
        text: item.item_id,
        font,
        fontSize: 7,
        rightX: tableX + tableColumns[0] - 8,
        y: y - 14,
        color: rgb(0.53, 0.53, 0.53),
      })
    }
    drawCenteredText({
      page,
      text: String(item.quantity || '-'),
      font,
      fontSize: 9,
      centerX: columnRightEdges[1] - tableColumns[1] / 2,
      y,
    })
    drawCenteredText({
      page,
      text: formatCurrencyValue(Number(item.unit_price || 0)),
      font,
      fontSize: 9,
      centerX: columnRightEdges[2] - tableColumns[2] / 2,
      y,
      maxWidth: tableColumns[2] - 10,
    })
    drawCenteredText({
      page,
      text: formatCurrencyValue(lineTotal),
      font,
      fontSize: 9,
      centerX: columnRightEdges[3] - tableColumns[3] / 2,
      y,
      maxWidth: tableColumns[3] - 10,
    })
    y -= item.item_id || index % 2 === 0 ? 42 : 34
  }

  const summaryX = tableX + 48
  const summaryWidth = 300
  const summaryTop = Math.max(y - 10, 214)
  const summaryRows = [
    ['الإجمالي الخاضع للضريبة', 'Total subject to tax', payload.subtotal],
    ['مجموع ضريبة القيمة المضافة', 'Total V.A.T', payload.tax],
    ['إجمالي المبلغ المستحق', 'Total amount due', payload.finalTotal],
  ]

  page.drawRectangle({
    x: summaryX,
    y: summaryTop - 126,
    width: summaryWidth,
    height: 126,
    borderColor,
    borderWidth: 0.6,
    color: rgb(1, 1, 1),
  })
  summaryRows.forEach(([arabicLabel, englishLabel, value], index) => {
    const rowY = summaryTop - 26 - index * 40
    if (index > 0) {
      page.drawLine({
        start: { x: summaryX + 12, y: rowY + 24 },
        end: { x: summaryX + summaryWidth - 12, y: rowY + 24 },
        thickness: 0.7,
        color: borderColor,
      })
    }
    drawRightAlignedText({
      page,
      font,
      text: String(arabicLabel),
      fontSize: 9,
      rightX: summaryX + summaryWidth - 18,
      y: rowY + 7,
    })
    drawRightAlignedText({
      page,
      font,
      text: String(englishLabel),
      fontSize: 7,
      rightX: summaryX + summaryWidth - 18,
      y: rowY - 6,
      color: mutedColor,
    })
    drawLeftText({
      page,
      font,
      text: formatCurrencyValue(Number(value || 0)),
      fontSize: index === summaryRows.length - 1 ? 11 : 9,
      x: summaryX + 16,
      y: rowY,
      color: inkColor,
    })
  })

  drawCenteredText({
    page,
    text: settings.note,
    font,
    fontSize: 8,
    centerX: tableX + tableWidth / 2,
    y: 72,
    maxWidth: 420,
    color: mutedColor,
  })

  const footerItems = [
    settings.whatsappEnabled && settings.whatsappNumber
      ? ['واتساب', `wa.me/${settings.whatsappNumber}`]
      : null,
    settings.googleReviewEnabled && settings.googleReviewLink
      ? ['تقييمك يهمنا', settings.googleReviewLink]
      : null,
    settings.mapEnabled && settings.mapLink ? ['موقعنا', settings.mapLink] : null,
    settings.instagramEnabled && settings.instagramLink
      ? ['Instagram', settings.instagramLink]
      : null,
    settings.tiktokEnabled && settings.tiktokLink ? ['TikTok', settings.tiktokLink] : null,
  ].filter(Boolean) as [string, string][]

  if (footerItems.length > 0) {
    page.drawLine({
      start: { x: pagePadding, y: 52 },
      end: { x: A4_WIDTH - pagePadding, y: 52 },
      thickness: 0.7,
      color: borderColor,
    })
    const itemWidth = (A4_WIDTH - pagePadding * 2) / footerItems.length
    footerItems.forEach(([label, href], index) => {
      const centerX = pagePadding + itemWidth * index + itemWidth / 2
      drawCenteredText({
        page,
        text: label,
        font,
        fontSize: 8,
        centerX,
        y: 34,
        maxWidth: itemWidth - 8,
        color: mutedColor,
      })
      drawCenteredText({
        page,
        text: href.replace(/^https?:\/\//, ''),
        font,
        fontSize: 6,
        centerX,
        y: 22,
        maxWidth: itemWidth - 8,
        color: rgb(0.35, 0.35, 0.35),
      })
    })
  }

  if (payload.discount > 0 || payload.paymentMethod === 'cash') {
    const cashDetailsY = summaryTop - 148
    drawRightAlignedText({
      page,
      text: 'تفاصيل العملية',
      font,
      fontSize: 10,
      rightX: summaryX + summaryWidth,
      y: cashDetailsY,
    })
    drawRightAlignedText({
      page,
      text: `الخصم: ${formatCurrencyValue(payload.discount)}`,
      font,
      fontSize: 8,
      rightX: summaryX + summaryWidth,
      y: cashDetailsY - 16,
      color: mutedColor,
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

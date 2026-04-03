import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import type { InvoiceLineItem } from '@/lib/invoices/items'

export type InvoicePdfPayload = {
  invoiceItems: InvoiceLineItem[]
  invoiceNumber?: string
  orderNumber?: string
  customerName: string
  customerPhone: string
  paymentMethod: 'cash' | 'card' | 'transfer'
  numericCashReceived: number
  remainingFromCustomer: number
  cashChange: number
  subtotal: number
  discount: number
  tax: number
  finalTotal: number
  note: string
  issuedAt?: string
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
const ROW_HEIGHT = 24
const BOX_PADDING = 12

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

function formatCurrencyValue(value: number) {
  return `${Number(value || 0).toFixed(2)} ر.س`
}

function formatPaymentMethod(paymentMethod: InvoicePdfPayload['paymentMethod']) {
  if (paymentMethod === 'cash') return 'كاش'
  if (paymentMethod === 'card') return 'شبكة'
  return 'تحويل'
}

function escapePdfText(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
) {
  const normalized = escapePdfText(text)

  if (!normalized) {
    return ['']
  }

  const paragraphs = normalized.split('\n')
  const lines: string[] = []

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean)

    if (words.length === 0) {
      lines.push('')
      continue
    }

    let currentLine = ''

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word

      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        currentLine = candidate
        continue
      }

      if (currentLine) {
        lines.push(currentLine)
      }

      currentLine = word
    }

    if (currentLine) {
      lines.push(currentLine)
    }
  }

  return lines
}

async function loadInvoiceFont(pdfDoc: PDFDocument) {
  try {
    const fontBytes = await readFile(FONT_PATH)
    pdfDoc.registerFontkit(fontkit)
    return await pdfDoc.embedFont(fontBytes)
  } catch {
    return pdfDoc.embedFont(StandardFonts.Helvetica)
  }
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
  const { page, text, font, fontSize, rightX, y, color = rgb(0.07, 0.09, 0.15) } = params
  const width = font.widthOfTextAtSize(text, fontSize)

  page.drawText(text, {
    x: rightX - width,
    y,
    size: fontSize,
    font,
    color,
  })
}

function drawBox(page: PDFPage, yTop: number, height: number) {
  page.drawRectangle({
    x: PAGE_MARGIN,
    y: yTop - height,
    width: A4_WIDTH - PAGE_MARGIN * 2,
    height,
    borderWidth: 1,
    borderColor: rgb(0.89, 0.91, 0.94),
    color: rgb(0.98, 0.99, 1),
  })
}

function createPage(pdfDoc: PDFDocument) {
  return pdfDoc.addPage([A4_WIDTH, A4_HEIGHT])
}

function drawLabelValueRows(params: {
  page: PDFPage
  font: PDFFont
  yTop: number
  rows: Array<{ label: string; value: string }>
  fontSize?: number
}) {
  const { page, font, yTop, rows, fontSize = 11 } = params
  const rowHeight = 20
  const totalHeight = rows.length * rowHeight + BOX_PADDING * 2
  drawBox(page, yTop, totalHeight)

  let y = yTop - BOX_PADDING - fontSize
  const rightX = A4_WIDTH - PAGE_MARGIN - BOX_PADDING

  for (const row of rows) {
    drawRightAlignedText({
      page,
      text: `${row.label}: ${row.value}`,
      font,
      fontSize,
      rightX,
      y,
    })
    y -= rowHeight
  }

  return yTop - totalHeight - 14
}

export async function generateInvoicePdfBuffer(payload: InvoicePdfPayload) {
  const pdfDoc = await PDFDocument.create()
  const font = await loadInvoiceFont(pdfDoc)
  let page = createPage(pdfDoc)
  const issuedAt = payload.issuedAt ? new Date(payload.issuedAt) : new Date()

  let cursorY = A4_HEIGHT - PAGE_MARGIN

  drawRightAlignedText({
    page,
    text: 'Leather Fix ERP',
    font,
    fontSize: 22,
    rightX: A4_WIDTH - PAGE_MARGIN,
    y: cursorY,
  })

  cursorY -= 28

  drawRightAlignedText({
    page,
    text: 'فاتورة عميل',
    font,
    fontSize: 13,
    rightX: A4_WIDTH - PAGE_MARGIN,
    y: cursorY,
    color: rgb(0.42, 0.46, 0.52),
  })

  cursorY -= 28

  cursorY = drawLabelValueRows({
    page,
    font,
    yTop: cursorY,
    rows: [
      { label: 'رقم الفاتورة', value: payload.invoiceNumber || '—' },
      { label: 'رقم الطلب', value: payload.orderNumber || '—' },
      { label: 'التاريخ', value: issuedAt.toLocaleDateString('ar-SA') },
      { label: 'الوقت', value: issuedAt.toLocaleTimeString('ar-SA') },
    ],
  })

  cursorY = drawLabelValueRows({
    page,
    font,
    yTop: cursorY,
    rows: [
      { label: 'اسم العميل', value: payload.customerName },
      { label: 'رقم الجوال', value: payload.customerPhone },
      { label: 'طريقة الدفع', value: formatPaymentMethod(payload.paymentMethod) },
      ...(payload.paymentMethod === 'cash'
        ? [
            {
              label: 'المبلغ المستلم',
              value: formatCurrencyValue(payload.numericCashReceived),
            },
            {
              label: 'المتبقي من العميل',
              value: formatCurrencyValue(payload.remainingFromCustomer),
            },
            {
              label: 'الباقي للعميل',
              value: formatCurrencyValue(payload.cashChange),
            },
          ]
        : []),
    ],
  })

  const tableTop = cursorY
  const tableWidth = A4_WIDTH - PAGE_MARGIN * 2
  const columns = {
    total: PAGE_MARGIN + 90,
    unit: PAGE_MARGIN + 190,
    quantity: PAGE_MARGIN + 260,
    item: A4_WIDTH - PAGE_MARGIN - 12,
  }

  page.drawRectangle({
    x: PAGE_MARGIN,
    y: tableTop - ROW_HEIGHT,
    width: tableWidth,
    height: ROW_HEIGHT,
    color: rgb(0.96, 0.97, 0.98),
    borderColor: rgb(0.89, 0.91, 0.94),
    borderWidth: 1,
  })

  drawRightAlignedText({
    page,
    text: 'العنصر',
    font,
    fontSize: 10,
    rightX: columns.item,
    y: tableTop - 16,
  })
  drawRightAlignedText({
    page,
    text: 'الكمية',
    font,
    fontSize: 10,
    rightX: columns.quantity,
    y: tableTop - 16,
  })
  drawRightAlignedText({
    page,
    text: 'سعر الوحدة',
    font,
    fontSize: 10,
    rightX: columns.unit,
    y: tableTop - 16,
  })
  drawRightAlignedText({
    page,
    text: 'الإجمالي',
    font,
    fontSize: 10,
    rightX: columns.total,
    y: tableTop - 16,
  })

  cursorY = tableTop - ROW_HEIGHT - 8

  for (const item of payload.invoiceItems) {
    if (cursorY < PAGE_MARGIN + 150) {
      page = createPage(pdfDoc)
      cursorY = A4_HEIGHT - PAGE_MARGIN
    }

    const total = item.quantity * item.unit_price
    const itemLines = wrapText(item.item_name, font, 10, 240)
    const rowHeight = Math.max(ROW_HEIGHT, itemLines.length * 14 + 10)

    page.drawRectangle({
      x: PAGE_MARGIN,
      y: cursorY - rowHeight,
      width: tableWidth,
      height: rowHeight,
      borderColor: rgb(0.89, 0.91, 0.94),
      borderWidth: 1,
      color: rgb(1, 1, 1),
    })

    let itemTextY = cursorY - 15

    for (const line of itemLines) {
      drawRightAlignedText({
        page,
        text: line,
        font,
        fontSize: 10,
        rightX: columns.item,
        y: itemTextY,
      })
      itemTextY -= 14
    }

    drawRightAlignedText({
      page,
      text: String(item.quantity),
      font,
      fontSize: 10,
      rightX: columns.quantity,
      y: cursorY - 15,
    })
    drawRightAlignedText({
      page,
      text: formatCurrencyValue(item.unit_price),
      font,
      fontSize: 10,
      rightX: columns.unit,
      y: cursorY - 15,
    })
    drawRightAlignedText({
      page,
      text: formatCurrencyValue(total),
      font,
      fontSize: 10,
      rightX: columns.total,
      y: cursorY - 15,
    })

    cursorY -= rowHeight
  }

  cursorY -= 14

  if (cursorY < PAGE_MARGIN + 170) {
    page = createPage(pdfDoc)
    cursorY = A4_HEIGHT - PAGE_MARGIN
  }

  cursorY = drawLabelValueRows({
    page,
    font,
    yTop: cursorY,
    rows: [
      { label: 'المجموع الفرعي', value: formatCurrencyValue(payload.subtotal) },
      { label: 'الخصم', value: formatCurrencyValue(payload.discount) },
      { label: 'الضريبة', value: formatCurrencyValue(payload.tax) },
      { label: 'الإجمالي النهائي', value: formatCurrencyValue(payload.finalTotal) },
    ],
  })

  if (payload.note.trim()) {
    const noteLines = wrapText(payload.note, font, 11, tableWidth - BOX_PADDING * 2)
    const noteHeight = noteLines.length * 16 + BOX_PADDING * 2

    if (cursorY < PAGE_MARGIN + noteHeight + 20) {
      page = createPage(pdfDoc)
      cursorY = A4_HEIGHT - PAGE_MARGIN
    }

    drawBox(page, cursorY, noteHeight)

    let y = cursorY - BOX_PADDING - 11

    for (const line of noteLines) {
      drawRightAlignedText({
        page,
        text: line,
        font,
        fontSize: 11,
        rightX: A4_WIDTH - PAGE_MARGIN - BOX_PADDING,
        y,
      })
      y -= 16
    }
  }

  return pdfDoc.save()
}

export async function storeInvoicePdf(payload: InvoicePdfPayload): Promise<StoredInvoicePdf> {
  await mkdir(STORAGE_DIR, { recursive: true })

  const fileId = randomUUID()
  const filename = `${sanitizeFileNamePart(payload.invoiceNumber || payload.orderNumber)}.pdf`
  const filePath = getStoragePath(fileId)
  const pdfBytes = await generateInvoicePdfBuffer(payload)

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


import { NextRequest, NextResponse } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireApiAuth } from '@/lib/api-auth'
import {
  readStoredInvoicePdf,
  storeInvoicePdf,
  type InvoicePdfPayload,
} from '@/lib/invoices/pdf'

type CreateInvoicePdfBody = InvoicePdfPayload

function getTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function getNumericValue(value: unknown) {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
      ? Number(value)
      : NaN

  return Number.isFinite(numericValue) ? numericValue : 0
}

function normalizeInvoicePdfPayload(body: CreateInvoicePdfBody): InvoicePdfPayload {
  return {
    invoiceItems: Array.isArray(body.invoiceItems) ? body.invoiceItems : [],
    invoiceNumber: getTrimmedString(body.invoiceNumber) || undefined,
    orderNumber: getTrimmedString(body.orderNumber) || undefined,
    customerName: getTrimmedString(body.customerName),
    customerPhone: getTrimmedString(body.customerPhone),
    paymentMethod:
      body.paymentMethod === 'card' || body.paymentMethod === 'transfer'
        ? body.paymentMethod
        : 'cash',
    numericCashReceived: getNumericValue(body.numericCashReceived),
    remainingFromCustomer: getNumericValue(body.remainingFromCustomer),
    cashChange: getNumericValue(body.cashChange),
    subtotal: getNumericValue(body.subtotal),
    discount: getNumericValue(body.discount),
    tax: getNumericValue(body.tax),
    finalTotal: getNumericValue(body.finalTotal),
    note: getTrimmedString(body.note),
    issuedAt: getTrimmedString(body.issuedAt) || undefined,
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin', 'employee', 'cashier'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const body = (await request.json()) as CreateInvoicePdfBody
    const payload = normalizeInvoicePdfPayload(body)

    if (!payload.customerName || !payload.customerPhone) {
      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          error: 'Customer name and phone are required',
        },
        400
      )
    }

    if (payload.invoiceItems.length === 0) {
      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          error: 'At least one invoice item is required',
        },
        400
      )
    }

    const storedFile = await storeInvoicePdf(payload)
    const fileUrl = `${request.nextUrl.origin}/api/invoices/pdf?id=${storedFile.fileId}&filename=${encodeURIComponent(storedFile.filename)}`

    return jsonWithAuthCookies(auth.response, {
      success: true,
      fileUrl,
      filename: storedFile.filename,
    })
  } catch (error) {
    return jsonWithAuthCookies(
      auth.response,
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate invoice PDF',
      },
      500
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const fileId = getTrimmedString(request.nextUrl.searchParams.get('id'))
    const requestedFilename =
      getTrimmedString(request.nextUrl.searchParams.get('filename')) || 'invoice.pdf'

    if (!fileId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invoice PDF id is required',
        },
        { status: 400 }
      )
    }

    const pdfBuffer = await readStoredInvoicePdf(fileId)

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${requestedFilename.replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Invoice PDF not found',
      },
      { status: 404 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import {
  generateInvoicePdf,
  readStoredInvoicePdf,
  renderInvoiceHtmlDocument,
  storeInvoicePdf,
  type InvoicePdfPayload,
} from '@/lib/invoices/pdf'
import {
  resolveDigitalInvoiceTemplateSettings,
  type SystemSettings,
} from '@/lib/admin/settings'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'

export const runtime = 'nodejs'

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

function sanitizeFilename(value: string) {
  return value.replace(/[^\w\u0600-\u06FF-]+/g, '-').replace(/-+/g, '-')
}

function decodePayloadFromQuery(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding =
    normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))

  return JSON.parse(
    Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8')
  ) as CreateInvoicePdfBody
}

function normalizeInvoicePdfPayload(body: CreateInvoicePdfBody): InvoicePdfPayload {
  return {
    invoiceItems: Array.isArray(body.invoiceItems) ? body.invoiceItems : [],
    invoiceNumber: getTrimmedString(body.invoiceNumber) || undefined,
    orderNumber: getTrimmedString(body.orderNumber) || undefined,
    customerName: getTrimmedString(body.customerName),
    customerPhone: getTrimmedString(body.customerPhone),
    branchName: getTrimmedString(body.branchName) || undefined,
    paymentMethod:
      body.paymentMethod === 'mada' ||
      body.paymentMethod === 'visa' ||
      body.paymentMethod === 'cod'
        ? body.paymentMethod
        : 'cash',
    paymentMethodLabel: getTrimmedString(body.paymentMethodLabel) || undefined,
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

async function loadDigitalInvoiceSettings(tenantId: string | null | undefined) {
  if (!tenantId) {
    return resolveDigitalInvoiceTemplateSettings(null)
  }

  let query = supabaseAdmin
    .from('system_settings')
    .select(
      [
        'store_name',
        'branch_name',
        'whatsapp_phone',
        'digital_invoice_brand_name',
        'digital_invoice_branch_name',
        'digital_invoice_address_line_1',
        'digital_invoice_address_line_2',
        'digital_invoice_whatsapp_number',
        'digital_invoice_whatsapp_enabled',
        'digital_invoice_google_review_link',
        'digital_invoice_google_review_enabled',
        'digital_invoice_map_link',
        'digital_invoice_map_enabled',
        'digital_invoice_instagram_enabled',
        'digital_invoice_instagram_link',
        'digital_invoice_tiktok_enabled',
        'digital_invoice_tiktok_link',
        'digital_invoice_note',
        'digital_invoice_brand_background_color',
        'digital_invoice_brand_text_color',
      ].join(', ')
    )
    .limit(1)

  query = applyTenantFilter(query, tenantId)

  const { data: settingsRow } = await query
    .maybeSingle()

  return resolveDigitalInvoiceTemplateSettings(
    (settingsRow as Partial<SystemSettings> | null) ?? null
  )
}

export async function GET(request: NextRequest) {
  const fileId = getTrimmedString(request.nextUrl.searchParams.get('id'))

  if (fileId) {
    try {
      const requestedFilename =
        getTrimmedString(request.nextUrl.searchParams.get('filename')) ||
        'invoice.pdf'
      const pdfBuffer = await readStoredInvoicePdf(fileId)
      const pdfBody = new Uint8Array(pdfBuffer)

      return new NextResponse(pdfBody, {
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
          error:
            error instanceof Error ? error.message : 'Invoice PDF not found',
        },
        { status: 404 }
      )
    }
  }

  const auth = await requireApiAuth(request, ['admin', 'employee', 'cashier'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const format = request.nextUrl.searchParams.get('format')
    const encodedPayload = request.nextUrl.searchParams.get('payload')

    if (format !== 'html' || !encodedPayload) {
      return withAuthCookies(
        auth.response,
        NextResponse.json(
          {
            success: false,
            error: 'Invalid invoice preview request',
          },
          { status: 400 }
        )
      )
    }

    const payload = normalizeInvoicePdfPayload(
      decodePayloadFromQuery(encodedPayload)
    )

    const html = renderInvoiceHtmlDocument({
      ...payload,
      digitalInvoiceSettings: await loadDigitalInvoiceSettings(
        auth.profile.tenant_id
      ),
    })

    return withAuthCookies(
      auth.response,
      new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store',
        },
      })
    )
  } catch {
    return withAuthCookies(
      auth.response,
      NextResponse.json(
        {
          success: false,
          error: 'Failed to open invoice preview',
        },
        { status: 500 }
      )
    )
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
      return withAuthCookies(
        auth.response,
        NextResponse.json(
          {
            success: false,
            error: 'Customer name and phone are required',
          },
          { status: 400 }
        )
      )
    }

    if (payload.invoiceItems.length === 0) {
      return withAuthCookies(
        auth.response,
        NextResponse.json(
          {
            success: false,
            error: 'At least one invoice item is required',
          },
          { status: 400 }
        )
      )
    }

    const pdfPayload = {
      ...payload,
      digitalInvoiceSettings: await loadDigitalInvoiceSettings(
        auth.profile.tenant_id
      ),
    }

    if (request.nextUrl.searchParams.get('delivery') === 'whatsapp') {
      const storedFile = await storeInvoicePdf(pdfPayload)
      const fileUrl = `${request.nextUrl.origin}/api/invoices/pdf?id=${storedFile.fileId}&filename=${encodeURIComponent(storedFile.filename)}`

      return withAuthCookies(
        auth.response,
        NextResponse.json({
          success: true,
          fileUrl,
          filename: storedFile.filename,
        })
      )
    }

    const pdfBuffer = await generateInvoicePdf(pdfPayload)
    const pdfBody = new Uint8Array(pdfBuffer)
    const filenameBase = sanitizeFilename(
      payload.invoiceNumber || payload.orderNumber || 'invoice'
    )

    return withAuthCookies(
      auth.response,
      new NextResponse(pdfBody, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${filenameBase || 'invoice'}.pdf"`,
          'Cache-Control': 'private, no-store',
        },
      })
    )
  } catch (error) {
    return withAuthCookies(
      auth.response,
      NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to generate invoice PDF',
        },
        { status: 500 }
      )
    )
  }
}

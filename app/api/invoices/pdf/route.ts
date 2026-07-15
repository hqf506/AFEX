import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import {
  generateInvoicePdf,
  generateInvoicePdfFile,
  renderInvoiceHtmlDocument,
  type InvoicePdfPayload,
} from '@/lib/invoices/pdf'
import {
  resolveDigitalInvoiceTemplateSettings,
  type SystemSettings,
} from '@/lib/admin/settings'
import {
  disabledFeatureResponse,
  INVOICES_FEATURE_DISABLED_MESSAGE,
} from '@/lib/feature-guards'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'
import {
  normalizeDigitalInvoiceNote,
  normalizeDigitalInvoicePaymentMethod,
} from '@/lib/invoices/digital-preview'
import { redactSensitive } from '@/lib/security/redaction'

export const runtime = 'nodejs'

const WHATSAPP_FEATURE_DISABLED_MESSAGE =
  'ميزة الواتساب غير مفعلة من إعدادات النظام.'

type CreateInvoicePdfBody = InvoicePdfPayload

function createInvoicePdfRequestId() {
  return `invoice-pdf-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      cause:
        error.cause instanceof Error
          ? {
              name: error.cause.name,
              message: error.cause.message,
            }
          : undefined,
    }
  }

  return {
    name: typeof error,
    message: String(error),
  }
}

function summarizeInvoicePayload(payload: Partial<InvoicePdfPayload>) {
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

function logInvoicePdfInfo(
  requestId: string,
  stage: string,
  details?: Record<string, unknown>
) {
  if (process.env.NODE_ENV === 'production') return

  console.info({
    scope: 'invoice-pdf-route',
    requestId,
    stage,
    ...details,
  })
}

function logInvoicePdfError(
  requestId: string,
  stage: string,
  error: unknown,
  details?: Record<string, unknown>
) {
  console.error({
    scope: 'invoice-pdf-route',
    requestId,
    stage,
    error: redactSensitive(serializeError(error)),
    details: redactSensitive(details || {}),
  })
}

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
    paymentMethod: normalizeDigitalInvoicePaymentMethod(body.paymentMethod),
    paymentMethodLabel: getTrimmedString(body.paymentMethodLabel) || undefined,
    numericCashReceived: getNumericValue(body.numericCashReceived),
    remainingFromCustomer: getNumericValue(body.remainingFromCustomer),
    cashChange: getNumericValue(body.cashChange),
    subtotal: getNumericValue(body.subtotal),
    discount: getNumericValue(body.discount),
    tax: getNumericValue(body.tax),
    finalTotal: getNumericValue(body.finalTotal),
    note: normalizeDigitalInvoiceNote(body.note),
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

async function isWhatsAppFeatureEnabled(tenantId: string | null | undefined) {
  if (!tenantId) return true

  let query = supabaseAdmin
    .from('system_settings')
    .select('enable_whatsapp')
    .limit(1)

  query = applyTenantFilter(query, tenantId)

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw error
  }

  return data?.enable_whatsapp !== false
}

export async function GET(request: NextRequest) {
  const requestId = createInvoicePdfRequestId()

  const auth = await requireApiAuth(request, ['admin', 'employee', 'cashier'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    if (auth.profile.tenant_id) {
      const invoicesDisabledResponse = await disabledFeatureResponse(
        auth.response,
        auth.profile.tenant_id,
        'enable_invoices',
        INVOICES_FEATURE_DISABLED_MESSAGE
      )

      if (invoicesDisabledResponse) {
        return invoicesDisabledResponse
      }
    }

    const format = request.nextUrl.searchParams.get('format')
    const encodedPayload = request.nextUrl.searchParams.get('payload')
    logInvoicePdfInfo(requestId, 'html-preview-request', {
      format,
      hasEncodedPayload: Boolean(encodedPayload),
      encodedPayloadLength: encodedPayload?.length ?? 0,
    })

    if (format !== 'html' || !encodedPayload) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            success: false,
            error: 'تعذر فتح معاينة الفاتورة. أعد فتح الفاتورة ثم حاول مرة أخرى.',
          },
          422
        )
      )
    }

    let decodedBody: CreateInvoicePdfBody
    try {
      logInvoicePdfInfo(requestId, 'html-preview-payload-decode-start')
      decodedBody = decodePayloadFromQuery(encodedPayload)
      logInvoicePdfInfo(requestId, 'html-preview-payload-decode-success', {
        decodedKeys: Object.keys(decodedBody || {}),
      })
    } catch (error) {
      logInvoicePdfError(requestId, 'html-preview-payload-decode-error', error)
      throw error
    }

    const payload = normalizeInvoicePdfPayload(decodedBody)
    logInvoicePdfInfo(requestId, 'html-preview-payload-normalized', {
      payload: summarizeInvoicePayload(payload),
    })

    logInvoicePdfInfo(requestId, 'html-preview-settings-load-start', {
      hasTenantId: Boolean(auth.profile.tenant_id),
    })
    const digitalInvoiceSettings = await loadDigitalInvoiceSettings(
      auth.profile.tenant_id
    )
    logInvoicePdfInfo(requestId, 'html-preview-settings-load-success', {
      hasBrandName: Boolean(digitalInvoiceSettings.brandName),
      hasBranchName: Boolean(digitalInvoiceSettings.branchName),
    })

    logInvoicePdfInfo(requestId, 'html-preview-render-start')
    const html = renderInvoiceHtmlDocument({
      ...payload,
      digitalInvoiceSettings,
    })
    logInvoicePdfInfo(requestId, 'html-preview-render-success', {
      htmlLength: html.length,
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
  } catch (error) {
    logInvoicePdfError(requestId, 'html-preview-error', error)
    return withAuthCookies(
      auth.response,
      jsonResponse(
        {
          success: false,
          error: 'تعذر فتح معاينة الفاتورة. حاول مرة أخرى من تفاصيل الطلب.',
        },
        500
      )
    )
  }
}

export async function POST(request: NextRequest) {
  const requestId = createInvoicePdfRequestId()
  const auth = await requireApiAuth(request, ['admin', 'employee', 'cashier'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const deliveryMode = request.nextUrl.searchParams.get('delivery')
    logInvoicePdfInfo(requestId, 'post-request-start', {
      deliveryMode,
      hasTenantId: Boolean(auth.profile.tenant_id),
      role: auth.profile.role || null,
    })

    if (auth.profile.tenant_id) {
      const invoicesDisabledResponse = await disabledFeatureResponse(
        auth.response,
        auth.profile.tenant_id,
        'enable_invoices',
        INVOICES_FEATURE_DISABLED_MESSAGE
      )

      if (invoicesDisabledResponse) {
        return invoicesDisabledResponse
      }
    }

    let body: CreateInvoicePdfBody
    try {
      logInvoicePdfInfo(requestId, 'post-payload-decode-start')
      body = (await request.json()) as CreateInvoicePdfBody
      logInvoicePdfInfo(requestId, 'post-payload-decode-success', {
        bodyKeys: Object.keys(body || {}),
      })
    } catch (error) {
      logInvoicePdfError(requestId, 'post-payload-decode-error', error)
      throw error
    }

    logInvoicePdfInfo(requestId, 'post-invoice-data-build-start')
    const payload = normalizeInvoicePdfPayload(body)
    logInvoicePdfInfo(requestId, 'post-invoice-data-build-success', {
      payload: summarizeInvoicePayload(payload),
    })

    if (!payload.customerName || !payload.customerPhone) {
      logInvoicePdfInfo(requestId, 'post-validation-error', {
        reason: 'missing-customer',
        payload: summarizeInvoicePayload(payload),
      })
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            success: false,
            error: 'اسم العميل ورقم الجوال مطلوبان لإنشاء الفاتورة.',
          },
          422
        )
      )
    }

    if (payload.invoiceItems.length === 0) {
      logInvoicePdfInfo(requestId, 'post-validation-error', {
        reason: 'missing-items',
        payload: summarizeInvoicePayload(payload),
      })
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            success: false,
            error: 'أضف عنصرًا واحدًا على الأقل إلى الفاتورة.',
          },
          422
        )
      )
    }

    logInvoicePdfInfo(requestId, 'post-settings-load-start', {
      hasTenantId: Boolean(auth.profile.tenant_id),
    })
    const digitalInvoiceSettings = await loadDigitalInvoiceSettings(
      auth.profile.tenant_id
    )
    logInvoicePdfInfo(requestId, 'post-settings-load-success', {
      hasBrandName: Boolean(digitalInvoiceSettings.brandName),
      hasBranchName: Boolean(digitalInvoiceSettings.branchName),
    })

    const pdfPayload = {
      ...payload,
      digitalInvoiceSettings,
    }
    logInvoicePdfInfo(requestId, 'post-pdf-payload-ready', {
      payload: summarizeInvoicePayload(pdfPayload),
    })

    try {
      logInvoicePdfInfo(requestId, 'post-render-html-start')
      const html = renderInvoiceHtmlDocument(pdfPayload)
      logInvoicePdfInfo(requestId, 'post-render-html-success', {
        htmlLength: html.length,
      })
    } catch (error) {
      logInvoicePdfError(requestId, 'post-render-html-error', error, {
        payload: summarizeInvoicePayload(pdfPayload),
      })
      throw error
    }

    if (deliveryMode === 'whatsapp') {
      if (!(await isWhatsAppFeatureEnabled(auth.profile.tenant_id))) {
        return withAuthCookies(
          auth.response,
          jsonResponse(
            {
              success: false,
              error: WHATSAPP_FEATURE_DISABLED_MESSAGE,
            },
            403
          )
        )
      }

      logInvoicePdfInfo(requestId, 'post-memory-pdf-file-start')
      const generatedFile = await generateInvoicePdfFile(pdfPayload)
      logInvoicePdfInfo(requestId, 'post-memory-pdf-file-success', {
        fileId: generatedFile.fileId,
        filename: generatedFile.filename,
        byteLength: generatedFile.buffer.byteLength,
        base64Length: generatedFile.base64.length,
        fileUrlLength: generatedFile.dataUrl.length,
      })

      return withAuthCookies(
        auth.response,
        NextResponse.json({
          success: true,
          fileUrl: generatedFile.dataUrl,
          filename: generatedFile.filename,
        })
      )
    }

    logInvoicePdfInfo(requestId, 'post-generate-pdf-start')
    const pdfBuffer = await generateInvoicePdf(pdfPayload)
    const pdfBody = new Uint8Array(pdfBuffer)
    logInvoicePdfInfo(requestId, 'post-generate-pdf-success', {
      byteLength: pdfBody.byteLength,
    })
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
    logInvoicePdfError(requestId, 'post-error', error)
    return withAuthCookies(
      auth.response,
      jsonResponse(
        {
          success: false,
          error: 'تم حفظ الطلب، لكن تعذر إنشاء ملف الفاتورة. يمكنك إعادة المحاولة من تفاصيل الطلب.',
          details: error instanceof Error ? error.message : error,
        },
        500
      )
    )
  }
}

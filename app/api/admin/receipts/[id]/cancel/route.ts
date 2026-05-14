import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'

type SupabaseErrorDetails = {
  code?: string
  message?: string
  details?: string
  hint?: string
}

type InvoiceRecord = {
  id: string
  invoice_number: string | null
  payment_status: string | null
}

type ResolvedReceiptInvoice = {
  invoice: InvoiceRecord
  receiptIdType: 'invoice.id' | 'orders.id'
}

const RECEIPT_CANCELLED_STATUS = 'cancelled'
const CANCELLED_PAYMENT_STATUSES = ['cancelled', 'canceled', 'void', 'refunded', 'ملغي']

function utf8JsonResponse(data: Record<string, unknown>, status = 200) {
  const response = jsonResponse(data, status)
  response.headers.set('Content-Type', 'application/json; charset=utf-8')
  return response
}

function normalizeId(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isCancelledPaymentStatus(value: string | null | undefined) {
  return CANCELLED_PAYMENT_STATUSES.includes(value || '')
}

function formatSupabaseError(error: SupabaseErrorDetails | null | undefined) {
  return {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
  }
}

function logSupabaseError(
  step: string,
  error: SupabaseErrorDetails | null | undefined,
  meta: Record<string, unknown> = {},
) {
  console.error('[admin-receipts-cancel]', step, {
    ...meta,
    ...formatSupabaseError(error),
  })
}

async function findInvoiceById(receiptId: string, tenantId: string) {
  let invoiceQuery = supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, payment_status')
    .eq('id', receiptId)

  invoiceQuery = applyTenantFilter(invoiceQuery, tenantId)

  const { data, error } = await invoiceQuery.maybeSingle()

  if (error) {
    logSupabaseError('find invoice by invoice.id failed', error, {
      receiptId,
      tenantId,
    })
    throw new Error(error.message || 'Failed to query invoice by id')
  }

  return (data as InvoiceRecord | null) || null
}

async function findOrderById(receiptId: string, tenantId: string) {
  let orderQuery = supabaseAdmin
    .from('orders')
    .select('id, status')
    .eq('id', receiptId)

  orderQuery = applyTenantFilter(orderQuery, tenantId)

  const { data, error } = await orderQuery.maybeSingle()

  if (error) {
    logSupabaseError('find order by orders.id failed', error, {
      receiptId,
      tenantId,
    })
    throw new Error(error.message || 'Failed to query order by id')
  }

  return data
}

async function findInvoiceByOrderId(receiptId: string, tenantId: string) {
  let invoiceQuery = supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, payment_status')
    .eq('order_id', receiptId)
    .order('created_at', { ascending: false })
    .limit(1)

  invoiceQuery = applyTenantFilter(invoiceQuery, tenantId)

  const { data, error } = await invoiceQuery

  if (error) {
    logSupabaseError('find invoice by order_id failed', error, {
      receiptId,
      tenantId,
    })
    throw new Error(error.message || 'Failed to query invoice by order_id')
  }

  return (((data || []) as InvoiceRecord[])[0] || null) as InvoiceRecord | null
}

async function resolveReceiptInvoice(
  receiptId: string,
  tenantId: string,
): Promise<ResolvedReceiptInvoice | null> {
  const directInvoice = await findInvoiceById(receiptId, tenantId)

  if (directInvoice) {
    return {
      invoice: directInvoice,
      receiptIdType: 'invoice.id',
    }
  }

  const order = await findOrderById(receiptId, tenantId)

  if (!order) {
    return null
  }

  const orderInvoice = await findInvoiceByOrderId(receiptId, tenantId)

  if (!orderInvoice) {
    return null
  }

  return {
    invoice: orderInvoice,
    receiptIdType: 'orders.id',
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'تعذر تحديد نطاق المنشأة' }, 400),
      )
    }

    const params = await context.params
    const receiptId = normalizeId(params.id)

    if (!receiptId) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'معرف الإيصال مطلوب' }, 400),
      )
    }

    let resolvedReceipt: ResolvedReceiptInvoice | null = null

    try {
      resolvedReceipt = await resolveReceiptInvoice(receiptId, tenantId)
    } catch (error) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            error: 'تعذر التحقق من الإيصال أو الفاتورة المرتبطة',
            details: error instanceof Error ? error.message : 'Unknown error',
          },
          500,
        ),
      )
    }

    if (!resolvedReceipt) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'لا توجد فاتورة مرتبطة بهذا الإيصال' }, 404),
      )
    }

    const { invoice, receiptIdType } = resolvedReceipt

    if (isCancelledPaymentStatus(invoice.payment_status)) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({
          success: true,
          receipt: {
            id: receiptId,
            id_type: receiptIdType,
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            status: RECEIPT_CANCELLED_STATUS,
            payment_status: invoice.payment_status,
          },
        }),
      )
    }

    const cancellationPaymentStatus = RECEIPT_CANCELLED_STATUS

    const { data: updatedInvoice, error: updateError } = await supabaseAdmin
      .from('invoices')
      .update({
        payment_status: cancellationPaymentStatus,
      })
      .eq('id', invoice.id)
      .eq('tenant_id', tenantId)
      .select('id, invoice_number, payment_status')
      .single()

    if (updateError || !updatedInvoice) {
      logSupabaseError('update invoice payment_status failed', updateError, {
        receiptId,
        receiptIdType,
        invoiceId: invoice.id,
        tenantId,
        attemptedPaymentStatus: cancellationPaymentStatus,
      })

      if (updateError?.code === '23514') {
        return withAuthCookies(
          auth.response,
          utf8JsonResponse(
            {
              error: 'قيمة الإلغاء غير مسموحة في قيد حالة الدفع الحالي',
              details: updateError.message,
              code: updateError.code,
              attempted_payment_status: cancellationPaymentStatus,
            },
            409,
          ),
        )
      }

      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            error: 'تعذر إلغاء الإيصال',
            details: updateError?.message || 'Unknown error',
            code: updateError?.code,
          },
          500,
        ),
      )
    }

    return withAuthCookies(
      auth.response,
      utf8JsonResponse({
        success: true,
        receipt: {
          id: receiptId,
          id_type: receiptIdType,
          invoice_id: updatedInvoice.id,
          invoice_number: updatedInvoice.invoice_number,
          status: RECEIPT_CANCELLED_STATUS,
          payment_status: updatedInvoice.payment_status,
        },
      }),
    )
  } catch (error) {
    console.error('[admin-receipts-cancel] unexpected failure', {
      message: error instanceof Error ? error.message : 'Unknown error',
    })

    return withAuthCookies(
      auth.response,
      utf8JsonResponse(
        {
          error: 'حدث خطأ غير متوقع أثناء إلغاء الإيصال',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      ),
    )
  }
}

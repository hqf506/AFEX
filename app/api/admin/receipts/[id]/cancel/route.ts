import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { createServerTiming } from '@/lib/performance/server-timing'
import { jsonResponse } from '@/lib/api/responses'
import { writeAuditLog } from '@/lib/audit-log'
import {
  disabledFeatureResponse,
  ORDERS_FEATURE_DISABLED_MESSAGE,
} from '@/lib/feature-guards'
import {
  maskId,
  redactSensitive,
  safeErrorDetails,
} from '@/lib/security/redaction'
import { isFullAdmin } from '@/lib/permissions'
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
  order_id: string | null
  invoice_number: string | null
  payment_status: string | null
  total: number | null
  branch_id: string | null
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
  const formattedError =
    process.env.NODE_ENV === 'production'
      ? { code: error?.code }
      : {
          code: error?.code,
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
        }

  return redactSensitive(formattedError) as Record<string, unknown>
}

function sanitizeLogMeta(meta: Record<string, unknown>) {
  const maskedMeta = Object.fromEntries(
    Object.entries(meta).map(([key, value]) => {
      if (
        typeof value === 'string' &&
        ['receiptId', 'tenantId', 'invoiceId'].includes(key)
      ) {
        return [key, maskId(value)]
      }

      return [key, value]
    })
  )

  return redactSensitive(maskedMeta) as Record<string, unknown>
}

function safeErrorCode(error: SupabaseErrorDetails | null | undefined) {
  if (process.env.NODE_ENV === 'production') {
    return {}
  }

  return {
    code: error?.code,
  }
}

function logSupabaseError(
  step: string,
  error: SupabaseErrorDetails | null | undefined,
  meta: Record<string, unknown> = {},
) {
  console.error('[admin-receipts-cancel]', step, {
    ...sanitizeLogMeta(meta),
    ...formatSupabaseError(error),
  })
}

async function findInvoiceById(receiptId: string, tenantId: string) {
  let invoiceQuery = supabaseAdmin
    .from('invoices')
    .select('id, order_id, invoice_number, payment_status, total, branch_id')
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
    .select('id, order_id, invoice_number, payment_status, total, branch_id')
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
  const timing = createServerTiming()
  const auth = await timing.measure('auth', () =>
    requireApiAuth(request, ['admin', 'employee'])
  )

  if (!auth.ok) {
    return timing.finish(auth.response)
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'تعذر تحديد نطاق المنشأة' }, 400),
      )
    }

    const ordersDisabledResponse = await timing.measure(
      'settings',
      () => disabledFeatureResponse(
        auth.response,
        tenantId,
        'enable_orders',
        ORDERS_FEATURE_DISABLED_MESSAGE
      )
    )

    if (ordersDisabledResponse) {
      return timing.finish(ordersDisabledResponse)
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
      resolvedReceipt = await timing.measure('invoices', () =>
        resolveReceiptInvoice(receiptId, tenantId)
      )
    } catch (error) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            error: 'تعذر التحقق من الإيصال أو الفاتورة المرتبطة',
            ...safeErrorDetails(
              error,
              'تعذر التحقق من الإيصال أو الفاتورة المرتبطة'
            ),
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
    const targetBranchId =
      typeof invoice.branch_id === 'string' ? invoice.branch_id : null
    const hasSystemScope =
      auth.profile.scope_type === 'system' || isFullAdmin(auth.profile.role)

    if (!hasSystemScope && !auth.profile.branch_id) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          { error: 'لا تملك صلاحية إلغاء هذا الطلب' },
          403,
        ),
      )
    }

    if (
      !hasSystemScope &&
      auth.profile.branch_id &&
      targetBranchId !== auth.profile.branch_id
    ) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          { error: 'لا تملك صلاحية إلغاء هذا الطلب' },
          403,
        ),
      )
    }

    const { count: invoiceItemsCount, error: invoiceItemsCountError } =
      await supabaseAdmin
        .from('invoice_items')
        .select('id', { count: 'exact', head: true })
        .eq('invoice_id', invoice.id)
        .eq('tenant_id', tenantId)

    if (invoiceItemsCountError) {
      console.warn('[cancel-receipt] invoice items count failed', {
        receiptId,
        receiptIdType,
        invoiceId: invoice.id,
        tenantId,
        message: invoiceItemsCountError.message,
        code: invoiceItemsCountError.code,
        details: invoiceItemsCountError.details,
        hint: invoiceItemsCountError.hint,
      })
    }

    console.info('[cancel-receipt] resolved invoice for restore', {
      receiptId,
      receiptIdType,
      invoiceId: invoice.id,
      tenantId,
      invoiceItemsCount,
    })

    if (isCancelledPaymentStatus(invoice.payment_status)) {
      console.log('[cancel-receipt] restore inventory input', {
        receiptId,
        invoiceId: invoice.id,
        tenantId,
      })

      const {
        data: restoreInventoryResult,
        error: restoreInventoryError,
      } = await timing.measure('rpc', () =>
        supabaseAdmin.rpc(
          'restore_inventory_for_cancelled_invoice',
          {
            p_tenant_id: tenantId,
            p_invoice_id: invoice.id,
          }
        )
      )

      console.info('[cancel-receipt] restore inventory result', {
        receiptId,
        receiptIdType,
        invoiceId: invoice.id,
        tenantId,
        invoiceItemsCount,
        alreadyCancelled: true,
        restoredItemsCount:
          typeof restoreInventoryResult === 'object' &&
          restoreInventoryResult !== null &&
          !Array.isArray(restoreInventoryResult)
            ? (restoreInventoryResult as Record<string, unknown>).restoredItemsCount
            : undefined,
        restoreInventoryResult,
      })

      if (restoreInventoryError) {
        const error = restoreInventoryError

        console.error('[cancel-receipt] restore inventory failed', JSON.stringify({
          receiptId,
          invoiceId: invoice.id,
          tenantId,
          message: error?.message,
          code: error?.code,
          details: error?.details,
          hint: error?.hint,
        }, null, 2), error)

        logSupabaseError(
          'restore inventory for already-cancelled invoice failed',
          restoreInventoryError,
          {
            receiptId,
            receiptIdType,
            invoiceId: invoice.id,
            tenantId,
          }
        )

        return withAuthCookies(
          auth.response,
          utf8JsonResponse(
            {
              error: 'تعذر إلغاء الفاتورة. لم تكتمل عملية الإلغاء أو إعادة المخزون.',
              ...safeErrorDetails(
                restoreInventoryError,
                'تعذر إرجاع المخزون بعد إلغاء الفاتورة'
              ),
              ...safeErrorCode(restoreInventoryError),
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
      .select('id, order_id, invoice_number, payment_status, total, branch_id')
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
              ...safeErrorDetails(updateError, 'قيمة الإلغاء غير مسموحة'),
              ...safeErrorCode(updateError),
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
            error: 'تعذر إلغاء الفاتورة. لم تكتمل عملية الإلغاء أو إعادة المخزون.',
            ...safeErrorDetails(updateError, 'تعذر إلغاء الإيصال'),
            ...safeErrorCode(updateError),
          },
          500,
        ),
      )
    }

    console.log('[cancel-receipt] restore inventory input', {
      receiptId,
      invoiceId: updatedInvoice.id,
      tenantId,
    })

    const {
      data: restoreInventoryResult,
      error: restoreInventoryError,
    } = await timing.measure('rpc', () =>
      supabaseAdmin.rpc(
        'restore_inventory_for_cancelled_invoice',
        {
          p_tenant_id: tenantId,
          p_invoice_id: updatedInvoice.id,
        }
      )
    )

    console.info('[cancel-receipt] restore inventory result', {
      receiptId,
      receiptIdType,
      invoiceId: updatedInvoice.id,
      tenantId,
      invoiceItemsCount,
      restoredItemsCount:
        typeof restoreInventoryResult === 'object' &&
        restoreInventoryResult !== null &&
        !Array.isArray(restoreInventoryResult)
          ? (restoreInventoryResult as Record<string, unknown>).restoredItemsCount
          : undefined,
      restoreInventoryResult,
    })

    if (restoreInventoryError) {
      const error = restoreInventoryError

      console.error('[cancel-receipt] restore inventory failed', JSON.stringify({
        receiptId,
        invoiceId: updatedInvoice.id,
        tenantId,
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      }, null, 2), error)

      logSupabaseError(
        'restore inventory for cancelled invoice failed',
        restoreInventoryError,
        {
          receiptId,
          receiptIdType,
          invoiceId: updatedInvoice.id,
          tenantId,
        }
      )

      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            error: 'تعذر إلغاء الفاتورة. لم تكتمل عملية الإلغاء أو إعادة المخزون.',
            ...safeErrorDetails(
              restoreInventoryError,
              'تعذر إرجاع المخزون بعد إلغاء الفاتورة'
            ),
            ...safeErrorCode(restoreInventoryError),
          },
          500,
        ),
      )
    }

    await writeAuditLog({
      auth,
      request,
      action: 'receipt.cancelled',
      entityType: 'receipt',
      entityId: receiptId,
      branchId: updatedInvoice.branch_id || invoice.branch_id || null,
      metadata: {
        order_id: updatedInvoice.order_id || invoice.order_id || null,
        invoice_number: updatedInvoice.invoice_number || null,
        receipt_number: null,
        reason_provided: false,
        amount: updatedInvoice.total ?? invoice.total ?? null,
        branch_id: updatedInvoice.branch_id || invoice.branch_id || null,
      },
    })

    const response = await timing.measure('serialize', async () => withAuthCookies(
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
    ))
    return timing.finish(response)
  } catch (error) {
    console.error(
      '[admin-receipts-cancel] unexpected failure',
      redactSensitive({
        message:
          process.env.NODE_ENV === 'production'
            ? 'Unexpected receipt cancellation failure'
            : error instanceof Error
              ? error.message
              : 'Unknown error',
      })
    )

    return withAuthCookies(
      auth.response,
      utf8JsonResponse(
        {
          error: 'تعذر إلغاء الفاتورة. لم تكتمل عملية الإلغاء أو إعادة المخزون.',
          ...safeErrorDetails(
            error,
            'حدث خطأ غير متوقع أثناء إلغاء الإيصال'
          ),
        },
        500,
      ),
    )
  }
}

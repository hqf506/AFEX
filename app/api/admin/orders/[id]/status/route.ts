import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { writeAuditLog } from '@/lib/audit-log'
import {
  disabledFeatureResponse,
  ORDERS_FEATURE_DISABLED_MESSAGE,
} from '@/lib/feature-guards'
import { isFullAdmin } from '@/lib/permissions'
import { safeErrorDetails } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'

const ALLOWED_ORDER_STATUSES = ['in_progress', 'ready', 'closed'] as const
const INVALID_STATUS_SEQUENCE_MESSAGE = 'لا يمكن تغيير الحالة بهذا التسلسل.'

type OrderStatusUpdate = (typeof ALLOWED_ORDER_STATUSES)[number]

type UpdateOrderStatusBody = {
  status?: string
}

function normalizeId(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeStatus(value: unknown): OrderStatusUpdate | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()

  return ALLOWED_ORDER_STATUSES.includes(normalized as OrderStatusUpdate)
    ? (normalized as OrderStatusUpdate)
    : null
}

function isAllowedStatusTransition(
  currentStatus: string | null,
  nextStatus: OrderStatusUpdate
) {
  if (currentStatus === 'in_progress') return nextStatus === 'ready'
  if (currentStatus === 'ready') return nextStatus === 'closed'
  return false
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(request, ['admin', 'employee', 'cashier'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const params = await context.params
    const orderId = normalizeId(params.id)
    const tenantId = auth.profile.tenant_id

    if (!orderId) {
      const response = jsonResponse({ error: 'معرف الطلب مطلوب' }, 400)
      return withAuthCookies(auth.response, response)
    }

    if (!tenantId) {
      const response = jsonResponse(
        { error: 'تعذر تحديد نطاق المنشأة' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const ordersDisabledResponse = await disabledFeatureResponse(
      auth.response,
      tenantId,
      'enable_orders',
      ORDERS_FEATURE_DISABLED_MESSAGE
    )

    if (ordersDisabledResponse) {
      return ordersDisabledResponse
    }

    const body = (await request.json()) as UpdateOrderStatusBody
    const nextStatus = normalizeStatus(body.status)

    if (!nextStatus) {
      const response = jsonResponse({ error: 'حالة الطلب غير صالحة' }, 400)
      return withAuthCookies(auth.response, response)
    }

    const { data: existingOrder, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, status, branch_id')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (orderError) {
      const response = jsonResponse(
        {
          error: 'تعذر التحقق من الطلب',
          ...safeErrorDetails(orderError, 'تعذر التحقق من الطلب'),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    if (!existingOrder) {
      const response = jsonResponse({ error: 'الطلب غير موجود' }, 404)
      return withAuthCookies(auth.response, response)
    }

    const targetBranchId =
      typeof existingOrder.branch_id === 'string'
        ? existingOrder.branch_id
        : null

    const hasSystemScope =
      auth.profile.scope_type === 'system' || isFullAdmin(auth.profile.role)

    if (!hasSystemScope && !auth.profile.branch_id) {
      const response = jsonResponse(
        { error: 'لا تملك صلاحية تعديل هذا الطلب' },
        403
      )
      return withAuthCookies(auth.response, response)
    }

    if (
      !hasSystemScope &&
      auth.profile.branch_id &&
      targetBranchId !== auth.profile.branch_id
    ) {
      const response = jsonResponse(
        { error: 'لا تملك صلاحية تعديل هذا الطلب' },
        403
      )
      return withAuthCookies(auth.response, response)
    }

    const oldStatus =
      typeof existingOrder.status === 'string' ? existingOrder.status : null

    if (!isAllowedStatusTransition(oldStatus, nextStatus)) {
      const response = jsonResponse(
        { error: INVALID_STATUS_SEQUENCE_MESSAGE },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        status: nextStatus,
      })
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .select('id, order_number, status, branch_id')
      .single()

    if (updateError) {
      const response = jsonResponse(
        {
          error: 'تعذر تحديث حالة الطلب',
          ...safeErrorDetails(updateError, 'تعذر تحديث حالة الطلب'),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    await writeAuditLog({
      auth,
      request,
      action: 'order.status_updated',
      entityType: 'order',
      entityId: orderId,
      branchId: targetBranchId,
      metadata: {
        old_status: oldStatus,
        new_status: nextStatus,
        order_number:
          typeof existingOrder.order_number === 'string'
            ? existingOrder.order_number
            : null,
        changed_from_admin: true,
      },
    })

    const response = jsonResponse({
      success: true,
      order: updatedOrder,
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        ...safeErrorDetails(error, 'تعذر تحديث حالة الطلب'),
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}

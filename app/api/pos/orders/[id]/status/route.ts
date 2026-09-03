import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { writeAuditLog } from '@/lib/audit-log'
import { isFeatureEnabled, ORDERS_FEATURE_DISABLED_MESSAGE } from '@/lib/feature-guards'
import { POS_ACCESS_ROLES } from '@/lib/permissions'
import {
  transitionOrderStatus,
  type AuthoritativeOrderStatusRow,
  type OrderStatusTransitionClassification,
  type OrderStatusTransitionGateway,
} from '@/lib/server/orders/order-status-transition'
import { sendPersistedOrderStatusWhatsApp } from '@/lib/server/orders/order-status-whatsapp'
import { supabaseAdmin } from '@/lib/supabase/admin'

type UpdateOrderStatusBody = { status?: unknown }
type AuthSuccess = Extract<Awaited<ReturnType<typeof requireApiAuth>>, { ok: true }>

const FAILURE_HTTP_STATUS: Record<
  Exclude<OrderStatusTransitionClassification, 'ORDER_STATUS_UPDATED' | 'ORDER_STATUS_ALREADY_APPLIED'>,
  number
> = {
  ORDER_STATUS_INPUT_INVALID: 422,
  ORDER_STATUS_FORBIDDEN: 403,
  ORDER_SCOPE_FORBIDDEN: 403,
  ORDER_NOT_FOUND: 404,
  ORDER_STATUS_TRANSITION_INVALID: 409,
  ORDER_STATUS_STALE: 409,
  ORDER_STATUS_PERSISTENCE_FAILED: 500,
}

const FAILURE_MESSAGES: Record<keyof typeof FAILURE_HTTP_STATUS, string> = {
  ORDER_STATUS_INPUT_INVALID: 'حالة الطلب المطلوبة غير صالحة.',
  ORDER_STATUS_FORBIDDEN: 'لا تملك صلاحية تحديث حالة هذا الطلب.',
  ORDER_SCOPE_FORBIDDEN: 'لا تملك صلاحية تحديث طلب خارج فرعك.',
  ORDER_NOT_FOUND: 'الطلب غير موجود أو لم يعد متاحًا.',
  ORDER_STATUS_TRANSITION_INVALID: 'تعذر الانتقال من الحالة الحالية إلى الحالة المطلوبة.',
  ORDER_STATUS_STALE: 'تغيرت حالة الطلب في جلسة أخرى. تم إيقاف التحديث.',
  ORDER_STATUS_PERSISTENCE_FAILED: 'تعذر حفظ حالة الطلب. لم تتغير البطاقة الحالية.',
}

function statusResponse(auth: AuthSuccess, body: object, status = 200) {
  return withAuthCookies(auth.response, NextResponse.json(body, { status }))
}

function mapOrder(row: Record<string, unknown>): AuthoritativeOrderStatusRow | null {
  const id = typeof row.id === 'string' ? row.id : ''
  const orderNumber = typeof row.order_number === 'string' ? row.order_number : ''
  const tenantId = typeof row.tenant_id === 'string' ? row.tenant_id : ''
  const branchId = typeof row.branch_id === 'string' ? row.branch_id : ''
  const status = typeof row.status === 'string' ? row.status : ''
  return id && tenantId && branchId && status
    ? { id, orderNumber, tenantId, branchId, status }
    : null
}

function logTransition(input: {
  correlationId: string
  classification: string
  httpStatus: number
  transition: string
  notification?: string
}) {
  const level = input.httpStatus >= 500 ? 'error' : input.httpStatus >= 400 ? 'warn' : 'info'
  console[level]('[POS order status transition]', input)
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(request, [...POS_ACCESS_ROLES])
  if (!auth.ok) return auth.response

  const actor = auth.context.posEmployee
  if (!actor || !actor.branchId) {
    const status = 401
    const classification = 'POS_ACTOR_SESSION_REQUIRED'
    logTransition({
      correlationId: auth.context.correlationId,
      classification,
      httpStatus: status,
      transition: 'unknown',
    })
    return statusResponse(auth, {
      success: false,
      errorCode: classification,
      error: 'انتهت جلسة موظف نقطة البيع. أدخل رمز الموظف مرة أخرى.',
    }, status)
  }

  const actorBranchId = actor.branchId

  const { id: orderId } = await context.params
  let body: UpdateOrderStatusBody = {}
  try {
    const parsed = await request.json() as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      body = parsed as UpdateOrderStatusBody
    }
  } catch {
    body = {}
  }
  const bodyKeys = Object.keys(body)
  const targetStatus = bodyKeys.length === 1 && bodyKeys[0] === 'status' && typeof body.status === 'string'
    ? body.status
    : ''
  const transitionName = `authoritative->${targetStatus || 'invalid'}`

  try {
    if (!await isFeatureEnabled(actor.tenantId, 'enable_orders')) {
      const status = 403
      const classification = 'ORDER_STATUS_FORBIDDEN'
      logTransition({
        correlationId: auth.context.correlationId,
        classification,
        httpStatus: status,
        transition: transitionName,
      })
      return statusResponse(auth, {
        success: false,
        errorCode: classification,
        error: ORDERS_FEATURE_DISABLED_MESSAGE,
      }, status)
    }

    const gateway: OrderStatusTransitionGateway = {
      async loadOrder(input) {
        const { data, error } = await supabaseAdmin
          .from('orders')
          .select('id, order_number, tenant_id, branch_id, status')
          .eq('id', input.orderId)
          .eq('tenant_id', input.tenantId)
          .maybeSingle()
        if (error) throw new Error('ORDER_STATUS_READ_FAILED')
        return data ? mapOrder(data as Record<string, unknown>) : null
      },
      async compareAndSetStatus(input) {
        const { data, error } = await supabaseAdmin
          .from('orders')
          .update({ status: input.targetStatus })
          .eq('id', input.orderId)
          .eq('tenant_id', input.tenantId)
          .eq('branch_id', input.branchId)
          .eq('status', input.currentStatus)
          .select('id, order_number, tenant_id, branch_id, status')
          .maybeSingle()
        if (error) return { outcome: 'persistence_error' as const }
        if (!data) return { outcome: 'not_updated' as const }
        const mapped = mapOrder(data as Record<string, unknown>)
        return mapped
          ? { outcome: 'updated' as const, order: mapped }
          : { outcome: 'persistence_error' as const }
      },
      async recordAudit(input) {
        await writeAuditLog({
          auth,
          request,
          action: 'order.status_updated',
          entityType: 'order',
          entityId: input.order.id,
          branchId: input.branchId,
          actorUserId: input.actorId,
          metadata: {
            old_status: input.previousStatus,
            new_status: input.targetStatus,
            order_number: input.order.orderNumber || null,
            changed_from_pos: true,
          },
        })
      },
    }

    const result = await transitionOrderStatus({
      orderId,
      targetStatus,
      authority: {
        tenantId: actor.tenantId,
        branchId: actorBranchId,
        actorId: actor.id,
        actorRole: actor.role,
        canWriteOrders: auth.context.can('orders:write'),
      },
    }, gateway)

    if (!result.ok) {
      const status = FAILURE_HTTP_STATUS[result.classification]
      logTransition({
        correlationId: auth.context.correlationId,
        classification: result.classification,
        httpStatus: status,
        transition: transitionName,
        notification: 'STATUS_NOT_PERSISTED',
      })
      return statusResponse(auth, {
        success: false,
        errorCode: result.classification,
        error: FAILURE_MESSAGES[result.classification],
      }, status)
    }

    const notificationTarget = targetStatus === 'ready' || targetStatus === 'closed'
      ? targetStatus
      : null
    const previousStatus = notificationTarget === 'ready' ? 'in_progress' as const : 'ready' as const
    const notification = notificationTarget
      ? await sendPersistedOrderStatusWhatsApp({
          auth,
          request,
          transition: result,
          orderId,
          tenantId: actor.tenantId,
          branchId: actorBranchId,
          actorId: actor.id,
          correlationId: auth.context.correlationId,
          previousStatus,
          targetStatus: notificationTarget,
        }).catch(() => ({
          outcome: 'failed' as const,
          classification: 'WHATSAPP_DELIVERY_FAILED' as const,
        }))
      : { outcome: 'not_attempted' as const, classification: 'STATUS_NOT_PERSISTED' as const }

    logTransition({
      correlationId: auth.context.correlationId,
      classification: result.classification,
      httpStatus: 200,
      transition: transitionName,
      notification: notification.classification,
    })

    return statusResponse(auth, {
      success: true,
      classification: result.classification,
      idempotent: result.idempotent,
      order: {
        id: result.order.id,
        status: result.order.status,
      },
      transition: {
        outcome: 'persisted',
        classification: result.classification,
      },
      notification,
    })
  } catch {
    const status = 500
    const classification = 'ORDER_STATUS_PERSISTENCE_FAILED'
    logTransition({
      correlationId: auth.context.correlationId,
      classification,
      httpStatus: status,
      transition: transitionName,
    })
    return statusResponse(auth, {
      success: false,
      errorCode: classification,
      error: FAILURE_MESSAGES.ORDER_STATUS_PERSISTENCE_FAILED,
    }, status)
  }
}

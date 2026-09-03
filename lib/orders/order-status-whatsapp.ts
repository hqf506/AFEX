import type { OrderStatusTransitionResult } from '../server/orders/order-status-transition'

export type OrderStatusWhatsAppContext = {
  orderId: string
  persistedStatus: string
  orderNumber: string
  customerName: string
  customerPhone: string
  branchName: string
  storeName: string
  mapUrl: string
  total: number
  enabled: boolean
  readyTemplate: string | null
  deliveredTemplate: string | null
}

export type OrderStatusWhatsAppAuditOutcome = {
  action:
    | 'whatsapp.message_sent'
    | 'whatsapp.message_failed'
    | 'whatsapp.message_skipped'
  classification: OrderStatusWhatsAppClassification
  notificationType: 'order_ready' | 'order_delivered'
  providerKey: string | null
  providerStatus: string | null
  recipient: string | null
}

export type OrderStatusWhatsAppGateway = {
  loadContext: (input: {
    tenantId: string
    branchId: string
    orderId: string
    targetStatus: 'ready' | 'closed'
  }) => Promise<OrderStatusWhatsAppContext | null>
  isPhoneValid: (phone: string) => boolean
  buildText: (
    context: OrderStatusWhatsAppContext,
    targetStatus: 'ready' | 'closed'
  ) => string
  sendText: (input: {
    tenantId: string
    branchId: string
    to: string
    text: string
    notificationType: 'order_ready' | 'order_delivered'
    orderId: string
    previousStatus: 'in_progress' | 'ready'
    targetStatus: 'ready' | 'closed'
  }) => Promise<{
    success: boolean
    providerKey?: string | null
    providerStatus?: string | null
  }>
  recordAudit: (input: OrderStatusWhatsAppAuditOutcome) => Promise<void>
}

export type OrderStatusWhatsAppClassification =
  | 'WHATSAPP_SENT'
  | 'PHONE_UNAVAILABLE'
  | 'WHATSAPP_DISABLED'
  | 'WHATSAPP_DELIVERY_FAILED'
  | 'STATUS_NOT_PERSISTED'
  | 'ALREADY_APPLIED_NO_RESEND'

export type OrderStatusWhatsAppResult = {
  outcome: 'sent' | 'skipped' | 'failed' | 'not_attempted'
  classification: OrderStatusWhatsAppClassification
}

type PersistedTransitionInput = {
  tenantId: string
  branchId: string
  orderId: string
  previousStatus: 'in_progress' | 'ready'
  targetStatus: 'ready' | 'closed'
}

function notificationTypeFor(status: 'ready' | 'closed') {
  return status === 'ready' ? 'order_ready' as const : 'order_delivered' as const
}

async function recordAuditSafely(
  gateway: OrderStatusWhatsAppGateway,
  input: OrderStatusWhatsAppAuditOutcome
) {
  try {
    await gateway.recordAudit(input)
  } catch {
    // The established AFEX audit contract is best-effort and must not roll back
    // a status transition or misclassify a provider result.
  }
}

export async function notifyPersistedOrderStatusTransition(
  input: PersistedTransitionInput,
  transition: OrderStatusTransitionResult,
  gateway: OrderStatusWhatsAppGateway
): Promise<OrderStatusWhatsAppResult> {
  if (!transition.ok) {
    return { outcome: 'not_attempted', classification: 'STATUS_NOT_PERSISTED' }
  }

  if (transition.classification !== 'ORDER_STATUS_UPDATED') {
    return { outcome: 'not_attempted', classification: 'ALREADY_APPLIED_NO_RESEND' }
  }

  const notificationType = notificationTypeFor(input.targetStatus)
  let context: OrderStatusWhatsAppContext | null = null

  try {
    context = await gateway.loadContext({
      tenantId: input.tenantId,
      branchId: input.branchId,
      orderId: input.orderId,
      targetStatus: input.targetStatus,
    })
  } catch {
    context = null
  }

  if (!context || context.persistedStatus !== input.targetStatus) {
    await recordAuditSafely(gateway, {
      action: 'whatsapp.message_failed',
      classification: 'WHATSAPP_DELIVERY_FAILED',
      notificationType,
      providerKey: null,
      providerStatus: null,
      recipient: null,
    })
    return { outcome: 'failed', classification: 'WHATSAPP_DELIVERY_FAILED' }
  }

  if (!context.enabled) {
    await recordAuditSafely(gateway, {
      action: 'whatsapp.message_skipped',
      classification: 'WHATSAPP_DISABLED',
      notificationType,
      providerKey: null,
      providerStatus: null,
      recipient: null,
    })
    return { outcome: 'failed', classification: 'WHATSAPP_DISABLED' }
  }

  if (!context.customerPhone || !gateway.isPhoneValid(context.customerPhone)) {
    await recordAuditSafely(gateway, {
      action: 'whatsapp.message_skipped',
      classification: 'PHONE_UNAVAILABLE',
      notificationType,
      providerKey: null,
      providerStatus: null,
      recipient: null,
    })
    return { outcome: 'skipped', classification: 'PHONE_UNAVAILABLE' }
  }

  const text = gateway.buildText(context, input.targetStatus)

  try {
    const result = await gateway.sendText({
      tenantId: input.tenantId,
      branchId: input.branchId,
      to: context.customerPhone,
      text,
      notificationType,
      orderId: input.orderId,
      previousStatus: input.previousStatus,
      targetStatus: input.targetStatus,
    })

    if (!result.success) {
      await recordAuditSafely(gateway, {
        action: 'whatsapp.message_failed',
        classification: 'WHATSAPP_DELIVERY_FAILED',
        notificationType,
        providerKey: result.providerKey || null,
        providerStatus: result.providerStatus || null,
        recipient: context.customerPhone,
      })
      return { outcome: 'failed', classification: 'WHATSAPP_DELIVERY_FAILED' }
    }

    await recordAuditSafely(gateway, {
      action: 'whatsapp.message_sent',
      classification: 'WHATSAPP_SENT',
      notificationType,
      providerKey: result.providerKey || null,
      providerStatus: result.providerStatus || null,
      recipient: context.customerPhone,
    })
    return { outcome: 'sent', classification: 'WHATSAPP_SENT' }
  } catch {
    await recordAuditSafely(gateway, {
      action: 'whatsapp.message_failed',
      classification: 'WHATSAPP_DELIVERY_FAILED',
      notificationType,
      providerKey: null,
      providerStatus: null,
      recipient: context.customerPhone,
    })
    return { outcome: 'failed', classification: 'WHATSAPP_DELIVERY_FAILED' }
  }
}

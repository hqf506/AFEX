import type { NextRequest } from 'next/server'
import type { ApiAuthResult } from '@/lib/api-auth'
import { writeAuditLog } from '@/lib/audit-log'
import {
  notifyPersistedOrderStatusTransition,
  type OrderStatusWhatsAppAuditOutcome,
  type OrderStatusWhatsAppContext,
  type OrderStatusWhatsAppResult,
} from '@/lib/orders/order-status-whatsapp'
import { maskPhone } from '@/lib/security/redaction'
import type { OrderStatusTransitionResult } from '@/lib/server/orders/order-status-transition'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendWhatsAppText } from '@/lib/whatsapp/service'
import {
  applyOrderStatusWhatsAppTemplate,
  buildDeliveredOrderStatusWhatsAppMessage,
  buildReadyOrderStatusWhatsAppMessage,
  isSendableWhatsAppPhone,
} from '@/lib/whatsapp/messages'

type AuthSuccess = Extract<ApiAuthResult, { ok: true }>

type OrderNotificationRow = {
  id?: string | null
  order_number?: string | null
  status?: string | null
  tenant_id?: string | null
  branch_id?: string | null
  customers?:
    | { name?: string | null; phone?: string | null }
    | Array<{ name?: string | null; phone?: string | null }>
    | null
  invoices?:
    | { invoice_number?: string | null; total?: number | string | null }
    | Array<{ invoice_number?: string | null; total?: number | string | null }>
    | null
}

type NotificationSettingsRow = {
  enable_whatsapp?: boolean | null
  store_name?: string | null
  branch_name?: string | null
  whatsapp_order_ready_message_template?: string | null
  whatsapp_order_delivered_message_template?: string | null
}

type NotificationBranchRow = {
  name?: string | null
  display_store_name?: string | null
  display_branch_name?: string | null
  map_url?: string | null
}

function firstRecord<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null
}

function finiteNumber(value: number | string | null | undefined) {
  const number = typeof value === 'number' ? value : Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

function buildOrderStatusWhatsAppText(
  context: OrderStatusWhatsAppContext,
  targetStatus: 'ready' | 'closed'
) {
  const delivered = targetStatus === 'closed'
  const renderedTemplate = applyOrderStatusWhatsAppTemplate({
    template: delivered ? context.deliveredTemplate : context.readyTemplate,
    orderNumber: context.orderNumber,
    customerName: context.customerName,
    branchName: context.branchName,
    storeName: context.storeName,
    total: context.total,
    mapUrl: delivered ? '' : context.mapUrl,
  })

  if (renderedTemplate) return renderedTemplate

  return delivered
    ? buildDeliveredOrderStatusWhatsAppMessage({
        customerName: context.customerName,
        orderNumber: context.orderNumber,
        storeName: context.storeName,
        branchName: context.branchName,
      })
    : buildReadyOrderStatusWhatsAppMessage({
        customerName: context.customerName,
        orderNumber: context.orderNumber,
        storeName: context.storeName,
        branchName: context.branchName,
        mapUrl: context.mapUrl,
      })
}

async function loadOrderStatusWhatsAppContext(input: {
  tenantId: string
  branchId: string
  orderId: string
  targetStatus: 'ready' | 'closed'
}): Promise<OrderStatusWhatsAppContext | null> {
  const { data: orderData, error: orderError } = await supabaseAdmin
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      tenant_id,
      branch_id,
      customers (name, phone),
      invoices (invoice_number, total)
    `)
    .eq('id', input.orderId)
    .eq('tenant_id', input.tenantId)
    .eq('branch_id', input.branchId)
    .eq('status', input.targetStatus)
    .maybeSingle()

  if (orderError) throw new Error('ORDER_NOTIFICATION_CONTEXT_READ_FAILED')
  if (!orderData) return null

  const [settingsResult, branchResult] = await Promise.all([
    supabaseAdmin
      .from('system_settings')
      .select(
        'enable_whatsapp, store_name, branch_name, whatsapp_order_ready_message_template, whatsapp_order_delivered_message_template'
      )
      .eq('tenant_id', input.tenantId)
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('branches')
      .select('name, display_store_name, display_branch_name, map_url')
      .eq('tenant_id', input.tenantId)
      .eq('id', input.branchId)
      .maybeSingle(),
  ])

  if (settingsResult.error || branchResult.error) {
    throw new Error('ORDER_NOTIFICATION_SETTINGS_READ_FAILED')
  }

  const order = orderData as OrderNotificationRow
  const settings = (settingsResult.data || {}) as NotificationSettingsRow
  const branch = (branchResult.data || {}) as NotificationBranchRow
  const customer = firstRecord(order.customers)
  const invoice = firstRecord(order.invoices)
  const orderNumber =
    invoice?.invoice_number?.trim() || order.order_number?.trim() || ''

  if (!orderNumber) return null

  return {
    orderId: order.id || input.orderId,
    persistedStatus: order.status || '',
    orderNumber,
    customerName: customer?.name?.trim() || 'العميل',
    customerPhone: customer?.phone?.trim() || '',
    branchName:
      branch.display_branch_name?.trim() ||
      branch.name?.trim() ||
      settings.branch_name?.trim() ||
      '',
    storeName:
      branch.display_store_name?.trim() || settings.store_name?.trim() || '',
    mapUrl: branch.map_url?.trim() || '',
    total: finiteNumber(invoice?.total),
    enabled: settings.enable_whatsapp !== false,
    readyTemplate: settings.whatsapp_order_ready_message_template || null,
    deliveredTemplate: settings.whatsapp_order_delivered_message_template || null,
  }
}

export async function sendPersistedOrderStatusWhatsApp(input: {
  auth: AuthSuccess
  request: NextRequest
  transition: OrderStatusTransitionResult
  orderId: string
  tenantId: string
  branchId: string
  actorId: string
  correlationId: string
  previousStatus: 'in_progress' | 'ready'
  targetStatus: 'ready' | 'closed'
}): Promise<OrderStatusWhatsAppResult> {
  return notifyPersistedOrderStatusTransition(
    {
      tenantId: input.tenantId,
      branchId: input.branchId,
      orderId: input.orderId,
      previousStatus: input.previousStatus,
      targetStatus: input.targetStatus,
    },
    input.transition,
    {
      loadContext: loadOrderStatusWhatsAppContext,
      isPhoneValid: isSendableWhatsAppPhone,
      buildText: buildOrderStatusWhatsAppText,
      async sendText(notification) {
        const result = await sendWhatsAppText(
          {
            to: notification.to,
            branchId: notification.branchId,
            tenantId: notification.tenantId,
            text: notification.text,
            metadata: {
              type: 'order_status',
              orderId: notification.orderId,
              previousStatus: notification.previousStatus,
              status: notification.targetStatus,
              notificationType: notification.notificationType,
            },
          },
          { mode: 'text', messageType: 'text' }
        )

        return {
          success: result.success,
          providerKey: result.providerKey,
          providerStatus: result.providerStatus || null,
        }
      },
      async recordAudit(outcome: OrderStatusWhatsAppAuditOutcome) {
        await writeAuditLog({
          auth: input.auth,
          request: input.request,
          action: outcome.action,
          entityType: 'whatsapp_message',
          entityId: input.orderId,
          branchId: input.branchId,
          actorUserId: input.actorId,
          metadata: {
            channel: 'whatsapp',
            notification_type: outcome.notificationType,
            notification_outcome: outcome.classification,
            order_id: input.orderId,
            previous_status: input.previousStatus,
            order_status: input.targetStatus,
            provider_key: outcome.providerKey,
            provider_status: outcome.providerStatus,
            recipient_masked: outcome.recipient
              ? maskPhone(outcome.recipient)
              : null,
            correlation_id: input.correlationId,
          },
        })
      },
    }
  )
}

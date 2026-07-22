import { NextRequest } from 'next/server'
import { jsonResponse } from '@/lib/api/responses'
import { getTrimmedString } from '@/lib/api/validation'
import { requireApiAuth } from '@/lib/api-auth'
import { writeAuditLog } from '@/lib/audit-log'
import {
  resolveDigitalInvoiceTemplateSettings,
  type SystemSettings,
} from '@/lib/admin/settings'
import {
  generateInvoicePdfFile,
  type InvoicePdfPayload,
} from '@/lib/invoices/pdf'
import { normalizeDigitalInvoicePaymentMethod } from '@/lib/invoices/digital-preview'
import { isFullAdmin } from '@/lib/permissions'
import { maskId, maskPhone, redactSensitive } from '@/lib/security/redaction'
import { logWhatsAppSend } from '@/lib/whatsapp/logging'
import {
  buildDeliveredOrderStatusWhatsAppMessage,
  buildReadyOrderStatusWhatsAppMessage,
  isSendableWhatsAppPhone,
} from '@/lib/whatsapp/messages'
import {
  acquireWhatsAppOrderStatusNotificationLock,
  hasSentWhatsAppOrderStatusNotification,
  markWhatsAppOrderStatusNotificationSent,
  releaseWhatsAppOrderStatusNotificationLock,
} from '@/lib/whatsapp/notification-log'
import {
  sendWhatsAppFile,
  sendWhatsAppTestMessage,
  sendWhatsAppText,
} from '@/lib/whatsapp/service'
import type { WhatsAppServiceResult } from '@/lib/whatsapp/types'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'

type SendWhatsAppBody = {
  type?: 'text' | 'file'
  to?: string
  text?: string
  mode?: 'text' | 'test'
  fileUrl?: string
  filename?: string
  caption?: string
  branchId?: string
  notification?: {
    orderId?: string
    status?: string
    channel?: 'whatsapp'
  }
}

type WhatsAppRateLimitEntry = {
  count: number
  resetAt: number
}

const WHATSAPP_RATE_LIMIT_MAX_MESSAGES = 20
const WHATSAPP_RATE_LIMIT_WINDOW_MS = 60 * 1000
const WHATSAPP_FEATURE_DISABLED_MESSAGE =
  'ميزة الواتساب غير مفعلة من إعدادات النظام.'
const GENERIC_WHATSAPP_FORBIDDEN_MESSAGE =
  'غير مصرح لك بإرسال رسائل واتساب عامة.'
const ORDER_NOTIFICATION_CONTENT_FORBIDDEN_MESSAGE =
  'غير مصرح لك بتعديل محتوى إشعار الطلب.'
const BRANCH_NOTIFICATION_STATUSES = new Set([
  'invoice_pdf',
  'ready',
  'closed',
  'delivered',
])
const whatsappRateLimitStore = new Map<string, WhatsAppRateLimitEntry>()

type NotificationInvoiceItemRow = {
  item_name_snapshot?: string | null
  item_type_snapshot?: string | null
  quantity?: number | string | null
  unit_price?: number | string | null
  line_total?: number | string | null
}

type NotificationInvoiceRow = {
  id?: string | null
  invoice_number?: string | null
  payment_method?: string | null
  note?: string | null
  total?: number | string | null
  subtotal?: number | string | null
  discount?: number | string | null
  tax?: number | string | null
  cash_received?: number | string | null
  remaining_from_customer?: number | string | null
  cash_change?: number | string | null
  invoice_items?: NotificationInvoiceItemRow[] | NotificationInvoiceItemRow | null
}

type NotificationOrderRow = {
  id?: string | null
  order_number?: string | null
  branch_id?: string | null
  created_at?: string | null
  customers?: {
    name?: string | null
    phone?: string | null
  } | null
  invoices?: NotificationInvoiceRow[] | NotificationInvoiceRow | null
}

type NotificationBranchRow = {
  name?: string | null
  display_store_name?: string | null
  display_branch_name?: string | null
  map_url?: string | null
}

type ServerComposedOrderNotification = {
  to: string
  type: 'text' | 'file'
  mode: 'text'
  text: string
  fileUrl: string
  filename: string
  caption: string
  invoiceId?: string | null
  invoiceNumber?: string | null
}

function createWhatsAppRequestId() {
  return `whatsapp-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`
}

function serializeWhatsAppError(error: unknown) {
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

function logWhatsAppRouteInfo(
  requestId: string,
  stage: string,
  details?: Record<string, unknown>
) {
  if (process.env.NODE_ENV === 'production') return

  console.info({
    scope: 'whatsapp-route',
    requestId,
    stage,
    ...details,
  })
}

function logWhatsAppRouteError(
  requestId: string,
  stage: string,
  error: unknown,
  details?: Record<string, unknown>
) {
  console.error({
    scope: 'whatsapp-route',
    requestId,
    stage,
    error: redactSensitive(serializeWhatsAppError(error)),
    details: redactSensitive(details || {}),
  })
}

function resolveRequestBranchId(
  requestedBranchId: string,
  role: string | null | undefined,
  actorBranchId: string | null
) {
  if (role === 'admin' || role === 'manager') {
    return requestedBranchId
  }

  return actorBranchId || ''
}

function resolveRoleScopeType(role: string | null | undefined) {
  return role === 'admin' || role === 'manager' ? 'system' : 'branch'
}

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const forwardedIp = forwardedFor?.split(',')[0]?.trim()

  return (
    forwardedIp ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  )
}

function buildWhatsAppRateLimitKey(
  request: NextRequest,
  tenantId: string,
  branchId: string
) {
  return [getClientIp(request), tenantId, branchId].join(':')
}

function checkWhatsAppRateLimit(key: string) {
  const now = Date.now()
  const current = whatsappRateLimitStore.get(key)

  if (!current || current.resetAt <= now) {
    whatsappRateLimitStore.set(key, {
      count: 1,
      resetAt: now + WHATSAPP_RATE_LIMIT_WINDOW_MS,
    })
    return true
  }

  if (current.count >= WHATSAPP_RATE_LIMIT_MAX_MESSAGES) {
    return false
  }

  current.count += 1
  return true
}

function rateLimitResponse() {
  return jsonResponse(
    {
      success: false,
      error: 'تم تجاوز حد إرسال الرسائل، حاول لاحقًا',
    },
    429
  )
}

function whatsappFeatureDisabledResponse() {
  return jsonResponse(
    {
      success: false,
      error: WHATSAPP_FEATURE_DISABLED_MESSAGE,
    },
    403
  )
}

async function isWhatsAppFeatureEnabled(tenantId: string) {
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

function readNumber(value: number | string | null | undefined) {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : 0

  return Number.isFinite(numericValue) ? numericValue : 0
}

function normalizePaymentMethod(value: string | null | undefined) {
  return normalizeDigitalInvoicePaymentMethod(value || undefined)
}

function normalizeInvoiceRecord(value: NotificationOrderRow['invoices']) {
  if (Array.isArray(value)) {
    return value[0] || null
  }

  return value || null
}

function normalizeInvoiceItems(value: NotificationInvoiceRow['invoice_items']) {
  const items = Array.isArray(value) ? value : value ? [value] : []

  return items
    .map((item) => {
      const quantity = readNumber(item.quantity)
      const lineTotal = readNumber(item.line_total)
      const unitPrice =
        readNumber(item.unit_price) || (quantity > 0 ? lineTotal / quantity : 0)
      const itemName = item.item_name_snapshot?.trim() || ''

      return {
        item_id: null,
        item_name: itemName,
        item_type: item.item_type_snapshot === 'product' ? 'product' : 'service',
        quantity,
        unit_price: unitPrice,
      } satisfies InvoicePdfPayload['invoiceItems'][number]
    })
    .filter((item) => item.item_name && item.quantity > 0)
}

function applyOrderNotificationTemplate({
  template,
  orderNumber,
  customerName,
  branchName,
  storeName,
  total,
  mapUrl,
}: {
  template: string | null | undefined
  orderNumber: string
  customerName: string
  branchName: string
  storeName: string
  total: number
  mapUrl: string
}) {
  const trimmedTemplate = template?.trim() || ''

  if (!trimmedTemplate) {
    return ''
  }

  const values: Record<string, string> = {
    store_name: storeName,
    storeName,
    branch_name: branchName,
    branchName,
    customer_name: customerName,
    customerName,
    order_number: orderNumber,
    orderNumber,
    total: String(total),
    map_url: mapUrl,
    mapUrl,
  }

  return trimmedTemplate.replace(
    /\{\{\s*(store_name|storeName|branch_name|branchName|customer_name|customerName|order_number|orderNumber|total|map_url|mapUrl)\s*\}\}|\{\s*(store_name|storeName|branch_name|branchName|customer_name|customerName|order_number|orderNumber|total|map_url|mapUrl)\s*\}/g,
    (_match, doubleBraceKey: string | undefined, singleBraceKey: string | undefined) =>
      values[doubleBraceKey || singleBraceKey || ''] || ''
  )
}

async function loadServerComposedOrderNotification({
  tenantId,
  branchId,
  orderId,
  notificationStatus,
}: {
  tenantId: string
  branchId: string
  orderId: string
  notificationStatus: string
}): Promise<ServerComposedOrderNotification | null> {
  let orderQuery = supabaseAdmin
    .from('orders')
    .select(
      `
        id,
        order_number,
        branch_id,
        created_at,
        customers (
          name,
          phone
        ),
        invoices (
          id,
          invoice_number,
          payment_method,
          note,
          total,
          subtotal,
          discount,
          tax,
          cash_received,
          remaining_from_customer,
          cash_change,
          invoice_items (
            item_name_snapshot,
            item_type_snapshot,
            quantity,
            unit_price,
            line_total
          )
        )
      `
    )
    .eq('id', orderId)
    .eq('branch_id', branchId)
    .limit(1)

  orderQuery = applyTenantFilter(orderQuery, tenantId)

  const { data: orderData, error: orderError } = await orderQuery.maybeSingle()

  if (orderError || !orderData) {
    return null
  }

  const order = orderData as NotificationOrderRow
  const customerPhone = order.customers?.phone?.trim() || ''

  if (!customerPhone || !isSendableWhatsAppPhone(customerPhone)) {
    return null
  }

  const invoice = normalizeInvoiceRecord(order.invoices)
  const invoiceNumber = invoice?.invoice_number?.trim() || ''
  const orderNumber = invoiceNumber || order.order_number?.trim() || ''
  const customerName = order.customers?.name?.trim() || ''

  let settingsQuery = supabaseAdmin
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
        'whatsapp_order_ready_message_template',
        'whatsapp_order_delivered_message_template',
      ].join(', ')
    )
    .limit(1)

  settingsQuery = applyTenantFilter(settingsQuery, tenantId)

  const { data: settingsData } = await settingsQuery.maybeSingle()
  const settings = (settingsData as Partial<SystemSettings> | null) ?? null

  const { data: branchData } = await supabaseAdmin
    .from('branches')
    .select('name, display_store_name, display_branch_name, map_url')
    .eq('tenant_id', tenantId)
    .eq('id', branchId)
    .maybeSingle()

  const branch = (branchData || {}) as NotificationBranchRow
  const storeName = branch.display_store_name?.trim() || settings?.store_name?.trim() || ''
  const branchName =
    branch.display_branch_name?.trim() ||
    branch.name?.trim() ||
    settings?.branch_name?.trim() ||
    ''
  const mapUrl = branch.map_url?.trim() || ''
  const total = readNumber(invoice?.total)

  if (notificationStatus === 'invoice_pdf') {
    if (!invoice || !invoiceNumber) {
      return null
    }

    const invoiceItems = normalizeInvoiceItems(invoice.invoice_items)

    if (invoiceItems.length === 0) {
      return null
    }

    const pdfPayload: InvoicePdfPayload = {
      invoiceItems,
      invoiceNumber,
      orderNumber: order.order_number?.trim() || undefined,
      customerName,
      customerPhone,
      branchName: branchName || undefined,
      paymentMethod: normalizePaymentMethod(invoice.payment_method),
      paymentMethodLabel: invoice.payment_method?.trim() || undefined,
      numericCashReceived: readNumber(invoice.cash_received),
      remainingFromCustomer: readNumber(invoice.remaining_from_customer),
      cashChange: readNumber(invoice.cash_change),
      subtotal: readNumber(invoice.subtotal) || total,
      discount: readNumber(invoice.discount),
      tax: readNumber(invoice.tax),
      finalTotal: total,
      note: invoice.note?.trim() || '',
      issuedAt: order.created_at || undefined,
      digitalInvoiceSettings: resolveDigitalInvoiceTemplateSettings(settings),
    }
    const generatedFile = await generateInvoicePdfFile(pdfPayload)
    const safeInvoiceNumber = `\u200E${invoiceNumber}\u200E`

    return {
      to: customerPhone,
      type: 'file',
      mode: 'text',
      text: '',
      fileUrl: generatedFile.dataUrl,
      filename: generatedFile.filename,
      caption: `فاتورتك من: ${storeName}\nرقم الفاتورة: ${safeInvoiceNumber}`,
      invoiceId: invoice.id || null,
      invoiceNumber,
    }
  }

  const deliveredStatus =
    notificationStatus === 'closed' || notificationStatus === 'delivered'
  const templateText = deliveredStatus
    ? applyOrderNotificationTemplate({
        template: settings?.whatsapp_order_delivered_message_template,
        orderNumber,
        customerName,
        branchName,
        storeName,
        total,
        mapUrl: '',
      })
    : applyOrderNotificationTemplate({
        template: settings?.whatsapp_order_ready_message_template,
        orderNumber,
        customerName,
        branchName,
        storeName,
        total,
        mapUrl,
      })
  const text =
    templateText ||
    (deliveredStatus
      ? buildDeliveredOrderStatusWhatsAppMessage({
          customerName,
          orderNumber,
          storeName,
          branchName,
        })
      : buildReadyOrderStatusWhatsAppMessage({
          customerName,
          orderNumber,
          storeName,
          branchName,
          mapUrl,
        }))

  return {
    to: customerPhone,
    type: 'text',
    mode: 'text',
    text,
    fileUrl: '',
    filename: '',
    caption: '',
    invoiceId: invoice?.id || null,
    invoiceNumber: invoiceNumber || null,
  }
}

function whatsAppSuccessResponse(result: WhatsAppServiceResult) {
  return jsonResponse({
    success: true,
    status: result.providerStatus || 'sent',
    providerMessageId: result.providerMessageId || null,
  })
}

function whatsAppFailureResponse() {
  return jsonResponse(
    {
      success: false,
      error: 'تعذر إرسال رسالة واتساب حاليًا. لم يتم تأكيد الإرسال.',
    },
    500
  )
}

function maskOptionalId(value: string | null | undefined) {
  return value ? maskId(value) : null
}

type SuccessfulWhatsAppAuditInput = {
  auth: Extract<Awaited<ReturnType<typeof requireApiAuth>>, { ok: true }>
  request: NextRequest
  result: WhatsAppServiceResult
  branchId: string
  mode: 'text' | 'test'
  type: 'text' | 'file'
  to: string
  hasText: boolean
  hasFile: boolean
  orderId?: string
  orderStatus?: string
}

type FailedWhatsAppAuditInput = {
  auth: Extract<Awaited<ReturnType<typeof requireApiAuth>>, { ok: true }>
  request: NextRequest
  branchId: string
  mode: 'text' | 'test'
  type: 'text' | 'file'
  to: string
  hasText: boolean
  hasFile: boolean
  errorMessage?: string | null
  providerStatus?: string | null
  providerKey?: string | null
  orderId?: string
  orderStatus?: string
}

async function writeSuccessfulWhatsAppAudit({
  auth,
  request,
  result,
  branchId,
  mode,
  type,
  to,
  hasText,
  hasFile,
  orderId,
  orderStatus,
}: SuccessfulWhatsAppAuditInput) {
  await writeAuditLog({
    auth,
    request,
    action: 'whatsapp.message_sent',
    entityType: 'whatsapp_message',
    entityId: result.providerMessageId || orderId || null,
    branchId,
    metadata: {
      channel: 'whatsapp',
      mode: type === 'file' ? 'file' : mode,
      type,
      has_text: hasText,
      has_file: hasFile,
      order_id: orderId || null,
      order_status: orderStatus || null,
      recipient_masked: maskPhone(to),
      provider_status: result.providerStatus || null,
    },
  })
}

async function writeFailedWhatsAppAudit({
  auth,
  request,
  branchId,
  mode,
  type,
  to,
  hasText,
  hasFile,
  errorMessage,
  providerStatus,
  providerKey,
  orderId,
  orderStatus,
}: FailedWhatsAppAuditInput) {
  if (!orderId) return

  await writeAuditLog({
    auth,
    request,
    action: 'whatsapp.message_failed',
    entityType: 'whatsapp_message',
    entityId: orderId,
    branchId,
    metadata: {
      channel: 'whatsapp',
      mode: type === 'file' ? 'file' : mode,
      type: orderStatus || type,
      status: 'failed',
      has_text: hasText,
      has_file: hasFile,
      order_id: orderId,
      order_status: orderStatus || null,
      recipient_masked: maskPhone(to),
      provider_status: providerStatus || null,
      provider_key: providerKey || null,
      error: errorMessage || 'تعذر إرسال رسالة واتساب',
    },
  })
}

export async function POST(req: NextRequest) {
  const requestId = createWhatsAppRequestId()
  let to = ''
  let type: 'text' | 'file' = 'text'
  let mode: 'text' | 'test' = 'text'

  try {
    const auth = await requireApiAuth(req, ['admin', 'employee', 'cashier'])

    if (!auth.ok) {
      return auth.response
    }

    const body = (await req.json()) as SendWhatsAppBody

    type = body.type === 'file' ? 'file' : 'text'
    to = getTrimmedString(body.to)
    let text = getTrimmedString(body.text)
    mode = body.mode === 'test' ? 'test' : 'text'
    let fileUrl = getTrimmedString(body.fileUrl)
    let filename = getTrimmedString(body.filename)
    let caption = getTrimmedString(body.caption)
    const tenantId = auth.profile.tenant_id
    const requestedBranchId = getTrimmedString(body.branchId)
    const isFullAdminRole = isFullAdmin(auth.profile.role)
    const roleScopeType = resolveRoleScopeType(auth.profile.role)
    const branchId = resolveRequestBranchId(
      requestedBranchId,
      auth.profile.role,
      auth.profile.branch_id
    )
    const notificationOrderId = getTrimmedString(body.notification?.orderId)
    const notificationStatus = getTrimmedString(body.notification?.status)
    const notificationChannel = body.notification?.channel || 'whatsapp'
    const notificationKey =
      notificationOrderId && notificationStatus
        ? {
            orderId: notificationOrderId,
            status: notificationStatus,
            channel: notificationChannel,
          }
        : null
    const rateLimitKey =
      tenantId && branchId ? buildWhatsAppRateLimitKey(req, tenantId, branchId) : ''

    logWhatsAppRouteInfo(requestId, 'request-parsed', {
      type,
      mode,
      hasRecipient: Boolean(to),
      toMasked: maskPhone(to),
      hasFileUrl: Boolean(fileUrl),
      fileUrlLength: fileUrl.length,
      filename: filename || null,
      hasCaption: Boolean(caption),
      tenantIdMasked: tenantId ? maskId(tenantId) : '[missing]',
      requestedBranchMasked: requestedBranchId
        ? maskId(requestedBranchId)
        : '[missing]',
      resolvedBranchMasked: branchId ? maskId(branchId) : '[missing]',
      notificationOrderMasked: notificationOrderId
        ? maskId(notificationOrderId)
        : '[missing]',
      notificationStatus: notificationStatus || null,
    })

    if (!tenantId) {
      return jsonResponse(
        {
          success: false,
          error: 'تعذر تحديد نطاق المؤسسة. سجّل الدخول مرة أخرى ثم حاول مجددًا.',
        },
        400
      )
    }

    if (!branchId) {
      return jsonResponse(
        {
          success: false,
          error: 'اختر فرعًا محددًا قبل إرسال رسالة واتساب.',
        },
        400
      )
    }

    if (!(await isWhatsAppFeatureEnabled(tenantId))) {
      return whatsappFeatureDisabledResponse()
    }

    const allowedNotification =
      notificationKey && BRANCH_NOTIFICATION_STATUSES.has(notificationStatus)
    const shouldComposeTrustedNotification =
      allowedNotification &&
      (!isFullAdminRole || (!to && !text && !fileUrl))

    if (!isFullAdminRole) {
      if (!allowedNotification) {
        return jsonResponse(
          {
            success: false,
            error: GENERIC_WHATSAPP_FORBIDDEN_MESSAGE,
          },
          403
        )
      }

    }

    if (shouldComposeTrustedNotification) {
      const composedNotification = await loadServerComposedOrderNotification({
        tenantId,
        branchId,
        orderId: notificationOrderId,
        notificationStatus,
      })

      if (!composedNotification) {
        return jsonResponse(
          {
            success: false,
            error: ORDER_NOTIFICATION_CONTENT_FORBIDDEN_MESSAGE,
          },
          403
        )
      }

      to = composedNotification.to
      type = composedNotification.type
      mode = composedNotification.mode
      text = composedNotification.text
      fileUrl = composedNotification.fileUrl
      filename = composedNotification.filename
      caption = composedNotification.caption
    }

    if (!to) {
      return jsonResponse(
        {
          success: false,
          error: 'رقم جوال المستلم مطلوب لإرسال رسالة واتساب.',
        },
        400
      )
    }

    if (type === 'text' && mode === 'text' && !text) {
      return jsonResponse(
        {
          success: false,
          error: 'اكتب نص الرسالة قبل الإرسال.',
        },
        400
      )
    }

    if (type === 'file' && !fileUrl) {
      return jsonResponse(
        {
          success: false,
          error: 'تعذر تجهيز ملف الفاتورة للإرسال. أعد إنشاء الفاتورة ثم حاول مرة أخرى.',
        },
        400
      )
    }

    if (notificationKey) {
      if (await hasSentWhatsAppOrderStatusNotification(notificationKey)) {
        return jsonResponse({
          success: true,
          skipped: true,
          result: null,
        })
      }

      const lockAcquired =
        await acquireWhatsAppOrderStatusNotificationLock(notificationKey)

      if (!lockAcquired) {
        return jsonResponse({
          success: true,
          skipped: true,
          result: null,
        })
      }

      try {
        if (!checkWhatsAppRateLimit(rateLimitKey)) {
          return rateLimitResponse()
        }

        logWhatsAppRouteInfo(requestId, 'before-send', {
          hasAuthUser: Boolean(auth?.user?.id),
          tenantIdMasked: maskOptionalId(auth?.profile?.tenant_id),
          profileBranchMasked: maskOptionalId(auth?.profile?.branch_id),
          requestedBranchMasked: maskOptionalId(requestedBranchId),
          resolvedBranchMasked: maskOptionalId(branchId),
          scopeType: roleScopeType,
          hasRecipient: Boolean(to),
          mode,
          type,
        })

        const result =
          type === 'file'
            ? await (async () => {
                logWhatsAppRouteInfo(requestId, 'notification-file-send-start', {
                  fileUrlLength: fileUrl.length,
                  filename: filename || null,
                  orderMasked: maskId(notificationOrderId),
                })
                const fileResult = await sendWhatsAppFile(
                  {
                    to,
                    branchId,
                    tenantId,
                    fileUrl,
                    filename: filename || undefined,
                    caption: caption || undefined,
                    metadata: {
                      type: 'order_status',
                      orderId: notificationOrderId,
                      status: notificationStatus,
                    },
                  },
                  {
                    mode: 'file',
                    messageType: 'file',
                  }
                )
                logWhatsAppRouteInfo(requestId, 'notification-file-send-result', {
                  success: fileResult.success,
                  providerKey: fileResult.providerKey,
                  providerStatus: fileResult.providerStatus,
                  providerMessageId: fileResult.providerMessageId || null,
                  errorMessage: fileResult.errorMessage || null,
                })
                return fileResult
              })()
            : await sendWhatsAppText(
                {
                  to,
                  branchId,
                  tenantId,
                  text: text || '',
                  metadata: {
                    type: 'order_status',
                    orderId: notificationOrderId,
                    status: notificationStatus,
                  },
                },
                {
                  mode: 'text',
                  messageType: 'text',
                }
              )

        if (!result.success) {
          logWhatsAppRouteInfo(requestId, 'notification-send-failed-result', {
            type,
            providerKey: result.providerKey,
            providerStatus: result.providerStatus,
            errorMessage: result.errorMessage || null,
          })
          await writeFailedWhatsAppAudit({
            auth,
            request: req,
            branchId,
            mode,
            type,
            to,
            hasText: Boolean(text),
            hasFile: type === 'file' && Boolean(fileUrl),
            errorMessage: result.errorMessage,
            providerStatus: result.providerStatus,
            providerKey: result.providerKey,
            orderId: notificationOrderId,
            orderStatus: notificationStatus,
          })
          return whatsAppFailureResponse()
        }

        await markWhatsAppOrderStatusNotificationSent(notificationKey, {
          providerKey: result.providerKey,
          phone: to,
        })

        await writeSuccessfulWhatsAppAudit({
          auth,
          request: req,
          result,
          branchId,
          mode,
          type,
          to,
          hasText: Boolean(text),
          hasFile: type === 'file' && Boolean(fileUrl),
          orderId: notificationOrderId,
          orderStatus: notificationStatus,
        })

        return whatsAppSuccessResponse(result)
      } catch (error) {
        await writeFailedWhatsAppAudit({
          auth,
          request: req,
          branchId,
          mode,
          type,
          to,
          hasText: Boolean(text),
          hasFile: type === 'file' && Boolean(fileUrl),
          errorMessage:
            error instanceof Error ? error.message : 'تعذر إرسال رسالة واتساب',
          orderId: notificationOrderId,
          orderStatus: notificationStatus,
        })
        throw error
      } finally {
        await releaseWhatsAppOrderStatusNotificationLock(notificationKey)
      }
    }

    if (!checkWhatsAppRateLimit(rateLimitKey)) {
      return rateLimitResponse()
    }

    logWhatsAppRouteInfo(requestId, 'before-send', {
      hasAuthUser: Boolean(auth?.user?.id),
      tenantIdMasked: maskOptionalId(auth?.profile?.tenant_id),
      profileBranchMasked: maskOptionalId(auth?.profile?.branch_id),
      requestedBranchMasked: maskOptionalId(requestedBranchId),
      resolvedBranchMasked: maskOptionalId(branchId),
      scopeType: roleScopeType,
      hasRecipient: Boolean(to),
      mode,
      type,
    })

    const result =
      mode === 'test'
        ? await sendWhatsAppTestMessage(
            to,
            branchId,
            tenantId,
            text || undefined
          )
        : type === 'file'
          ? await (async () => {
              logWhatsAppRouteInfo(requestId, 'file-send-start', {
                fileUrlLength: fileUrl.length,
                filename: filename || null,
              })
              const fileResult = await sendWhatsAppFile(
                {
                  to,
                  branchId,
                  tenantId,
                  fileUrl,
                  filename: filename || undefined,
                  caption: caption || undefined,
                },
                {
                  mode: 'file',
                  messageType: 'file',
                }
              )
              logWhatsAppRouteInfo(requestId, 'file-send-result', {
                success: fileResult.success,
                providerKey: fileResult.providerKey,
                providerStatus: fileResult.providerStatus,
                providerMessageId: fileResult.providerMessageId || null,
                errorMessage: fileResult.errorMessage || null,
              })
              return fileResult
            })()
          : await sendWhatsAppText(
              {
                to,
                branchId,
                tenantId,
                text: text || '',
              },
              {
                mode: 'text',
                messageType: 'text',
              }
            )

    if (!result.success) {
      logWhatsAppRouteInfo(requestId, 'send-failed-result', {
        type,
        providerKey: result.providerKey,
        providerStatus: result.providerStatus,
        errorMessage: result.errorMessage || null,
      })
      return whatsAppFailureResponse()
    }

    await writeSuccessfulWhatsAppAudit({
      auth,
      request: req,
      result,
      branchId,
      mode,
      type,
      to,
      hasText: Boolean(text),
      hasFile: type === 'file' && Boolean(fileUrl),
    })

    return whatsAppSuccessResponse(result)
  } catch (error) {
    logWhatsAppRouteError(requestId, 'catch', error, {
      type,
      mode,
      toMasked: maskPhone(to),
    })

    logWhatsAppSend({
      provider: 'unknown',
      phone: to || 'unknown',
      messageType: type,
      mode: type === 'file' ? 'file' : mode,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    })

    console.error({
      scope: 'whatsapp-route-catch',
      error: redactSensitive(error),
    })

    return jsonResponse(
      {
        success: false,
        error: 'تعذر إرسال رسالة واتساب حاليًا. لم يتم تأكيد الإرسال.',
      },
      500
    )
  }
}

import { NextRequest } from 'next/server'
import { jsonResponse } from '@/lib/api/responses'
import { getTrimmedString } from '@/lib/api/validation'
import { requireApiAuth } from '@/lib/api-auth'
import { writeAuditLog } from '@/lib/audit-log'
import { maskId, maskPhone, redactSensitive } from '@/lib/security/redaction'
import { logWhatsAppSend } from '@/lib/whatsapp/logging'
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
const whatsappRateLimitStore = new Map<string, WhatsAppRateLimitEntry>()

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
      stack: error.stack,
      cause:
        error.cause instanceof Error
          ? {
              name: error.cause.name,
              message: error.cause.message,
              stack: error.cause.stack,
            }
          : error.cause,
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
    error: serializeWhatsAppError(error),
    ...details,
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
      error: 'تعذر إرسال رسالة واتساب',
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
    const text = getTrimmedString(body.text)
    mode = body.mode === 'test' ? 'test' : 'text'
    const fileUrl = getTrimmedString(body.fileUrl)
    const filename = getTrimmedString(body.filename)
    const caption = getTrimmedString(body.caption)
    const tenantId = auth.profile.tenant_id
    const requestedBranchId = getTrimmedString(body.branchId)
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

    if (!to) {
      return jsonResponse(
        {
          success: false,
          error: 'Recipient phone is required',
        },
        400
      )
    }

    if (!tenantId) {
      return jsonResponse(
        {
          success: false,
          error: 'Tenant context is required for WhatsApp config',
        },
        400
      )
    }

    if (!branchId) {
      return jsonResponse(
        {
          success: false,
          error: 'Branch WhatsApp config requires a concrete branch',
        },
        400
      )
    }

    if (!(await isWhatsAppFeatureEnabled(tenantId))) {
      return whatsappFeatureDisabledResponse()
    }

    if (type === 'text' && mode === 'text' && !text) {
      return jsonResponse(
        {
          success: false,
          error: 'Message text is required',
        },
        400
      )
    }

    if (type === 'file' && !fileUrl) {
      return jsonResponse(
        {
          success: false,
          error: 'File URL is required',
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

        console.info({
          scope: 'whatsapp-route-before-send',
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

    console.info({
      scope: 'whatsapp-route-before-send',
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
        error: 'تعذر إرسال رسالة واتساب',
      },
      500
    )
  }
}

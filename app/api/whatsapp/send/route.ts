import { NextRequest } from 'next/server'
import { jsonResponse } from '@/lib/api/responses'
import { getTrimmedString } from '@/lib/api/validation'
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

type SendWhatsAppBody = {
  type?: 'text' | 'file'
  to?: string
  text?: string
  mode?: 'text' | 'test'
  fileUrl?: string
  filename?: string
  caption?: string
  notification?: {
    orderId?: string
    status?: string
    channel?: 'whatsapp'
  }
}

export async function POST(req: NextRequest) {
  let to = ''
  let type: 'text' | 'file' = 'text'
  let mode: 'text' | 'test' = 'text'

  try {
    const body = (await req.json()) as SendWhatsAppBody

    type = body.type === 'file' ? 'file' : 'text'
    to = getTrimmedString(body.to)
    const text = getTrimmedString(body.text)
    mode = body.mode === 'test' ? 'test' : 'text'
    const fileUrl = getTrimmedString(body.fileUrl)
    const filename = getTrimmedString(body.filename)
    const caption = getTrimmedString(body.caption)
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

    if (!to) {
      return jsonResponse(
        {
          success: false,
          error: 'Recipient phone is required',
        },
        400
      )
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
          providerKey: process.env.WHATSAPP_PROVIDER?.trim() || 'ultramsg',
          result: null,
        })
      }

      const lockAcquired =
        await acquireWhatsAppOrderStatusNotificationLock(notificationKey)

      if (!lockAcquired) {
        return jsonResponse({
          success: true,
          skipped: true,
          providerKey: process.env.WHATSAPP_PROVIDER?.trim() || 'ultramsg',
          result: null,
        })
      }

      try {
        const result =
          type === 'file'
            ? await sendWhatsAppFile(
                {
                  to,
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
            : await sendWhatsAppText(
                {
                  to,
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
          return jsonResponse(
            {
              success: false,
              providerKey: result.providerKey,
              error: result.errorMessage || 'WhatsApp send failed',
              result: result.raw ?? null,
            },
            500
          )
        }

        await markWhatsAppOrderStatusNotificationSent(notificationKey, {
          providerKey: result.providerKey,
          phone: to,
        })

        return jsonResponse({
          success: true,
          providerKey: result.providerKey,
          result: result.raw ?? null,
        })
      } finally {
        await releaseWhatsAppOrderStatusNotificationLock(notificationKey)
      }
    }

    const result =
      mode === 'test'
        ? await sendWhatsAppTestMessage(to, text || undefined)
        : type === 'file'
        ? await sendWhatsAppFile(
            {
              to,
              fileUrl,
              filename: filename || undefined,
              caption: caption || undefined,
            },
            {
              mode: 'file',
              messageType: 'file',
            }
          )
        : await sendWhatsAppText(
            {
              to,
              text: text || '',
            },
            {
              mode: 'text',
              messageType: 'text',
            }
          )

    if (!result.success) {
      return jsonResponse(
        {
          success: false,
          providerKey: result.providerKey,
          error: result.errorMessage || 'WhatsApp send failed',
          result: result.raw ?? null,
        },
        500
      )
    }

    return jsonResponse({
      success: true,
      providerKey: result.providerKey,
      result: result.raw ?? null,
    })
  } catch (error) {
    logWhatsAppSend({
      provider: process.env.WHATSAPP_PROVIDER?.trim() || 'ultramsg',
      phone: to || 'unknown',
      messageType: type,
      mode: type === 'file' ? 'file' : mode,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    })

    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
}

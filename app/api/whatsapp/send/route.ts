import { NextRequest } from 'next/server'
import { jsonResponse } from '@/lib/api/responses'
import { getTrimmedString } from '@/lib/api/validation'
import { logWhatsAppSend } from '@/lib/whatsapp/logging'
import {
  sendWhatsAppTestMessage,
  sendWhatsAppText,
} from '@/lib/whatsapp/service'

type SendWhatsAppBody = {
  to?: string
  text?: string
  mode?: 'text' | 'test'
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SendWhatsAppBody

    const to = getTrimmedString(body.to)
    const text = getTrimmedString(body.text)
    const mode = body.mode === 'test' ? 'test' : 'text'

    if (!to) {
      return jsonResponse(
        {
          success: false,
          error: 'Recipient phone is required',
        },
        400
      )
    }

    if (mode === 'text' && !text) {
      return jsonResponse(
        {
          success: false,
          error: 'Message text is required',
        },
        400
      )
    }

    const result =
      mode === 'test'
        ? await sendWhatsAppTestMessage(to, text || undefined)
        : await sendWhatsAppText({
            to,
            text: text || '',
          }, {
            mode: 'text',
            messageType: 'text',
          })

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
      phone: 'unknown',
      messageType: 'text',
      mode: 'text',
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

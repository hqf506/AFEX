import { getWhatsAppProvider } from '@/lib/whatsapp/provider-registry'
import type {
  UltraMsgProviderConfig,
  WhatsAppProviderKey,
  WhatsAppServiceResult,
  WhatsAppSendTextInput,
} from '@/lib/whatsapp/types'

function resolveProviderKey(): WhatsAppProviderKey {
  const providerKey = process.env.WHATSAPP_PROVIDER?.trim()

  if (providerKey === 'meta') {
    return 'meta'
  }

  return 'ultramsg'
}

function resolveUltraMsgConfig(): UltraMsgProviderConfig {
  return {
    providerKey: 'ultramsg',
    apiUrl: process.env.ULTRAMSG_API_URL?.trim() || '',
    token: process.env.ULTRAMSG_TOKEN?.trim() || '',
  }
}

function buildTextMessage(input: WhatsAppSendTextInput) {
  return input.text.trim()
}

export async function sendWhatsAppText(
  input: WhatsAppSendTextInput
): Promise<WhatsAppServiceResult> {
  const providerKey = resolveProviderKey()
  const provider = getWhatsAppProvider(providerKey)

  if (providerKey !== 'ultramsg') {
    throw new Error(`WhatsApp provider "${providerKey}" is not configured for MVP`)
  }

  const config = resolveUltraMsgConfig()
  const validation = provider.validateConfig(config)

  if (!validation.valid) {
    throw new Error(validation.errors.join(', '))
  }

  const result = await provider.sendText(
    {
      ...input,
      text: buildTextMessage(input),
    },
    config
  )

  if (result.success) {
    console.log('[whatsapp] send success', {
      providerKey,
      to: input.to,
      providerMessageId: result.providerMessageId,
    })
  } else {
    console.error('[whatsapp] send failed', {
      providerKey,
      to: input.to,
      errorMessage: result.errorMessage,
      raw: result.raw,
    })
  }

  return {
    providerKey,
    ...result,
  }
}

export async function sendWhatsAppTestMessage(
  to: string,
  message?: string
): Promise<WhatsAppServiceResult> {
  return sendWhatsAppText({
    to,
    text:
      message?.trim() ||
      'هذه رسالة اختبار من نظام Leather Fix ERP عبر تكامل واتساب.',
    metadata: {
      type: 'test',
    },
  })
}

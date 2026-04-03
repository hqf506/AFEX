import { getWhatsAppProvider } from '@/lib/whatsapp/provider-registry'
import { logWhatsAppSend } from '@/lib/whatsapp/logging'
import type {
  UltraMsgProviderConfig,
  WhatsAppProviderKey,
  WhatsAppServiceResult,
  WhatsAppSendFileInput,
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

function buildFileMessage(input: WhatsAppSendFileInput): WhatsAppSendFileInput {
  return {
    ...input,
    fileUrl: input.fileUrl.trim(),
    filename: input.filename?.trim() || undefined,
    caption: input.caption?.trim() || undefined,
  }
}

type SendWhatsAppTextOptions = {
  mode?: 'text' | 'test'
  messageType?: 'text'
}

type SendWhatsAppFileOptions = {
  mode?: 'file'
  messageType?: 'file'
}

export async function sendWhatsAppText(
  input: WhatsAppSendTextInput,
  options: SendWhatsAppTextOptions = {}
): Promise<WhatsAppServiceResult> {
  const mode = options.mode || 'text'
  const messageType = options.messageType || 'text'
  const providerKey = resolveProviderKey()

  try {
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

    logWhatsAppSend({
      provider: providerKey,
      phone: input.to,
      messageType,
      mode,
      success: result.success,
      errorMessage: result.success ? undefined : result.errorMessage,
    })

    return {
      providerKey,
      ...result,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown WhatsApp send error'

    logWhatsAppSend({
      provider: providerKey,
      phone: input.to,
      messageType,
      mode,
      success: false,
      errorMessage,
    })

    throw error
  }
}

export async function sendWhatsAppFile(
  input: WhatsAppSendFileInput,
  options: SendWhatsAppFileOptions = {}
): Promise<WhatsAppServiceResult> {
  const mode = options.mode || 'file'
  const messageType = options.messageType || 'file'
  const providerKey = resolveProviderKey()

  try {
    const provider = getWhatsAppProvider(providerKey)

    if (providerKey !== 'ultramsg') {
      throw new Error(`WhatsApp provider "${providerKey}" is not configured for MVP`)
    }

    const config = resolveUltraMsgConfig()
    const validation = provider.validateConfig(config)

    if (!validation.valid) {
      throw new Error(validation.errors.join(', '))
    }

    const result = await provider.sendFile(buildFileMessage(input), config)

    logWhatsAppSend({
      provider: providerKey,
      phone: input.to,
      messageType,
      mode,
      success: result.success,
      errorMessage: result.success ? undefined : result.errorMessage,
    })

    return {
      providerKey,
      ...result,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown WhatsApp send error'

    logWhatsAppSend({
      provider: providerKey,
      phone: input.to,
      messageType,
      mode,
      success: false,
      errorMessage,
    })

    throw error
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
  }, {
    mode: 'test',
    messageType: 'text',
  })
}

import { getWhatsAppProvider } from '@/lib/whatsapp/provider-registry'
import { logWhatsAppSend } from '@/lib/whatsapp/logging'
import { getBranchWhatsAppProviderConfig } from '@/lib/whatsapp/config'
import type {
  WhatsAppProviderKey,
  WhatsAppServiceResult,
  WhatsAppSendFileInput,
  WhatsAppSendImageInput,
  WhatsAppSendTextInput,
} from '@/lib/whatsapp/types'

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

function buildImageMessage(
  input: WhatsAppSendImageInput
): WhatsAppSendImageInput {
  return {
    ...input,
    imageUrl: input.imageUrl.trim(),
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

type SendWhatsAppImageOptions = {
  mode?: 'image'
  messageType?: 'image'
}

export async function sendWhatsAppText(
  input: WhatsAppSendTextInput,
  options: SendWhatsAppTextOptions = {}
): Promise<WhatsAppServiceResult> {
  const mode = options.mode || 'text'
  const messageType = options.messageType || 'text'
  let providerKey: WhatsAppProviderKey = 'ultramsg'

  try {
    const config = await getBranchWhatsAppProviderConfig(
      input.branchId,
      input.tenantId
    )

    if (!config) {
      return {
        providerKey,
        success: false,
        errorMessage: 'WhatsApp branch config is missing or inactive',
      }
    }

    providerKey = config.providerKey
    const provider = getWhatsAppProvider(providerKey)
    const validation = provider.validateConfig(config)

    if (!validation.valid) {
      return {
        providerKey,
        success: false,
        errorMessage: validation.errors.join(', '),
      }
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
  let providerKey: WhatsAppProviderKey = 'ultramsg'

  try {
    const config = await getBranchWhatsAppProviderConfig(
      input.branchId,
      input.tenantId
    )

    if (!config) {
      return {
        providerKey,
        success: false,
        errorMessage: 'WhatsApp branch config is missing or inactive',
      }
    }

    providerKey = config.providerKey
    const provider = getWhatsAppProvider(providerKey)
    const validation = provider.validateConfig(config)

    if (!validation.valid) {
      return {
        providerKey,
        success: false,
        errorMessage: validation.errors.join(', '),
      }
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

export async function sendWhatsAppImage(
  input: WhatsAppSendImageInput,
  options: SendWhatsAppImageOptions = {}
): Promise<WhatsAppServiceResult> {
  const mode = options.mode || 'image'
  const messageType = options.messageType || 'image'
  let providerKey: WhatsAppProviderKey = 'ultramsg'

  try {
    const config = await getBranchWhatsAppProviderConfig(
      input.branchId,
      input.tenantId
    )

    if (!config) {
      return {
        providerKey,
        success: false,
        errorMessage: 'WhatsApp branch config is missing or inactive',
      }
    }

    providerKey = config.providerKey
    const provider = getWhatsAppProvider(providerKey)
    const validation = provider.validateConfig(config)

    if (!validation.valid) {
      return {
        providerKey,
        success: false,
        errorMessage: validation.errors.join(', '),
      }
    }

    const result = await provider.sendImage(buildImageMessage(input), config)

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
  branchId?: string | null,
  tenantId?: string | null,
  message?: string
): Promise<WhatsAppServiceResult> {
  return sendWhatsAppText(
    {
      to,
      branchId: branchId || null,
      tenantId: tenantId || null,
      text:
        message?.trim() ||
        'هذه رسالة اختبار من نظام AFEX عبر تكامل واتساب.',
      metadata: {
        type: 'test',
      },
    },
    {
      mode: 'test',
      messageType: 'text',
    }
  )
}

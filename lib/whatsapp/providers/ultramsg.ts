import type { WhatsAppProviderAdapter } from '@/lib/whatsapp/providers/base'
import type {
  UltraMsgProviderConfig,
  WhatsAppProviderSendResult,
  WhatsAppSendFileInput,
  WhatsAppSendImageInput,
  WhatsAppSendTextInput,
} from '@/lib/whatsapp/types'

const PROVIDER_REQUEST_TIMEOUT_MS = 15_000

function normalizeUltraMsgPhone(phone: string) {
  return phone.replace(/\D/g, '')
}

async function fetchUltraMsg(url: string, init: RequestInit) {
  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(),
    PROVIDER_REQUEST_TIMEOUT_MS
  )

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('UltraMsg request timed out', { cause: error })
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export class UltraMsgProviderAdapter
  implements WhatsAppProviderAdapter<UltraMsgProviderConfig>
{
  providerKey = 'ultramsg' as const

  validateConfig(config: UltraMsgProviderConfig) {
    const errors: string[] = []

    if (!config.apiUrl?.trim()) {
      errors.push('UltraMsg API URL is required')
    }

    if (!config.token?.trim()) {
      errors.push('UltraMsg token is required')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  async sendText(
    input: WhatsAppSendTextInput,
    config: UltraMsgProviderConfig
  ): Promise<WhatsAppProviderSendResult> {
    const response = await fetchUltraMsg(`${config.apiUrl}/messages/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: config.token,
        to: normalizeUltraMsgPhone(input.to),
        body: input.text,
      }),
    })

    const raw = await response.json().catch(() => null)

    if (!response.ok) {
      return {
        success: false,
        providerStatus: String(response.status),
        raw,
        errorMessage: 'UltraMsg request failed',
      }
    }

    return {
      success: true,
      providerMessageId:
        typeof raw?.id === 'string'
          ? raw.id
          : typeof raw?.data?.id === 'string'
          ? raw.data.id
          : undefined,
      providerStatus:
        typeof raw?.sent === 'string'
          ? raw.sent
          : typeof raw?.status === 'string'
          ? raw.status
          : String(response.status),
      raw,
    }
  }

  async sendFile(
    input: WhatsAppSendFileInput,
    config: UltraMsgProviderConfig
  ): Promise<WhatsAppProviderSendResult> {
    const response = await fetchUltraMsg(`${config.apiUrl}/messages/document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: config.token,
        to: normalizeUltraMsgPhone(input.to),
        document: input.fileUrl,
        filename: input.filename,
        caption: input.caption,
      }),
    })

    const raw = await response.json().catch(() => null)

    if (!response.ok) {
      return {
        success: false,
        providerStatus: String(response.status),
        raw,
        errorMessage: 'UltraMsg request failed',
      }
    }

    return {
      success: true,
      providerMessageId:
        typeof raw?.id === 'string'
          ? raw.id
          : typeof raw?.data?.id === 'string'
          ? raw.data.id
          : undefined,
      providerStatus:
        typeof raw?.sent === 'string'
          ? raw.sent
          : typeof raw?.status === 'string'
          ? raw.status
          : String(response.status),
      raw,
    }
  }

  async sendImage(
    input: WhatsAppSendImageInput,
    config: UltraMsgProviderConfig
  ): Promise<WhatsAppProviderSendResult> {
    const response = await fetchUltraMsg(`${config.apiUrl}/messages/image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: config.token,
        to: normalizeUltraMsgPhone(input.to),
        image: input.imageUrl,
        caption: input.caption,
      }),
    })

    const raw = await response.json().catch(() => null)

    if (!response.ok) {
      return {
        success: false,
        providerStatus: String(response.status),
        raw,
        errorMessage: 'UltraMsg request failed',
      }
    }

    return {
      success: true,
      providerMessageId:
        typeof raw?.id === 'string'
          ? raw.id
          : typeof raw?.data?.id === 'string'
          ? raw.data.id
          : undefined,
      providerStatus:
        typeof raw?.sent === 'string'
          ? raw.sent
          : typeof raw?.status === 'string'
          ? raw.status
          : String(response.status),
      raw,
    }
  }
}

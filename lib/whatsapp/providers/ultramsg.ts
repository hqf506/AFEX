import type { WhatsAppProviderAdapter } from '@/lib/whatsapp/providers/base'
import type {
  UltraMsgProviderConfig,
  WhatsAppProviderSendResult,
  WhatsAppSendTextInput,
} from '@/lib/whatsapp/types'

function normalizeUltraMsgPhone(phone: string) {
  return phone.replace(/\D/g, '')
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
    const response = await fetch(`${config.apiUrl}/messages/chat`, {
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
}

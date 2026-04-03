import { UltraMsgProviderAdapter } from '@/lib/whatsapp/providers/ultramsg'
import type { WhatsAppProviderAdapter } from '@/lib/whatsapp/providers/base'
import type { WhatsAppProviderKey } from '@/lib/whatsapp/types'

const providerRegistry: Record<WhatsAppProviderKey, WhatsAppProviderAdapter | null> = {
  ultramsg: new UltraMsgProviderAdapter(),
  meta: null,
}

export function getWhatsAppProvider(providerKey: WhatsAppProviderKey) {
  const provider = providerRegistry[providerKey]

  if (!provider) {
    throw new Error(`WhatsApp provider "${providerKey}" is not implemented yet`)
  }

  return provider
}

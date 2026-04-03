import type {
  WhatsAppProviderConfig,
  WhatsAppProviderKey,
  WhatsAppProviderSendResult,
  WhatsAppProviderValidationResult,
  WhatsAppSendFileInput,
  WhatsAppSendTextInput,
} from '@/lib/whatsapp/types'

export interface WhatsAppProviderAdapter<
  TConfig extends WhatsAppProviderConfig = WhatsAppProviderConfig,
> {
  providerKey: WhatsAppProviderKey
  validateConfig(config: TConfig): WhatsAppProviderValidationResult
  sendText(
    input: WhatsAppSendTextInput,
    config: TConfig
  ): Promise<WhatsAppProviderSendResult>
  sendFile(
    input: WhatsAppSendFileInput,
    config: TConfig
  ): Promise<WhatsAppProviderSendResult>
}

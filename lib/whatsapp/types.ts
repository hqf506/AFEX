export type WhatsAppProviderKey = 'ultramsg' | 'meta'

export type WhatsAppSendTextInput = {
  to: string
  text: string
  metadata?: Record<string, unknown>
}

export type WhatsAppProviderSendResult = {
  success: boolean
  providerMessageId?: string
  providerStatus?: string
  raw?: unknown
  errorMessage?: string
}

export type WhatsAppProviderValidationResult = {
  valid: boolean
  errors: string[]
}

export type UltraMsgProviderConfig = {
  providerKey: 'ultramsg'
  apiUrl: string
  token: string
}

export type MetaCompatibleProviderConfig = {
  providerKey: 'meta'
  apiUrl: string
  accessToken: string
  phoneNumberId: string
}

export type WhatsAppProviderConfig =
  | UltraMsgProviderConfig
  | MetaCompatibleProviderConfig

export type WhatsAppServiceResult = WhatsAppProviderSendResult & {
  providerKey: WhatsAppProviderKey
}

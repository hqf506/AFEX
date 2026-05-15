import {
  maskPhone,
  redactSensitive,
  safeErrorMessage,
} from '@/lib/security/redaction'

type WhatsAppLogEntry = {
  provider: string
  phone: string
  messageType: string
  mode: string
  success: boolean
  errorMessage?: string
  timestamp?: string
}

function sanitizeErrorMessage(errorMessage?: string) {
  if (!errorMessage) {
    return undefined
  }

  return safeErrorMessage(errorMessage, 'WhatsApp provider error')
}

export function logWhatsAppSend(entry: WhatsAppLogEntry) {
  const payload = redactSensitive({
    provider: entry.provider,
    phone: maskPhone(entry.phone),
    messageType: entry.messageType,
    mode: entry.mode,
    success: entry.success,
    errorMessage: sanitizeErrorMessage(entry.errorMessage),
    timestamp: entry.timestamp || new Date().toISOString(),
  })

  if (entry.success) {
    console.log('[whatsapp] send log', payload)
    return
  }

  console.error('[whatsapp] send log', payload)
}

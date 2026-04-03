type WhatsAppLogEntry = {
  provider: string
  phone: string
  messageType: string
  mode: string
  success: boolean
  errorMessage?: string
  timestamp?: string
}

export function logWhatsAppSend(entry: WhatsAppLogEntry) {
  const payload = {
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
  }

  if (entry.success) {
    console.log('[whatsapp] send log', payload)
    return
  }

  console.error('[whatsapp] send log', payload)
}

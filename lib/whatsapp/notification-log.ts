type WhatsAppNotificationKeyInput = {
  orderId: string
  status: string
  channel?: 'whatsapp'
}

const sentNotifications = new Map<string, Record<string, unknown>>()
const notificationLocks = new Set<string>()

function normalizeKeyPart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
}

function buildNotificationKey(input: WhatsAppNotificationKeyInput) {
  const channel = input.channel || 'whatsapp'
  return `${normalizeKeyPart(channel)}__${normalizeKeyPart(
    input.orderId
  )}__${normalizeKeyPart(input.status)}`
}

export async function hasSentWhatsAppOrderStatusNotification(
  input: WhatsAppNotificationKeyInput
) {
  return sentNotifications.has(buildNotificationKey(input))
}

export async function acquireWhatsAppOrderStatusNotificationLock(
  input: WhatsAppNotificationKeyInput
) {
  const key = buildNotificationKey(input)

  if (notificationLocks.has(key)) {
    return false
  }

  notificationLocks.add(key)
  return true
}

export async function releaseWhatsAppOrderStatusNotificationLock(
  input: WhatsAppNotificationKeyInput
) {
  notificationLocks.delete(buildNotificationKey(input))
}

export async function markWhatsAppOrderStatusNotificationSent(
  input: WhatsAppNotificationKeyInput,
  payload: Record<string, unknown>
) {
  sentNotifications.set(buildNotificationKey(input), {
    ...payload,
    channel: input.channel || 'whatsapp',
    orderId: input.orderId,
    status: input.status,
    sentAt: new Date().toISOString(),
  })
}

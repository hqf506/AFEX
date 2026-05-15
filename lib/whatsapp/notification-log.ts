import { promises as fs } from 'node:fs'
import path from 'node:path'

type WhatsAppNotificationKeyInput = {
  orderId: string
  status: string
  channel?: 'whatsapp'
}

const NOTIFICATION_LOG_DIR = path.join(
  process.cwd(),
  '.runtime-data',
  'whatsapp-order-status-notifications'
)

function isReadOnlyServerlessRuntime() {
  return Boolean(process.env.VERCEL)
}

function normalizeKeyPart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
}

function buildNotificationFileBase(input: WhatsAppNotificationKeyInput) {
  const channel = input.channel || 'whatsapp'
  return `${normalizeKeyPart(channel)}__${normalizeKeyPart(
    input.orderId
  )}__${normalizeKeyPart(input.status)}`
}

function getSentFilePath(input: WhatsAppNotificationKeyInput) {
  return path.join(NOTIFICATION_LOG_DIR, `${buildNotificationFileBase(input)}.json`)
}

function getLockFilePath(input: WhatsAppNotificationKeyInput) {
  return path.join(NOTIFICATION_LOG_DIR, `${buildNotificationFileBase(input)}.lock`)
}

async function ensureNotificationLogDir() {
  await fs.mkdir(NOTIFICATION_LOG_DIR, { recursive: true })
}

export async function hasSentWhatsAppOrderStatusNotification(
  input: WhatsAppNotificationKeyInput
) {
  if (isReadOnlyServerlessRuntime()) {
    return false
  }

  try {
    await fs.access(getSentFilePath(input))
    return true
  } catch {
    return false
  }
}

export async function acquireWhatsAppOrderStatusNotificationLock(
  input: WhatsAppNotificationKeyInput
) {
  if (isReadOnlyServerlessRuntime()) {
    return true
  }

  await ensureNotificationLogDir()

  try {
    await fs.writeFile(getLockFilePath(input), new Date().toISOString(), {
      flag: 'wx',
    })
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return false
    }

    throw error
  }
}

export async function releaseWhatsAppOrderStatusNotificationLock(
  input: WhatsAppNotificationKeyInput
) {
  if (isReadOnlyServerlessRuntime()) {
    return
  }

  try {
    await fs.unlink(getLockFilePath(input))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

export async function markWhatsAppOrderStatusNotificationSent(
  input: WhatsAppNotificationKeyInput,
  payload: Record<string, unknown>
) {
  if (isReadOnlyServerlessRuntime()) {
    return
  }

  await ensureNotificationLogDir()

  await fs.writeFile(
    getSentFilePath(input),
    JSON.stringify(
      {
        ...payload,
        channel: input.channel || 'whatsapp',
        orderId: input.orderId,
        status: input.status,
        sentAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  )
}

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const PHONE_PATTERN = /(?<!\d)(?:\+?\d[\d\s().-]{6,}\d)(?!\d)/g
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi
const SECRET_ASSIGNMENT_PATTERN =
  /\b(token|secret|api[_-]?key|apikey|access[_-]?key|password|pin|instance[_-]?id|api[_-]?url|tenant[_-]?id|branch[_-]?id|user[_-]?id|raw)\b\s*[:=]\s*['"]?[^'",}\s]+/gi

const SENSITIVE_KEY_PARTS = [
  'email',
  'phone',
  'token',
  'secret',
  'api_key',
  'apikey',
  'access_key',
  'password',
  'pin',
  'instance_id',
  'api_url',
  'tenant_id',
  'branch_id',
  'user_id',
  'userid',
  'raw',
]

export function maskEmail(email: string) {
  const [localPart = '', domain = ''] = email.trim().split('@')

  if (!localPart || !domain) {
    return '[redacted-email]'
  }

  const visible = localPart.slice(0, Math.min(2, localPart.length))
  return `${visible}***@${domain}`
}

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')

  if (!digits) {
    return 'unknown'
  }

  return `***${digits.slice(-4)}`
}

export function maskId(id: string) {
  const normalized = id.trim()

  if (normalized.length <= 8) {
    return '[redacted-id]'
  }

  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`
}

function isSensitiveKey(key: string) {
  const normalizedKey = key.toLowerCase()

  return SENSITIVE_KEY_PARTS.some((part) => normalizedKey.includes(part))
}

function redactString(value: string) {
  return value
    .replace(SECRET_ASSIGNMENT_PATTERN, '$1=[redacted]')
    .replace(EMAIL_PATTERN, (match) => maskEmail(match))
    .replace(UUID_PATTERN, (match) => maskId(match))
    .replace(PHONE_PATTERN, (match) => maskPhone(match))
}

export function redactSensitive(input: unknown): unknown {
  if (typeof input === 'string') {
    return redactString(input)
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactSensitive(item))
  }

  if (!input || typeof input !== 'object') {
    return input
  }

  const redacted: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(input)) {
    if (isSensitiveKey(key)) {
      if (typeof value === 'string') {
        if (key.toLowerCase().includes('email')) {
          redacted[key] = maskEmail(value)
        } else if (key.toLowerCase().includes('phone')) {
          redacted[key] = maskPhone(value)
        } else if (key.toLowerCase().endsWith('id')) {
          redacted[key] = maskId(value)
        } else {
          redacted[key] = '[redacted]'
        }
      } else {
        redacted[key] = '[redacted]'
      }
      continue
    }

    redacted[key] = redactSensitive(value)
  }

  return redacted
}

export function safeErrorMessage(error: unknown, fallback: string) {
  if (process.env.NODE_ENV === 'production') {
    return fallback
  }

  if (error instanceof Error) {
    return String(redactSensitive(error.message))
  }

  if (typeof error === 'string') {
    return String(redactSensitive(error))
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    return typeof message === 'string'
      ? String(redactSensitive(message))
      : fallback
  }

  return fallback
}

export function safeErrorDetails(error: unknown, fallback: string) {
  if (process.env.NODE_ENV === 'production') {
    return {}
  }

  return {
    details: safeErrorMessage(error, fallback),
  }
}

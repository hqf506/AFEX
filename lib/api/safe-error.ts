import { redactSensitive } from '@/lib/security/redaction'

const ARABIC_PATTERN = /[\u0600-\u06ff]/
const SUPPORT_REFERENCE_PATTERN = /^AFEX-[A-F0-9]{8}$/
const BLOCKED_RESPONSE_KEYS = new Set([
  'cause',
  'code',
  'column',
  'constraint',
  'details',
  'hint',
  'providerResponse',
  'query',
  'rawError',
  'schema',
  'stack',
  'table',
])

const STATUS_MESSAGES: Record<number, string> = {
  401: 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى.',
  403: 'لا تملك صلاحية تنفيذ هذه العملية.',
  404: 'العنصر المطلوب غير موجود أو تم حذفه.',
  409: 'هذه البيانات مستخدمة مسبقًا أو تتعارض مع سجل موجود.',
  422: 'تحقق من البيانات المدخلة ثم حاول مرة أخرى.',
  429: 'تم تنفيذ محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.',
  500: 'حدث خطأ غير متوقع أثناء تنفيذ العملية. لم تكتمل العملية. حاول مرة أخرى، وإذا استمرت المشكلة تواصل مع المسؤول.',
}

export type SafeApiErrorBody = {
  error: string
  reference?: string
  retryable?: boolean
  suggestions?: string[]
}

export function createSupportReference() {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
  return `AFEX-${suffix}`
}

export function isSafeSupportReference(value: unknown): value is string {
  return typeof value === 'string' && SUPPORT_REFERENCE_PATTERN.test(value)
}

export function isSafeArabicUserMessage(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const message = value.trim()
  return Boolean(message) && ARABIC_PATTERN.test(message) && !/\[object Object\]/i.test(message)
}

export function getSafeStatusMessage(status: number) {
  if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status]
  if (status >= 500) return STATUS_MESSAGES[500]
  if (status >= 400) return 'تعذر تنفيذ العملية. تحقق من البيانات ثم حاول مرة أخرى.'
  return STATUS_MESSAGES[500]
}

function hasBlockedDiagnosticFields(body: Record<string, unknown>) {
  return Object.keys(body).some((key) => BLOCKED_RESPONSE_KEYS.has(key))
}

export function sanitizeApiErrorBody(
  body: Record<string, unknown>,
  status: number
): SafeApiErrorBody {
  const originalError = body.error
  const error = isSafeArabicUserMessage(originalError)
    ? originalError.trim()
    : getSafeStatusMessage(status)
  const shouldReference =
    status >= 500 ||
    hasBlockedDiagnosticFields(body) ||
    !isSafeArabicUserMessage(originalError)
  const reference = isSafeSupportReference(body.reference)
    ? body.reference
    : shouldReference
      ? createSupportReference()
      : undefined
  const retryable = typeof body.retryable === 'boolean' ? body.retryable : undefined
  const suggestions = Array.isArray(body.suggestions)
    ? body.suggestions.filter(
        (value): value is string => typeof value === 'string' && /^[a-z0-9._-]{3,64}$/i.test(value)
      )
    : undefined

  return {
    error,
    ...(reference ? { reference } : {}),
    ...(retryable !== undefined ? { retryable } : {}),
    ...(suggestions?.length ? { suggestions } : {}),
  }
}

export function logSanitizedServerError({
  reference,
  route,
  action,
  error,
}: {
  reference: string
  route: string
  action: string
  error: unknown
}) {
  const diagnostic =
    error instanceof Error
      ? { name: error.name, message: error.message }
      : error

  console.error('[api-error]', {
    reference,
    route,
    action,
    diagnostic: redactSensitive(diagnostic),
  })
}

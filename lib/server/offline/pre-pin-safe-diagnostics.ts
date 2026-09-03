export type PrePinDatabaseEvidence = Readonly<{
  databaseCode: string
  databaseMessage: string | null
  databaseDetails: string | null
  databaseHint: string | null
}>

const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/u
const POSTGREST_CODE_PATTERN = /^PGRST[0-9]{3}$/u
const NON_SQLSTATE_LABELS = new Set(['ERROR', 'FATAL', 'PANIC'])
const MAX_DIAGNOSTIC_LENGTH = 512

export function safePrePinDatabaseCode(value: unknown) {
  if (
    typeof value === 'string' &&
    !NON_SQLSTATE_LABELS.has(value) &&
    (SQLSTATE_PATTERN.test(value) || POSTGREST_CODE_PATTERN.test(value))
  ) {
    return value
  }
  return 'DATABASE_ERROR_UNCLASSIFIED'
}

export function sanitizePrePinDatabaseText(value: unknown) {
  if (typeof value !== 'string') return null
  const sanitized = value
    .replace(/[\u0000-\u001f\u007f]+/gu, ' ')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, '[token]')
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu,
      '[uuid]'
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, '[email]')
    .replace(/(?:\+?966|0)?5[0-9][\s-]?[0-9]{3}[\s-]?[0-9]{4}\b/gu, '[phone]')
    .replace(/\b[0-9a-f]{32,}\b/giu, '[hash]')
    .replace(/\b[A-Za-z0-9+/=-]{40,}\b/gu, '[opaque]')
    .replace(
      /\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/giu,
      '$1=[redacted]'
    )
    .replace(/\s{2,}/gu, ' ')
    .trim()
  return sanitized ? sanitized.slice(0, MAX_DIAGNOSTIC_LENGTH) : null
}

export function prePinDatabaseEvidence(error: unknown): PrePinDatabaseEvidence {
  const record =
    error && typeof error === 'object'
      ? (error as Record<string, unknown>)
      : Object.create(null)
  return Object.freeze({
    databaseCode: safePrePinDatabaseCode(record.code),
    databaseMessage: sanitizePrePinDatabaseText(record.message),
    databaseDetails: sanitizePrePinDatabaseText(record.details),
    databaseHint: sanitizePrePinDatabaseText(record.hint),
  })
}

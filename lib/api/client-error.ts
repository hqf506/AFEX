const ARABIC_PATTERN = /[\u0600-\u06ff]/
const SUPPORT_REFERENCE_PATTERN = /^AFEX-[A-F0-9]{8}$/

export function getClientErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fallback

  const response = payload as { error?: unknown; reference?: unknown }
  const error =
    typeof response.error === 'string' && ARABIC_PATTERN.test(response.error)
      ? response.error.trim()
      : fallback
  const reference =
    typeof response.reference === 'string' && SUPPORT_REFERENCE_PATTERN.test(response.reference)
      ? response.reference
      : ''

  return reference ? `${error} رقم المتابعة: ${reference}` : error
}

export function getClientCaughtErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && ARABIC_PATTERN.test(error.message)) {
    return error.message.trim()
  }

  return fallback
}

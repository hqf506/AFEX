import 'server-only'

import { resolveTrustedAppBaseUrl } from '@/lib/email/server'

const RECOVERY_VERIFICATION_PATH = '/auth/v1/verify'
const RECOVERY_CALLBACK_PATH = '/auth/callback'
const MAX_CONFIRMATION_URL_LENGTH = 8192

export type RecoveryConfirmationFailureCategory =
  | 'RECOVERY_CONFIRMATION_MISSING'
  | 'RECOVERY_CONFIRMATION_INVALID'
  | 'RECOVERY_CONFIRMATION_HOST_INVALID'
  | 'RECOVERY_CONFIRMATION_PATH_INVALID'
  | 'RECOVERY_CONFIRMATION_TYPE_INVALID'
  | 'RECOVERY_REDIRECT_INVALID'

type RecoveryConfirmationValidation =
  | {
      ok: true
      confirmationUrl: string
      tokenHash: string
      state: string
    }
  | {
      ok: false
      category: RecoveryConfirmationFailureCategory
    }

export function validateRecoveryConfirmationUrl(
  value: unknown
): RecoveryConfirmationValidation {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > MAX_CONFIRMATION_URL_LENGTH
  ) {
    return { ok: false, category: 'RECOVERY_CONFIRMATION_MISSING' }
  }

  try {
    const confirmationUrl = new URL(value)
    const supabaseUrl = new URL(
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || ''
    )
    const appOrigin = resolveTrustedAppBaseUrl()

    if (confirmationUrl.origin !== supabaseUrl.origin) {
      return { ok: false, category: 'RECOVERY_CONFIRMATION_HOST_INVALID' }
    }

    if (
      confirmationUrl.protocol !== 'https:' ||
      confirmationUrl.username ||
      confirmationUrl.password ||
      confirmationUrl.pathname !== RECOVERY_VERIFICATION_PATH ||
      confirmationUrl.hash
    ) {
      return { ok: false, category: 'RECOVERY_CONFIRMATION_PATH_INVALID' }
    }

    if (confirmationUrl.searchParams.get('type') !== 'recovery') {
      return { ok: false, category: 'RECOVERY_CONFIRMATION_TYPE_INVALID' }
    }

    const tokenHash =
      confirmationUrl.searchParams.get('token') ||
      confirmationUrl.searchParams.get('token_hash')
    const redirectValue = confirmationUrl.searchParams.get('redirect_to')

    if (!tokenHash) {
      return { ok: false, category: 'RECOVERY_CONFIRMATION_INVALID' }
    }

    if (!redirectValue) {
      return { ok: false, category: 'RECOVERY_REDIRECT_INVALID' }
    }

    const redirectUrl = new URL(redirectValue)
    const state = redirectUrl.searchParams.get('state')
    if (
      redirectUrl.origin !== appOrigin ||
      redirectUrl.pathname !== RECOVERY_CALLBACK_PATH ||
      redirectUrl.searchParams.get('next') !== '/reset-password' ||
      !state ||
      redirectUrl.hash
    ) {
      return { ok: false, category: 'RECOVERY_REDIRECT_INVALID' }
    }

    return {
      ok: true,
      confirmationUrl: value,
      tokenHash,
      state,
    }
  } catch {
    return { ok: false, category: 'RECOVERY_CONFIRMATION_INVALID' }
  }
}

import 'server-only'

import { resolveTrustedAppBaseUrl } from '@/lib/email/server'

const RECOVERY_VERIFICATION_PATH = '/auth/v1/verify'
const RECOVERY_CALLBACK_PATH = '/auth/callback'
const MAX_CONFIRMATION_URL_LENGTH = 8192

export function validateRecoveryConfirmationUrl(value: unknown) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > MAX_CONFIRMATION_URL_LENGTH
  ) {
    return null
  }

  try {
    const confirmationUrl = new URL(value)
    const supabaseUrl = new URL(
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || ''
    )
    const appOrigin = resolveTrustedAppBaseUrl()

    if (
      confirmationUrl.protocol !== 'https:' ||
      confirmationUrl.username ||
      confirmationUrl.password ||
      confirmationUrl.origin !== supabaseUrl.origin ||
      confirmationUrl.pathname !== RECOVERY_VERIFICATION_PATH ||
      confirmationUrl.hash ||
      confirmationUrl.searchParams.get('type') !== 'recovery'
    ) {
      return null
    }

    const token =
      confirmationUrl.searchParams.get('token') ||
      confirmationUrl.searchParams.get('token_hash')
    const redirectValue = confirmationUrl.searchParams.get('redirect_to')

    if (!token || !redirectValue) return null

    const redirectUrl = new URL(redirectValue)
    if (
      redirectUrl.origin !== appOrigin ||
      redirectUrl.pathname !== RECOVERY_CALLBACK_PATH ||
      redirectUrl.searchParams.get('next') !== '/reset-password' ||
      !redirectUrl.searchParams.get('state') ||
      redirectUrl.hash
    ) {
      return null
    }

    return confirmationUrl.toString()
  } catch {
    return null
  }
}

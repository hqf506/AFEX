import { NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { jsonResponse } from '@/lib/api/responses'
import { createRecoveryCallbackState } from '@/lib/auth/recovery'
import { resolveTrustedAppBaseUrl } from '@/lib/email/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

type ResetPasswordBody = {
  email?: string
}

type ResetPasswordRateLimitEntry = {
  count: number
  resetAt: number
}

type AuthRecoveryFailureCategory =
  | 'RATE_LIMITED'
  | 'SMTP_FAILURE'
  | 'REDIRECT_NOT_ALLOWED'
  | 'EMAIL_DELIVERY_FAILURE'
  | 'AUTH_PROVIDER_FAILURE'
  | 'UNKNOWN_AUTH_FAILURE'

const RESET_PASSWORD_MESSAGE =
  'إذا كان البريد الإلكتروني مرتبطًا بحساب، فسيتم إرسال رابط إعادة تعيين كلمة المرور.'
const RESET_PASSWORD_VALIDATION_MESSAGE =
  'أدخل بريدًا إلكترونيًا صالحًا.'
const RESET_PASSWORD_RATE_LIMIT_MAX_ATTEMPTS = 3
const RESET_PASSWORD_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RESET_PASSWORD_CALLBACK_PATH = '/auth/callback'
const MAX_EMAIL_LENGTH = 254
const resetPasswordRateLimitStore = new Map<
  string,
  ResetPasswordRateLimitEntry
>()
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function categorizeAuthRecoveryFailure(error: unknown): AuthRecoveryFailureCategory {
  if (!error || typeof error !== 'object') return 'UNKNOWN_AUTH_FAILURE'

  const code = 'code' in error && typeof error.code === 'string' ? error.code : ''
  const status = 'status' in error && typeof error.status === 'number' ? error.status : undefined

  if (
    status === 429 ||
    ['over_request_rate_limit', 'over_email_send_rate_limit'].includes(code)
  ) {
    return 'RATE_LIMITED'
  }

  if (['smtp_failure', 'smtp_error', 'email_send_failed'].includes(code)) {
    return 'SMTP_FAILURE'
  }

  if (['redirect_not_allowed', 'redirect_to_not_allowed'].includes(code)) {
    return 'REDIRECT_NOT_ALLOWED'
  }

  if (['email_address_not_authorized', 'email_address_invalid'].includes(code)) {
    return 'EMAIL_DELIVERY_FAILURE'
  }

  if (['email_provider_disabled', 'provider_disabled'].includes(code)) {
    return 'AUTH_PROVIDER_FAILURE'
  }

  return 'UNKNOWN_AUTH_FAILURE'
}

function logAuthRecoveryFailure(error: unknown) {
  console.warn(
    '[auth-recovery] supabase request failed:',
    categorizeAuthRecoveryFailure(error)
  )
}

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const forwardedIp = forwardedFor?.split(',')[0]?.trim()

  return (
    forwardedIp ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  )
}

function buildResetPasswordRateLimitKey(request: NextRequest, email: string) {
  const emailDigest = createHash('sha256').update(email).digest('hex')
  return [getClientIp(request), emailDigest].join(':')
}

function checkResetPasswordRateLimit(key: string) {
  const now = Date.now()
  const current = resetPasswordRateLimitStore.get(key)

  if (!current || current.resetAt <= now) {
    resetPasswordRateLimitStore.set(key, {
      count: 1,
      resetAt: now + RESET_PASSWORD_RATE_LIMIT_WINDOW_MS,
    })
    return true
  }

  if (current.count >= RESET_PASSWORD_RATE_LIMIT_MAX_ATTEMPTS) {
    return false
  }

  current.count += 1
  return true
}

function resetPasswordResponse(status = 200) {
  return jsonResponse(
    {
      success: true,
      message: RESET_PASSWORD_MESSAGE,
    },
    status
  )
}

function validationResponse() {
  return jsonResponse(
    {
      success: false,
      error: RESET_PASSWORD_VALIDATION_MESSAGE,
    },
    400
  )
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as ResetPasswordBody | null

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== 'email')
  ) {
    return validationResponse()
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!email || email.length > MAX_EMAIL_LENGTH || !emailPattern.test(email)) {
    return validationResponse()
  }

  const rateLimitKey = buildResetPasswordRateLimitKey(request, email)
  if (!checkResetPasswordRateLimit(rateLimitKey)) {
    return resetPasswordResponse(429)
  }

  try {
    const supabase = await createSupabaseServerClient()
    const redirectUrl = new URL(RESET_PASSWORD_CALLBACK_PATH, resolveTrustedAppBaseUrl())
    redirectUrl.searchParams.set('next', '/reset-password')
    redirectUrl.searchParams.set('state', createRecoveryCallbackState(email))

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl.toString(),
    })

    if (error) {
      logAuthRecoveryFailure(error)
      return resetPasswordResponse()
    }

  } catch (error) {
    logAuthRecoveryFailure(error)
    return resetPasswordResponse()
  }

  return resetPasswordResponse()
}

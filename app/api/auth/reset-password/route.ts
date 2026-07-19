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

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl.toString(),
    })
  } catch {
    return resetPasswordResponse()
  }

  return resetPasswordResponse()
}

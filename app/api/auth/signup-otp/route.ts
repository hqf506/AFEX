import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { jsonResponse } from '@/lib/api/responses'
import { createSupabaseServerClient } from '@/lib/supabase/server'

type SignupOtpBody = {
  email?: string
  password?: string
  action?: 'request' | 'resend'
}

type RateLimitEntry = {
  count: number
  resetAt: number
  lastSentAt: number
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const STRONG_PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%]).{8,}$/
const MAX_EMAIL_LENGTH = 320
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX_ATTEMPTS = 5
const RESEND_COOLDOWN_MS = 60 * 1000
const otpSendRateLimitStore = new Map<string, RateLimitEntry>()
const otpSendInFlight = new Set<string>()

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function getClientIp(request: NextRequest) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  )
}

function buildRateLimitKey(request: NextRequest, email: string) {
  const emailHash = createHash('sha256').update(email).digest('hex')
  return `${getClientIp(request)}:${emailHash}`
}

function checkSendRateLimit(key: string, isResend: boolean) {
  const now = Date.now()
  const current = otpSendRateLimitStore.get(key)

  if (!current || current.resetAt <= now) {
    otpSendRateLimitStore.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
      lastSentAt: now,
    })
    return true
  }

  if (
    current.count >= RATE_LIMIT_MAX_ATTEMPTS ||
    (isResend && now - current.lastSentAt < RESEND_COOLDOWN_MS)
  ) {
    return false
  }

  current.count += 1
  current.lastSentAt = now
  return true
}

function logSignupOtpFailure(category: string) {
  console.warn('[auth-signup-otp]', category)
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as SignupOtpBody | null
  const email = normalizeEmail(body?.email)
  const action = body?.action === 'resend' ? 'resend' : 'request'
  const password = typeof body?.password === 'string' ? body.password : ''

  if (
    !body ||
    !email ||
    email.length > MAX_EMAIL_LENGTH ||
    !EMAIL_PATTERN.test(email) ||
    (action === 'request' && !STRONG_PASSWORD_PATTERN.test(password))
  ) {
    return jsonResponse(
      { success: false, error: 'تحقق من بيانات التسجيل ثم حاول مرة أخرى.' },
      400
    )
  }

  const rateLimitKey = buildRateLimitKey(request, email)
  if (!checkSendRateLimit(rateLimitKey, action === 'resend')) {
    return jsonResponse(
      {
        success: false,
        error: 'انتظر قليلًا قبل طلب رمز تحقق جديد.',
        cooldownSeconds: 60,
      },
      429
    )
  }

  if (otpSendInFlight.has(rateLimitKey)) {
    return jsonResponse(
      { success: false, error: 'طلب رمز التحقق قيد المعالجة.' },
      409
    )
  }

  otpSendInFlight.add(rateLimitKey)
  try {
    const supabase = await createSupabaseServerClient()
    const result =
      action === 'resend'
        ? await supabase.auth.resend({ type: 'signup', email })
        : await supabase.auth.signUp({ email, password })

    if (result.error) {
      logSignupOtpFailure(
        result.error.status === 429 ? 'SIGNUP_OTP_RATE_LIMITED' : 'SIGNUP_OTP_SEND_FAILED'
      )
      return jsonResponse(
        {
          success: false,
          error:
            result.error.status === 429
              ? 'انتظر قليلًا قبل طلب رمز تحقق جديد.'
              : 'تعذر إرسال رمز التحقق حاليًا. حاول مرة أخرى لاحقًا.',
        },
        result.error.status === 429 ? 429 : 400
      )
    }

    if ('session' in result.data && result.data.session) {
      logSignupOtpFailure('SIGNUP_EMAIL_CONFIRMATION_DISABLED')
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
      return jsonResponse(
        {
          success: false,
          error: 'تعذر بدء التحقق من البريد الإلكتروني حاليًا.',
        },
        503
      )
    }

    return jsonResponse({
      success: true,
      message: 'إذا كانت البيانات صالحة، فسيصل رمز التحقق إلى البريد الإلكتروني.',
      cooldownSeconds: 60,
    })
  } catch {
    logSignupOtpFailure('SIGNUP_OTP_PROVIDER_FAILURE')
    return jsonResponse(
      { success: false, error: 'تعذر إرسال رمز التحقق حاليًا. حاول مرة أخرى لاحقًا.' },
      500
    )
  } finally {
    otpSendInFlight.delete(rateLimitKey)
  }
}

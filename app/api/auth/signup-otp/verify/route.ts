import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { jsonResponse } from '@/lib/api/responses'
import { createSupabaseServerClient } from '@/lib/supabase/server'

type VerifySignupOtpBody = {
  email?: string
  token?: string
}

type RateLimitEntry = {
  count: number
  resetAt: number
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP_PATTERN = /^\d{6}$/
const VERIFY_WINDOW_MS = 10 * 60 * 1000
const VERIFY_MAX_ATTEMPTS = 10
const otpVerifyRateLimitStore = new Map<string, RateLimitEntry>()
const otpVerifyInFlight = new Set<string>()

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

function checkVerifyRateLimit(key: string) {
  const now = Date.now()
  const current = otpVerifyRateLimitStore.get(key)
  if (!current || current.resetAt <= now) {
    otpVerifyRateLimitStore.set(key, {
      count: 1,
      resetAt: now + VERIFY_WINDOW_MS,
    })
    return true
  }
  if (current.count >= VERIFY_MAX_ATTEMPTS) return false
  current.count += 1
  return true
}

function logSignupOtpVerifyFailure(category: string) {
  console.warn('[auth-signup-otp-verify]', category)
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as VerifySignupOtpBody | null
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const token = typeof body?.token === 'string' ? body.token.replace(/\s/g, '') : ''

  if (!email || !EMAIL_PATTERN.test(email) || !OTP_PATTERN.test(token)) {
    return jsonResponse(
      { success: false, error: 'رمز التحقق غير صالح أو انتهت صلاحيته.' },
      400
    )
  }

  const rateLimitKey = buildRateLimitKey(request, email)
  if (!checkVerifyRateLimit(rateLimitKey)) {
    return jsonResponse(
      { success: false, error: 'تم تنفيذ محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.' },
      429
    )
  }

  if (otpVerifyInFlight.has(rateLimitKey)) {
    return jsonResponse(
      { success: false, error: 'جاري التحقق من الرمز.' },
      409
    )
  }

  otpVerifyInFlight.add(rateLimitKey)
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'signup',
    })

    if (error || !data.user || !data.session) {
      logSignupOtpVerifyFailure(
        error?.status === 429 ? 'SIGNUP_OTP_VERIFY_RATE_LIMITED' : 'SIGNUP_OTP_INVALID_OR_EXPIRED'
      )
      return jsonResponse(
        { success: false, error: 'رمز التحقق غير صالح أو انتهت صلاحيته.' },
        error?.status === 429 ? 429 : 400
      )
    }

    return jsonResponse({ success: true })
  } catch {
    logSignupOtpVerifyFailure('SIGNUP_OTP_VERIFY_PROVIDER_FAILURE')
    return jsonResponse(
      { success: false, error: 'تعذر التحقق من الرمز حاليًا. حاول مرة أخرى.' },
      500
    )
  } finally {
    otpVerifyInFlight.delete(rateLimitKey)
  }
}

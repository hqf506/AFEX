import { NextRequest } from 'next/server'
import { jsonResponse } from '@/lib/api/responses'
import { createSupabaseServerClient } from '@/lib/supabase/server'

type ResetPasswordBody = {
  email?: string
}

type ResetPasswordRateLimitEntry = {
  count: number
  resetAt: number
}

const RESET_PASSWORD_MESSAGE =
  'إذا كان البريد مسجلًا، سيتم إرسال رابط إعادة التعيين'
const RESET_PASSWORD_RATE_LIMIT_MAX_ATTEMPTS = 3
const RESET_PASSWORD_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
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
  return [getClientIp(request), email || 'unknown'].join(':')
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

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as ResetPasswordBody
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const rateLimitKey = buildResetPasswordRateLimitKey(request, email)

  if (!checkResetPasswordRateLimit(rateLimitKey)) {
    return resetPasswordResponse(429)
  }

  if (!emailPattern.test(email)) {
    return resetPasswordResponse()
  }

  try {
    const supabase = await createSupabaseServerClient()
    const redirectTo = `${request.nextUrl.origin}/reset-password`

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })
  } catch {
    return resetPasswordResponse()
  }

  return resetPasswordResponse()
}

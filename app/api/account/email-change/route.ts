import { createHash } from 'node:crypto'
import { after, NextRequest, NextResponse } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import {
  EMAIL_CHANGE_COOKIE_NAME,
  EMAIL_CHANGE_MAX_AGE_SECONDS,
  readEmailChangeState,
  sealEmailChangeState,
} from '@/lib/auth/email-change-state'
import { sendAccountEmailChangeNotifications } from '@/lib/auth/email'
import { supabaseAdmin } from '@/lib/supabase/admin'

type EmailChangeBody = {
  email?: unknown
  token?: unknown
}

type RateLimitEntry = {
  count: number
  resetAt: number
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP_PATTERN = /^\d{6}$/
const MAX_EMAIL_LENGTH = 254
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const REQUEST_MAX_ATTEMPTS = 5
const VERIFY_MAX_ATTEMPTS = 10
const requestRateLimits = new Map<string, RateLimitEntry>()
const verifyRateLimits = new Map<string, RateLimitEntry>()
const requestInFlight = new Set<string>()
const verifyInFlight = new Set<string>()

function setEmailChangeCookie(response: NextResponse, value: string, maxAge: number) {
  response.cookies.set(EMAIL_CHANGE_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/account/email-change',
    maxAge,
  })
  return response
}

function scheduleEmailChangeNotifications(input: {
  accountId: string
  displayName: string
  oldEmail: string
  newEmail: string
}) {
  after(async () => {
    await sendAccountEmailChangeNotifications(input)
  })
}

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

function buildRateLimitKey(request: NextRequest, userId: string, email: string) {
  const digest = createHash('sha256')
    .update(`${userId}:${email}`)
    .digest('hex')

  return `${getClientIp(request)}:${digest}`
}

function checkRateLimit(
  store: Map<string, RateLimitEntry>,
  key: string,
  maxAttempts: number
) {
  const now = Date.now()
  const current = store.get(key)

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }

  if (current.count >= maxAttempts) return false
  current.count += 1
  return true
}

function emailChangeErrorStatus(error: { status?: number; code?: string } | null) {
  if (error?.status === 429) return 429
  if (error?.code === 'email_exists' || error?.code === 'email_address_not_authorized') {
    return 409
  }
  return 400
}

function emailChangeErrorMessage(error: { status?: number; code?: string } | null) {
  if (error?.status === 429) return 'انتظر قليلًا قبل طلب رمز تحقق جديد.'
  if (error?.code === 'email_exists' || error?.code === 'email_address_not_authorized') {
    return 'البريد الإلكتروني مستخدم بالفعل'
  }
  return 'تعذر بدء تغيير البريد الإلكتروني حاليًا.'
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request)

  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as EmailChangeBody | null
  const email = normalizeEmail(body?.email)

  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return withAuthCookies(
      auth.response,
      jsonResponse({ success: false, error: 'البريد الإلكتروني غير صالح' }, 400)
    )
  }

  if (email === auth.user.email?.trim().toLowerCase()) {
    return withAuthCookies(
      auth.response,
      jsonResponse({ success: false, error: 'البريد الإلكتروني لم يتغير' }, 400)
    )
  }

  const rateLimitKey = buildRateLimitKey(request, auth.user.id, email)
  if (!checkRateLimit(requestRateLimits, rateLimitKey, REQUEST_MAX_ATTEMPTS)) {
    return withAuthCookies(
      auth.response,
      jsonResponse(
        { success: false, error: 'انتظر قليلًا قبل طلب رمز تحقق جديد.' },
        429
      )
    )
  }

  if (requestInFlight.has(auth.user.id)) {
    return withAuthCookies(
      auth.response,
      jsonResponse({ success: false, error: 'طلب تغيير البريد قيد المعالجة.' }, 409)
    )
  }

  requestInFlight.add(auth.user.id)
  try {
    const { data: duplicateProfile, error: duplicateProfileError } =
      await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('contact_email', email)
        .neq('id', auth.user.id)
        .limit(1)
        .maybeSingle()

    if (duplicateProfileError) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          { success: false, error: 'تعذر التحقق من البريد الإلكتروني حاليًا.' },
          500
        )
      )
    }

    if (duplicateProfile) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          { success: false, error: 'البريد الإلكتروني مستخدم بالفعل' },
          409
        )
      )
    }

    const oldEmail = auth.user.email?.trim().toLowerCase()
    if (!oldEmail || !EMAIL_PATTERN.test(oldEmail)) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          { success: false, error: 'تعذر التحقق من البريد الإلكتروني الحالي.' },
          400
        )
      )
    }
    const emailChangeState = sealEmailChangeState(
      auth.user.id,
      oldEmail,
      email
    )
    const { error } = await auth.supabase.auth.updateUser({ email })

    if (error) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          { success: false, error: emailChangeErrorMessage(error) },
          emailChangeErrorStatus(error)
        )
      )
    }

    const response = withAuthCookies(
      auth.response,
      jsonResponse({
        success: true,
        message: 'تم إرسال رمز التحقق إلى البريد الإلكتروني الجديد',
      })
    )
    return setEmailChangeCookie(
      response,
      emailChangeState,
      EMAIL_CHANGE_MAX_AGE_SECONDS
    )
  } catch {
    return withAuthCookies(
      auth.response,
      jsonResponse(
        { success: false, error: 'تعذر بدء تغيير البريد الإلكتروني حاليًا.' },
        500
      )
    )
  } finally {
    requestInFlight.delete(auth.user.id)
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiAuth(request)

  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as EmailChangeBody | null
  const email = normalizeEmail(body?.email)
  const token = typeof body?.token === 'string' ? body.token.replace(/\s/g, '') : ''

  if (
    !email ||
    email.length > MAX_EMAIL_LENGTH ||
    !EMAIL_PATTERN.test(email) ||
    !OTP_PATTERN.test(token)
  ) {
    return withAuthCookies(
      auth.response,
      jsonResponse(
        { success: false, error: 'رمز التحقق غير صالح أو انتهت صلاحيته.' },
        400
      )
    )
  }

  const rateLimitKey = buildRateLimitKey(request, auth.user.id, email)
  if (!checkRateLimit(verifyRateLimits, rateLimitKey, VERIFY_MAX_ATTEMPTS)) {
    return withAuthCookies(
      auth.response,
      jsonResponse(
        { success: false, error: 'تم تنفيذ محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.' },
        429
      )
    )
  }

  if (verifyInFlight.has(auth.user.id)) {
    return withAuthCookies(
      auth.response,
      jsonResponse({ success: false, error: 'جاري التحقق من الرمز.' }, 409)
    )
  }

  verifyInFlight.add(auth.user.id)
  try {
    const { data, error } = await auth.supabase.auth.verifyOtp({
      email,
      token,
      type: 'email_change',
    })

    if (error || !data.user || data.user.id !== auth.user.id) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          { success: false, error: 'رمز التحقق غير صالح أو انتهت صلاحيته.' },
          error?.status === 429 ? 429 : 400
        )
      )
    }

    if (data.user.email?.trim().toLowerCase() !== email) {
      return withAuthCookies(
        auth.response,
        jsonResponse({
          success: true,
          verified: false,
          requiresCurrentEmailConfirmation: true,
          message: 'تم تأكيد البريد الجديد. أكمل التأكيد المطلوب من بريدك الحالي.',
        })
      )
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ contact_email: email, updated_at: new Date().toISOString() })
      .eq('id', auth.user.id)

    if (profileError) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          { success: false, error: 'تم تأكيد البريد وتعذرت مزامنة بيانات الحساب.' },
          500
        )
      )
    }

    const changeState = readEmailChangeState(
      request.cookies.get(EMAIL_CHANGE_COOKIE_NAME)?.value,
      auth.user.id,
      email
    )
    if (changeState) {
      scheduleEmailChangeNotifications({
        accountId: auth.user.id,
        displayName: auth.profile.full_name || auth.profile.username || '',
        oldEmail: changeState.oldEmail,
        newEmail: data.user.email,
      })
    }

    const response = withAuthCookies(
      auth.response,
      jsonResponse({
        success: true,
        verified: true,
        email,
        message: 'تم تأكيد البريد الإلكتروني وتحديث بيانات الحساب بنجاح.',
      })
    )
    return setEmailChangeCookie(response, '', 0)
  } catch {
    return withAuthCookies(
      auth.response,
      jsonResponse(
        { success: false, error: 'تعذر التحقق من الرمز حاليًا.' },
        500
      )
    )
  } finally {
    verifyInFlight.delete(auth.user.id)
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireApiAuth(request)

  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as EmailChangeBody | null
  const email = normalizeEmail(body?.email)

  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return withAuthCookies(
      auth.response,
      jsonResponse({ success: false, error: 'البريد الإلكتروني غير صالح' }, 400)
    )
  }

  if (auth.user.email?.trim().toLowerCase() !== email) {
    return withAuthCookies(
      auth.response,
      jsonResponse(
        {
          success: false,
          error: 'لم يكتمل تأكيد البريد الحالي بعد. أكمل التأكيد ثم حاول مرة أخرى.',
        },
        409
      )
    )
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ contact_email: email, updated_at: new Date().toISOString() })
    .eq('id', auth.user.id)

  if (error) {
    return withAuthCookies(
      auth.response,
      jsonResponse(
        { success: false, error: 'تعذرت مزامنة بيانات الحساب حاليًا.' },
        500
      )
    )
  }

  const changeState = readEmailChangeState(
    request.cookies.get(EMAIL_CHANGE_COOKIE_NAME)?.value,
    auth.user.id,
    email
  )
  if (changeState) {
    scheduleEmailChangeNotifications({
      accountId: auth.user.id,
      displayName: auth.profile.full_name || auth.profile.username || '',
      oldEmail: changeState.oldEmail,
      newEmail: auth.user.email,
    })
  }

  const response = withAuthCookies(
    auth.response,
    jsonResponse({
      success: true,
      email,
      message: 'تم تأكيد البريد الإلكتروني وتحديث بيانات الحساب بنجاح.',
    })
  )
  return setEmailChangeCookie(response, '', 0)
}

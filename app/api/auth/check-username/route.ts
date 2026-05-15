import { jsonResponse } from '@/lib/api/responses'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { normalizeUsername } from '@/lib/usernames'
import { hasTrimmedString } from '@/lib/api/validation'
import { safeErrorDetails } from '@/lib/security/redaction'

type Body = {
  username?: string
}

type ProfileLookupResult = {
  id: string
  username: string | null
  is_active: boolean | null
  contact_email: string | null
}

type UsernameCheckRateLimitEntry = {
  count: number
  resetAt: number
}

const USERNAME_CHECK_RATE_LIMIT_MAX_ATTEMPTS = 30
const USERNAME_CHECK_RATE_LIMIT_WINDOW_MS = 60 * 1000
const usernameCheckRateLimitStore = new Map<
  string,
  UsernameCheckRateLimitEntry
>()

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const forwardedIp = forwardedFor?.split(',')[0]?.trim()

  return (
    forwardedIp ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  )
}

function checkUsernameRateLimit(request: Request) {
  const key = getClientIp(request)
  const now = Date.now()
  const current = usernameCheckRateLimitStore.get(key)

  if (!current || current.resetAt <= now) {
    usernameCheckRateLimitStore.set(key, {
      count: 1,
      resetAt: now + USERNAME_CHECK_RATE_LIMIT_WINDOW_MS,
    })
    return true
  }

  if (current.count >= USERNAME_CHECK_RATE_LIMIT_MAX_ATTEMPTS) {
    return false
  }

  current.count += 1
  return true
}

export async function POST(request: Request) {
  try {
    if (!checkUsernameRateLimit(request)) {
      return jsonResponse(
        { error: 'محاولات كثيرة، حاول لاحقًا' },
        429
      )
    }

    const body = (await request.json()) as Body
    const identifier = normalizeUsername(body.username || '')
    const isEmailIdentifier = identifier.includes('@')

    if (!hasTrimmedString(identifier)) {
      return jsonResponse(
        { error: 'اسم المستخدم مطلوب' }, 400)
    }

    let profile: ProfileLookupResult | null = null

    const { data: usernameProfiles, error: usernameError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, is_active, contact_email')
      .ilike('username', identifier)
      .limit(2)

    if (usernameError) {
      return jsonResponse(
        {
          error: 'تعذر التحقق من اسم المستخدم',
          ...safeErrorDetails(usernameError, 'تعذر التحقق من اسم المستخدم'),
        }, 500)
    }

    if ((usernameProfiles || []).length > 1) {
      return jsonResponse(
        {
          error: 'اسم المستخدم مستخدم بالفعل',
          details: 'يوجد أكثر من حساب بنفس اسم المستخدم. تواصل مع الدعم لتصحيح البيانات.',
        },
        409
      )
    }

    profile = usernameProfiles?.[0] || null

    if (!profile && isEmailIdentifier) {
      const { data: contactProfiles, error: contactError } = await supabaseAdmin
        .from('profiles')
        .select('id, username, is_active, contact_email')
        .eq('contact_email', identifier)
        .limit(2)

      if (contactError) {
        return jsonResponse(
          {
            error: 'تعذر التحقق من البريد المرتبط',
            ...safeErrorDetails(contactError, 'تعذر التحقق من البريد المرتبط'),
          },
          500
        )
      }

      if ((contactProfiles || []).length > 1) {
        return jsonResponse(
          {
            error: 'تعذر تسجيل الدخول',
            details: 'يوجد أكثر من حساب بنفس البريد. تواصل مع الدعم لتصحيح البيانات.',
          },
          409
        )
      }

      profile = contactProfiles?.[0] || null
    }

    if (!profile && isEmailIdentifier) {
      const { data: usersData, error: usersError } =
        await supabaseAdmin.auth.admin.listUsers()

      if (usersError) {
        return jsonResponse(
          {
            error: 'تعذر التحقق من بريد تسجيل الدخول',
            ...safeErrorDetails(usersError, 'تعذر التحقق من بريد تسجيل الدخول'),
          },
          500
        )
      }

      const matchedAuthUser = usersData.users.find(
        (user) => user.email?.toLowerCase() === identifier
      )

      if (matchedAuthUser) {
        const { data: authProfile, error: authProfileError } =
          await supabaseAdmin
            .from('profiles')
            .select('id, username, is_active, contact_email')
            .eq('id', matchedAuthUser.id)
            .maybeSingle()

        if (authProfileError) {
          return jsonResponse(
            {
              error: 'تعذر التحقق من ملف المستخدم',
              ...safeErrorDetails(authProfileError, 'تعذر التحقق من ملف المستخدم'),
            },
            500
          )
        }

        profile = authProfile
      }
    }

    return jsonResponse({
      ok: true,
      exists: !!profile,
    })
  } catch (error) {
    return jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        ...safeErrorDetails(error, 'حدث خطأ غير متوقع'),
      }, 500)
  }
}

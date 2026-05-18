import { jsonResponse } from '@/lib/api/responses'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { normalizeUsername } from '@/lib/usernames'
import { hasTrimmedString } from '@/lib/api/validation'
import { safeErrorDetails } from '@/lib/security/redaction'

type Body = {
  email?: string
  phone?: string
  tenantName?: string
  username?: string
}

type FieldCheckResponse = {
  exists: boolean
  suggestions?: string[]
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

function normalizeLookupText(value: string) {
  return value.trim().toLowerCase()
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

async function getAvailableUsernameSuggestions(username: string) {
  const year = new Date().getFullYear()
  const baseCandidates = [`${username}1`, `${username}_${year}`, `${username}_afex`]
  const suggestions: string[] = []
  let attempt = 0

  while (suggestions.length < 3 && attempt < 12) {
    const candidates = baseCandidates
      .map((candidate) => (attempt === 0 ? candidate : `${candidate}${attempt + 1}`))
      .filter((candidate) => !suggestions.includes(candidate))

    for (const candidate of candidates) {
      const { data: existingProfile, error } = await supabaseAdmin
        .from('profiles')
        .select('username')
        .ilike('username', candidate)
        .limit(1)
        .maybeSingle()

      if (error) {
        throw error
      }

      if (!existingProfile && suggestions.length < 3) {
        suggestions.push(candidate)
      }
    }

    attempt += 1
  }

  return suggestions
}

async function getAvailableTenantNameSuggestions(tenantName: string) {
  const baseName = tenantName.trim()
  const year = new Date().getFullYear()
  const baseCandidates = [`${baseName} 1`, `${baseName} ${year}`, `${baseName} AFEX`]
  const suggestions: string[] = []
  let attempt = 0

  while (suggestions.length < 3 && attempt < 12) {
    const candidates = baseCandidates
      .map((candidate) => (attempt === 0 ? candidate : `${candidate} ${attempt + 1}`))
      .filter((candidate) => !suggestions.includes(candidate))

    for (const candidate of candidates) {
      const { data: existingTenant, error } = await supabaseAdmin
        .from('tenants')
        .select('id')
        .ilike('name', candidate)
        .limit(1)
        .maybeSingle()

      if (error) {
        throw error
      }

      if (!existingTenant && suggestions.length < 3) {
        suggestions.push(candidate)
      }
    }

    attempt += 1
  }

  return suggestions
}

async function checkTenantNameAvailability(tenantName: string): Promise<FieldCheckResponse> {
  const normalizedTenantName = tenantName.trim()

  if (!hasTrimmedString(normalizedTenantName)) {
    return { exists: false, suggestions: [] }
  }

  const { data: existingTenant, error } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .ilike('name', normalizedTenantName)
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return {
    exists: !!existingTenant,
    suggestions: existingTenant
      ? await getAvailableTenantNameSuggestions(normalizedTenantName)
      : [],
  }
}

async function checkEmailAvailability(email: string): Promise<FieldCheckResponse> {
  const normalizedEmail = normalizeLookupText(email)

  if (!hasTrimmedString(normalizedEmail)) {
    return { exists: false }
  }

  const { data: existingProfile, error } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('contact_email', normalizedEmail)
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (existingProfile) {
    return { exists: true }
  }

  const { data: usersData, error: usersError } =
    await supabaseAdmin.auth.admin.listUsers()

  if (usersError) {
    throw usersError
  }

  return {
    exists: usersData.users.some(
      (user) => user.email?.toLowerCase() === normalizedEmail
    ),
  }
}

async function checkPhoneAvailability(phone: string): Promise<FieldCheckResponse> {
  const trimmedPhone = phone.trim()
  const normalizedPhone = normalizePhone(trimmedPhone)
  const candidates = Array.from(
    new Set([trimmedPhone, normalizedPhone].filter(Boolean))
  )

  if (candidates.length === 0) {
    return { exists: false }
  }

  const { data: existingProfiles, error } = await supabaseAdmin
    .from('profiles')
    .select('id, phone')
    .in('phone', candidates)
    .limit(10)

  if (error) {
    throw error
  }

  return {
    exists: (existingProfiles || []).some(
      (profile) => normalizePhone(profile.phone || '') === normalizedPhone
    ),
  }
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
    const tenantName = body.tenantName?.trim() || ''
    const email = normalizeLookupText(body.email || '')
    const phone = body.phone?.trim() || ''
    const identifier = normalizeUsername(body.username || '')
    const isEmailIdentifier = identifier.includes('@')
    let signupChecks:
      | {
          email?: FieldCheckResponse
          phone?: FieldCheckResponse
          tenantName?: FieldCheckResponse
        }
      | undefined

    if (tenantName || email || phone) {
      signupChecks = {}

      try {
        if (tenantName) {
          signupChecks.tenantName = await checkTenantNameAvailability(tenantName)
        }

        if (email) {
          signupChecks.email = await checkEmailAvailability(email)
        }

        if (phone) {
          signupChecks.phone = await checkPhoneAvailability(phone)
        }
      } catch (checkError) {
        return jsonResponse(
          {
            error: 'تعذر التحقق من بيانات التسجيل',
            ...safeErrorDetails(checkError, 'تعذر التحقق من بيانات التسجيل'),
          },
          500
        )
      }

      if (!identifier) {
        return jsonResponse({
          ok: true,
          checks: signupChecks,
        })
      }
    }

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

    const suggestions = profile
      ? await getAvailableUsernameSuggestions(identifier)
      : []

    return jsonResponse({
      ok: true,
      exists: !!profile,
      checks: signupChecks,
      suggestions,
    })
  } catch (error) {
    return jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        ...safeErrorDetails(error, 'حدث خطأ غير متوقع'),
      }, 500)
  }
}

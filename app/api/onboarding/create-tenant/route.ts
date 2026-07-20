import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { after } from 'next/server'
import { jsonResponse } from '@/lib/api/responses'
import { redactSensitive, safeErrorDetails } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { normalizeUsername } from '@/lib/usernames'
import { sendWelcomeEmail } from '@/lib/auth/email'
import { createSupabaseServerClient } from '@/lib/supabase/server'

type CreateTenantBody = {
  tenantName?: string
  username?: string
  fullName?: string
  phone?: string
  email?: string
  branchName?: string
}

type CreateTenantRpcResult = {
  tenantId?: string | null
  tenant_id?: string | null
  userId?: string | null
  ownerId?: string | null
  owner_id?: string | null
}

type OnboardingRateLimitEntry = {
  count: number
  resetAt: number
}

const ONBOARDING_RATE_LIMIT_MAX_ATTEMPTS = 5
const ONBOARDING_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const onboardingRateLimitStore = new Map<string, OnboardingRateLimitEntry>()
const onboardingInFlight = new Set<string>()

function normalizeRequiredText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeOptionalText(value: unknown) {
  const normalizedValue = normalizeRequiredText(value)
  return normalizedValue || null
}

function normalizeRpcResult(value: unknown): CreateTenantRpcResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as CreateTenantRpcResult
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

function buildOnboardingRateLimitKey(
  request: NextRequest,
  username: string,
  email: string
) {
  const identifier = createHash('sha256')
    .update(`${username}:${email}`)
    .digest('hex')

  return [getClientIp(request), identifier].join(':')
}

function checkOnboardingRateLimit(key: string) {
  const now = Date.now()
  const current = onboardingRateLimitStore.get(key)

  if (!current || current.resetAt <= now) {
    onboardingRateLimitStore.set(key, {
      count: 1,
      resetAt: now + ONBOARDING_RATE_LIMIT_WINDOW_MS,
    })
    return true
  }

  if (current.count >= ONBOARDING_RATE_LIMIT_MAX_ATTEMPTS) {
    return false
  }

  current.count += 1
  return true
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

async function findProfileByUsername(username: string) {
  const normalizedUsername = normalizeUsername(username)

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, username')
    .ilike('username', normalizedUsername)
    .limit(5)

  if (error) {
    return { data: null, error }
  }

  const profile =
    data?.find(
      (row) =>
        typeof row.username === 'string' &&
        normalizeUsername(row.username) === normalizedUsername
    ) || null

  return { data: profile, error: null }
}

export async function POST(request: NextRequest) {
  let verifiedUserId: string | null = null

  try {
    const body = (await request.json().catch(() => null)) as CreateTenantBody | null
    const allowedKeys = new Set([
      'tenantName',
      'username',
      'fullName',
      'phone',
      'email',
      'branchName',
    ])
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => !allowedKeys.has(key))
    ) {
      return jsonResponse({ error: 'بيانات التسجيل غير صالحة.' }, 400)
    }
    const tenantName = normalizeRequiredText(body.tenantName)
    const username = normalizeUsername(body.username || '')
    const fullName = normalizeOptionalText(body.fullName) || username
    const phone = normalizeOptionalText(body.phone)
    const email = normalizeRequiredText(body.email).toLowerCase()
    const branchName = normalizeOptionalText(body.branchName)
    const rateLimitKey = buildOnboardingRateLimitKey(request, username, email)

    if (!checkOnboardingRateLimit(rateLimitKey)) {
      return jsonResponse(
        { error: 'محاولات إنشاء كثيرة، حاول لاحقًا' },
        429
      )
    }

    const supabase = await createSupabaseServerClient()
    const {
      data: { user: verifiedUser },
      error: verifiedUserError,
    } = await supabase.auth.getUser()
    const verifiedEmail = verifiedUser?.email?.trim().toLowerCase() || ''

    if (
      verifiedUserError ||
      !verifiedUser ||
      !verifiedUser.email_confirmed_at ||
      !verifiedEmail
    ) {
      return jsonResponse(
        { error: 'يجب التحقق من البريد الإلكتروني قبل إكمال التسجيل.' },
        401
      )
    }

    if (verifiedEmail !== email) {
      return jsonResponse(
        { error: 'تعذر إكمال التسجيل بهذه البيانات.' },
        403
      )
    }

    verifiedUserId = verifiedUser.id
    if (onboardingInFlight.has(verifiedUserId)) {
      return jsonResponse(
        { error: 'طلب إكمال التسجيل قيد المعالجة.' },
        409
      )
    }
    onboardingInFlight.add(verifiedUserId)

    const { data: existingOwnerProfile, error: existingOwnerProfileError } =
      await supabaseAdmin
        .from('profiles')
        .select('id, tenant_id')
        .eq('id', verifiedUserId)
        .maybeSingle()

    if (existingOwnerProfileError) {
      return jsonResponse(
        { error: 'تعذر التحقق من حالة التسجيل حاليًا.' },
        500
      )
    }

    if (existingOwnerProfile) {
      return jsonResponse({
        success: true,
        alreadyCompleted: true,
        tenantId: existingOwnerProfile.tenant_id,
        userId: existingOwnerProfile.id,
      })
    }

    if (!tenantName) {
      return jsonResponse({ error: 'اسم المؤسسة مطلوب.' }, 422)
    }

    if (!username) {
      return jsonResponse({ error: 'اسم المستخدم مطلوب.' }, 422)
    }

    if (!/^[a-z0-9._-]+$/.test(username)) {
      return jsonResponse(
        { error: 'اسم المستخدم غير صالح. استخدم أحرفًا إنجليزية وأرقامًا فقط.' },
        422
      )
    }

    const { data: existingProfile, error: existingProfileError } =
      await findProfileByUsername(username)

    if (process.env.NODE_ENV !== 'production') {
      console.info('[onboarding] username availability', {
        username,
        available: !existingProfile,
      })
    }

    if (existingProfileError) {
      return jsonResponse(
        {
          error: 'تعذر التحقق من اسم المستخدم',
          ...safeErrorDetails(
            existingProfileError,
            'تعذر التحقق من اسم المستخدم'
          ),
        },
        500
      )
    }

    if (existingProfile) {
      const suggestions = await getAvailableUsernameSuggestions(username)

      return jsonResponse(
        {
          error: 'اسم المستخدم مستخدم بالفعل',
          suggestions,
        },
        409
      )
    }

    if (!email) {
      return jsonResponse({ error: 'البريد الإلكتروني مطلوب.' }, 422)
    }

    const { error: metadataError } =
      await supabaseAdmin.auth.admin.updateUserById(verifiedUserId, {
        user_metadata: {
          username,
          full_name: fullName,
          contact_email: verifiedEmail,
          phone,
          role: 'admin',
        },
      })

    if (metadataError) {
      return jsonResponse(
        { error: 'تعذر إكمال إعداد الحساب حاليًا.' },
        500
      )
    }

    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      'create_tenant_with_owner',
      {
        p_tenant_name: tenantName,
        p_owner_user_id: verifiedUserId,
        p_owner_username: username,
        p_owner_full_name: fullName,
        p_owner_contact_email: verifiedEmail,
        p_owner_phone: phone,
        p_default_branch_code: `branch-${crypto.randomUUID().slice(0, 8)}`,
        p_default_branch_name: branchName || 'Main Branch',
        p_vat_rate: 15,
        p_vat_active: true,
      }
    )

    if (rpcError) {
      console.error(
        '[onboarding] create_tenant_with_owner RPC failed',
        redactSensitive({
          user_id: verifiedUserId,
          username,
          message: rpcError.message,
          details: rpcError.details,
          hint: rpcError.hint,
          code: rpcError.code,
        })
      )

      const { data: conflictingProfile, error: conflictLookupError } =
        await findProfileByUsername(username)

      if (conflictLookupError) {
        console.error(
          '[onboarding] username conflict lookup failed',
          redactSensitive({
            username,
            message: conflictLookupError.message,
          })
        )
      }

      if (conflictingProfile) {
        const suggestions = await getAvailableUsernameSuggestions(username)

        return jsonResponse(
          {
            error: 'اسم المستخدم مستخدم بالفعل',
            ...safeErrorDetails(
              rpcError,
              'اسم المستخدم مستخدم بالفعل'
            ),
            suggestions,
          },
          409
        )
      }

      return jsonResponse(
        {
          error: 'تعذر إنشاء المؤسسة. لم يتم إكمال التسجيل.',
          ...safeErrorDetails(rpcError, 'تعذر إنشاء المنشأة'),
        },
        500
      )
    }

    const result = normalizeRpcResult(rpcData)
    const tenantId = result.tenantId || result.tenant_id || null
    const userId = result.userId || result.ownerId || result.owner_id || verifiedUserId

    console.info(
      '[onboarding] create_tenant_with_owner RPC succeeded',
      redactSensitive({
        tenant_id: tenantId,
        user_id: userId,
      })
    )

    if (userId) {
      after(async () => {
        await sendWelcomeEmail({
          accountId: userId,
          recipient: verifiedEmail,
          displayName: fullName,
          role: 'admin',
          organizationName: tenantName,
          branchName: branchName || 'Main Branch',
        })
      })
    }

    return jsonResponse({
      success: true,
      tenantId,
      userId,
    })
  } catch (error) {
    return jsonResponse(
      {
        error: 'تعذر إنشاء المؤسسة. لم يتم إكمال التسجيل.',
        ...safeErrorDetails(error, 'تعذر إكمال إنشاء الحساب'),
      },
      500
    )
  } finally {
    if (verifiedUserId) {
      onboardingInFlight.delete(verifiedUserId)
    }
  }
}

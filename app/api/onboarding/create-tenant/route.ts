import { NextRequest } from 'next/server'
import { jsonResponse } from '@/lib/api/responses'
import { redactSensitive, safeErrorDetails } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { normalizeUsername } from '@/lib/usernames'

type CreateTenantBody = {
  tenantName?: string
  username?: string
  password?: string
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
  const identifier = username || email || 'unknown'

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

export async function POST(request: NextRequest) {
  let createdUserId: string | null = null

  try {
    const body = (await request.json()) as CreateTenantBody
    const tenantName = normalizeRequiredText(body.tenantName)
    const username = normalizeUsername(body.username || '')
    const password = normalizeRequiredText(body.password)
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

    if (!tenantName) {
      return jsonResponse({ error: 'tenantName is required' }, 400)
    }

    if (!username) {
      return jsonResponse({ error: 'username is required' }, 400)
    }

    if (!/^[a-z0-9._-]+$/.test(username)) {
      return jsonResponse({ error: 'username is invalid' }, 400)
    }

    const { data: existingProfile, error: existingProfileError } =
      await supabaseAdmin
        .from('profiles')
        .select('id')
        .ilike('username', username)
        .limit(1)
        .maybeSingle()

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

    if (!password) {
      return jsonResponse({ error: 'password is required' }, 400)
    }

    if (!email) {
      return jsonResponse({ error: 'email is required' }, 400)
    }

    console.log(
      '[onboarding] creating auth user',
      redactSensitive({ email, username })
    )
    const { data: createdUser, error: createUserError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          username,
          full_name: fullName,
          contact_email: email,
          phone,
          role: 'admin',
        },
      })

    if (createUserError || !createdUser.user) {
      console.error(
        '[onboarding] create auth user failed',
        redactSensitive({
          username,
          message: createUserError?.message || 'No user returned',
        })
      )

      return jsonResponse(
        {
          error: 'Failed to create owner auth user',
          ...safeErrorDetails(
            createUserError?.message || 'No user returned',
            'تعذر إنشاء المستخدم'
          ),
        },
        400
      )
    }

    createdUserId = createdUser.user.id
    console.info(
      '[onboarding] create auth user succeeded',
      redactSensitive({
        user_id: createdUserId,
        username,
      })
    )

    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      'create_tenant_with_owner',
      {
        p_tenant_name: tenantName,
        p_owner_user_id: createdUserId,
        p_owner_username: username,
        p_owner_full_name: fullName,
        p_owner_contact_email: email,
        p_owner_phone: phone,
        p_default_branch_name: branchName || 'Main Branch',
      }
    )

    if (rpcError) {
      console.error(
        '[onboarding] create_tenant_with_owner RPC failed',
        redactSensitive({
          user_id: createdUserId,
          username,
          message: rpcError.message,
          details: rpcError.details,
          hint: rpcError.hint,
          code: rpcError.code,
        })
      )

      const { error: rollbackError } =
        await supabaseAdmin.auth.admin.deleteUser(createdUserId)

      if (rollbackError) {
        console.error(
          '[onboarding] rollback auth user delete failed',
          redactSensitive({
            user_id: createdUserId,
            message: rollbackError.message,
          })
        )
      }

      if (
        rpcError.code === '23505' ||
        rpcError.message.toLowerCase().includes('username')
      ) {
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
          error: 'Failed to create tenant',
          ...safeErrorDetails(rpcError, 'تعذر إنشاء المنشأة'),
          rollback: rollbackError ? 'failed' : 'completed',
        },
        500
      )
    }

    const result = normalizeRpcResult(rpcData)
    const tenantId = result.tenantId || result.tenant_id || null
    const userId = result.userId || result.ownerId || result.owner_id || createdUserId

    console.info(
      '[onboarding] create_tenant_with_owner RPC succeeded',
      redactSensitive({
        tenant_id: tenantId,
        user_id: userId,
      })
    )

    return jsonResponse({
      success: true,
      tenantId,
      userId,
    })
  } catch (error) {
    if (createdUserId) {
      const { error: rollbackError } =
        await supabaseAdmin.auth.admin.deleteUser(createdUserId)

      if (rollbackError) {
        console.error(
          '[onboarding] rollback after unexpected error failed',
          redactSensitive({
            user_id: createdUserId,
            message: rollbackError.message,
          })
        )
      }
    }

    return jsonResponse(
      {
        error: 'Unexpected onboarding error',
        ...safeErrorDetails(error, 'تعذر إكمال إنشاء الحساب'),
      },
      500
    )
  }
}

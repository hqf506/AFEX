import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import type { AppRole } from '@/lib/app-roles'
import { isFullAdmin } from '@/lib/permissions'
import { redactSensitive, safeErrorDetails } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'

type IdentifyEmployeeByPinBody = {
  pin?: string
  branchId?: string | null
  branch_id?: string | null
}

const PIN_RESPONSE_DELAY_MS = 300
const PIN_RATE_LIMIT_MAX_ATTEMPTS = 5
const PIN_RATE_LIMIT_WINDOW_MS = 60 * 1000
const PIN_BRANCH_MISMATCH_MESSAGE =
  'رمز PIN غير صحيح أو المستخدم غير مرتبط بهذا الفرع'
const MISSING_POS_CONTEXT_MESSAGE = 'تعذر تحديد الفرع أو المنشأة'
const DUPLICATE_PIN_MESSAGE = 'يوجد أكثر من موظف بنفس PIN، اختر الفرع أولًا'

type PosEmployeeRpcRow = {
  id?: string | null
  username?: string | null
  full_name?: string | null
  role?: AppRole | string | null
  branch_id?: string | null
}

type PinRateLimitEntry = {
  attempts: number
  resetAt: number
}

const pinRateLimitStore = new Map<string, PinRateLimitEntry>()

function normalizePin(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeOptionalBranchId(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function withFixedPinDelay(response: Response) {
  await new Promise((resolve) => setTimeout(resolve, PIN_RESPONSE_DELAY_MS))
  return response
}

function sanitizeEmployee(row: PosEmployeeRpcRow | null | undefined) {
  if (!row || typeof row.id !== 'string' || typeof row.role !== 'string') {
    return null
  }

  return {
    id: row.id,
    username: typeof row.username === 'string' ? row.username : null,
    full_name: typeof row.full_name === 'string' ? row.full_name : null,
    role: row.role as AppRole,
    branch_id: typeof row.branch_id === 'string' ? row.branch_id : null,
  }
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

function buildPinRateLimitKey(
  request: NextRequest,
  tenantId: string,
  branchId: string | null
) {
  return [getClientIp(request), tenantId, branchId || 'all-branches'].join(':')
}

function checkPinRateLimit(key: string) {
  const now = Date.now()
  const current = pinRateLimitStore.get(key)

  if (!current || current.resetAt <= now) {
    pinRateLimitStore.set(key, {
      attempts: 1,
      resetAt: now + PIN_RATE_LIMIT_WINDOW_MS,
    })
    return true
  }

  if (current.attempts >= PIN_RATE_LIMIT_MAX_ATTEMPTS) {
    return false
  }

  current.attempts += 1
  return true
}

async function isTenantBranch(tenantId: string, branchId: string) {
  const { data, error } = await supabaseAdmin
    .from('branches')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', branchId)
    .limit(1)
    .maybeSingle()

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[POS PIN] Failed to validate requested branch.',
        redactSensitive({
          tenantId,
          branchId,
          code: error.code,
          message: error.message,
          details: error.details,
        })
      )
    }
    return false
  }

  return typeof data?.id === 'string'
}

function clearPinRateLimit(key: string) {
  pinRateLimitStore.delete(key)
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin', 'employee', 'cashier'])

  if (!auth.ok) {
    console.info('[POS PIN] Unauthorized verification request.', {
      hasAuthSession: false,
      authRole: null,
      tenantId: null,
      requestedBranchId: null,
      effectiveBranchId: null,
      pinLength: null,
      rpc: null,
    })
    return withFixedPinDelay(auth.response)
  }

  try {
    const tenantId = auth.profile.tenant_id

    const body = (await request.json()) as IdentifyEmployeeByPinBody
    const pin = normalizePin(body.pin)
    const requestedBranchId =
      normalizeOptionalBranchId(body.branchId) ||
      normalizeOptionalBranchId(body.branch_id)
    const profileBranchId = normalizeOptionalBranchId(auth.profile.branch_id)
    const authRole = auth.profile.role
    const authIsFullAdmin = isFullAdmin(authRole)

    if (!tenantId) {
      console.warn('[POS PIN] Missing POS tenant.', {
        hasAuthSession: true,
        authRole,
        tenantId: null,
        requestedBranchId,
        effectiveBranchId: null,
        profileBranchId: auth.profile.branch_id ?? null,
        pinLength: pin.length,
        rpc: null,
      })

      const response = jsonResponse(
        { error: MISSING_POS_CONTEXT_MESSAGE },
        400
      )
      return withFixedPinDelay(withAuthCookies(auth.response, response))
    }

    let branchId: string | null = null

    if (!authIsFullAdmin && !profileBranchId) {
      const response = jsonResponse(
        { error: MISSING_POS_CONTEXT_MESSAGE },
        400
      )
      return withFixedPinDelay(withAuthCookies(auth.response, response))
    }

    if (authIsFullAdmin && requestedBranchId) {
      const branchBelongsToTenant = await isTenantBranch(
        tenantId,
        requestedBranchId
      )

      if (!branchBelongsToTenant) {
        const response = jsonResponse(
          { error: MISSING_POS_CONTEXT_MESSAGE },
          400
        )
        return withFixedPinDelay(withAuthCookies(auth.response, response))
      }

      branchId = requestedBranchId
    } else if (!authIsFullAdmin && profileBranchId) {
      branchId = profileBranchId
    }

    console.info('[POS PIN] Verification request.', {
      hasAuthSession: true,
      authRole,
      tenantId,
      requestedBranchId,
      effectiveBranchId: branchId,
      profileBranchId,
      pinLength: pin.length,
    })

    if (!/^[0-9]{4}$/.test(pin)) {
      const response = jsonResponse(
        { error: 'PIN يجب أن يتكون من 4 أرقام' },
        400
      )
      return withFixedPinDelay(withAuthCookies(auth.response, response))
    }

    const rateLimitKey = buildPinRateLimitKey(
      request,
      tenantId,
      branchId
    )

    if (!checkPinRateLimit(rateLimitKey)) {
      const response = jsonResponse(
        { error: 'محاولات كثيرة، حاول مرة أخرى بعد دقيقة' },
        429
      )
      return withFixedPinDelay(withAuthCookies(auth.response, response))
    }

    const { data, error } = await supabaseAdmin.rpc('verify_pos_pin', {
      p_raw_pin: pin,
      p_tenant_id: tenantId,
      p_branch_id: branchId,
    })
    const rpcRowCount = Array.isArray(data) ? data.length : data ? 1 : 0

    console.info('[POS PIN] verify_pos_pin RPC result.', {
      hasAuthSession: true,
      authRole,
      tenantId,
      requestedBranchId,
      effectiveBranchId: branchId,
      pinLength: pin.length,
      rpc: {
        hasData: rpcRowCount > 0,
        rowCount: rpcRowCount,
        hasError: Boolean(error),
        errorCode: error?.code ?? null,
        errorMessage: error?.message ?? null,
      },
    })

    if (error) {
      const rpcErrorLog =
        process.env.NODE_ENV === 'production'
          ? { code: error.code }
          : {
              message: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code,
            }

      console.error(
        '[POS PIN] verify_pos_pin RPC failed.',
        redactSensitive({
          hasAuthSession: true,
          authRole,
          tenantId,
          requestedBranchId,
          effectiveBranchId: branchId,
          pinLength: pin.length,
          ...rpcErrorLog,
        })
      )

      const response = jsonResponse(
        {
          error: 'تعذر التحقق من رمز PIN',
          ...safeErrorDetails(error, 'تعذر التحقق من رمز PIN'),
        },
        500
      )
      return withFixedPinDelay(withAuthCookies(auth.response, response))
    }

    if (rpcRowCount > 1) {
      const response = jsonResponse(
        { error: DUPLICATE_PIN_MESSAGE },
        409
      )
      return withFixedPinDelay(withAuthCookies(auth.response, response))
    }

    const row = Array.isArray(data) ? data[0] : data
    const employee = sanitizeEmployee(row as PosEmployeeRpcRow | null)

    if (!employee) {
      const response = jsonResponse(
        { error: PIN_BRANCH_MISMATCH_MESSAGE },
        401
      )
      return withFixedPinDelay(withAuthCookies(auth.response, response))
    }

    clearPinRateLimit(rateLimitKey)

    const response = jsonResponse({
      success: true,
      employee: {
        ...employee,
        branch_id: employee.branch_id || branchId,
      },
    })

    return withFixedPinDelay(withAuthCookies(auth.response, response))
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ أثناء التحقق من رمز PIN',
        ...safeErrorDetails(error, 'حدث خطأ أثناء التحقق من رمز PIN'),
      },
      500
    )

    return withFixedPinDelay(withAuthCookies(auth.response, response))
  }
}

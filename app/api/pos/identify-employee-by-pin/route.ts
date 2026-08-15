import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { createSupportReference } from '@/lib/api/safe-error'
import type { AppRole } from '@/lib/app-roles'
import { isFullAdmin } from '@/lib/permissions'
import { redactSensitive } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  disabledFeatureResponse,
  POS_FEATURE_DISABLED_MESSAGE,
} from '@/lib/feature-guards'
import {
  POS_ACTOR_COOKIE,
  issuePosActorSession,
  posActorCookieOptions,
} from '@/lib/pos-actor-session-server'
import { isPosActorSessionIssueError } from '@/lib/pos-actor-session-issue'

type IdentifyEmployeeByPinBody = {
  pin?: string
  branchId?: string | null
  branch_id?: string | null
}

const PIN_RESPONSE_DELAY_MS = 300
const PIN_RATE_LIMIT_MAX_ATTEMPTS = 5
const PIN_RATE_LIMIT_WINDOW_MS = 60 * 1000
const PIN_BRANCH_MISMATCH_MESSAGE =
  'الرمز غير صحيح. تحقق من الرمز ثم حاول مرة أخرى.'
const MISSING_POS_CONTEXT_MESSAGE =
  'لا يمكن فتح نقطة البيع لأن الحساب غير مرتبط بفرع. تواصل مع مدير النظام.'
const DUPLICATE_PIN_MESSAGE =
  'يوجد أكثر من مستخدم بهذا الرمز. تواصل مع مدير النظام لتغيير أحد الرموز.'
const PIN_RATE_LIMIT_MESSAGE =
  'تم إيقاف المحاولات مؤقتًا بسبب تكرار الرمز الخاطئ. حاول مرة أخرى بعد قليل.'
const PIN_INTERNAL_ERROR_MESSAGE =
  'تعذر التحقق من رمز الموظف حاليًا. حاول مرة أخرى، وإذا استمرت المشكلة تواصل مع المسؤول.'

type PinPublicErrorCode =
  | 'POS_AUTH_REQUIRED'
  | 'POS_CONTEXT_MISSING'
  | 'POS_FEATURE_DISABLED'
  | 'PIN_FORMAT_INVALID'
  | 'PIN_RATE_LIMITED'
  | 'PIN_VERIFICATION_FAILED'
  | 'PIN_DUPLICATE'
  | 'PIN_INVALID'
  | 'POS_ACTOR_SESSION_ISSUE_FAILED'
  | 'PIN_INTERNAL_ERROR'

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

function pinFailureResponse({
  authResponse,
  errorCode,
  message,
  status,
  reference = createSupportReference(),
}: {
  authResponse: NextResponse
  errorCode: PinPublicErrorCode
  message: string
  status: number
  reference?: string
}) {
  return withAuthCookies(
    authResponse,
    NextResponse.json(
      { error: message, errorCode, reference },
      { status }
    )
  )
}

function safeRequestCorrelation(request: NextRequest) {
  return {
    requestId: request.headers.get('x-vercel-id'),
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin', 'employee', 'cashier'])
  let actorSessionIssueReference: string | null = null

  if (!auth.ok) {
    return withFixedPinDelay(
      pinFailureResponse({
        authResponse: auth.response,
        errorCode: 'POS_AUTH_REQUIRED',
        message: 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى.',
        status: auth.response.status,
      })
    )
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
      console.warn('[POS PIN] Missing tenant context.')

      const response = pinFailureResponse({
        authResponse: auth.response,
        errorCode: 'POS_CONTEXT_MISSING',
        message: MISSING_POS_CONTEXT_MESSAGE,
        status: 400,
      })
      return withFixedPinDelay(withAuthCookies(auth.response, response))
    }

    const featureDisabledResponse = await disabledFeatureResponse(
      auth.response,
      tenantId,
      'enable_pos',
      POS_FEATURE_DISABLED_MESSAGE
    )

    if (featureDisabledResponse) {
      return withFixedPinDelay(
        pinFailureResponse({
          authResponse: auth.response,
          errorCode: 'POS_FEATURE_DISABLED',
          message: POS_FEATURE_DISABLED_MESSAGE,
          status: featureDisabledResponse.status,
        })
      )
    }

    let branchId: string | null = null

    if (!authIsFullAdmin && !profileBranchId) {
      const response = pinFailureResponse({
        authResponse: auth.response,
        errorCode: 'POS_CONTEXT_MISSING',
        message: MISSING_POS_CONTEXT_MESSAGE,
        status: 400,
      })
      return withFixedPinDelay(withAuthCookies(auth.response, response))
    }

    if (authIsFullAdmin && requestedBranchId) {
      const branchBelongsToTenant = await isTenantBranch(
        tenantId,
        requestedBranchId
      )

      if (!branchBelongsToTenant) {
        const response = pinFailureResponse({
          authResponse: auth.response,
          errorCode: 'POS_CONTEXT_MISSING',
          message: MISSING_POS_CONTEXT_MESSAGE,
          status: 400,
        })
        return withFixedPinDelay(withAuthCookies(auth.response, response))
      }

      branchId = requestedBranchId
    } else if (!authIsFullAdmin && profileBranchId) {
      branchId = profileBranchId
    }

    if (!/^[0-9]{4}$/.test(pin)) {
      const response = pinFailureResponse({
        authResponse: auth.response,
        errorCode: 'PIN_FORMAT_INVALID',
        message: 'يجب أن يتكون الرمز من أربعة أرقام.',
        status: 422,
      })
      return withFixedPinDelay(withAuthCookies(auth.response, response))
    }

    const rateLimitKey = buildPinRateLimitKey(
      request,
      tenantId,
      branchId
    )

    if (!checkPinRateLimit(rateLimitKey)) {
      const response = pinFailureResponse({
        authResponse: auth.response,
        errorCode: 'PIN_RATE_LIMITED',
        message: PIN_RATE_LIMIT_MESSAGE,
        status: 429,
      })
      return withFixedPinDelay(withAuthCookies(auth.response, response))
    }

    let { data, error } = await supabaseAdmin.rpc(
      'verify_pos_pin_for_actor',
      {
        p_raw_pin: pin,
        p_actor_user_id: auth.user.id,
        p_requested_branch_id: branchId,
      }
    )

    // Application-first deployment compatibility: use the existing RPC only
    // until the security migration creates the actor-scoped replacement.
    if (error?.code === 'PGRST202') {
      const legacyResult = await supabaseAdmin.rpc('verify_pos_pin', {
        p_raw_pin: pin,
        p_tenant_id: tenantId,
        p_branch_id: branchId,
      })
      data = legacyResult.data
      error = legacyResult.error
    }
    const rpcRowCount = Array.isArray(data) ? data.length : data ? 1 : 0

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
        '[POS PIN] Verification RPC failed.',
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

      const response = pinFailureResponse({
        authResponse: auth.response,
        errorCode: 'PIN_VERIFICATION_FAILED',
        message: PIN_INTERNAL_ERROR_MESSAGE,
        status: 500,
      })
      return withFixedPinDelay(withAuthCookies(auth.response, response))
    }

    if (rpcRowCount > 1) {
      const response = pinFailureResponse({
        authResponse: auth.response,
        errorCode: 'PIN_DUPLICATE',
        message: DUPLICATE_PIN_MESSAGE,
        status: 409,
      })
      return withFixedPinDelay(withAuthCookies(auth.response, response))
    }

    const row = Array.isArray(data) ? data[0] : data
    const employee = sanitizeEmployee(row as PosEmployeeRpcRow | null)

    if (!employee) {
      const response = pinFailureResponse({
        authResponse: auth.response,
        errorCode: 'PIN_INVALID',
        message: PIN_BRANCH_MISMATCH_MESSAGE,
        status: 422,
      })
      return withFixedPinDelay(withAuthCookies(auth.response, response))
    }

    clearPinRateLimit(rateLimitKey)

    const effectiveBranchId = employee.branch_id || branchId
    if (!effectiveBranchId) {
      const missingBranchResponse = pinFailureResponse({
        authResponse: auth.response,
        errorCode: 'POS_CONTEXT_MISSING',
        message: MISSING_POS_CONTEXT_MESSAGE,
        status: 400,
      })
      return withFixedPinDelay(withAuthCookies(auth.response, missingBranchResponse))
    }

    actorSessionIssueReference = createSupportReference()
    const actorSession = await issuePosActorSession({
      verifiedAuth: auth.context.verifiedAuth,
      rawPin: pin,
      requestedBranchId: effectiveBranchId,
    })
    console.info('[POS actor session]', {
      reference: actorSessionIssueReference,
      phase: 'actor_session_issue',
      classification: 'ACTOR_SESSION_ISSUED',
      httpStatus: 200,
      rowCountClassification: 'ONE',
    })

    const response = jsonResponse({
      success: true,
      employee: {
        ...employee,
        branch_id: effectiveBranchId,
      },
    })
    response.cookies.set(
      POS_ACTOR_COOKIE,
      actorSession.token,
      posActorCookieOptions()
    )

    return withFixedPinDelay(withAuthCookies(auth.response, response))
  } catch (error) {
    if (isPosActorSessionIssueError(error)) {
      const reference = actorSessionIssueReference || createSupportReference()
      console.error('[POS actor session issuance failure]', {
        reference,
        phase: 'POS_ACTOR_SESSION_ISSUE',
        classification: error.assessment.classification,
        upstreamCodeCategory: error.assessment.codeCategory,
        httpCategory: error.assessment.httpStatus
          ? `HTTP_${Math.floor(error.assessment.httpStatus / 100)}XX`
          : 'HTTP_UNKNOWN',
        rowCountClassification: error.assessment.rowCountClassification,
        ...safeRequestCorrelation(request),
      })
      const response = pinFailureResponse({
        authResponse: auth.response,
        errorCode: 'POS_ACTOR_SESSION_ISSUE_FAILED',
        message: PIN_INTERNAL_ERROR_MESSAGE,
        status: 500,
        reference,
      })
      return withFixedPinDelay(withAuthCookies(auth.response, response))
    }

    const response = pinFailureResponse({
      authResponse: auth.response,
      errorCode: 'PIN_INTERNAL_ERROR',
      message: PIN_INTERNAL_ERROR_MESSAGE,
      status: 500,
    })

    return withFixedPinDelay(withAuthCookies(auth.response, response))
  }
}

import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import type { AppRole } from '@/lib/app-roles'
import { redactSensitive, safeErrorDetails } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'

type IdentifyEmployeeByPinBody = {
  pin?: string
}

const PIN_RESPONSE_DELAY_MS = 300
const PIN_RATE_LIMIT_MAX_ATTEMPTS = 5
const PIN_RATE_LIMIT_WINDOW_MS = 60 * 1000

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

function clearPinRateLimit(key: string) {
  pinRateLimitStore.delete(key)
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin', 'employee'])

  if (!auth.ok) {
    return withFixedPinDelay(auth.response)
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      const response = jsonResponse(
        { error: 'ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ¯ Ù†Ø·Ø§Ù‚ Ø§Ù„Ù…Ù†Ø´Ø£Ø©' },
        400
      )
      return withFixedPinDelay(withAuthCookies(auth.response, response))
    }

    const body = (await request.json()) as IdentifyEmployeeByPinBody
    const pin = normalizePin(body.pin)

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
      auth.profile.branch_id
    )

    if (!checkPinRateLimit(rateLimitKey)) {
      const response = jsonResponse(
        { error: 'محاولات كثيرة، حاول مرة أخرى بعد دقيقة' },
        429
      )
      return withFixedPinDelay(withAuthCookies(auth.response, response))
    }

    const { data, error } = await supabaseAdmin.rpc('verify_pos_pin', {
      raw_pin: pin,
      tenant_id: tenantId,
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
        redactSensitive(rpcErrorLog)
      )

      const response = jsonResponse(
        {
          error: 'تعذر التحقق من رمز الموظف',
          ...safeErrorDetails(error, 'تعذر التحقق من رمز الموظف'),
        },
        500
      )
      return withFixedPinDelay(withAuthCookies(auth.response, response))
    }

    const row = Array.isArray(data) ? data[0] : data
    const employee = sanitizeEmployee(row as PosEmployeeRpcRow | null)

    if (!employee) {
      const response = jsonResponse(
        { error: 'رمز الموظف غير صحيح' },
        401
      )
      return withFixedPinDelay(withAuthCookies(auth.response, response))
    }

    clearPinRateLimit(rateLimitKey)

    const response = jsonResponse({
      success: true,
      employee,
    })

    return withFixedPinDelay(withAuthCookies(auth.response, response))
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ أثناء التحقق من رمز الموظف',
        ...safeErrorDetails(error, 'حدث خطأ أثناء التحقق من رمز الموظف'),
      },
      500
    )

    return withFixedPinDelay(withAuthCookies(auth.response, response))
  }
}

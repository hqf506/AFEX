import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import type { AppRole } from '@/lib/app-roles'
import { supabaseAdmin } from '@/lib/supabase/admin'

type IdentifyEmployeeByPinBody = {
  pin?: string
}

const PIN_RESPONSE_DELAY_MS = 300

type PosEmployeeRpcRow = {
  id?: string | null
  username?: string | null
  full_name?: string | null
  role?: AppRole | string | null
  branch_id?: string | null
}

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

    const { data, error } = await supabaseAdmin.rpc('verify_pos_pin', {
      raw_pin: pin,
      tenant_id: tenantId,
    })

    if (error) {
      console.error('[POS PIN] verify_pos_pin RPC failed.', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      })

      const response = jsonResponse(
        {
          error: 'تعذر التحقق من رمز الموظف',
          details: error.message,
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

    const response = jsonResponse({
      success: true,
      employee,
    })

    return withFixedPinDelay(withAuthCookies(auth.response, response))
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ أثناء التحقق من رمز الموظف',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )

    return withFixedPinDelay(withAuthCookies(auth.response, response))
  }
}

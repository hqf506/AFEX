import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { writeAuditLog } from '@/lib/audit-log'
import { canManageBranchScopedTarget } from '@/lib/admin/branches'
import {
  isValidAdminPosPin,
  normalizeAdminUserId,
} from '@/lib/admin/users'
import { safeErrorDetails } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'

type ResetUserPosPinBody = {
  userId?: string
  pin?: string
}

function normalizePin(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      const response = jsonResponse(
        { error: 'تعذر تحديد نطاق المنشأة' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const body = (await request.json()) as ResetUserPosPinBody
    const userId = normalizeAdminUserId(body.userId)
    const pin = normalizePin(body.pin)

    if (!userId) {
      const response = jsonResponse({ error: 'معرف المستخدم مطلوب' }, 400)
      return withAuthCookies(auth.response, response)
    }

    if (!isValidAdminPosPin(pin)) {
      const response = jsonResponse(
        { error: 'POS PIN يجب أن يتكون من 4 أرقام' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const { data: existingProfile, error: existingProfileError } =
      await supabaseAdmin
        .from('profiles')
        .select('id, username, branch_id')
        .eq('id', userId)
        .eq('tenant_id', tenantId)
        .maybeSingle()

    if (existingProfileError) {
      const response = jsonResponse(
        {
          error: 'تعذر التحقق من المستخدم',
          ...safeErrorDetails(
            existingProfileError,
            'تعذر التحقق من المستخدم'
          ),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    if (!existingProfile) {
      const response = jsonResponse({ error: 'المستخدم غير موجود' }, 404)
      return withAuthCookies(auth.response, response)
    }

    if (
      !canManageBranchScopedTarget(
        auth.profile.scope_type,
        auth.profile.branch_id,
        typeof existingProfile.branch_id === 'string'
          ? existingProfile.branch_id
          : null
      )
    ) {
      const response = jsonResponse(
        { error: 'لا تملك صلاحية تعديل هذا المستخدم' },
        403
      )
      return withAuthCookies(auth.response, response)
    }

    const { error: setPinError } = await supabaseAdmin.rpc('set_pos_pin', {
      user_id: userId,
      raw_pin: pin,
    })

    if (setPinError) {
      const response = jsonResponse(
        {
          error: 'تعذر حفظ POS PIN بشكل آمن',
          ...safeErrorDetails(setPinError, 'تعذر حفظ POS PIN بشكل آمن'),
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    await writeAuditLog({
      auth,
      request,
      action: 'user.pos_pin_reset',
      entityType: 'profile',
      entityId: userId,
      branchId:
        typeof existingProfile.branch_id === 'string'
          ? existingProfile.branch_id
          : null,
      metadata: {
        reset_by_admin: true,
      },
    })

    const response = jsonResponse({
      success: true,
      message: `تمت إعادة تعيين POS PIN للمستخدم ${existingProfile.username} بنجاح`,
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        ...safeErrorDetails(error, 'تعذر إعادة تعيين POS PIN'),
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}

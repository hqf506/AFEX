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

    const { data: existingPosProfile, error: existingPosProfileError } =
      await supabaseAdmin
        .from('pos_profiles')
        .select('id, username, branch_id')
        .eq('id', userId)
        .eq('tenant_id', tenantId)
        .maybeSingle()

    if (existingPosProfileError) {
      const response = jsonResponse(
        {
          error: 'تعذر التحقق من مستخدم POS',
          ...safeErrorDetails(
            existingPosProfileError,
            'تعذر التحقق من مستخدم POS'
          ),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    if (!existingPosProfile) {
      const response = jsonResponse({ error: 'مستخدم POS غير موجود' }, 404)
      return withAuthCookies(auth.response, response)
    }

    const targetBranchId =
      typeof existingPosProfile.branch_id === 'string'
        ? existingPosProfile.branch_id
        : null

    if (
      !canManageBranchScopedTarget(
        auth.profile.scope_type,
        auth.profile.branch_id,
        targetBranchId
      )
    ) {
      const response = jsonResponse(
        { error: 'لا تملك صلاحية تعديل هذا المستخدم' },
        403
      )
      return withAuthCookies(auth.response, response)
    }

    const { data: pinHash, error: hashError } = await supabaseAdmin.rpc(
      'hash_pos_pin',
      {
        raw_pin: pin,
      }
    )

    if (hashError || typeof pinHash !== 'string') {
      const response = jsonResponse(
        {
          error: 'تعذر حفظ POS PIN بشكل آمن',
          ...safeErrorDetails(hashError, 'تعذر حفظ POS PIN بشكل آمن'),
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const { data: updatedPosProfile, error: updateError } = await supabaseAdmin
      .from('pos_profiles')
      .update({
        pos_pin_hash: pinHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .select('id')
      .maybeSingle()

    if (updateError || !updatedPosProfile) {
      const response = jsonResponse(
        {
          error: 'تعذر حفظ POS PIN بشكل آمن',
          ...safeErrorDetails(updateError, 'تعذر حفظ POS PIN بشكل آمن'),
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    await writeAuditLog({
      auth,
      request,
      action: 'user.pos_pin_reset',
      entityType: 'pos_profile',
      entityId: userId,
      branchId: targetBranchId,
      metadata: {
        reset_by_admin: true,
      },
    })

    const response = jsonResponse({
      success: true,
      message: 'تم تحديث PIN بنجاح',
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

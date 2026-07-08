import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { writeAuditLog } from '@/lib/audit-log'
import {
  disabledFeatureResponse,
  USERS_FEATURE_DISABLED_MESSAGE,
} from '@/lib/feature-guards'
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
  branch_id?: string | null
  branchId?: string | null
}

function normalizePin(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeBranchId(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isFullAdminRole(role: string | null | undefined) {
  return role === 'admin' || role === 'manager'
}

function generateInternalPosUsername() {
  const randomPart = Math.random().toString(36).slice(2, 8)
  return `pos_${Date.now().toString(36)}_${randomPart}`
}

async function resolveAvailablePosUsername(
  tenantId: string,
  preferredUsername: string | null | undefined,
  userId: string
) {
  const candidates = [
    typeof preferredUsername === 'string' ? preferredUsername.trim() : '',
    generateInternalPosUsername(),
    generateInternalPosUsername(),
  ].filter(Boolean)

  for (const candidate of candidates) {
    const { data: conflict, error } = await supabaseAdmin
      .from('pos_profiles')
      .select('id')
      .eq('tenant_id', tenantId)
      .ilike('username', candidate)
      .neq('id', userId)
      .limit(1)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!conflict) {
      return candidate
    }
  }

  return generateInternalPosUsername()
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

    const usersDisabledResponse = await disabledFeatureResponse(
      auth.response,
      tenantId,
      'enable_users',
      USERS_FEATURE_DISABLED_MESSAGE
    )

    if (usersDisabledResponse) {
      return usersDisabledResponse
    }

    const body = (await request.json()) as ResetUserPosPinBody
    const userId = normalizeAdminUserId(body.userId)
    const pin = normalizePin(body.pin)
    const requestedBranchId =
      normalizeBranchId(body.branch_id) || normalizeBranchId(body.branchId)

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
        .select('id, username, branch_id, role')
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

    let targetBranchId =
      typeof existingPosProfile?.branch_id === 'string'
        ? existingPosProfile.branch_id
        : requestedBranchId || null

    if (!existingPosProfile) {
      const { data: existingProfile, error: existingProfileError } =
        await supabaseAdmin
          .from('profiles')
          .select('id, tenant_id, branch_id, username, full_name, phone, role, is_active')
          .eq('id', userId)
          .eq('tenant_id', tenantId)
          .maybeSingle()

      if (existingProfileError) {
        const response = jsonResponse(
          {
            error: 'تعذر التحقق من حساب المستخدم',
            ...safeErrorDetails(
              existingProfileError,
              'تعذر التحقق من حساب المستخدم'
            ),
          },
          500
        )
        return withAuthCookies(auth.response, response)
      }

      if (!existingProfile) {
        const response = jsonResponse(
          { error: 'المستخدم غير موجود في حسابات الإدارة أو POS' },
          404
        )
        return withAuthCookies(auth.response, response)
      }

      if (!['admin', 'manager', 'employee'].includes(existingProfile.role)) {
        const response = jsonResponse(
          { error: 'لا يمكن إنشاء POS PIN لهذا الدور' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      targetBranchId =
        (typeof existingProfile.branch_id === 'string'
          ? existingProfile.branch_id
          : null) || requestedBranchId || null

      if (!targetBranchId) {
        const response = jsonResponse(
          {
            error: isFullAdminRole(existingProfile.role)
              ? 'اختر فرعًا لاستخدام POS لهذا المدير'
              : 'اختر فرعًا للمستخدم قبل إعادة تعيين PIN',
          },
          400
        )
        return withAuthCookies(auth.response, response)
      }

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

      let username: string

      try {
        username = await resolveAvailablePosUsername(
          tenantId,
          existingProfile.username,
          userId
        )
      } catch (error) {
        const response = jsonResponse(
          {
            error: 'تعذر تجهيز اسم مستخدم POS',
            ...safeErrorDetails(error, 'تعذر تجهيز اسم مستخدم POS'),
          },
          500
        )
        return withAuthCookies(auth.response, response)
      }

      const { data: createdPosProfile, error: createPosProfileError } =
        await supabaseAdmin
          .from('pos_profiles')
          .insert({
            id: userId,
            tenant_id: tenantId,
            branch_id: targetBranchId,
            username,
            full_name: existingProfile.full_name || username,
            phone: existingProfile.phone || null,
            pos_pin_hash: pinHash,
            pos_pin_plain: pin,
            role: existingProfile.role,
            is_active: existingProfile.is_active ?? true,
            created_by: auth.user.id,
          })
          .select('id')
          .maybeSingle()

      if (createPosProfileError || !createdPosProfile) {
        const response = jsonResponse(
          {
            error: 'تعذر إنشاء ملف POS لهذا المستخدم',
            ...safeErrorDetails(
              createPosProfileError,
              'تعذر إنشاء ملف POS لهذا المستخدم'
            ),
          },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      await writeAuditLog({
        auth,
        request,
        action: 'user.pos_profile_created_for_pin_reset',
        entityType: 'pos_profile',
        entityId: userId,
        branchId: targetBranchId,
        metadata: {
          role: existingProfile.role,
          username,
          reset_by_admin: true,
        },
      })

      const response = jsonResponse({
        success: true,
        message: 'تم تحديث PIN بنجاح',
        pos_pin: pin,
      })

      return withAuthCookies(auth.response, response)
    }

    if (
      !targetBranchId
    ) {
      const response = jsonResponse(
        {
          error: isFullAdminRole(existingPosProfile?.role)
            ? 'اختر فرعًا لاستخدام POS لهذا المدير'
            : 'اختر فرعًا للمستخدم قبل إعادة تعيين PIN',
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

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
        pos_pin_plain: pin,
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
      pos_pin: pin,
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

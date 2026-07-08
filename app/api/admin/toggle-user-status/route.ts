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
  isPrimaryAdminUsername,
  normalizeAdminUserId,
} from '@/lib/admin/users'
import { isBooleanValue } from '@/lib/api/validation'
import { safeErrorDetails } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'

type ToggleUserStatusBody = {
  userId?: string
  is_active?: boolean
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

    const body = (await request.json()) as ToggleUserStatusBody
    const userId = normalizeAdminUserId(body.userId)
    const isActive = body.is_active

    if (!userId) {
      const response = jsonResponse({ error: 'معرف المستخدم مطلوب' }, 400)
      return withAuthCookies(auth.response, response)
    }

    if (!isBooleanValue(isActive)) {
      const response = jsonResponse({ error: 'قيمة is_active غير صالحة' }, 400)
      return withAuthCookies(auth.response, response)
    }

    const { data: existingProfile, error: existingProfileError } =
      await supabaseAdmin
        .from('profiles')
        .select('id, username, is_active, branch_id')
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
      const { data: existingPosProfile } = await supabaseAdmin
        .from('pos_profiles')
        .select('id, username, is_active, branch_id')
        .eq('id', userId)
        .eq('tenant_id', tenantId)
        .maybeSingle()

      if (existingPosProfile) {
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

        const { error: updatePosError } = await supabaseAdmin
          .from('pos_profiles')
          .update({
            is_active: isActive,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
          .eq('tenant_id', tenantId)

        if (updatePosError) {
          const response = jsonResponse(
            {
              error: 'فشل تحديث حالة المستخدم',
              ...safeErrorDetails(updatePosError, 'تعذر تحديث حالة المستخدم'),
            },
            400
          )
          return withAuthCookies(auth.response, response)
        }

        await writeAuditLog({
          auth,
          request,
          action: 'user.status_toggled',
          entityType: 'pos_profile',
          entityId: userId,
          branchId: targetBranchId,
          metadata: {
            old_is_active: existingPosProfile.is_active,
            new_is_active: isActive,
          },
        })

        const response = jsonResponse({
          success: true,
          message: isActive
            ? 'تم تفعيل المستخدم بنجاح'
            : 'تم تعطيل المستخدم بنجاح',
          user: {
            id: existingPosProfile.id,
            username: existingPosProfile.username,
            is_active: isActive,
          },
        })

        return withAuthCookies(auth.response, response)
      }

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

    if (isPrimaryAdminUsername(existingProfile.username)) {
      const response = jsonResponse(
        { error: 'لا يمكن تعطيل أو تفعيل حساب admin الرئيسي' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .eq('tenant_id', tenantId)

    if (updateError) {
      const response = jsonResponse(
        {
          error: 'فشل تحديث حالة المستخدم',
          ...safeErrorDetails(updateError, 'تعذر تحديث حالة المستخدم'),
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    await writeAuditLog({
      auth,
      request,
      action: 'user.status_toggled',
      entityType: 'profile',
      entityId: userId,
      branchId:
        typeof existingProfile.branch_id === 'string'
          ? existingProfile.branch_id
          : null,
      metadata: {
        old_is_active: existingProfile.is_active,
        new_is_active: isActive,
      },
    })

    const response = jsonResponse({
      success: true,
      message: isActive
        ? 'تم تفعيل المستخدم بنجاح'
        : 'تم تعطيل المستخدم بنجاح',
      user: {
        id: existingProfile.id,
        username: existingProfile.username,
        is_active: isActive,
      },
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        ...safeErrorDetails(error, 'تعذر تحديث حالة المستخدم'),
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}

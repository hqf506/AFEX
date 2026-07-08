import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { writeAuditLog } from '@/lib/audit-log'
import {
  disabledFeatureResponse,
  USERS_FEATURE_DISABLED_MESSAGE,
} from '@/lib/feature-guards'
import {
  canManageBranchScopedTarget,
  isSystemScopedAdmin,
  normalizeAdminBranchId,
  requiresAssignedBranch,
} from '@/lib/admin/branches'
import {
  isPrimaryAdminUsername,
  normalizeAdminUserId,
} from '@/lib/admin/users'
import { safeErrorDetails } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'

type UpdateUserBranchBody = {
  userId?: string
  branch_id?: string | null
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  if (!isSystemScopedAdmin(auth.profile.scope_type)) {
    const response = jsonResponse(
      { error: 'هذه العملية متاحة لمدير النظام فقط' },
      403
    )

    return withAuthCookies(auth.response, response)
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

    const body = (await request.json()) as UpdateUserBranchBody
    const userId = normalizeAdminUserId(body.userId)
    const branchId = normalizeAdminBranchId(body.branch_id)

    if (!userId) {
      const response = jsonResponse(
        { error: 'معرف المستخدم مطلوب' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const { data: existingProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, role, branch_id')
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (profileError) {
      const response = jsonResponse(
        {
          error: 'تعذر التحقق من المستخدم',
          ...safeErrorDetails(profileError, 'تعذر التحقق من المستخدم'),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    if (!existingProfile) {
      const { data: existingPosProfile } = await supabaseAdmin
        .from('pos_profiles')
        .select('id, username, role, branch_id')
        .eq('id', userId)
        .eq('tenant_id', tenantId)
        .maybeSingle()

      if (existingPosProfile) {
        if (requiresAssignedBranch(existingPosProfile.role) && !branchId) {
          const response = jsonResponse(
            { error: 'يجب تعيين فرع للمستخدمين غير الأدمن' },
            400
          )
          return withAuthCookies(auth.response, response)
        }

        if (branchId) {
          const { data: branch, error: branchError } = await supabaseAdmin
            .from('branches')
            .select('id')
            .eq('id', branchId)
            .eq('tenant_id', tenantId)
            .maybeSingle()

          if (branchError || !branch) {
            const response = jsonResponse(
              { error: 'الفرع المحدد غير موجود' },
              branchError ? 500 : 404
            )
            return withAuthCookies(auth.response, response)
          }
        }

        const { error: updatePosError } = await supabaseAdmin
          .from('pos_profiles')
          .update({
            branch_id: branchId || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
          .eq('tenant_id', tenantId)

        if (updatePosError) {
          const response = jsonResponse(
            {
              error: 'فشل تحديث فرع المستخدم',
              ...safeErrorDetails(updatePosError, 'تعذر تحديث فرع المستخدم'),
            },
            400
          )
          return withAuthCookies(auth.response, response)
        }

        await writeAuditLog({
          auth,
          request,
          action: 'user.branch_updated',
          entityType: 'pos_profile',
          entityId: userId,
          branchId: branchId || null,
          metadata: {
            old_branch_id: existingPosProfile.branch_id,
            new_branch_id: branchId || null,
          },
        })

        const response = jsonResponse({
          success: true,
          message: 'تم تحديث فرع المستخدم بنجاح',
          user: {
            id: existingPosProfile.id,
            username: existingPosProfile.username,
            branch_id: branchId || null,
          },
        })

        return withAuthCookies(auth.response, response)
      }

      const response = jsonResponse(
        { error: 'المستخدم غير موجود' },
        404
      )
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

    if (isPrimaryAdminUsername(existingProfile.username) && !branchId) {
      const response = jsonResponse(
        { error: 'لا يمكن إزالة فرع حساب admin الرئيسي' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (requiresAssignedBranch(existingProfile.role) && !branchId) {
      const response = jsonResponse(
        { error: 'يجب تعيين فرع للمستخدمين غير الأدمن' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (branchId) {
      const { data: branch, error: branchError } = await supabaseAdmin
        .from('branches')
        .select('id, is_active')
        .eq('id', branchId)
        .eq('tenant_id', tenantId)
        .maybeSingle()

      if (branchError) {
        const response = jsonResponse(
          {
            error: 'تعذر التحقق من الفرع',
            ...safeErrorDetails(branchError, 'تعذر التحقق من الفرع'),
          },
          500
        )
        return withAuthCookies(auth.response, response)
      }

      if (!branch) {
        const response = jsonResponse(
          { error: 'الفرع المحدد غير موجود' },
          404
        )
        return withAuthCookies(auth.response, response)
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        branch_id: branchId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .eq('tenant_id', tenantId)

    if (updateError) {
      const response = jsonResponse(
        {
          error: 'فشل تحديث فرع المستخدم',
          ...safeErrorDetails(updateError, 'تعذر تحديث فرع المستخدم'),
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    await writeAuditLog({
      auth,
      request,
      action: 'user.branch_updated',
      entityType: 'profile',
      entityId: userId,
      branchId: branchId || null,
      metadata: {
        old_branch_id: existingProfile.branch_id,
        new_branch_id: branchId || null,
      },
    })

    const response = jsonResponse({
      success: true,
      message: 'تم تحديث فرع المستخدم بنجاح',
      user: {
        id: existingProfile.id,
        username: existingProfile.username,
        branch_id: branchId || null,
      },
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        ...safeErrorDetails(error, 'تعذر تحديث فرع المستخدم'),
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}

import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { writeAuditLog } from '@/lib/audit-log'
import {
  canManageBranchScopedTarget,
  requiresAssignedBranch,
} from '@/lib/admin/branches'
import {
  isPrimaryAdminUsername,
  isValidAdminRole,
  normalizeAdminUserId,
} from '@/lib/admin/users'
import { type AppRole } from '@/lib/app-roles'
import { safeErrorDetails } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'

type UpdateUserRoleBody = {
  userId?: string
  role?: AppRole
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

    const body = (await request.json()) as UpdateUserRoleBody

    const userId = normalizeAdminUserId(body.userId)
    const role = body.role

    if (!userId) {
      const response = jsonResponse({ error: 'معرف المستخدم مطلوب' }, 400)
      return withAuthCookies(auth.response, response)
    }

    if (!role || !isValidAdminRole(role)) {
      const response = jsonResponse({ error: 'الصلاحية غير صالحة' }, 400)
      return withAuthCookies(auth.response, response)
    }

    const { data: existingProfile, error: profileCheckError } =
      await supabaseAdmin
        .from('profiles')
        .select('id, username, role, branch_id')
        .eq('id', userId)
        .eq('tenant_id', tenantId)
        .maybeSingle()

    if (profileCheckError) {
      const response = jsonResponse(
        {
          error: 'تعذر التحقق من المستخدم',
          ...safeErrorDetails(
            profileCheckError,
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
        .select('id, username, role, branch_id')
        .eq('id', userId)
        .eq('tenant_id', tenantId)
        .maybeSingle()

      if (existingPosProfile) {
        if (role === 'admin') {
          const response = jsonResponse(
            { error: 'لا يمكن تحويل مستخدم POS إلى admin' },
            400
          )
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

        const { error: updatePosError } = await supabaseAdmin
          .from('pos_profiles')
          .update({ role, updated_at: new Date().toISOString() })
          .eq('id', userId)
          .eq('tenant_id', tenantId)

        if (updatePosError) {
          const response = jsonResponse(
            {
              error: 'فشل تحديث الصلاحية',
              ...safeErrorDetails(updatePosError, 'تعذر تحديث الصلاحية'),
            },
            400
          )
          return withAuthCookies(auth.response, response)
        }

        await writeAuditLog({
          auth,
          request,
          action: 'user.role_updated',
          entityType: 'pos_profile',
          entityId: userId,
          branchId: targetBranchId,
          metadata: {
            old_role: existingPosProfile.role,
            new_role: role,
          },
        })

        const response = jsonResponse({
          success: true,
          message: 'تم تحديث الصلاحية بنجاح',
          user: {
            id: existingPosProfile.id,
            username: existingPosProfile.username,
            role,
          },
        })

        return withAuthCookies(auth.response, response)
      }

      const response = jsonResponse(
        { error: 'المستخدم غير موجود في profiles' },
        404
      )
      return withAuthCookies(auth.response, response)
    }

    const targetBranchId =
      typeof existingProfile.branch_id === 'string'
        ? existingProfile.branch_id
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

    if (isPrimaryAdminUsername(existingProfile.username)) {
      const response = jsonResponse(
        { error: 'لا يمكن تعديل صلاحية حساب admin الرئيسي' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (requiresAssignedBranch(role) && !targetBranchId) {
      const response = jsonResponse(
        { error: 'يجب تعيين فرع للمستخدمين غير الأدمن قبل تعديل الصلاحية' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        role,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .eq('tenant_id', tenantId)

    if (updateError) {
      const response = jsonResponse(
        {
          error: 'فشل تحديث الصلاحية',
          ...safeErrorDetails(updateError, 'تعذر تحديث الصلاحية'),
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    await writeAuditLog({
      auth,
      request,
      action: 'user.role_updated',
      entityType: 'profile',
      entityId: userId,
      branchId: targetBranchId,
      metadata: {
        old_role: existingProfile.role,
        new_role: role,
      },
    })

    const response = jsonResponse({
      success: true,
      message: 'تم تحديث الصلاحية بنجاح',
      user: {
        id: existingProfile.id,
        username: existingProfile.username,
        role,
      },
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        ...safeErrorDetails(error, 'تعذر تحديث الصلاحية'),
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}

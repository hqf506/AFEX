import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { writeAuditLog } from '@/lib/audit-log'
import { canManageBranchScopedTarget } from '@/lib/admin/branches'
import {
  isPrimaryAdminUsername,
  normalizeAdminUserId,
} from '@/lib/admin/users'
import { safeErrorDetails } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'

type DeleteUserBody = {
  userId?: string
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

    const body = (await request.json()) as DeleteUserBody
    const userId = normalizeAdminUserId(body.userId)

    if (!userId) {
      const response = jsonResponse({ error: 'معرف المستخدم مطلوب' }, 400)
      return withAuthCookies(auth.response, response)
    }

    const { data: existingProfile, error: existingProfileError } =
      await supabaseAdmin
        .from('profiles')
        .select('id, username, role, branch_id, is_active')
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
        .select('id, username, role, branch_id, is_active')
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
            { error: 'لا تملك صلاحية حذف هذا المستخدم' },
            403
          )
          return withAuthCookies(auth.response, response)
        }

        const { error: deletePosError } = await supabaseAdmin
          .from('pos_profiles')
          .delete()
          .eq('id', userId)
          .eq('tenant_id', tenantId)

        if (deletePosError) {
          const response = jsonResponse(
            {
              error: 'فشل حذف مستخدم POS',
              ...safeErrorDetails(deletePosError, 'تعذر حذف مستخدم POS'),
            },
            400
          )
          return withAuthCookies(auth.response, response)
        }

        await writeAuditLog({
          auth,
          request,
          action: 'user.deleted',
          entityType: 'pos_profile',
          entityId: userId,
          branchId: targetBranchId,
          metadata: {
            role: existingPosProfile.role,
            username: existingPosProfile.username,
            branch_id: existingPosProfile.branch_id,
            was_active: existingPosProfile.is_active,
          },
        })

        const response = jsonResponse({
          success: true,
          message: 'تم حذف المستخدم بنجاح',
        })

        return withAuthCookies(auth.response, response)
      }

      const response = jsonResponse(
        { error: 'المستخدم غير موجود في profiles' },
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
        { error: 'لا تملك صلاحية حذف هذا المستخدم' },
        403
      )
      return withAuthCookies(auth.response, response)
    }

    if (isPrimaryAdminUsername(existingProfile.username)) {
      const response = jsonResponse(
        { error: 'لا يمكن حذف حساب admin الرئيسي' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const { error: deleteProfileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId)
      .eq('tenant_id', tenantId)

    if (deleteProfileError) {
      const response = jsonResponse(
        {
          error: 'فشل حذف المستخدم من profiles',
          ...safeErrorDetails(
            deleteProfileError,
            'تعذر حذف المستخدم من profiles'
          ),
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(
      userId
    )

    if (deleteAuthError) {
      const response = jsonResponse(
        {
          error: 'تم حذف المستخدم من profiles لكن فشل حذفه من auth',
          ...safeErrorDetails(deleteAuthError, 'تعذر حذف المستخدم من auth'),
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    await writeAuditLog({
      auth,
      request,
      action: 'user.deleted',
      entityType: 'profile',
      entityId: userId,
      branchId:
        typeof existingProfile.branch_id === 'string'
          ? existingProfile.branch_id
          : null,
      metadata: {
        role: existingProfile.role,
        username: existingProfile.username,
        branch_id: existingProfile.branch_id,
        was_active: existingProfile.is_active,
      },
    })

    const response = jsonResponse({
      success: true,
      message: 'تم حذف المستخدم بنجاح',
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        ...safeErrorDetails(error, 'تعذر حذف المستخدم'),
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}

import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
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
      .maybeSingle()

    if (profileError) {
      const response = jsonResponse(
        {
          error: 'تعذر التحقق من المستخدم',
          details: profileError.message,
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    if (!existingProfile) {
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
        .maybeSingle()

      if (branchError) {
        const response = jsonResponse(
          {
            error: 'تعذر التحقق من الفرع',
            details: branchError.message,
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

    if (updateError) {
      const response = jsonResponse(
        {
          error: 'فشل تحديث فرع المستخدم',
          details: updateError.message,
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

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
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}

import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { canManageBranchScopedTarget } from '@/lib/admin/branches'
import {
  isPrimaryAdminUsername,
  normalizeAdminUserId,
} from '@/lib/admin/users'
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
        { error: 'ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ¯ Ù†Ø·Ø§Ù‚ Ø§Ù„Ù…Ù†Ø´Ø£Ø©' },
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
        .select('id, username, role, branch_id')
        .eq('id', userId)
        .eq('tenant_id', tenantId)
        .maybeSingle()

    if (existingProfileError) {
      const response = jsonResponse(
        {
          error: 'تعذر التحقق من المستخدم',
          details: existingProfileError.message,
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    if (!existingProfile) {
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
          details: deleteProfileError.message,
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
          details: deleteAuthError.message,
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const response = jsonResponse({
      success: true,
      message: 'تم حذف المستخدم بنجاح',
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

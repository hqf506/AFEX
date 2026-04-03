import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { canManageBranchScopedTarget } from '@/lib/admin/branches'
import {
  isPrimaryAdminUsername,
  normalizeAdminUserId,
} from '@/lib/admin/users'
import { isBooleanValue } from '@/lib/api/validation'
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

    if (updateError) {
      const response = jsonResponse(
        {
          error: 'فشل تحديث حالة المستخدم',
          details: updateError.message,
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

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
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}

import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import {
  isPrimaryAdminUsername,
  isValidAdminRole,
  normalizeAdminUserId,
} from '@/lib/admin/users'
import { type AppRole } from '@/lib/app-roles'
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
    const body = (await request.json()) as UpdateUserRoleBody

    const userId = normalizeAdminUserId(body.userId)
    const role = body.role

    if (!userId) {
      const response = jsonResponse(
        { error: 'معرف المستخدم مطلوب' }, 400)
      return withAuthCookies(auth.response, response)
    }

    if (!role || !isValidAdminRole(role)) {
      const response = jsonResponse(
        { error: 'الصلاحية غير صالحة' }, 400)
      return withAuthCookies(auth.response, response)
    }

    const { data: existingProfile, error: profileCheckError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, role')
      .eq('id', userId)
      .maybeSingle()

    if (profileCheckError) {
      const response = jsonResponse(
        {
          error: 'تعذر التحقق من المستخدم',
          details: profileCheckError.message,
        }, 500)
      return withAuthCookies(auth.response, response)
    }

    if (!existingProfile) {
      const response = jsonResponse(
        { error: 'المستخدم غير موجود في profiles' }, 404)
      return withAuthCookies(auth.response, response)
    }

    if (isPrimaryAdminUsername(existingProfile.username)) {
      const response = jsonResponse(
        { error: 'لا يمكن تعديل صلاحية حساب admin الرئيسي' }, 400)
      return withAuthCookies(auth.response, response)
    }

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        role,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (updateError) {
      const response = jsonResponse(
        {
          error: 'فشل تحديث الصلاحية',
          details: updateError.message,
        }, 400)
      return withAuthCookies(auth.response, response)
    }

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
        details: error instanceof Error ? error.message : 'Unknown error',
      }, 500)

    return withAuthCookies(auth.response, response)
  }
}

import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
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
    const body = (await request.json()) as DeleteUserBody

    const userId = normalizeAdminUserId(body.userId)

    if (!userId) {
      const response = jsonResponse(
        { error: 'معرف المستخدم مطلوب' }, 400)
      return withAuthCookies(auth.response, response)
    }

    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, role')
      .eq('id', userId)
      .maybeSingle()

    if (existingProfileError) {
      const response = jsonResponse(
        {
          error: 'تعذر التحقق من المستخدم',
          details: existingProfileError.message,
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
        { error: 'لا يمكن حذف حساب admin الرئيسي' }, 400)
      return withAuthCookies(auth.response, response)
    }

    const { error: deleteProfileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (deleteProfileError) {
      const response = jsonResponse(
        {
          error: 'فشل حذف المستخدم من profiles',
          details: deleteProfileError.message,
        }, 400)
      return withAuthCookies(auth.response, response)
    }

    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteAuthError) {
      const response = jsonResponse(
        {
          error: 'تم حذف المستخدم من profiles لكن فشل حذفه من auth',
          details: deleteAuthError.message,
        }, 400)
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
      }, 500)

    return withAuthCookies(auth.response, response)
  }
}

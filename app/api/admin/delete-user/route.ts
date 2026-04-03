import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
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
      const response = NextResponse.json(
        { error: 'معرف المستخدم مطلوب' },
        { status: 400 }
      )
      return withAuthCookies(auth.response, response)
    }

    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, role')
      .eq('id', userId)
      .maybeSingle()

    if (existingProfileError) {
      const response = NextResponse.json(
        {
          error: 'تعذر التحقق من المستخدم',
          details: existingProfileError.message,
        },
        { status: 500 }
      )
      return withAuthCookies(auth.response, response)
    }

    if (!existingProfile) {
      const response = NextResponse.json(
        { error: 'المستخدم غير موجود في profiles' },
        { status: 404 }
      )
      return withAuthCookies(auth.response, response)
    }

    if (isPrimaryAdminUsername(existingProfile.username)) {
      const response = NextResponse.json(
        { error: 'لا يمكن حذف حساب admin الرئيسي' },
        { status: 400 }
      )
      return withAuthCookies(auth.response, response)
    }

    const { error: deleteProfileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (deleteProfileError) {
      const response = NextResponse.json(
        {
          error: 'فشل حذف المستخدم من profiles',
          details: deleteProfileError.message,
        },
        { status: 400 }
      )
      return withAuthCookies(auth.response, response)
    }

    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteAuthError) {
      const response = NextResponse.json(
        {
          error: 'تم حذف المستخدم من profiles لكن فشل حذفه من auth',
          details: deleteAuthError.message,
        },
        { status: 400 }
      )
      return withAuthCookies(auth.response, response)
    }

    const response = NextResponse.json({
      success: true,
      message: 'تم حذف المستخدم بنجاح',
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = NextResponse.json(
      {
        error: 'حدث خطأ غير متوقع',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )

    return withAuthCookies(auth.response, response)
  }
}

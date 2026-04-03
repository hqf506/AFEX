import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

type ResetUserPasswordBody = {
  userId?: string
  newPassword?: string
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const body = (await request.json()) as ResetUserPasswordBody

    const userId = body.userId?.trim() || ''
    const newPassword = body.newPassword?.trim() || ''

    if (!userId) {
      const response = NextResponse.json(
        { error: 'معرف المستخدم مطلوب' },
        { status: 400 }
      )
      return withAuthCookies(auth.response, response)
    }

    if (!newPassword || newPassword.length < 6) {
      const response = NextResponse.json(
        { error: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف أو أكثر' },
        { status: 400 }
      )
      return withAuthCookies(auth.response, response)
    }

    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, username')
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
        { error: 'المستخدم غير موجود' },
        { status: 404 }
      )
      return withAuthCookies(auth.response, response)
    }

    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      {
        password: newPassword,
      }
    )

    if (updateAuthError) {
      const response = NextResponse.json(
        {
          error: 'فشل إعادة تعيين كلمة المرور',
          details: updateAuthError.message,
        },
        { status: 400 }
      )
      return withAuthCookies(auth.response, response)
    }

    const response = NextResponse.json({
      success: true,
      message: `تم إعادة تعيين كلمة مرور المستخدم ${existingProfile.username} بنجاح`,
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
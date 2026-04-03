import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
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

    const userId = body.userId?.trim() || ''
    const isActive = body.is_active

    if (!userId) {
      const response = NextResponse.json(
        { error: 'معرف المستخدم مطلوب' },
        { status: 400 }
      )
      return withAuthCookies(auth.response, response)
    }

    if (typeof isActive !== 'boolean') {
      const response = NextResponse.json(
        { error: 'قيمة is_active غير صالحة' },
        { status: 400 }
      )
      return withAuthCookies(auth.response, response)
    }

    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, is_active')
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

    if (existingProfile.username === 'admin') {
      const response = NextResponse.json(
        { error: 'لا يمكن تعطيل أو تفعيل حساب admin الرئيسي' },
        { status: 400 }
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
      const response = NextResponse.json(
        {
          error: 'فشل تحديث حالة المستخدم',
          details: updateError.message,
        },
        { status: 400 }
      )
      return withAuthCookies(auth.response, response)
    }

    const response = NextResponse.json({
      success: true,
      message: isActive ? 'تم تفعيل المستخدم بنجاح' : 'تم تعطيل المستخدم بنجاح',
      user: {
        id: existingProfile.id,
        username: existingProfile.username,
        is_active: isActive,
      },
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
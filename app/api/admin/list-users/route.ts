import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, username, role, is_active, created_at, updated_at')
      .order('username', { ascending: true })

    if (error) {
      const response = NextResponse.json(
        {
          error: 'تعذر تحميل المستخدمين',
          details: error.message,
        },
        { status: 500 }
      )

      return withAuthCookies(auth.response, response)
    }

    const response = NextResponse.json({
      success: true,
      users: data || [],
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
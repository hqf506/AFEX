import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { normalizeUsername } from '@/lib/usernames'

type Body = {
  username?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body
    const username = normalizeUsername(body.username || '')

    if (!username) {
      return NextResponse.json(
        { error: 'اسم المستخدم مطلوب' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, username, is_active')
      .eq('username', username)
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        {
          error: 'تعذر التحقق من اسم المستخدم',
          details: error.message,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      exists: !!data,
      user: data || null,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'حدث خطأ غير متوقع',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

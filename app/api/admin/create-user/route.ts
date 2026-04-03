import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { type AppRole } from '@/lib/app-roles'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { normalizeUsername, usernameToInternalEmail } from '@/lib/usernames'

type CreateUserBody = {
  username?: string
  password?: string
  full_name?: string
  role?: AppRole
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const body = (await request.json()) as CreateUserBody

    const username = normalizeUsername(body.username || '')
    const password = (body.password || '').trim()
    const fullName = (body.full_name || '').trim()
    const role: AppRole = body.role || 'employee'

    if (!username) {
      const response = NextResponse.json(
        { error: 'اسم المستخدم مطلوب' },
        { status: 400 }
      )
      return withAuthCookies(auth.response, response)
    }

    if (!/^[a-z0-9._-]+$/.test(username)) {
      const response = NextResponse.json(
        {
          error: 'اسم المستخدم غير صالح',
          details: 'استخدم حروف إنجليزية صغيرة أو أرقام أو . أو _ أو - فقط',
        },
        { status: 400 }
      )
      return withAuthCookies(auth.response, response)
    }

    if (password.length < 6) {
      const response = NextResponse.json(
        { error: 'كلمة المرور يجب أن تكون 6 أحرف أو أكثر' },
        { status: 400 }
      )
      return withAuthCookies(auth.response, response)
    }

    if (!['admin', 'employee', 'cashier'].includes(role)) {
      const response = NextResponse.json(
        { error: 'الصلاحية غير صالحة' },
        { status: 400 }
      )
      return withAuthCookies(auth.response, response)
    }

    const internalEmail = usernameToInternalEmail(username)

    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, username')
      .eq('username', username)
      .maybeSingle()

    if (existingProfileError) {
      const response = NextResponse.json(
        {
          error: 'فشل التحقق من اسم المستخدم في profiles',
          details: existingProfileError.message,
        },
        { status: 500 }
      )
      return withAuthCookies(auth.response, response)
    }

    if (existingProfile) {
      const response = NextResponse.json(
        {
          error: 'اسم المستخدم مستخدم بالفعل',
          details: `username "${username}" موجود مسبقًا`,
        },
        { status: 409 }
      )
      return withAuthCookies(auth.response, response)
    }

    const { data: usersData, error: listUsersError } =
      await supabaseAdmin.auth.admin.listUsers()

    if (listUsersError) {
      const response = NextResponse.json(
        {
          error: 'فشل قراءة مستخدمي auth',
          details: listUsersError.message,
        },
        { status: 500 }
      )
      return withAuthCookies(auth.response, response)
    }

    const existingAuthUser = usersData.users.find(
      (user) => user.email?.toLowerCase() === internalEmail.toLowerCase()
    )

    if (existingAuthUser) {
      const response = NextResponse.json(
        {
          error: 'المستخدم موجود مسبقًا في auth',
          details: `email "${internalEmail}" موجود مسبقًا في auth.users`,
        },
        { status: 409 }
      )
      return withAuthCookies(auth.response, response)
    }

    const { data: createdUser, error: createAuthError } =
      await supabaseAdmin.auth.admin.createUser({
        email: internalEmail,
        password,
        email_confirm: true,
        user_metadata: {
          username,
          full_name: fullName || username,
          role,
        },
      })

    if (createAuthError || !createdUser.user) {
      const response = NextResponse.json(
        {
          error: 'فشل إنشاء المستخدم في auth',
          details: createAuthError?.message || 'Unknown auth error',
        },
        { status: 400 }
      )
      return withAuthCookies(auth.response, response)
    }

    const userId = createdUser.user.id

    const { error: profileInsertError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        username,
        full_name: fullName || username,
        role,
        is_active: true,
      })

    if (profileInsertError) {
      await supabaseAdmin.auth.admin.deleteUser(userId)

      const response = NextResponse.json(
        {
          error: 'تم إنشاء المستخدم في auth لكن فشل حفظه في profiles',
          details: profileInsertError.message,
        },
        { status: 400 }
      )
      return withAuthCookies(auth.response, response)
    }

    const response = NextResponse.json({
      success: true,
      message: 'تم إنشاء المستخدم بنجاح',
      user: {
        id: userId,
        username,
        full_name: fullName || username,
        role,
        email: internalEmail,
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

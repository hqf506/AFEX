import { NextRequest } from 'next/server'
import { jsonResponse } from '@/lib/api/responses'
import { safeErrorDetails } from '@/lib/security/redaction'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { normalizeUsername, usernameToInternalEmail } from '@/lib/usernames'
import type { AppRole } from '@/lib/app-roles'

type LoginBody = {
  username?: string
  password?: string
}

type LoginProfile = {
  id: string
  username: string | null
  full_name: string | null
  role: AppRole | string | null
  is_active: boolean | null
  contact_email: string | null
}

function loginError(status = 401) {
  return jsonResponse(
    {
      success: false,
      error: 'اسم المستخدم أو كلمة المرور غير صحيحة',
    },
    status
  )
}

function getFirstName(fullName: string | null, fallback: string) {
  const normalizedName = fullName?.trim()

  return normalizedName ? normalizedName.split(/\s+/)[0] : fallback
}

async function resolveLoginProfile(identifier: string) {
  const isEmailIdentifier = identifier.includes('@')
  let profile: LoginProfile | null = null
  let authEmail: string | null = null

  const { data: usernameProfiles, error: usernameError } = await supabaseAdmin
    .from('profiles')
    .select('id, username, full_name, role, is_active, contact_email')
    .ilike('username', identifier)
    .limit(2)

  if (usernameError || (usernameProfiles || []).length > 1) {
    return null
  }

  profile = (usernameProfiles?.[0] as LoginProfile | undefined) || null

  if (!profile && isEmailIdentifier) {
    const { data: contactProfiles, error: contactError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, full_name, role, is_active, contact_email')
      .eq('contact_email', identifier)
      .limit(2)

    if (contactError || (contactProfiles || []).length > 1) {
      return null
    }

    profile = (contactProfiles?.[0] as LoginProfile | undefined) || null
  }

  if (!profile && isEmailIdentifier) {
    const { data: usersData, error: usersError } =
      await supabaseAdmin.auth.admin.listUsers()

    if (usersError) {
      return null
    }

    const matchedAuthUser = usersData.users.find(
      (user) => user.email?.toLowerCase() === identifier
    )

    if (matchedAuthUser) {
      authEmail = matchedAuthUser.email || null

      const { data: authProfile, error: authProfileError } =
        await supabaseAdmin
          .from('profiles')
          .select('id, username, full_name, role, is_active, contact_email')
          .eq('id', matchedAuthUser.id)
          .maybeSingle()

      if (authProfileError) {
        return null
      }

      profile = (authProfile as LoginProfile | null) || null
    }
  }

  if (profile && !authEmail) {
    const { data: authUserData, error: authUserError } =
      await supabaseAdmin.auth.admin.getUserById(profile.id)

    if (!authUserError && authUserData.user?.email) {
      authEmail = authUserData.user.email
    }
  }

  const loginEmail =
    authEmail?.trim() ||
    profile?.contact_email?.trim() ||
    (profile?.username ? usernameToInternalEmail(profile.username) : null)

  if (!profile || !loginEmail) {
    return null
  }

  return {
    profile,
    loginEmail,
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as LoginBody
    const identifier = normalizeUsername(body.username || '')
    const password = typeof body.password === 'string' ? body.password : ''

    if (!identifier || !password.trim()) {
      return loginError()
    }

    const resolvedLogin = await resolveLoginProfile(identifier)

    if (!resolvedLogin) {
      return loginError()
    }

    if (resolvedLogin.profile.is_active === false) {
      return jsonResponse(
        {
          success: false,
          error: 'هذا الحساب معطل، راجع الأدمن',
        },
        403
      )
    }

    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: resolvedLogin.loginEmail,
      password,
    })

    if (error || !data.user) {
      return loginError()
    }

    const role = resolvedLogin.profile.role
    const redirectPath = role === 'admin' ? '/admin/dashboard' : '/pos'

    return jsonResponse({
      success: true,
      role,
      firstName: getFirstName(
        resolvedLogin.profile.full_name,
        resolvedLogin.profile.username || identifier
      ),
      session:
        data.session?.access_token && data.session?.refresh_token
          ? {
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
            }
          : null,
      redirectPath,
    })
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: 'تعذر تسجيل الدخول',
        ...safeErrorDetails(error, 'تعذر تسجيل الدخول'),
      },
      500
    )
  }
}

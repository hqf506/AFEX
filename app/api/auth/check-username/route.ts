import { jsonResponse } from '@/lib/api/responses'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { normalizeUsername, usernameToInternalEmail } from '@/lib/usernames'
import { hasTrimmedString } from '@/lib/api/validation'

type Body = {
  username?: string
}

type ProfileLookupResult = {
  id: string
  username: string | null
  is_active: boolean | null
  contact_email: string | null
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body
    const identifier = normalizeUsername(body.username || '')
    const isEmailIdentifier = identifier.includes('@')

    if (!hasTrimmedString(identifier)) {
      return jsonResponse(
        { error: 'اسم المستخدم مطلوب' }, 400)
    }

    let profile: ProfileLookupResult | null = null
    let authEmail: string | null = null

    const { data: usernameProfile, error: usernameError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, is_active, contact_email')
      .eq('username', identifier)
      .maybeSingle()

    if (usernameError) {
      return jsonResponse(
        {
          error: 'تعذر التحقق من اسم المستخدم',
          details: usernameError.message,
        }, 500)
    }

    profile = usernameProfile

    if (!profile && isEmailIdentifier) {
      const { data: contactProfile, error: contactError } = await supabaseAdmin
        .from('profiles')
        .select('id, username, is_active, contact_email')
        .eq('contact_email', identifier)
        .maybeSingle()

      if (contactError) {
        return jsonResponse(
          {
            error: 'تعذر التحقق من البريد المرتبط',
            details: contactError.message,
          },
          500
        )
      }

      profile = contactProfile
    }

    if (!profile && isEmailIdentifier) {
      const { data: usersData, error: usersError } =
        await supabaseAdmin.auth.admin.listUsers()

      if (usersError) {
        return jsonResponse(
          {
            error: 'تعذر التحقق من بريد تسجيل الدخول',
            details: usersError.message,
          },
          500
        )
      }

      const matchedAuthUser = usersData.users.find(
        (user) => user.email?.toLowerCase() === identifier
      )

      if (matchedAuthUser) {
        authEmail = matchedAuthUser.email || null

        const { data: authProfile, error: authProfileError } =
          await supabaseAdmin
            .from('profiles')
            .select('id, username, is_active, contact_email')
            .eq('id', matchedAuthUser.id)
            .maybeSingle()

        if (authProfileError) {
          return jsonResponse(
            {
              error: 'تعذر التحقق من ملف المستخدم',
              details: authProfileError.message,
            },
            500
          )
        }

        profile = authProfile
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

    return jsonResponse({
      exists: !!profile,
      login_email: loginEmail,
      user: profile || null,
    })
  } catch (error) {
    return jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, 500)
  }
}

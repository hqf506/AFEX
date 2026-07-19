import { NextRequest, NextResponse } from 'next/server'
import {
  establishRecoveryContext,
  hasValidRecoveryCallbackStateSignature,
  isValidRecoveryCallbackState,
} from '@/lib/auth/recovery'
import { resolveTrustedAppBaseUrl } from '@/lib/email/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const RECOVERY_DESTINATION = '/reset-password'
const CALLBACK_ERROR_DESTINATION = '/login?recovery=invalid'

function validatedNext(value: string | null) {
  return value === null || value === RECOVERY_DESTINATION
    ? RECOVERY_DESTINATION
    : null
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const next = validatedNext(request.nextUrl.searchParams.get('next'))
  let baseUrl: string
  try {
    baseUrl = resolveTrustedAppBaseUrl()
  } catch {
    return NextResponse.json(
      { error: 'تعذر إكمال استرداد كلمة المرور بأمان.' },
      { status: 400 }
    )
  }

  if (!code || !state || !next || !hasValidRecoveryCallbackStateSignature(state)) {
    return NextResponse.redirect(new URL(CALLBACK_ERROR_DESTINATION, baseUrl))
  }

  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (
      error ||
      !data.user?.email ||
      !isValidRecoveryCallbackState(state, data.user.email)
    ) {
      if (data.session) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
      }
      return NextResponse.redirect(new URL(CALLBACK_ERROR_DESTINATION, baseUrl))
    }

    await establishRecoveryContext(data.user.id)
    return NextResponse.redirect(new URL(next, baseUrl))
  } catch {
    return NextResponse.redirect(new URL(CALLBACK_ERROR_DESTINATION, baseUrl))
  }
}

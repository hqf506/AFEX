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

type RecoveryCallbackFailureCategory =
  | 'RECOVERY_STATE_INVALID'
  | 'PKCE_EXCHANGE_FAILED'
  | 'RECOVERY_USER_MISMATCH'
  | 'RECOVERY_CONTEXT_FAILED'
  | 'RECOVERY_CALLBACK_HOST_MISMATCH'

function logRecoveryCallbackFailure(category: RecoveryCallbackFailureCategory) {
  console.warn('[auth-recovery-callback]', category)
}

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

  if (request.nextUrl.origin !== baseUrl) {
    logRecoveryCallbackFailure('RECOVERY_CALLBACK_HOST_MISMATCH')
  }

  if (!code || !state || !next || !hasValidRecoveryCallbackStateSignature(state)) {
    logRecoveryCallbackFailure('RECOVERY_STATE_INVALID')
    return NextResponse.redirect(new URL(CALLBACK_ERROR_DESTINATION, baseUrl))
  }

  const supabase = await createSupabaseServerClient()
  let exchangedUserId: string | null = null

  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      logRecoveryCallbackFailure('PKCE_EXCHANGE_FAILED')
      return NextResponse.redirect(new URL(CALLBACK_ERROR_DESTINATION, baseUrl))
    }

    if (!data.user?.email || !isValidRecoveryCallbackState(state, data.user.email)) {
      logRecoveryCallbackFailure('RECOVERY_USER_MISMATCH')
      if (data.session) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
      }
      return NextResponse.redirect(new URL(CALLBACK_ERROR_DESTINATION, baseUrl))
    }

    exchangedUserId = data.user.id
  } catch {
    logRecoveryCallbackFailure('PKCE_EXCHANGE_FAILED')
    return NextResponse.redirect(new URL(CALLBACK_ERROR_DESTINATION, baseUrl))
  }

  try {
    await establishRecoveryContext(exchangedUserId)
  } catch {
    logRecoveryCallbackFailure('RECOVERY_CONTEXT_FAILED')
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    return NextResponse.redirect(new URL(CALLBACK_ERROR_DESTINATION, baseUrl))
  }

  return NextResponse.redirect(new URL(next, baseUrl))
}

import { NextRequest, NextResponse } from 'next/server'
import {
  type RecoveryConfirmationFailureCategory,
  validateRecoveryConfirmationUrl,
} from '@/lib/auth/recovery-confirmation'
import {
  establishRecoveryContext,
  hasValidRecoveryCallbackStateSignature,
  isValidRecoveryCallbackState,
} from '@/lib/auth/recovery'
import { resolveTrustedAppBaseUrl } from '@/lib/email/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const INVALID_RECOVERY_DESTINATION = '/login?recovery=invalid'
const RECOVERY_DESTINATION = '/reset-password'

type RecoveryContinuationFailureCategory =
  | RecoveryConfirmationFailureCategory
  | 'RECOVERY_STATE_INVALID'
  | 'RECOVERY_TOKEN_VERIFICATION_FAILED'
  | 'RECOVERY_USER_MISMATCH'
  | 'RECOVERY_CONTEXT_FAILED'

function logRecoveryContinuationFailure(
  category: RecoveryContinuationFailureCategory
) {
  console.warn('[auth-recovery-continue]', category)
}

function invalidRecoveryResponse(baseUrl: string) {
  return NextResponse.redirect(
    new URL(INVALID_RECOVERY_DESTINATION, baseUrl),
    303
  )
}

export async function POST(request: NextRequest) {
  let baseUrl: string
  try {
    baseUrl = resolveTrustedAppBaseUrl()
  } catch {
    logRecoveryContinuationFailure('RECOVERY_REDIRECT_INVALID')
    return NextResponse.json(
      { error: 'تعذر إكمال استرداد كلمة المرور بأمان.' },
      { status: 400 }
    )
  }

  const formData = await request.formData().catch(() => null)
  const confirmation = validateRecoveryConfirmationUrl(
    formData?.get('confirmation')
  )

  if (!confirmation.ok) {
    logRecoveryContinuationFailure(confirmation.category)
    return invalidRecoveryResponse(baseUrl)
  }

  if (!hasValidRecoveryCallbackStateSignature(confirmation.state)) {
    logRecoveryContinuationFailure('RECOVERY_STATE_INVALID')
    return invalidRecoveryResponse(baseUrl)
  }

  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: confirmation.tokenHash,
      type: 'recovery',
    })

    if (error || !data.user?.email) {
      logRecoveryContinuationFailure('RECOVERY_TOKEN_VERIFICATION_FAILED')
      return invalidRecoveryResponse(baseUrl)
    }

    if (!isValidRecoveryCallbackState(confirmation.state, data.user.email)) {
      logRecoveryContinuationFailure('RECOVERY_USER_MISMATCH')
      if (data.session) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
      }
      return invalidRecoveryResponse(baseUrl)
    }

    try {
      await establishRecoveryContext(data.user.id)
    } catch {
      logRecoveryContinuationFailure('RECOVERY_CONTEXT_FAILED')
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
      return invalidRecoveryResponse(baseUrl)
    }
  } catch {
    logRecoveryContinuationFailure('RECOVERY_TOKEN_VERIFICATION_FAILED')
    return invalidRecoveryResponse(baseUrl)
  }

  return NextResponse.redirect(new URL(RECOVERY_DESTINATION, baseUrl), 303)
}

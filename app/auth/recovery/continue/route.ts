import { NextRequest, NextResponse } from 'next/server'
import { validateRecoveryConfirmationUrl } from '@/lib/auth/recovery-confirmation'
import { resolveTrustedAppBaseUrl } from '@/lib/email/server'

const INVALID_RECOVERY_DESTINATION = '/login?recovery=invalid'

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null)
  const confirmationUrl = validateRecoveryConfirmationUrl(
    formData?.get('confirmation')
  )

  if (!confirmationUrl) {
    return NextResponse.redirect(
      new URL(INVALID_RECOVERY_DESTINATION, resolveTrustedAppBaseUrl()),
      303
    )
  }

  return NextResponse.redirect(confirmationUrl, 303)
}

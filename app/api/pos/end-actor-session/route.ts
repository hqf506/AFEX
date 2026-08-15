import { NextRequest, NextResponse } from 'next/server'
import {
  POS_ACTOR_COOKIE,
  POS_REAUTH_COOKIE,
  posActorCookieOptions,
  revokePosActorSession,
} from '@/lib/pos-actor-session-server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireVerifiedAuthContext } from '@/lib/verified-auth-context'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const verifiedAuth = await requireVerifiedAuthContext(supabase)
  if (!verifiedAuth) {
    return NextResponse.json({ error: 'Invalid authenticated session authority' }, { status: 401 })
  }
  await revokePosActorSession(
    request.cookies.get(POS_ACTOR_COOKIE)?.value,
    verifiedAuth,
    'ADMIN_REAUTH'
  )

  const response = NextResponse.json({ success: true, reauthenticationRequired: true })
  response.cookies.set(POS_ACTOR_COOKIE, '', posActorCookieOptions(0))
  response.cookies.set(POS_REAUTH_COOKIE, '1', posActorCookieOptions(15 * 60))
  return response
}

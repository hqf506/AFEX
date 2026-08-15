import 'server-only'

import type { SupabaseClient, User } from '@supabase/supabase-js'

const verifiedAuthContextBrand: unique symbol = Symbol('VerifiedAuthContext')

export type VerifiedAuthContext = Readonly<{
  subjectId: string
  sessionId: string
  user: User
  [verifiedAuthContextBrand]: true
}>

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function requireVerifiedAuthContext(
  supabase: SupabaseClient
): Promise<VerifiedAuthContext | null> {
  // getSession is transport-only here: no claim is trusted until the exact
  // access token passes both signature verification and the current-user check.
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (sessionError || !accessToken) return null

  const [{ data: claimsData, error: claimsError }, { data: userData, error: userError }] =
    await Promise.all([
      supabase.auth.getClaims(accessToken),
      supabase.auth.getUser(accessToken),
    ])

  const subjectId = claimsData?.claims?.sub
  const sessionId = claimsData?.claims?.session_id
  const user = userData.user
  if (claimsError || userError || !user || !isUuid(subjectId) ||
      !isUuid(sessionId) || user.id !== subjectId) {
    return null
  }

  return Object.freeze({
    subjectId,
    sessionId,
    user,
    [verifiedAuthContextBrand]: true as const,
  })
}

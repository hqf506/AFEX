import 'server-only'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireVerifiedAuthContext } from '@/lib/verified-auth-context'
import {
  isPosActorRestrictionRequired,
  POS_ACTOR_COOKIE,
  resolvePosActorSession,
} from '@/lib/pos-actor-session-server'

export const DEVELOPER_ROLES = ['provider_owner'] as const

export async function requireDeveloperAccess() {
  const supabase = await createSupabaseServerClient()
  const verifiedAuth = await requireVerifiedAuthContext(supabase)
  if (!verifiedAuth) return { ok: false as const, status: 401 }
  const token = (await cookies()).get(POS_ACTOR_COOKIE)?.value
  const actor = token ? await resolvePosActorSession(token, verifiedAuth) : null
  const restrictionRequired = !token
    ? await isPosActorRestrictionRequired(verifiedAuth)
    : false
  if (restrictionRequired || token || actor) {
    return { ok: false as const, status: 403 }
  }
  const user = verifiedAuth.user
  const { data: admin } = await supabaseAdmin.from('platform_admins').select('role').eq('user_id', user.id).eq('is_active', true).in('role', [...DEVELOPER_ROLES]).maybeSingle()
  if (!admin) return { ok: false as const, status: 403 }
  return { ok: true as const, user, role: admin.role }
}

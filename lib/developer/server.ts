import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const DEVELOPER_ROLES = ['provider_owner'] as const

export async function requireDeveloperAccess() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401 }
  const { data: admin } = await supabaseAdmin.from('platform_admins').select('role').eq('user_id', user.id).eq('is_active', true).in('role', [...DEVELOPER_ROLES]).maybeSingle()
  if (!admin) return { ok: false as const, status: 403 }
  return { ok: true as const, user, role: admin.role }
}

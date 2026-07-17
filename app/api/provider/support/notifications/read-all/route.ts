import { NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireSupportAuth } from '@/lib/support/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
export async function POST(request: NextRequest) {
  const auth = await requireSupportAuth(request)
  if (!auth.ok) return auth.response
  if (!auth.isProvider || auth.providerRole !== 'provider_owner') return jsonWithAuthCookies(auth.response, { success: false, error: 'غير مصرح بهذا الإجراء.' }, 403)
  const { data, error } = await supabaseAdmin.rpc('mark_all_developer_support_notifications_read', { p_provider_user_id: auth.user.id })
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر تحديث الإشعارات.' }, 500)
  const result = data as Record<string, unknown>
  return jsonWithAuthCookies(auth.response, { success: true, insertedCount: typeof result.inserted_count === 'number' ? result.inserted_count : 0, through: typeof result.through === 'string' ? result.through : new Date().toISOString() })
}

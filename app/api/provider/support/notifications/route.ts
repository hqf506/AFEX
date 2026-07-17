import { NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireSupportAuth } from '@/lib/support/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const auth = await requireSupportAuth(request)
  if (!auth.ok) return auth.response
  if (!auth.isProvider || auth.providerRole !== 'provider_owner') return jsonWithAuthCookies(auth.response, { success: false, error: 'غير مصرح بعرض إشعارات الدعم.' }, 403)
  const { data, error } = await supabaseAdmin.rpc('get_developer_support_notifications', { p_provider_user_id: auth.user.id, p_limit: 20 })
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر تحميل إشعارات الدعم.' }, 500)
  const result = data as Record<string, unknown>
  return jsonWithAuthCookies(auth.response, { success: true, items: Array.isArray(result.items) ? result.items : [], unreadCount: typeof result.unread_count === 'number' ? result.unread_count : 0, calculatedAt: typeof result.calculated_at === 'string' ? result.calculated_at : new Date().toISOString() })
}

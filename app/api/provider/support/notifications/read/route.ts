import { NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { DEVELOPER_NOTIFICATION_EVENT_TYPES } from '@/lib/support/contracts'
import { isOneOf, requireSupportAuth } from '@/lib/support/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export async function POST(request: NextRequest) {
  const auth = await requireSupportAuth(request)
  if (!auth.ok) return auth.response
  if (!auth.isProvider || auth.providerRole !== 'provider_owner') return jsonWithAuthCookies(auth.response, { success: false, error: 'غير مصرح بهذا الإجراء.' }, 403)
  const body = await request.json().catch(() => null) as { eventType?: unknown; eventId?: unknown } | null
  if (!isOneOf(body?.eventType, DEVELOPER_NOTIFICATION_EVENT_TYPES) || typeof body?.eventId !== 'string' || !UUID.test(body.eventId)) return jsonWithAuthCookies(auth.response, { success: false, error: 'بيانات الإشعار غير صالحة.' }, 400)
  const { error } = await supabaseAdmin.rpc('mark_developer_support_notification_read', { p_provider_user_id: auth.user.id, p_event_type: body.eventType, p_event_id: body.eventId })
  if (error) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر تحديث الإشعار.' }, 500)
  return jsonWithAuthCookies(auth.response, { success: true })
}

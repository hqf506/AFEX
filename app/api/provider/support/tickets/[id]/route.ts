import { NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { SUPPORT_PRIORITIES, SUPPORT_STATUSES, isOneOf, requireSupportAuth, text } from '@/lib/support/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSupportAuth(request)
  if (!auth.ok) return auth.response
  if (!auth.isProvider) return jsonWithAuthCookies(auth.response, { success: false, error: 'لا تملك صلاحية الوصول إلى هذه التذكرة.' }, 403)
  const { id } = await params
  const body = await request.json().catch(() => null)
  const { data: ticket } = await supabaseAdmin.from('support_tickets').select('status, priority, assigned_to, resolved_at, closed_at').eq('id', id).maybeSingle()
  if (!ticket) return jsonWithAuthCookies(auth.response, { success: false, error: 'التذكرة غير موجودة.' }, 404)

  const changes: Record<string, unknown> = {}
  if (isOneOf(body?.status, SUPPORT_STATUSES)) changes.status = body.status
  if (isOneOf(body?.priority, SUPPORT_PRIORITIES)) changes.priority = body.priority
  if (body && Object.hasOwn(body, 'assigned_to')) changes.assigned_to = text(body.assigned_to, 36) || null
  if (changes.status === 'resolved') changes.resolved_at = new Date().toISOString()
  else if (changes.status && changes.status !== 'closed') changes.resolved_at = null
  if (changes.status === 'closed') changes.closed_at = new Date().toISOString()
  else if (changes.status) changes.closed_at = null
  if (Object.keys(changes).length === 0) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر تحديث تذكرة الدعم.' }, 400)

  const { error } = await supabaseAdmin.from('support_tickets').update(changes).eq('id', id)
  if (error) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر تحديث تذكرة الدعم.' }, 500)
  const events = Object.entries(changes)
    .filter(([field]) => ['status', 'priority', 'assigned_to'].includes(field))
    .map(([field, value]) => ({
      ticket_id: id,
      actor_id: auth.user.id,
      event_type: `${field}_changed`,
      previous_value: { [field]: ticket[field as keyof typeof ticket] },
      new_value: { [field]: value },
    }))
  const { error: eventError } = await supabaseAdmin.from('support_ticket_events').insert(events)
  if (eventError) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر تحديث تذكرة الدعم.' }, 500)
  return jsonWithAuthCookies(auth.response, { success: true })
}

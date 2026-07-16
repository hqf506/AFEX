import { NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireSupportAuth } from '@/lib/support/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSupportAuth(request)
  if (!auth.ok) return auth.response
  const { id } = await params
  let ticketQuery = supabaseAdmin.from('support_tickets').select('id, ticket_number, tenant_id, branch_id, created_by, category, priority, status, title, description, source, page_path, error_reference, error_code, safe_error_message, diagnostic_context, assigned_to, last_message_at, resolved_at, closed_at, created_at, updated_at').eq('id', id)
  if (!auth.isProvider) ticketQuery = ticketQuery.eq('tenant_id', auth.profile.tenant_id || '')
  const { data: ticket, error } = await ticketQuery.maybeSingle()
  if (error) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر تحميل تذاكر الدعم.' }, 500)
  if (!ticket) return jsonWithAuthCookies(auth.response, { success: false, error: 'التذكرة غير موجودة.' }, 404)

  let messagesQuery = supabaseAdmin.from('support_messages').select('id, sender_type, message, is_internal, created_at, updated_at').eq('ticket_id', id).order('created_at')
  if (!auth.isProvider) messagesQuery = messagesQuery.eq('is_internal', false)
  const eventsSelect = auth.isProvider
    ? 'id, event_type, previous_value, new_value, created_at'
    : 'id, event_type, created_at'
  const [messagesResult, eventsResult] = await Promise.all([
    messagesQuery,
    supabaseAdmin.from('support_ticket_events').select(eventsSelect).eq('ticket_id', id).order('created_at'),
  ])
  if (messagesResult.error || eventsResult.error) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر تحميل تذاكر الدعم.' }, 500)
  return jsonWithAuthCookies(auth.response, { success: true, ticket, messages: messagesResult.data || [], events: eventsResult.data || [] })
}

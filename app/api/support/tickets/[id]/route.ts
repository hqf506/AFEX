import { NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireSupportAuth } from '@/lib/support/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSupportAuth(request)
  if (!auth.ok) return auth.response
  const { id } = await params
  let ticketQuery = supabaseAdmin.from('support_tickets').select('ticket_number, tenant_id, branch_id, category, priority, status, title, description, source, last_message_at, resolved_at, closed_at, created_at, updated_at').eq('id', id)
  if (!auth.isProvider) ticketQuery = ticketQuery.eq('tenant_id', auth.profile.tenant_id || '')
  const { data: ticket, error } = await ticketQuery.maybeSingle()
  if (error) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر تحميل تذاكر الدعم.' }, 500)
  if (!ticket) return jsonWithAuthCookies(auth.response, { success: false, error: 'التذكرة غير موجودة.' }, 404)

  let messagesQuery = supabaseAdmin.from('support_messages').select('sender_type, message, created_at').eq('ticket_id', id).order('created_at')
  if (!auth.isProvider) messagesQuery = messagesQuery.eq('is_internal', false)
  const eventsSelect = auth.isProvider
    ? 'event_type, previous_value, new_value, created_at'
    : 'event_type, created_at'
  let eventsQuery = supabaseAdmin
    .from('support_ticket_events')
    .select(eventsSelect)
    .eq('ticket_id', id)
    .order('created_at')
  if (!auth.isProvider) {
    eventsQuery = eventsQuery.not(
      'event_type',
      'in',
      '(assigned_to_changed,internal_note_added)'
    )
  }
  const [messagesResult, eventsResult, attachmentsResult] = await Promise.all([
    messagesQuery,
    eventsQuery,
    supabaseAdmin.from('support_attachments').select('id, original_filename, mime_type, size_bytes, created_at').eq('ticket_id', id).eq('is_internal', false).order('created_at'),
  ])
  if (messagesResult.error || eventsResult.error || attachmentsResult.error) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر تحميل تذاكر الدعم.' }, 500)
  const { tenant_id: _tenantId, branch_id: branchId, ...safeTicket } = ticket
  void _tenantId
  return jsonWithAuthCookies(auth.response, {
    success: true,
    ticket: { ...safeTicket, has_branch: Boolean(branchId) },
    messages: messagesResult.data || [],
    events: eventsResult.data || [],
    attachments: attachmentsResult.data || [],
  })
}

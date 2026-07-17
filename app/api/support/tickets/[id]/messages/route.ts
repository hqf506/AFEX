import { after, NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireSupportAuth, text } from '@/lib/support/server'
import { sendSupportEmailNotification } from '@/lib/support/email'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSupportAuth(request)
  if (!auth.ok) return auth.response
  const { id } = await params
  const body = await request.json().catch(() => null)
  const message = text(body?.message, 5000)
  const isInternal = auth.isProvider && body?.is_internal === true
  if (!message) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر إرسال الرسالة.' }, 400)

  let ticketQuery = supabaseAdmin.from('support_tickets').select('id, tenant_id, status').eq('id', id)
  if (!auth.isProvider) ticketQuery = ticketQuery.eq('tenant_id', auth.profile.tenant_id || '')
  const { data: ticket } = await ticketQuery.maybeSingle()
  if (!ticket) return jsonWithAuthCookies(auth.response, { success: false, error: 'لا تملك صلاحية الوصول إلى هذه التذكرة.' }, 403)

  const nextStatus = auth.isProvider
    ? (isInternal ? ticket.status : 'waiting_customer')
    : (ticket.status === 'waiting_customer' ? 'investigating' : ticket.status)
  const { data: savedMessage, error: messageError } = await supabaseAdmin.from('support_messages').insert({
    ticket_id: id,
    sender_id: auth.user.id,
    sender_type: auth.isProvider ? 'provider' : 'customer',
    message,
    is_internal: isInternal,
  }).select('id').single()
  if (messageError || !savedMessage) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر إرسال الرسالة.' }, 500)
  const { error: updateError } = await supabaseAdmin.from('support_tickets').update({
    last_message_at: new Date().toISOString(),
    status: nextStatus,
  }).eq('id', id)
  if (updateError) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر إرسال الرسالة.' }, 500)
  await supabaseAdmin.from('support_ticket_events').insert({
    ticket_id: id,
    actor_id: auth.user.id,
    event_type: isInternal ? 'internal_note_added' : 'message_added',
    previous_value: { status: ticket.status },
    new_value: { status: nextStatus },
  })
  if (!auth.isProvider && ticket.status !== 'closed') {
    after(() => sendSupportEmailNotification({ eventType: 'customer_reply', ticketId: id, sourceId: savedMessage.id }))
  }
  return jsonWithAuthCookies(auth.response, { success: true, message_id: savedMessage.id })
}

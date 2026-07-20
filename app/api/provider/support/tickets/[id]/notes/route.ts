import { NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireSupportAuth, text } from '@/lib/support/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSupportAuth(request)
  if (!auth.ok) return auth.response
  if (!auth.isProvider) return jsonWithAuthCookies(auth.response, { success: false, error: 'لا تملك صلاحية إضافة ملاحظة داخلية.' }, 403)
  const { id } = await params
  const body = await request.json().catch(() => null)
  const note = text(body?.note, 5000)
  if (!note) return jsonWithAuthCookies(auth.response, { success: false, error: 'نص الملاحظة الداخلية مطلوب.' }, 400)

  const { data: ticket, error: ticketError } = await supabaseAdmin.from('support_tickets').select('id').eq('id', id).maybeSingle()
  if (ticketError) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر إضافة الملاحظة الداخلية.' }, 500)
  if (!ticket) return jsonWithAuthCookies(auth.response, { success: false, error: 'التذكرة غير موجودة.' }, 404)

  const { data: savedNote, error } = await supabaseAdmin.from('support_messages').insert({
    ticket_id: id,
    sender_id: auth.user.id,
    sender_type: 'provider',
    message: note,
    is_internal: true,
  }).select('id').single()
  if (error || !savedNote) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر إضافة الملاحظة الداخلية.' }, 500)
  const { error: eventError } = await supabaseAdmin.from('support_ticket_events').insert({
    ticket_id: id,
    actor_id: auth.user.id,
    event_type: 'internal_note_added',
  })
  if (eventError) {
    await supabaseAdmin.from('support_messages').delete().eq('id', savedNote.id)
    return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر إضافة الملاحظة الداخلية.' }, 500)
  }
  return jsonWithAuthCookies(auth.response, { success: true })
}

import { NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireSupportAuth } from '@/lib/support/server'
import { sanitizeSupportFilename, SUPPORT_ATTACHMENT_BUCKET, SUPPORT_ATTACHMENT_MAX_COUNT, supportAttachmentPath, validateSupportAttachment } from '@/lib/support/attachments'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSupportAuth(request)
  if (!auth.ok) return auth.response
  const { id } = await params
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!uuidPattern.test(id)) return jsonWithAuthCookies(auth.response, { success: false, error: 'معرف التذكرة غير صالح.' }, 400)
  const form = await request.formData().catch(() => null)
  if (!form) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر قراءة المرفقات.' }, 400)
  const files = form.getAll('files').filter((value): value is File => value instanceof File)
  const messageId = typeof form.get('message_id') === 'string' ? String(form.get('message_id')) : null
  const context = form.get('context') === 'ticket_creation' ? 'ticket_creation' : 'message'
  if (files.length < 1 || files.length > SUPPORT_ATTACHMENT_MAX_COUNT) return jsonWithAuthCookies(auth.response, { success: false, error: 'يمكن إرفاق خمسة ملفات كحد أقصى.' }, 400)
  if (messageId && !uuidPattern.test(messageId)) return jsonWithAuthCookies(auth.response, { success: false, error: 'معرف الرسالة غير صالح.' }, 400)

  let ticketQuery = supabaseAdmin.from('support_tickets').select('id, tenant_id, created_by, status, created_at').eq('id', id)
  if (!auth.isProvider) ticketQuery = ticketQuery.eq('tenant_id', auth.profile.tenant_id || '')
  const { data: ticket } = await ticketQuery.maybeSingle()
  if (!ticket) return jsonWithAuthCookies(auth.response, { success: false, error: 'لا تملك صلاحية إرفاق ملفات بهذه التذكرة.' }, 403)
  if (ticket.status === 'closed') return jsonWithAuthCookies(auth.response, { success: false, error: 'لا يمكن إرفاق ملفات بتذكرة مغلقة.' }, 400)

  let linkedMessageId = messageId
  if (context === 'message') {
    if (!messageId) return jsonWithAuthCookies(auth.response, { success: false, error: 'الرسالة المرتبطة بالمرفق غير صالحة.' }, 400)
    const { data: message } = await supabaseAdmin.from('support_messages').select('id').eq('id', messageId).eq('ticket_id', id).eq('sender_id', auth.user.id).eq('is_internal', false).maybeSingle()
    if (!message) return jsonWithAuthCookies(auth.response, { success: false, error: 'الرسالة المرتبطة بالمرفق غير صالحة.' }, 403)
  } else {
    const ageMs = Date.now() - new Date(ticket.created_at).getTime()
    const { data: initialMessages } = await supabaseAdmin.from('support_messages').select('id').eq('ticket_id', id).eq('is_internal', false).order('created_at').limit(2)
    if (auth.isProvider || ticket.created_by !== auth.user.id || ageMs > 10 * 60 * 1000 || initialMessages?.length !== 1) {
      return jsonWithAuthCookies(auth.response, { success: false, error: 'انتهت صلاحية إرفاق ملفات الإنشاء.' }, 403)
    }
    linkedMessageId = initialMessages[0].id
  }

  const validated = [] as Array<{ file: File; mime: Awaited<ReturnType<typeof validateSupportAttachment>> }>
  for (const file of files) {
    const mime = await validateSupportAttachment(file)
    if (!mime) return jsonWithAuthCookies(auth.response, { success: false, error: 'نوع الملف أو محتواه أو حجمه غير مسموح.' }, 400)
    validated.push({ file, mime })
  }

  const uploadedPaths: string[] = []
  try {
    const rows = []
    for (const { file, mime } of validated) {
      if (!mime) throw new Error('Invalid attachment MIME')
      const path = supportAttachmentPath(ticket.tenant_id, id, mime)
      const { error } = await supabaseAdmin.storage.from(SUPPORT_ATTACHMENT_BUCKET).upload(path, file, { contentType: mime, upsert: false })
      if (error) throw error
      uploadedPaths.push(path)
      rows.push({ ticket_id: id, message_id: linkedMessageId, tenant_id: ticket.tenant_id, uploaded_by_user_id: auth.user.id, uploader_type: auth.isProvider ? 'provider' : 'customer', storage_bucket: SUPPORT_ATTACHMENT_BUCKET, storage_path: path, original_filename: sanitizeSupportFilename(file.name), mime_type: mime, size_bytes: file.size, is_internal: false })
    }
    const { data, error } = await supabaseAdmin.from('support_attachments').insert(rows).select('id, original_filename, mime_type, size_bytes, created_at')
    if (error) throw error
    return jsonWithAuthCookies(auth.response, { success: true, attachments: data || [] }, 201)
  } catch {
    if (uploadedPaths.length) await supabaseAdmin.storage.from(SUPPORT_ATTACHMENT_BUCKET).remove(uploadedPaths)
    return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر حفظ المرفقات بأمان.' }, 500)
  }
}

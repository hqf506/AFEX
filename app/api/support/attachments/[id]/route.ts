import { NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireSupportAuth } from '@/lib/support/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSupportAuth(request)
  if (!auth.ok) return auth.response
  const { id } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return jsonWithAuthCookies(auth.response, { success: false, error: 'معرف المرفق غير صالح.' }, 400)
  }
  const { data: attachment } = await supabaseAdmin.from('support_attachments').select('ticket_id, tenant_id, storage_bucket, storage_path, original_filename, mime_type, is_internal').eq('id', id).maybeSingle()
  if (!attachment || attachment.is_internal || (!auth.isProvider && attachment.tenant_id !== auth.profile.tenant_id)) {
    return jsonWithAuthCookies(auth.response, { success: false, error: 'المرفق غير موجود.' }, 404)
  }
  const { data: ticket } = await supabaseAdmin.from('support_tickets').select('id').eq('id', attachment.ticket_id).maybeSingle()
  if (!ticket) return jsonWithAuthCookies(auth.response, { success: false, error: 'المرفق غير موجود.' }, 404)
  const { data, error } = await supabaseAdmin.storage.from(attachment.storage_bucket).createSignedUrl(attachment.storage_path, 120)
  if (error || !data?.signedUrl) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر فتح المرفق.' }, 500)
  return jsonWithAuthCookies(auth.response, { success: true, url: data.signedUrl, filename: attachment.original_filename, mime_type: attachment.mime_type })
}

import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { safeErrorDetails } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'

type RecipientRecord = {
  send_status: string | null
}

function normalizeId(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function summarizeRecipients(recipients: RecipientRecord[]) {
  return recipients.reduce(
    (summary, recipient) => {
      if (recipient.send_status === 'sent') {
        summary.sent_count += 1
      } else if (recipient.send_status === 'failed') {
        summary.failed_count += 1
      } else if (recipient.send_status === 'skipped') {
        summary.skipped_count += 1
      }

      return summary
    },
    {
      sent_count: 0,
      failed_count: 0,
      skipped_count: 0,
    }
  )
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const params = await context.params
    const announcementId = normalizeId(params.id)
    const tenantId = auth.profile.tenant_id

    if (!announcementId) {
      const response = jsonResponse(
        { success: false, error: 'معرف الإعلان مطلوب' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (!tenantId) {
      const response = jsonResponse(
        { success: false, error: 'تعذر تحديد نطاق المنشأة' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const { data: announcement, error: announcementError } = await supabaseAdmin
      .from('announcements')
      .select(
        'id, tenant_id, branch_id, title, message, announcement_type, discount_code, cta_label, cta_url, image_url, audience_type, status, created_by, sent_at, created_at, updated_at'
      )
      .eq('id', announcementId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (announcementError) {
      const response = jsonResponse(
        {
          success: false,
          error: 'تعذر تحميل تفاصيل الإعلان',
          ...safeErrorDetails(announcementError, 'تعذر تحميل تفاصيل الإعلان'),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    if (!announcement) {
      const response = jsonResponse(
        { success: false, error: 'الإعلان غير موجود' },
        404
      )
      return withAuthCookies(auth.response, response)
    }

    const { data: recipients, error: recipientsError } = await supabaseAdmin
      .from('announcement_recipients')
      .select(
        'id, customer_id, customer_name, phone, send_status, sent_at, error_message, created_at'
      )
      .eq('announcement_id', announcementId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })

    if (recipientsError) {
      const response = jsonResponse(
        {
          success: false,
          error: 'تعذر تحميل مستلمي الإعلان',
          ...safeErrorDetails(recipientsError, 'تعذر تحميل مستلمي الإعلان'),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    const recipientRows = Array.isArray(recipients) ? recipients : []
    const response = jsonResponse({
      success: true,
      announcement,
      recipients: recipientRows,
      summary: summarizeRecipients(recipientRows as RecipientRecord[]),
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        success: false,
        error: 'حدث خطأ غير متوقع',
        ...safeErrorDetails(error, 'حدث خطأ غير متوقع'),
      },
      500
    )
    return withAuthCookies(auth.response, response)
  }
}

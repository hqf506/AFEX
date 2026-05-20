import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { safeErrorDetails } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isSendableWhatsAppPhone } from '@/lib/whatsapp/messages'
import { sendWhatsAppImage, sendWhatsAppText } from '@/lib/whatsapp/service'

type AnnouncementRecord = {
  id: string
  tenant_id: string
  branch_id: string | null
  title: string
  message: string
  discount_code: string | null
  cta_label: string | null
  cta_url: string | null
  image_url: string | null
  audience_type: 'all_customers' | 'branch_customers' | 'manual_customers'
}

type CustomerRecord = {
  id: string
  name: string | null
  phone: string | null
  branch_id: string | null
}

type ManualCustomerRecord = {
  customer_id: string
}

type RecipientPayload = {
  announcement_id: string
  tenant_id: string
  branch_id: string | null
  customer_id: string
  customer_name: string | null
  phone: string
  whatsapp_url: string
  send_status: 'sent' | 'failed' | 'skipped'
  sent_at: string | null
  error_message: string | null
}

const DEFAULT_CTA_LABEL = 'اضغط هنا للوصول للموقع'

function normalizeId(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function buildWhatsAppMessage(announcement: AnnouncementRecord) {
  const ctaUrl = announcement.cta_url?.trim() || ''
  const ctaLabel = announcement.cta_label?.trim() || DEFAULT_CTA_LABEL
  const lines = [
    announcement.title,
    '',
    announcement.message,
    ...(announcement.discount_code
      ? ['', `كود الخصم: ${announcement.discount_code}`]
      : []),
    ...(ctaUrl ? ['', `${ctaLabel}:`, ctaUrl] : []),
  ]

  return lines.join('\n').trim()
}

async function loadManualCustomerIds(announcementId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from('announcement_manual_customers')
    .select('customer_id')
    .eq('announcement_id', announcementId)
    .eq('tenant_id', tenantId)

  if (error) {
    throw error
  }

  return ((data || []) as ManualCustomerRecord[]).map(
    (record) => record.customer_id
  )
}

async function loadCustomersForAnnouncement(
  announcement: AnnouncementRecord,
  tenantId: string
) {
  let customersQuery = supabaseAdmin
    .from('customers')
    .select('id, name, phone, branch_id')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true })

  if (announcement.audience_type === 'branch_customers') {
    if (!announcement.branch_id) {
      throw new Error('الإعلان لا يحتوي على فرع مستهدف')
    }

    customersQuery = customersQuery.eq('branch_id', announcement.branch_id)
  }

  if (announcement.audience_type === 'manual_customers') {
    const manualCustomerIds = await loadManualCustomerIds(
      announcement.id,
      tenantId
    )

    if (manualCustomerIds.length === 0) {
      throw new Error('لا يوجد عملاء محددون لهذا الإعلان')
    }

    customersQuery = customersQuery.in('id', manualCustomerIds)
  }

  const { data, error } = await customersQuery

  if (error) {
    throw error
  }

  return (data || []) as CustomerRecord[]
}

async function saveRecipientResult(recipient: RecipientPayload) {
  const { error } = await supabaseAdmin
    .from('announcement_recipients')
    .upsert(recipient, {
      onConflict: 'announcement_id,customer_id',
    })

  if (error) {
    throw error
  }
}

export async function POST(
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
        'id, tenant_id, branch_id, title, message, discount_code, cta_label, cta_url, image_url, audience_type'
      )
      .eq('id', announcementId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (announcementError) {
      const response = jsonResponse(
        {
          success: false,
          error: 'تعذر تحميل الإعلان',
          ...safeErrorDetails(announcementError, 'تعذر تحميل الإعلان'),
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

    const typedAnnouncement = announcement as AnnouncementRecord
    const customers = await loadCustomersForAnnouncement(
      typedAnnouncement,
      tenantId
    )
    const message = buildWhatsAppMessage(typedAnnouncement)

    let sentCount = 0
    let failedCount = 0
    let skippedCount = 0

    for (const customer of customers) {
      const phone = customer.phone?.trim() || ''
      const branchId = customer.branch_id || typedAnnouncement.branch_id

      if (!phone) {
        skippedCount += 1
        await saveRecipientResult({
          announcement_id: typedAnnouncement.id,
          tenant_id: tenantId,
          branch_id: branchId,
          customer_id: customer.id,
          customer_name: customer.name,
          phone: '',
          whatsapp_url: '',
          send_status: 'skipped',
          sent_at: null,
          error_message: 'لا يوجد رقم جوال',
        })
        continue
      }

      if (!isSendableWhatsAppPhone(phone)) {
        skippedCount += 1
        await saveRecipientResult({
          announcement_id: typedAnnouncement.id,
          tenant_id: tenantId,
          branch_id: branchId,
          customer_id: customer.id,
          customer_name: customer.name,
          phone,
          whatsapp_url: '',
          send_status: 'skipped',
          sent_at: null,
          error_message: 'رقم الجوال غير صالح',
        })
        continue
      }

      if (!branchId) {
        skippedCount += 1
        await saveRecipientResult({
          announcement_id: typedAnnouncement.id,
          tenant_id: tenantId,
          branch_id: null,
          customer_id: customer.id,
          customer_name: customer.name,
          phone,
          whatsapp_url: '',
          send_status: 'skipped',
          sent_at: null,
          error_message: 'لا يوجد فرع مرتبط لإعدادات واتساب',
        })
        continue
      }

      try {
        const result = typedAnnouncement.image_url
          ? await sendWhatsAppImage(
              {
                to: phone,
                branchId,
                tenantId,
                imageUrl: typedAnnouncement.image_url,
                caption: message,
                metadata: {
                  type: 'announcement',
                  announcementId: typedAnnouncement.id,
                  customerId: customer.id,
                },
              },
              {
                mode: 'image',
                messageType: 'image',
              }
            )
          : await sendWhatsAppText(
              {
                to: phone,
                branchId,
                tenantId,
                text: message,
                metadata: {
                  type: 'announcement',
                  announcementId: typedAnnouncement.id,
                  customerId: customer.id,
                },
              },
              {
                mode: 'text',
                messageType: 'text',
              }
            )

        if (!result.success) {
          failedCount += 1
          await saveRecipientResult({
            announcement_id: typedAnnouncement.id,
            tenant_id: tenantId,
            branch_id: branchId,
            customer_id: customer.id,
            customer_name: customer.name,
            phone,
            whatsapp_url: '',
            send_status: 'failed',
            sent_at: null,
            error_message: result.errorMessage || 'تعذر إرسال رسالة واتساب',
          })
          continue
        }

        sentCount += 1
        await saveRecipientResult({
          announcement_id: typedAnnouncement.id,
          tenant_id: tenantId,
          branch_id: branchId,
          customer_id: customer.id,
          customer_name: customer.name,
          phone,
          whatsapp_url: '',
          send_status: 'sent',
          sent_at: new Date().toISOString(),
          error_message: null,
        })
      } catch (error) {
        failedCount += 1
        await saveRecipientResult({
          announcement_id: typedAnnouncement.id,
          tenant_id: tenantId,
          branch_id: branchId,
          customer_id: customer.id,
          customer_name: customer.name,
          phone,
          whatsapp_url: '',
          send_status: 'failed',
          sent_at: null,
          error_message:
            error instanceof Error ? error.message : 'تعذر إرسال رسالة واتساب',
        })
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('announcements')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .eq('id', typedAnnouncement.id)
      .eq('tenant_id', tenantId)

    if (updateError) {
      const response = jsonResponse(
        {
          success: false,
          error: 'تم الإرسال لكن تعذر تحديث حالة الإعلان',
          ...safeErrorDetails(updateError, 'تعذر تحديث حالة الإعلان'),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    const response = jsonResponse({
      success: true,
      sent_count: sentCount,
      failed_count: failedCount,
      skipped_count: skippedCount,
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع',
        ...safeErrorDetails(error, 'حدث خطأ غير متوقع'),
      },
      500
    )
    return withAuthCookies(auth.response, response)
  }
}

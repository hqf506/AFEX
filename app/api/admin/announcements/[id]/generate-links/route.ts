import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { safeErrorDetails } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isSendableWhatsAppPhone } from '@/lib/whatsapp/messages'

type AnnouncementRecord = {
  id: string
  tenant_id: string
  branch_id: string | null
  title: string
  message: string
  discount_code: string | null
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

function normalizeId(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeWhatsAppPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')

  if (digits.startsWith('00')) {
    return digits.slice(2)
  }

  if (digits.startsWith('0') && digits.length === 10) {
    return `966${digits.slice(1)}`
  }

  return digits
}

function buildWhatsAppMessage(announcement: AnnouncementRecord) {
  const lines = [
    announcement.title,
    '',
    announcement.message,
    ...(announcement.discount_code
      ? ['', `كود الخصم: ${announcement.discount_code}`]
      : []),
  ]

  return lines.join('\n').trim()
}

function buildWhatsAppUrl(phone: string, message: string) {
  return `https://wa.me/${normalizeWhatsAppPhone(phone)}?text=${encodeURIComponent(
    message
  )}`
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
        'id, tenant_id, branch_id, title, message, discount_code, audience_type'
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
    let customersQuery = supabaseAdmin
      .from('customers')
      .select('id, name, phone, branch_id')
      .eq('tenant_id', tenantId)
      .not('phone', 'is', null)
      .order('name', { ascending: true })

    if (typedAnnouncement.audience_type === 'branch_customers') {
      if (!typedAnnouncement.branch_id) {
        const response = jsonResponse(
          { success: false, error: 'الإعلان لا يحتوي على فرع مستهدف' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      customersQuery = customersQuery.eq('branch_id', typedAnnouncement.branch_id)
    }

    if (typedAnnouncement.audience_type === 'manual_customers') {
      const manualCustomerIds = await loadManualCustomerIds(
        typedAnnouncement.id,
        tenantId
      )

      if (manualCustomerIds.length === 0) {
        const response = jsonResponse(
          {
            success: false,
            error: 'لا يوجد عملاء محددون لهذا الإعلان',
          },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      customersQuery = customersQuery.in('id', manualCustomerIds)
    }

    const { data: customers, error: customersError } = await customersQuery

    if (customersError) {
      const response = jsonResponse(
        {
          success: false,
          error: 'تعذر تحميل العملاء',
          ...safeErrorDetails(customersError, 'تعذر تحميل العملاء'),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    const message = buildWhatsAppMessage(typedAnnouncement)
    const recipients = ((customers || []) as CustomerRecord[])
      .filter((customer) => customer.phone && isSendableWhatsAppPhone(customer.phone))
      .map((customer) => ({
        announcement_id: typedAnnouncement.id,
        tenant_id: tenantId,
        branch_id: customer.branch_id,
        customer_id: customer.id,
        customer_name: customer.name,
        phone: customer.phone || '',
        whatsapp_url: buildWhatsAppUrl(customer.phone || '', message),
        send_status: 'link_generated',
      }))

    const { error: deleteError } = await supabaseAdmin
      .from('announcement_recipients')
      .delete()
      .eq('announcement_id', typedAnnouncement.id)
      .eq('tenant_id', tenantId)

    if (deleteError) {
      const response = jsonResponse(
        {
          success: false,
          error: 'تعذر تحديث روابط المستلمين',
          ...safeErrorDetails(deleteError, 'تعذر تحديث روابط المستلمين'),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    if (recipients.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('announcement_recipients')
        .insert(recipients)

      if (insertError) {
        const response = jsonResponse(
          {
            success: false,
            error: 'تعذر حفظ روابط واتساب',
            ...safeErrorDetails(insertError, 'تعذر حفظ روابط واتساب'),
          },
          500
        )
        return withAuthCookies(auth.response, response)
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('announcements')
      .update({ status: 'ready' })
      .eq('id', typedAnnouncement.id)
      .eq('tenant_id', tenantId)

    if (updateError) {
      const response = jsonResponse(
        {
          success: false,
          error: 'تم توليد الروابط لكن تعذر تحديث حالة الإعلان',
          ...safeErrorDetails(updateError, 'تعذر تحديث حالة الإعلان'),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    const response = jsonResponse({
      success: true,
      recipient_count: recipients.length,
      skipped_count: ((customers || []) as CustomerRecord[]).length - recipients.length,
      recipients,
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

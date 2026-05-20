import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { safeErrorDetails } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'

const ANNOUNCEMENT_TYPES = [
  'discount',
  'seasonal_offer',
  'discount_code',
  'general_alert',
  'marketing_campaign',
] as const

const AUDIENCE_TYPES = [
  'all_customers',
  'branch_customers',
  'manual_customers',
] as const

type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number]
type AudienceType = (typeof AUDIENCE_TYPES)[number]

type CreateAnnouncementBody = {
  title?: unknown
  message?: unknown
  announcement_type?: unknown
  discount_code?: unknown
  cta_label?: unknown
  cta_url?: unknown
  audience_type?: unknown
  branch_id?: unknown
  selected_customer_ids?: unknown
}

const DEFAULT_CTA_LABEL = 'اضغط هنا للوصول للموقع'
const ANNOUNCEMENT_IMAGE_BUCKET = 'announcement-images'
const MAX_ANNOUNCEMENT_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_ANNOUNCEMENT_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
]

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableText(value: unknown) {
  const normalized = normalizeText(value)
  return normalized || null
}

function isValidOptionalCtaUrl(value: string | null) {
  return (
    !value || value.startsWith('http://') || value.startsWith('https://')
  )
}

function normalizeAnnouncementType(value: unknown): AnnouncementType | null {
  return ANNOUNCEMENT_TYPES.includes(value as AnnouncementType)
    ? (value as AnnouncementType)
    : null
}

function normalizeAudienceType(value: unknown): AudienceType | null {
  return AUDIENCE_TYPES.includes(value as AudienceType)
    ? (value as AudienceType)
    : null
}

async function branchBelongsToTenant(branchId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return Boolean(data)
}

function normalizeSelectedCustomerIds(value: unknown) {
  if (typeof value === 'string') {
    try {
      return normalizeSelectedCustomerIds(JSON.parse(value))
    } catch {
      return []
    }
  }

  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(
    new Set(
      value
        .map((item) => normalizeText(item))
        .filter((item) => item.length > 0)
    )
  )
}

function getFileExtension(fileName: string) {
  const parts = fileName.split('.')
  return parts.length > 1 ? parts.at(-1) || 'png' : 'png'
}

function isAllowedAnnouncementImageExtension(fileName: string) {
  const extension = getFileExtension(fileName).toLowerCase()
  return ['jpg', 'jpeg', 'png', 'webp'].includes(extension)
}

function isAllowedAnnouncementImageMimeType(mimeType: string) {
  return ALLOWED_ANNOUNCEMENT_IMAGE_TYPES.includes(mimeType)
}

async function uploadAnnouncementImage(
  file: File,
  tenantId: string,
  announcementId: string
) {
  if (
    !isAllowedAnnouncementImageMimeType(file.type) ||
    !isAllowedAnnouncementImageExtension(file.name)
  ) {
    throw new Error('يجب رفع صورة بصيغة png أو jpg أو jpeg أو webp')
  }

  if (file.size > MAX_ANNOUNCEMENT_IMAGE_SIZE_BYTES) {
    throw new Error('حجم صورة الإعلان يجب ألا يتجاوز 5 ميجابايت')
  }

  const extension = getFileExtension(file.name).toLowerCase()
  const filePath = `${tenantId}/${announcementId}.${extension}`
  const fileBuffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabaseAdmin.storage
    .from(ANNOUNCEMENT_IMAGE_BUCKET)
    .upload(filePath, fileBuffer, {
      contentType: file.type,
      upsert: true,
    })

  if (error) {
    throw new Error(error.message || 'تعذر رفع صورة الإعلان')
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage
    .from(ANNOUNCEMENT_IMAGE_BUCKET)
    .getPublicUrl(filePath)

  return publicUrl
}

async function getTenantCustomerIds(customerIds: string[], tenantId: string) {
  if (customerIds.length === 0) {
    return []
  }

  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('id', customerIds)

  if (error) {
    throw error
  }

  return (data || []).map((customer) => customer.id as string)
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ success: true, announcements: [] })
      )
    }

    const { data, error } = await supabaseAdmin
      .from('announcements')
      .select(
        'id, tenant_id, branch_id, title, message, announcement_type, discount_code, cta_label, cta_url, image_url, audience_type, status, created_by, created_at, updated_at'
      )
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) {
      const response = jsonResponse(
        {
          success: false,
          error: 'تعذر تحميل الإعلانات',
          ...safeErrorDetails(error, 'تعذر تحميل الإعلانات'),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    const response = jsonResponse({
      success: true,
      announcements: data || [],
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

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      const response = jsonResponse(
        { success: false, error: 'تعذر تحديد نطاق المنشأة' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const contentType = request.headers.get('content-type') || ''
    const isMultipart = contentType.includes('multipart/form-data')
    let body: CreateAnnouncementBody | FormData
    let imageFile: File | null = null

    if (isMultipart) {
      const formData = await request.formData()
      body = formData
      const image = formData.get('image')
      imageFile = image instanceof File && image.size > 0 ? image : null
    } else {
      body = (await request.json()) as CreateAnnouncementBody
    }

    const getBodyValue = (key: keyof CreateAnnouncementBody) =>
      body instanceof FormData ? body.get(key) : body[key]

    const title = normalizeText(getBodyValue('title'))
    const message = normalizeText(getBodyValue('message'))
    const announcementType = normalizeAnnouncementType(
      getBodyValue('announcement_type')
    )
    const audienceType = normalizeAudienceType(getBodyValue('audience_type'))
    const branchId = normalizeNullableText(getBodyValue('branch_id'))
    const discountCode = normalizeNullableText(getBodyValue('discount_code'))
    const ctaUrl = normalizeNullableText(getBodyValue('cta_url'))
    const ctaLabel = ctaUrl
      ? normalizeNullableText(getBodyValue('cta_label')) || DEFAULT_CTA_LABEL
      : null
    const selectedCustomerIds = normalizeSelectedCustomerIds(
      getBodyValue('selected_customer_ids')
    )

    if (!title) {
      const response = jsonResponse(
        { success: false, error: 'عنوان الإعلان مطلوب' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (!announcementType) {
      const response = jsonResponse(
        { success: false, error: 'نوع الإعلان غير صالح' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (!message) {
      const response = jsonResponse(
        { success: false, error: 'نص الرسالة مطلوب' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (!isValidOptionalCtaUrl(ctaUrl)) {
      const response = jsonResponse(
        { success: false, error: 'رابط الزر يجب أن يبدأ بـ http:// أو https://' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (!audienceType) {
      const response = jsonResponse(
        { success: false, error: 'الجمهور المستهدف غير صالح' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (audienceType === 'branch_customers' && !branchId) {
      const response = jsonResponse(
        { success: false, error: 'اختر الفرع المستهدف للإعلان' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (audienceType === 'manual_customers' && selectedCustomerIds.length === 0) {
      const response = jsonResponse(
        { success: false, error: 'اختر عميلًا واحدًا على الأقل للإعلان' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (branchId) {
      const branchExists = await branchBelongsToTenant(branchId, tenantId)

      if (!branchExists) {
        const response = jsonResponse(
          { success: false, error: 'الفرع المحدد غير موجود داخل هذه المنشأة' },
          404
        )
        return withAuthCookies(auth.response, response)
      }
    }

    const validManualCustomerIds =
      audienceType === 'manual_customers'
        ? await getTenantCustomerIds(selectedCustomerIds, tenantId)
        : []

    if (
      audienceType === 'manual_customers' &&
      validManualCustomerIds.length !== selectedCustomerIds.length
    ) {
      const response = jsonResponse(
        { success: false, error: 'بعض العملاء المحددين غير موجودين داخل هذه المنشأة' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const announcementId = crypto.randomUUID()
    const imageUrl = imageFile
      ? await uploadAnnouncementImage(imageFile, tenantId, announcementId)
      : null

    const { data, error } = await supabaseAdmin
      .from('announcements')
      .insert({
        id: announcementId,
        tenant_id: tenantId,
        branch_id: audienceType === 'branch_customers' ? branchId : null,
        title,
        message,
        announcement_type: announcementType,
        discount_code: discountCode,
        cta_label: ctaLabel,
        cta_url: ctaUrl,
        image_url: imageUrl,
        audience_type: audienceType,
        status: 'draft',
        created_by: auth.profile.id,
      })
      .select(
        'id, tenant_id, branch_id, title, message, announcement_type, discount_code, cta_label, cta_url, image_url, audience_type, status, created_by, created_at, updated_at'
      )
      .single()

    if (error) {
      const response = jsonResponse(
        {
          success: false,
          error: 'تعذر إنشاء الإعلان',
          ...safeErrorDetails(error, 'تعذر إنشاء الإعلان'),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    if (audienceType === 'manual_customers' && validManualCustomerIds.length > 0) {
      const { error: manualCustomersError } = await supabaseAdmin
        .from('announcement_manual_customers')
        .insert(
          validManualCustomerIds.map((customerId) => ({
            announcement_id: data.id,
            tenant_id: tenantId,
            customer_id: customerId,
          }))
        )

      if (manualCustomersError) {
        await supabaseAdmin
          .from('announcements')
          .delete()
          .eq('id', data.id)
          .eq('tenant_id', tenantId)

        const response = jsonResponse(
          {
            success: false,
            error: 'تعذر حفظ قائمة العملاء المحددين',
            ...safeErrorDetails(
              manualCustomersError,
              'تعذر حفظ قائمة العملاء المحددين'
            ),
          },
          500
        )
        return withAuthCookies(auth.response, response)
      }
    }

    const response = jsonResponse(
      {
        success: true,
        announcement: data,
      },
      201
    )

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

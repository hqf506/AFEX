import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import {
  CATALOG_IMAGE_BUCKET,
  getCatalogImagePath,
  isAllowedCatalogImageMimeType,
  isSystemScopedCatalogAdmin,
  normalizeCatalogItemId,
} from '@/lib/admin/catalog'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'

const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024
const UPLOAD_FORM_ITEM_ID_FIELD = 'itemId'
const UPLOAD_FORM_FILE_FIELD = 'file'
const ALLOWED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']

function getFileExtension(fileName: string) {
  const parts = fileName.split('.')
  return parts.length > 1 ? parts.at(-1) || 'png' : 'png'
}

function isAllowedCatalogImageExtension(fileName: string) {
  const extension = getFileExtension(fileName).toLowerCase()
  return ['jpg', 'jpeg', 'png', 'webp'].includes(extension)
}

function logCatalogImageUploadIssue(
  reason: string,
  context: Record<string, unknown> = {}
) {
  console.error('[catalog-image-upload]', {
    reason,
    bucket: CATALOG_IMAGE_BUCKET,
    maxUploadSizeBytes: MAX_UPLOAD_SIZE_BYTES,
    allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
    ...context,
  })
}

function uploadErrorResponse(
  error: string,
  status: number,
  diagnostic?: unknown
) {
  return jsonResponse(
    {
      error,
      ...(diagnostic ? { details: diagnostic } : {}),
    },
    status
  )
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  if (!isSystemScopedCatalogAdmin(auth.profile.scope_type)) {
    return withAuthCookies(
      auth.response,
      uploadErrorResponse(
          'لا تملك صلاحية تنفيذ هذه العملية.',
        403
      )
    )
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      logCatalogImageUploadIssue('missing tenant_id', {
        userId: auth.user.id,
        scopeType: auth.profile.scope_type,
      })

      return withAuthCookies(
        auth.response,
        uploadErrorResponse(
          'تعذر تحديد نطاق المؤسسة. سجّل الدخول مرة أخرى ثم حاول مجددًا.',
          422
        )
      )
    }

    let formData: FormData

    try {
      formData = await request.formData()
    } catch (error) {
      logCatalogImageUploadIssue('invalid form data', {
        tenantId,
        details: error instanceof Error ? error.message : String(error),
      })

      return withAuthCookies(
        auth.response,
        uploadErrorResponse(
          'تعذر قراءة ملف الصورة. اختر الصورة مرة أخرى ثم حاول مجددًا.',
          422,
          error instanceof Error ? error.message : undefined
        )
      )
    }

    const itemId = normalizeCatalogItemId(formData.get(UPLOAD_FORM_ITEM_ID_FIELD))
    const file = formData.get(UPLOAD_FORM_FILE_FIELD)

    if (!itemId) {
      logCatalogImageUploadIssue('missing catalog item id', {
        tenantId,
        expectedFieldName: UPLOAD_FORM_ITEM_ID_FIELD,
      })

      return withAuthCookies(
        auth.response,
        uploadErrorResponse(
          'تعذر تحديد المنتج المطلوب. حدّث الصفحة ثم حاول مرة أخرى.',
          422
        )
      )
    }

    if (!(file instanceof File)) {
      logCatalogImageUploadIssue('missing image file', {
        tenantId,
        itemId,
        expectedFieldName: UPLOAD_FORM_FILE_FIELD,
        receivedType: typeof file,
      })

      return withAuthCookies(
        auth.response,
        uploadErrorResponse(
          'اختر صورة للمنتج ثم حاول مرة أخرى.',
          422
        )
      )
    }

    if (file.size === 0) {
      logCatalogImageUploadIssue('empty image file', {
        tenantId,
        itemId,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
      })

      return withAuthCookies(
        auth.response,
        uploadErrorResponse('ملف الصورة فارغ. اختر صورة أخرى.', 422)
      )
    }

    if (
      !isAllowedCatalogImageMimeType(file.type) ||
      !isAllowedCatalogImageExtension(file.name)
    ) {
      logCatalogImageUploadIssue('invalid mime type or extension', {
        tenantId,
        itemId,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
      })

      return withAuthCookies(
        auth.response,
        uploadErrorResponse(
          'صيغة الصورة غير مدعومة. استخدم PNG أو JPG أو WEBP.',
          422
        )
      )
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      logCatalogImageUploadIssue('file size too large', {
        tenantId,
        itemId,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
      })

      return withAuthCookies(
        auth.response,
        uploadErrorResponse(
          'حجم الصورة أكبر من الحد المسموح. استخدم صورة لا تتجاوز 5 ميجابايت.',
          422
        )
      )
    }

    let existingItemQuery = supabaseAdmin
      .from('catalog_items')
      .select('id')
      .eq('id', itemId)

    existingItemQuery = applyTenantFilter(existingItemQuery, tenantId)

    const { data: existingItem, error: existingItemError } =
      await existingItemQuery.maybeSingle()

    if (existingItemError) {
      logCatalogImageUploadIssue('catalog item lookup failed', {
        tenantId,
        itemId,
        details: existingItemError.message,
      })

      return withAuthCookies(
        auth.response,
        uploadErrorResponse(
          'تعذر رفع الصورة. تحقق من الاتصال وحجم الملف ثم حاول مرة أخرى.',
          500,
          existingItemError.message
        )
      )
    }

    if (!existingItem) {
      logCatalogImageUploadIssue('catalog item not found', {
        tenantId,
        itemId,
      })

      return withAuthCookies(
        auth.response,
        uploadErrorResponse(
          'المنتج المطلوب غير موجود أو تم حذفه.',
          404
        )
      )
    }

    const extension = getFileExtension(file.name)
    const filePath = getCatalogImagePath(itemId, extension)
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabaseAdmin.storage
      .from(CATALOG_IMAGE_BUCKET)
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      logCatalogImageUploadIssue('supabase storage upload error', {
        tenantId,
        itemId,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        filePath,
        details: uploadError.message,
      })

      return withAuthCookies(
        auth.response,
        uploadErrorResponse(
          'تعذر رفع الصورة. تحقق من الاتصال وحجم الملف ثم حاول مرة أخرى.',
          500,
          uploadError.message
        )
      )
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(CATALOG_IMAGE_BUCKET).getPublicUrl(filePath)

    const { data: updatedItem, error: updateError } = await supabaseAdmin
      .from('catalog_items')
      .update({
        image_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('tenant_id', tenantId)
      .select(
        'id, code, name, category, item_type, default_price, image_url, is_active, created_at, updated_at'
      )
      .single()

    if (updateError || !updatedItem) {
      logCatalogImageUploadIssue('catalog image url update failed', {
        tenantId,
        itemId,
        filePath,
        publicUrl,
        details: updateError?.message || 'No updated item returned',
      })

      return withAuthCookies(
        auth.response,
        uploadErrorResponse(
          'تم رفع الصورة، لكن تعذر حفظها للمنتج. حاول مرة أخرى.',
          500,
          updateError?.message || 'No updated item returned'
        )
      )
    }

    return withAuthCookies(
      auth.response,
      jsonResponse({
        success: true,
        message: 'Catalog item image uploaded successfully.',
        item: updatedItem,
      })
    )
  } catch (error) {
    logCatalogImageUploadIssue('unexpected upload route error', {
      details: error instanceof Error ? error.message : String(error),
    })

    return withAuthCookies(
      auth.response,
      uploadErrorResponse(
        'تعذر رفع الصورة. تحقق من الاتصال وحجم الملف ثم حاول مرة أخرى.',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      )
    )
  }
}

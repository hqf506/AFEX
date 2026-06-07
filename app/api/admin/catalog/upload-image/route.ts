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
  code: string,
  status: number,
  details?: string
) {
  return jsonResponse(
    {
      error,
      code,
      ...(details ? { details } : {}),
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
        'Only system administrators can upload catalog item images.',
        'FORBIDDEN',
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
          'Missing tenant_id for the authenticated user.',
          'MISSING_TENANT_ID',
          400
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
          'Invalid multipart form data.',
          'INVALID_FORM_DATA',
          400,
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
          `Missing catalog item id. Expected FormData field "${UPLOAD_FORM_ITEM_ID_FIELD}".`,
          'MISSING_ITEM_ID',
          400
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
          `Missing image file. Expected FormData field "${UPLOAD_FORM_FILE_FIELD}".`,
          'MISSING_FILE',
          400
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
        uploadErrorResponse('Image file is empty.', 'EMPTY_FILE', 400)
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
          'Invalid image type. Allowed types are image/png, image/jpeg, and image/webp.',
          'INVALID_IMAGE_TYPE',
          400
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
          'Image file is too large. Maximum size is 5 MB.',
          'FILE_TOO_LARGE',
          400
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
          'Could not verify catalog item before uploading image.',
          'CATALOG_ITEM_LOOKUP_FAILED',
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
          'Catalog item was not found for this tenant.',
          'CATALOG_ITEM_NOT_FOUND',
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
          'Supabase storage upload failed.',
          'STORAGE_UPLOAD_FAILED',
          400,
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
          'Image uploaded, but saving image URL to catalog item failed.',
          'CATALOG_IMAGE_URL_UPDATE_FAILED',
          400,
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
        'Unexpected error while uploading catalog item image.',
        'UNEXPECTED_UPLOAD_ERROR',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      )
    )
  }
}

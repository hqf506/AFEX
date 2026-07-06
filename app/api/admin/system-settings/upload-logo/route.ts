import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { CATALOG_IMAGE_BUCKET } from '@/lib/admin/catalog'
import { supabaseAdmin } from '@/lib/supabase/admin'

const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']

function getFileExtension(fileName: string) {
  const parts = fileName.split('.')
  return parts.length > 1 ? parts.at(-1) || 'png' : 'png'
}

function isAllowedImageExtension(fileName: string) {
  return ['jpg', 'jpeg', 'png', 'webp'].includes(getFileExtension(fileName).toLowerCase())
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ success: false, error: 'Tenant context is required' }, 400)
      )
    }

    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File) || file.size === 0) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ success: false, error: 'Image file is required' }, 400)
      )
    }

    if (
      !ALLOWED_IMAGE_MIME_TYPES.includes(file.type) ||
      !isAllowedImageExtension(file.name)
    ) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ success: false, error: 'Invalid image type' }, 400)
      )
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ success: false, error: 'Image file is too large' }, 400)
      )
    }

    const extension = getFileExtension(file.name).toLowerCase()
    const filePath = `invoice-logos/${tenantId}/thermal-logo.${extension}`
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabaseAdmin.storage
      .from(CATALOG_IMAGE_BUCKET)
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            success: false,
            error: 'Logo upload failed',
            details: uploadError.message,
          },
          400
        )
      )
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(CATALOG_IMAGE_BUCKET).getPublicUrl(filePath)

    return withAuthCookies(
      auth.response,
      jsonResponse({
        success: true,
        logoUrl: publicUrl,
      })
    )
  } catch (error) {
    return withAuthCookies(
      auth.response,
      jsonResponse(
        {
          success: false,
          error: 'Unexpected logo upload error',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      )
    )
  }
}

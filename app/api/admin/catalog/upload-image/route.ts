import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import {
  CATALOG_IMAGE_BUCKET,
  getCatalogImagePath,
  isSystemScopedCatalogAdmin,
  normalizeCatalogItemId,
} from '@/lib/admin/catalog'
import { supabaseAdmin } from '@/lib/supabase/admin'

const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024

function getFileExtension(fileName: string) {
  const parts = fileName.split('.')
  return parts.length > 1 ? parts.at(-1) || 'png' : 'png'
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  if (!isSystemScopedCatalogAdmin(auth.profile.scope_type)) {
    return withAuthCookies(
      auth.response,
      jsonResponse({ error: 'هذه العملية متاحة لمدير النظام فقط' }, 403)
    )
  }

  try {
    const formData = await request.formData()
    const itemId = normalizeCatalogItemId(formData.get('itemId'))
    const file = formData.get('file')

    if (!itemId) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'معرف العنصر مطلوب' }, 400)
      )
    }

    if (!(file instanceof File)) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'ملف الصورة مطلوب' }, 400)
      )
    }

    if (!file.type.startsWith('image/')) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'يجب رفع ملف صورة صالح' }, 400)
      )
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'حجم الصورة يجب ألا يتجاوز 5 ميجابايت' }, 400)
      )
    }

    const { data: existingItem, error: existingItemError } = await supabaseAdmin
      .from('catalog_items')
      .select('id')
      .eq('id', itemId)
      .maybeSingle()

    if (existingItemError) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'تعذر التحقق من عنصر الكتالوج',
            details: existingItemError.message,
          },
          500
        )
      )
    }

    if (!existingItem) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'عنصر الكتالوج غير موجود' }, 404)
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
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'فشل رفع الصورة',
            details: uploadError.message,
          },
          400
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
      .select(
        'id, code, name, category, item_type, default_price, image_url, is_active, created_at, updated_at'
      )
      .single()

    if (updateError || !updatedItem) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'فشل حفظ رابط الصورة',
            details: updateError?.message || 'Unknown error',
          },
          400
        )
      )
    }

    return withAuthCookies(
      auth.response,
      jsonResponse({
        success: true,
        message: 'تم رفع صورة العنصر بنجاح',
        item: updatedItem,
      })
    )
  } catch (error) {
    return withAuthCookies(
      auth.response,
      jsonResponse(
        {
          error: 'حدث خطأ غير متوقع',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      )
    )
  }
}

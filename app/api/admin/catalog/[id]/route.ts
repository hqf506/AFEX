import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import {
  isSystemScopedCatalogAdmin,
  isValidCatalogCode,
  isValidCatalogItemType,
  isValidCatalogPrice,
  normalizeCatalogCategory,
  normalizeCatalogCode,
  normalizeCatalogItemId,
  normalizeCatalogName,
  normalizeCatalogPrice,
  type CatalogItemType,
} from '@/lib/admin/catalog'
import { isBooleanValue } from '@/lib/api/validation'
import { supabaseAdmin } from '@/lib/supabase/admin'

type UpdateCatalogItemBody = {
  name?: string
  code?: string
  category?: string
  item_type?: CatalogItemType
  default_price?: number | string
  is_active?: boolean
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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
    const params = await context.params
    const itemId = normalizeCatalogItemId(params.id)

    if (!itemId) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'معرف العنصر مطلوب' }, 400)
      )
    }

    const body = (await request.json()) as UpdateCatalogItemBody
    const name = normalizeCatalogName(body.name)
    const code = normalizeCatalogCode(body.code)
    const category = normalizeCatalogCategory(body.category)
    const itemType = body.item_type
    const defaultPrice = normalizeCatalogPrice(body.default_price)
    const isActive = body.is_active

    if (!name) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'اسم العنصر مطلوب' }, 400)
      )
    }

    if (!code) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'الكود الداخلي مطلوب' }, 400)
      )
    }

    if (!isValidCatalogCode(code)) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'الكود الداخلي غير صالح',
            details:
              'استخدم أحرفًا إنجليزية صغيرة أو أرقامًا أو - فقط، بين 2 و64 حرفًا',
          },
          400
        )
      )
    }

    if (!category) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'التصنيف مطلوب' }, 400)
      )
    }

    if (!isValidCatalogItemType(itemType)) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'نوع العنصر غير صالح' }, 400)
      )
    }

    if (!isValidCatalogPrice(defaultPrice)) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'السعر الافتراضي غير صالح' }, 400)
      )
    }

    if (!isBooleanValue(isActive)) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'قيمة is_active غير صالحة' }, 400)
      )
    }

    const { data: existingItem, error: existingItemError } = await supabaseAdmin
      .from('catalog_items')
      .select('id, code')
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

    const { data: duplicateItem, error: duplicateItemError } = await supabaseAdmin
      .from('catalog_items')
      .select('id')
      .eq('code', code)
      .neq('id', itemId)
      .maybeSingle()

    if (duplicateItemError) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'تعذر التحقق من الكود الداخلي',
            details: duplicateItemError.message,
          },
          500
        )
      )
    }

    if (duplicateItem) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'الكود الداخلي مستخدم بالفعل' }, 409)
      )
    }

    const { data, error } = await supabaseAdmin
      .from('catalog_items')
      .update({
        name,
        code,
        category,
        item_type: itemType,
        default_price: defaultPrice,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .select(
        'id, code, name, category, item_type, default_price, image_url, is_active, created_at, updated_at'
      )
      .single()

    if (error || !data) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'فشل تحديث عنصر الكتالوج',
            details: error?.message || 'Unknown error',
          },
          400
        )
      )
    }

    return withAuthCookies(
      auth.response,
      jsonResponse({
        success: true,
        message: 'تم تحديث عنصر الكتالوج بنجاح',
        item: data,
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

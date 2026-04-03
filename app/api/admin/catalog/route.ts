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
  normalizeCatalogName,
  normalizeCatalogPrice,
  type CatalogItemType,
} from '@/lib/admin/catalog'
import { supabaseAdmin } from '@/lib/supabase/admin'

type CreateCatalogItemBody = {
  name?: string
  code?: string
  category?: string
  item_type?: CatalogItemType
  default_price?: number | string
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  if (!isSystemScopedCatalogAdmin(auth.profile.scope_type)) {
    return withAuthCookies(
      auth.response,
      jsonResponse({ error: 'هذه الصفحة متاحة لمدير النظام فقط' }, 403)
    )
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('catalog_items')
      .select(
        'id, code, name, category, item_type, default_price, is_active, created_at, updated_at'
      )
      .order('created_at', { ascending: true })

    if (error) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'تعذر تحميل عناصر الكتالوج',
            details: error.message,
          },
          500
        )
      )
    }

    return withAuthCookies(
      auth.response,
      jsonResponse({
        success: true,
        items: data || [],
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
    const body = (await request.json()) as CreateCatalogItemBody
    const name = normalizeCatalogName(body.name)
    const code = normalizeCatalogCode(body.code)
    const category = normalizeCatalogCategory(body.category)
    const itemType = body.item_type
    const defaultPrice = normalizeCatalogPrice(body.default_price)

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

    const { data: existingItem, error: existingItemError } = await supabaseAdmin
      .from('catalog_items')
      .select('id')
      .eq('code', code)
      .maybeSingle()

    if (existingItemError) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'تعذر التحقق من الكود الداخلي',
            details: existingItemError.message,
          },
          500
        )
      )
    }

    if (existingItem) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'الكود الداخلي مستخدم بالفعل' }, 409)
      )
    }

    const timestamp = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('catalog_items')
      .insert({
        name,
        code,
        category,
        item_type: itemType,
        default_price: defaultPrice,
        is_active: true,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .select(
        'id, code, name, category, item_type, default_price, is_active, created_at, updated_at'
      )
      .single()

    if (error || !data) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'فشل إنشاء عنصر الكتالوج',
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
        message: 'تم إنشاء عنصر الكتالوج بنجاح',
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

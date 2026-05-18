import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
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
import { applyTenantFilter } from '@/lib/tenant-filter'

type UpdateCatalogItemBody = {
  name?: string
  code?: string
  category?: string
  item_type?: CatalogItemType
  default_price?: number | string
  cost_price?: number | string
  pos_display_mode?: 'style' | 'image'
  pos_color?: string | null
  pos_shape?: string | null
  is_composite?: boolean | string | null
  track_inventory?: boolean | string | null
  is_active?: boolean
}

function normalizePosDisplayMode(value: unknown): 'style' | 'image' {
  return value === 'image' ? 'image' : 'style'
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

function normalizeTrackInventory(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return false
    return ['true', '1', 'yes', 'y', 'نعم', 'مفعل', 'active'].includes(normalized)
  }
  return false
}

function normalizeOptionalBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return false
    return ['true', '1', 'yes', 'y', 'نعم', 'مفعل', 'active'].includes(normalized)
  }
  return false
}

async function ensureInventoryStockRows(tenantId: string, catalogItemId: string) {
  const { error } = await supabaseAdmin.rpc(
    'ensure_inventory_stock_for_catalog_item',
    {
      p_tenant_id: tenantId,
      p_catalog_item_id: catalogItemId,
    }
  )

  if (error) {
    throw new Error(error.message)
  }
}

function utf8JsonResponse(data: Record<string, unknown>, status = 200) {
  const response = jsonResponse(data, status)
  response.headers.set('Content-Type', 'application/json; charset=utf-8')
  return response
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
    const salePrice = normalizeCatalogPrice(body.default_price)
    const costPrice = normalizeCatalogPrice(body.cost_price)
    const posDisplayMode = normalizePosDisplayMode(body.pos_display_mode)
    const posColor = normalizeOptionalText(body.pos_color)
    const posShape = normalizeOptionalText(body.pos_shape)
    const requestedIsComposite = normalizeOptionalBoolean(body.is_composite)
    const requestedTrackInventory = normalizeTrackInventory(body.track_inventory)
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
        jsonResponse({ error: 'كود العنصر مطلوب' }, 400)
      )
    }

    if (!isValidCatalogCode(code)) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'كود العنصر غير صالح' }, 400)
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

    if (!isValidCatalogPrice(costPrice)) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'سعر التكلفة غير صالح' }, 400)
      )
    }

    if (!isValidCatalogPrice(salePrice)) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'سعر البيع غير صالح' }, 400)
      )
    }

    if (!isBooleanValue(isActive)) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'قيمة الحالة غير صالحة' }, 400)
      )
    }

    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'Ø¹Ù†ØµØ± Ø§Ù„ÙƒØªØ§Ù„ÙˆØ¬ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' }, 404)
      )
    }

    let existingItemQuery = supabaseAdmin
      .from('catalog_items')
      .select('id, code, is_composite, track_inventory, inventory_enabled_at')
      .eq('id', itemId)

    existingItemQuery = applyTenantFilter(existingItemQuery, tenantId)

    const { data: existingItem, error: existingItemError } =
      await existingItemQuery
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

    let duplicateItemQuery = supabaseAdmin
      .from('catalog_items')
      .select('id')
      .eq('code', code)
      .neq('id', itemId)

    duplicateItemQuery = applyTenantFilter(duplicateItemQuery, tenantId)

    const { data: duplicateItem, error: duplicateItemError } =
      await duplicateItemQuery
      .maybeSingle()

    if (duplicateItemError) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'تعذر التحقق من كود العنصر',
            details: duplicateItemError.message,
          },
          500
        )
      )
    }

    if (duplicateItem) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'كود العنصر مستخدم بالفعل' }, 409)
      )
    }

    const hasTrackInventoryValue = Object.prototype.hasOwnProperty.call(
      body,
      'track_inventory'
    )
    const hasCompositeValue = Object.prototype.hasOwnProperty.call(
      body,
      'is_composite'
    )
    const isComposite = hasCompositeValue
      ? requestedIsComposite
      : existingItem.is_composite === true

    if (requestedTrackInventory && itemType !== 'product' && !isComposite) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'تتبع المخزون متاح للمنتجات والعناصر المركبة فقط' }, 400)
      )
    }

    const wasTracked = existingItem.track_inventory === true
    const trackInventory =
      (itemType === 'product' || isComposite) &&
      (hasTrackInventoryValue ? requestedTrackInventory : wasTracked)
    const timestamp = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('catalog_items')
      .update({
        name,
        code,
        category,
        item_type: itemType,
        default_price: salePrice,
        cost_price: costPrice,
        pos_display_mode: posDisplayMode,
        pos_color: posColor,
        pos_shape: posShape,
        is_composite: isComposite,
        track_inventory: trackInventory,
        inventory_enabled_at:
          trackInventory && !wasTracked
            ? timestamp
            : trackInventory
              ? existingItem.inventory_enabled_at ?? timestamp
              : null,
        is_active: isActive,
        updated_at: timestamp,
      })
      .eq('id', itemId)
      .eq('tenant_id', tenantId)
      .select(
        'id, code, name, category, item_type, default_price, cost_price, image_url, pos_display_mode, pos_color, pos_shape, is_composite, track_inventory, inventory_enabled_at, is_active, created_at, updated_at'
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

    if (trackInventory && !wasTracked) {
      await ensureInventoryStockRows(tenantId, itemId)
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

export async function DELETE(
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
      utf8JsonResponse(
        {
          success: false,
          error: 'FORBIDDEN',
          message: 'هذه العملية متاحة لمدير النظام فقط',
        },
        403
      )
    )
  }

  try {
    const params = await context.params
    const itemId = normalizeCatalogItemId(params.id)
    const envUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

    if (!itemId) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            success: false,
            error: 'INVALID_CATALOG_ITEM_ID',
            message: 'معرف العنصر مطلوب',
          },
          400
        )
      )
    }

    if (!envUrl || !serviceRoleKey) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            success: false,
            error: 'MISSING_SERVICE_ROLE_KEY',
            message: 'SUPABASE_SERVICE_ROLE_KEY غير موجود في .env.local',
          },
          500
        )
      )
    }

    const serviceSupabase = createClient(envUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            success: false,
            error: 'CATALOG_ITEM_NOT_FOUND',
            message: 'Ø§Ù„Ø¹Ù†ØµØ± ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯ ÙÙŠ Ø§Ù„ÙƒØªØ§Ù„ÙˆØ¬',
          },
          404
        )
      )
    }

    let existingItemQuery = serviceSupabase
      .from('catalog_items')
      .select('id')
      .eq('id', itemId)

    existingItemQuery = applyTenantFilter(existingItemQuery, tenantId)

    const { data: existingItem, error: existingItemError } =
      await existingItemQuery
      .maybeSingle()

    if (existingItemError) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            success: false,
            error: 'CATALOG_ITEM_LOOKUP_FAILED',
            message: 'تعذر التحقق من العنصر قبل حذفه',
            details: existingItemError.message,
            code: existingItemError.code,
          },
          500
        )
      )
    }

    if (!existingItem) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            success: false,
            error: 'CATALOG_ITEM_NOT_FOUND',
            message: 'العنصر غير موجود في الكتالوج',
          },
          404
        )
      )
    }

    const { error: branchDeleteError } = await serviceSupabase
      .from('branch_catalog_items')
      .delete()
      .eq('catalog_item_id', itemId)
      .eq('tenant_id', tenantId)

    if (branchDeleteError) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            success: false,
            error: 'BRANCH_CATALOG_DELETE_FAILED',
            message: 'تعذر حذف ارتباطات الفروع لهذا العنصر',
          },
          500
        )
      )
    }

    const { error: catalogDeleteError } = await serviceSupabase
      .from('catalog_items')
      .delete()
      .eq('id', itemId)
      .eq('tenant_id', tenantId)

    if (catalogDeleteError) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            success: false,
            error: 'CATALOG_ITEM_DELETE_FAILED',
            message: 'تعذر حذف العنصر من الكتالوج',
            details: catalogDeleteError.message,
            code: catalogDeleteError.code,
          },
          500
        )
      )
    }

    return withAuthCookies(
      auth.response,
      utf8JsonResponse({
        success: true,
        message: 'تم حذف العنصر نهائيًا من الكتالوج',
      })
    )
  } catch (error) {
    return withAuthCookies(
      auth.response,
      utf8JsonResponse(
        {
          success: false,
          error: 'UNEXPECTED_DELETE_ERROR',
          message: 'حدث خطأ غير متوقع أثناء حذف العنصر',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      )
    )
  }
}

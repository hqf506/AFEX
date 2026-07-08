import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import {
  getNextCatalogCode,
  isSystemScopedCatalogAdmin,
  isValidCatalogItemType,
  isValidCatalogPrice,
  normalizeCatalogCategory,
  normalizeCatalogName,
  normalizeCatalogPrice,
  type CatalogItemType,
} from '@/lib/admin/catalog'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'

type CreateCatalogItemBody = {
  name?: string
  code?: string
  category?: string
  item_type?: CatalogItemType
  default_price?: number | string
  cost_price?: number | string
  image_url?: string | null
  is_active?: boolean
  pos_display_mode?: 'style' | 'image'
  pos_color?: string | null
  pos_shape?: string | null
  is_composite?: boolean | string | null
  track_inventory?: boolean | string | null
}

type ImportCatalogItemsBody = {
  items?: CreateCatalogItemBody[]
}

function normalizePosDisplayMode(value: unknown): 'style' | 'image' {
  return value === 'image' ? 'image' : 'style'
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

function normalizeImportItemType(value: unknown): CatalogItemType {
  if (value === 'product' || value === 'service') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (
      normalized === 'product' ||
      normalized === 'products' ||
      normalized === 'منتج' ||
      normalized === 'المنتجات'
    ) {
      return 'product'
    }
  }

  return 'service'
}

function normalizeImportBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return true
    return ['true', '1', 'yes', 'y', 'نعم', 'نشط', 'active'].includes(normalized)
  }
  return true
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

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  if (!isSystemScopedCatalogAdmin(auth.profile.scope_type)) {
    return withAuthCookies(
      auth.response,
      utf8JsonResponse({ error: 'هذه الصفحة متاحة لمدير النظام فقط' }, 403)
    )
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({
          success: true,
          items: [],
        })
      )
    }

    let query = supabaseAdmin
      .from('catalog_items')
      .select(
        'id, code, name, category, item_type, default_price, cost_price, image_url, pos_display_mode, pos_color, pos_shape, is_composite, track_inventory, inventory_enabled_at, is_active, created_at, updated_at'
      )
      .order('created_at', { ascending: true })

    query = applyTenantFilter(query, tenantId)

    const { data, error } = await query

    if (error) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
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
      utf8JsonResponse({
        success: true,
        items: data || [],
      })
    )
  } catch (error) {
    return withAuthCookies(
      auth.response,
      utf8JsonResponse(
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
      utf8JsonResponse({ error: 'هذه العملية متاحة لمدير النظام فقط' }, 403)
    )
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'تعذر تحديد نطاق المنشأة' }, 400)
      )
    }

    const body = (await request.json()) as CreateCatalogItemBody & ImportCatalogItemsBody

    if (Array.isArray(body.items)) {
      let existingItemsQuery = supabaseAdmin
        .from('catalog_items')
        .select(
          'id, code, name, category, item_type, default_price, cost_price, image_url, pos_display_mode, pos_color, pos_shape, is_composite, track_inventory, inventory_enabled_at, is_active'
        )

      existingItemsQuery = applyTenantFilter(existingItemsQuery, tenantId)

      const { data: existingItems, error: existingItemsError } =
        await existingItemsQuery

      if (existingItemsError) {
        return withAuthCookies(
          auth.response,
          utf8JsonResponse(
            {
              error: 'تعذر قراءة عناصر الكتالوج الحالية',
              details: existingItemsError.message,
            },
            500
          )
        )
      }

      const itemsByCode = new Map(
        (existingItems || [])
          .filter((item) => item.code)
          .map((item) => [item.code, item])
      )
      const knownCodes = new Set((existingItems || []).map((item) => item.code || ''))

      let created = 0
      let updated = 0
      let failed = 0
      const errors: Array<{
        code: string
        name: string
        message: string
      }> = []

      for (const entry of body.items) {
        const name = normalizeCatalogName(entry.name)
        if (!name) {
          failed += 1
          errors.push({
            code: typeof entry.code === 'string' ? entry.code.trim() : '',
            name: '',
            message: 'اسم العنصر مطلوب',
          })
          continue
        }

        let code = typeof entry.code === 'string' ? entry.code.trim() : ''
        if (!code) {
          code = getNextCatalogCode(Array.from(knownCodes))
        }

        knownCodes.add(code)

        const category = normalizeCatalogCategory(entry.category) || ''
        const itemType = normalizeImportItemType(entry.item_type)
        const salePrice = Number.isFinite(normalizeCatalogPrice(entry.default_price))
          ? normalizeCatalogPrice(entry.default_price)
          : 0
        const costPrice = Number.isFinite(normalizeCatalogPrice(entry.cost_price))
          ? normalizeCatalogPrice(entry.cost_price)
          : 0
        const posDisplayMode = normalizePosDisplayMode(entry.pos_display_mode)
        const posColor = normalizeOptionalText(entry.pos_color)
        const posShape = normalizeOptionalText(entry.pos_shape)
        const imageUrl = normalizeOptionalText(entry.image_url)
        const isActive = normalizeImportBoolean(entry.is_active)
        const hasCompositeValue = Object.prototype.hasOwnProperty.call(
          entry,
          'is_composite'
        )
        const hasTrackInventoryValue = Object.prototype.hasOwnProperty.call(
          entry,
          'track_inventory'
        )
        const timestamp = new Date().toISOString()
        const existingItem = itemsByCode.get(code)
        const isComposite = hasCompositeValue
          ? normalizeOptionalBoolean(entry.is_composite)
          : existingItem?.is_composite === true
        const trackInventory =
          (itemType === 'product' || isComposite) &&
          (hasTrackInventoryValue
            ? normalizeTrackInventory(entry.track_inventory)
            : existingItem?.track_inventory === true)

        if (existingItem) {
          const wasTracked = existingItem.track_inventory === true
          const { data: updatedItem, error: updateError } = await supabaseAdmin
            .from('catalog_items')
            .update({
              name,
              category,
              item_type: itemType,
              default_price: salePrice,
              cost_price: costPrice,
              image_url: imageUrl,
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
            .eq('id', existingItem.id)
            .eq('tenant_id', tenantId)
            .select('id, code, track_inventory, inventory_enabled_at')
            .single()

          if (updateError || !updatedItem) {
            failed += 1
            errors.push({
              code,
              name,
              message: updateError?.message || 'تعذر تحديث العنصر',
            })
            continue
          }

          if (trackInventory && !wasTracked) {
            await ensureInventoryStockRows(tenantId, existingItem.id)
          }

          itemsByCode.set(code, {
            ...existingItem,
            ...updatedItem,
            name,
            category,
            item_type: itemType,
            default_price: salePrice,
            cost_price: costPrice,
            image_url: imageUrl,
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
          })
          updated += 1
          continue
        }

        const { data: createdItem, error: createError } = await supabaseAdmin
          .from('catalog_items')
          .insert({
            name,
            code,
            category,
            item_type: itemType,
            default_price: salePrice,
            cost_price: costPrice,
            image_url: imageUrl,
            pos_display_mode: posDisplayMode,
            pos_color: posColor,
            pos_shape: posShape,
            is_composite: isComposite,
            track_inventory: trackInventory,
            inventory_enabled_at: trackInventory ? timestamp : null,
            tenant_id: tenantId,
            is_active: isActive,
            created_at: timestamp,
            updated_at: timestamp,
          })
          .select('id, code, track_inventory, inventory_enabled_at')
          .single()

        if (createError || !createdItem) {
          failed += 1
          errors.push({
            code,
            name,
            message: createError?.message || 'تعذر إنشاء العنصر',
          })
          continue
        }

        if (trackInventory) {
          await ensureInventoryStockRows(tenantId, createdItem.id)
        }

        itemsByCode.set(code, {
          ...createdItem,
          name,
          category,
          item_type: itemType,
          default_price: salePrice,
          cost_price: costPrice,
          image_url: imageUrl,
          pos_display_mode: posDisplayMode,
          pos_color: posColor,
          pos_shape: posShape,
          is_composite: isComposite,
          track_inventory: trackInventory,
          inventory_enabled_at: trackInventory ? timestamp : null,
          is_active: isActive,
        })
        created += 1
      }

      return withAuthCookies(
        auth.response,
        utf8JsonResponse({
          success: true,
          message: 'تم إدخال العناصر بنجاح',
          inserted: created,
          updated,
          failed,
          errors,
          summary: {
            created,
            updated,
            failed,
          },
        })
      )
    }

    const name = normalizeCatalogName(body.name)
    const category = normalizeCatalogCategory(body.category)
    const itemType = body.item_type
    const salePrice = normalizeCatalogPrice(body.default_price)
    const costPrice = normalizeCatalogPrice(body.cost_price)
    const posDisplayMode = normalizePosDisplayMode(body.pos_display_mode)
    const posColor = normalizeOptionalText(body.pos_color)
    const posShape = normalizeOptionalText(body.pos_shape)
    const isComposite = normalizeOptionalBoolean(body.is_composite)
    const trackInventory =
      (itemType === 'product' || isComposite) &&
      normalizeTrackInventory(body.track_inventory)

    if (!name) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'اسم العنصر مطلوب' }, 400)
      )
    }

    if (!category) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'التصنيف مطلوب' }, 400)
      )
    }

    if (!isValidCatalogItemType(itemType)) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'نوع العنصر غير صالح' }, 400)
      )
    }

    if (!isValidCatalogPrice(costPrice)) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'سعر التكلفة غير صالح' }, 400)
      )
    }

    if (!isValidCatalogPrice(salePrice)) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'سعر البيع غير صالح' }, 400)
      )
    }

    if (normalizeTrackInventory(body.track_inventory) && itemType !== 'product' && !isComposite) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'تتبع المخزون متاح للمنتجات والعناصر المركبة فقط' }, 400)
      )
    }

    let existingCodesQuery = supabaseAdmin
      .from('catalog_items')
      .select('code')

    existingCodesQuery = applyTenantFilter(existingCodesQuery, tenantId)

    const { data: existingCodes, error: existingCodesError } =
      await existingCodesQuery

    if (existingCodesError) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            error: 'تعذر توليد كود العنصر',
            details: existingCodesError.message,
          },
          500
        )
      )
    }

    const code = getNextCatalogCode(
      (existingCodes || []).map((item) => item.code || '')
    )
    const timestamp = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('catalog_items')
      .insert({
        name,
        code,
        category,
        item_type: itemType,
        default_price: salePrice,
        cost_price: costPrice,
        image_url: null,
        pos_display_mode: posDisplayMode,
        pos_color: posColor,
        pos_shape: posShape,
        is_composite: isComposite,
        track_inventory: trackInventory,
        inventory_enabled_at: trackInventory ? timestamp : null,
        tenant_id: tenantId,
        is_active: true,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .select(
        'id, code, name, category, item_type, default_price, cost_price, image_url, pos_display_mode, pos_color, pos_shape, is_composite, track_inventory, inventory_enabled_at, is_active, created_at, updated_at'
      )
      .single()

    if (error || !data) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            error: 'فشل إنشاء عنصر الكتالوج',
            details: error?.message || 'Unknown error',
          },
          400
        )
      )
    }

    if (trackInventory) {
      await ensureInventoryStockRows(tenantId, data.id)
    }

    return withAuthCookies(
      auth.response,
      utf8JsonResponse({
        success: true,
        message: 'تم إنشاء عنصر الكتالوج بنجاح',
        item: data,
      })
    )
  } catch (error) {
    return withAuthCookies(
      auth.response,
      utf8JsonResponse(
        {
          error: 'حدث خطأ غير متوقع',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      )
    )
  }
}

import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { mapBranchCatalogToInvoiceProducts } from '@/lib/invoices/catalog'
import type {
  BranchCatalogItemRow,
  CatalogItemRow,
  InventoryStockRow,
} from '@/lib/invoices/catalog'
import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  disabledFeatureResponse,
  INVOICES_FEATURE_DISABLED_MESSAGE,
} from '@/lib/feature-guards'
import { createServerTiming } from '@/lib/performance/server-timing'

function normalizeBranchId(value: string | null) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeFilterText(value: string | null) {
  return (value || '').trim()
}

function buildCatalogSearchFilter(search: string) {
  const normalized = search.replace(/,/g, ' ')
  if (!normalized) return null

  return `name.ilike.%${normalized}%,category.ilike.%${normalized}%`
}

export async function GET(request: NextRequest) {
  const timing = createServerTiming()
  const auth = await timing.measure('auth', () =>
    requireApiAuth(request, ['admin', 'employee', 'cashier'])
  )

  if (!auth.ok) {
    return timing.finish(auth.response)
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'tenant context missing',
          },
          403
        )
      )
    }

    const featureDisabledResponse = await timing.measure(
      'settings',
      () => disabledFeatureResponse(
        auth.response,
        tenantId,
        'enable_invoices',
        INVOICES_FEATURE_DISABLED_MESSAGE
      )
    )

    if (featureDisabledResponse) {
      return timing.finish(featureDisabledResponse)
    }

    const requestedBranchId = normalizeBranchId(
      request.nextUrl.searchParams.get('branchId')
    )

    const profileBranchId = normalizeBranchId(auth.profile.branch_id || null)

    if (auth.profile.scope_type !== 'system' && !profileBranchId) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'A concrete branch is required to load POS catalog items',
          },
          400
        )
      )
    }

    if (
      auth.profile.scope_type !== 'system' &&
      requestedBranchId &&
      requestedBranchId !== profileBranchId
    ) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'Requested branch does not match this account branch',
          },
          403
        )
      )
    }

    const resolvedBranchId =
      auth.profile.scope_type === 'system'
        ? requestedBranchId || profileBranchId
        : profileBranchId

    if (!resolvedBranchId) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'A concrete branch is required to load POS catalog items',
          },
          400
        )
      )
    }

    const branchQuery = supabaseAdmin
      .from('branches')
      .select('id')
      .eq('id', resolvedBranchId)
      .eq('tenant_id', tenantId)

    const { data: branch, error: branchError } =
      await timing.measure('branches', () => branchQuery.maybeSingle())

    if (branchError) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'Failed to validate branch',
          },
          500
        )
      )
    }

    if (!branch) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'Branch is not available for this account',
          },
          404
        )
      )
    }

    const category = normalizeFilterText(
      request.nextUrl.searchParams.get('category') ||
        request.nextUrl.searchParams.get('categoryId')
    )
    const search = normalizeFilterText(request.nextUrl.searchParams.get('search'))
    const hasPagingParams =
      request.nextUrl.searchParams.has('page') ||
      request.nextUrl.searchParams.has('pageSize') ||
      search !== '' ||
      (category !== '' && category !== 'all')
    const page = normalizePositiveInteger(
      request.nextUrl.searchParams.get('page'),
      1
    )
    const pageSize = Math.min(
      normalizePositiveInteger(request.nextUrl.searchParams.get('pageSize'), 10),
      60
    )

    const categoriesQuery = supabaseAdmin
      .from('catalog_categories')
      .select('name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })

    let catalogItemsQuery = supabaseAdmin
      .from('catalog_items')
      .select(
        'id, name, category, item_type, default_price, image_url, pos_display_mode, pos_color, pos_shape, is_composite, track_inventory, is_active',
        hasPagingParams ? { count: 'exact' } : undefined
      )
      .eq('tenant_id', tenantId)
      .eq('is_active', true)

    const searchFilter = buildCatalogSearchFilter(search)

    if (searchFilter) {
      catalogItemsQuery = catalogItemsQuery.or(searchFilter)
    }

    if (category && category !== 'all') {
      catalogItemsQuery = catalogItemsQuery.eq('category', category)
    }

    catalogItemsQuery = catalogItemsQuery.order('name', { ascending: true })

    if (hasPagingParams) {
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1
      catalogItemsQuery = catalogItemsQuery.range(from, to)
    }

    const [categoriesResult, catalogResult] = await Promise.all([
      timing.measure('categories', () => categoriesQuery),
      timing.measure('catalog', () => catalogItemsQuery),
    ])
    const { data: catalogItems, error: catalogError, count } = catalogResult
    const categories = (categoriesResult.data || [])
      .map((row) => (typeof row.name === 'string' ? row.name.trim() : ''))
      .filter(Boolean)

    if (catalogError) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'Failed to load catalog items',
          },
          500
        )
      )
    }

    const catalogItemIds = (catalogItems || [])
      .map((item) => (typeof item.id === 'string' ? item.id.trim() : ''))
      .filter(Boolean)

    let branchOverrides: BranchCatalogItemRow[] = []

    if (catalogItemIds.length > 0) {
      const { data: overrideRows, error: branchOverridesError } =
        await timing.measure('overrides', () => supabaseAdmin
          .from('branch_catalog_items')
          .select('id, catalog_item_id, price, is_active, display_order')
          .eq('branch_id', resolvedBranchId)
          .eq('tenant_id', tenantId)
          .in('catalog_item_id', catalogItemIds))

      if (branchOverridesError) {
        return withAuthCookies(
          auth.response,
          jsonResponse(
            {
              error: 'Failed to load branch catalog overrides',
            },
            500
          )
        )
      }

      branchOverrides = (overrideRows || []) as BranchCatalogItemRow[]
    }

    const disabledOverrideIds = new Set(
      branchOverrides
        .filter((override) => override.is_active === false)
        .map((override) => override.catalog_item_id)
    )
    const visibleCatalogItems = (catalogItems || []).filter(
      (item) => !disabledOverrideIds.has(item.id)
    )

    if (!hasPagingParams) {
      const { data: legacyOverrides, error: branchOverridesError } =
        await timing.measure('overrides', () => supabaseAdmin
          .from('branch_catalog_items')
          .select('id, catalog_item_id, price, is_active, display_order')
          .eq('branch_id', resolvedBranchId)
          .eq('tenant_id', tenantId))

      if (branchOverridesError) {
        return withAuthCookies(
          auth.response,
          jsonResponse(
            {
              error: 'Failed to load branch catalog overrides',
            },
            500
          )
        )
      }

      branchOverrides = (legacyOverrides || []) as BranchCatalogItemRow[]
    }

    const stockItemIds = (hasPagingParams ? visibleCatalogItems : catalogItems || [])
      .map((item) => (typeof item.id === 'string' ? item.id.trim() : ''))
      .filter(Boolean)

    let inventoryStock: InventoryStockRow[] = []

    if (stockItemIds.length > 0) {
      const { data: stockRows, error: stockError } = await timing.measure('stock', () => supabaseAdmin
        .from('inventory_stock')
        .select('catalog_item_id, quantity_on_hand, low_stock_threshold')
        .eq('tenant_id', tenantId)
        .eq('branch_id', resolvedBranchId)
        .in('catalog_item_id', stockItemIds))

      if (stockError) {
        return withAuthCookies(
          auth.response,
          jsonResponse(
            {
              error: 'Failed to load inventory stock',
            },
            500
          )
        )
      }

      inventoryStock = (stockRows || []) as InventoryStockRow[]
    }

    const items = timing.measureSync('map', () => mapBranchCatalogToInvoiceProducts(
      (hasPagingParams ? visibleCatalogItems : catalogItems || []) as CatalogItemRow[],
      branchOverrides,
      inventoryStock,
      resolvedBranchId
    ))

    const responsePayload: Record<string, unknown> = {
      success: true,
      branchId: resolvedBranchId,
      products: items,
      categories,
    }

    if (hasPagingParams) {
      responsePayload.total = count || 0
      responsePayload.page = page
      responsePayload.pageSize = pageSize
    }

    const response = await timing.measure('serialize', async () => withAuthCookies(
      auth.response,
      jsonResponse(responsePayload)
    ))
    response.headers.set('Cache-Control', 'no-store, max-age=0')

    return timing.finish(response)
  } catch {
    return withAuthCookies(
      auth.response,
      jsonResponse(
        {
          error: 'Unexpected invoice catalog error',
        },
        500
      )
    )
  }
}

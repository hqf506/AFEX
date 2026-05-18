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

function normalizeBranchId(value: string | null) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin', 'employee', 'cashier'])

  if (!auth.ok) {
    return auth.response
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

    const requestedBranchId = normalizeBranchId(
      request.nextUrl.searchParams.get('branchId')
    )

    const profileBranchId = normalizeBranchId(auth.profile.branch_id || null)

    if (
      auth.profile.scope_type !== 'system' &&
      requestedBranchId &&
      profileBranchId &&
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

    const resolvedBranchId = requestedBranchId || profileBranchId

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
      await branchQuery.maybeSingle()

    if (branchError) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'Failed to validate branch',
            details: branchError.message,
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

    const branchOverridesQuery = supabaseAdmin
      .from('branch_catalog_items')
      .select('id, catalog_item_id, price, is_active, display_order')
      .eq('branch_id', resolvedBranchId)
      .eq('tenant_id', tenantId)

    const { data: branchOverrides, error: branchOverridesError } =
      await branchOverridesQuery

    if (branchOverridesError) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'Failed to load branch catalog overrides',
            details: branchOverridesError.message,
          },
          500
        )
      )
    }

    const catalogItemsQuery = supabaseAdmin
      .from('catalog_items')
      .select(
        'id, name, category, item_type, default_price, image_url, pos_display_mode, pos_color, pos_shape, is_composite, track_inventory, is_active'
      )
      .eq('tenant_id', tenantId)

    const { data: catalogItems, error: catalogError } = await catalogItemsQuery

    if (catalogError) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'Failed to load catalog items',
            details: catalogError.message,
          },
          500
        )
      )
    }

    const catalogItemIds = (catalogItems || [])
      .map((item) => (typeof item.id === 'string' ? item.id.trim() : ''))
      .filter(Boolean)

    let inventoryStock: InventoryStockRow[] = []

    if (catalogItemIds.length > 0) {
      const { data: stockRows, error: stockError } = await supabaseAdmin
        .from('inventory_stock')
        .select('catalog_item_id, quantity_on_hand, low_stock_threshold')
        .eq('tenant_id', tenantId)
        .eq('branch_id', resolvedBranchId)
        .in('catalog_item_id', catalogItemIds)

      if (stockError) {
        return withAuthCookies(
          auth.response,
          jsonResponse(
            {
              error: 'Failed to load inventory stock',
              details: stockError.message,
            },
            500
          )
        )
      }

      inventoryStock = (stockRows || []) as InventoryStockRow[]
    }

    const items = mapBranchCatalogToInvoiceProducts(
      (catalogItems || []) as CatalogItemRow[],
      (branchOverrides || []) as BranchCatalogItemRow[],
      inventoryStock,
      resolvedBranchId
    )

    const response = withAuthCookies(
      auth.response,
      jsonResponse({
        success: true,
        branchId: resolvedBranchId,
        products: items,
      })
    )
    response.headers.set('Cache-Control', 'no-store, max-age=0')

    return response
  } catch (error) {
    return withAuthCookies(
      auth.response,
      jsonResponse(
        {
          error: 'Unexpected invoice catalog error',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      )
    )
  }
}

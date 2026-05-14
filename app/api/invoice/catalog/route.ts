import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { mapBranchCatalogToInvoiceProducts } from '@/lib/invoices/catalog'
import type {
  BranchCatalogItemRow,
  CatalogItemRow,
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
          400
        )
      )
    }

    const requestedBranchId = normalizeBranchId(
      request.nextUrl.searchParams.get('branchId')
    )

    const resolvedBranchId =
      auth.profile.scope_type === 'system'
        ? requestedBranchId
        : auth.profile.branch_id || ''

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
        'id, name, category, item_type, default_price, image_url, pos_display_mode, pos_color, pos_shape, is_active'
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

    const items = mapBranchCatalogToInvoiceProducts(
      (catalogItems || []) as CatalogItemRow[],
      (branchOverrides || []) as BranchCatalogItemRow[]
    )

    return withAuthCookies(
      auth.response,
      jsonResponse({
        success: true,
        branchId: resolvedBranchId,
        products: items,
      })
    )
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

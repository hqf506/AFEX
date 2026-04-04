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

    const { data: branchOverrides, error: branchOverridesError } =
      await supabaseAdmin
        .from('branch_catalog_items')
        .select('catalog_item_id, price, is_active, display_order')
        .eq('branch_id', resolvedBranchId)

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

    const { data: catalogItems, error: catalogError } = await supabaseAdmin
      .from('catalog_items')
      .select('id, name, category, item_type, default_price, image_url, is_active')

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

    const products = mapBranchCatalogToInvoiceProducts(
      (catalogItems || []) as CatalogItemRow[],
      (branchOverrides || []) as BranchCatalogItemRow[]
    )

    return withAuthCookies(
      auth.response,
      jsonResponse({
        success: true,
        branchId: resolvedBranchId,
        products,
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

import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { ADMIN_BRANCH_FILTER_ALL } from '@/lib/admin/branch-filter'
import { supabaseAdmin } from '@/lib/supabase/admin'

type BranchRecord = {
  id: string
  name: string
}

type InventoryRpcRow = {
  catalog_item_id?: string | null
  item_name?: string | null
  item_type?: 'product' | 'service' | string | null
  category_id?: string | null
  quantity_on_hand?: number | string | null
  low_stock_threshold?: number | string | null
  is_low_stock?: boolean | null
}

type InventoryRow = {
  branch_id: string
  branch_name: string
  catalog_item_id: string
  item_name: string
  item_type: 'product' | 'service' | string
  category_id: string | null
  quantity_on_hand: number
  low_stock_threshold: number
  is_low_stock: boolean
}

function normalizeText(value: string | null) {
  return (value || '').trim()
}

function normalizePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeNumber(value: unknown) {
  const numericValue = Number(value ?? 0)
  return Number.isFinite(numericValue) ? numericValue : 0
}

function normalizeInventoryRow(row: InventoryRpcRow, branch: BranchRecord) {
  const quantityOnHand = normalizeNumber(row.quantity_on_hand)
  const lowStockThreshold = normalizeNumber(row.low_stock_threshold)

  return {
    branch_id: branch.id,
    branch_name: branch.name,
    catalog_item_id: String(row.catalog_item_id || ''),
    item_name: String(row.item_name || ''),
    item_type: row.item_type || 'product',
    category_id: row.category_id || null,
    quantity_on_hand: quantityOnHand,
    low_stock_threshold: lowStockThreshold,
    is_low_stock:
      quantityOnHand <= 0 ||
      (lowStockThreshold > 0 && quantityOnHand <= lowStockThreshold),
  } satisfies InventoryRow
}

function getStockStatus(row: InventoryRow) {
  if (row.quantity_on_hand <= 0) return 'out'
  if (
    row.low_stock_threshold > 0 &&
    row.quantity_on_hand <= row.low_stock_threshold
  ) {
    return 'low'
  }

  return 'available'
}

function applyInventoryFilters(
  rows: InventoryRow[],
  filters: {
    search: string
    categoryId: string
    stockStatus: string
  }
) {
  return rows.filter((row) => {
    const matchesSearch =
      !filters.search ||
      row.item_name.includes(filters.search) ||
      row.branch_name.includes(filters.search)

    const matchesCategory =
      !filters.categoryId || row.category_id === filters.categoryId

    const matchesStockStatus =
      !filters.stockStatus || getStockStatus(row) === filters.stockStatus

    return matchesSearch && matchesCategory && matchesStockStatus
  })
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
        jsonResponse({ error: 'tenant context missing' }, 403)
      )
    }

    const requestedBranchId = normalizeText(
      request.nextUrl.searchParams.get('branchId')
    )
    const search = normalizeText(request.nextUrl.searchParams.get('search'))
    const categoryId = normalizeText(
      request.nextUrl.searchParams.get('categoryId')
    )
    const stockStatus = normalizeText(
      request.nextUrl.searchParams.get('stockStatus')
    )
    const page = normalizePositiveInteger(
      request.nextUrl.searchParams.get('page'),
      1
    )
    const pageSize = Math.min(
      normalizePositiveInteger(request.nextUrl.searchParams.get('pageSize'), 25),
      100
    )
    const isSystemScope = auth.profile.scope_type === 'system'

    if (!isSystemScope && !auth.profile.branch_id) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'A branch is required to load inventory' }, 400)
      )
    }

    if (
      !isSystemScope &&
      requestedBranchId &&
      requestedBranchId !== ADMIN_BRANCH_FILTER_ALL &&
      requestedBranchId !== auth.profile.branch_id
    ) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'Requested branch is not allowed' }, 403)
      )
    }

    if (!isSystemScope && requestedBranchId === ADMIN_BRANCH_FILTER_ALL) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'All branches inventory is not allowed' }, 403)
      )
    }

    const targetBranchId = isSystemScope
      ? requestedBranchId
      : auth.profile.branch_id || ''

    let branchQuery = supabaseAdmin
      .from('branches')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name', { ascending: true })

    if (targetBranchId && targetBranchId !== ADMIN_BRANCH_FILTER_ALL) {
      branchQuery = branchQuery.eq('id', targetBranchId)
    }

    const { data: branches, error: branchesError } = await branchQuery

    if (branchesError) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'Failed to load branches',
            details: branchesError.message,
          },
          500
        )
      )
    }

    const targetBranches = (branches || []) as BranchRecord[]

    if (targetBranches.length === 0) {
      return withAuthCookies(
        auth.response,
        jsonResponse({
          success: true,
          items: [],
          rows: [],
          lowStockRows: [],
          total: 0,
          page,
          pageSize,
          summary: {
            total: 0,
            lowStockCount: 0,
          },
        })
      )
    }

    const inventoryResponses = await Promise.all(
      targetBranches.map(async (branch) => {
        const { data, error } = await supabaseAdmin.rpc('get_branch_inventory', {
          p_tenant_id: tenantId,
          p_branch_id: branch.id,
        })

        if (error) {
          throw new Error(error.message || 'Failed to load inventory')
        }

        return Array.isArray(data)
          ? data.map((row) => normalizeInventoryRow(row as InventoryRpcRow, branch))
          : []
      })
    )

    const mergedRows = inventoryResponses
      .flat()
      .sort((left, right) => {
        const branchComparison = left.branch_name.localeCompare(
          right.branch_name,
          'ar'
        )

        if (branchComparison !== 0) return branchComparison
        return left.item_name.localeCompare(right.item_name, 'ar')
      })
    const filteredRows = applyInventoryFilters(mergedRows, {
      search,
      categoryId,
      stockStatus,
    })
    const total = filteredRows.length
    const lowStockRows = filteredRows.filter((row) => row.is_low_stock)
    const from = (page - 1) * pageSize
    const pagedRows = filteredRows.slice(from, from + pageSize)

    const response = withAuthCookies(
      auth.response,
      jsonResponse({
        success: true,
        items: pagedRows,
        rows: pagedRows,
        lowStockRows,
        total,
        page,
        pageSize,
        summary: {
          total,
          lowStockCount: lowStockRows.length,
        },
      })
    )
    response.headers.set('Cache-Control', 'no-store, max-age=0')

    return response
  } catch (error) {
    return withAuthCookies(
      auth.response,
      jsonResponse(
        {
          error: 'Unexpected inventory error',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      )
    )
  }
}

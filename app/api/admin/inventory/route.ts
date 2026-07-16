import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { ADMIN_BRANCH_FILTER_ALL } from '@/lib/admin/branch-filter'
import {
  normalizeAndFilterInventoryRows,
  runWithConcurrency,
  sortInventoryRows,
  type InventoryBranch,
  type InventoryDataRow,
  type InventoryRpcRow,
} from '@/lib/inventory/data-loading'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createServerTiming } from '@/lib/performance/server-timing'

const INVENTORY_RPC_CONCURRENCY = 4

function normalizeText(value: string | null) {
  return (value || '').trim()
}

function normalizePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export async function GET(request: NextRequest) {
  const timing = createServerTiming()
  const auth = await timing.measure('auth', () => requireApiAuth(request, ['admin']))

  if (!auth.ok) {
    return timing.finish(auth.response)
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return timing.finish(withAuthCookies(
        auth.response,
        jsonResponse({ error: 'tenant context missing' }, 403)
      ))
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
      return timing.finish(withAuthCookies(
        auth.response,
        jsonResponse({ error: 'A branch is required to load inventory' }, 400)
      ))
    }

    if (
      !isSystemScope &&
      requestedBranchId &&
      requestedBranchId !== ADMIN_BRANCH_FILTER_ALL &&
      requestedBranchId !== auth.profile.branch_id
    ) {
      return timing.finish(withAuthCookies(
        auth.response,
        jsonResponse({ error: 'Requested branch is not allowed' }, 403)
      ))
    }

    if (!isSystemScope && requestedBranchId === ADMIN_BRANCH_FILTER_ALL) {
      return timing.finish(withAuthCookies(
        auth.response,
        jsonResponse({ error: 'All branches inventory is not allowed' }, 403)
      ))
    }

    const targetBranchId = isSystemScope
      ? requestedBranchId
      : auth.profile.branch_id || ''

    let branchQuery = supabaseAdmin
      .from('branches')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name', { ascending: true })

    if (targetBranchId && targetBranchId !== ADMIN_BRANCH_FILTER_ALL) {
      branchQuery = branchQuery.eq('id', targetBranchId)
    }

    const { data: branches, error: branchesError } =
      await timing.measure('branches', () => branchQuery)

    if (branchesError) {
      return timing.finish(withAuthCookies(
        auth.response,
        jsonResponse({ error: 'Failed to load branches' }, 500)
      ))
    }

    const targetBranches = (branches || []) as InventoryBranch[]

    if (targetBranches.length === 0) {
      return timing.finish(withAuthCookies(
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
      ))
    }

    const filteredRows: InventoryDataRow[] = []
    await timing.measure('rpc', () => runWithConcurrency(
      targetBranches,
      INVENTORY_RPC_CONCURRENCY,
      async (branch) => {
        const { data, error } = await supabaseAdmin.rpc('get_branch_inventory', {
          p_tenant_id: tenantId,
          p_branch_id: branch.id,
        })

        if (error) {
          throw new Error(error.message || 'Failed to load inventory')
        }

        if (!Array.isArray(data)) return

        const branchRows = normalizeAndFilterInventoryRows(
          data as InventoryRpcRow[],
          branch,
          { search, categoryId, stockStatus }
        )

        for (const row of branchRows) {
          filteredRows.push(row)
        }
      }
    ))

    timing.measureSync('sort', () => sortInventoryRows(filteredRows))
    const { total, lowStockRows, pagedRows } = timing.measureSync('pagination', () => {
      const total = filteredRows.length
      const lowStockRows = filteredRows.filter((row) => row.is_low_stock)
      const from = (page - 1) * pageSize
      const pagedRows = filteredRows.slice(from, from + pageSize)
      return { total, lowStockRows, pagedRows }
    })

    const response = await timing.measure('serialize', async () => withAuthCookies(
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
    ))
    response.headers.set('Cache-Control', 'no-store, max-age=0')

    return timing.finish(response)
  } catch {
    return timing.finish(withAuthCookies(
      auth.response,
      jsonResponse({ error: 'Unexpected inventory error' }, 500)
    ))
  }
}

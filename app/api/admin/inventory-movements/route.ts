import { NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireApiAuth } from '@/lib/api-auth'
import { shouldFilterByBranch } from '@/lib/branch-access'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 50
const INVENTORY_MOVEMENT_SELECT =
  'id, branch_id, catalog_item_id, movement_type, quantity_delta, source_type, notes, created_at, item_name, branch_name, resolved_employee_name, created_by_name, actor_name, actor_type'

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback
}

function dateValue(value: string | null) {
  const normalized = (value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])
  if (!auth.ok) return auth.response

  const tenantId = auth.profile.tenant_id
  if (!tenantId) {
    return jsonWithAuthCookies(auth.response, { success: false, error: 'Tenant context is required' }, 403)
  }

  const params = request.nextUrl.searchParams
  const page = positiveInteger(params.get('page'), 1)
  const pageSize = Math.min(positiveInteger(params.get('pageSize'), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
  const requestedBranchId = (params.get('branchId') || '').trim()
  const movementType = (params.get('movementType') || '').trim()
  const dateFrom = dateValue(params.get('dateFrom'))
  const dateTo = dateValue(params.get('dateTo'))
  const search = (params.get('search') || '').trim().replace(/[\\%_]/g, (character) => `\\${character}`)
  const branchId = shouldFilterByBranch(auth.profile.scope_type, auth.profile.branch_id)
    ? auth.profile.branch_id || ''
    : requestedBranchId

  let query = supabaseAdmin
    .from('inventory_movements_view')
    .select(INVENTORY_MOVEMENT_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
  query = applyTenantFilter(query, tenantId)

  if (branchId) query = query.eq('branch_id', branchId)
  if (movementType) query = query.eq('movement_type', movementType)
  if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`)
  if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59.999`)
  if (search) query = query.ilike('item_name', `%${search}%`)

  const from = (page - 1) * pageSize
  console.info('[inventory-movements] Supabase query', {
    relation: 'inventory_movements_view',
    select: INVENTORY_MOVEMENT_SELECT,
    filters: {
      tenant: true,
      branch: Boolean(branchId),
      movementType: Boolean(movementType),
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      search: Boolean(search),
    },
    range: { from, to: from + pageSize - 1 },
  })
  const { data, error, count } = await query.range(from, from + pageSize - 1)
  if (error) {
    return jsonWithAuthCookies(auth.response, { success: false, error: 'Failed to load inventory movements' }, 500)
  }

  const rows = Array.isArray(data) ? data : []
  const catalogItemIds = [...new Set(rows.map((row) => row.catalog_item_id).filter(Boolean))]
  const branchIds = [...new Set(rows.map((row) => row.branch_id).filter(Boolean))]
  const [catalogResult, branchResult] = await Promise.all([
    catalogItemIds.length
      ? supabaseAdmin.from('catalog_items').select('id, name').eq('tenant_id', tenantId).in('id', catalogItemIds)
      : Promise.resolve({ data: [], error: null }),
    branchIds.length
      ? supabaseAdmin.from('branches').select('id, name').eq('tenant_id', tenantId).in('id', branchIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (catalogResult.error || branchResult.error) {
    return jsonWithAuthCookies(auth.response, { success: false, error: 'Failed to enrich inventory movements' }, 500)
  }

  const itemNames = new Map((catalogResult.data || []).map((row) => [row.id, row.name || '']))
  const branchNames = new Map((branchResult.data || []).map((row) => [row.id, row.name || '']))

  return jsonWithAuthCookies(auth.response, {
    success: true,
    rows: rows.map((row) => ({
      ...row,
      item_name: row.item_name || itemNames.get(row.catalog_item_id) || '-',
      branch_name: row.branch_name || branchNames.get(row.branch_id) || '-',
    })),
    total: count || 0,
    page,
    pageSize,
  })
}

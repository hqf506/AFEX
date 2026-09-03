import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import {
  assertInventoryMovementCursorScope,
  createInventoryCursorBoundaryFilter,
  createInventoryMovementScopeCanonical,
  encodeInventoryMovementCursor,
  InventoryMovementsBranchDeniedError,
  InventoryMovementsContractError,
  parseInventoryMovementsContract,
  resolveInventoryMovementBranchScope,
  type InventoryMovementsV2Response,
} from '@/lib/admin/inventory-movements-contract'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireApiAuth } from '@/lib/api-auth'
import { APP_COMPAT_SERVER_FLAGS } from '@/lib/offline/application-compatibility'
import { createServerTiming } from '@/lib/performance/server-timing'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'

const INVENTORY_MOVEMENT_SELECT =
  'id, branch_id, catalog_item_id, movement_type, quantity_delta, source_type, notes, created_at, item_name, branch_name, resolved_employee_name, created_by_name, actor_name, actor_type'

function contractErrorMessage(error: unknown) {
  if (!(error instanceof InventoryMovementsContractError)) {
    return 'معايير سجل المخزون غير صالحة.'
  }
  if (error.code === 'INVALID_WINDOW') {
    return 'نطاق التاريخ غير صالح أو يتجاوز 366 يومًا.'
  }
  if (
    error.code === 'INVALID_CURSOR' ||
    error.code === 'INVALID_CURSOR_SCOPE'
  ) {
    return 'مؤشر الصفحة غير صالح لنطاق الاستعلام الحالي.'
  }
  return 'معايير سجل المخزون غير صالحة.'
}

export async function GET(request: NextRequest) {
  const timing = createServerTiming()
  const auth = await timing.measure('auth', () =>
    requireApiAuth(request, ['admin'])
  )
  if (!auth.ok) return timing.finish(auth.response)

  if (!APP_COMPAT_SERVER_FLAGS.inventoryHistoryV2) {
    return timing.finish(
      jsonWithAuthCookies(
        auth.response,
        { success: false, error: 'Not found' },
        404
      )
    )
  }

  const tenantId = auth.profile.tenant_id
  if (!tenantId) {
    return timing.finish(
      jsonWithAuthCookies(
        auth.response,
        { success: false, error: 'Tenant context is required' },
        403
      )
    )
  }

  let input
  try {
    input = parseInventoryMovementsContract(request.nextUrl.searchParams)
  } catch (error) {
    return timing.finish(
      jsonWithAuthCookies(
        auth.response,
        { success: false, error: contractErrorMessage(error) },
        400
      )
    )
  }

  let branchId = ''
  try {
    branchId = resolveInventoryMovementBranchScope({
      branchAccessMode: auth.context.branchAccess.mode,
      activeBranchId: auth.context.activeBranchId,
      requestedBranchId: input.requestedBranchId,
    })
  } catch (error) {
    if (!(error instanceof InventoryMovementsBranchDeniedError)) throw error
    return timing.finish(
      jsonWithAuthCookies(
        auth.response,
        { success: false, error: 'لا تملك صلاحية عرض هذا الفرع.' },
        403
      )
    )
  }

  const cursorScope = createHash('sha256')
    .update(
      createInventoryMovementScopeCanonical({
        tenantId,
        branchId,
        fromDate: input.scopeWindow.fromDate,
        toDate: input.scopeWindow.toDate,
        upperBoundMode: input.scopeWindow.upperBoundMode,
        movementType: input.movementType,
        search: input.search,
      }),
      'utf8'
    )
    .digest('hex')
  try {
    assertInventoryMovementCursorScope(input.cursor, cursorScope)
  } catch (error) {
    return timing.finish(
      jsonWithAuthCookies(
        auth.response,
        { success: false, error: contractErrorMessage(error) },
        400
      )
    )
  }

  const escapedSearch = input.search.replace(
    /[\\%_]/g,
    (character) => `\\${character}`
  )
  let query = supabaseAdmin
    .from('inventory_movements_view')
    .select(INVENTORY_MOVEMENT_SELECT)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .gte('created_at', input.window.from)
    .lte('created_at', input.window.to)
    .abortSignal(request.signal)
  query = applyTenantFilter(query, tenantId)

  if (branchId) query = query.eq('branch_id', branchId)
  if (input.movementType) query = query.eq('movement_type', input.movementType)
  if (escapedSearch) query = query.ilike('item_name', `%${escapedSearch}%`)
  if (input.cursor) {
    query = query.or(createInventoryCursorBoundaryFilter(input.cursor))
  }

  const { data, error } = await timing.measure('items', () =>
    query.limit(input.pageSize + 1)
  )
  if (error) {
    return timing.finish(
      jsonWithAuthCookies(
        auth.response,
        { success: false, error: 'تعذر تحميل حركات المخزون حاليًا.' },
        500
      )
    )
  }

  const rawRows = Array.isArray(data) ? data : []
  const hasMore = rawRows.length > input.pageSize
  const rows = rawRows.slice(0, input.pageSize)
  const catalogItemIds = [
    ...new Set(rows.map((row) => row.catalog_item_id).filter(Boolean)),
  ]
  const branchIds = [
    ...new Set(rows.map((row) => row.branch_id).filter(Boolean)),
  ]
  const [catalogResult, branchResult] = await Promise.all([
    catalogItemIds.length
      ? timing.measure('catalog', () =>
          supabaseAdmin
            .from('catalog_items')
            .select('id, name')
            .eq('tenant_id', tenantId)
            .in('id', catalogItemIds)
        )
      : Promise.resolve({ data: [], error: null }),
    branchIds.length
      ? timing.measure('branches', () =>
          supabaseAdmin
            .from('branches')
            .select('id, name')
            .eq('tenant_id', tenantId)
            .in('id', branchIds)
        )
      : Promise.resolve({ data: [], error: null }),
  ])
  if (catalogResult.error || branchResult.error) {
    return timing.finish(
      jsonWithAuthCookies(
        auth.response,
        { success: false, error: 'تعذر استكمال بيانات حركات المخزون.' },
        500
      )
    )
  }

  const itemNames = new Map(
    (catalogResult.data || []).map((row) => [row.id, row.name || ''])
  )
  const branchNames = new Map(
    (branchResult.data || []).map((row) => [row.id, row.name || ''])
  )
  const serializedRows = rows.map((row) => ({
    id: row.id,
    branch_id: row.branch_id,
    catalog_item_id: row.catalog_item_id,
    movement_type: row.movement_type,
    quantity_delta: row.quantity_delta,
    source_type: row.source_type,
    notes: row.notes,
    created_at: row.created_at,
    item_name: row.item_name || itemNames.get(row.catalog_item_id) || '-',
    branch_name: row.branch_name || branchNames.get(row.branch_id) || '-',
    resolved_employee_name: row.resolved_employee_name || '',
    created_by_name: row.created_by_name || '',
    actor_name: row.actor_name || '',
    actor_type: row.actor_type || 'unknown',
  }))
  const lastRow = hasMore ? serializedRows.at(-1) : null
  const nextCursor =
    lastRow?.id && lastRow.created_at
      ? encodeInventoryMovementCursor({
          id: lastRow.id,
          created_at: lastRow.created_at,
          scope: cursorScope,
        })
      : null

  const responseBody: InventoryMovementsV2Response = {
    success: true,
    rows: serializedRows,
    pageSize: input.pageSize,
    nextCursor,
    window: input.window,
  }
  return timing.finish(jsonWithAuthCookies(auth.response, responseBody))
}

import { NextRequest } from 'next/server'

import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireApiAuth } from '@/lib/api-auth'
import {
  isBranchScopedWithoutBranchId,
  shouldFilterByBranch,
} from '@/lib/branch-access'
import { type OrderSourceRow } from '@/lib/orders/normalize'
import { canViewReportRange } from '@/lib/permissions'
import {
  buildReportDateRange,
  enrichOrdersWithCatalogFinancials,
  mapOrderSourceRowToReportOrderRecord,
  type CatalogFinancialSource,
  type ReportRange,
} from '@/lib/reports/core'
import { buildSalesByCustomerRows } from '@/lib/reports/sales-by-customer'
import { buildSalesByCategoryRows } from '@/lib/reports/sales-by-category'
import {
  buildSalesByEmployeeRows,
  type EmployeeProfileSource,
  type EmployeeReportOrder,
} from '@/lib/reports/sales-by-employee'
import { buildSalesByItemRows } from '@/lib/reports/sales-by-item'
import {
  buildSalesTrendRows,
  type SalesTrendGrouping,
} from '@/lib/reports/sales-trend'
import {
  createReportServerTiming,
  type ReportServerTiming,
} from '@/lib/reports/server-timing'
import { applyTenantFilter } from '@/lib/tenant-filter'

type SalesPerformanceReportType =
  | 'customer'
  | 'employee'
  | 'item'
  | 'category'
  | 'trend'
type ApiAuthSuccess = Extract<Awaited<ReturnType<typeof requireApiAuth>>, { ok: true }>

const VALID_REPORT_TYPES = new Set<SalesPerformanceReportType>([
  'customer',
  'employee',
  'item',
  'category',
  'trend',
])
const VALID_TREND_GROUPINGS = new Set<SalesTrendGrouping>([
  'day',
  'week',
  'month',
])
const VALID_REPORT_RANGES = new Set<ReportRange>([
  'daily',
  'monthly',
  'yearly',
  'custom',
])
const REPORTS_FEATURE_DISABLED_MESSAGE =
  'ميزة التقارير غير مفعلة من إعدادات النظام.'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const timing = createReportServerTiming()
  const auth = await timing.measure('auth', () =>
    requireApiAuth(request, ['admin', 'employee'])
  )

  if (!auth.ok) {
    return auth.response
  }

  const tenantId = auth.profile.tenant_id

  if (!tenantId) {
    return jsonWithAuthCookies(
      auth.response,
      { success: false, message: 'تعذر تحديد نطاق المنشأة.' },
      403
    )
  }

  try {
    if (!(await timing.measure('settings', () =>
      isReportsFeatureEnabled(auth.supabase, tenantId)
    ))) {
      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          error: REPORTS_FEATURE_DISABLED_MESSAGE,
          message: REPORTS_FEATURE_DISABLED_MESSAGE,
        },
        403
      )
    }

    const params = request.nextUrl.searchParams
    const reportType = parseReportType(params.get('type'))
    const range = parseReportRange(params.get('range'))
    const dateFrom = normalizeDateInput(params.get('dateFrom'))
    const dateTo = normalizeDateInput(params.get('dateTo')) || dateFrom
    const branchId = normalizeUuidString(params.get('branchId'))
    const trendGrouping = parseTrendGrouping(params.get('grouping'))

    if (!dateFrom) {
      return jsonWithAuthCookies(
        auth.response,
        { success: false, message: 'تاريخ البداية مطلوب.' },
        400
      )
    }

    if (range === 'custom' && dateTo && dateTo < dateFrom) {
      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          message: 'تاريخ إلى يجب أن يكون بعد أو مساويا لتاريخ من',
        },
        400
      )
    }

    const { fromIso, toIso } = buildReportDateRange(range, dateFrom, dateTo)

    if (!fromIso || !toIso) {
      return jsonWithAuthCookies(
        auth.response,
        { success: false, message: 'تعذر تحديد نطاق التقرير.' },
        400
      )
    }

    if (!canViewReportRange(auth.profile.role, fromIso, toIso)) {
      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          message: 'الموظف يمكنه عرض تقارير لمدة شهر واحد كحد أقصى',
        },
        403
      )
    }

    if (
      isBranchScopedWithoutBranchId(
        auth.profile.scope_type,
        auth.profile.branch_id
      )
    ) {
      return jsonWithAuthCookies(auth.response, emptyReportResponse(reportType))
    }

    const payload = await buildReport(
      reportType,
      auth,
      tenantId,
      fromIso,
      toIso,
      branchId,
      trendGrouping,
      timing
    )

    const response = await timing.measure('serialize', async () =>
      jsonWithAuthCookies(auth.response, payload)
    )
    return timing.finish(response)
  } catch (error) {
    console.error('[reports-sales-performance] unexpected failure', error)
    return jsonWithAuthCookies(
      auth.response,
      { success: false, message: 'تعذر تحميل بيانات تقرير المبيعات.' },
      500
    )
  }
}

function parseTrendGrouping(value: string | null): SalesTrendGrouping {
  return VALID_TREND_GROUPINGS.has(value as SalesTrendGrouping)
    ? (value as SalesTrendGrouping)
    : 'day'
}

async function buildReport(
  reportType: SalesPerformanceReportType,
  auth: ApiAuthSuccess,
  tenantId: string,
  fromIso: string,
  toIso: string,
  branchId: string,
  trendGrouping: SalesTrendGrouping,
  timing: ReportServerTiming
) {
  if (reportType === 'employee') {
    return buildEmployeeReport(auth, tenantId, fromIso, toIso, branchId, timing)
  }
  if (reportType === 'trend') {
    return buildTrendReport(
      auth,
      tenantId,
      fromIso,
      toIso,
      branchId,
      trendGrouping,
      timing
    )
  }
  if (reportType === 'item' || reportType === 'category') {
    return buildItemReport(
      reportType,
      auth,
      tenantId,
      fromIso,
      toIso,
      branchId,
      timing
    )
  }
  return buildCustomerReport(auth, tenantId, fromIso, toIso, branchId, timing)
}

function parseReportType(value: string | null): SalesPerformanceReportType {
  return VALID_REPORT_TYPES.has(value as SalesPerformanceReportType)
    ? (value as SalesPerformanceReportType)
    : 'customer'
}

function parseReportRange(value: string | null): ReportRange {
  return VALID_REPORT_RANGES.has(value as ReportRange)
    ? (value as ReportRange)
    : 'daily'
}

function normalizeDateInput(value: string | null) {
  const normalized = (value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

function normalizeUuidString(value: string | null) {
  const normalized = (value || '').trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    normalized
  )
    ? normalized
    : ''
}

async function isReportsFeatureEnabled(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createSupabaseServerClient>>,
  tenantId: string
) {
  let query = supabase.from('system_settings').select('enable_reports').limit(1)
  query = applyTenantFilter(query, tenantId)

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw error
  }

  return (data as { enable_reports?: boolean | null } | null)?.enable_reports !== false
}

async function buildCustomerReport(
  auth: ApiAuthSuccess,
  tenantId: string,
  fromIso: string,
  toIso: string,
  branchId: string,
  timing: ReportServerTiming
) {
  let ordersQuery = auth.supabase
    .from('orders')
    .select(
      `
        id,
        customers (
          name,
          phone
        ),
        invoices (
          invoice_items (
            item_name_snapshot,
            item_type_snapshot,
            item_category_snapshot,
            quantity,
            unit_price,
            line_total,
            cost_price
          )
        )
      `
    )
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false })

  ordersQuery = applyTenantFilter(ordersQuery, tenantId)
  ordersQuery = applyBranchFilter(ordersQuery, auth, branchId)

  let catalogQuery = auth.supabase
    .from('catalog_items')
    .select('name, item_type, category, default_price, cost_price')
  catalogQuery = applyTenantFilter(catalogQuery, tenantId)

  const [ordersResult, catalogResult] = await Promise.all([
    timing.measure('orders', () => ordersQuery),
    timing.measure('catalog', () => catalogQuery),
  ])

  if (ordersResult.error) {
    throw ordersResult.error
  }

  if (catalogResult.error) {
    console.error(
      '[reports-sales-performance] failed to load catalog financials',
      catalogResult.error
    )
  }

  const normalized = Array.isArray(ordersResult.data)
    ? ordersResult.data.map((row, index) =>
        mapOrderSourceRowToReportOrderRecord(row as OrderSourceRow, index)
      )
    : []
  const enrichedOrders = enrichOrdersWithCatalogFinancials(
    normalized,
    ((catalogResult.data || []) as CatalogFinancialSource[]) || []
  )

  return {
    success: true,
    customerRows: await timing.measure('aggregate', async () =>
      buildSalesByCustomerRows(enrichedOrders)
    ),
  }
}

async function buildEmployeeReport(
  auth: ApiAuthSuccess,
  tenantId: string,
  fromIso: string,
  toIso: string,
  branchId: string,
  timing: ReportServerTiming
) {
  let ordersQuery = auth.supabase
    .from('orders')
    .select(
      `
        id,
        created_by_employee_id,
        customers (
          name,
          phone
        ),
        invoices (
          subtotal,
          discount,
          total
        )
      `
    )
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false })

  ordersQuery = applyTenantFilter(ordersQuery, tenantId)
  ordersQuery = applyBranchFilter(ordersQuery, auth, branchId)

  const { data, error } = await timing.measure('orders', () => ordersQuery)

  if (error) {
    throw error
  }

  const employeeOrders = ((data ?? []) as OrderSourceRow[]).map((row, index) =>
    buildEmployeeOrder(row, index)
  )
  const employeeIds = Array.from(
    new Set(
      employeeOrders
        .map((order) => order.employeeId)
        .filter((id): id is string => Boolean(id))
    )
  )
  const employeeProfiles = await timing.measure('profiles', () =>
    fetchEmployeeProfiles(auth, tenantId, employeeIds)
  )

  return {
    success: true,
    employeeRows: await timing.measure('aggregate', async () =>
      buildSalesByEmployeeRows(employeeOrders, employeeProfiles)
    ),
  }
}

async function buildItemReport(
  reportType: 'item' | 'category',
  auth: ApiAuthSuccess,
  tenantId: string,
  fromIso: string,
  toIso: string,
  branchId: string,
  timing: ReportServerTiming
) {
  let ordersQuery = auth.supabase
    .from('orders')
    .select(`
      id,
      invoices (
        invoice_items (
          item_name_snapshot,
          item_type_snapshot,
          item_category_snapshot,
          quantity,
          unit_price,
          line_total,
          cost_price
        )
      )
    `)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)

  ordersQuery = applyTenantFilter(ordersQuery, tenantId)
  ordersQuery = applyBranchFilter(ordersQuery, auth, branchId)

  let catalogQuery = auth.supabase
    .from('catalog_items')
    .select('name, item_type, category, default_price, cost_price')
  catalogQuery = applyTenantFilter(catalogQuery, tenantId)

  const [ordersResult, catalogResult] = await Promise.all([
    timing.measure('orders', () => ordersQuery),
    timing.measure('catalog', () => catalogQuery),
  ])
  if (ordersResult.error) throw ordersResult.error
  if (catalogResult.error) throw catalogResult.error

  const orders = enrichOrdersWithCatalogFinancials(
    ((ordersResult.data ?? []) as OrderSourceRow[]).map((row, index) =>
      mapOrderSourceRowToReportOrderRecord(row, index)
    ),
    (catalogResult.data ?? []) as CatalogFinancialSource[]
  )

  return timing.measure('aggregate', async () =>
    reportType === 'item'
      ? { success: true, itemRows: buildSalesByItemRows(orders) }
      : { success: true, categoryRows: buildSalesByCategoryRows(orders) }
  )
}

async function buildTrendReport(
  auth: ApiAuthSuccess,
  tenantId: string,
  fromIso: string,
  toIso: string,
  branchId: string,
  grouping: SalesTrendGrouping,
  timing: ReportServerTiming
) {
  let query = auth.supabase
    .from('orders')
    .select('id, created_at, invoices(invoice_items(quantity, line_total))')
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false })
  query = applyTenantFilter(query, tenantId)
  query = applyBranchFilter(query, auth, branchId)

  const { data, error } = await timing.measure('orders', () => query)
  if (error) throw error
  const orders = ((data ?? []) as OrderSourceRow[]).map((row, index) =>
    mapOrderSourceRowToReportOrderRecord(row, index)
  )
  return timing.measure('aggregate', async () => ({
    success: true,
    trendRows: buildSalesTrendRows(orders, grouping, {
      start: fromIso,
      end: toIso,
    }),
  }))
}

function applyBranchFilter<T>(
  query: T,
  auth: ApiAuthSuccess,
  branchId: string
): T {
  if (shouldFilterByBranch(auth.profile.scope_type, auth.profile.branch_id)) {
    return (query as { eq: (column: string, value: string) => T }).eq(
      'branch_id',
      auth.profile.branch_id as string
    )
  }

  if (branchId) {
    return (query as { eq: (column: string, value: string) => T }).eq(
      'branch_id',
      branchId
    )
  }

  return query
}

function buildEmployeeOrder(row: OrderSourceRow, index: number): EmployeeReportOrder {
  const employeeId =
    typeof row.created_by_employee_id === 'string' &&
    row.created_by_employee_id.trim()
      ? row.created_by_employee_id
      : null

  return {
    ...mapOrderSourceRowToReportOrderRecord(row, index),
    employeeId,
  }
}

async function fetchEmployeeProfiles(
  auth: ApiAuthSuccess,
  tenantId: string,
  employeeIds: string[]
) {
  if (employeeIds.length === 0) {
    return [] as EmployeeProfileSource[]
  }

  let profilesQuery = auth.supabase
    .from('profiles')
    .select('id, username, full_name, role')
    .in('id', employeeIds)

  profilesQuery = applyTenantFilter(profilesQuery, tenantId)

  let posProfilesQuery = auth.supabase
    .from('pos_profiles')
    .select('id, username, full_name, role')
    .in('id', employeeIds)

  posProfilesQuery = applyTenantFilter(posProfilesQuery, tenantId)

  const [profilesResult, posProfilesResult] = await Promise.all([
    profilesQuery,
    posProfilesQuery,
  ])

  if (profilesResult.error) {
    console.error(
      '[reports-sales-performance] failed to fetch employee profiles',
      profilesResult.error
    )
  }

  if (posProfilesResult.error) {
    console.error(
      '[reports-sales-performance] failed to fetch POS profiles',
      posProfilesResult.error
    )
  }

  return [
    ...((profilesResult.data ?? []) as EmployeeProfileSource[]),
    ...((posProfilesResult.data ?? []) as EmployeeProfileSource[]),
  ]
}

function emptyReportResponse(reportType: SalesPerformanceReportType) {
  if (reportType === 'employee') {
    return {
      success: true,
      employeeRows: [],
    }
  }

  if (reportType === 'item') return { success: true, itemRows: [] }
  if (reportType === 'category') return { success: true, categoryRows: [] }
  if (reportType === 'trend') return { success: true, trendRows: [] }

  return {
    success: true,
    customerRows: [],
  }
}

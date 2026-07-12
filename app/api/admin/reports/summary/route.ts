import { NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireApiAuth } from '@/lib/api-auth'
import {
  isBranchScopedWithoutBranchId,
  shouldFilterByBranch,
} from '@/lib/branch-access'
import { canViewReportRange } from '@/lib/permissions'
import { type OrderSourceRow } from '@/lib/orders/normalize'
import {
  buildReportDateRange,
  buildReportOrderSummary,
  enrichOrdersWithCatalogFinancials,
  getReportTopServices,
  mapOrderSourceRowToReportOrderRecord,
  type CatalogFinancialSource,
  type ReportOrderRecord,
  type ReportRange,
} from '@/lib/reports/core'
import { applyTenantFilter } from '@/lib/tenant-filter'

type ReportOrderSummaryRow = Omit<ReportOrderRecord, 'items'> & {
  cost_total: number
  profit_total: number
}

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
  const auth = await requireApiAuth(request, ['admin', 'employee'])

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
    if (!(await isReportsFeatureEnabled(auth.supabase, tenantId))) {
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
    const range = parseReportRange(params.get('range'))
    const dateFrom = normalizeDateInput(params.get('dateFrom'))
    const dateTo = normalizeDateInput(params.get('dateTo')) || dateFrom
    const branchId = normalizeUuidString(params.get('branchId'))

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
          message: 'تاريخ "إلى" يجب أن يكون بعد أو مساوياً لتاريخ "من"',
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
          message:
            'الإداري يمكنه عرض تقارير لمدة شهر واحد كحد أقصى',
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
      return jsonWithAuthCookies(auth.response, {
        success: true,
        summary: buildReportOrderSummary([]),
        topServices: [],
        salesTrend: [],
        orders: [],
      })
    }

    let ordersQuery = auth.supabase
      .from('orders')
      .select(
        `
          id,
          order_number,
          status,
          created_at,
          customers (
            name,
            phone
          ),
          invoices (
            invoice_number,
            payment_method,
            payment_status,
            subtotal,
            discount,
            tax,
            total,
            note,
            cash_received,
            remaining_from_customer,
            cash_change,
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

    if (shouldFilterByBranch(auth.profile.scope_type, auth.profile.branch_id)) {
      ordersQuery = ordersQuery.eq('branch_id', auth.profile.branch_id as string)
    } else if (branchId) {
      ordersQuery = ordersQuery.eq('branch_id', branchId)
    }

    let catalogQuery = auth.supabase
      .from('catalog_items')
      .select('name, item_type, category, default_price, cost_price')
    catalogQuery = applyTenantFilter(catalogQuery, tenantId)

    const [ordersResult, catalogResult] = await Promise.all([
      ordersQuery,
      catalogQuery,
    ])

    if (ordersResult.error) {
      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          message: `فشل تحميل التقارير: ${ordersResult.error.message}`,
        },
        500
      )
    }

    if (catalogResult.error) {
      console.error('[reports-summary] failed to load catalog financials', catalogResult.error)
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
    const summary = buildReportOrderSummary(enrichedOrders)
    const topServices = getReportTopServices(enrichedOrders)
    const salesTrend = buildSalesTrend(enrichedOrders)
    const orders = enrichedOrders.map(toSummaryRow)

    return jsonWithAuthCookies(auth.response, {
      success: true,
      summary,
      topServices,
      salesTrend,
      orders,
    })
  } catch (error) {
    console.error('[reports-summary] unexpected failure', error)
    return jsonWithAuthCookies(
      auth.response,
      { success: false, message: 'تعذر تحميل بيانات التقارير.' },
      500
    )
  }
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

function buildSalesTrend(orders: ReportOrderRecord[]) {
  const grouped = orders.reduce<
    Record<string, { key: string; label: string; total: number }>
  >((acc, order) => {
    const createdAt = new Date(order.created_at)
    const key = Number.isNaN(createdAt.getTime())
      ? 'unknown'
      : createdAt.toISOString().slice(0, 10)
    const label = Number.isNaN(createdAt.getTime())
      ? 'غير محدد'
      : createdAt.toLocaleDateString('ar-SA', {
          day: 'numeric',
          month: 'short',
        })

    return {
      ...acc,
      [key]: {
        key,
        label,
        total: (acc[key]?.total ?? 0) + order.total,
      },
    }
  }, {})

  return Object.values(grouped)
    .sort((first, second) => first.key.localeCompare(second.key))
    .slice(-8)
}

function toSummaryRow(order: ReportOrderRecord): ReportOrderSummaryRow {
  const { items, ...rest } = order

  return {
    ...rest,
    cost_total: items.reduce((sum, item) => sum + item.cost_total, 0),
    profit_total: items.reduce((sum, item) => sum + item.profit, 0),
  }
}

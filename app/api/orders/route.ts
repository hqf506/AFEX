import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireApiAuth, type ApiAuthProfile } from '@/lib/api-auth'
import {
  isBranchScopedWithoutBranchId,
  shouldFilterByBranch,
} from '@/lib/branch-access'
import type { OrderStatus } from '@/lib/orders/normalize'
import { applyTenantFilter } from '@/lib/tenant-filter'

type OrdersApiQuery = {
  mode: 'full' | 'meta'
  page: number
  pageSize: number
  branchId: string | null
  status: OrderStatus | 'all'
  search: string
  dateFrom: string | null
  dateTo: string | null
}

type OrdersApiPayload = {
  success: true
  mode: 'full' | 'meta'
  items: unknown[]
  totalCount: number
  page: number
  pageSize: number
  hasMore: boolean
  comparisonSignature: string
}

type CreateOrderItemInput = {
  item_id?: string | null
  item_name?: string
  item_type?: string
  quantity?: number
  unit_price?: number
}

type CreateOrderBody = {
  clientIdempotencyKey?: string
  employee_id?: string | null
  branch_id?: string | null
  customerName?: string
  customerPhone?: string
  paymentMethod?: 'cash' | 'card' | 'transfer'
  discountAmount?: number
  taxAmount?: number
  note?: string
  items?: CreateOrderItemInput[]
}

interface OrdersFilterQuery {
  eq(column: string, value: string): this
  gte(column: string, value: string): this
  lte(column: string, value: string): this
}

type SupabaseServerClient = ReturnType<typeof createServerClient>
type SupabaseErrorLike = {
  code?: string
  details?: string
  hint?: string
  message?: string
}
type IdempotencyOrderQuery = {
  eq(column: string, value: string): IdempotencyOrderQuery
  maybeSingle(): Promise<{
    data: unknown
    error: SupabaseErrorLike | null
  }>
}
type IdempotencyLookupClient = {
  from(table: 'orders'): {
    select(columns: string): IdempotencyOrderQuery
  }
}
type TenantProfileLookupClient = {
  from(table: 'profiles'): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{
          data: { tenant_id?: unknown } | null
          error: SupabaseErrorLike | null
        }>
      }
    }
  }
}

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100
const VALID_ORDER_STATUSES = new Set<OrderStatus>([
  'in_progress',
  'ready',
  'closed',
])

const ORDERS_SELECT = `
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
    note,
    total,
    subtotal,
    discount,
    tax,
    cash_received,
    remaining_from_customer,
    cash_change,
    invoice_items (
      item_name_snapshot,
      item_type_snapshot,
      quantity,
      unit_price,
      line_total,
      cost_price
    )
  )
`

const ORDERS_META_SELECT = `
  id,
  status,
  created_at,
  invoices (
    invoice_number,
    total
  )
`

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin', 'employee'])

  if (!auth.ok) {
    return auth.response
  }

  const query = parseOrdersQuery(request)

  if (!auth.profile.tenant_id) {
    return jsonWithAuthCookies<OrdersApiPayload>(auth.response, {
      success: true,
      mode: query.mode,
      items: [],
      totalCount: 0,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: false,
      comparisonSignature: '',
    })
  }

  if (
    isBranchScopedWithoutBranchId(
      auth.profile.scope_type,
      auth.profile.branch_id
    )
  ) {
    return jsonWithAuthCookies<OrdersApiPayload>(auth.response, {
      success: true,
      mode: query.mode,
      items: [],
      totalCount: 0,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: false,
      comparisonSignature: '',
    })
  }

  try {
    const matchingOrderIds =
      query.search.length > 0
        ? await resolveMatchingOrderIds(auth.supabase, auth.profile, query)
        : null

    if (matchingOrderIds && matchingOrderIds.length === 0) {
      return jsonWithAuthCookies<OrdersApiPayload>(auth.response, {
        success: true,
        mode: query.mode,
        items: [],
        totalCount: 0,
        page: query.page,
        pageSize: query.pageSize,
        hasMore: false,
        comparisonSignature: '',
      })
    }

    const rangeFrom = (query.page - 1) * query.pageSize
    const rangeTo = rangeFrom + query.pageSize - 1

    const selectClause =
      query.mode === 'meta' ? ORDERS_META_SELECT : ORDERS_SELECT

    let ordersQuery = auth.supabase
      .from('orders')
      .select(selectClause, { count: 'exact' })
      .order('created_at', { ascending: false })

    ordersQuery = applyOrdersFilters(ordersQuery, auth.profile, query)

    if (matchingOrderIds) {
      ordersQuery = ordersQuery.in('id', matchingOrderIds)
    }

    const { data, error, count } = await ordersQuery.range(rangeFrom, rangeTo)

    if (error) {
      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          message: 'حدث خطأ أثناء تحميل الطلبات',
        },
        500
      )
    }

    const items = Array.isArray(data) ? data : []
    const totalCount = Number(count) || 0
    const comparisonSignature = buildOrdersComparisonSignature(items)

    return jsonWithAuthCookies<OrdersApiPayload>(auth.response, {
      success: true,
      mode: query.mode,
      items: query.mode === 'meta' ? [] : items,
      totalCount,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: rangeFrom + items.length < totalCount,
      comparisonSignature,
    })
  } catch {
    return jsonWithAuthCookies(
      auth.response,
      {
        success: false,
        message: 'حدث خطأ أثناء تحميل الطلبات',
      },
      500
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin', 'employee', 'cashier'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const body = (await request.json()) as CreateOrderBody
    const items = Array.isArray(body.items) ? body.items : []
    const rpcName = 'create_invoice_with_items_safe'
    const clientIdempotencyKey = normalizeClientIdempotencyKey(
      body.clientIdempotencyKey
    )
    const createdByEmployeeId = normalizeUuidString(body.employee_id)
    const branchId = normalizeUuidString(body.branch_id)

    const normalizedItems = items.map((item) => ({
      ...item,
      item_id:
        typeof item.item_id === 'string' && item.item_id.trim()
          ? item.item_id.trim()
          : null,
    }))

    const receivedItemIds = Array.from(
      new Set(
        normalizedItems
          .map((item) => item.item_id)
          .filter(
            (itemId): itemId is string =>
              typeof itemId === 'string' && itemId.length > 0
          )
          .map((itemId) => String(itemId).trim())
          .filter(Boolean)
      )
    )

    if (receivedItemIds.length === 0) {
      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          message: 'لا توجد عناصر صالحة لإنشاء الفاتورة',
        },
        400
      )
    }

    const envUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

    if (!envUrl || !serviceRoleKey) {
      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          message: 'حدث خطأ أثناء إنشاء الفاتورة',
        },
        500
      )
    }

    const serviceSupabase = createClient(envUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
    const profileTenantId =
      normalizeUuidString(auth.profile.tenant_id) ||
      (await resolveProfileTenantId(serviceSupabase, auth.profile.id))

    if (!profileTenantId) {
      console.error('[api/orders] missing profile tenant id for order creation', {
        profileId: auth.profile.id,
        authProfileTenantId: auth.profile.tenant_id,
      })
      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          message: 'ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ¯ Ù†Ø·Ø§Ù‚ Ø§Ù„Ù…Ù†Ø´Ø£Ø©',
        },
        400
      )
    }

    if (clientIdempotencyKey) {
      const existingOrder = await findOrderByIdempotencyKey(
        serviceSupabase,
        clientIdempotencyKey,
        profileTenantId
      )

      if (existingOrder) {
        return jsonWithAuthCookies(auth.response, {
          success: true,
          data: existingOrder,
        })
      }
    }

    let validCatalogItemsQuery = serviceSupabase
      .from('catalog_items')
      .select('id')
      .in('id', receivedItemIds)

    validCatalogItemsQuery = applyTenantFilter(
      validCatalogItemsQuery,
      profileTenantId
    )

    const { data: validCatalogItems, error: validCatalogItemsError } =
      await validCatalogItemsQuery

    if (validCatalogItemsError) {
      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          message: 'حدث خطأ أثناء إنشاء الفاتورة',
        },
        500
      )
    }

    const validCatalogItemIds = new Set(
      (Array.isArray(validCatalogItems) ? validCatalogItems : [])
        .map((item) => (typeof item.id === 'string' ? item.id.trim() : ''))
        .filter(Boolean)
    )

    const initiallyInvalidItemIds = receivedItemIds.filter(
      (itemId) => !validCatalogItemIds.has(itemId)
    )

    let branchCatalogIdToCatalogId = new Map<string, string>()

    if (initiallyInvalidItemIds.length > 0) {
      let branchCatalogItemsQuery = serviceSupabase
        .from('branch_catalog_items')
        .select('id, catalog_item_id')
        .in('id', initiallyInvalidItemIds)

      branchCatalogItemsQuery = applyTenantFilter(
        branchCatalogItemsQuery,
        profileTenantId
      )

      const { data: branchCatalogItems } = await branchCatalogItemsQuery

      const normalizedBranchCatalogItems = (Array.isArray(branchCatalogItems)
        ? branchCatalogItems
        : []
      )
        .map((item) => ({
          id: typeof item.id === 'string' ? item.id.trim() : '',
          catalog_item_id:
            typeof item.catalog_item_id === 'string'
              ? item.catalog_item_id.trim()
              : '',
        }))
        .filter((item) => Boolean(item.id && item.catalog_item_id))

      branchCatalogIdToCatalogId = new Map(
        normalizedBranchCatalogItems.map((item) => [item.id, item.catalog_item_id] as const)
      )
    }

    const remappedItems = normalizedItems.map((item) => {
      if (!item.item_id || validCatalogItemIds.has(item.item_id)) {
        return item
      }

      const remappedCatalogItemId = branchCatalogIdToCatalogId.get(item.item_id)

      if (!remappedCatalogItemId) {
        return item
      }

      return {
        ...item,
        item_id: remappedCatalogItemId,
      }
    })

    const remappedItemIds = remappedItems
      .map((item) => item.item_id)
      .filter((itemId): itemId is string =>
        typeof itemId === 'string' && itemId.length > 0
      )

    const invalidItemIds = remappedItemIds.filter(
      (itemId) => !validCatalogItemIds.has(itemId)
    )

    if (invalidItemIds.length > 0) {
      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          message: 'حدث خطأ في بيانات العناصر، الرجاء إعادة الإضافة',
        },
        400
      )
    }

    const validItems = remappedItems.filter(
      (item) => item.item_id && validCatalogItemIds.has(item.item_id)
    )

    if (validItems.length === 0) {
      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          message: 'لا توجد عناصر صالحة لإنشاء الفاتورة',
        },
        400
      )
    }

    const rpcPayload = {
      p_customer_name:
        typeof body.customerName === 'string' ? body.customerName : '',
      p_customer_phone:
        typeof body.customerPhone === 'string' ? body.customerPhone : '',
      p_customer_notes: '',
      p_payment_method:
        body.paymentMethod === 'card' || body.paymentMethod === 'transfer'
          ? body.paymentMethod
          : 'cash',
      p_discount:
        typeof body.discountAmount === 'number' ? body.discountAmount : 0,
      p_tax: typeof body.taxAmount === 'number' ? body.taxAmount : 0,
      p_note: typeof body.note === 'string' ? body.note : '',
      p_items: validItems,
      p_client_idempotency_key: clientIdempotencyKey,
      p_created_by_employee_id: createdByEmployeeId,
      p_tenant_id: profileTenantId,
      p_branch_id: branchId,
    }

    const { data, error } = await auth.supabase.rpc(rpcName, rpcPayload)

    if (error) {
      if (clientIdempotencyKey && isIdempotencyDuplicateError(error)) {
        const existingOrder = await findOrderByIdempotencyKey(
          serviceSupabase,
          clientIdempotencyKey,
          profileTenantId
        )

        if (existingOrder) {
          return jsonWithAuthCookies(auth.response, {
            success: true,
            data: existingOrder,
          })
        }
      }

      console.error('[api/orders] create order rpc failed', {
        rpcName,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      })
      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          message: 'حدث خطأ أثناء إنشاء الفاتورة',
        },
        500
      )
    }

    return jsonWithAuthCookies(auth.response, {
      success: true,
      data: normalizeCreatedOrderData(data),
    })
  } catch {
    return jsonWithAuthCookies(
      auth.response,
      {
        success: false,
        message: 'حدث خطأ أثناء إنشاء الفاتورة',
      },
      500
    )
  }
}

function parseOrdersQuery(request: NextRequest): OrdersApiQuery {
  const params = request.nextUrl.searchParams
  const rawMode = normalizeOptionalString(params.get('mode'))
  const page = clampPositiveInteger(params.get('page'), DEFAULT_PAGE)
  const pageSize = Math.min(
    clampPositiveInteger(params.get('pageSize'), DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  )
  const branchId = normalizeOptionalString(params.get('branchId'))
  const rawStatus = normalizeOptionalString(params.get('status'))
  const status =
    rawStatus && VALID_ORDER_STATUSES.has(rawStatus as OrderStatus)
      ? (rawStatus as OrderStatus)
      : 'all'

  return {
    mode: rawMode === 'meta' ? 'meta' : 'full',
    page,
    pageSize,
    branchId,
    status,
    search: normalizeOrdersSearch(params.get('search')),
    dateFrom: normalizeOptionalString(params.get('dateFrom')),
    dateTo: normalizeOptionalString(params.get('dateTo')),
  }
}

function clampPositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback
  }

  return Math.floor(parsed)
}

function normalizeOptionalString(value: string | null) {
  const normalized = (value || '').trim()
  return normalized ? normalized : null
}

function normalizeClientIdempotencyKey(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()

  return normalized ? normalized.slice(0, 180) : null
}

function normalizeUuidString(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  return uuidPattern.test(normalized) ? normalized : null
}

async function resolveProfileTenantId(supabase: unknown, profileId: string) {
  const client = supabase as TenantProfileLookupClient
  const { data, error } = await client
    .from('profiles')
    .select('tenant_id')
    .eq('id', profileId)
    .maybeSingle()

  if (error) {
    console.warn('[api/orders] unable to resolve profile tenant_id', {
      profileId,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    })
    return null
  }

  return normalizeUuidString(data?.tenant_id)
}

function normalizeCreatedOrderData(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }

  const record = value as Record<string, unknown>
  const orderId = stringValue(record.order_id) || stringValue(record.orderId)
  const orderNumber =
    stringValue(record.order_number) || stringValue(record.orderNumber)
  const invoiceId =
    stringValue(record.invoice_id) || stringValue(record.invoiceId)
  const invoiceNumber =
    stringValue(record.invoice_number) || stringValue(record.invoiceNumber)
  const customerId =
    stringValue(record.customer_id) || stringValue(record.customerId)

  return {
    ...record,
    customer_id: customerId,
    order_id: orderId,
    order_number: orderNumber,
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,
    customerId,
    orderId,
    orderNumber,
    invoiceId,
    invoiceNumber,
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function isIdempotencyDuplicateError(error: {
  code?: string
  details?: string
  message?: string
}) {
  const searchableText = `${error.message || ''} ${error.details || ''}`

  return (
    error.code === '23505' &&
    (searchableText.includes('orders_idempotency_key_unique') ||
      searchableText.includes('client_idempotency_key'))
  )
}

async function findOrderByIdempotencyKey(
  supabase: unknown,
  clientIdempotencyKey: string,
  tenantId: string
) {
  const client = supabase as IdempotencyLookupClient
  let query = client
    .from('orders')
    .select(
      `
        id,
        order_number,
        customer_id,
        status,
        invoices (
          id,
          invoice_number
        )
      `
    )
    .eq('client_idempotency_key', clientIdempotencyKey)

  query = applyTenantFilter(query, tenantId)

  const { data, error } = await query
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  const row = data as {
    id?: string | null
    order_number?: string | null
    customer_id?: string | null
    status?: string | null
    invoices?: unknown
  }
  const invoice = normalizeCreatedInvoiceRecord(row.invoices)
  const orderId = row.id || ''
  const orderNumber = row.order_number || ''
  const invoiceId = invoice?.id || ''
  const invoiceNumber = invoice?.invoice_number || ''
  const customerId = row.customer_id || ''
  const status = row.status || ''

  return {
    customer_id: customerId,
    order_id: orderId,
    order_number: orderNumber,
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,
    status,
    customerId,
    orderId,
    orderNumber,
    invoiceId,
    invoiceNumber,
  }
}

function normalizeCreatedInvoiceRecord(value: unknown) {
  if (Array.isArray(value)) {
    return (value[0] as
      | { id?: string | null; invoice_number?: string | null }
      | undefined) || null
  }

  if (value && typeof value === 'object') {
    return value as { id?: string | null; invoice_number?: string | null }
  }

  return null
}

function normalizeOrdersSearch(value: string | null) {
  return (value || '').trim().replace(/[,()]/g, ' ')
}

function applyOrdersFilters<T extends OrdersFilterQuery>(
  query: T,
  profile: Pick<ApiAuthProfile, 'scope_type' | 'branch_id' | 'tenant_id'>,
  filters: OrdersApiQuery
) {
  let nextQuery = applyTenantFilter(query, profile.tenant_id)

  if (shouldFilterByBranch(profile.scope_type, profile.branch_id)) {
    nextQuery = nextQuery.eq('branch_id', profile.branch_id as string)
  } else if (filters.branchId) {
    nextQuery = nextQuery.eq('branch_id', filters.branchId)
  }

  if (filters.status !== 'all') {
    nextQuery = nextQuery.eq('status', filters.status)
  }

  const fromIso = toUtcBoundaryIso(filters.dateFrom, 'start')
  const toIso = toUtcBoundaryIso(filters.dateTo, 'end')

  if (fromIso) {
    nextQuery = nextQuery.gte('created_at', fromIso)
  }

  if (toIso) {
    nextQuery = nextQuery.lte('created_at', toIso)
  }

  return nextQuery
}

async function resolveMatchingOrderIds(
  supabase: SupabaseServerClient,
  profile: Pick<ApiAuthProfile, 'scope_type' | 'branch_id' | 'tenant_id'>,
  filters: OrdersApiQuery
) {
  const searchPattern = `%${filters.search}%`

  let orderNumberQuery = supabase.from('orders').select('id')
  orderNumberQuery = applyOrdersFilters(orderNumberQuery, profile, filters)
  orderNumberQuery = orderNumberQuery.ilike('order_number', searchPattern)

  let customerQuery = supabase
    .from('orders')
    .select('id, customers!inner(name, phone)')
  customerQuery = applyOrdersFilters(customerQuery, profile, filters)
  customerQuery = customerQuery.or(
    `name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`,
    { foreignTable: 'customers' }
  )

  let invoiceQuery = supabase
    .from('orders')
    .select('id, invoices!inner(invoice_number)')
  invoiceQuery = applyOrdersFilters(invoiceQuery, profile, filters)
  invoiceQuery = invoiceQuery.or(`invoice_number.ilike.%${filters.search}%`, {
    foreignTable: 'invoices',
  })

  const [orderNumberResult, customerResult, invoiceResult] = await Promise.all([
    orderNumberQuery,
    customerQuery,
    invoiceQuery,
  ])

  const combinedIds = new Set<string>()

  for (const result of [orderNumberResult, customerResult, invoiceResult]) {
    if (result.error) {
      throw result.error
    }

    for (const row of Array.isArray(result.data) ? result.data : []) {
      if (row && typeof row.id === 'string' && row.id.trim()) {
        combinedIds.add(row.id)
      }
    }
  }

  return [...combinedIds]
}

function buildOrdersComparisonSignature(items: unknown[]) {
  return items
    .map((item) => {
      const row = item as {
        id?: string
        status?: string
        created_at?: string
        invoices?: unknown
      }
      const invoice = normalizeInvoiceRecord(row.invoices)

      return [
        row.id || '',
        row.status || '',
        row.created_at || '',
        Number(invoice?.total) || 0,
        invoice?.invoice_number || '',
      ].join('|')
    })
    .join('||')
}

function normalizeInvoiceRecord(value: unknown) {
  if (Array.isArray(value)) {
    return (value[0] as
      | { invoice_number?: string | null; total?: number | null }
      | undefined) || null
  }

  if (value && typeof value === 'object') {
    return value as { invoice_number?: string | null; total?: number | null }
  }

  return null
}

function toUtcBoundaryIso(
  value: string | null,
  boundary: 'start' | 'end'
): string | null {
  if (!value) return null

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)

  if (dateOnlyMatch) {
    const [, yearText, monthText, dayText] = dateOnlyMatch
    const year = Number(yearText)
    const month = Number(monthText)
    const day = Number(dayText)

    return new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        boundary === 'start' ? 0 : 23,
        boundary === 'start' ? 0 : 59,
        boundary === 'start' ? 0 : 59,
        boundary === 'start' ? 0 : 999
      )
    ).toISOString()
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString()
}

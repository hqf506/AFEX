import { after, NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireApiAuth, type ApiAuthProfile } from '@/lib/api-auth'
import { createServerTiming } from '@/lib/performance/server-timing'
import { writeAuditLog } from '@/lib/audit-log'
import {
  resolveDigitalInvoiceTemplateSettings,
  type SystemSettings,
} from '@/lib/admin/settings'
import {
  isBranchScopedWithoutBranchId,
  shouldFilterByBranch,
} from '@/lib/branch-access'
import {
  generateInvoicePdfFile,
  type InvoicePdfPayload,
} from '@/lib/invoices/pdf'
import { normalizeDigitalInvoicePaymentMethod } from '@/lib/invoices/digital-preview'
import {
  buildPersistedInvoicePaymentSnapshot,
  getPersistedInvoicePaymentMethod,
  normalizeOrderPaymentMethod,
  roundCurrency,
  type OrderPaymentMethod,
} from '@/lib/invoices/order-payment'
import {
  createInvoiceCostSnapshot,
  InvoiceCostSnapshotError,
} from '@/lib/invoices/create-cost-snapshot'
import { buildOrderCommandIntent } from '@/lib/idempotency/core'
import { createIdempotencyService } from '@/lib/idempotency/service'
import { normalizeSaudiCustomerPhone } from '@/lib/customers'
import {
  disabledFeatureResponse,
  ORDERS_FEATURE_DISABLED_MESSAGE,
  POS_FEATURE_DISABLED_MESSAGE,
} from '@/lib/feature-guards'
import type { OrderStatus } from '@/lib/orders/normalize'
import {
  resolveEffectiveOrderStatus,
  type EffectiveOrderStatus,
} from '@/lib/orders/effective-status'
import { maskId, maskPhone, redactSensitive } from '@/lib/security/redaction'
import { applyTenantFilter } from '@/lib/tenant-filter'
import { isSendableWhatsAppPhone } from '@/lib/whatsapp/messages'
import { sendWhatsAppFile } from '@/lib/whatsapp/service'

type OrdersApiQuery = {
  mode: 'full' | 'meta' | 'details'
  id: string | null
  page: number
  pageSize: number
  branchId: string | null
  status: OrderStatus | 'all'
  search: string
  dateFrom: string | null
  dateTo: string | null
  listFilter: string | null
}

type OrdersApiPayload = {
  success: true
  mode: 'full' | 'meta' | 'details'
  items: unknown[]
  totalCount: number
  page: number
  pageSize: number
  hasMore: boolean
  comparisonSignature: string
  summary?: Record<string, number>
  employeeNames?: Record<string, string>
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
  paymentMethod?: OrderPaymentMethod
  cashReceived?: number
  remainingFromCustomer?: number
  cashChange?: number
  discountAmount?: number
  taxAmount?: number
  note?: string
  items?: CreateOrderItemInput[]
}

type CreatedOrderInvoiceDeliveryRow = {
  id?: string | null
  order_number?: string | null
  branch_id?: string | null
  created_at?: string | null
  customers?: {
    name?: string | null
    phone?: string | null
  } | null
  invoices?: unknown
}

type CreatedOrderInvoiceRecord = {
  id?: string | null
  invoice_number?: string | null
  payment_method?: string | null
  note?: string | null
  total?: number | string | null
  subtotal?: number | string | null
  discount?: number | string | null
  tax?: number | string | null
  cash_received?: number | string | null
  remaining_from_customer?: number | string | null
  cash_change?: number | string | null
  invoice_items?: unknown
}

type CreatedOrderInvoiceItemRecord = {
  item_name_snapshot?: string | null
  item_type_snapshot?: string | null
  quantity?: number | string | null
  unit_price?: number | string | null
  line_total?: number | string | null
}

type OrderCreationServiceClient = {
  from: ReturnType<typeof createClient>['from']
}
type InvoicePaymentSelectQuery = {
  eq(column: string, value: string): InvoicePaymentSelectQuery
  maybeSingle(): Promise<{
    data: { total?: unknown } | null
    error: SupabaseErrorLike | null
  }>
}
type InvoicePaymentUpdateQuery = {
  eq(column: string, value: string): InvoicePaymentUpdateQuery
  select(columns: string): {
    maybeSingle(): Promise<{
      data: {
        payment_method?: unknown
        cash_received?: unknown
        remaining_from_customer?: unknown
        cash_change?: unknown
      } | null
      error: SupabaseErrorLike | null
    }>
  }
}
type InvoicePaymentPersistenceClient = {
  from(table: 'invoices'): {
    select(columns: string): InvoicePaymentSelectQuery
    update(values: Record<string, string | number>): InvoicePaymentUpdateQuery
  }
}

interface OrdersFilterQuery {
  eq(column: string, value: string): this
  gte(column: string, value: string): this
  lte(column: string, value: string): this
  neq(column: string, value: string): this
  in(column: string, values: string[]): this
  not(column: string, operator: string, value: string): this
}

type SupabaseServerClient = ReturnType<typeof createServerClient>
type SupabaseErrorLike = {
  code?: string
  details?: string
  hint?: string
  message?: string
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
type EmployeeTenantLookupClient = {
  from(table: 'profiles' | 'pos_profiles'): {
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
  branch_id,
  created_by_employee_id,
  status,
  created_at,
  updated_at,
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
    cash_change
  )
`

const ORDERS_DETAILS_SELECT = `
  id,
  order_number,
  branch_id,
  created_by_employee_id,
  status,
  created_at,
  updated_at,
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
  order_number,
  status,
  created_at,
  updated_at,
  invoices (
    invoice_number,
    total
  )
`

export async function GET(request: NextRequest) {
  const timing = createServerTiming()
  const auth = await timing.measure('auth', () =>
    requireApiAuth(request, ['admin', 'employee', 'cashier'])
  )

  if (!auth.ok) {
    return timing.finish(auth.response)
  }

  const query = parseOrdersQuery(request)

  if (!auth.profile.tenant_id) {
    return jsonWithAuthCookies(
      auth.response,
      {
        success: false,
        message: 'Tenant context is required',
      },
      403
    )
  }

  const hasMissingBranchScope = isBranchScopedWithoutBranchId(
    auth.profile.scope_type,
    auth.profile.branch_id
  )
  const settingsGuardPromise = timing.measure(
    'settings',
    () => disabledFeatureResponse(
      auth.response,
      auth.profile.tenant_id as string,
      'enable_orders',
      ORDERS_FEATURE_DISABLED_MESSAGE
    )
  )
  const detailsQueryPromise =
    query.mode === 'details' && query.id && !hasMissingBranchScope
      ? (() => {
          let detailsQuery = auth.supabase
            .from('orders')
            .select(ORDERS_DETAILS_SELECT)
            .eq('id', query.id)

          detailsQuery = applyTenantFilter(
            detailsQuery,
            auth.profile.tenant_id
          )

          if (
            shouldFilterByBranch(
              auth.profile.scope_type,
              auth.profile.branch_id
            )
          ) {
            detailsQuery = detailsQuery.eq(
              'branch_id',
              auth.profile.branch_id as string
            )
          }

          return timing.measure('orders', () => detailsQuery.maybeSingle())
        })()
      : null
  const detailsSettledResults = detailsQueryPromise
    ? await Promise.allSettled([settingsGuardPromise, detailsQueryPromise])
    : null

  if (detailsSettledResults?.[0].status === 'rejected') {
    throw detailsSettledResults[0].reason
  }

  const featureDisabledResponse = detailsSettledResults
    ? detailsSettledResults[0].value
    : await settingsGuardPromise

  if (featureDisabledResponse) {
    return timing.finish(featureDisabledResponse)
  }

  if (hasMissingBranchScope) {
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
    if (query.mode === 'details') {
      if (!query.id) {
        return jsonWithAuthCookies(
          auth.response,
          {
            success: false,
            message: 'Order id is required',
          },
          400
        )
      }

      const detailsResult = detailsSettledResults?.[1]
      if (!detailsResult || detailsResult.status === 'rejected') {
        throw detailsResult?.reason
      }

      const { data, error } = detailsResult.value

      if (error) {
        return jsonWithAuthCookies(
          auth.response,
          {
            success: false,
            message: 'تعذر تحميل تفاصيل الطلب',
          },
          500
        )
      }

      return jsonWithAuthCookies<OrdersApiPayload>(auth.response, {
        success: true,
        mode: query.mode,
        items: data ? [data] : [],
        totalCount: data ? 1 : 0,
        page: 1,
        pageSize: 1,
        hasMore: false,
        comparisonSignature: data
          ? buildOrdersComparisonSignature([data])
          : '',
      })
    }

    const matchingOrderIds =
      query.search.length > 0
        ? await timing.measure('orders', () =>
            resolveMatchingOrderIds(auth.supabase, auth.profile, query)
          )
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
        summary:
          query.mode === 'full' ? createEmptyOrdersStatusSummary() : undefined,
        employeeNames: query.mode === 'full' ? {} : undefined,
      })
    }

    const rangeFrom = (query.page - 1) * query.pageSize
    const rangeTo = rangeFrom + query.pageSize - 1

    const selectClause =
      query.mode === 'meta' ? ORDERS_META_SELECT : ORDERS_SELECT
    const needsEffectiveListFilter = isEffectiveStatusListFilter(
      query.listFilter
    )
    const statusProjectionPromise =
      query.mode === 'full' || needsEffectiveListFilter
        ? timing.measure('aggregate', () => loadOrdersEffectiveStatusProjection(
            auth.supabase,
            auth.profile,
            query,
            matchingOrderIds
          ))
        : Promise.resolve(undefined)
    const statusProjection = needsEffectiveListFilter
      ? await statusProjectionPromise
      : undefined

    if (
      needsEffectiveListFilter &&
      statusProjection?.orderIds[query.listFilter as EffectiveOrderStatus]
        .length === 0
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
        summary:
          query.mode === 'full' ? statusProjection.summary : undefined,
        employeeNames: query.mode === 'full' ? {} : undefined,
      })
    }

    let ordersQuery = auth.supabase
      .from('orders')
      .select(selectClause, { count: 'exact' })
      .order('created_at', { ascending: false })

    ordersQuery = applyOrdersFilters(ordersQuery, auth.profile, query)
    ordersQuery = needsEffectiveListFilter
      ? ordersQuery.in(
          'id',
          statusProjection?.orderIds[
            query.listFilter as EffectiveOrderStatus
          ] || []
        )
      : applyOrdersListFilter(ordersQuery, query.listFilter)

    if (matchingOrderIds) {
      ordersQuery = ordersQuery.in('id', matchingOrderIds)
    }

    const ordersPagePromise = timing.measure('orders', () =>
      ordersQuery.range(rangeFrom, rangeTo)
    )
    const summaryPromise =
      query.mode === 'full'
        ? statusProjectionPromise.then((projection) => projection?.summary)
        : Promise.resolve(undefined)

    const [{ data, error, count }, summary] = await Promise.all([
      ordersPagePromise,
      summaryPromise,
    ])

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

    const items = Array.isArray(data)
      ? (data as unknown as Array<Record<string, unknown>>)
      : []
    const totalCount = Number(count) || 0
    const comparisonSignature = buildOrdersComparisonSignature(items)
    let employeeNames: Record<string, string> | undefined

    if (query.mode === 'full') {
      const employeeIds = [...new Set(items.map((row) => row.created_by_employee_id).filter((id): id is string => typeof id === 'string' && Boolean(id)))]
      employeeNames = {}
      if (employeeIds.length > 0) {
        let profilesQuery = auth.supabase
          .from('profiles')
          .select('id, full_name, username')
          .in('id', employeeIds)
        let posProfilesQuery = auth.supabase
          .from('pos_profiles')
          .select('id, full_name, username')
          .in('id', employeeIds)

        profilesQuery = applyTenantFilter(
          profilesQuery,
          auth.profile.tenant_id
        )
        posProfilesQuery = applyTenantFilter(
          posProfilesQuery,
          auth.profile.tenant_id
        )

        const [profiles, posProfiles] = await Promise.all([
          timing.measure('profiles', () => profilesQuery),
          timing.measure('profiles', () => posProfilesQuery),
        ])
        if (profiles.error || posProfiles.error) throw profiles.error || posProfiles.error
        for (const row of [...(profiles.data || []), ...(posProfiles.data || [])]) {
          const name = row.full_name?.trim() || row.username?.trim()
          if (row.id && name && !employeeNames[row.id]) employeeNames[row.id] = name
        }
      }
    }

    const response = await timing.measure('serialize', async () =>
      jsonWithAuthCookies<OrdersApiPayload>(auth.response, {
      success: true,
      mode: query.mode,
      items: query.mode === 'meta' ? [] : items,
      totalCount,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: rangeFrom + items.length < totalCount,
      comparisonSignature,
      summary,
      employeeNames,
      })
    )
    return timing.finish(response)
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
  const timing = createServerTiming('orders-post')
  const response = await handleCreateOrderPost(request, timing)

  timing.measureSync('response_serialization', () => undefined)
  return timing.finish(response)
}

async function handleCreateOrderPost(
  request: NextRequest,
  timing: ReturnType<typeof createServerTiming>
) {
  const auth = await timing.measure('auth_session', () =>
    requireApiAuth(request, ['admin', 'employee', 'cashier'])
  )

  if (!auth.ok) {
    return auth.response
  }

  try {
    const body = (await request.json()) as CreateOrderBody
    const items = Array.isArray(body.items) ? body.items : []
    const rpcName = 'create_invoice_with_items_safe'
    const paymentMethod = normalizeOrderPaymentMethod(body.paymentMethod)
    const paymentSnapshot = normalizeCreateOrderPaymentSnapshot(body)

    if (!paymentMethod || paymentSnapshot === false) {
      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          message: 'بيانات الدفع غير صالحة',
        },
        400
      )
    }
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
          error: 'تعذر إنشاء الطلب. لم يتم تأكيد إنشاء الطلب.',
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
    const profileTenantId = await timing.measure(
      'profile_tenant',
      async () =>
        normalizeUuidString(auth.profile.tenant_id) ||
        (await resolveProfileTenantId(serviceSupabase, auth.profile.id))
    )

    if (!profileTenantId) {
      console.error('[api/orders] missing profile tenant id for order creation', {
        profileId: maskId(auth.profile.id),
        authProfileTenantId: auth.profile.tenant_id
          ? maskId(auth.profile.tenant_id)
          : null,
      })
      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          message: 'تعذر تحديد نطاق المنشأة',
        },
        400
      )
    }

    const ordersDisabledResponse = await timing.measure(
      'feature_orders',
      () => disabledFeatureResponse(
        auth.response,
        profileTenantId,
        'enable_orders',
        ORDERS_FEATURE_DISABLED_MESSAGE
      )
    )

    if (ordersDisabledResponse) {
      return ordersDisabledResponse
    }

    const posDisabledResponse = await timing.measure(
      'feature_pos',
      () => disabledFeatureResponse(
        auth.response,
        profileTenantId,
        'enable_pos',
        POS_FEATURE_DISABLED_MESSAGE
      )
    )

    if (posDisabledResponse) {
      return posDisabledResponse
    }

    const profileBranchId = normalizeUuidString(auth.profile.branch_id)

    if (!branchId) {
      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          message: 'اختر فرعًا محددًا قبل إتمام البيع',
        },
        400
      )
    }

    if (auth.profile.scope_type !== 'system' && !profileBranchId) {
      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          message: 'تعذر تحديد فرع الحساب',
        },
        403
      )
    }

    if (
      auth.profile.scope_type !== 'system' &&
      profileBranchId &&
      branchId !== profileBranchId
    ) {
      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          message: 'فرع نقطة البيع لا يطابق فرع الحساب',
        },
        403
      )
    }

    const { data: orderBranch, error: orderBranchError } =
      await timing.measure('branch_validation', () =>
        serviceSupabase
          .from('branches')
          .select('id')
          .eq('tenant_id', profileTenantId)
          .eq('id', branchId)
          .maybeSingle()
      )

    if (orderBranchError || !orderBranch) {
      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          message: 'تعذر تحديد فرع صالح لإتمام البيع',
        },
        400
      )
    }

    const idempotencyService = createIdempotencyService({
      supabase: serviceSupabase,
      tenantId: profileTenantId,
      branchId,
      actor: {
        type: 'user',
        id: auth.user.id,
      },
      correlationId: auth.context.correlationId,
      engineVersion: 'v1',
    })
    const idempotencyCommand = clientIdempotencyKey
      ? idempotencyService.createCommand({
          clientKey: clientIdempotencyKey,
          commandType: 'order.create',
          intent: buildOrderCommandIntent({
            tenantId: profileTenantId,
            branchId,
            actor: {
              type: 'user',
              id: auth.user.id,
            },
            customerName: body.customerName,
            customerPhoneNormalized:
              normalizeSaudiCustomerPhone(
                typeof body.customerPhone === 'string'
                  ? body.customerPhone
                  : null
              ) || body.customerPhone,
            items: normalizedItems,
            paymentMethod,
            amountTendered: paymentSnapshot
              ? paymentSnapshot.cashReceived
              : null,
            note: body.note,
          }),
        })
      : null

    if (clientIdempotencyKey && idempotencyCommand) {
      const resolution = await timing.measure('idempotency_lookup', () =>
        idempotencyService.resolveBeforeExecution({
          clientKey: clientIdempotencyKey,
          command: idempotencyCommand,
        })
      )

      if (resolution.kind === 'replay') {
        scheduleInvoiceCostSnapshot({
          supabase: serviceSupabase,
          tenantId: profileTenantId,
          branchId,
          invoiceId: resolution.result.invoice_id,
        })

        return jsonWithAuthCookies(auth.response, {
          success: true,
          data: resolution.result,
          duplicate: true,
        })
      }

      if (resolution.kind === 'conflict') {
        return jsonWithAuthCookies(
          auth.response,
          {
            success: false,
            message: 'Ù…ÙØªØ§Ø­ Ø§Ù„Ø·Ù„Ø¨ Ù…Ø³ØªØ®Ø¯Ù… Ù„Ø·Ù„Ø¨ Ù…Ø®ØªÙ„Ù',
          },
          409
        )
      }

      if (resolution.kind === 'in_progress') {
        return jsonWithAuthCookies(
          auth.response,
          {
            success: false,
            message: 'Ø§Ù„Ø·Ù„Ø¨ Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø¹Ø§Ù„Ø¬Ø©ØŒ Ø­Ø§ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰ Ø¨Ø¹Ø¯ Ù„Ø­Ø¸Ø§Øª',
          },
          409
        )
      }

      if (resolution.kind === 'terminal') {
        return jsonWithAuthCookies(
          auth.response,
          {
            success: false,
            message: 'تعذر إعادة تنفيذ هذا الطلب.',
          },
          409
        )
      }

      if (resolution.kind === 'invalid') {
        return jsonWithAuthCookies(
          auth.response,
          {
            success: false,
            message: 'تعذر التحقق من حالة الطلب بأمان.',
          },
          500
        )
      }
    }

    const employeeResolution = await timing.measure(
      'employee_resolution',
      () => createdByEmployeeId
        ? resolveCreatedByEmployeeIdForRpc(
            serviceSupabase,
            createdByEmployeeId,
            profileTenantId
          )
        : Promise.resolve({ rpcEmployeeId: null, posEmployeeId: null })
    )

    let validCatalogItemsQuery = serviceSupabase
      .from('catalog_items')
      .select('id')
      .in('id', receivedItemIds)

    validCatalogItemsQuery = applyTenantFilter(
      validCatalogItemsQuery,
      profileTenantId
    )

    const { data: validCatalogItems, error: validCatalogItemsError } =
      await timing.measure('catalog_validation', () => validCatalogItemsQuery)

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

      const { data: branchCatalogItems } = await timing.measure(
        'branch_catalog_fallback',
        () => branchCatalogItemsQuery
      )

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
      p_payment_method: getPersistedInvoicePaymentMethod(paymentMethod),
      p_discount:
        typeof body.discountAmount === 'number' ? body.discountAmount : 0,
      p_tax: typeof body.taxAmount === 'number' ? body.taxAmount : 0,
      p_note: typeof body.note === 'string' ? body.note : '',
      p_items: validItems,
      p_client_idempotency_key: clientIdempotencyKey,
      p_created_by_employee_id: employeeResolution.rpcEmployeeId,
      p_tenant_id: profileTenantId,
      p_branch_id: branchId,
    }

    const { data, error } = await timing.measure('atomic_rpc', () =>
      serviceSupabase.rpc(rpcName, rpcPayload)
    )

    if (error) {
      if (clientIdempotencyKey && idempotencyCommand) {
        const recovery =
          await idempotencyService.recoverAfterUncertainResult({
            clientKey: clientIdempotencyKey,
            command: idempotencyCommand,
          })

        if (recovery.kind === 'replay') {
          scheduleInvoiceCostSnapshot({
            supabase: serviceSupabase,
            tenantId: profileTenantId,
            branchId,
            invoiceId: recovery.result.invoice_id,
          })

          return jsonWithAuthCookies(auth.response, {
            success: true,
            data: recovery.result,
            duplicate: true,
          })
        }

        if (
          recovery.kind === 'conflict' ||
          recovery.kind === 'in_progress' ||
          recovery.kind === 'terminal'
        ) {
          return jsonWithAuthCookies(
            auth.response,
            {
              success: false,
              message:
                recovery.kind === 'in_progress'
                  ? 'الطلب قيد المعالجة، حاول مرة أخرى بعد لحظات.'
                  : 'تعذر إعادة تنفيذ هذا الطلب.',
            },
            409
          )
        }

        if (recovery.kind === 'invalid') {
          return jsonWithAuthCookies(
            auth.response,
            {
              success: false,
              message: 'تعذر التحقق من حالة الطلب بأمان.',
            },
            500
          )
        }
      }

      console.error('[api/orders] create order rpc failed', {
        rpcName,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      })

      if (isInsufficientStockError(error)) {
        const itemName = getInsufficientStockItemName(error)
        const message = itemName
          ? `المخزون غير كافٍ للمنتج: ${itemName}`
          : 'المخزون غير كافٍ لإتمام البيع'

        return jsonWithAuthCookies(
          auth.response,
          {
            success: false,
            error: message,
            message,
          },
          409
        )
      }

      return jsonWithAuthCookies(
        auth.response,
        {
          success: false,
          message: 'حدث خطأ أثناء إنشاء الفاتورة',
        },
        500
      )
    }

    const createdOrder = normalizeCreatedOrderData(data)
    const createdOrderRecord =
      createdOrder && typeof createdOrder === 'object' && !Array.isArray(createdOrder)
        ? (createdOrder as Record<string, unknown>)
        : {}
    const orderId = stringValue(createdOrderRecord.order_id)
    const orderNumber = stringValue(createdOrderRecord.order_number)
    const invoiceId = stringValue(createdOrderRecord.invoice_id)
    const invoiceNumber = stringValue(createdOrderRecord.invoice_number)
    const totalValue = Number(createdOrderRecord.total)

    if (!invoiceId) {
      throw new Error('Order creation did not return an invoice id')
    }

    let paymentSnapshotError: unknown = null

    if (paymentSnapshot) {
      try {
        await timing.measure('payment_snapshot', () =>
          persistAndConfirmInvoicePaymentSnapshot({
            supabase: serviceSupabase,
            tenantId: profileTenantId,
            invoiceId,
            paymentMethod,
            cashReceived: paymentSnapshot.cashReceived,
            invoiceTotal: totalValue,
          })
        )
      } catch (error) {
        paymentSnapshotError = error
        console.error('[api/orders] invoice payment snapshot persistence failed', {
          orderId: maskId(orderId),
          invoiceId: maskId(invoiceId),
          paymentMethod: getPersistedInvoicePaymentMethod(paymentMethod),
          message: getSafePaymentSnapshotErrorMessage(error),
        })
      }
    }

    if (employeeResolution.posEmployeeId && orderId) {
      const { error: updateEmployeeError } = await timing.measure(
        'employee_patch',
        () => serviceSupabase
          .from('orders')
          .update({ created_by_employee_id: employeeResolution.posEmployeeId })
          .eq('id', orderId)
          .eq('tenant_id', profileTenantId)
      )

      if (updateEmployeeError) {
        console.warn('[api/orders] unable to attach POS employee to order', {
          orderId: maskId(orderId),
          employeeId: maskId(employeeResolution.posEmployeeId),
          message: updateEmployeeError.message,
        })
      }
    }

    if (employeeResolution.posEmployeeId && invoiceId) {
      const { data: invoiceItemRows, error: invoiceItemsError } =
        await timing.measure('invoice_items_lookup', () =>
          serviceSupabase
            .from('invoice_items')
            .select('id')
            .eq('tenant_id', profileTenantId)
            .eq('invoice_id', invoiceId)
        )

      if (invoiceItemsError) {
        console.warn('[api/orders] unable to load invoice items for inventory actor', {
          invoiceId: maskId(invoiceId),
          employeeId: maskId(employeeResolution.posEmployeeId),
          message: invoiceItemsError.message,
        })
      }

      const invoiceItemIds = Array.isArray(invoiceItemRows)
        ? invoiceItemRows
            .map((item) => stringValue(item.id))
            .filter((itemId): itemId is string => Boolean(itemId))
        : []
      const sourceIdFilter = [
        `and(source_type.eq.invoice,source_id.eq.${invoiceId})`,
        ...invoiceItemIds.map(
          (invoiceItemId) =>
            `and(source_type.eq.invoice_item,source_id.eq.${invoiceItemId})`
        ),
      ].join(',')

      const updateInventoryActorQuery = serviceSupabase
        .from('inventory_movements')
        .update({ created_by: employeeResolution.posEmployeeId })
        .eq('tenant_id', profileTenantId)
        .eq('movement_type', 'sale')

      const { error: updateInventoryActorError } = await timing.measure(
        'inventory_actor_patch',
        () => (
          sourceIdFilter
            ? updateInventoryActorQuery.or(sourceIdFilter)
            : updateInventoryActorQuery
                .eq('source_type', 'invoice')
                .eq('source_id', invoiceId)
        )
      )

      if (updateInventoryActorError) {
        console.warn('[api/orders] unable to attach POS employee to inventory movements', {
          invoiceId: maskId(invoiceId),
          employeeId: maskId(employeeResolution.posEmployeeId),
          message: updateInventoryActorError.message,
        })
      }
    }

    await timing.measure('audit_write', () =>
      writeAuditLog({
        auth,
        request,
        action: 'order.created',
        entityType: 'order',
        entityId: orderId || null,
        branchId: branchId || null,
        metadata: {
          order_number: orderNumber || null,
          invoice_id: invoiceId || null,
          invoice_number: invoiceNumber || null,
          created_by_employee_id: createdByEmployeeId || null,
          branch_id: branchId || null,
          items_count: validItems.length,
          payment_method: getPersistedInvoicePaymentMethod(paymentMethod),
          total: Number.isFinite(totalValue) ? totalValue : null,
          source: 'pos',
        },
      })
    )

    scheduleInvoiceCostSnapshot({
      supabase: serviceSupabase,
      tenantId: profileTenantId,
      branchId,
      invoiceId,
    })

    if (paymentSnapshotError) {
      await writeAuditLog({
        auth,
        request,
        action: 'invoice.payment_snapshot_failed',
        entityType: 'invoice',
        entityId: invoiceId,
        branchId,
        metadata: {
          order_id: orderId || null,
          invoice_number: invoiceNumber || null,
          payment_method: getPersistedInvoicePaymentMethod(paymentMethod),
          error: getSafePaymentSnapshotErrorMessage(paymentSnapshotError),
        },
      })
    } else {
      after(async () => {
        try {
          await sendCreatedInvoicePdfOverWhatsApp({
            auth,
            request,
            supabase: serviceSupabase,
            tenantId: profileTenantId,
            branchId,
            orderId,
          })
        } catch (error) {
          console.error('[api/orders] background invoice PDF WhatsApp task failed', {
            orderId: maskId(orderId),
            error:
              error instanceof Error
                ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                  }
                : String(error),
          })
        }
      })
    }

    return jsonWithAuthCookies(auth.response, {
      success: true,
      data: createdOrder,
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

function scheduleInvoiceCostSnapshot({
  supabase,
  tenantId,
  branchId,
  invoiceId,
}: {
  supabase: OrderCreationServiceClient
  tenantId: string
  branchId: string
  invoiceId: string
}) {
  if (!invoiceId) {
    return
  }

  after(async () => {
    try {
      await createInvoiceCostSnapshot({
        supabase,
        tenantId,
        branchId,
        invoiceId,
      })
    } catch (error) {
      console.error('[api/orders] background cost snapshot task failed', {
        invoiceId: maskId(invoiceId),
        category:
          error instanceof InvoiceCostSnapshotError
            ? error.code
            : 'UNKNOWN_SNAPSHOT_FAILURE',
      })
    }
  })
}

async function sendCreatedInvoicePdfOverWhatsApp({
  auth,
  request,
  supabase,
  tenantId,
  branchId,
  orderId,
}: {
  auth: Extract<Awaited<ReturnType<typeof requireApiAuth>>, { ok: true }>
  request: NextRequest
  supabase: OrderCreationServiceClient
  tenantId: string
  branchId: string
  orderId: string
}) {
  let deliveryStage: 'preflight' | 'pdf_generation' | 'whatsapp_send' =
    'preflight'
  let deliveryInvoiceId: string | null = null
  let deliveryInvoiceNumber: string | null = null

  try {
    if (!orderId) {
      console.info('[api/orders] skip automatic invoice PDF WhatsApp: missing order id')
      return
    }

    const { data: orderRow, error: orderError } = await supabase
      .from('orders')
      .select(
        `
          id,
          order_number,
          branch_id,
          created_at,
          customers (
            name,
            phone
          ),
          invoices (
            id,
            invoice_number,
            payment_method,
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
              line_total
            )
          )
        `
      )
      .eq('tenant_id', tenantId)
      .eq('id', orderId)
      .maybeSingle()

    if (orderError || !orderRow) {
      console.error('[api/orders] automatic invoice PDF WhatsApp order lookup failed', {
        orderId: maskId(orderId),
        message: orderError?.message || 'Order not found after creation',
      })
      return
    }

    const order = orderRow as CreatedOrderInvoiceDeliveryRow
    const customerPhone = order.customers?.phone?.trim() || ''

    if (!customerPhone || !isSendableWhatsAppPhone(customerPhone)) {
      console.info('[api/orders] skip automatic invoice PDF WhatsApp: missing customer phone', {
        orderId: maskId(orderId),
        recipientMasked: maskPhone(customerPhone),
      })
      return
    }

    let settingsQuery = supabase
      .from('system_settings')
      .select(
        [
          'store_name',
          'branch_name',
          'whatsapp_phone',
          'digital_invoice_brand_name',
          'digital_invoice_branch_name',
          'digital_invoice_address_line_1',
          'digital_invoice_address_line_2',
          'digital_invoice_whatsapp_number',
          'digital_invoice_whatsapp_enabled',
          'digital_invoice_google_review_link',
          'digital_invoice_google_review_enabled',
          'digital_invoice_map_link',
          'digital_invoice_map_enabled',
          'digital_invoice_instagram_enabled',
          'digital_invoice_instagram_link',
          'digital_invoice_tiktok_enabled',
          'digital_invoice_tiktok_link',
          'digital_invoice_note',
          'digital_invoice_brand_background_color',
          'digital_invoice_brand_text_color',
          'enable_whatsapp',
        ].join(', ')
      )
      .limit(1)

    settingsQuery = applyTenantFilter(settingsQuery, tenantId)

    const { data: settingsRow, error: settingsError } = await settingsQuery.maybeSingle()

    if (settingsError) {
      console.error('[api/orders] automatic invoice PDF WhatsApp settings lookup failed', {
        orderId: maskId(orderId),
        message: settingsError.message,
      })
      return
    }

    const settings = (settingsRow as Partial<SystemSettings> | null) ?? null

    if (settings?.enable_whatsapp === false) {
      console.info('[api/orders] skip automatic invoice PDF WhatsApp: feature disabled', {
        orderId: maskId(orderId),
      })
      return
    }

    const { data: branchRow, error: branchError } = await supabase
      .from('branches')
      .select('id, name, display_store_name, display_branch_name')
      .eq('tenant_id', tenantId)
      .eq('id', branchId)
      .maybeSingle()

    if (branchError) {
      console.error('[api/orders] automatic invoice PDF WhatsApp branch lookup failed', {
        orderId: maskId(orderId),
        branchId: maskId(branchId),
        message: branchError.message,
      })
      return
    }

    const branch = (branchRow || {}) as {
      name?: string | null
      display_store_name?: string | null
      display_branch_name?: string | null
    }
    const storeNameInMessages = branch.display_store_name?.trim() || ''
    const branchName =
      branch.display_branch_name?.trim() || branch.name?.trim() || undefined
    const invoice = normalizeCreatedOrderInvoice(order.invoices)

    if (!invoice) {
      console.info('[api/orders] skip automatic invoice PDF WhatsApp: missing invoice', {
        orderId: maskId(orderId),
      })
      return
    }

    const invoiceItems = normalizeCreatedOrderInvoiceItems(invoice.invoice_items)

    if (invoiceItems.length === 0) {
      console.info('[api/orders] skip automatic invoice PDF WhatsApp: missing invoice items', {
        orderId: maskId(orderId),
        invoiceId: maskId(invoice.id || ''),
      })
      return
    }

    const invoiceNumber = invoice.invoice_number?.trim() || ''
    deliveryInvoiceId = invoice.id || null
    deliveryInvoiceNumber = invoiceNumber || null
    const safeInvoiceNumber = `\u200E${invoiceNumber}\u200E`
    const pdfPayload: InvoicePdfPayload = {
      invoiceItems,
      invoiceNumber,
      orderNumber: order.order_number?.trim() || undefined,
      customerName: order.customers?.name?.trim() || '',
      customerPhone,
      branchName,
      paymentMethod: normalizeInvoicePdfPaymentMethod(invoice.payment_method),
      paymentMethodLabel: invoice.payment_method?.trim() || undefined,
      numericCashReceived: numberValue(invoice.cash_received),
      remainingFromCustomer: numberValue(invoice.remaining_from_customer),
      cashChange: numberValue(invoice.cash_change),
      subtotal: numberValue(invoice.subtotal) || numberValue(invoice.total),
      discount: numberValue(invoice.discount),
      tax: numberValue(invoice.tax),
      finalTotal: numberValue(invoice.total),
      note: invoice.note?.trim() || '',
      issuedAt: order.created_at || undefined,
      digitalInvoiceSettings: resolveDigitalInvoiceTemplateSettings(settings),
    }

    deliveryStage = 'pdf_generation'
    const generatedFile = await generateInvoicePdfFile(pdfPayload)
    deliveryStage = 'whatsapp_send'
    const result = await sendWhatsAppFile(
      {
        to: customerPhone,
        branchId,
        tenantId,
        fileUrl: generatedFile.dataUrl,
        filename: generatedFile.filename,
        caption: `فاتورتك من: ${storeNameInMessages}\nرقم الفاتورة: ${safeInvoiceNumber}`,
        metadata: {
          type: 'invoice_pdf',
          orderId,
          invoiceId: invoice.id || null,
          invoiceNumber,
        },
      },
      {
        mode: 'file',
        messageType: 'file',
      }
    )

    if (!result.success) {
      console.error('[api/orders] automatic invoice PDF WhatsApp send failed', {
        orderId: maskId(orderId),
        invoiceId: maskId(invoice.id || ''),
        recipientMasked: maskPhone(customerPhone),
        providerKey: result.providerKey,
        providerStatus: result.providerStatus || null,
        errorMessage: result.errorMessage || null,
      })
      await writeAuditLog({
        auth,
        request,
        action: 'whatsapp.message_failed',
        entityType: 'whatsapp_message',
        entityId: orderId || null,
        branchId,
        metadata: {
          channel: 'whatsapp',
          mode: 'file',
          type: 'invoice_pdf',
          status: 'failed',
          has_text: false,
          has_file: true,
          order_id: orderId,
          order_status: 'invoice_pdf',
          invoice_id: invoice.id || null,
          invoice_number: invoiceNumber || null,
          recipient_masked: maskPhone(customerPhone),
          provider_status: result.providerStatus || null,
          provider_key: result.providerKey || null,
          error: result.errorMessage || 'تعذر إرسال رسالة واتساب',
        },
      })
      return
    }

    await writeAuditLog({
      auth,
      request,
      action: 'whatsapp.message_sent',
      entityType: 'whatsapp_message',
      entityId: result.providerMessageId || orderId || null,
      branchId,
      metadata: {
        channel: 'whatsapp',
        mode: 'file',
        type: 'file',
        has_text: false,
        has_file: true,
        order_id: orderId,
        order_status: 'invoice_pdf',
        invoice_id: invoice.id || null,
        invoice_number: invoiceNumber || null,
        recipient_masked: maskPhone(customerPhone),
        provider_status: result.providerStatus || null,
      },
    })

    console.info('[api/orders] automatic invoice PDF WhatsApp sent', {
      orderId: maskId(orderId),
      invoiceId: maskId(invoice.id || ''),
      recipientMasked: maskPhone(customerPhone),
      providerKey: result.providerKey,
      providerStatus: result.providerStatus || null,
    })
  } catch (error) {
    console.error(
      '[api/orders] automatic invoice PDF WhatsApp failed without blocking invoice creation',
      redactSensitive({
        orderId: maskId(orderId),
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : String(error),
      })
    )
    await writeAuditLog({
      auth,
      request,
      action:
        deliveryStage === 'pdf_generation'
          ? 'invoice.pdf_generation_failed'
          : 'whatsapp.message_failed',
      entityType:
        deliveryStage === 'pdf_generation' ? 'invoice' : 'whatsapp_message',
      entityId: deliveryInvoiceId || orderId || null,
      branchId,
      metadata: {
        channel: 'whatsapp',
        mode: 'file',
        type: 'invoice_pdf',
        status: 'failed',
        stage: deliveryStage,
        order_id: orderId,
        invoice_id: deliveryInvoiceId,
        invoice_number: deliveryInvoiceNumber,
        error: error instanceof Error ? error.message : String(error),
      },
    })
  }
}

function normalizeCreatedOrderInvoice(value: unknown): CreatedOrderInvoiceRecord | null {
  if (Array.isArray(value)) {
    return (value[0] as CreatedOrderInvoiceRecord | undefined) || null
  }

  if (value && typeof value === 'object') {
    return value as CreatedOrderInvoiceRecord
  }

  return null
}

function normalizeCreatedOrderInvoiceItems(value: unknown): InvoicePdfPayload['invoiceItems'] {
  const rows = Array.isArray(value)
    ? (value as CreatedOrderInvoiceItemRecord[])
    : []

  return rows
    .map((item) => {
      const quantity = numberValue(item.quantity)
      const lineTotal = numberValue(item.line_total)
      const unitPrice = numberValue(item.unit_price) || (quantity > 0 ? lineTotal / quantity : 0)
      const itemName = item.item_name_snapshot?.trim() || ''

      return {
        item_id: null,
        item_name: itemName,
        item_type: item.item_type_snapshot === 'product' ? 'product' : 'service',
        quantity,
        unit_price: unitPrice,
      } satisfies InvoicePdfPayload['invoiceItems'][number]
    })
    .filter((item) => item.item_name && item.quantity > 0)
}

function normalizeInvoicePdfPaymentMethod(
  value: string | null | undefined
): InvoicePdfPayload['paymentMethod'] {
  return normalizeDigitalInvoicePaymentMethod(value || undefined)
}

function numberValue(value: unknown) {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
      ? Number(value)
      : NaN

  return Number.isFinite(numericValue) ? numericValue : 0
}

function normalizeCreateOrderPaymentSnapshot(body: CreateOrderBody) {
  const values = [
    body.cashReceived,
    body.remainingFromCustomer,
    body.cashChange,
  ]
  const suppliedValues = values.filter((value) => value !== undefined)

  if (suppliedValues.length === 0) {
    return null
  }

  if (
    suppliedValues.length !== values.length ||
    suppliedValues.some(
      (value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0
    )
  ) {
    return false
  }

  return {
    cashReceived: body.cashReceived as number,
    remainingFromCustomer: body.remainingFromCustomer as number,
    cashChange: body.cashChange as number,
  }
}

async function persistAndConfirmInvoicePaymentSnapshot({
  supabase,
  tenantId,
  invoiceId,
  paymentMethod,
  cashReceived,
  invoiceTotal,
}: {
  supabase: unknown
  tenantId: string
  invoiceId: string
  paymentMethod: OrderPaymentMethod
  cashReceived: number
  invoiceTotal?: number
}) {
  const client = supabase as InvoicePaymentPersistenceClient
  let total = Number.isFinite(invoiceTotal)
    ? roundCurrency(Math.max(invoiceTotal as number, 0))
    : null

  if (total === null) {
    const { data: invoice, error: invoiceError } = await client
      .from('invoices')
      .select('total')
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (invoiceError || !invoice) {
      throw invoiceError || new Error('Created invoice was not found')
    }

    total = roundCurrency(Math.max(numberValue(invoice.total), 0))
  }
  const snapshot = buildPersistedInvoicePaymentSnapshot({
    paymentMethod,
    invoiceTotal: total,
    cashReceived,
  })

  const { data: confirmedInvoice, error: updateError } = await client
    .from('invoices')
    .update({
      payment_method: snapshot.paymentMethod,
      cash_received: snapshot.cashReceived,
      remaining_from_customer: snapshot.remainingFromCustomer,
      cash_change: snapshot.cashChange,
    })
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .select(
      'payment_method, cash_received, remaining_from_customer, cash_change'
    )
    .maybeSingle()

  if (updateError || !confirmedInvoice) {
    throw updateError || new Error('Invoice payment snapshot was not persisted')
  }

  const snapshotMatches =
    confirmedInvoice.payment_method === snapshot.paymentMethod &&
    roundCurrency(numberValue(confirmedInvoice.cash_received)) ===
      snapshot.cashReceived &&
    roundCurrency(numberValue(confirmedInvoice.remaining_from_customer)) ===
      snapshot.remainingFromCustomer &&
    roundCurrency(numberValue(confirmedInvoice.cash_change)) ===
      snapshot.cashChange

  if (!snapshotMatches) {
    throw new Error('Invoice payment snapshot confirmation failed')
  }
}

function getSafePaymentSnapshotErrorMessage(error: unknown) {
  const fallback = 'تعذر تأكيد بيانات الدفع المحفوظة'

  if (!error || typeof error !== 'object' || !('code' in error)) {
    return fallback
  }

  const code = (error as { code?: unknown }).code

  if (code === '23514') {
    return `${fallback} لأن طريقة الدفع أو المبالغ رُفضت`
  }

  if (code === 'PGRST116') {
    return `${fallback} لأن الفاتورة لم تعد متاحة بعد الحفظ`
  }

  return fallback
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
    mode:
      rawMode === 'meta'
        ? 'meta'
        : rawMode === 'details'
          ? 'details'
          : 'full',
    id: normalizeUuidString(params.get('id')),
    page,
    pageSize,
    branchId,
    status,
    search: normalizeOrdersSearch(params.get('search')),
    dateFrom: normalizeOptionalString(params.get('dateFrom')),
    dateTo: normalizeOptionalString(params.get('dateTo')),
    listFilter: normalizeOptionalString(params.get('listFilter')),
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

async function resolveCreatedByEmployeeIdForRpc(
  supabase: unknown,
  employeeId: string,
  tenantId: string
) {
  const client = supabase as EmployeeTenantLookupClient
  const { data: profileData, error: profileError } = await client
    .from('profiles')
    .select('tenant_id')
    .eq('id', employeeId)
    .maybeSingle()

  if (profileError) {
    console.warn('[api/orders] unable to resolve profile employee', {
      employeeId: maskId(employeeId),
      message: profileError.message,
    })
  }

  if (normalizeUuidString(profileData?.tenant_id) === tenantId) {
    return { rpcEmployeeId: employeeId, posEmployeeId: null }
  }

  const { data: posProfileData, error: posProfileError } = await client
    .from('pos_profiles')
    .select('tenant_id')
    .eq('id', employeeId)
    .maybeSingle()

  if (posProfileError) {
    console.warn('[api/orders] unable to resolve POS employee', {
      employeeId: maskId(employeeId),
      message: posProfileError.message,
    })
  }

  if (normalizeUuidString(posProfileData?.tenant_id) === tenantId) {
    return { rpcEmployeeId: null, posEmployeeId: employeeId }
  }

  return { rpcEmployeeId: null, posEmployeeId: null }
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

function isInsufficientStockError(error: {
  details?: string
  hint?: string
  message?: string
}) {
  const searchableText = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`

  return searchableText.includes('INSUFFICIENT_STOCK')
}

function getInsufficientStockItemName(error: {
  details?: string
}) {
  const details = error.details?.trim()

  if (!details || details.includes('INSUFFICIENT_STOCK')) {
    return ''
  }

  return details
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

function applyOrdersListFilter<T extends OrdersFilterQuery>(query: T, filter: string | null) {
  if (filter === 'in_progress' || filter === 'ready') return query.eq('status', filter)
  if (filter === 'delivered') return query.in('status', ['closed', 'delivered', 'completed'])
  if (filter === 'cancelled') return query.in('status', ['cancelled', 'canceled'])
  if (filter === 'all') return query.not('status', 'in', '(closed,delivered,completed)')
  return query
}

function isEffectiveStatusListFilter(
  filter: string | null
): filter is Exclude<EffectiveOrderStatus, 'unknown'> {
  return (
    filter === 'in_progress' ||
    filter === 'ready' ||
    filter === 'delivered' ||
    filter === 'cancelled'
  )
}

function createEmptyOrdersStatusSummary() {
  return { in_progress: 0, ready: 0, delivered: 0, cancelled: 0 }
}

async function loadOrdersEffectiveStatusProjection(
  supabase: SupabaseServerClient,
  profile: Pick<ApiAuthProfile, 'scope_type' | 'branch_id' | 'tenant_id'>,
  filters: OrdersApiQuery,
  matchingOrderIds: string[] | null
) {
  let projectionQuery = supabase
    .from('orders')
    .select('id, status, invoices(payment_status)')

  projectionQuery = applyOrdersFilters(projectionQuery, profile, filters)

  if (matchingOrderIds) {
    projectionQuery = projectionQuery.in('id', matchingOrderIds)
  }

  const { data, error } = await projectionQuery

  if (error) {
    throw error
  }

  const summary = createEmptyOrdersStatusSummary()
  const orderIds: Record<EffectiveOrderStatus, string[]> = {
    in_progress: [],
    ready: [],
    delivered: [],
    cancelled: [],
    unknown: [],
  }

  for (const row of data || []) {
    const invoice = normalizeInvoiceRecord(row.invoices)
    const effectiveStatus = resolveEffectiveOrderStatus(
      row.status,
      invoice?.payment_status
    )

    if (effectiveStatus !== 'unknown') {
      summary[effectiveStatus] += 1
    }

    if (typeof row.id === 'string' && row.id) {
      orderIds[effectiveStatus].push(row.id)
    }
  }

  return { summary, orderIds }
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
        order_number?: string
        status?: string
        created_at?: string
        updated_at?: string
        invoices?: unknown
      }
      const invoice = normalizeInvoiceRecord(row.invoices)

      return [
        row.id || '',
        row.order_number || '',
        row.status || '',
        row.created_at || '',
        row.updated_at || '',
        Number(invoice?.total) || 0,
        invoice?.invoice_number || '',
      ].join('|')
    })
    .join('||')
}

function normalizeInvoiceRecord(value: unknown) {
  if (Array.isArray(value)) {
    return (value[0] as
      | {
          invoice_number?: string | null
          total?: number | null
          payment_status?: string | null
        }
      | undefined) || null
  }

  if (value && typeof value === 'object') {
    return value as {
      invoice_number?: string | null
      total?: number | null
      payment_status?: string | null
    }
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

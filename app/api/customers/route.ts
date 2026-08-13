import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireApiAuth } from '@/lib/api-auth'
import { isFullAdmin } from '@/lib/permissions'
import {
  buildSaudiPhoneCandidatePattern,
  buildCustomerSearchFilter,
  CUSTOMER_PHONE_ERRORS,
  isMissingCustomerIdentityColumnError,
  normalizeCustomerSearchTerm,
  normalizeSaudiCustomerPhone,
  prepareCustomerIdentity,
} from '@/lib/customers'
import { applyTenantFilter } from '@/lib/tenant-filter'
import { createServerTiming } from '@/lib/performance/server-timing'

type CustomerListRow = {
  id: string | null
  name: string | null
  phone: string | null
  display_phone?: string | null
  [key: string]: unknown
}

type CustomerDatabaseError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

type CustomerIdentityLookupOptions = {
  tenantId: string
  normalizedPhone: string
  branchId?: string | null
  limit?: number
}

function resolveCustomerConstraint(error: CustomerDatabaseError) {
  const diagnosticText = [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')

  return [
    'customers_phone_key',
    'customers_tenant_phone_normalized_key',
    'customers_tenant_phone_normalized_uidx',
    'customers_branch_id_fkey',
    'customers_created_by_fkey',
  ].find((name) => diagnosticText.includes(name)) || null
}

async function findCustomersByNormalizedIdentity(
  supabase: SupabaseClient,
  {
    tenantId,
    normalizedPhone,
    branchId,
    limit = FULL_PHONE_CANDIDATE_LIMIT,
  }: CustomerIdentityLookupOptions
) {
  let normalizedQuery = supabase
    .from('customers')
    .select('id, name, phone, display_phone')
    .eq('normalized_phone', normalizedPhone)
    .order('name', { ascending: true })
    .limit(limit)

  normalizedQuery = applyTenantFilter(normalizedQuery, tenantId)

  if (branchId) {
    normalizedQuery = normalizedQuery.eq('branch_id', branchId)
  }

  const normalizedResult = await normalizedQuery

  if (
    !normalizedResult.error &&
    Array.isArray(normalizedResult.data) &&
    normalizedResult.data.length > 0
  ) {
    return normalizedResult
  }

  if (
    normalizedResult.error &&
    !isMissingCustomerIdentityColumnError(
      normalizedResult.error,
      'normalized_phone'
    )
  ) {
    return normalizedResult
  }

  let legacyQuery = supabase
    .from('customers')
    .select('id, name, phone, display_phone')
    .ilike('phone', buildSaudiPhoneCandidatePattern(normalizedPhone))
    .order('name', { ascending: true })
    .limit(limit)

  legacyQuery = applyTenantFilter(legacyQuery, tenantId)

  if (branchId) {
    legacyQuery = legacyQuery.eq('branch_id', branchId)
  }

  const legacyResult = await legacyQuery

  if (legacyResult.error) {
    return legacyResult
  }

  return {
    ...legacyResult,
    data: (legacyResult.data || []).filter(
      (customer: CustomerListRow) =>
        normalizeSaudiCustomerPhone(customer.phone) === normalizedPhone
    ),
  }
}

function logCustomerDatabaseFailure(
  stage: 'lookup' | 'insert',
  error: CustomerDatabaseError,
  httpStatus: number
) {
  if (process.env.NODE_ENV !== 'development') return

  const code = typeof error.code === 'string' ? error.code : 'UNKNOWN'
  const constraint = resolveCustomerConstraint(error)
  const category =
    code === '23505'
      ? 'UNIQUE_VIOLATION'
      : code === '23503'
        ? 'FOREIGN_KEY_VIOLATION'
        : code === '23514'
          ? 'CHECK_VIOLATION'
          : code === '42501'
            ? 'AUTHORIZATION_FAILURE'
            : code === '22P02'
              ? 'INVALID_INPUT'
              : 'DATABASE_FAILURE'

  console.warn('[api/customers] database request failed', {
    stage,
    httpStatus,
    code,
    constraint,
    category,
  })
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback
}

type InvoiceCustomerActivityRow = {
  customer_id: string | null
  created_at: string | null
  total: number | string | null
  payment_status: string | null
  cash_received: number | string | null
  remaining_from_customer: number | string | null
}

const FULL_PHONE_CANDIDATE_LIMIT = 100

function readNumber(value: number | string | null | undefined) {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : 0

  return Number.isFinite(numericValue) ? numericValue : 0
}

function getInvoicePaidAmount(invoice: InvoiceCustomerActivityRow) {
  const paymentStatus = `${invoice.payment_status || ''}`.toLowerCase()

  if (paymentStatus === 'cancelled') {
    return null
  }

  const total = Math.max(readNumber(invoice.total), 0)
  const remaining = Math.max(readNumber(invoice.remaining_from_customer), 0)

  if (remaining > 0) {
    return Math.min(total, Math.max(total - remaining, 0))
  }

  const cashReceived = Math.max(readNumber(invoice.cash_received), 0)

  if (cashReceived > 0) {
    return Math.min(total, cashReceived)
  }

  return total
}

function normalizeCustomerText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function GET(request: NextRequest) {
  const timing = createServerTiming()
  const auth = await timing.measure('auth', () =>
    requireApiAuth(request, ['admin', 'employee', 'cashier'])
  )

  if (!auth.ok) {
    return timing.finish(auth.response)
  }

  const search = normalizeCustomerSearchTerm(
    request.nextUrl.searchParams.get('q')
  )
  const recentRequested =
    request.nextUrl.searchParams.get('recent') === '1' ||
    request.nextUrl.searchParams.get('recent') === 'true'
  const paginated = request.nextUrl.searchParams.has('page')
  const page = positiveInteger(request.nextUrl.searchParams.get('page'), 1)
  const pageSize = Math.min(
    positiveInteger(request.nextUrl.searchParams.get('pageSize'), paginated ? 25 : 50),
    100
  )

  if (!auth.profile.tenant_id) {
    return jsonWithAuthCookies(
      auth.response,
      {
        success: false,
        error: 'Tenant context is required',
      },
      403
    )
  }

  const searchFilter = buildCustomerSearchFilter(search)
  const normalizedFullPhone = normalizeSaudiCustomerPhone(search)
  const profileBranchId =
    typeof auth.profile.branch_id === 'string' ? auth.profile.branch_id : null
  const isSystemScoped = isFullAdmin(auth.profile.role)

  if (!isSystemScoped && !profileBranchId) {
    return jsonWithAuthCookies(auth.response, {
      success: true,
      customers: [],
      total: 0,
      page,
      pageSize,
    })
  }

  const customerResult = normalizedFullPhone
    ? await timing.measure('customers', () =>
        findCustomersByNormalizedIdentity(auth.supabase, {
          tenantId: auth.profile.tenant_id as string,
          normalizedPhone: normalizedFullPhone,
          branchId:
            !isSystemScoped && profileBranchId ? profileBranchId : null,
        })
      )
    : await timing.measure('customers', async () => {
        let query = auth.supabase
          .from('customers')
          .select('id, name, phone, display_phone', {
            count: paginated ? 'exact' : undefined,
          })
          .order('name', { ascending: true })

        query = applyTenantFilter(query, auth.profile.tenant_id)

        if (searchFilter) {
          query = query.or(searchFilter)
        }

        if (!isSystemScoped && profileBranchId) {
          query = query.eq('branch_id', profileBranchId)
        }

        return paginated
          ? query.range((page - 1) * pageSize, page * pageSize - 1)
          : query.limit(pageSize)
      })
  const { data, error, count } = customerResult

  if (error) {
    logCustomerDatabaseFailure('lookup', error, 500)
    return jsonWithAuthCookies(
      auth.response,
      {
        success: false,
        error: 'Failed to load customers',
      },
      500
    )
  }

  const candidateCustomers = Array.isArray(data)
    ? (data as CustomerListRow[])
    : []
  const exactPhoneMatches = candidateCustomers
  const exactPhoneTotal = exactPhoneMatches.length
  const customers = normalizedFullPhone
    ? paginated
      ? exactPhoneMatches.slice((page - 1) * pageSize, page * pageSize)
      : exactPhoneMatches.slice(0, pageSize)
    : exactPhoneMatches
  const customerIds = customers
    .map((customer) => (typeof customer.id === 'string' ? customer.id : ''))
    .filter(Boolean)
  const activityByCustomerId = new Map<
    string,
    {
      lastPurchaseAmount: number | null
      firstVisitAt: string | null
      lastActivityAt: string | null
      visitsCount: number
      totalSpent: number
    }
  >()

  if (customerIds.length > 0) {
    let activityQuery = auth.supabase
      .from('invoices')
      .select('customer_id, created_at, total, payment_status, cash_received, remaining_from_customer')
      .in('customer_id', customerIds)
      .order('created_at', { ascending: false })

    activityQuery = applyTenantFilter(activityQuery, auth.profile.tenant_id)

    if (!isSystemScoped && profileBranchId) {
      activityQuery = activityQuery.eq('branch_id', profileBranchId)
    }

    const { data: activityData, error: activityError } =
      await timing.measure('invoices', () => activityQuery)

    if (activityError) {
      console.warn('[api/customers] unable to load customer activity', {
        tenant_id: auth.profile.tenant_id,
        error: activityError.message,
      })
    } else {
      const activityRows = Array.isArray(activityData)
        ? (activityData as InvoiceCustomerActivityRow[])
        : []

      for (const invoice of activityRows) {
        const customerId =
          typeof invoice.customer_id === 'string' ? invoice.customer_id : ''

        if (!customerId) {
          continue
        }

        const createdAt =
          typeof invoice.created_at === 'string' ? invoice.created_at : null
        const createdTime = createdAt ? new Date(createdAt).getTime() : NaN
        const paidAmount = getInvoicePaidAmount(invoice)
        const current =
          activityByCustomerId.get(customerId) || {
            lastPurchaseAmount: null,
            firstVisitAt: null,
            lastActivityAt: null,
            visitsCount: 0,
            totalSpent: 0,
          }
        const firstVisitTime = current.firstVisitAt
          ? new Date(current.firstVisitAt).getTime()
          : NaN
        const lastActivityTime = current.lastActivityAt
          ? new Date(current.lastActivityAt).getTime()
          : NaN

        if (
          createdAt &&
          !Number.isNaN(createdTime) &&
          (Number.isNaN(firstVisitTime) || createdTime < firstVisitTime)
        ) {
          current.firstVisitAt = createdAt
        }

        if (
          createdAt &&
          !Number.isNaN(createdTime) &&
          (Number.isNaN(lastActivityTime) || createdTime > lastActivityTime)
        ) {
          current.lastActivityAt = createdAt
        }

        if (current.lastPurchaseAmount === null && paidAmount !== null) {
          current.lastPurchaseAmount = paidAmount
        }

        current.visitsCount += 1
        current.totalSpent += paidAmount ?? 0
        activityByCustomerId.set(customerId, current)
      }
    }
  }

  const customersWithActivity = timing.measureSync('map', () => customers.map((customer) => {
    const activity =
      typeof customer.id === 'string'
        ? activityByCustomerId.get(customer.id)
        : null

    return {
      ...customer,
      phone: customer.display_phone || customer.phone,
      lastPurchaseAmount: activity?.lastPurchaseAmount ?? null,
      firstVisitAt: activity?.firstVisitAt ?? null,
      lastActivityAt: activity?.lastActivityAt ?? null,
      visitsCount: activity?.visitsCount ?? 0,
      totalSpent: activity?.totalSpent ?? 0,
    }
  }))

  if (recentRequested) {
    customersWithActivity.sort((left, right) => {
      const leftTime = left.lastActivityAt
        ? new Date(left.lastActivityAt).getTime()
        : 0
      const rightTime = right.lastActivityAt
        ? new Date(right.lastActivityAt).getTime()
        : 0

      return rightTime - leftTime
    })
  }

  const response = await timing.measure('serialize', async () => jsonWithAuthCookies(auth.response, {
    success: true,
    customers: customersWithActivity,
    total: normalizedFullPhone
      ? exactPhoneTotal
      : paginated
        ? count || 0
        : customersWithActivity.length,
    page,
    pageSize,
  }))
  return timing.finish(response)
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin', 'employee', 'cashier'])

  if (!auth.ok) {
    return auth.response
  }

  if (!auth.profile.tenant_id) {
    return jsonWithAuthCookies(
      auth.response,
      {
        success: false,
        error: 'Tenant context is required',
      },
      403
    )
  }

  const body = await request.json().catch(() => null)
  const name = normalizeCustomerText(body?.name)
  const phone = normalizeCustomerText(body?.phone)
  const email = normalizeCustomerText(body?.email) || null
  const notes = normalizeCustomerText(body?.notes) || null
  const requestedBranchId = normalizeCustomerText(body?.branchId)
  const profileBranchId =
    typeof auth.profile.branch_id === 'string' ? auth.profile.branch_id : ''
  const isSystemScoped = isFullAdmin(auth.profile.role)
  const branchId = isSystemScoped
    ? requestedBranchId || profileBranchId || null
    : profileBranchId || null
  const customerIdentity = prepareCustomerIdentity(phone)

  if (!name) {
    return jsonWithAuthCookies(
      auth.response,
      {
        success: false,
        error: 'اسم العميل مطلوب',
      },
      400
    )
  }

  if (!customerIdentity.ok) {
    return jsonWithAuthCookies(
      auth.response,
      {
        success: false,
        error: customerIdentity.message,
        code: customerIdentity.code,
      },
      400
    )
  }

  if (!isSystemScoped && !branchId) {
    return jsonWithAuthCookies(
      auth.response,
      {
        success: false,
        error: 'تعذر تحديد فرع الحساب',
      },
      403
    )
  }

  const {
    data: duplicatePhoneCandidates,
    error: duplicatePhoneError,
  } = await findCustomersByNormalizedIdentity(auth.supabase, {
    tenantId: auth.profile.tenant_id,
    normalizedPhone: customerIdentity.identity.phoneNormalized,
  })

  if (duplicatePhoneError) {
    logCustomerDatabaseFailure('lookup', duplicatePhoneError, 500)
    return jsonWithAuthCookies(
      auth.response,
      {
        success: false,
        error: 'تعذر التحقق من رقم الجوال حاليًا. حاول مرة أخرى.',
        code: 'CUSTOMER_PHONE_LOOKUP_FAILED',
      },
      500
    )
  }

  const duplicatePhoneCustomer = duplicatePhoneCandidates?.[0]

  if (duplicatePhoneCustomer) {
    return jsonWithAuthCookies(
      auth.response,
      {
        success: false,
        error: CUSTOMER_PHONE_ERRORS.duplicate,
        code: 'CUSTOMER_PHONE_CONFLICT',
      },
      409
    )
  }

  const { data, error } = await auth.supabase
    .rpc('create_customer_with_phone_identity_v1', {
      p_tenant_id: auth.profile.tenant_id,
      p_branch_id: branchId,
      p_name: name,
      p_display_phone: customerIdentity.identity.phone,
      p_email: email,
      p_notes: notes,
    })
    .single()

  if (error) {
    const constraint = resolveCustomerConstraint(error)
    const isRegistryConflict =
      error.code === 'P0001' && error.message === 'CUSTOMER_SCOPE_CONFLICT'
    const isUniqueConflict = error.code === '23505' || isRegistryConflict
    const isPhoneConflict =
      isUniqueConflict &&
      (constraint === 'customers_phone_key' ||
        constraint === 'customers_tenant_phone_normalized_key' ||
        constraint === 'customers_tenant_phone_normalized_uidx' ||
        isRegistryConflict)
    const status = isUniqueConflict ? 409 : 500
    logCustomerDatabaseFailure('insert', error, status)
    return jsonWithAuthCookies(
      auth.response,
      {
        success: false,
        error: isPhoneConflict
          ? CUSTOMER_PHONE_ERRORS.duplicate
          : isUniqueConflict
            ? 'Customer already exists'
            : 'Failed to create customer',
        code: isUniqueConflict
          ? isPhoneConflict
            ? 'CUSTOMER_PHONE_CONFLICT'
            : 'CUSTOMER_CONFLICT'
          : 'CUSTOMER_PERSISTENCE_FAILED',
      },
      status
    )
  }

  const createdCustomer = data as {
    id: string
    name: string
    phone: string
  }

  return jsonWithAuthCookies(auth.response, {
    success: true,
    customer: {
      ...createdCustomer,
      lastPurchaseAmount: null,
      firstVisitAt: null,
      lastActivityAt: null,
      visitsCount: 0,
      totalSpent: 0,
    },
  })
}

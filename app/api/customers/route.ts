import { NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireApiAuth } from '@/lib/api-auth'
import {
  buildCustomerSearchFilter,
  normalizeCustomerSearchTerm,
} from '@/lib/customers'
import { applyTenantFilter } from '@/lib/tenant-filter'

type CustomerListRow = {
  id: string | null
  name: string | null
  phone: string | null
}

type InvoiceCustomerActivityRow = {
  customer_id: string | null
  created_at: string | null
  total: number | string | null
  payment_status: string | null
  cash_received: number | string | null
  remaining_from_customer: number | string | null
}

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
  const auth = await requireApiAuth(request, ['admin', 'employee', 'cashier'])

  if (!auth.ok) {
    return auth.response
  }

  const search = normalizeCustomerSearchTerm(
    request.nextUrl.searchParams.get('q')
  )
  const requestedBranchId =
    request.nextUrl.searchParams.get('branchId') ||
    request.nextUrl.searchParams.get('branch_id') ||
    null
  const recentRequested =
    request.nextUrl.searchParams.get('recent') === '1' ||
    request.nextUrl.searchParams.get('recent') === 'true'

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
  const profileBranchId =
    typeof auth.profile.branch_id === 'string' ? auth.profile.branch_id : null

  let tenantSearchCountQuery = auth.supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
  tenantSearchCountQuery = applyTenantFilter(
    tenantSearchCountQuery,
    auth.profile.tenant_id
  )

  if (searchFilter) {
    tenantSearchCountQuery = tenantSearchCountQuery.or(searchFilter)
  }

  const { count: tenantSearchCount, error: tenantSearchCountError } =
    await tenantSearchCountQuery

  let branchDebugQuery = auth.supabase
    .from('customers')
    .select('id, branch_id, phone')
    .limit(50)
  branchDebugQuery = applyTenantFilter(branchDebugQuery, auth.profile.tenant_id)

  if (searchFilter) {
    branchDebugQuery = branchDebugQuery.or(searchFilter)
  }

  const { data: branchDebugRows, error: branchDebugError } =
    await branchDebugQuery

  let query = auth.supabase
    .from('customers')
    .select('id, name, phone')
    .order('name', { ascending: true })
    .limit(50)

  query = applyTenantFilter(query, auth.profile.tenant_id)

  if (searchFilter) {
    query = query.or(searchFilter)
  }

  const { data, error } = await query

  if (error) {
    return jsonWithAuthCookies(
      auth.response,
      {
        success: false,
        error: error.message,
      },
      500
    )
  }

  const customers = Array.isArray(data) ? (data as CustomerListRow[]) : []
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
      .limit(1000)

    activityQuery = applyTenantFilter(activityQuery, auth.profile.tenant_id)

    const { data: activityData, error: activityError } = await activityQuery

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

  const customersWithActivity = customers.map((customer) => {
    const activity =
      typeof customer.id === 'string'
        ? activityByCustomerId.get(customer.id)
        : null

    return {
      ...customer,
      lastPurchaseAmount: activity?.lastPurchaseAmount ?? null,
      firstVisitAt: activity?.firstVisitAt ?? null,
      lastActivityAt: activity?.lastActivityAt ?? null,
      visitsCount: activity?.visitsCount ?? 0,
      totalSpent: activity?.totalSpent ?? 0,
    }
  })

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

  const branchDebugItems = Array.isArray(branchDebugRows) ? branchDebugRows : []
  const nullBranchCount = branchDebugItems.filter(
    (customer) => !customer.branch_id
  ).length
  const differentBranchCount = requestedBranchId
    ? branchDebugItems.filter(
        (customer) =>
          customer.branch_id && customer.branch_id !== requestedBranchId
      ).length
    : 0

  console.info('[api/customers] customer search debug', {
    tenant_id: auth.profile.tenant_id,
    requested_branch_id: requestedBranchId,
    profile_branch_id: profileBranchId,
    role: auth.profile.role,
    account_type: 'profile',
    search_query: search,
    search_filter: searchFilter,
    customer_scope: 'tenant',
    tenant_search_count: tenantSearchCount ?? null,
    result_count: customersWithActivity.length,
    recent_requested: recentRequested,
    branch_debug: {
      branch_id_null_count_in_sample: nullBranchCount,
      branch_id_different_count_in_sample: differentBranchCount,
      sample_size: branchDebugItems.length,
      tenant_count_error: tenantSearchCountError?.message ?? null,
      branch_debug_error: branchDebugError?.message ?? null,
    },
  })

  return jsonWithAuthCookies(auth.response, {
    success: true,
    customers: customersWithActivity,
  })
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
  const branchId = requestedBranchId || profileBranchId || null

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

  if (!phone) {
    return jsonWithAuthCookies(
      auth.response,
      {
        success: false,
        error: 'رقم الجوال مطلوب',
      },
      400
    )
  }

  const { data, error } = await auth.supabase
    .from('customers')
    .insert({
      tenant_id: auth.profile.tenant_id,
      branch_id: branchId,
      name,
      phone,
      email,
      notes,
    })
    .select('id, name, phone')
    .single()

  if (error) {
    return jsonWithAuthCookies(
      auth.response,
      {
        success: false,
        error: error.message,
      },
      500
    )
  }

  return jsonWithAuthCookies(auth.response, {
    success: true,
    customer: {
      ...data,
      lastPurchaseAmount: null,
      firstVisitAt: null,
      lastActivityAt: null,
      visitsCount: 0,
      totalSpent: 0,
    },
  })
}

import { NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireApiAuth } from '@/lib/api-auth'
import {
  buildCustomerSearchFilter,
  normalizeCustomerSearchTerm,
} from '@/lib/customers'
import { applyTenantFilter } from '@/lib/tenant-filter'

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
    result_count: Array.isArray(data) ? data.length : 0,
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
    customers: Array.isArray(data) ? data : [],
  })
}

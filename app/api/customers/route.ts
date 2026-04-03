import { NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireApiAuth } from '@/lib/api-auth'
import { normalizeAdminBranchId } from '@/lib/admin/branches'
import {
  isBranchScopedWithoutBranchId,
  shouldFilterByBranch,
} from '@/lib/branch-access'
import {
  buildCustomerSearchFilter,
  normalizeCustomerSearchTerm,
} from '@/lib/customers'

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin', 'employee', 'cashier'])

  if (!auth.ok) {
    return auth.response
  }

  const search = normalizeCustomerSearchTerm(
    request.nextUrl.searchParams.get('q')
  )
  const requestedBranchId = normalizeAdminBranchId(
    request.nextUrl.searchParams.get('branch_id')
  )

  let query = auth.supabase
    .from('customers')
    .select('id, name, phone')
    .order('name', { ascending: true })
    .limit(50)

  if (isBranchScopedWithoutBranchId(auth.profile.scope_type, auth.profile.branch_id)) {
    return jsonWithAuthCookies(auth.response, {
      success: true,
      customers: [],
    })
  }

  if (shouldFilterByBranch(auth.profile.scope_type, auth.profile.branch_id)) {
    query = query.eq('branch_id', auth.profile.branch_id as string)
  } else if (auth.profile.scope_type === 'system' && requestedBranchId) {
    query = query.eq('branch_id', requestedBranchId)
  }

  const searchFilter = buildCustomerSearchFilter(search)

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

  return jsonWithAuthCookies(auth.response, {
    success: true,
    customers: Array.isArray(data) ? data : [],
  })
}

import { NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireApiAuth } from '@/lib/api-auth'
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

  let query = auth.supabase
    .from('customers')
    .select('id, name, phone')
    .order('name', { ascending: true })
    .limit(50)

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

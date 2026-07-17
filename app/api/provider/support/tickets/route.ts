import { NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import {
  SUPPORT_CATEGORIES,
  SUPPORT_OPERATIONAL_FILTERS,
  SUPPORT_LIFECYCLE_SCOPES,
  SUPPORT_PRIORITIES,
  type ProviderOperationalDashboard,
} from '@/lib/support/contracts'
import { isOneOf, positiveInteger, requireSupportAuth, text } from '@/lib/support/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const ASSIGNMENT_FILTERS = ['all', 'me', 'unassigned', 'assigned'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isOperationalDashboard(value: unknown): value is ProviderOperationalDashboard {
  if (!isRecord(value) || !Array.isArray(value.items) || !isRecord(value.pagination) || !isRecord(value.summary)) return false
  return typeof value.pagination.page === 'number'
    && typeof value.pagination.page_size === 'number'
    && typeof value.pagination.total === 'number'
    && typeof value.calculated_at === 'string'
}

export async function GET(request: NextRequest) {
  const auth = await requireSupportAuth(request)
  if (!auth.ok) return auth.response
  if (!auth.isProvider) {
    return jsonWithAuthCookies(auth.response, { success: false, error: 'لا تملك صلاحية الوصول إلى لوحة دعم AFEX.' }, 403)
  }

  const params = request.nextUrl.searchParams
  const page = positiveInteger(params.get('page'), 1, 100000)
  const pageSize = positiveInteger(params.get('pageSize'), 25, 100)
  const status = params.get('status')
  const priority = params.get('priority')
  const category = params.get('category')
  const assignment = params.get('assignment')
  const operationalFilter = params.get('operational_filter')
  const search = text(params.get('search'), 100).replace(/[,()%_]/g, ' ')
  const organization = text(params.get('tenant'), 120).replace(/[%_]/g, ' ')

  try {
    const [dashboardResult, organizationsResult] = await Promise.all([
      supabaseAdmin.rpc('get_provider_support_operational_dashboard', {
        p_provider_user_id: auth.user.id,
        p_page: page,
        p_page_size: pageSize,
        p_search: search || null,
        p_status: isOneOf(status, SUPPORT_LIFECYCLE_SCOPES) ? status : 'active',
        p_priority: isOneOf(priority, SUPPORT_PRIORITIES) ? priority : null,
        p_category: isOneOf(category, SUPPORT_CATEGORIES) ? category : null,
        p_organization: organization || null,
        p_assignment: isOneOf(assignment, ASSIGNMENT_FILTERS) ? assignment : 'all',
        p_operational_filter: isOneOf(operationalFilter, SUPPORT_OPERATIONAL_FILTERS) ? operationalFilter : 'all',
      }),
      supabaseAdmin.from('tenants').select('name').not('name', 'is', null).order('name').limit(500),
    ])
    if (dashboardResult.error || organizationsResult.error) throw dashboardResult.error || organizationsResult.error
    if (!isOperationalDashboard(dashboardResult.data)) throw new Error('Invalid provider operational dashboard contract')

    const organizations = [...new Set(
      (organizationsResult.data || [])
        .map((tenant) => tenant.name)
        .filter((name): name is string => Boolean(name)),
    )]

    return jsonWithAuthCookies(auth.response, {
      success: true,
      ...dashboardResult.data,
      organizations,
    })
  } catch {
    return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر تحميل لوحة دعم AFEX.' }, 500)
  }
}

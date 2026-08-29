import { NextRequest } from 'next/server'

import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireApiAuth } from '@/lib/api-auth'
import { buildSelectedCustomerProfile } from '@/lib/customers'
import { applyTenantFilter } from '@/lib/tenant-filter'

const CUSTOMER_PAGE_SIZE = 500
const CUSTOMER_SNAPSHOT_LIMIT = 10_000
const CUSTOMER_PROFILE_SELECT =
  'id, customer_code, name, phone, display_phone, email, city, address, notes, created_at'

function safeBranchId(value: string | null) {
  return typeof value === 'string' ? value.trim() : ''
}

function isSensitiveSettingName(name: string) {
  const normalized = name.toLowerCase()
  return (
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized.includes('api_key') ||
    normalized.includes('apikey') ||
    normalized.includes('access_key') ||
    normalized === 'ultramsg_instance_id' ||
    normalized === 'ultramsg_api_url'
  )
}

function sanitizePosSettings(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, fieldValue]) =>
      isSensitiveSettingName(key) ? [] : [[key, fieldValue]]
    )
  )
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin', 'employee', 'cashier'])
  if (!auth.ok) return auth.response

  const tenantId = auth.profile.tenant_id
  const profileBranchId = safeBranchId(auth.profile.branch_id || null)
  const requestedBranchId = safeBranchId(
    request.nextUrl.searchParams.get('branchId')
  )
  const branchId = profileBranchId || requestedBranchId

  if (!tenantId || !branchId || (profileBranchId && requestedBranchId !== profileBranchId)) {
    return jsonWithAuthCookies(
      auth.response,
      { success: false, code: 'OFFLINE_READ_SCOPE_INVALID' },
      403
    )
  }

  const branchResult = await auth.supabase
    .from('branches')
    .select('id, name, code')
    .eq('id', branchId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (branchResult.error || !branchResult.data) {
    return jsonWithAuthCookies(
      auth.response,
      { success: false, code: 'OFFLINE_READ_BRANCH_UNAVAILABLE' },
      branchResult.error ? 500 : 403
    )
  }

  const customers: unknown[] = []
  for (let offset = 0; offset < CUSTOMER_SNAPSHOT_LIMIT; offset += CUSTOMER_PAGE_SIZE) {
    let query = auth.supabase
      .from('customers')
      .select(CUSTOMER_PROFILE_SELECT)
      .order('name', { ascending: true })
      .range(offset, offset + CUSTOMER_PAGE_SIZE - 1)
    query = applyTenantFilter(query, tenantId)
    const page = await query
    if (page.error) {
      return jsonWithAuthCookies(
        auth.response,
        { success: false, code: 'OFFLINE_READ_CUSTOMERS_UNAVAILABLE' },
        500
      )
    }
    const rows = Array.isArray(page.data) ? page.data : []
    for (const row of rows) {
      const profile = buildSelectedCustomerProfile(row, {
        visitCount: null,
        totalSpending: null,
        lastOrderNumber: null,
        lastOrderAt: null,
      })
      if (profile) customers.push(profile)
    }
    if (rows.length < CUSTOMER_PAGE_SIZE) break
    if (offset + CUSTOMER_PAGE_SIZE >= CUSTOMER_SNAPSHOT_LIMIT) {
      return jsonWithAuthCookies(
        auth.response,
        { success: false, code: 'OFFLINE_READ_CUSTOMERS_CAPACITY_EXCEEDED' },
        409
      )
    }
  }

  let settingsQuery = auth.supabase.from('system_settings').select('*').limit(1)
  settingsQuery = applyTenantFilter(settingsQuery, tenantId)
  const [settingsResult, tenantResult] = await Promise.all([
    settingsQuery.maybeSingle(),
    auth.supabase.from('tenants').select('name').eq('id', tenantId).maybeSingle(),
  ])
  if (settingsResult.error || tenantResult.error) {
    return jsonWithAuthCookies(
      auth.response,
      { success: false, code: 'OFFLINE_READ_SETTINGS_UNAVAILABLE' },
      500
    )
  }

  const response = jsonWithAuthCookies(auth.response, {
    success: true,
    contractVersion: 'afex-pos-offline-read-snapshot.v1',
    confirmedAt: new Date().toISOString(),
    customers,
    settings: {
      ...(sanitizePosSettings(settingsResult.data) || {}),
      store_name: tenantResult.data?.name || null,
      branch_name: branchResult.data.name || branchResult.data.code || null,
    },
  })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

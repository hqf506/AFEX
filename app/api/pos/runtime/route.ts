import { NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireApiAuth } from '@/lib/api-auth'
import { isSystemScopedAdmin, normalizeAdminBranchId } from '@/lib/admin/branches'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'
import {
  disabledFeatureResponse,
  POS_FEATURE_DISABLED_MESSAGE,
} from '@/lib/feature-guards'
import { createServerTiming } from '@/lib/performance/server-timing'

export async function GET(request: NextRequest) {
  const timing = createServerTiming()
  const auth = await timing.measure('auth', () =>
    requireApiAuth(request, ['admin', 'employee', 'cashier'])
  )
  if (!auth.ok) return timing.finish(auth.response)

  const tenantId = auth.profile.tenant_id
  if (!tenantId) {
    return timing.finish(jsonWithAuthCookies(auth.response, { success: false, error: 'Tenant context is required' }, 403))
  }

  const featureDisabledResponse = await timing.measure(
    'settings',
    () => disabledFeatureResponse(
      auth.response,
      tenantId,
      'enable_pos',
      POS_FEATURE_DISABLED_MESSAGE
    )
  )
  if (featureDisabledResponse) return timing.finish(featureDisabledResponse)

  if (!isSystemScopedAdmin(auth.profile.scope_type) && !auth.profile.branch_id) {
    return timing.finish(jsonWithAuthCookies(
      auth.response,
      { success: false, error: 'A branch is required for POS access' },
      403
    ))
  }

  const requestedBranchId = normalizeAdminBranchId(request.nextUrl.searchParams.get('branchId'))
  const branchId = isSystemScopedAdmin(auth.profile.scope_type)
    ? requestedBranchId || null
    : auth.profile.branch_id || null

  if (branchId) {
    let branchQuery = supabaseAdmin.from('branches').select('id').eq('id', branchId)
    branchQuery = applyTenantFilter(branchQuery, tenantId)
    const { data: branch, error } = await timing.measure('branches', () =>
      branchQuery.maybeSingle()
    )
    if (error || !branch) {
      return timing.finish(jsonWithAuthCookies(auth.response, { success: false, error: 'Invalid branch' }, 403))
    }
  }

  let discountsQuery = supabaseAdmin
    .from('discounts')
    .select('id, name, type, value, is_active, branch_id')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
  discountsQuery = applyTenantFilter(discountsQuery, tenantId)
  discountsQuery = branchId
    ? discountsQuery.or(`branch_id.is.null,branch_id.eq.${branchId}`)
    : discountsQuery.is('branch_id', null)

  let vatQuery = supabaseAdmin
    .from('vat_settings')
    .select('id, name, rate, is_active, branch_id')
  vatQuery = applyTenantFilter(vatQuery, tenantId)
  vatQuery = branchId
    ? vatQuery.or(`branch_id.eq.${branchId},branch_id.is.null`)
    : vatQuery.is('branch_id', null)

  const [discountsResult, vatResult] = await Promise.all([
    timing.measure('settings', () => discountsQuery),
    timing.measure('settings', () => vatQuery),
  ])
  if (discountsResult.error || vatResult.error) {
    return timing.finish(jsonWithAuthCookies(auth.response, {
      success: false,
      error: 'Failed to load POS runtime settings',
    }, 500))
  }

  const vatRows = Array.isArray(vatResult.data) ? vatResult.data : []
  const vat = vatRows.find((row) => row.branch_id === branchId) || vatRows.find((row) => row.branch_id === null) || {
    id: '', name: 'VAT', rate: 15, is_active: false, branch_id: branchId,
  }

  const response = await timing.measure('serialize', async () => jsonWithAuthCookies(auth.response, {
    success: true,
    runtime: {
      discounts: (discountsResult.data || []).map((row) => ({ ...row, value: Number(row.value) || 0 })),
      vat: { ...vat, rate: Number(vat.rate) || 0 },
    },
  }))
  return timing.finish(response)
}

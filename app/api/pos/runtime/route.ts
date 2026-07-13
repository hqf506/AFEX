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

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin', 'employee', 'cashier'])
  if (!auth.ok) return auth.response

  const tenantId = auth.profile.tenant_id
  if (!tenantId) {
    return jsonWithAuthCookies(auth.response, { success: false, error: 'Tenant context is required' }, 403)
  }

  const featureDisabledResponse = await disabledFeatureResponse(
    auth.response,
    tenantId,
    'enable_pos',
    POS_FEATURE_DISABLED_MESSAGE
  )
  if (featureDisabledResponse) return featureDisabledResponse

  if (!isSystemScopedAdmin(auth.profile.scope_type) && !auth.profile.branch_id) {
    return jsonWithAuthCookies(
      auth.response,
      { success: false, error: 'A branch is required for POS access' },
      403
    )
  }

  const requestedBranchId = normalizeAdminBranchId(request.nextUrl.searchParams.get('branchId'))
  const branchId = isSystemScopedAdmin(auth.profile.scope_type)
    ? requestedBranchId || null
    : auth.profile.branch_id || null

  if (branchId) {
    let branchQuery = supabaseAdmin.from('branches').select('id').eq('id', branchId)
    branchQuery = applyTenantFilter(branchQuery, tenantId)
    const { data: branch, error } = await branchQuery.maybeSingle()
    if (error || !branch) {
      return jsonWithAuthCookies(auth.response, { success: false, error: 'Invalid branch' }, 403)
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
    .select('id, name, rate, is_active, branch_id, created_at, updated_at')
  vatQuery = applyTenantFilter(vatQuery, tenantId)
  vatQuery = branchId
    ? vatQuery.or(`branch_id.eq.${branchId},branch_id.is.null`)
    : vatQuery.is('branch_id', null)

  const [discountsResult, vatResult] = await Promise.all([discountsQuery, vatQuery])
  if (discountsResult.error || vatResult.error) {
    return jsonWithAuthCookies(auth.response, {
      success: false,
      error: 'Failed to load POS runtime settings',
    }, 500)
  }

  const vatRows = Array.isArray(vatResult.data) ? vatResult.data : []
  const vat = vatRows.find((row) => row.branch_id === branchId) || vatRows.find((row) => row.branch_id === null) || {
    id: '', name: 'VAT', rate: 15, is_active: false, branch_id: branchId, created_at: '', updated_at: '',
  }

  return jsonWithAuthCookies(auth.response, {
    success: true,
    runtime: {
      discounts: (discountsResult.data || []).map((row) => ({ ...row, value: Number(row.value) || 0 })),
      vat: { ...vat, rate: Number(vat.rate) || 0 },
    },
  })
}

import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { isSystemScopedAdmin, normalizeAdminBranchId } from '@/lib/admin/branches'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'

type VatSettingRecord = {
  id: string
  name: string
  rate: number | string
  is_active: boolean
  branch_id: string | null
  created_at: string
  updated_at: string
}

type UpsertVatBody = {
  name?: string
  rate?: number | string
  is_active?: boolean
  branch_id?: string | null
}

function utf8JsonResponse(data: Record<string, unknown>, status = 200) {
  const response = jsonResponse(data, status)
  response.headers.set('Content-Type', 'application/json; charset=utf-8')
  return response
}

function normalizeVatName(value: unknown) {
  if (typeof value !== 'string') {
    return 'VAT'
  }

  const normalizedValue = value.trim()
  return normalizedValue || 'VAT'
}

function normalizeVatRate(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim()
    if (!normalizedValue) {
      return NaN
    }

    const parsed = Number(normalizedValue)
    return Number.isFinite(parsed) ? parsed : NaN
  }

  return NaN
}

function normalizeOptionalVatBranchId(value: unknown) {
  const normalizedValue = normalizeAdminBranchId(value)
  return normalizedValue || null
}

function mapVatSettingRecord(record: VatSettingRecord) {
  return {
    ...record,
    rate: Number(record.rate) || 0,
  }
}

function getEmptyVatSetting(branchId: string | null) {
  return {
    id: '',
    name: 'VAT',
    rate: 15,
    is_active: false,
    branch_id: branchId,
    created_at: '',
    updated_at: '',
  }
}

async function branchBelongsToTenant(branchId: string, tenantId: string) {
  let query = supabaseAdmin
    .from('branches')
    .select('id')
    .eq('id', branchId)

  query = applyTenantFilter(query, tenantId)

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return Boolean(data)
}

async function findVatSettingByScope(
  branchId: string | null,
  tenantId: string
) {
  if (branchId) {
    let scopedQuery = supabaseAdmin
      .from('vat_settings')
      .select('id, name, rate, is_active, branch_id, created_at, updated_at')
      .eq('branch_id', branchId)

    scopedQuery = applyTenantFilter(scopedQuery, tenantId)

    const { data: scopedSetting, error: scopedError } = await scopedQuery
      .maybeSingle()

    if (scopedError) {
      throw new Error(scopedError.message)
    }

    if (scopedSetting) {
      return mapVatSettingRecord(scopedSetting as VatSettingRecord)
    }
  }

  let globalQuery = supabaseAdmin
    .from('vat_settings')
    .select('id, name, rate, is_active, branch_id, created_at, updated_at')
    .is('branch_id', null)

  globalQuery = applyTenantFilter(globalQuery, tenantId)

  const { data: globalSetting, error: globalError } = await globalQuery
    .maybeSingle()

  if (globalError) {
    throw new Error(globalError.message)
  }

  if (globalSetting) {
    return mapVatSettingRecord(globalSetting as VatSettingRecord)
  }

  return getEmptyVatSetting(branchId)
}

async function upsertVatSetting(body: UpsertVatBody, tenantId: string) {
  const name = normalizeVatName(body.name)
  const rate = normalizeVatRate(body.rate)
  const branchId = normalizeOptionalVatBranchId(body.branch_id)
  const isActive = body.is_active

  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error('نسبة الضريبة غير صالحة')
  }

  if (typeof isActive !== 'boolean') {
    throw new Error('حالة الضريبة غير صالحة')
  }

  if (branchId && !(await branchBelongsToTenant(branchId, tenantId))) {
    throw new Error('الفرع غير موجود')
  }

  let existingQuery = supabaseAdmin
    .from('vat_settings')
    .select('id, name, rate, is_active, branch_id, created_at, updated_at')

  existingQuery = applyTenantFilter(existingQuery, tenantId)

  existingQuery = branchId
    ? existingQuery.eq('branch_id', branchId)
    : existingQuery.is('branch_id', null)

  const { data: existingSetting, error: existingSettingError } =
    await existingQuery.maybeSingle()

  if (existingSettingError) {
    throw new Error(existingSettingError.message)
  }

  const timestamp = new Date().toISOString()

  if (existingSetting) {
    const { data: updatedSetting, error: updateError } = await supabaseAdmin
      .from('vat_settings')
      .update({
        name,
        rate,
        is_active: isActive,
        branch_id: branchId,
        tenant_id: tenantId,
        updated_at: timestamp,
      })
      .eq('id', existingSetting.id)
      .eq('tenant_id', tenantId)
      .select('id, name, rate, is_active, branch_id, created_at, updated_at')
      .single()

    if (updateError || !updatedSetting) {
      throw new Error(updateError?.message || 'تعذر تحديث إعدادات الضريبة')
    }

    return mapVatSettingRecord(updatedSetting as VatSettingRecord)
  }

  const { data: createdSetting, error: createError } = await supabaseAdmin
    .from('vat_settings')
    .insert({
      name,
      rate,
      is_active: isActive,
      branch_id: branchId,
      tenant_id: tenantId,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .select('id, name, rate, is_active, branch_id, created_at, updated_at')
    .single()

  if (createError || !createdSetting) {
    throw new Error(createError?.message || 'تعذر حفظ إعدادات الضريبة')
  }

  return mapVatSettingRecord(createdSetting as VatSettingRecord)
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin', 'employee', 'cashier'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({
          success: true,
          setting: getEmptyVatSetting(null),
        })
      )
    }

    const requestedBranchId = normalizeOptionalVatBranchId(
      request.nextUrl.searchParams.get('branchId')
    )
    const effectiveBranchId = isSystemScopedAdmin(auth.profile.scope_type)
      ? requestedBranchId
      : auth.profile.branch_id

    const setting = await findVatSettingByScope(effectiveBranchId, tenantId)

    return withAuthCookies(
      auth.response,
      utf8JsonResponse({
        success: true,
        setting,
      })
    )
  } catch (error) {
    return withAuthCookies(
      auth.response,
      utf8JsonResponse(
        {
          error: 'تعذر تحميل إعدادات الضريبة',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      )
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  if (!isSystemScopedAdmin(auth.profile.scope_type)) {
    return withAuthCookies(
      auth.response,
      utf8JsonResponse({ error: 'هذه العملية متاحة لمدير النظام فقط' }, 403)
    )
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'تعذر تحديد نطاق المنشأة' }, 400)
      )
    }

    const body = (await request.json()) as UpsertVatBody
    const setting = await upsertVatSetting(body, tenantId)

    return withAuthCookies(
      auth.response,
      utf8JsonResponse({
        success: true,
        message: 'تم حفظ إعدادات الضريبة بنجاح',
        setting,
      })
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'تعذر حفظ إعدادات الضريبة'

    return withAuthCookies(
      auth.response,
      utf8JsonResponse(
        {
          error: message,
          details: message,
        },
        400
      )
    )
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  if (!isSystemScopedAdmin(auth.profile.scope_type)) {
    return withAuthCookies(
      auth.response,
      utf8JsonResponse({ error: 'هذه العملية متاحة لمدير النظام فقط' }, 403)
    )
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'تعذر تحديد نطاق المنشأة' }, 400)
      )
    }

    const body = (await request.json()) as UpsertVatBody
    const setting = await upsertVatSetting(body, tenantId)

    return withAuthCookies(
      auth.response,
      utf8JsonResponse({
        success: true,
        message: 'تم تحديث إعدادات الضريبة بنجاح',
        setting,
      })
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'تعذر تحديث إعدادات الضريبة'

    return withAuthCookies(
      auth.response,
      utf8JsonResponse(
        {
          error: message,
          details: message,
        },
        400
      )
    )
  }
}

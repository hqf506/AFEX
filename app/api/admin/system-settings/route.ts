import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import {
  normalizeSystemSettingsUpdatePayload,
  type SystemSettingsUpdatePayload,
} from '@/lib/admin/settings'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'
import { safeErrorDetails } from '@/lib/security/redaction'
import { isFullAdmin } from '@/lib/permissions'
import { createServerTiming } from '@/lib/performance/server-timing'

type OrganizationInfo = {
  storeName: string | null
  branchId: string | null
  branchName: string | null
  ownerName: string | null
  ownerPhone: string | null
  ownerEmail: string | null
  address: string | null
  logoUrl: string | null
}

type VatSettingInfo = {
  rate: number
  isActive: boolean
  branchId: string | null
}

type CurrentAccountInfo = {
  username: string | null
  fullName: string | null
  email: string | null
  phone: string | null
  branchName: string | null
  role: string
  isActive: boolean
}

const SENSITIVE_SETTINGS_FIELDS = new Set([
  'ultramsg_token',
  'ultramsg_instance_id',
  'ultramsg_api_url',
])

function isSensitiveSettingsField(key: string) {
  const normalizedKey = key.toLowerCase()

  return (
    SENSITIVE_SETTINGS_FIELDS.has(normalizedKey) ||
    normalizedKey.includes('token') ||
    normalizedKey.includes('secret') ||
    normalizedKey.includes('api_key') ||
    normalizedKey.includes('apikey') ||
    normalizedKey.includes('access_key')
  )
}

function hasStoredSettingValue(value: unknown) {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value)
}

function sanitizeSystemSettings(settings: unknown) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return null
  }

  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(settings)) {
    if (isSensitiveSettingsField(key)) {
      sanitized[`has_${key}`] = hasStoredSettingValue(value)
      continue
    }

    sanitized[key] = value
  }

  return sanitized
}

function minimizeOrganizationInfoForRole(
  organizationInfo: OrganizationInfo,
  role: string | null | undefined
): OrganizationInfo {
  if (isFullAdmin(role)) {
    return organizationInfo
  }

  return {
    ...organizationInfo,
    // Runtime roles need display/settings context, not owner personal contacts.
    ownerPhone: null,
    ownerEmail: null,
  }
}

export async function GET(request: NextRequest) {
  const timing = createServerTiming('system-settings')
  const auth = await timing.measure('auth', () =>
    requireApiAuth(request, ['admin', 'employee', 'cashier'])
  )

  if (!auth.ok) {
    return timing.finish(auth.response)
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      const response = jsonResponse({
        success: true,
        settings: null,
      })

      return timing.finish(withAuthCookies(auth.response, response))
    }

    let query = supabaseAdmin
      .from('system_settings')
      .select('*')
      .limit(1)

    query = applyTenantFilter(query, tenantId)

    const [
      settingsResult,
      tenantResult,
      ownerResult,
      branchResult,
      branchVatResult,
      globalVatResult,
    ] = await Promise.all([
      timing.measure('settings', () => query.maybeSingle()),
      timing.measure('tenant', () => supabaseAdmin
        .from('tenants')
        .select('id, name')
        .eq('id', tenantId)
        .maybeSingle()),
      timing.measure('owner', () => supabaseAdmin
        .from('profiles')
        .select('id, username, full_name, contact_email, phone, created_at')
        .eq('tenant_id', tenantId)
        .eq('role', 'admin')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()),
      auth.profile.branch_id
        ? timing.measure('branches', () => supabaseAdmin
            .from('branches')
            .select('id, name, code')
            .eq('tenant_id', tenantId)
            .eq('id', auth.profile.branch_id)
            .maybeSingle())
        : timing.measure('branches', () => supabaseAdmin
            .from('branches')
            .select('id, name, code')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()),
      auth.profile.branch_id
        ? timing.measure('vat', () => supabaseAdmin
            .from('vat_settings')
            .select('rate, is_active, branch_id')
            .eq('tenant_id', tenantId)
            .eq('branch_id', auth.profile.branch_id)
            .maybeSingle())
        : Promise.resolve({ data: null, error: null }),
      timing.measure('vat', () => supabaseAdmin
        .from('vat_settings')
        .select('rate, is_active, branch_id')
        .eq('tenant_id', tenantId)
        .is('branch_id', null)
        .maybeSingle()),
    ])

    const { data, error } = settingsResult

    if (error) {
      const response = jsonResponse(
        {
          error: 'فشل تحميل إعدادات النظام',
          ...safeErrorDetails(error, 'فشل تحميل إعدادات النظام'),
        },
        500
      )

      return timing.finish(withAuthCookies(auth.response, response))
    }

    if (
      tenantResult.error ||
      ownerResult.error ||
      branchResult.error ||
      branchVatResult.error ||
      globalVatResult.error
    ) {
      const organizationError =
        tenantResult.error ||
        ownerResult.error ||
        branchResult.error ||
        branchVatResult.error ||
        globalVatResult.error

      const response = jsonResponse(
        {
          error: 'فشل تحميل معلومات المنشأة',
          ...safeErrorDetails(organizationError, 'فشل تحميل معلومات المنشأة'),
        },
        500
      )

      return timing.finish(withAuthCookies(auth.response, response))
    }

    const ownerName =
      ownerResult.data?.full_name || ownerResult.data?.username || auth.profile.full_name || auth.profile.username

    const organizationInfo: OrganizationInfo = {
      storeName: tenantResult.data?.name || null,
      branchId: branchResult.data?.id || null,
      branchName: branchResult.data?.name || null,
      ownerName: ownerName || null,
      ownerPhone: ownerResult.data?.phone || null,
      ownerEmail:
        ownerResult.data?.contact_email ||
        (ownerResult.data?.id === auth.user.id ? auth.user.email || null : null),
      address: data?.digital_invoice_address_line_1 || null,
      logoUrl: data?.logo_url || null,
    }
    const vatRecord = branchVatResult.data || globalVatResult.data
    const vatSetting: VatSettingInfo | null = vatRecord
      ? {
          rate: Number(vatRecord.rate) || 0,
          isActive: Boolean(vatRecord.is_active),
          branchId: vatRecord.branch_id || null,
        }
      : null

    const currentAccount: CurrentAccountInfo = {
      username: auth.profile.username || null,
      fullName: auth.profile.full_name || null,
      email: auth.profile.contact_email || auth.user.email || null,
      phone: auth.profile.phone || null,
      branchName: branchResult.data?.name || null,
      role: auth.profile.role,
      isActive: auth.profile.is_active,
    }

    const response = await timing.measure('serialize', async () => jsonResponse({
      success: true,
      settings: sanitizeSystemSettings(data),
      currentAccount,
      organizationInfo: minimizeOrganizationInfoForRole(
        organizationInfo,
        auth.profile.role
      ),
      vatSetting,
    }))

    return timing.finish(withAuthCookies(auth.response, response))
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع أثناء تحميل الإعدادات',
        ...safeErrorDetails(error, 'حدث خطأ غير متوقع أثناء تحميل الإعدادات'),
      },
      500
    )

    return timing.finish(withAuthCookies(auth.response, response))
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      const response = jsonResponse(
        { error: 'تعذر تحديد نطاق المنشأة' },
        400
      )

      return withAuthCookies(auth.response, response)
    }

    const body = (await request.json()) as SystemSettingsUpdatePayload

    let existingSettingsQuery = supabaseAdmin
      .from('system_settings')
      .select('*')
      .limit(1)

    existingSettingsQuery = applyTenantFilter(existingSettingsQuery, tenantId)

    const { data: existingSettings, error: existingError } =
      await existingSettingsQuery
      .maybeSingle()

    if (existingError) {
      const response = jsonResponse(
        {
          error: 'فشل التحقق من سجل الإعدادات الحالي',
          ...safeErrorDetails(existingError, 'فشل التحقق من سجل الإعدادات الحالي'),
        },
        500
      )

      return withAuthCookies(auth.response, response)
    }

    const mergedPayload = existingSettings
      ? {
          ...existingSettings,
          ...body,
        }
      : body

    const updatePayload = {
      ...normalizeSystemSettingsUpdatePayload(mergedPayload),
      tenant_id: tenantId,
    }

    const operation = existingSettings?.id
      ? supabaseAdmin
          .from('system_settings')
          .update(updatePayload)
          .eq('id', existingSettings.id)
          .eq('tenant_id', tenantId)
      : supabaseAdmin.from('system_settings').insert([updatePayload])

    const { data, error } = await operation.select('*').single()

    if (error) {
      const response = jsonResponse(
        {
          error: 'فشل حفظ إعدادات النظام',
          ...safeErrorDetails(error, 'فشل حفظ إعدادات النظام'),
        },
        400
      )

      return withAuthCookies(auth.response, response)
    }

    const response = jsonResponse({
      success: true,
      message: 'تم حفظ إعدادات النظام بنجاح',
      settings: sanitizeSystemSettings(data),
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع أثناء حفظ الإعدادات',
        ...safeErrorDetails(error, 'حدث خطأ غير متوقع أثناء حفظ الإعدادات'),
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}

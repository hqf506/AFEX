import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import {
  normalizeSystemSettingsUpdatePayload,
  type SystemSettingsUpdatePayload,
} from '@/lib/admin/settings'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'

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

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      const response = jsonResponse({
        success: true,
        settings: null,
      })

      return withAuthCookies(auth.response, response)
    }

    let query = supabaseAdmin
      .from('system_settings')
      .select('*')
      .limit(1)

    query = applyTenantFilter(query, tenantId)

    const { data, error } = await query
      .maybeSingle()

    if (error) {
      const response = jsonResponse(
        {
          error: 'فشل تحميل إعدادات النظام',
          details: error.message,
        },
        500
      )

      return withAuthCookies(auth.response, response)
    }

    const [
      tenantResult,
      ownerResult,
      branchResult,
      branchVatResult,
      globalVatResult,
    ] = await Promise.all([
      supabaseAdmin
        .from('tenants')
        .select('id, name')
        .eq('id', tenantId)
        .maybeSingle(),
      supabaseAdmin
        .from('profiles')
        .select('id, username, full_name, contact_email, phone, created_at')
        .eq('tenant_id', tenantId)
        .eq('role', 'admin')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
      auth.profile.branch_id
        ? supabaseAdmin
            .from('branches')
            .select('id, name, code')
            .eq('tenant_id', tenantId)
            .eq('id', auth.profile.branch_id)
            .maybeSingle()
        : supabaseAdmin
            .from('branches')
            .select('id, name, code')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle(),
      auth.profile.branch_id
        ? supabaseAdmin
            .from('vat_settings')
            .select('rate, is_active, branch_id')
            .eq('tenant_id', tenantId)
            .eq('branch_id', auth.profile.branch_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabaseAdmin
        .from('vat_settings')
        .select('rate, is_active, branch_id')
        .eq('tenant_id', tenantId)
        .is('branch_id', null)
        .maybeSingle(),
    ])

    if (
      tenantResult.error ||
      ownerResult.error ||
      branchResult.error ||
      branchVatResult.error ||
      globalVatResult.error
    ) {
      const response = jsonResponse(
        {
          error: 'فشل تحميل معلومات المنشأة',
          details:
            tenantResult.error?.message ||
            ownerResult.error?.message ||
            branchResult.error?.message ||
            branchVatResult.error?.message ||
            globalVatResult.error?.message,
        },
        500
      )

      return withAuthCookies(auth.response, response)
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

    const response = jsonResponse({
      success: true,
      settings: data || null,
      organizationInfo,
      vatSetting,
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع أثناء تحميل الإعدادات',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )

    return withAuthCookies(auth.response, response)
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
        { error: 'ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ¯ Ù†Ø·Ø§Ù‚ Ø§Ù„Ù…Ù†Ø´Ø£Ø©' },
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
          details: existingError.message,
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
          details: error.message,
        },
        400
      )

      return withAuthCookies(auth.response, response)
    }

    const response = jsonResponse({
      success: true,
      message: 'تم حفظ إعدادات النظام بنجاح',
      settings: data,
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع أثناء حفظ الإعدادات',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}

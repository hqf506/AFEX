import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import {
  canManageBranchWhatsAppConfig,
  isValidBranchWhatsAppApiUrl,
  isValidBranchWhatsAppInstanceId,
  isValidBranchWhatsAppPhoneNumber,
  isValidBranchWhatsAppProvider,
  normalizeBranchWhatsAppApiUrl,
  normalizeBranchWhatsAppBranchId,
  normalizeBranchWhatsAppInstanceId,
  normalizeBranchWhatsAppIsActive,
  normalizeBranchWhatsAppPhoneNumber,
  normalizeBranchWhatsAppProvider,
  normalizeBranchWhatsAppToken,
  resolveManagedBranchWhatsAppBranchId,
  sanitizeBranchWhatsAppConfig,
  type BranchWhatsAppConfigRow,
} from '@/lib/admin/branch-whatsapp-config'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'

type BranchWhatsAppConfigBody = {
  branchId?: string
  provider?: string
  phone_number?: string
  instance_id?: string
  token?: string
  api_url?: string
  is_active?: boolean | string
}

async function getExistingConfig(branchId: string, tenantId: string) {
  let query = supabaseAdmin
    .from('branch_whatsapp_configs')
    .select(
      'id, branch_id, provider, phone_number, instance_id, token, api_url, is_active, created_at, updated_at'
    )
    .eq('branch_id', branchId)

  query = applyTenantFilter(query, tenantId)

  const { data, error } = await query
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as BranchWhatsAppConfigRow | null) || null
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        jsonResponse({
          success: true,
          config: null,
        })
      )
    }

    const requestedBranchId = normalizeBranchWhatsAppBranchId(
      request.nextUrl.searchParams.get('branchId')
    )

    const resolvedBranchId = resolveManagedBranchWhatsAppBranchId(
      auth.profile.scope_type,
      auth.profile.branch_id,
      requestedBranchId
    )

    if (!resolvedBranchId) {
      return withAuthCookies(
        auth.response,
        jsonResponse({
          success: true,
          config: null,
        })
      )
    }

    if (
      !canManageBranchWhatsAppConfig(
        auth.profile.scope_type,
        auth.profile.branch_id,
        resolvedBranchId
      )
    ) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'غير مصرح لك بالوصول إلى إعدادات هذا الفرع',
          },
          403
        )
      )
    }

    const config = await getExistingConfig(resolvedBranchId, tenantId)

    return withAuthCookies(
      auth.response,
      jsonResponse({
        success: true,
        config: config ? sanitizeBranchWhatsAppConfig(config) : null,
      })
    )
  } catch (error) {
    return withAuthCookies(
      auth.response,
      jsonResponse(
        {
          error: 'تعذر تحميل إعدادات واتساب',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      )
    )
  }
}

async function saveBranchWhatsAppConfig(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ¯ Ù†Ø·Ø§Ù‚ Ø§Ù„Ù…Ù†Ø´Ø£Ø©',
          },
          400
        )
      )
    }

    const body = (await request.json()) as BranchWhatsAppConfigBody
    const requestedBranchId = normalizeBranchWhatsAppBranchId(body.branchId)
    const resolvedBranchId = resolveManagedBranchWhatsAppBranchId(
      auth.profile.scope_type,
      auth.profile.branch_id,
      requestedBranchId
    )

    if (!resolvedBranchId) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'معرف الفرع مطلوب',
          },
          400
        )
      )
    }

    if (
      !canManageBranchWhatsAppConfig(
        auth.profile.scope_type,
        auth.profile.branch_id,
        resolvedBranchId
      )
    ) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'غير مصرح لك بتعديل إعدادات هذا الفرع',
          },
          403
        )
      )
    }

    const provider = normalizeBranchWhatsAppProvider(body.provider)
    const phoneNumber = normalizeBranchWhatsAppPhoneNumber(body.phone_number)
    const instanceId = normalizeBranchWhatsAppInstanceId(body.instance_id)
    const nextToken = normalizeBranchWhatsAppToken(body.token)
    const apiUrl = normalizeBranchWhatsAppApiUrl(body.api_url)
    const isActive = normalizeBranchWhatsAppIsActive(body.is_active)

    if (!provider || !isValidBranchWhatsAppProvider(provider)) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'مزود واتساب غير صالح',
          },
          400
        )
      )
    }

    if (!isValidBranchWhatsAppPhoneNumber(phoneNumber)) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'رقم الهاتف غير صالح',
          },
          400
        )
      )
    }

    if (!isValidBranchWhatsAppInstanceId(instanceId)) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'معرف الـ instance غير صالح',
          },
          400
        )
      )
    }

    if (!isValidBranchWhatsAppApiUrl(apiUrl)) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'رابط API غير صالح',
          },
          400
        )
      )
    }

    if (typeof isActive !== 'boolean') {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'حالة التفعيل غير صالحة',
          },
          400
        )
      )
    }

    let branchQuery = supabaseAdmin
      .from('branches')
      .select('id')
      .eq('id', resolvedBranchId)

    branchQuery = applyTenantFilter(branchQuery, tenantId)

    const { data: branch, error: branchError } = await branchQuery
      .maybeSingle()

    if (branchError) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'تعذر التحقق من الفرع',
            details: branchError.message,
          },
          500
        )
      )
    }

    if (!branch) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'الفرع غير موجود',
          },
          404
        )
      )
    }

    const existingConfig = await getExistingConfig(resolvedBranchId, tenantId)
    const finalToken = nextToken || existingConfig?.token || ''

    if (!finalToken) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'التوكن مطلوب',
          },
          400
        )
      )
    }

    const timestamp = new Date().toISOString()

    const mutation = existingConfig
      ? supabaseAdmin
          .from('branch_whatsapp_configs')
          .update({
            provider,
            phone_number: phoneNumber,
            instance_id: instanceId,
            token: finalToken,
            api_url: apiUrl,
            is_active: isActive,
            updated_at: timestamp,
          })
          .eq('id', existingConfig.id)
          .eq('tenant_id', tenantId)
      : supabaseAdmin.from('branch_whatsapp_configs').insert({
          branch_id: resolvedBranchId,
          tenant_id: tenantId,
          provider,
          phone_number: phoneNumber,
          instance_id: instanceId,
          token: finalToken,
          api_url: apiUrl,
          is_active: isActive,
          created_at: timestamp,
          updated_at: timestamp,
        })

    const { error: saveError } = await mutation

    if (saveError) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'فشل حفظ إعدادات واتساب',
            details: saveError.message,
          },
          500
        )
      )
    }

    const savedConfig = await getExistingConfig(resolvedBranchId, tenantId)

    return withAuthCookies(
      auth.response,
      jsonResponse({
        success: true,
        message: existingConfig
          ? 'تم تحديث إعدادات واتساب بنجاح'
          : 'تم حفظ إعدادات واتساب بنجاح',
        config: savedConfig ? sanitizeBranchWhatsAppConfig(savedConfig) : null,
      })
    )
  } catch (error) {
    return withAuthCookies(
      auth.response,
      jsonResponse(
        {
          error: 'حدث خطأ غير متوقع',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      )
    )
  }
}

export async function POST(request: NextRequest) {
  return saveBranchWhatsAppConfig(request)
}

export async function PUT(request: NextRequest) {
  return saveBranchWhatsAppConfig(request)
}

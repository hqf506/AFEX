import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import type { ApiAuthProfile } from '@/lib/api-auth'
import { maskId } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'

type AccountPatchBody = {
  full_name?: unknown
  phone?: unknown
  contact_email?: unknown
  tenant_name?: unknown
  branch_name?: unknown
}

type AccountAuth = {
  ok: true
  response: NextResponse
  user: User
  profile: Pick<ApiAuthProfile, 'id' | 'tenant_id' | 'branch_id'>
  supabase: typeof supabaseAdmin
}

type AccountAuthFailure = {
  ok: false
  response: NextResponse
}

function normalizeOptionalText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableText(value: unknown) {
  const normalizedValue = normalizeOptionalText(value)
  return normalizedValue || null
}

function normalizeNullableEmail(value: unknown) {
  const normalizedValue = normalizeOptionalText(value).toLowerCase()
  return normalizedValue || null
}

function getBearerToken(request: NextRequest) {
  const header = request.headers.get('authorization') || ''
  const [scheme, token] = header.split(' ')

  if (scheme?.toLowerCase() !== 'bearer' || !token?.trim()) {
    return ''
  }

  return token.trim()
}

async function requireAccountAuth(
  request: NextRequest
): Promise<AccountAuth | AccountAuthFailure> {
  const auth = await requireApiAuth(request)

  if (auth.ok) {
    return {
      ok: true,
      response: auth.response,
      user: auth.user,
      profile: auth.profile,
      supabase: auth.supabase,
    }
  }

  const bearerToken = getBearerToken(request)

  if (!bearerToken) {
    console.info('[api/account] auth diagnostics', {
      hasSession: false,
      hasUserId: false,
      hasProfile: false,
      hasTenantId: false,
    })
    return auth
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(bearerToken)

  if (userError || !user) {
    console.info('[api/account] auth diagnostics', {
      hasSession: true,
      hasUserId: false,
      hasProfile: false,
      hasTenantId: false,
    })
    return auth
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, tenant_id, branch_id, is_active')
    .eq('id', user.id)
    .maybeSingle()

  console.info('[api/account] auth diagnostics', {
    hasSession: true,
    userIdMasked: maskId(user.id),
    hasUserId: Boolean(user.id),
    hasProfile: Boolean(profile?.id),
    hasTenantId: Boolean(profile?.tenant_id),
  })

  if (profileError || !profile) {
    return {
      ok: false,
      response: jsonResponse(
        {
          error: 'تعذر التحقق من ملف المستخدم',
        },
        404
      ),
    }
  }

  if (!profile.is_active) {
    return {
      ok: false,
      response: jsonResponse(
        {
          error: 'الحساب معطل',
        },
        403
      ),
    }
  }

  return {
    ok: true,
    response: NextResponse.next(),
    user,
    profile: {
      id: profile.id,
      tenant_id: typeof profile.tenant_id === 'string' ? profile.tenant_id : null,
      branch_id: typeof profile.branch_id === 'string' ? profile.branch_id : null,
    },
    supabase: supabaseAdmin,
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAccountAuth(request)

  if (!auth.ok) {
    return auth.response
  }

  try {
    const { data: profile, error } = await auth.supabase
      .from('profiles')
      .select('id, username, full_name, phone, contact_email, tenant_id, branch_id')
      .eq('id', auth.user.id)
      .maybeSingle()

    if (error || !profile) {
      const response = jsonResponse(
        {
          error: 'تعذر تحميل بيانات الحساب',
          details: error?.message || 'لم يتم العثور على ملف المستخدم',
        },
        404
      )

      return withAuthCookies(auth.response, response)
    }

    let tenantName = ''
    let branchName = ''

    if (profile.tenant_id) {
      const { data: tenant } = await auth.supabase
        .from('tenants')
        .select('name')
        .eq('id', profile.tenant_id)
        .maybeSingle()

      tenantName =
        tenant && typeof tenant.name === 'string' ? tenant.name : ''
    }

    if (profile.branch_id && profile.tenant_id) {
      const { data: branch } = await auth.supabase
        .from('branches')
        .select('name')
        .eq('id', profile.branch_id)
        .eq('tenant_id', profile.tenant_id)
        .maybeSingle()

      branchName =
        branch && typeof branch.name === 'string' ? branch.name : ''
    }

    const response = jsonResponse({
      success: true,
      account: {
        id: profile.id,
        username: profile.username,
        full_name: profile.full_name,
        phone: profile.phone,
        contact_email: profile.contact_email,
        tenant_name: tenantName,
        branch_name: branchName,
      },
      debug: {
        hasTenantId: Boolean(auth.profile.tenant_id),
      },
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAccountAuth(request)

  if (!auth.ok) {
    return auth.response
  }

  try {
    const body = (await request.json()) as AccountPatchBody
    const fullName = normalizeOptionalText(body.full_name)
    const phone = normalizeNullableText(body.phone)
    const contactEmail = normalizeNullableEmail(body.contact_email)
    const tenantName = normalizeOptionalText(body.tenant_name)
    const branchName = normalizeOptionalText(body.branch_name)
    const firstName = fullName.split(/\s+/).filter(Boolean)[0] || ''

    if (!tenantName || !contactEmail || !phone || !firstName) {
      const response = jsonResponse(
        {
          error: 'يرجى تعبئة جميع الحقول المطلوبة',
        },
        400
      )

      return withAuthCookies(auth.response, response)
    }
    const updateData: {
      full_name?: string
      phone: string | null
      contact_email: string | null
      updated_at: string
    } = {
      phone,
      contact_email: contactEmail,
      updated_at: new Date().toISOString(),
    }

    if (fullName) {
      updateData.full_name = fullName
    }

    if (contactEmail) {
      let duplicateEmailQuery = auth.supabase
        .from('profiles')
        .select('id')
        .eq('contact_email', contactEmail)
        .neq('id', auth.user.id)
        .limit(1)

      if (auth.profile.tenant_id) {
        duplicateEmailQuery = duplicateEmailQuery.eq(
          'tenant_id',
          auth.profile.tenant_id
        )
      }

      const { data: duplicateProfile, error: duplicateEmailError } =
        await duplicateEmailQuery.maybeSingle()

      if (duplicateEmailError) {
        const response = jsonResponse(
          {
            error: 'تعذر التحقق من بريد التواصل',
            details: duplicateEmailError.message,
          },
          500
        )

        return withAuthCookies(auth.response, response)
      }

      if (duplicateProfile) {
        const response = jsonResponse(
          { error: 'البريد الإلكتروني مسجل بالفعل' },
          409
        )

        return withAuthCookies(auth.response, response)
      }
    }

    const { data: profile, error } = await auth.supabase
      .from('profiles')
      .update(updateData)
      .eq('id', auth.user.id)
      .select('id, username, full_name, phone, contact_email, tenant_id, branch_id')
      .maybeSingle()

    if (error || !profile) {
      const response = jsonResponse(
        {
          error: 'تعذر تحديث بيانات الحساب',
          details: error?.message || 'لم يتم العثور على ملف المستخدم',
        },
        400
      )

      return withAuthCookies(auth.response, response)
    }

    const tenantId =
      typeof profile.tenant_id === 'string' ? profile.tenant_id : null
    const branchId =
      typeof profile.branch_id === 'string' ? profile.branch_id : null

    if (tenantName && tenantId) {
      const { error: tenantError } = await auth.supabase
        .from('tenants')
        .update({ name: tenantName })
        .eq('id', tenantId)

      if (tenantError) {
        const response = jsonResponse(
          {
            error: 'تعذر تحديث اسم المؤسسة',
            details: tenantError.message,
          },
          400
        )

        return withAuthCookies(auth.response, response)
      }
    }

    if (branchName && tenantId && branchId) {
      const { error: branchError } = await auth.supabase
        .from('branches')
        .update({ name: branchName })
        .eq('id', branchId)
        .eq('tenant_id', tenantId)

      if (branchError) {
        const response = jsonResponse(
          {
            error: 'تعذر تحديث اسم الفرع',
            details: branchError.message,
          },
          400
        )

        return withAuthCookies(auth.response, response)
      }
    }

    const { data: tenant } = tenantId
      ? await auth.supabase
          .from('tenants')
          .select('name')
          .eq('id', tenantId)
          .maybeSingle()
      : { data: null }
    const { data: branch } =
      tenantId && branchId
        ? await auth.supabase
            .from('branches')
            .select('name')
            .eq('id', branchId)
            .eq('tenant_id', tenantId)
            .maybeSingle()
        : { data: null }

    const response = jsonResponse({
      success: true,
      account: {
        id: profile.id,
        username: profile.username,
        full_name: profile.full_name,
        phone: profile.phone,
        contact_email: profile.contact_email,
        tenant_name:
          tenant && typeof tenant.name === 'string' ? tenant.name : tenantName,
        branch_name:
          branch && typeof branch.name === 'string' ? branch.name : branchName,
      },
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}

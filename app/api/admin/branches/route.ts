import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { writeAuditLog } from '@/lib/audit-log'
import { safeErrorDetails } from '@/lib/security/redaction'
import {
  isSystemScopedAdmin,
  isValidAdminBranchCode,
  normalizeAdminBranchCode,
  normalizeAdminBranchDisplayName,
  normalizeAdminBranchId,
  normalizeAdminBranchMapUrl,
  normalizeAdminBranchName,
} from '@/lib/admin/branches'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'

type CreateBranchBody = {
  code?: string
  name?: string
  display_store_name?: string
  display_branch_name?: string
  map_url?: string
}

type UpdateBranchBody = {
  branchId?: string
  code?: string
  name?: string
  display_store_name?: string
  display_branch_name?: string
  map_url?: string
}

const BRANCH_SELECT_FIELDS =
  'id, code, name, display_store_name, display_branch_name, map_url, is_active, created_at, updated_at'

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
        branches: [],
      })

      return withAuthCookies(auth.response, response)
    }

    let query = supabaseAdmin
      .from('branches')
      .select(BRANCH_SELECT_FIELDS)
      .order('created_at', { ascending: true })

    query = applyTenantFilter(query, tenantId)

    if (
      !isSystemScopedAdmin(auth.profile.scope_type) &&
      auth.profile.branch_id
    ) {
      query = query.eq('id', auth.profile.branch_id)
    }

    if (
      !isSystemScopedAdmin(auth.profile.scope_type) &&
      !auth.profile.branch_id
    ) {
      const response = jsonResponse({
        success: true,
        branches: [],
      })

      return withAuthCookies(auth.response, response)
    }

    const { data, error } = await query

    if (error) {
      const response = jsonResponse(
        {
          error: 'تعذر تحميل الفروع',
          ...safeErrorDetails(error),
        },
        500
      )

      return withAuthCookies(auth.response, response)
    }

    const response = jsonResponse({
      success: true,
      branches: data || [],
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        ...safeErrorDetails(error),
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

  if (!isSystemScopedAdmin(auth.profile.scope_type)) {
    const response = jsonResponse(
      {
        error: 'هذه العملية متاحة لمدير النظام فقط',
      },
      403
    )

    return withAuthCookies(auth.response, response)
  }

  try {
    const body = (await request.json()) as CreateBranchBody
    const code = normalizeAdminBranchCode(body.code)
    const name = normalizeAdminBranchName(body.name)
    const displayStoreName = normalizeAdminBranchDisplayName(
      body.display_store_name
    )
    const displayBranchName = normalizeAdminBranchDisplayName(
      body.display_branch_name
    )
    const mapUrl = normalizeAdminBranchMapUrl(body.map_url)

    if (!name) {
      const response = jsonResponse(
        { error: 'اسم الفرع مطلوب' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (!code) {
      const response = jsonResponse(
        { error: 'كود الفرع مطلوب' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (!isValidAdminBranchCode(code)) {
      const response = jsonResponse(
        {
          error: 'كود الفرع غير صالح',
          details: 'استخدم أحرف إنجليزية صغيرة أو أرقام أو - فقط، بين 2 و32 حرفًا',
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      const response = jsonResponse(
        { error: 'ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ¯ Ù†Ø·Ø§Ù‚ Ø§Ù„Ù…Ù†Ø´Ø£Ø©' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    let existingBranchQuery = supabaseAdmin
      .from('branches')
      .select('id')
      .eq('code', code)

    existingBranchQuery = applyTenantFilter(existingBranchQuery, tenantId)

    const { data: existingBranch, error: existingBranchError } =
      await existingBranchQuery.maybeSingle()

    if (existingBranchError) {
      const response = jsonResponse(
        {
          error: 'تعذر التحقق من كود الفرع',
          ...safeErrorDetails(existingBranchError),
        },
        500
      )

      return withAuthCookies(auth.response, response)
    }

    if (existingBranch) {
      const response = jsonResponse(
        { error: 'كود الفرع مستخدم بالفعل' },
        409
      )
      return withAuthCookies(auth.response, response)
    }

    const timestamp = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('branches')
      .insert({
        code,
        name,
        display_store_name: displayStoreName || null,
        display_branch_name: displayBranchName || null,
        map_url: mapUrl || null,
        tenant_id: tenantId,
        is_active: true,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .select(BRANCH_SELECT_FIELDS)
      .single()

    if (error || !data) {
      const response = jsonResponse(
        {
          error: 'فشل إنشاء الفرع',
          ...safeErrorDetails(error),
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    await writeAuditLog({
      auth,
      request,
      action: 'branch.created',
      entityType: 'branch',
      entityId: data.id,
      branchId: data.id,
      metadata: {
        code,
        name,
        has_map_url: Boolean(mapUrl),
      },
    })

    const response = jsonResponse({
      success: true,
      message: 'تم إنشاء الفرع بنجاح',
      branch: data,
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        ...safeErrorDetails(error),
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  if (!isSystemScopedAdmin(auth.profile.scope_type)) {
    const response = jsonResponse(
      {
        error: 'هذه العملية متاحة لمدير النظام فقط',
      },
      403
    )

    return withAuthCookies(auth.response, response)
  }

  try {
    const body = (await request.json()) as UpdateBranchBody
    const branchId = normalizeAdminBranchId(body.branchId)
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      const response = jsonResponse(
        { error: 'تعذر تحديد نطاق المنشأة' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (!branchId) {
      const response = jsonResponse({ error: 'معرف الفرع مطلوب' }, 400)
      return withAuthCookies(auth.response, response)
    }

    const updatePayload: {
      code?: string
      name?: string
      display_store_name?: string | null
      display_branch_name?: string | null
      map_url?: string | null
      updated_at: string
    } = {
      updated_at: new Date().toISOString(),
    }

    if (Object.prototype.hasOwnProperty.call(body, 'name')) {
      const name = normalizeAdminBranchName(body.name)

      if (!name) {
        const response = jsonResponse(
          { error: 'اسم الفرع مطلوب' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      updatePayload.name = name
    }

    if (Object.prototype.hasOwnProperty.call(body, 'code')) {
      const code = normalizeAdminBranchCode(body.code)

      if (!code) {
        const response = jsonResponse(
          { error: 'كود الفرع مطلوب' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      if (!isValidAdminBranchCode(code)) {
        const response = jsonResponse(
          {
            error: 'كود الفرع غير صالح',
            details: 'استخدم أحرف إنجليزية صغيرة أو أرقام أو - فقط، بين 2 و32 حرفًا',
          },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      let duplicateBranchQuery = supabaseAdmin
        .from('branches')
        .select('id')
        .eq('code', code)
        .neq('id', branchId)

      duplicateBranchQuery = applyTenantFilter(duplicateBranchQuery, tenantId)

      const { data: duplicateBranch, error: duplicateBranchError } =
        await duplicateBranchQuery.maybeSingle()

      if (duplicateBranchError) {
        const response = jsonResponse(
          {
            error: 'تعذر التحقق من كود الفرع',
            ...safeErrorDetails(duplicateBranchError),
          },
          500
        )
        return withAuthCookies(auth.response, response)
      }

      if (duplicateBranch) {
        const response = jsonResponse(
          { error: 'كود الفرع مستخدم بالفعل' },
          409
        )
        return withAuthCookies(auth.response, response)
      }

      updatePayload.code = code
    }

    if (Object.prototype.hasOwnProperty.call(body, 'display_store_name')) {
      const displayStoreName = normalizeAdminBranchDisplayName(
        body.display_store_name
      )
      updatePayload.display_store_name = displayStoreName || null
    }

    if (Object.prototype.hasOwnProperty.call(body, 'display_branch_name')) {
      const displayBranchName = normalizeAdminBranchDisplayName(
        body.display_branch_name
      )
      updatePayload.display_branch_name = displayBranchName || null
    }

    if (Object.prototype.hasOwnProperty.call(body, 'map_url')) {
      const mapUrl = normalizeAdminBranchMapUrl(body.map_url)
      updatePayload.map_url = mapUrl || null
    }

    let query = supabaseAdmin
      .from('branches')
      .update(updatePayload)
      .eq('id', branchId)

    query = applyTenantFilter(query, tenantId)

    const { data, error } = await query
      .select(BRANCH_SELECT_FIELDS)
      .single()

    if (error || !data) {
      const response = jsonResponse(
        {
          error: 'فشل تحديث رابط موقع الفرع',
          ...safeErrorDetails(error),
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    await writeAuditLog({
      auth,
      request,
      action: 'branch.updated',
      entityType: 'branch',
      entityId: data.id,
      branchId: data.id,
      metadata: {
        updated_fields: Object.keys(updatePayload).filter(
          (field) => field !== 'updated_at'
        ),
        has_map_url: Boolean(data.map_url),
        has_display_store_name: Boolean(data.display_store_name),
        has_display_branch_name: Boolean(data.display_branch_name),
      },
    })

    const response = jsonResponse({
      success: true,
      message: 'تم حفظ رابط موقع الفرع بنجاح',
      branch: data,
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        ...safeErrorDetails(error),
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}

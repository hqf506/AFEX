import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { writeAuditLog } from '@/lib/audit-log'
import { maskId, safeErrorDetails } from '@/lib/security/redaction'
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
  action?: 'restore'
  code?: string
  name?: string
  display_store_name?: string
  display_branch_name?: string
  map_url?: string
}

type DeleteBranchBody = {
  branchId?: string
}

const BRANCH_SELECT_FIELDS =
  'id, code, order_number_prefix, name, display_store_name, display_branch_name, map_url, is_active, deleted_at, deleted_by, created_at, updated_at'

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
          error: 'ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„ÙØ±ÙˆØ¹',
          ...safeErrorDetails(error, 'ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„ÙØ±ÙˆØ¹'),
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
        error: 'Ø­Ø¯Ø« Ø®Ø·Ø£ ØºÙŠØ± Ù…ØªÙˆÙ‚Ø¹',
        ...safeErrorDetails(error, 'Ø­Ø¯Ø« Ø®Ø·Ø£ ØºÙŠØ± Ù…ØªÙˆÙ‚Ø¹'),
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
        error: 'Ù‡Ø°Ù‡ Ø§Ù„Ø¹Ù…Ù„ÙŠØ© Ù…ØªØ§Ø­Ø© Ù„Ù…Ø¯ÙŠØ± Ø§Ù„Ù†Ø¸Ø§Ù… ÙÙ‚Ø·',
      },
      403
    )

    return withAuthCookies(auth.response, response)
  }

  try {
    const body = (await request.json()) as CreateBranchBody
    const requestedCode = normalizeAdminBranchCode(body.code)
    const code = requestedCode || `branch-${randomUUID().slice(0, 8)}`
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
        { error: 'Ø§Ø³Ù… Ø§Ù„ÙØ±Ø¹ Ù…Ø·Ù„ÙˆØ¨' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (!isValidAdminBranchCode(code)) {
      const response = jsonResponse(
        {
          error: 'ÙƒÙˆØ¯ Ø§Ù„ÙØ±Ø¹ ØºÙŠØ± ØµØ§Ù„Ø­',
          details: 'Ø§Ø³ØªØ®Ø¯Ù… Ø£Ø­Ø±Ù Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠØ© ØµØºÙŠØ±Ø© Ø£Ùˆ Ø£Ø±Ù‚Ø§Ù… Ø£Ùˆ - ÙÙ‚Ø·ØŒ Ø¨ÙŠÙ† 2 Ùˆ32 Ø­Ø±ÙÙ‹Ø§',
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      const response = jsonResponse(
        { error: 'Ã˜ÂªÃ˜Â¹Ã˜Â°Ã˜Â± Ã˜ÂªÃ˜Â­Ã˜Â¯Ã™Å Ã˜Â¯ Ã™â€ Ã˜Â·Ã˜Â§Ã™â€š Ã˜Â§Ã™â€žÃ™â€¦Ã™â€ Ã˜Â´Ã˜Â£Ã˜Â©' },
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
          error: 'ØªØ¹Ø°Ø± Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† ÙƒÙˆØ¯ Ø§Ù„ÙØ±Ø¹',
          ...safeErrorDetails(existingBranchError, 'ØªØ¹Ø°Ø± Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† ÙƒÙˆØ¯ Ø§Ù„ÙØ±Ø¹'),
        },
        500
      )

      return withAuthCookies(auth.response, response)
    }

    if (existingBranch) {
      const response = jsonResponse(
        { error: 'ÙƒÙˆØ¯ Ø§Ù„ÙØ±Ø¹ Ù…Ø³ØªØ®Ø¯Ù… Ø¨Ø§Ù„ÙØ¹Ù„' },
        409
      )
      return withAuthCookies(auth.response, response)
    }

    const timestamp = new Date().toISOString()

    const insertBranchResult = await supabaseAdmin
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
    let data = insertBranchResult.data
    const error = insertBranchResult.error

    if (error || !data) {
      const response = jsonResponse(
        {
          error: 'ÙØ´Ù„ Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„ÙØ±Ø¹',
          ...safeErrorDetails(error, 'ÙØ´Ù„ Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„ÙØ±Ø¹'),
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (!data.order_number_prefix) {
      const { error: prefixError } = await supabaseAdmin.rpc(
        'ensure_branch_order_number_prefix',
        {
          p_branch_id: data.id,
        }
      )

      if (prefixError) {
        const response = jsonResponse(
          {
            error: 'فشل توليد رقم الفرع',
            ...safeErrorDetails(prefixError, 'فشل توليد رقم الفرع'),
          },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      const { data: refreshedBranch, error: refreshBranchError } =
        await supabaseAdmin
          .from('branches')
          .select(BRANCH_SELECT_FIELDS)
          .eq('id', data.id)
          .eq('tenant_id', tenantId)
          .single()

      if (refreshBranchError || !refreshedBranch) {
        const response = jsonResponse(
          {
            error: 'فشل تحميل رقم الفرع',
            ...safeErrorDetails(refreshBranchError, 'فشل تحميل رقم الفرع'),
          },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      data = refreshedBranch
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
      message: 'ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„ÙØ±Ø¹ Ø¨Ù†Ø¬Ø§Ø­',
      branch: data,
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'Ø­Ø¯Ø« Ø®Ø·Ø£ ØºÙŠØ± Ù…ØªÙˆÙ‚Ø¹',
        ...safeErrorDetails(error, 'Ø­Ø¯Ø« Ø®Ø·Ø£ ØºÙŠØ± Ù…ØªÙˆÙ‚Ø¹'),
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
        error: 'Ù‡Ø°Ù‡ Ø§Ù„Ø¹Ù…Ù„ÙŠØ© Ù…ØªØ§Ø­Ø© Ù„Ù…Ø¯ÙŠØ± Ø§Ù„Ù†Ø¸Ø§Ù… ÙÙ‚Ø·',
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
        { error: 'ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ¯ Ù†Ø·Ø§Ù‚ Ø§Ù„Ù…Ù†Ø´Ø£Ø©' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (!branchId) {
      const response = jsonResponse({ error: 'Ù…Ø¹Ø±Ù Ø§Ù„ÙØ±Ø¹ Ù…Ø·Ù„ÙˆØ¨' }, 400)
      return withAuthCookies(auth.response, response)
    }

    if (body.action === 'restore') {
      let existingDeletedBranchQuery = supabaseAdmin
        .from('branches')
        .select('id', { count: 'exact' })
        .eq('id', branchId)
        .filter('deleted_at', 'not.is', 'null')

      existingDeletedBranchQuery = applyTenantFilter(
        existingDeletedBranchQuery,
        tenantId
      )

      const {
        data: existingDeletedBranches,
        count: existingDeletedBranchCount,
        error: existingDeletedBranchError,
      } = await existingDeletedBranchQuery.limit(1)

      console.info('Restore branch lookup:', {
        branchId: maskId(branchId),
        tenantId: maskId(tenantId),
        resultCount:
          existingDeletedBranchCount ?? existingDeletedBranches?.length ?? 0,
      })

      if (existingDeletedBranchError) {
        const response = jsonResponse(
          {
            error: 'فشل التحقق من الفرع',
            ...safeErrorDetails(existingDeletedBranchError, 'فشل التحقق من الفرع'),
          },
          500
        )
        return withAuthCookies(auth.response, response)
      }

      if (!existingDeletedBranches?.length) {
        const response = jsonResponse(
          { error: 'الفرع غير موجود أو تم حذفه نهائيًا' },
          404
        )
        return withAuthCookies(auth.response, response)
      }

      let restoreQuery = supabaseAdmin
        .from('branches')
        .update({
          deleted_at: null,
          deleted_by: null,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', branchId)
        .filter('deleted_at', 'not.is', 'null')

      restoreQuery = applyTenantFilter(restoreQuery, tenantId)

      const { data, error } = await restoreQuery
        .select(BRANCH_SELECT_FIELDS)
        .maybeSingle()

      if (error || !data) {
        const response = jsonResponse(
          {
            error: 'الفرع غير موجود أو تم حذفه نهائيًا',
            ...safeErrorDetails(error, 'فشل استرجاع الفرع'),
          },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      await writeAuditLog({
        auth,
        request,
        action: 'branch.restored',
        entityType: 'branch',
        entityId: data.id,
        branchId: data.id,
        metadata: {
          restored_from_soft_delete: true,
        },
      })

      const response = jsonResponse({
        success: true,
        message: 'ØªÙ… Ø§Ø³ØªØ±Ø¬Ø§Ø¹ Ø§Ù„ÙØ±Ø¹ Ø¨Ù†Ø¬Ø§Ø­',
        branch: data,
      })

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
          { error: 'Ø§Ø³Ù… Ø§Ù„ÙØ±Ø¹ Ù…Ø·Ù„ÙˆØ¨' },
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
          { error: 'ÙƒÙˆØ¯ Ø§Ù„ÙØ±Ø¹ Ù…Ø·Ù„ÙˆØ¨' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      if (!isValidAdminBranchCode(code)) {
        const response = jsonResponse(
          {
            error: 'ÙƒÙˆØ¯ Ø§Ù„ÙØ±Ø¹ ØºÙŠØ± ØµØ§Ù„Ø­',
            details: 'Ø§Ø³ØªØ®Ø¯Ù… Ø£Ø­Ø±Ù Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠØ© ØµØºÙŠØ±Ø© Ø£Ùˆ Ø£Ø±Ù‚Ø§Ù… Ø£Ùˆ - ÙÙ‚Ø·ØŒ Ø¨ÙŠÙ† 2 Ùˆ32 Ø­Ø±ÙÙ‹Ø§',
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
            error: 'ØªØ¹Ø°Ø± Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† ÙƒÙˆØ¯ Ø§Ù„ÙØ±Ø¹',
            ...safeErrorDetails(duplicateBranchError, 'ØªØ¹Ø°Ø± Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† ÙƒÙˆØ¯ Ø§Ù„ÙØ±Ø¹'),
          },
          500
        )
        return withAuthCookies(auth.response, response)
      }

      if (duplicateBranch) {
        const response = jsonResponse(
          { error: 'ÙƒÙˆØ¯ Ø§Ù„ÙØ±Ø¹ Ù…Ø³ØªØ®Ø¯Ù… Ø¨Ø§Ù„ÙØ¹Ù„' },
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
          error: 'ÙØ´Ù„ ØªØ­Ø¯ÙŠØ« Ø±Ø§Ø¨Ø· Ù…ÙˆÙ‚Ø¹ Ø§Ù„ÙØ±Ø¹',
          ...safeErrorDetails(error, 'ÙØ´Ù„ ØªØ­Ø¯ÙŠØ« Ø§Ù„ÙØ±Ø¹'),
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
      message: 'ØªÙ… Ø­ÙØ¸ Ø±Ø§Ø¨Ø· Ù…ÙˆÙ‚Ø¹ Ø§Ù„ÙØ±Ø¹ Ø¨Ù†Ø¬Ø§Ø­',
      branch: data,
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'Ø­Ø¯Ø« Ø®Ø·Ø£ ØºÙŠØ± Ù…ØªÙˆÙ‚Ø¹',
        ...safeErrorDetails(error, 'Ø­Ø¯Ø« Ø®Ø·Ø£ ØºÙŠØ± Ù…ØªÙˆÙ‚Ø¹'),
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  if (!isSystemScopedAdmin(auth.profile.scope_type)) {
    const response = jsonResponse(
      {
        error: 'Ù‡Ø°Ù‡ Ø§Ù„Ø¹Ù…Ù„ÙŠØ© Ù…ØªØ§Ø­Ø© Ù„Ù…Ø¯ÙŠØ± Ø§Ù„Ù†Ø¸Ø§Ù… ÙÙ‚Ø·',
      },
      403
    )

    return withAuthCookies(auth.response, response)
  }

  try {
    const body = (await request.json()) as DeleteBranchBody
    const branchId = normalizeAdminBranchId(body.branchId)
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      const response = jsonResponse(
        { error: 'ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ¯ Ù†Ø·Ø§Ù‚ Ø§Ù„Ù…Ù†Ø´Ø£Ø©' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (!branchId) {
      const response = jsonResponse({ error: 'Ù…Ø¹Ø±Ù Ø§Ù„ÙØ±Ø¹ Ù…Ø·Ù„ÙˆØ¨' }, 400)
      return withAuthCookies(auth.response, response)
    }

    let query = supabaseAdmin
      .from('branches')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: auth.user.id,
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', branchId)

    query = applyTenantFilter(query, tenantId)

    const { data, error } = await query
      .select(BRANCH_SELECT_FIELDS)
      .single()

    if (error || !data) {
      const response = jsonResponse(
        {
          error: 'ÙØ´Ù„ Ø­Ø°Ù Ø§Ù„ÙØ±Ø¹ Ù…Ø¤Ù‚ØªÙ‹Ø§',
          ...safeErrorDetails(error, 'ÙØ´Ù„ Ø­Ø°Ù Ø§Ù„ÙØ±Ø¹ Ù…Ø¤Ù‚ØªÙ‹Ø§'),
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    await writeAuditLog({
      auth,
      request,
      action: 'branch.soft_deleted',
      entityType: 'branch',
      entityId: data.id,
      branchId: data.id,
      metadata: {
        retention_days: 30,
      },
    })

    const response = jsonResponse({
      success: true,
      message: 'ØªÙ… Ø­Ø°Ù Ø§Ù„ÙØ±Ø¹ Ù…Ø¤Ù‚ØªÙ‹Ø§ Ù„Ù…Ø¯Ø© 30 ÙŠÙˆÙ…',
      branch: data,
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'Ø­Ø¯Ø« Ø®Ø·Ø£ ØºÙŠØ± Ù…ØªÙˆÙ‚Ø¹',
        ...safeErrorDetails(error, 'Ø­Ø¯Ø« Ø®Ø·Ø£ ØºÙŠØ± Ù…ØªÙˆÙ‚Ø¹'),
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}

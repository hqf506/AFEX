import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { writeAuditLog } from '@/lib/audit-log'
import { canManageBranchScopedTarget } from '@/lib/admin/branches'
import {
  isValidAdminRole,
  normalizeAdminFullName,
  normalizeAdminUserId,
} from '@/lib/admin/users'
import { type AppRole } from '@/lib/app-roles'
import { safeErrorDetails } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'

type UpdatePosUserBody = {
  userId?: string
  full_name?: string | null
  username?: string | null
  role?: AppRole
  branch_id?: string | null
}

function normalizeUsername(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeBranchId(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
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

    const body = (await request.json()) as UpdatePosUserBody
    const userId = normalizeAdminUserId(body.userId)
    const fullName = normalizeAdminFullName(body.full_name)
    const username = normalizeUsername(body.username)
    const role = body.role
    const branchId = normalizeBranchId(body.branch_id)

    if (!userId) {
      const response = jsonResponse({ error: 'معرف المستخدم مطلوب' }, 400)
      return withAuthCookies(auth.response, response)
    }

    if (!fullName) {
      const response = jsonResponse({ error: 'الاسم مطلوب' }, 400)
      return withAuthCookies(auth.response, response)
    }

    if (!username) {
      const response = jsonResponse({ error: 'اسم المستخدم مطلوب' }, 400)
      return withAuthCookies(auth.response, response)
    }

    if (!role || !isValidAdminRole(role)) {
      const response = jsonResponse({ error: 'الوظيفة غير صالحة' }, 400)
      return withAuthCookies(auth.response, response)
    }

    if (!branchId) {
      const response = jsonResponse({ error: 'يجب اختيار الفرع' }, 400)
      return withAuthCookies(auth.response, response)
    }

    const { data: existingPosProfile, error: existingPosProfileError } =
      await supabaseAdmin
        .from('pos_profiles')
        .select('id, username, full_name, role, branch_id')
        .eq('id', userId)
        .eq('tenant_id', tenantId)
        .maybeSingle()

    if (existingPosProfileError) {
      const response = jsonResponse(
        {
          error: 'تعذر التحقق من مستخدم POS',
          ...safeErrorDetails(
            existingPosProfileError,
            'تعذر التحقق من مستخدم POS'
          ),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    if (!existingPosProfile) {
      const response = jsonResponse({ error: 'مستخدم POS غير موجود' }, 404)
      return withAuthCookies(auth.response, response)
    }

    const currentBranchId =
      typeof existingPosProfile.branch_id === 'string'
        ? existingPosProfile.branch_id
        : null

    if (
      !canManageBranchScopedTarget(
        auth.profile.scope_type,
        auth.profile.branch_id,
        currentBranchId
      )
    ) {
      const response = jsonResponse(
        { error: 'لا تملك صلاحية تعديل هذا المستخدم' },
        403
      )
      return withAuthCookies(auth.response, response)
    }

    const { data: branch, error: branchError } = await supabaseAdmin
      .from('branches')
      .select('id')
      .eq('id', branchId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (branchError) {
      const response = jsonResponse(
        {
          error: 'تعذر التحقق من الفرع',
          ...safeErrorDetails(branchError, 'تعذر التحقق من الفرع'),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    if (!branch) {
      const response = jsonResponse({ error: 'الفرع المحدد غير موجود' }, 404)
      return withAuthCookies(auth.response, response)
    }

    if (
      !canManageBranchScopedTarget(
        auth.profile.scope_type,
        auth.profile.branch_id,
        branchId
      )
    ) {
      const response = jsonResponse(
        { error: 'لا تملك صلاحية نقل المستخدم إلى هذا الفرع' },
        403
      )
      return withAuthCookies(auth.response, response)
    }

    const { data: usernameConflict, error: usernameConflictError } =
      await supabaseAdmin
        .from('pos_profiles')
        .select('id')
        .eq('tenant_id', tenantId)
        .ilike('username', username)
        .neq('id', userId)
        .limit(1)
        .maybeSingle()

    if (usernameConflictError) {
      const response = jsonResponse(
        {
          error: 'تعذر التحقق من اسم المستخدم',
          ...safeErrorDetails(
            usernameConflictError,
            'تعذر التحقق من اسم المستخدم'
          ),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    if (usernameConflict) {
      const response = jsonResponse(
        { error: 'اسم المستخدم مستخدم بالفعل داخل نفس المنشأة' },
        409
      )
      return withAuthCookies(auth.response, response)
    }

    const { error: updateError } = await supabaseAdmin
      .from('pos_profiles')
      .update({
        full_name: fullName,
        username,
        role,
        branch_id: branchId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .eq('tenant_id', tenantId)

    if (updateError) {
      const response = jsonResponse(
        {
          error: 'فشل تحديث مستخدم POS',
          ...safeErrorDetails(updateError, 'تعذر تحديث مستخدم POS'),
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    await writeAuditLog({
      auth,
      request,
      action: 'user.pos_profile_updated',
      entityType: 'pos_profile',
      entityId: userId,
      branchId,
      metadata: {
        old_username: existingPosProfile.username,
        new_username: username,
        old_full_name: existingPosProfile.full_name,
        new_full_name: fullName,
        old_role: existingPosProfile.role,
        new_role: role,
        old_branch_id: currentBranchId,
        new_branch_id: branchId,
      },
    })

    const response = jsonResponse({ success: true })
    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        ...safeErrorDetails(error, 'تعذر تحديث مستخدم POS'),
      },
      500
    )
    return withAuthCookies(auth.response, response)
  }
}

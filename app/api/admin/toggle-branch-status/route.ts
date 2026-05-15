import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { isBooleanValue } from '@/lib/api/validation'
import { writeAuditLog } from '@/lib/audit-log'
import { safeErrorDetails } from '@/lib/security/redaction'
import {
  isSystemScopedAdmin,
  normalizeAdminBranchId,
} from '@/lib/admin/branches'
import { supabaseAdmin } from '@/lib/supabase/admin'

type ToggleBranchStatusBody = {
  branchId?: string
  is_active?: boolean
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  if (!isSystemScopedAdmin(auth.profile.scope_type)) {
    const response = jsonResponse(
      { error: 'هذه العملية متاحة لمدير النظام فقط' },
      403
    )

    return withAuthCookies(auth.response, response)
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

    const body = (await request.json()) as ToggleBranchStatusBody
    const branchId = normalizeAdminBranchId(body.branchId)
    const isActive = body.is_active

    if (!branchId) {
      const response = jsonResponse(
        { error: 'معرف الفرع مطلوب' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (!isBooleanValue(isActive)) {
      const response = jsonResponse(
        { error: 'قيمة is_active غير صالحة' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const { data: existingBranch, error: branchError } = await supabaseAdmin
      .from('branches')
      .select('id, code, name, is_active')
      .eq('id', branchId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (branchError) {
      const response = jsonResponse(
        {
          error: 'تعذر التحقق من الفرع',
          ...safeErrorDetails(branchError),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    if (!existingBranch) {
      const response = jsonResponse(
        { error: 'الفرع غير موجود' },
        404
      )
      return withAuthCookies(auth.response, response)
    }

    const { error: updateError } = await supabaseAdmin
      .from('branches')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', branchId)
      .eq('tenant_id', tenantId)

    if (updateError) {
      const response = jsonResponse(
        {
          error: 'فشل تحديث حالة الفرع',
          ...safeErrorDetails(updateError),
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    await writeAuditLog({
      auth,
      request,
      action: 'branch.status_toggled',
      entityType: 'branch',
      entityId: branchId,
      branchId,
      metadata: {
        old_is_active: existingBranch.is_active,
        new_is_active: isActive,
      },
    })

    const response = jsonResponse({
      success: true,
      message: isActive ? 'تم تفعيل الفرع بنجاح' : 'تم تعطيل الفرع بنجاح',
      branch: {
        id: existingBranch.id,
        code: existingBranch.code,
        name: existingBranch.name,
        is_active: isActive,
      },
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

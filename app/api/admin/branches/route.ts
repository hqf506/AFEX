import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import {
  isSystemScopedAdmin,
  isValidAdminBranchCode,
  normalizeAdminBranchCode,
  normalizeAdminBranchName,
} from '@/lib/admin/branches'
import { supabaseAdmin } from '@/lib/supabase/admin'

type CreateBranchBody = {
  code?: string
  name?: string
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    let query = supabaseAdmin
      .from('branches')
      .select('id, code, name, is_active, created_at, updated_at')
      .order('created_at', { ascending: true })

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
          details: error.message,
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

    const { data: existingBranch, error: existingBranchError } =
      await supabaseAdmin
        .from('branches')
        .select('id')
        .eq('code', code)
        .maybeSingle()

    if (existingBranchError) {
      const response = jsonResponse(
        {
          error: 'تعذر التحقق من كود الفرع',
          details: existingBranchError.message,
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
        is_active: true,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .select('id, code, name, is_active, created_at, updated_at')
      .single()

    if (error || !data) {
      const response = jsonResponse(
        {
          error: 'فشل إنشاء الفرع',
          details: error?.message || 'Unknown error',
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

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
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}

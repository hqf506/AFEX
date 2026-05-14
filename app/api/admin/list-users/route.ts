import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { shouldFilterByBranch } from '@/lib/branch-access'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      const response = NextResponse.json({
        success: true,
        users: [],
      })

      return withAuthCookies(auth.response, response)
    }

    if (auth.profile.scope_type === 'branch' && !auth.profile.branch_id) {
      const response = NextResponse.json({
        success: true,
        users: [],
      })

      return withAuthCookies(auth.response, response)
    }

    let query = supabaseAdmin
      .from('profiles')
      .select(
        'id, full_name, username, role, is_active, branch_id, created_at, updated_at'
      )
      .order('username', { ascending: true })

    query = applyTenantFilter(query, tenantId)

    if (
      shouldFilterByBranch(auth.profile.scope_type, auth.profile.branch_id)
    ) {
      query = query.eq('branch_id', auth.profile.branch_id as string)
    }

    const { data, error } = await query

    if (error) {
      const response = NextResponse.json(
        {
          error: 'تعذر تحميل المستخدمين',
          details: error.message,
        },
        { status: 500 }
      )

      return withAuthCookies(auth.response, response)
    }

    const response = NextResponse.json({
      success: true,
      users: data || [],
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = NextResponse.json(
      {
        error: 'حدث خطأ غير متوقع',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )

    return withAuthCookies(auth.response, response)
  }
}

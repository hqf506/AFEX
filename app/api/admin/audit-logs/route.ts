import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { safeErrorDetails } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100

function normalizeOptionalString(value: string | null) {
  const normalized = (value || '').trim()
  return normalized ? normalized : null
}

function clampPositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback
  }

  return Math.floor(parsed)
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const tenantId = auth.profile.tenant_id
    const params = request.nextUrl.searchParams
    const page = clampPositiveInteger(params.get('page'), DEFAULT_PAGE)
    const pageSize = Math.min(
      clampPositiveInteger(params.get('pageSize'), DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE
    )
    const action = normalizeOptionalString(params.get('action'))
    const entityType = normalizeOptionalString(params.get('entity_type'))
    const dateFrom = normalizeOptionalString(params.get('date_from'))
    const dateTo = normalizeOptionalString(params.get('date_to'))

    if (!tenantId) {
      const response = jsonResponse({
        success: true,
        logs: [],
        total: 0,
        page,
        pageSize,
      })

      return withAuthCookies(auth.response, response)
    }

    const rangeFrom = (page - 1) * pageSize
    const rangeTo = rangeFrom + pageSize - 1

    let query = supabaseAdmin
      .from('audit_logs')
      .select(
        `
          id,
          created_at,
          action,
          entity_type,
          entity_id,
          branch_id,
          actor_user_id,
          metadata,
          actor:profiles!audit_logs_actor_user_id_fkey (
            username,
            full_name
          )
        `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })

    query = applyTenantFilter(query, tenantId)

    if (action) {
      query = query.eq('action', action)
    }

    if (entityType) {
      query = query.eq('entity_type', entityType)
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom)
    }

    if (dateTo) {
      query = query.lte('created_at', dateTo)
    }

    const { data, error, count } = await query.range(rangeFrom, rangeTo)

    if (error) {
      const response = jsonResponse(
        {
          error: 'تعذر تحميل سجل النشاط',
          ...safeErrorDetails(error, 'تعذر تحميل سجل النشاط'),
        },
        500
      )

      return withAuthCookies(auth.response, response)
    }

    const response = jsonResponse({
      success: true,
      logs: data || [],
      total: count || 0,
      page,
      pageSize,
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        ...safeErrorDetails(error, 'تعذر تحميل سجل النشاط'),
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}

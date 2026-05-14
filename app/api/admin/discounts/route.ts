import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { isSystemScopedAdmin, normalizeAdminBranchId } from '@/lib/admin/branches'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'

type DiscountType = 'percentage' | 'fixed'

type CreateDiscountBody = {
  name?: string
  type?: DiscountType
  value?: number | string
  branch_id?: string | null
}

type ToggleDiscountBody = {
  id?: string
  is_active?: boolean
}

type DeleteDiscountBody = {
  id?: string
}

type DiscountRecord = {
  id: string
  name: string
  type: DiscountType
  value: number | string
  is_active: boolean
  branch_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function utf8JsonResponse(data: Record<string, unknown>, status = 200) {
  const response = jsonResponse(data, status)
  response.headers.set('Content-Type', 'application/json; charset=utf-8')
  return response
}

function normalizeDiscountId(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeDiscountName(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeDiscountType(value: unknown): DiscountType | '' {
  return value === 'percentage' || value === 'fixed' ? value : ''
}

function normalizeDiscountValue(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim()
    if (!normalizedValue) {
      return NaN
    }

    const parsed = Number(normalizedValue)
    return Number.isFinite(parsed) ? parsed : NaN
  }

  return NaN
}

function normalizeOptionalDiscountBranchId(value: unknown) {
  const normalizedValue = normalizeAdminBranchId(value)
  return normalizedValue || null
}

function mapDiscountRecord(record: DiscountRecord) {
  return {
    ...record,
    value: Number(record.value) || 0,
  }
}

async function branchBelongsToTenant(branchId: string, tenantId: string) {
  let query = supabaseAdmin
    .from('branches')
    .select('id')
    .eq('id', branchId)

  query = applyTenantFilter(query, tenantId)

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return Boolean(data)
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin', 'employee', 'cashier'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({
          success: true,
          discounts: [],
        })
      )
    }

    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true'
    const requestedBranchId = normalizeOptionalDiscountBranchId(
      request.nextUrl.searchParams.get('branchId')
    )

    let query = supabaseAdmin
      .from('discounts')
      .select('id, name, type, value, is_active, branch_id, created_at, updated_at, deleted_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    query = applyTenantFilter(query, tenantId)

    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    if (includeInactive && !isSystemScopedAdmin(auth.profile.scope_type)) {
      const effectiveBranchId = auth.profile.branch_id

      if (effectiveBranchId) {
        query = query.or(`branch_id.is.null,branch_id.eq.${effectiveBranchId}`)
      } else {
        query = query.is('branch_id', null)
      }
    } else if (requestedBranchId) {
      query = query.or(`branch_id.is.null,branch_id.eq.${requestedBranchId}`)
    } else if (!includeInactive) {
      query = query.is('branch_id', null)
    }

    const { data, error } = await query

    if (error) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            error: 'تعذر تحميل الخصومات',
            details: error.message,
          },
          500
        )
      )
    }

    return withAuthCookies(
      auth.response,
      utf8JsonResponse({
        success: true,
        discounts: ((data || []) as DiscountRecord[]).map(mapDiscountRecord),
      })
    )
  } catch (error) {
    return withAuthCookies(
      auth.response,
      utf8JsonResponse(
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
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  if (!isSystemScopedAdmin(auth.profile.scope_type)) {
    return withAuthCookies(
      auth.response,
      utf8JsonResponse({ error: 'هذه العملية متاحة لمدير النظام فقط' }, 403)
    )
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ¯ Ù†Ø·Ø§Ù‚ Ø§Ù„Ù…Ù†Ø´Ø£Ø©' }, 400)
      )
    }

    const body = (await request.json()) as CreateDiscountBody
    const name = normalizeDiscountName(body.name)
    const type = normalizeDiscountType(body.type)
    const value = normalizeDiscountValue(body.value)
    const branchId = normalizeOptionalDiscountBranchId(body.branch_id)

    if (!name) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'اسم الخصم مطلوب' }, 400)
      )
    }

    if (!type) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'نوع الخصم غير صالح' }, 400)
      )
    }

    if (!Number.isFinite(value) || value < 0) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'قيمة الخصم غير صالحة' }, 400)
      )
    }

    if (branchId && !(await branchBelongsToTenant(branchId, tenantId))) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'Ø§Ù„ÙØ±Ø¹ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' }, 404)
      )
    }

    let existingDiscountsQuery = supabaseAdmin
      .from('discounts')
      .select('id, name, type, value, is_active, branch_id, created_at, updated_at, deleted_at')
      .eq('name', name)

    existingDiscountsQuery = applyTenantFilter(existingDiscountsQuery, tenantId)

    const { data: existingDiscounts, error: existingDiscountsError } =
      await existingDiscountsQuery

    if (existingDiscountsError) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            error: 'تعذر التحقق من الخصم',
            details: existingDiscountsError.message,
          },
          500
        )
      )
    }

    const existingDiscount = ((existingDiscounts || []) as DiscountRecord[]).find(
      (discount) => (discount.branch_id || null) === branchId
    )

    if (existingDiscount && !existingDiscount.deleted_at && existingDiscount.is_active) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'هذا الخصم موجود بالفعل' }, 409)
      )
    }

    if (existingDiscount) {
      const { data: reactivatedDiscount, error: reactivateError } = await supabaseAdmin
        .from('discounts')
        .update({
          name,
          type,
          value,
          branch_id: branchId,
          tenant_id: tenantId,
          is_active: true,
          deleted_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingDiscount.id)
        .eq('tenant_id', tenantId)
        .select('id, name, type, value, is_active, branch_id, created_at, updated_at, deleted_at')
        .single()

      if (reactivateError || !reactivatedDiscount) {
        return withAuthCookies(
          auth.response,
          utf8JsonResponse(
            {
              error: 'تعذر إعادة تفعيل الخصم',
              details: reactivateError?.message || 'Unknown error',
            },
            400
          )
        )
      }

      return withAuthCookies(
        auth.response,
        utf8JsonResponse({
          success: true,
          message: 'تمت إعادة تفعيل الخصم بنجاح',
          discount: mapDiscountRecord(reactivatedDiscount as DiscountRecord),
        })
      )
    }

    const { data, error } = await supabaseAdmin
      .from('discounts')
      .insert({
        name,
        type,
        value,
        branch_id: branchId,
        tenant_id: tenantId,
        is_active: true,
      })
      .select('id, name, type, value, is_active, branch_id, created_at, updated_at, deleted_at')
      .single()

    if (error || !data) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            error: 'فشل إنشاء الخصم',
            details: error?.message || 'Unknown error',
          },
          400
        )
      )
    }

    return withAuthCookies(
      auth.response,
      utf8JsonResponse({
        success: true,
        message: 'تم إنشاء الخصم بنجاح',
        discount: mapDiscountRecord(data as DiscountRecord),
      })
    )
  } catch (error) {
    return withAuthCookies(
      auth.response,
      utf8JsonResponse(
        {
          error: 'حدث خطأ غير متوقع',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      )
    )
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  if (!isSystemScopedAdmin(auth.profile.scope_type)) {
    return withAuthCookies(
      auth.response,
      utf8JsonResponse({ error: 'هذه العملية متاحة لمدير النظام فقط' }, 403)
    )
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'Ø§Ù„Ø®ØµÙ… ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' }, 404)
      )
    }

    const body = (await request.json()) as ToggleDiscountBody
    const discountId = normalizeDiscountId(body.id)

    if (!discountId) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'معرف الخصم مطلوب' }, 400)
      )
    }

    if (typeof body.is_active !== 'boolean') {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'حالة التفعيل غير صالحة' }, 400)
      )
    }

    let existingDiscountQuery = supabaseAdmin
      .from('discounts')
      .select('id, name, type, value, is_active, branch_id, created_at, updated_at, deleted_at')
      .eq('id', discountId)

    existingDiscountQuery = applyTenantFilter(existingDiscountQuery, tenantId)

    const { data: existingDiscount, error: existingDiscountError } =
      await existingDiscountQuery
      .maybeSingle()

    if (existingDiscountError) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            error: 'تعذر تحميل الخصم',
            details: existingDiscountError.message,
          },
          500
        )
      )
    }

    if (!existingDiscount || existingDiscount.deleted_at) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'الخصم غير موجود' }, 404)
      )
    }

    const { data, error } = await supabaseAdmin
      .from('discounts')
      .update({
        is_active: body.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', discountId)
      .eq('tenant_id', tenantId)
      .select('id, name, type, value, is_active, branch_id, created_at, updated_at, deleted_at')
      .single()

    if (error || !data) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            error: 'تعذر تحديث حالة الخصم',
            details: error?.message || 'Unknown error',
          },
          400
        )
      )
    }

    return withAuthCookies(
      auth.response,
      utf8JsonResponse({
        success: true,
        message: body.is_active ? 'تم تفعيل الخصم بنجاح' : 'تم تعطيل الخصم بنجاح',
        discount: mapDiscountRecord(data as DiscountRecord),
      })
    )
  } catch (error) {
    return withAuthCookies(
      auth.response,
      utf8JsonResponse(
        {
          error: 'حدث خطأ غير متوقع',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      )
    )
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  if (!isSystemScopedAdmin(auth.profile.scope_type)) {
    return withAuthCookies(
      auth.response,
      utf8JsonResponse({ error: 'هذه العملية متاحة لمدير النظام فقط' }, 403)
    )
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'Ø§Ù„Ø®ØµÙ… ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' }, 404)
      )
    }

    const body = (await request.json()) as DeleteDiscountBody
    const discountId = normalizeDiscountId(body.id)

    if (!discountId) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'معرف الخصم مطلوب' }, 400)
      )
    }

    let existingDiscountQuery = supabaseAdmin
      .from('discounts')
      .select('id, deleted_at')
      .eq('id', discountId)

    existingDiscountQuery = applyTenantFilter(existingDiscountQuery, tenantId)

    const { data: existingDiscount, error: existingDiscountError } =
      await existingDiscountQuery
      .maybeSingle()

    if (existingDiscountError) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            error: 'تعذر تحميل الخصم',
            details: existingDiscountError.message,
          },
          500
        )
      )
    }

    if (!existingDiscount || existingDiscount.deleted_at) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'الخصم غير موجود' }, 404)
      )
    }

    const { error } = await supabaseAdmin
      .from('discounts')
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', discountId)
      .eq('tenant_id', tenantId)

    if (error) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            error: 'تعذر حذف الخصم',
            details: error.message,
          },
          400
        )
      )
    }

    return withAuthCookies(
      auth.response,
      utf8JsonResponse({
        success: true,
        message: 'تم حذف الخصم بنجاح',
      })
    )
  } catch (error) {
    return withAuthCookies(
      auth.response,
      utf8JsonResponse(
        {
          error: 'حدث خطأ غير متوقع',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      )
    )
  }
}

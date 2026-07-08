import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { isSystemScopedCatalogAdmin } from '@/lib/admin/catalog'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'

type CreateCategoryBody = {
  name?: string
}

type DeleteCategoryBody = {
  id?: string
}

type CategoryRecord = {
  id: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

const UNCATEGORIZED_LABEL = 'دون فئة'

function normalizeCategoryName(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeCategoryId(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isUncategorizedCategory(value: unknown) {
  return normalizeCategoryName(value) === UNCATEGORIZED_LABEL
}

function utf8JsonResponse(data: Record<string, unknown>, status = 200) {
  const response = jsonResponse(data, status)
  response.headers.set('Content-Type', 'application/json; charset=utf-8')
  return response
}

async function loadCategoryStats(
  categoryNames: string[],
  tenantId: string | null | undefined
) {
  if (!tenantId) {
    return {
      usageMap: new Map<string, number>(),
      uncategorizedCount: 0,
    }
  }

  let query = supabaseAdmin
    .from('catalog_items')
    .select('category')

  query = applyTenantFilter(query, tenantId)

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  const usageMap = new Map<string, number>()
  let uncategorizedCount = 0
  const allowedCategoryNames = new Set(categoryNames)

  for (const row of data || []) {
    const categoryName = normalizeCategoryName(row.category)

    if (!categoryName || categoryName === UNCATEGORIZED_LABEL) {
      uncategorizedCount += 1
      continue
    }

    if (!allowedCategoryNames.has(categoryName)) {
      continue
    }

    usageMap.set(categoryName, (usageMap.get(categoryName) || 0) + 1)
  }

  return {
    usageMap,
    uncategorizedCount,
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    console.warn('[api/admin/categories] auth failed', {
      method: 'GET',
      status: auth.response.status,
    })
    return auth.response
  }

  console.warn('[api/admin/categories] auth profile', {
    method: 'GET',
    userId: auth.user.id,
    role: auth.profile.role,
    branchId: auth.profile.branch_id,
    scopeType: auth.profile.scope_type,
    tenantId: auth.profile.tenant_id,
  })

  if (!isSystemScopedCatalogAdmin(auth.profile.scope_type)) {
    return withAuthCookies(
      auth.response,
      utf8JsonResponse({ error: 'هذه الصفحة متاحة لمدير النظام فقط' }, 403)
    )
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({
          success: true,
          categories: [],
          uncategorized_count: 0,
        })
      )
    }

    let query = supabaseAdmin
      .from('catalog_categories')
      .select('id, name, is_active, created_at, updated_at')
      .eq('is_active', true)
      .order('created_at', { ascending: true })

    query = applyTenantFilter(query, tenantId)

    const { data, error } = await query

    if (error) {
      console.error('[api/admin/categories] catalog_categories query failed', {
        method: 'GET',
        userId: auth.user.id,
        tenantId,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      })
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            error: 'تعذر تحميل الفئات',
            details: error.message,
          },
          500
        )
      )
    }

    const categories = ((data || []) as CategoryRecord[]).filter(
      (category) => !isUncategorizedCategory(category.name)
    )
    const { usageMap, uncategorizedCount } = await loadCategoryStats(
      categories.map((category) => category.name),
      tenantId
    )

    return withAuthCookies(
      auth.response,
      utf8JsonResponse({
        success: true,
        categories: categories.map((category) => ({
          ...category,
          used_count: usageMap.get(category.name) || 0,
        })),
        uncategorized_count: uncategorizedCount,
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
    console.warn('[api/admin/categories] auth failed', {
      method: 'POST',
      status: auth.response.status,
    })
    return auth.response
  }

  console.warn('[api/admin/categories] auth profile', {
    method: 'POST',
    userId: auth.user.id,
    role: auth.profile.role,
    branchId: auth.profile.branch_id,
    scopeType: auth.profile.scope_type,
    tenantId: auth.profile.tenant_id,
  })

  if (!isSystemScopedCatalogAdmin(auth.profile.scope_type)) {
    return withAuthCookies(
      auth.response,
      utf8JsonResponse({ error: 'هذه العملية متاحة لمدير النظام فقط' }, 403)
    )
  }

  try {
    const body = (await request.json()) as CreateCategoryBody
    const name = normalizeCategoryName(body.name)

    if (!name) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'اسم الفئة مطلوب' }, 400)
      )
    }

    if (isUncategorizedCategory(name)) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'لا يمكن إضافة فئة دون فئة لأنها قيمة نظام ثابتة' }, 409)
      )
    }

    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'تعذر تحديد نطاق المنشأة' }, 400)
      )
    }

    let existingCategoryQuery = supabaseAdmin
      .from('catalog_categories')
      .select('id, name, is_active')
      .eq('name', name)

    existingCategoryQuery = applyTenantFilter(existingCategoryQuery, tenantId)

    const { data: existingCategory, error: existingCategoryError } =
      await existingCategoryQuery
      .maybeSingle()

    if (existingCategoryError) {
      console.error('[api/admin/categories] catalog_categories lookup failed', {
        method: 'POST',
        userId: auth.user.id,
        tenantId,
        message: existingCategoryError.message,
        details: existingCategoryError.details,
        hint: existingCategoryError.hint,
        code: existingCategoryError.code,
      })
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            error: 'تعذر التحقق من الفئة',
            details: existingCategoryError.message,
          },
          500
        )
      )
    }

    if (existingCategory?.is_active) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'هذه الفئة موجودة بالفعل' }, 409)
      )
    }

    if (existingCategory) {
      const { data: reactivatedCategory, error: reactivateError } = await supabaseAdmin
        .from('catalog_categories')
        .update({
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingCategory.id)
        .eq('tenant_id', tenantId)
        .select('id, name, is_active, created_at, updated_at')
        .single()

      if (reactivateError || !reactivatedCategory) {
        return withAuthCookies(
          auth.response,
          utf8JsonResponse(
            {
              error: 'تعذر إعادة تفعيل الفئة',
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
          message: 'تمت إعادة تفعيل الفئة بنجاح',
          category: {
            ...reactivatedCategory,
            used_count: 0,
          },
        })
      )
    }

    const { data, error } = await supabaseAdmin
      .from('catalog_categories')
      .insert({
        name,
        tenant_id: tenantId,
        is_active: true,
      })
      .select('id, name, is_active, created_at, updated_at')
      .single()

    if (error || !data) {
      console.error('[api/admin/categories] catalog_categories insert failed', {
        method: 'POST',
        userId: auth.user.id,
        tenantId,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      })
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            error: 'فشل إنشاء الفئة',
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
        message: 'تم إنشاء الفئة بنجاح',
        category: {
          ...data,
          used_count: 0,
        },
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
    console.warn('[api/admin/categories] auth failed', {
      method: 'DELETE',
      status: auth.response.status,
    })
    return auth.response
  }

  console.warn('[api/admin/categories] auth profile', {
    method: 'DELETE',
    userId: auth.user.id,
    role: auth.profile.role,
    branchId: auth.profile.branch_id,
    scopeType: auth.profile.scope_type,
    tenantId: auth.profile.tenant_id,
  })

  if (!isSystemScopedCatalogAdmin(auth.profile.scope_type)) {
    return withAuthCookies(
      auth.response,
      utf8JsonResponse({ error: 'هذه العملية متاحة لمدير النظام فقط' }, 403)
    )
  }

  try {
    const body = (await request.json()) as DeleteCategoryBody
    const categoryId = normalizeCategoryId(body.id)

    if (!categoryId) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'معرف الفئة مطلوب' }, 400)
      )
    }

    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'الفئة غير موجودة' }, 404)
      )
    }

    let categoryQuery = supabaseAdmin
      .from('catalog_categories')
      .select('id, name, is_active')
      .eq('id', categoryId)

    categoryQuery = applyTenantFilter(categoryQuery, tenantId)

    const { data: category, error: categoryError } = await categoryQuery
      .maybeSingle()

    if (categoryError) {
      console.error('[api/admin/categories] catalog_categories lookup failed', {
        method: 'DELETE',
        userId: auth.user.id,
        tenantId,
        message: categoryError.message,
        details: categoryError.details,
        hint: categoryError.hint,
        code: categoryError.code,
      })
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            error: 'تعذر قراءة بيانات الفئة',
            details: categoryError.message,
          },
          500
        )
      )
    }

    if (!category || !category.is_active) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse({ error: 'الفئة غير موجودة' }, 404)
      )
    }

    let usageQuery = supabaseAdmin
      .from('catalog_items')
      .select('id', { count: 'exact', head: true })
      .eq('category', category.name)

    usageQuery = applyTenantFilter(usageQuery, tenantId)

    const { count, error: usageError } = await usageQuery

    if (usageError) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            error: 'تعذر التحقق من استخدام الفئة',
            details: usageError.message,
          },
          500
        )
      )
    }

    if ((count || 0) > 0) {
      const { error: reassignError } = await supabaseAdmin
        .from('catalog_items')
        .update({
          category: UNCATEGORIZED_LABEL,
          updated_at: new Date().toISOString(),
        })
        .eq('category', category.name)
        .eq('tenant_id', tenantId)

      if (reassignError) {
        return withAuthCookies(
          auth.response,
          utf8JsonResponse(
            {
              error: 'تعذر نقل العناصر إلى دون فئة',
              details: reassignError.message,
            },
            400
          )
        )
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from('catalog_categories')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', category.id)
      .eq('tenant_id', tenantId)

    if (deleteError) {
      return withAuthCookies(
        auth.response,
        utf8JsonResponse(
          {
            error: 'تعذر حذف الفئة',
            details: deleteError.message,
          },
          400
        )
      )
    }

    return withAuthCookies(
      auth.response,
      utf8JsonResponse({
        success: true,
        message: 'تم حذف الفئة بنجاح',
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

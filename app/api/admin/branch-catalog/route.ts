import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import {
  isSystemScopedCatalogAdmin,
  type AdminCatalogItemRecord,
} from '@/lib/admin/catalog'
import {
  isSystemScopedBranchCatalogAdmin,
  isValidBranchCatalogDisplayOrder,
  isValidBranchCatalogPrice,
  normalizeBranchCatalogBranchId,
  normalizeBranchCatalogDisplayOrder,
  normalizeBranchCatalogItemId,
  normalizeBranchCatalogPrice,
} from '@/lib/admin/branch-catalog'
import { supabaseAdmin } from '@/lib/supabase/admin'

type BranchCatalogBody = {
  branchId?: string
  catalogItemId?: string
  price?: number | string
  isActive?: boolean | string
  displayOrder?: number | string | null
}

type BranchCatalogRow = {
  id: string
  branch_id: string
  catalog_item_id: string
  price: number
  is_active: boolean
  display_order: number | null
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  if (!isSystemScopedBranchCatalogAdmin(auth.profile.scope_type)) {
    return withAuthCookies(
      auth.response,
      jsonResponse({ error: 'هذه الصفحة متاحة لمدير النظام فقط' }, 403)
    )
  }

  try {
    const requestedBranchId = normalizeBranchCatalogBranchId(
      request.nextUrl.searchParams.get('branchId')
    )

    const { data: branches, error: branchesError } = await supabaseAdmin
      .from('branches')
      .select('id, code, name, is_active, created_at, updated_at')
      .order('created_at', { ascending: true })

    if (branchesError) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'تعذر تحميل الفروع',
            details: branchesError.message,
          },
          500
        )
      )
    }

    const branchList = branches || []
    const fallbackBranchId =
      branchList.find((branch) => branch.code === 'main')?.id ||
      branchList[0]?.id ||
      ''
    const selectedBranchId = requestedBranchId || fallbackBranchId

    const { data: catalogItems, error: catalogError } = await supabaseAdmin
      .from('catalog_items')
      .select(
        'id, code, name, category, item_type, default_price, is_active, created_at, updated_at'
      )
      .order('created_at', { ascending: true })

    if (catalogError) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'تعذر تحميل الكتالوج',
            details: catalogError.message,
          },
          500
        )
      )
    }

    let branchOverrides: BranchCatalogRow[] = []

    if (selectedBranchId) {
      const { data, error } = await supabaseAdmin
        .from('branch_catalog_items')
        .select('id, branch_id, catalog_item_id, price, is_active, display_order')
        .eq('branch_id', selectedBranchId)

      if (error) {
        return withAuthCookies(
          auth.response,
          jsonResponse(
            {
              error: 'تعذر تحميل إعدادات الكتالوج الخاصة بالفرع',
              details: error.message,
            },
            500
          )
        )
      }

      branchOverrides = (data || []) as BranchCatalogRow[]
    }

    const overrideMap = new Map(
      branchOverrides.map((override) => [override.catalog_item_id, override])
    )

    const items = ((catalogItems || []) as AdminCatalogItemRecord[]).map((item) => {
      const override = overrideMap.get(item.id)

      return {
        ...item,
        branch_catalog_item_id: override?.id || null,
        branch_price: override?.price ?? item.default_price,
        branch_is_active: override?.is_active ?? item.is_active,
        display_order: override?.display_order ?? null,
      }
    })

    return withAuthCookies(
      auth.response,
      jsonResponse({
        success: true,
        branches: branchList,
        selectedBranchId,
        items,
      })
    )
  } catch (error) {
    return withAuthCookies(
      auth.response,
      jsonResponse(
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

  if (!isSystemScopedCatalogAdmin(auth.profile.scope_type)) {
    return withAuthCookies(
      auth.response,
      jsonResponse({ error: 'هذه العملية متاحة لمدير النظام فقط' }, 403)
    )
  }

  try {
    const body = (await request.json()) as BranchCatalogBody
    const branchId = normalizeBranchCatalogBranchId(body.branchId)
    const catalogItemId = normalizeBranchCatalogItemId(body.catalogItemId)
    const price = normalizeBranchCatalogPrice(body.price)
    const displayOrder = normalizeBranchCatalogDisplayOrder(body.displayOrder)
    const isActive =
      body.isActive === true || body.isActive === 'true'
        ? true
        : body.isActive === false || body.isActive === 'false'
          ? false
          : null

    if (!branchId) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'معرف الفرع مطلوب' }, 400)
      )
    }

    if (!catalogItemId) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'معرف عنصر الكتالوج مطلوب' }, 400)
      )
    }

    if (!isValidBranchCatalogPrice(price)) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'سعر الفرع غير صالح' }, 400)
      )
    }

    if (!isValidBranchCatalogDisplayOrder(displayOrder)) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'ترتيب العرض غير صالح' }, 400)
      )
    }

    if (typeof isActive !== 'boolean') {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'حالة التفعيل غير صالحة' }, 400)
      )
    }

    const { data: branch, error: branchError } = await supabaseAdmin
      .from('branches')
      .select('id')
      .eq('id', branchId)
      .maybeSingle()

    if (branchError) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'تعذر التحقق من الفرع',
            details: branchError.message,
          },
          500
        )
      )
    }

    if (!branch) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'الفرع غير موجود' }, 404)
      )
    }

    const { data: item, error: itemError } = await supabaseAdmin
      .from('catalog_items')
      .select('id')
      .eq('id', catalogItemId)
      .maybeSingle()

    if (itemError) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'تعذر التحقق من عنصر الكتالوج',
            details: itemError.message,
          },
          500
        )
      )
    }

    if (!item) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'عنصر الكتالوج غير موجود' }, 404)
      )
    }

    const timestamp = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('branch_catalog_items')
      .upsert(
        {
          branch_id: branchId,
          catalog_item_id: catalogItemId,
          price,
          is_active: isActive,
          display_order: displayOrder,
          updated_at: timestamp,
        },
        {
          onConflict: 'branch_id,catalog_item_id',
        }
      )
      .select(
        'id, branch_id, catalog_item_id, price, is_active, display_order, created_at, updated_at'
      )
      .single()

    if (error || !data) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'فشل حفظ إعدادات الفرع الخاصة بالعنصر',
            details: error?.message || 'Unknown error',
          },
          400
        )
      )
    }

    return withAuthCookies(
      auth.response,
      jsonResponse({
        success: true,
        message: 'تم حفظ إعدادات الكتالوج الخاصة بالفرع بنجاح',
        item: data,
      })
    )
  } catch (error) {
    return withAuthCookies(
      auth.response,
      jsonResponse(
        {
          error: 'حدث خطأ غير متوقع',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      )
    )
  }
}

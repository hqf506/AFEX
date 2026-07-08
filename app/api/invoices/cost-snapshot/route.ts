import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'

type CostSnapshotItemInput = {
  item_id?: string | null
  item_name?: string
  item_type?: 'product' | 'service' | string
  quantity?: number
  unit_price?: number
}

type SnapshotCostBody = {
  invoice_id?: string
  items?: CostSnapshotItemInput[]
}

type CatalogCostRow = {
  id: string
  name: string
  item_type: 'product' | 'service'
  cost_price: number | string | null
}

function normalizeLookupText(value: string | null | undefined) {
  return (value || '').trim().toLowerCase()
}

function normalizeLookupNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

function buildCatalogCostLookup(rows: CatalogCostRow[]) {
  const byId = new Map<string, number>()
  const byNameAndType = new Map<string, number>()

  for (const row of rows) {
    const costPrice = normalizeLookupNumber(row.cost_price)

    if (row.id) {
      byId.set(row.id, costPrice)
    }

    const normalizedName = normalizeLookupText(row.name)
    const normalizedType = normalizeLookupText(row.item_type)

    if (normalizedName) {
      byNameAndType.set(`name:${normalizedName}`, costPrice)

      if (normalizedType) {
        byNameAndType.set(
          `type:${normalizedType}::name:${normalizedName}`,
          costPrice
        )
      }
    }
  }

  return {
    byId,
    byNameAndType,
  }
}

function resolveCostPriceForSnapshot(
  item: CostSnapshotItemInput,
  lookup: ReturnType<typeof buildCatalogCostLookup>
) {
  if (typeof item.item_id === 'string' && item.item_id.trim()) {
    const byId = lookup.byId.get(item.item_id.trim())
    if (typeof byId === 'number') {
      return byId
    }
  }

  const normalizedName = normalizeLookupText(item.item_name)
  const normalizedType = normalizeLookupText(item.item_type)

  if (!normalizedName) return 0

  if (normalizedType) {
    const byType = lookup.byNameAndType.get(
      `type:${normalizedType}::name:${normalizedName}`
    )
    if (typeof byType === 'number') {
      return byType
    }
  }

  return lookup.byNameAndType.get(`name:${normalizedName}`) || 0
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin', 'employee', 'cashier'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'تعذر تحديد نطاق المنشأة' }, 403)
      )
    }

    const body = (await request.json()) as SnapshotCostBody
    const invoiceId =
      typeof body.invoice_id === 'string' ? body.invoice_id.trim() : ''
    const items = Array.isArray(body.items) ? body.items : []

    if (!invoiceId) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'رقم الفاتورة الداخلي مطلوب' }, 400)
      )
    }

    if (items.length === 0) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ success: true, updated: 0 })
      )
    }

    let invoiceQuery = supabaseAdmin
      .from('invoices')
      .select('id')
      .eq('id', invoiceId)

    invoiceQuery = applyTenantFilter(invoiceQuery, tenantId)

    const { data: invoice, error: invoiceError } =
      await invoiceQuery.maybeSingle()

    if (invoiceError) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            error: 'تعذر التحقق من الفاتورة',
            details: invoiceError.message,
          },
          500
        )
      )
    }

    if (!invoice) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'الفاتورة غير موجودة' }, 404)
      )
    }

    const itemIds = items
      .map((item) =>
        typeof item.item_id === 'string' ? item.item_id.trim() : ''
      )
      .filter(Boolean)

    let catalogRows: CatalogCostRow[] = []

    if (itemIds.length > 0) {
      let catalogQuery = supabaseAdmin
        .from('catalog_items')
        .select('id, name, item_type, cost_price')
        .in('id', itemIds)

      catalogQuery = applyTenantFilter(catalogQuery, tenantId)

      const { data, error } = await catalogQuery

      if (error) {
        return withAuthCookies(
          auth.response,
          jsonResponse(
            {
              error: 'تعذر تحميل أسعار التكلفة من الكتالوج',
              details: error.message,
            },
            500
          )
        )
      }

      catalogRows = (data || []) as CatalogCostRow[]
    } else {
      const candidateNames = items
        .map((item) =>
          typeof item.item_name === 'string' ? item.item_name.trim() : ''
        )
        .filter(Boolean)

      if (candidateNames.length > 0) {
        let catalogQuery = supabaseAdmin
          .from('catalog_items')
          .select('id, name, item_type, cost_price')
          .in('name', candidateNames)

        catalogQuery = applyTenantFilter(catalogQuery, tenantId)

        const { data, error } = await catalogQuery

        if (error) {
          return withAuthCookies(
            auth.response,
            jsonResponse(
              {
                error: 'تعذر تحميل أسعار التكلفة من الكتالوج',
                details: error.message,
              },
              500
            )
          )
        }

        catalogRows = (data || []) as CatalogCostRow[]
      }
    }

    const lookup = buildCatalogCostLookup(catalogRows)
    let updated = 0

    for (const item of items) {
      const itemName =
        typeof item.item_name === 'string' ? item.item_name.trim() : ''
      const itemType =
        typeof item.item_type === 'string' ? item.item_type.trim() : ''
      const unitPrice = normalizeLookupNumber(item.unit_price)
      const quantity = normalizeLookupNumber(item.quantity)

      if (!itemName || !itemType) {
        continue
      }

      const costPrice = resolveCostPriceForSnapshot(item, lookup)

      const { error } = await supabaseAdmin
        .from('invoice_items')
        .update({
          cost_price: costPrice,
        })
        .eq('invoice_id', invoiceId)
        .eq('item_name_snapshot', itemName)
        .eq('item_type_snapshot', itemType)
        .eq('unit_price', unitPrice)
        .eq('quantity', quantity)
        .eq('tenant_id', tenantId)

      if (error) {
        return withAuthCookies(
          auth.response,
          jsonResponse(
            {
              error: 'تعذر حفظ snapshot لسعر التكلفة',
              details: error.message,
            },
            500
          )
        )
      }

      updated += 1
    }

    return withAuthCookies(
      auth.response,
      jsonResponse({
        success: true,
        updated,
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

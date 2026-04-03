import type { SupabaseClient } from '@supabase/supabase-js'
import { INVOICE_PRODUCTS, type InvoiceCatalogItem } from '@/lib/invoices/items'

type CatalogItemRow = {
  id: string
  name: string
  category: string
  item_type: 'product' | 'service'
  default_price: number
  image_url: string | null
  is_active: boolean
}

type BranchCatalogItemRow = {
  catalog_item_id: string
  price: number
  is_active: boolean
  display_order: number | null
}

function toStaticInvoiceProductsFallback() {
  return INVOICE_PRODUCTS
}

function sortInvoiceCatalogItems(
  left: InvoiceCatalogItem & { displayOrder: number | null },
  right: InvoiceCatalogItem & { displayOrder: number | null }
) {
  if (left.displayOrder === null && right.displayOrder === null) {
    return left.name.localeCompare(right.name, 'ar')
  }

  if (left.displayOrder === null) return 1
  if (right.displayOrder === null) return -1

  if (left.displayOrder !== right.displayOrder) {
    return left.displayOrder - right.displayOrder
  }

  return left.name.localeCompare(right.name, 'ar')
}

export function mapBranchCatalogToInvoiceProducts(
  catalogItems: CatalogItemRow[],
  branchOverrides: BranchCatalogItemRow[]
) {
  const overrideMap = new Map(
    branchOverrides.map((override) => [override.catalog_item_id, override])
  )

  return catalogItems
    .map((item) => {
      const override = overrideMap.get(item.id)
      const isActive = override?.is_active ?? item.is_active

      if (!isActive) {
        return null
      }

      return {
        id: item.id,
        name: item.name,
        type: item.item_type,
        category: item.category,
        price: override?.price ?? item.default_price,
        image_url: item.image_url,
        displayOrder: override?.display_order ?? null,
      }
    })
    .filter(
      (
        item
      ): item is InvoiceCatalogItem & {
        displayOrder: number | null
      } => item !== null
    )
    .sort(sortInvoiceCatalogItems)
    .map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      category: item.category,
      price: item.price,
      image_url: item.image_url,
    }))
}

export async function loadBranchInvoiceCatalog(
  supabase: SupabaseClient,
  branchId: string | null
) {
  if (!branchId) {
    return toStaticInvoiceProductsFallback()
  }

  const { data: catalogItems, error: catalogError } = await supabase
    .from('catalog_items')
    .select('id, name, category, item_type, default_price, image_url, is_active')
    .eq('is_active', true)

  if (catalogError || !Array.isArray(catalogItems) || catalogItems.length === 0) {
    return toStaticInvoiceProductsFallback()
  }

  const { data: branchOverrides, error: branchOverridesError } = await supabase
    .from('branch_catalog_items')
    .select('catalog_item_id, price, is_active, display_order')
    .eq('branch_id', branchId)

  if (branchOverridesError) {
    return toStaticInvoiceProductsFallback()
  }

  const products = mapBranchCatalogToInvoiceProducts(
    catalogItems as CatalogItemRow[],
    Array.isArray(branchOverrides)
      ? (branchOverrides as BranchCatalogItemRow[])
      : []
  )

  return products.length > 0 ? products : toStaticInvoiceProductsFallback()
}

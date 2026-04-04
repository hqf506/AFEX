import {
  INVOICE_PRODUCTS,
  resolveInvoiceCatalogImageUrl,
  type InvoiceCatalogItem,
} from '@/lib/invoices/items'

export type CatalogItemRow = {
  id: string
  name: string
  category: string
  item_type: 'product' | 'service'
  default_price: number
  image_url: string | null
  is_active: boolean
}

export type BranchCatalogItemRow = {
  catalog_item_id: string
  price: number
  is_active: boolean
  display_order: number | null
}

type LoadBranchInvoiceCatalogResponse = {
  success?: boolean
  products?: InvoiceCatalogItem[]
  error?: string
  details?: string
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
  const catalogItemMap = new Map(catalogItems.map((item) => [item.id, item]))

  return branchOverrides
    .map((override) => {
      const item = catalogItemMap.get(override.catalog_item_id)

      if (!item || !item.is_active || !override.is_active) {
        return null
      }

      return {
        id: item.id,
        name: item.name,
        type: item.item_type,
        category: item.category,
        price: override.price,
        image_url: resolveInvoiceCatalogImageUrl(item.image_url),
        displayOrder: override.display_order ?? null,
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

export async function loadBranchInvoiceCatalog(branchId: string | null) {
  if (!branchId) {
    return toStaticInvoiceProductsFallback()
  }

  const response = await fetch(
    `/api/invoice/catalog?branchId=${encodeURIComponent(branchId)}`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  )

  const result = (await response.json().catch(() => null)) as
    | LoadBranchInvoiceCatalogResponse
    | null

  if (
    !response.ok ||
    !result?.success ||
    !Array.isArray(result.products)
  ) {
    throw new Error(result?.details || result?.error || 'Failed to load branch catalog')
  }

  return result.products
}

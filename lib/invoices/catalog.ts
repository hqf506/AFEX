import {
  resolveInvoiceCatalogImageUrl,
  type InvoiceCatalogItem,
} from '@/lib/invoices/items'
import {
  createProtectedResourceAuthError,
  loadClientResource,
  markProtectedResourcesUnauthorized,
  peekClientResource,
  prefetchClientResource,
} from '@/lib/client-resource-cache'

export type PosInvoiceCatalogProduct = InvoiceCatalogItem & {
  item_id: string
  catalog_item_id: string
  branch_catalog_item_id: string | null
  pos_display_mode: 'style' | 'image'
  pos_color: string | null
  pos_shape: string | null
}

export type CatalogItemRow = {
  id: string
  name: string
  category: string
  item_type: 'product' | 'service'
  default_price: number
  image_url: string | null
  pos_display_mode?: 'style' | 'image' | null
  pos_color?: string | null
  pos_shape?: string | null
  is_active: boolean
}

export type BranchCatalogItemRow = {
  id?: string
  catalog_item_id: string
  price: number
  is_active: boolean
  display_order: number | null
}

type LoadBranchInvoiceCatalogResponse = {
  success?: boolean
  products?: Array<
    Partial<InvoiceCatalogItem> & {
      id?: string
      item_id?: string
      catalog_item_id?: string
      branch_catalog_item_id?: string | null
      category?: string
      type?: 'product' | 'service'
      price?: number
      image_url?: string | null
      pos_display_mode?: 'style' | 'image' | null
      pos_color?: string | null
      pos_shape?: string | null
      name?: string
    }
  >
  error?: string
  details?: string
}

const INVOICE_CATALOG_CACHE_TTL_MS = 60_000

function getInvoiceCatalogCacheKey(branchId: string | null) {
  return `invoice-catalog:${branchId || 'none'}`
}

function normalizeCatalogProductId(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
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
  const branchOverrideMap = new Map(
    branchOverrides.map((override) => [override.catalog_item_id, override])
  )

  return catalogItems
    .map((item) => {
      const override = branchOverrideMap.get(item.id)

      if (!item.is_active) {
        return null
      }

      if (override && !override.is_active) {
        return null
      }

      return {
        id: item.id,
        item_id: item.id,
        catalog_item_id: item.id,
        branch_catalog_item_id:
          typeof override?.id === 'string' && override.id.trim()
            ? override.id.trim()
            : null,
        name: item.name,
        type: item.item_type,
        category: item.category,
        price: override?.price ?? item.default_price,
        image_url: resolveInvoiceCatalogImageUrl(item.image_url),
        pos_display_mode: item.pos_display_mode === 'image' ? 'image' : 'style',
        pos_color: typeof item.pos_color === 'string' ? item.pos_color : null,
        pos_shape: typeof item.pos_shape === 'string' ? item.pos_shape : null,
        displayOrder: override?.display_order ?? null,
      }
    })
    .filter(
      (
        item
      ): item is PosInvoiceCatalogProduct & {
        displayOrder: number | null
      } => item !== null
    )
    .sort(sortInvoiceCatalogItems)
    .map((item) => ({
      id: item.id,
      item_id: item.item_id,
      catalog_item_id: item.catalog_item_id,
      branch_catalog_item_id: item.branch_catalog_item_id,
      name: item.name,
      type: item.type,
      category: item.category,
      price: item.price,
      image_url: item.image_url,
      pos_display_mode: item.pos_display_mode,
      pos_color: item.pos_color,
      pos_shape: item.pos_shape,
    })) as PosInvoiceCatalogProduct[]
}

function normalizeLoadedInvoiceCatalogProducts(
  products: LoadBranchInvoiceCatalogResponse['products']
) {
  const safeProducts = Array.isArray(products) ? products : []

  return safeProducts
    .map((product) => {
      const catalogItemId =
        normalizeCatalogProductId(product?.catalog_item_id) ||
        normalizeCatalogProductId(product?.item_id) ||
        normalizeCatalogProductId(product?.id)

      if (!catalogItemId) {
        return null
      }

      return {
        id: catalogItemId,
        item_id: catalogItemId,
        catalog_item_id: catalogItemId,
        branch_catalog_item_id: normalizeCatalogProductId(
          product?.branch_catalog_item_id
        ) || null,
        name: typeof product?.name === 'string' ? product.name : '',
        type: product?.type === 'service' ? 'service' : 'product',
        category: typeof product?.category === 'string' ? product.category : '',
        price:
          typeof product?.price === 'number' && Number.isFinite(product.price)
            ? product.price
            : 0,
        image_url: resolveInvoiceCatalogImageUrl(product?.image_url),
        pos_display_mode: product?.pos_display_mode === 'image' ? 'image' : 'style',
        pos_color:
          typeof product?.pos_color === 'string' ? product.pos_color : null,
        pos_shape:
          typeof product?.pos_shape === 'string' ? product.pos_shape : null,
      }
    })
    .filter((product): product is PosInvoiceCatalogProduct => product !== null)
}

export async function loadBranchInvoiceCatalog(branchId: string | null) {
  if (!branchId) {
    return []
  }

  return loadClientResource(
    getInvoiceCatalogCacheKey(branchId),
    async () => {
      const response = await fetch(
        `/api/invoice/catalog?branchId=${encodeURIComponent(branchId)}`,
        {
          method: 'GET',
          cache: 'no-store',
        }
      )

      if (response.status === 401) {
        markProtectedResourcesUnauthorized()
        throw createProtectedResourceAuthError()
      }

      const result = (await response.json().catch(() => null)) as
        | LoadBranchInvoiceCatalogResponse
        | null

      if (
        !response.ok ||
        !result?.success ||
        !Array.isArray(result.products)
      ) {
        throw new Error(
          result?.details || result?.error || 'Failed to load branch catalog'
        )
      }

      return normalizeLoadedInvoiceCatalogProducts(result.products)
    },
    {
      ttlMs: INVOICE_CATALOG_CACHE_TTL_MS,
      logLabel: `fetch catalog (${branchId})`,
      protectedResource: true,
    }
  )
}

export function peekBranchInvoiceCatalog(branchId: string | null) {
  if (!branchId) {
    return []
  }

  return (
    peekClientResource<PosInvoiceCatalogProduct[]>(
      getInvoiceCatalogCacheKey(branchId)
    ) || []
  )
}

export function prefetchBranchInvoiceCatalog(branchId: string | null) {
  if (!branchId) {
    return Promise.resolve(null)
  }

  return prefetchClientResource(
    getInvoiceCatalogCacheKey(branchId),
    async () => {
      const response = await fetch(
        `/api/invoice/catalog?branchId=${encodeURIComponent(branchId)}`,
        {
          method: 'GET',
          cache: 'no-store',
        }
      )

      if (response.status === 401) {
        markProtectedResourcesUnauthorized()
        throw createProtectedResourceAuthError()
      }

      const result = (await response.json().catch(() => null)) as
        | LoadBranchInvoiceCatalogResponse
        | null

      if (
        !response.ok ||
        !result?.success ||
        !Array.isArray(result.products)
      ) {
        throw new Error(
          result?.details || result?.error || 'Failed to load branch catalog'
        )
      }

      return normalizeLoadedInvoiceCatalogProducts(result.products)
    },
    {
      ttlMs: INVOICE_CATALOG_CACHE_TTL_MS,
      logLabel: `fetch catalog (${branchId})`,
      protectedResource: true,
    }
  )
}

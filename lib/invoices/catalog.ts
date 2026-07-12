import {
  resolveInvoiceCatalogImageUrl,
  type InvoiceCatalogItem,
} from '@/lib/invoices/items'
import {
  clearClientResource,
  clearClientResourcesByPrefix,
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
  branch_id: string | null
  api_quantity_on_hand?: number
  quantity_on_hand: number
  low_stock_threshold: number
  is_low_stock: boolean
  is_composite: boolean
  track_inventory: boolean
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
  is_composite?: boolean | null
  track_inventory?: boolean | null
  is_active: boolean
}

export type BranchCatalogItemRow = {
  id?: string
  catalog_item_id: string
  price: number
  is_active: boolean
  display_order: number | null
}

export type InventoryStockRow = {
  catalog_item_id: string
  quantity_on_hand: number | string | null
  low_stock_threshold: number | string | null
}

type LoadBranchInvoiceCatalogResponse = {
  success?: boolean
  products?: Array<
    Partial<InvoiceCatalogItem> & {
      id?: string
      item_id?: string
      catalog_item_id?: string
      branch_catalog_item_id?: string | null
      branch_id?: string | null
      category?: string
      type?: 'product' | 'service'
      price?: number
      image_url?: string | null
      pos_display_mode?: 'style' | 'image' | null
      pos_color?: string | null
      pos_shape?: string | null
      quantity_on_hand?: number | string | null
      low_stock_threshold?: number | string | null
      is_low_stock?: boolean | null
      is_composite?: boolean | null
      track_inventory?: boolean | null
      name?: string
    }
  >
  categories?: string[]
  total?: number
  page?: number
  pageSize?: number
  error?: string
  details?: string
}

export type PosInvoiceCatalogPage = {
  products: PosInvoiceCatalogProduct[]
  categories: string[]
  total: number
  page: number
  pageSize: number
}

const INVOICE_CATALOG_CACHE_TTL_MS = 60_000

function getInvoiceCatalogCacheKey(branchId: string | null) {
  return `invoice-catalog:${branchId || 'none'}`
}

function getInvoiceCatalogPageCacheKey(params: {
  branchId: string | null
  page: number
  pageSize: number
  search?: string
  category?: string
}) {
  return [
    'invoice-catalog-page',
    params.branchId || 'none',
    params.page,
    params.pageSize,
    params.search || '',
    params.category || '',
  ].join(':')
}

export function clearBranchInvoiceCatalogCache(branchId: string | null) {
  if (!branchId) {
    clearClientResourcesByPrefix('invoice-catalog:')
    clearClientResourcesByPrefix('invoice-catalog-page:')
    return
  }

  clearClientResource(getInvoiceCatalogCacheKey(branchId))
  clearClientResourcesByPrefix(`invoice-catalog-page:${branchId}:`)
}

export function clearAllInvoiceCatalogCache() {
  clearClientResourcesByPrefix('invoice-catalog:')
  clearClientResourcesByPrefix('invoice-catalog-page:')
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

function normalizeStockNumber(value: unknown) {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : 0

  return Number.isFinite(numericValue) ? numericValue : 0
}

function getInventorySnapshot(stock?: InventoryStockRow) {
  const quantityOnHand = normalizeStockNumber(stock?.quantity_on_hand)
  const lowStockThreshold = normalizeStockNumber(stock?.low_stock_threshold)

  return {
    quantity_on_hand: quantityOnHand,
    low_stock_threshold: lowStockThreshold,
    is_low_stock:
      lowStockThreshold > 0 && quantityOnHand <= lowStockThreshold,
  }
}

export function mapBranchCatalogToInvoiceProducts(
  catalogItems: CatalogItemRow[],
  branchOverrides: BranchCatalogItemRow[],
  inventoryStock: InventoryStockRow[] = [],
  branchId: string | null = null
) {
  const branchOverrideMap = new Map(
    branchOverrides.map((override) => [override.catalog_item_id, override])
  )
  const inventoryStockMap = new Map(
    inventoryStock.map((stock) => [stock.catalog_item_id, stock])
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

      const stockSnapshot = getInventorySnapshot(inventoryStockMap.get(item.id))

      return {
        id: item.id,
        item_id: item.id,
        catalog_item_id: item.id,
        branch_catalog_item_id:
          typeof override?.id === 'string' && override.id.trim()
            ? override.id.trim()
            : null,
        branch_id: branchId,
        name: item.name,
        type: item.item_type,
        category: item.category,
        price: override?.price ?? item.default_price,
        image_url: resolveInvoiceCatalogImageUrl(item.image_url),
        quantity_on_hand: stockSnapshot.quantity_on_hand,
        low_stock_threshold: stockSnapshot.low_stock_threshold,
        is_low_stock: stockSnapshot.is_low_stock,
        is_composite: item.is_composite === true,
        track_inventory: item.track_inventory === true,
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
      branch_id: item.branch_id,
      name: item.name,
      type: item.type,
      category: item.category,
        price: item.price,
        image_url: item.image_url,
        quantity_on_hand: item.quantity_on_hand,
        low_stock_threshold: item.low_stock_threshold,
        is_low_stock: item.is_low_stock,
        is_composite: item.is_composite,
        track_inventory: item.track_inventory,
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

      const quantityOnHand = normalizeStockNumber(product?.quantity_on_hand)
      const lowStockThreshold = normalizeStockNumber(product?.low_stock_threshold)

      const normalizedProduct: PosInvoiceCatalogProduct = {
        id: catalogItemId,
        item_id: catalogItemId,
        catalog_item_id: catalogItemId,
        branch_catalog_item_id: normalizeCatalogProductId(
          product?.branch_catalog_item_id
        ) || null,
        branch_id: normalizeCatalogProductId(product?.branch_id) || null,
        name: typeof product?.name === 'string' ? product.name : '',
        type: product?.type === 'service' ? 'service' : 'product',
        category: typeof product?.category === 'string' ? product.category : '',
        price:
          typeof product?.price === 'number' && Number.isFinite(product.price)
            ? product.price
            : 0,
        image_url: resolveInvoiceCatalogImageUrl(product?.image_url),
        api_quantity_on_hand: quantityOnHand,
        quantity_on_hand: quantityOnHand,
        low_stock_threshold: lowStockThreshold,
        is_low_stock:
          Boolean(product?.is_low_stock) ||
          (lowStockThreshold > 0 && quantityOnHand <= lowStockThreshold),
        is_composite: product?.is_composite === true,
        track_inventory: product?.track_inventory === true,
        pos_display_mode: product?.pos_display_mode === 'image' ? 'image' : 'style',
        pos_color:
          typeof product?.pos_color === 'string' ? product.pos_color : null,
        pos_shape:
          typeof product?.pos_shape === 'string' ? product.pos_shape : null,
      }

      return normalizedProduct
    })
    .filter((product): product is PosInvoiceCatalogProduct => product !== null)
}

async function fetchBranchInvoiceCatalog(
  branchId: string,
  options: { cacheBust?: boolean } = {}
) {
  const searchParams = new URLSearchParams({ branchId })

  if (options.cacheBust) {
    searchParams.set('t', String(Date.now()))
  }

  const response = await fetch(`/api/invoice/catalog?${searchParams.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  })

  if (response.status === 401) {
    markProtectedResourcesUnauthorized()
    throw createProtectedResourceAuthError()
  }

  const result = (await response.json().catch(() => null)) as
    | LoadBranchInvoiceCatalogResponse
    | null

  if (!response.ok || !result?.success || !Array.isArray(result.products)) {
    throw new Error(
      result?.details || result?.error || 'Failed to load branch catalog'
    )
  }

  return normalizeLoadedInvoiceCatalogProducts(result.products)
}

async function fetchBranchInvoiceCatalogPage(
  branchId: string,
  options: {
    page: number
    pageSize: number
    search?: string
    category?: string
    cacheBust?: boolean
  }
) {
  const searchParams = new URLSearchParams({
    branchId,
    page: String(options.page),
    pageSize: String(options.pageSize),
  })

  if (options.search?.trim()) {
    searchParams.set('search', options.search.trim())
  }

  if (options.category?.trim()) {
    searchParams.set('category', options.category.trim())
  }

  if (options.cacheBust) {
    searchParams.set('t', String(Date.now()))
  }

  const response = await fetch(`/api/invoice/catalog?${searchParams.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  })

  if (response.status === 401) {
    markProtectedResourcesUnauthorized()
    throw createProtectedResourceAuthError()
  }

  const result = (await response.json().catch(() => null)) as
    | LoadBranchInvoiceCatalogResponse
    | null

  if (!response.ok || !result?.success || !Array.isArray(result.products)) {
    throw new Error(
      result?.details || result?.error || 'Failed to load branch catalog'
    )
  }

  const page = Number(result.page)
  const pageSize = Number(result.pageSize)
  const total = Number(result.total)

  return {
    products: normalizeLoadedInvoiceCatalogProducts(result.products),
    categories: Array.isArray(result.categories)
      ? result.categories.filter(
          (category): category is string => typeof category === 'string'
        )
      : [],
    total: Number.isFinite(total) ? total : 0,
    page: Number.isFinite(page) && page > 0 ? page : options.page,
    pageSize:
      Number.isFinite(pageSize) && pageSize > 0 ? pageSize : options.pageSize,
  } satisfies PosInvoiceCatalogPage
}

export async function loadBranchInvoiceCatalog(
  branchId: string | null,
  options: { force?: boolean } = {}
) {
  if (!branchId) {
    return []
  }

  if (options.force === true) {
    clearClientResource(getInvoiceCatalogCacheKey(branchId))
    return fetchBranchInvoiceCatalog(branchId, { cacheBust: true })
  }

  return loadClientResource(
    getInvoiceCatalogCacheKey(branchId),
    () => fetchBranchInvoiceCatalog(branchId),
    {
      ttlMs: INVOICE_CATALOG_CACHE_TTL_MS,
      logLabel: `fetch catalog (${branchId})`,
      protectedResource: true,
    }
  )
}

export async function loadBranchInvoiceCatalogPage(
  branchId: string | null,
  options: {
    page: number
    pageSize: number
    search?: string
    category?: string
    force?: boolean
  }
) {
  if (!branchId) {
    return {
      products: [],
      categories: [],
      total: 0,
      page: options.page,
      pageSize: options.pageSize,
    } satisfies PosInvoiceCatalogPage
  }

  const cacheKey = getInvoiceCatalogPageCacheKey({
    branchId,
    page: options.page,
    pageSize: options.pageSize,
    search: options.search,
    category: options.category,
  })

  if (options.force === true) {
    clearClientResource(cacheKey)
    return fetchBranchInvoiceCatalogPage(branchId, {
      ...options,
      cacheBust: true,
    })
  }

  return loadClientResource(
    cacheKey,
    () => fetchBranchInvoiceCatalogPage(branchId, options),
    {
      ttlMs: INVOICE_CATALOG_CACHE_TTL_MS,
      logLabel: `fetch catalog page (${branchId})`,
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
    getInvoiceCatalogPageCacheKey({
      branchId,
      page: 1,
      pageSize: 10,
      search: '',
      category: '',
    }),
    () =>
      fetchBranchInvoiceCatalogPage(branchId, {
        page: 1,
        pageSize: 10,
      }),
    {
      ttlMs: INVOICE_CATALOG_CACHE_TTL_MS,
      logLabel: `fetch catalog page (${branchId})`,
      protectedResource: true,
    }
  )
}

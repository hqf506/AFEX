'use client'

import Link from 'next/link'
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
import { useRouter } from 'next/navigation'
import { AdminBranchFilter } from '@/components/admin-branch-filter'
import { AdminButton } from '@/components/admin-button'
import { AdminInput } from '@/components/admin-input'
import { InvoiceCheckoutPanel } from '@/components/invoice-checkout-panel'
import { PageHero } from '@/components/page-hero'
import { PosStepIndicator } from '@/components/pos-step-indicator'
import { SummaryRow } from '@/components/summary-row'
import { useAdminBranchFilter } from '@/hooks/use-admin-branch-filter'
import {
  useInvoiceCheckout,
  type CheckoutVatSetting,
} from '@/hooks/use-invoice-checkout'
import { usePageAccess, type UsePageAccessOptions } from '@/hooks/use-page-access'
import { getRoleLabel } from '@/lib/app-roles'
import {
  createProtectedResourceAuthError,
  isProtectedResourceAuthError,
  loadClientResource,
  markProtectedResourcesUnauthorized,
  peekClientResource,
  prefetchClientResource,
} from '@/lib/client-resource-cache'
import {
  loadBranchInvoiceCatalog,
  peekBranchInvoiceCatalog,
  type PosInvoiceCatalogProduct,
} from '@/lib/invoices/catalog'
import {
  readActivePosEmployee,
  type ActivePosEmployee,
} from '@/lib/pos-employee-session'
import {
  INVOICE_CUSTOMER_STORAGE_KEY,
  parseStoredInvoiceCustomerDraft,
} from '@/lib/invoices/customer'
import {
  addInvoiceLineItem,
  buildInvoiceFilters,
  decreaseInvoiceLineItemQuantity,
  INVOICE_ALL_FILTER,
  increaseInvoiceLineItemQuantity,
  removeInvoiceLineItem,
  resolveInvoiceCatalogImageUrl,
  type InvoiceCatalogItem,
  type InvoiceLineItem,
} from '@/lib/invoices/items'
import {
  INVOICE_SALE_ITEMS_STORAGE_KEY,
  parseStoredInvoiceSaleItemsDraft,
  serializeInvoiceSaleItemsDraft,
} from '@/lib/invoices/sale-draft'
import { getPaymentMethodLabel } from '@/lib/invoices/payment-method'
import { formatCurrency } from '@/lib/orders/format'

const POS_HIDDEN_CATEGORY_FILTERS = new Set(['دون فئة'])
const ADMIN_CATEGORIES_CACHE_KEY = 'admin-categories'
const ADMIN_CATEGORIES_CACHE_TTL_MS = 60_000
const ADMIN_SYSTEM_SETTINGS_CACHE_KEY = 'admin-system-settings'
const ADMIN_SYSTEM_SETTINGS_CACHE_TTL_MS = 60_000
const ADMIN_DISCOUNTS_CACHE_TTL_MS = 30_000
const ADMIN_VAT_CACHE_TTL_MS = 30_000
type PosFeedbackKind = 'add' | 'remove' | 'error'
const SOUND_ENABLED = true
let posFeedbackAudioContext: AudioContext | null = null

function getPosFeedbackAudioContext() {
  if (typeof window === 'undefined') {
    return null
  }

  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext

  if (!AudioContextClass) {
    return null
  }

  if (!posFeedbackAudioContext) {
    posFeedbackAudioContext = new AudioContextClass()
  }

  return posFeedbackAudioContext
}

async function playFeedbackSound(kind: PosFeedbackKind) {
  if (typeof window === 'undefined' || !SOUND_ENABLED) {
    return
  }

  const audioContext = getPosFeedbackAudioContext()
  if (!audioContext) {
    return
  }

  const pattern =
    kind === 'add'
      ? [{ frequency: 880, duration: 0.07, gain: 0.07 }]
      : kind === 'remove'
        ? [{ frequency: 420, duration: 0.08, gain: 0.065 }]
        : [
            { frequency: 320, duration: 0.06, gain: 0.06 },
            { frequency: 240, duration: 0.075, gain: 0.06, delay: 0.05 },
          ]

  if (audioContext.state === 'suspended') {
    await audioContext.resume().catch(() => undefined)
  }

  const startAt = audioContext.currentTime

  for (const tone of pattern) {
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    const toneStart = startAt + (tone.delay ?? 0)

    oscillator.type = 'sine'
    oscillator.frequency.value = tone.frequency
    gainNode.gain.setValueAtTime(0.0001, toneStart)
    gainNode.gain.exponentialRampToValueAtTime(
      tone.gain ?? 0.06,
      toneStart + 0.008
    )
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      toneStart + tone.duration
    )

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    oscillator.start(toneStart)
    oscillator.stop(toneStart + tone.duration)
  }
}

function triggerHapticFeedback(kind: PosFeedbackKind) {
  if (typeof window === 'undefined') {
    return
  }

  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(
      kind === 'add' ? 35 : kind === 'remove' ? 45 : [70, 40, 90]
    )
  }
}

function triggerPosFeedback(kind: PosFeedbackKind) {
  triggerHapticFeedback(kind)
  void playFeedbackSound(kind)
}

type CategoryApiRecord = {
  id?: string
  name?: string
  is_active?: boolean
  used_count?: number
}

function getDiscountsCacheKey(branchId: string | null) {
  return `admin-discounts:${branchId || 'all'}`
}

function getVatCacheKey(branchId: string | null) {
  return `admin-vat:${branchId || 'all'}`
}

function handlePosProtectedResourceUnauthorized() {
  markProtectedResourcesUnauthorized()

  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/pos')) {
    window.location.href = '/pos/login'
  }
}

function getProductPosDisplayMode(product: unknown): 'style' | 'image' | undefined {
  const value = (product as { pos_display_mode?: unknown })?.pos_display_mode
  return value === 'image' || value === 'style' ? value : undefined
}

function getProductOptionalText(
  product: unknown,
  key: 'pos_color' | 'pos_shape'
) {
  const value = (product as Record<string, unknown>)?.[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function getNormalizedCatalogItemId(
  product: PosInvoiceCatalogProduct | (InvoiceCatalogItem & Partial<PosInvoiceCatalogProduct>)
) {
  return (
    (typeof product.catalog_item_id === 'string' &&
      product.catalog_item_id.trim()) ||
    (typeof product.item_id === 'string' && product.item_id.trim()) ||
    (typeof product.id === 'string' && product.id.trim()) ||
    ''
  )
}

function getInventoryTrackingState(
  product:
    | PosInvoiceCatalogProduct
    | (InvoiceCatalogItem & Partial<PosInvoiceCatalogProduct>)
) {
  const record = product as Record<string, unknown>
  const normalizedType = record.item_type ?? product.type ?? 'service'
  const normalizedQuantity = Number(record.quantity_on_hand ?? 0)
  const isComposite = product.is_composite === true
  const isInventoryTracked =
    product.track_inventory === true &&
    (normalizedType === 'product' || isComposite)
  const safeNormalizedQuantity =
    isInventoryTracked && Number.isFinite(normalizedQuantity)
      ? normalizedQuantity
      : 0
  const normalizedLowStockThreshold = Number(record.low_stock_threshold ?? 0)
  const lowStockThreshold =
    isInventoryTracked && Number.isFinite(normalizedLowStockThreshold)
      ? normalizedLowStockThreshold
      : 0
  const isOutOfStock = isInventoryTracked && safeNormalizedQuantity <= 0

  return {
    normalizedType: normalizedType === 'product' ? 'product' : 'service',
    isComposite,
    isInventoryTracked,
    normalizedQuantity: safeNormalizedQuantity,
    lowStockThreshold,
    isOutOfStock,
  }
}

function isStockTrackedProduct(
  product:
    | PosInvoiceCatalogProduct
    | (InvoiceCatalogItem & Partial<PosInvoiceCatalogProduct>)
) {
  return getInventoryTrackingState(product).isInventoryTracked
}

function isProductOutOfStock(
  product:
    | PosInvoiceCatalogProduct
    | (InvoiceCatalogItem & Partial<PosInvoiceCatalogProduct>)
) {
  const inventoryState = getInventoryTrackingState(product)

  return inventoryState.isOutOfStock
}

function isProductLowStock(
  product:
    | PosInvoiceCatalogProduct
    | (InvoiceCatalogItem & Partial<PosInvoiceCatalogProduct>)
) {
  const inventoryState = getInventoryTrackingState(product)

  return (
    inventoryState.isInventoryTracked &&
    inventoryState.lowStockThreshold > 0 &&
    inventoryState.normalizedQuantity <= inventoryState.lowStockThreshold
  )
}

function formatStockNumber(value: number) {
  return new Intl.NumberFormat('ar-SA', {
    maximumFractionDigits: 2,
  }).format(value)
}

function ProductStockIndicator({
  product,
  variant,
}: {
  product: PosInvoiceCatalogProduct
  variant: 'compact' | 'card'
}) {
  if (!isStockTrackedProduct(product)) {
    return null
  }

  const { isOutOfStock, normalizedQuantity } = getInventoryTrackingState(product)
  const lowStock = isProductLowStock(product)
  const baseClass =
    variant === 'compact'
      ? 'mt-1 inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-bold'
      : 'mt-3 inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold'
  const toneClass = isOutOfStock
    ? 'bg-red-50 text-red-700'
    : lowStock
      ? 'bg-amber-50 text-amber-700'
      : 'bg-emerald-50 text-emerald-700'

  return (
    <span className={`${baseClass} ${toneClass}`}>
      المخزون: {formatStockNumber(normalizedQuantity)}
      {isOutOfStock ? ' · غير متوفر' : lowStock ? ' · منخفض' : ''}
    </span>
  )
}

type InvoiceItemsStepProps = {
  heroTitle: string
  heroSubtitle: string
  heroDescription: string
  primaryBackHref: string
  primaryBackLabel: string
  secondaryBackHref: string
  secondaryBackLabel: string
  customerStepHref: string
  originBadgeLabel: string
  checkoutMode?: 'embedded' | 'separate'
  checkoutHref?: string
  showPosStepIndicator?: boolean
  variant?: 'default' | 'pos'
}

export function InvoiceItemsStep({
  heroTitle,
  heroSubtitle,
  heroDescription,
  primaryBackHref,
  primaryBackLabel,
  secondaryBackHref,
  secondaryBackLabel,
  customerStepHref,
  originBadgeLabel,
  checkoutMode = 'embedded',
  checkoutHref = '/pos/sale/checkout',
  showPosStepIndicator = false,
  variant = 'default',
}: InvoiceItemsStepProps) {
  const router = useRouter()
  const pageAccessOptions: UsePageAccessOptions =
    variant === 'pos'
      ? {
          allowedRoles: ['admin', 'employee'],
          redirectIfNoUser: '/pos/login',
          redirectIfForbidden: '/pos/login',
        }
      : {
          allowedRoles: ['admin', 'employee', 'cashier'],
        }

  const access = usePageAccess(pageAccessOptions)
  const authLoading = access.loading
  const authError = access.authError
  const allowed = access.allowed
  const branchId = access.branchId
  const tenantId = access.tenantId
  const scopeType = access.scopeType
  const roleLabel = getRoleLabel(access.userRole)
  const {
    isSystemAdmin,
    branches,
    loadingBranches,
    selectedBranchId,
    selectedBranchName,
    effectiveBranchId,
    setSelectedBranchId,
  } = useAdminBranchFilter(scopeType, branchId, allowed, tenantId)
  const [activePosEmployee] = useState<ActivePosEmployee | null>(() =>
    variant === 'pos' ? readActivePosEmployee() : null
  )
  const posEmployeeBranchId =
    variant === 'pos' ? activePosEmployee?.branch_id || null : null
  const invoiceBranchId = posEmployeeBranchId || effectiveBranchId
  const invoiceBranchName = useMemo(() => {
    const branchName =
      branches.find((branch) => branch.id === invoiceBranchId)?.name || ''

    if (branchName) {
      return branchName
    }

    if (posEmployeeBranchId) {
      return 'فرع نقطة البيع'
    }

    if (invoiceBranchId) {
      return selectedBranchName
    }

    return 'لم يتم اختيار فرع'
  }, [branches, invoiceBranchId, posEmployeeBranchId, selectedBranchName])
  const hasInvalidBranchContext =
    scopeType === 'branch' && !branchId && !posEmployeeBranchId
  const hasAmbiguousAdminBranchContext = isSystemAdmin && !invoiceBranchId
  const hasUnavailablePosBranchContext =
    hasInvalidBranchContext || hasAmbiguousAdminBranchContext

  const [ready, setReady] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState(INVOICE_ALL_FILTER)
  const [invoiceItems, setInvoiceLineItems] = useState<InvoiceLineItem[]>([])
  const [catalogProducts, setCatalogProducts] = useState<PosInvoiceCatalogProduct[]>([])
  const [catalogCategoryFilters, setCatalogCategoryFilters] = useState<string[]>(() => {
    const cachedCategories =
      peekClientResource<CategoryApiRecord[]>(ADMIN_CATEGORIES_CACHE_KEY) || []

    return cachedCategories
      .map((category) =>
        typeof category?.name === 'string' ? category.name.trim() : ''
      )
      .filter(
        (categoryName): categoryName is string =>
          Boolean(categoryName) && !POS_HIDDEN_CATEGORY_FILTERS.has(categoryName)
      )
  })
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogRefreshing, setCatalogRefreshing] = useState(false)
  const [catalogError, setCatalogError] = useState(false)
  const [showItemsModal, setShowItemsModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [hydratedSaleDraft, setHydratedSaleDraft] = useState(false)
  const [currentCatalogPage, setCurrentCatalogPage] = useState(1)
  const [vatSetting, setVatSetting] = useState<CheckoutVatSetting | null>(null)
  const [recentlyAddedItemId, setRecentlyAddedItemId] = useState<string | null>(null)
  const [pressedItemId, setPressedItemId] = useState<string | null>(null)
  const [stockErrorMessage, setStockErrorMessage] = useState('')
  const deferredSearch = useDeferredValue(search)

  useEffect(() => {
    if (!allowed) return

    let cancelled = false

    const loadCategoryFilters = async () => {
      try {
        const cachedCategories =
          peekClientResource<CategoryApiRecord[]>(ADMIN_CATEGORIES_CACHE_KEY) || []

        if (!cancelled && cachedCategories.length > 0) {
          setCatalogCategoryFilters(
            cachedCategories
              .map((category) =>
                typeof category?.name === 'string' ? category.name.trim() : ''
              )
              .filter(
                (categoryName): categoryName is string =>
                  Boolean(categoryName) &&
                  !POS_HIDDEN_CATEGORY_FILTERS.has(categoryName)
              )
          )
        }

        const nextCategories = await loadClientResource<CategoryApiRecord[]>(
          ADMIN_CATEGORIES_CACHE_KEY,
          async () => {
            const response = await fetch('/api/admin/categories', {
              method: 'GET',
              cache: 'no-store',
            })

            if (response.status === 401) {
              markProtectedResourcesUnauthorized()
              throw createProtectedResourceAuthError()
            }

            const result = await response.json().catch(() => null)

            if (!response.ok || !result) {
              throw new Error(
                result?.details || result?.error || 'Failed to load categories'
              )
            }

            return Array.isArray(result.categories) ? result.categories : []
          },
          {
            ttlMs: ADMIN_CATEGORIES_CACHE_TTL_MS,
            logLabel: 'fetch categories',
            protectedResource: true,
          }
        )

        if (!cancelled) {
          const nextFilters = nextCategories
            .map((category) =>
              typeof category?.name === 'string' ? category.name.trim() : ''
            )
            .filter(
              (categoryName): categoryName is string =>
                Boolean(categoryName) && !POS_HIDDEN_CATEGORY_FILTERS.has(categoryName)
            )

          setCatalogCategoryFilters(nextFilters)
        }
      } catch (error) {
        if (!cancelled && isProtectedResourceAuthError(error)) {
          handlePosProtectedResourceUnauthorized()
          return
        }

        if (!cancelled) {
          setCatalogCategoryFilters([])
        }
      }
    }

    void loadCategoryFilters()

    return () => {
      cancelled = true
    }
  }, [allowed])

  useEffect(() => {
    if (!allowed) return

    const parsed = parseStoredInvoiceCustomerDraft(
      localStorage.getItem(INVOICE_CUSTOMER_STORAGE_KEY)
    )
    const parsedSaleItemsDraft = parseStoredInvoiceSaleItemsDraft(
      localStorage.getItem(INVOICE_SALE_ITEMS_STORAGE_KEY)
    )

    if (!parsed) {
      router.replace(customerStepHref)
      return
    }

    window.setTimeout(() => {
      setCustomerName(parsed.name)
      setCustomerPhone(parsed.phone)
      setInvoiceLineItems(parsedSaleItemsDraft?.items ?? [])
      setHydratedSaleDraft(true)
      setReady(true)
    }, 0)
  }, [allowed, customerStepHref, router])

  useEffect(() => {
    if (!allowed || !ready) return

    if (hasUnavailablePosBranchContext) {
      return
    }

    let cancelled = false

    const loadCatalog = async () => {
      try {
        const cachedProducts =
          variant === 'pos' ? [] : peekBranchInvoiceCatalog(invoiceBranchId)

        if (!cancelled && cachedProducts.length > 0) {
          setCatalogProducts(cachedProducts)
          setCatalogError(false)
          setCatalogLoading(false)
          setCatalogRefreshing(true)
        }

        if (!cancelled) {
          setCatalogLoading(cachedProducts.length === 0)
          setCatalogError(false)
        }

        const nextProducts = await loadBranchInvoiceCatalog(invoiceBranchId, {
          force: true,
        })

        if (!cancelled) {
          setCatalogProducts(nextProducts)
          setCatalogError(false)
          setCatalogLoading(false)
          setCatalogRefreshing(false)
        }
      } catch (error) {
        if (!cancelled && isProtectedResourceAuthError(error)) {
          handlePosProtectedResourceUnauthorized()
          return
        }

        if (!cancelled) {
          setCatalogError(true)
          setCatalogProducts([])
          setCatalogLoading(false)
          setCatalogRefreshing(false)
          triggerPosFeedback('error')
        }
      }
    }

    void loadCatalog()

    return () => {
      cancelled = true
    }
  }, [allowed, ready, invoiceBranchId, hasUnavailablePosBranchContext, variant])

  const visibleCatalogProducts = useMemo(() => {
    if (hasUnavailablePosBranchContext) {
      return []
    }

    return catalogProducts
  }, [catalogProducts, hasUnavailablePosBranchContext])

  const invoiceFilters = useMemo(() => {
    return buildInvoiceFilters(catalogCategoryFilters, visibleCatalogProducts)
  }, [catalogCategoryFilters, visibleCatalogProducts])

  useEffect(() => {
    if (!invoiceFilters.includes(activeFilter)) {
      const timeoutId = window.setTimeout(() => {
        setActiveFilter(INVOICE_ALL_FILTER)
      }, 0)

      return () => window.clearTimeout(timeoutId)
    }
  }, [activeFilter, invoiceFilters])

  const filteredProducts = useMemo(() => {
    if (process.env.NODE_ENV === 'development') {
      console.time('filter invoice items')
    }

    const normalizedSearch = deferredSearch.trim()

    const nextFilteredProducts = visibleCatalogProducts.filter((product) => {
      const matchesFilter =
        activeFilter === INVOICE_ALL_FILTER ||
        product.category === activeFilter

      const matchesSearch =
        normalizedSearch === '' ||
        product.name.includes(normalizedSearch) ||
        product.category.includes(normalizedSearch)

      return matchesFilter && matchesSearch
    })

    if (process.env.NODE_ENV === 'development') {
      console.timeEnd('filter invoice items')
    }

    return nextFilteredProducts
  }, [visibleCatalogProducts, activeFilter, deferredSearch])

  const catalogItemsPerPage = 10
  const totalCatalogPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / catalogItemsPerPage)
  )
  const effectiveCatalogPage = Math.min(currentCatalogPage, totalCatalogPages)
  const paginatedProducts = useMemo(() => {
    const startIndex = (effectiveCatalogPage - 1) * catalogItemsPerPage
    return filteredProducts.slice(startIndex, startIndex + catalogItemsPerPage)
  }, [effectiveCatalogPage, filteredProducts])
  const visibleCatalogPages = useMemo(() => {
    if (totalCatalogPages <= 6) {
      return Array.from({ length: totalCatalogPages }, (_, index) => index + 1)
    }

    const pages = new Set<number>([1, totalCatalogPages, effectiveCatalogPage])
    pages.add(Math.max(1, effectiveCatalogPage - 1))
    pages.add(Math.min(totalCatalogPages, effectiveCatalogPage + 1))
    pages.add(2)

    return Array.from(pages)
      .filter((page) => page >= 1 && page <= totalCatalogPages)
      .sort((left, right) => left - right)
  }, [effectiveCatalogPage, totalCatalogPages])

  const canRenderCatalogImmediately = visibleCatalogProducts.length > 0

  useEffect(() => {
    if (!ready || !hydratedSaleDraft) return
    if (catalogLoading) return
    if (hasUnavailablePosBranchContext) return

    const validCatalogItemIds = new Set(
      catalogProducts
        .map((item) => (typeof item.id === 'string' ? item.id.trim() : ''))
        .filter(Boolean)
    )

    const timeoutId = window.setTimeout(() => {
      setInvoiceLineItems((prev) =>
        prev.filter(
          (item) =>
            typeof item.item_id === 'string' &&
            item.item_id.trim() !== '' &&
            validCatalogItemIds.has(item.item_id.trim())
        )
      )
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [
    ready,
    hydratedSaleDraft,
    catalogLoading,
    hasUnavailablePosBranchContext,
    catalogProducts,
  ])

  const subtotal = useMemo(() => {
    return invoiceItems.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0
    )
  }, [invoiceItems])

  const invoiceItemCount = useMemo(() => {
    return invoiceItems.reduce((total, item) => total + item.quantity, 0)
  }, [invoiceItems])

  const visibleItems = useMemo(() => invoiceItems.slice(0, 2), [invoiceItems])
  const invoiceItemQuantities = useMemo(() => {
    const quantitiesById = new Map<string, number>()
    const quantitiesByName = new Map<string, number>()

    for (const item of invoiceItems) {
      if (item.item_id?.trim()) {
        quantitiesById.set(item.item_id.trim(), item.quantity)
      }

      quantitiesByName.set(item.item_name, item.quantity)
    }

    return {
      byId: quantitiesById,
      byName: quantitiesByName,
    }
  }, [invoiceItems])

  useEffect(() => {
    if (!recentlyAddedItemId) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setRecentlyAddedItemId(null)
    }, 150)

    return () => window.clearTimeout(timeoutId)
  }, [recentlyAddedItemId])

  useEffect(() => {
    if (!pressedItemId) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setPressedItemId(null)
    }, 100)

    return () => window.clearTimeout(timeoutId)
  }, [pressedItemId])

  useEffect(() => {
    if (!allowed) {
      return
    }

    let cancelled = false

    async function loadVatSetting() {
      try {
        const vatCacheKey = getVatCacheKey(invoiceBranchId)
        const cachedSetting =
          peekClientResource<CheckoutVatSetting | null>(vatCacheKey) || null

        if (!cancelled && cachedSetting) {
          setVatSetting(cachedSetting)
        }

        const searchParams = new URLSearchParams()
        if (invoiceBranchId) {
          searchParams.set('branchId', invoiceBranchId)
        }

        const nextSetting = await loadClientResource(
          vatCacheKey,
          async () => {
            const response = await fetch(
              `/api/admin/vat${searchParams.toString() ? `?${searchParams.toString()}` : ''}`,
              {
                method: 'GET',
                cache: 'no-store',
              }
            )

            if (response.status === 401) {
              markProtectedResourcesUnauthorized()
              throw createProtectedResourceAuthError()
            }

            const result = await response.json().catch(() => null)

            if (!response.ok || !result?.success) {
              throw new Error(
                result?.details || result?.error || 'تعذر تحميل إعدادات الضريبة'
              )
            }

            return (result.setting as CheckoutVatSetting | null) || null
          },
          {
            ttlMs: ADMIN_VAT_CACHE_TTL_MS,
            logLabel: `fetch vat (${invoiceBranchId || 'all'})`,
            protectedResource: true,
          }
        )

        if (!cancelled) {
          setVatSetting(nextSetting)
        }
      } catch (error) {
        if (!cancelled && isProtectedResourceAuthError(error)) {
          handlePosProtectedResourceUnauthorized()
          return
        }

        if (!cancelled) {
          setVatSetting(null)
        }
      }
    }

    void loadVatSetting()

    return () => {
      cancelled = true
    }
  }, [allowed, invoiceBranchId])

  useEffect(() => {
    if (!allowed || !ready || hasUnavailablePosBranchContext) {
      return
    }

    router.prefetch(checkoutHref)

    void prefetchClientResource(
      getDiscountsCacheKey(invoiceBranchId),
      async () => {
        const searchParams = new URLSearchParams()
        if (invoiceBranchId) {
          searchParams.set('branchId', invoiceBranchId)
        }

        const response = await fetch(
          `/api/admin/discounts${
            searchParams.toString() ? `?${searchParams.toString()}` : ''
          }`,
          {
            method: 'GET',
            cache: 'no-store',
          }
        )

        if (response.status === 401) {
          markProtectedResourcesUnauthorized()
          throw createProtectedResourceAuthError()
        }

        const result = await response.json().catch(() => null)

        if (!response.ok || !result?.success) {
          throw new Error(result?.details || result?.error || 'تعذر تحميل الخصومات')
        }

        return Array.isArray(result.discounts) ? result.discounts : []
      },
      {
        ttlMs: ADMIN_DISCOUNTS_CACHE_TTL_MS,
        logLabel: `fetch discounts (${invoiceBranchId || 'all'})`,
        protectedResource: true,
      }
    )

    void prefetchClientResource(
      getVatCacheKey(invoiceBranchId),
      async () => {
        const searchParams = new URLSearchParams()
        if (invoiceBranchId) {
          searchParams.set('branchId', invoiceBranchId)
        }

        const response = await fetch(
          `/api/admin/vat${
            searchParams.toString() ? `?${searchParams.toString()}` : ''
          }`,
          {
            method: 'GET',
            cache: 'no-store',
          }
        )

        if (response.status === 401) {
          markProtectedResourcesUnauthorized()
          throw createProtectedResourceAuthError()
        }

        const result = await response.json().catch(() => null)

        if (!response.ok || !result?.success) {
          throw new Error(
            result?.details || result?.error || 'تعذر تحميل إعدادات الضريبة'
          )
        }

        return (result.setting as CheckoutVatSetting | null) || null
      },
      {
        ttlMs: ADMIN_VAT_CACHE_TTL_MS,
        logLabel: `fetch vat (${invoiceBranchId || 'all'})`,
        protectedResource: true,
      }
    )

    void prefetchClientResource(
      ADMIN_SYSTEM_SETTINGS_CACHE_KEY,
      async () => {
        const response = await fetch('/api/admin/system-settings', {
          method: 'GET',
          credentials: 'include',
        })

        if (response.status === 401) {
          markProtectedResourcesUnauthorized()
          throw createProtectedResourceAuthError()
        }

        const result = await response.json().catch(() => null)

        if (!response.ok || !result?.success) {
          throw new Error(result?.error || 'فشل تحميل إعدادات النظام')
        }

        return result.settings || null
      },
      {
        ttlMs: ADMIN_SYSTEM_SETTINGS_CACHE_TTL_MS,
        logLabel: 'fetch system settings',
        protectedResource: true,
      }
    )
  }, [allowed, checkoutHref, invoiceBranchId, hasUnavailablePosBranchContext, ready, router])

  const checkout = useInvoiceCheckout({
    customerName,
    customerPhone,
    invoiceItems,
    hasInvalidBranchContext,
    hasAmbiguousAdminBranchContext,
    branchId: invoiceBranchId,
    vatSetting,
  })

  const addItem = (
    product: PosInvoiceCatalogProduct | (InvoiceCatalogItem & Partial<PosInvoiceCatalogProduct>)
  ) => {
    const normalizedCatalogItemId = getNormalizedCatalogItemId(product)

    if (!normalizedCatalogItemId) {
      triggerPosFeedback('error')
      return
    }

    if (isProductOutOfStock(product)) {
      setStockErrorMessage('المخزون غير متوفر لهذا المنتج')
      triggerPosFeedback('error')
      return
    }

    if (isStockTrackedProduct(product)) {
      const { normalizedQuantity } = getInventoryTrackingState(product)
      const productCartQuantity =
        invoiceItemQuantities.byId.get(normalizedCatalogItemId) ??
        invoiceItemQuantities.byName.get(product.name) ??
        0

      if (productCartQuantity + 1 > normalizedQuantity) {
        setStockErrorMessage('الكمية المطلوبة أكبر من المخزون المتاح')
        triggerPosFeedback('error')
        return
      }
    }

    setInvoiceLineItems((prev) =>
      addInvoiceLineItem(prev, {
        ...product,
        id: normalizedCatalogItemId,
      })
    )
    setStockErrorMessage('')
    setRecentlyAddedItemId(normalizedCatalogItemId)
    triggerPosFeedback('add')
  }

  const addItemWithFeedback = (
    product: PosInvoiceCatalogProduct | (InvoiceCatalogItem & Partial<PosInvoiceCatalogProduct>)
  ) => {
    const normalizedCatalogItemId = getNormalizedCatalogItemId(product)

    if (!normalizedCatalogItemId) {
      return
    }

    setPressedItemId(normalizedCatalogItemId)
    addItem(product)
  }

  const increaseQty = (item: InvoiceLineItem) => {
    const product = catalogProducts.find((catalogProduct) => {
      const catalogItemId = getNormalizedCatalogItemId(catalogProduct)

      return (
        (item.item_id && catalogItemId === item.item_id) ||
        catalogProduct.name === item.item_name
      )
    })

    if (product && isStockTrackedProduct(product)) {
      const { normalizedQuantity } = getInventoryTrackingState(product)

      if (item.quantity + 1 > normalizedQuantity) {
        setStockErrorMessage('الكمية المطلوبة أكبر من المخزون المتاح')
        triggerPosFeedback('error')
        return
      }
    }

    setStockErrorMessage('')
    setInvoiceLineItems((prev) =>
      increaseInvoiceLineItemQuantity(prev, item.item_name)
    )
  }

  const decreaseQty = (itemName: string) => {
    setInvoiceLineItems((prev) => decreaseInvoiceLineItemQuantity(prev, itemName))
  }

  const decreaseOrRemoveItem = (itemName: string, currentQuantity: number) => {
    if (currentQuantity <= 1) {
      removeItem(itemName)
      return
    }

    decreaseQty(itemName)
  }

  const removeItem = (itemName: string) => {
    setInvoiceLineItems((prev) => removeInvoiceLineItem(prev, itemName))
    triggerPosFeedback('remove')
  }

  const clearInvoice = () => {
    setInvoiceLineItems([])
    checkout.clearCheckout()
  }

  useEffect(() => {
    if (!ready || !hydratedSaleDraft || checkoutMode !== 'separate') return

    if (invoiceItems.length === 0) {
      localStorage.removeItem(INVOICE_SALE_ITEMS_STORAGE_KEY)
      return
    }

    localStorage.setItem(
      INVOICE_SALE_ITEMS_STORAGE_KEY,
      serializeInvoiceSaleItemsDraft({ items: invoiceItems })
    )
  }, [checkoutMode, hydratedSaleDraft, invoiceItems, ready])

  if (authError === 'timeout' && variant === 'pos') {
    return (
      <div className="page-card space-y-4 text-right">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">تعذر تجهيز نقطة البيع</h2>
          <p className="mt-1 text-sm text-slate-600">تحقق من تسجيل الدخول أو أعد المحاولة</p>
        </div>
        <button
          type="button"
          onClick={() => {
            window.location.href = '/pos/login'
          }}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          تسجيل الدخول
        </button>
      </div>
    )
  }

  if (authLoading || !allowed || !ready) {
    return <div className="page-card">جاري التحميل...</div>
  }

  if (variant === 'pos') {
    return (
      <>
        {hasInvalidBranchContext ? (
          <div className="error-alert">
            لا يمكن استخدام شاشة الفاتورة لأن حسابك غير مرتبط بفرع صالح
          </div>
        ) : null}
        {hasAmbiguousAdminBranchContext ? (
          <div className="error-alert">
            اختر فرعًا محددًا من القائمة قبل إنشاء فاتورة جديدة
          </div>
        ) : null}
        {stockErrorMessage ? (
          <div className="error-alert">
            {stockErrorMessage}
          </div>
        ) : null}

        <div className="flex h-full w-full min-h-0 min-w-0 flex-col overflow-x-hidden bg-slate-50 p-2 pb-24 md:p-3 md:pb-28 lg:p-4 xl:pb-4">
          <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm lg:grid lg:[direction:ltr] lg:grid-cols-[1fr_340px]">
            <main className="order-2 min-w-0 flex-1 space-y-3 p-3 md:p-4 lg:order-1 lg:flex lg:min-h-0 lg:flex-col lg:gap-3 lg:space-y-0 lg:overflow-hidden lg:[direction:rtl]">
              <div className="flex flex-col-reverse items-start justify-between gap-3 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 text-right">
                  <h2 className="text-xl font-black text-slate-950 md:text-2xl">العناصر</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    أضف الخدمات أو المنتجات إلى الفاتورة.
                  </p>
                  <div className="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-700">
                    الفرع: {invoiceBranchName}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#020617] text-white shadow-sm">
                    <BoxIcon />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-100 bg-white p-3">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="relative">
                      <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={search}
                        onChange={(event) => {
                          setSearch(event.target.value)
                          setCurrentCatalogPage(1)
                        }}
                        placeholder="ابحث عن منتج أو خدمة"
                        className="h-12 min-h-[48px] w-full rounded-xl border border-slate-200 pr-3 pl-12 text-right text-base text-slate-700 outline-none transition focus:ring-2 focus:ring-slate-200 touch-manipulation"
                        inputMode="search"
                      />
                    </div>

                    {catalogRefreshing || (catalogLoading && canRenderCatalogImmediately) ? (
                      <p className="text-xs text-slate-400">تحديث...</p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {invoiceFilters.map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => {
                          setActiveFilter(filter)
                          setCurrentCatalogPage(1)
                        }}
                        className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-bold transition touch-manipulation ${
                          activeFilter === filter
                            ? 'bg-[#020617] text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <section className="w-full rounded-xl border border-slate-100 bg-white p-3 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden">
                {hasAmbiguousAdminBranchContext ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-10 text-center text-sm text-amber-800">
                    اختر فرعًا محددًا أولًا حتى يتم تحميل كتالوج الفرع الصحيح للفاتورة.
                  </div>
                ) : catalogLoading && !canRenderCatalogImmediately ? (
                  <div className="rounded-xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    جاري تحميل العناصر...
                  </div>
                ) : catalogError && filteredProducts.length === 0 ? (
                  <div className="rounded-xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    تعذر تحميل العناصر، حاول تحديث الصفحة
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="rounded-xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    لا توجد منتجات أو خدمات متاحة لهذا الفرع.
                  </div>
                ) : (
                  <div className="min-w-0 space-y-3 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden">
                  <div
                    dir="rtl"
                    className="grid w-full min-w-0 grid-cols-1 justify-start justify-items-start gap-2 pb-4 sm:grid-cols-2 lg:min-h-0 lg:flex-1 lg:content-start lg:overflow-y-auto lg:overflow-x-hidden lg:overscroll-contain lg:pr-1 lg:touch-pan-y lg:grid-cols-2"
                  >
                    {paginatedProducts.map((product) => {
                      const normalizedCatalogItemId =
                        getNormalizedCatalogItemId(product)
                      const inventoryState = getInventoryTrackingState(product)
                      const productOutOfStock = inventoryState.isOutOfStock

                      return (
                      <div
                        key={product.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => addItemWithFeedback(product)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            addItemWithFeedback(product)
                          }
                        }}
                        className={`flex min-h-[112px] w-full min-w-0 max-w-none cursor-pointer items-center gap-2.5 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-all duration-100 ease-out [direction:rtl] hover:border-slate-300 hover:shadow-sm active:scale-[0.99] ${
                          productOutOfStock ? 'opacity-70' : ''
                        } ${
                          pressedItemId === normalizedCatalogItemId
                            ? 'scale-95'
                            : 'scale-100'
                        } ${
                          recentlyAddedItemId === normalizedCatalogItemId
                            ? 'border-slate-300 ring-2 ring-[#020617]/25'
                            : ''
                        }`}
                      >
                        {(() => {
                          const productCartQuantity =
                            invoiceItemQuantities.byId.get(
                              normalizedCatalogItemId
                            ) ??
                            invoiceItemQuantities.byName.get(product.name) ??
                            0
                          const reachedStockLimit =
                            inventoryState.isInventoryTracked &&
                            productCartQuantity >= inventoryState.normalizedQuantity

                          return (
                            <>
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                          <PosCatalogItemImage
                            key={product.image_url || product.id}
                            imageUrl={product.image_url}
                            posDisplayMode={getProductPosDisplayMode(product)}
                            posColor={getProductOptionalText(product, 'pos_color')}
                            posShape={getProductOptionalText(product, 'pos_shape')}
                            name={product.name}
                            type={product.type}
                            frameClassName="h-16 w-16 rounded-xl"
                          />
                        </div>

                        <div className="flex min-w-0 flex-1 flex-col justify-center text-right">
                          <h3 className="truncate text-sm font-extrabold text-slate-950">
                            {product.name}
                          </h3>
                          <p className="mt-0.5 truncate text-xs text-slate-400">
                            {product.category}
                          </p>
                          <p className="mt-2 text-lg font-black leading-none text-slate-950">
                            {formatCurrency(product.price)}
                          </p>
                          <ProductStockIndicator
                            product={product}
                            variant="compact"
                          />
                          {recentlyAddedItemId === normalizedCatalogItemId ? (
                            <span className="mt-1 inline-flex w-fit rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              تمت الإضافة
                            </span>
                          ) : null}
                        </div>

                        <div className="shrink-0">
                        {productCartQuantity > 0 ? (
                          <div className="flex items-center justify-center gap-1 rounded-xl bg-slate-100 p-1">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                decreaseOrRemoveItem(product.name, productCartQuantity)
                              }}
                              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-black text-slate-900 transition hover:bg-slate-50 active:scale-95 touch-manipulation"
                              aria-label={`تقليل ${product.name}`}
                            >
                              -
                            </button>
                            <div className="w-7 text-center text-sm font-bold text-slate-950">
                              {productCartQuantity}
                            </div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                addItemWithFeedback(product)
                              }}
                              className={`flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-black text-slate-900 transition-all duration-100 ease-out hover:bg-slate-50 touch-manipulation ${
                                pressedItemId === normalizedCatalogItemId
                                  ? 'scale-95'
                                  : 'scale-100'
                              } ${reachedStockLimit ? 'opacity-50' : ''}`}
                              aria-disabled={reachedStockLimit}
                              aria-label={`زيادة ${product.name}`}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              addItemWithFeedback(product)
                            }}
                            className={`flex h-10 w-10 touch-manipulation items-center justify-center rounded-xl bg-slate-950 text-base font-black text-white transition-all duration-100 ease-out hover:bg-slate-800 ${
                              pressedItemId === normalizedCatalogItemId
                                ? 'scale-95'
                                : 'scale-100'
                            } ${productOutOfStock ? 'opacity-50' : ''}`}
                            aria-disabled={productOutOfStock}
                            aria-label={`إضافة ${product.name}`}
                          >
                            +
                          </button>
                        )}
                        </div>
                            </>
                          )
                        })()}
                      </div>
                      )
                    })}
                  </div>
                  {totalCatalogPages > 1 ? (
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentCatalogPage((current) => Math.max(1, current - 1))
                        }
                          disabled={effectiveCatalogPage === 1}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        السابق
                      </button>

                      {visibleCatalogPages.map((pageNumber, index) => {
                        const previousPage = visibleCatalogPages[index - 1]
                        const shouldRenderEllipsis =
                          typeof previousPage === 'number' &&
                          pageNumber - previousPage > 1

                        return (
                          <div key={pageNumber} className="flex items-center gap-2">
                            {shouldRenderEllipsis ? (
                              <span className="px-1 text-sm text-slate-400">...</span>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setCurrentCatalogPage(pageNumber)}
                              className={`min-w-9 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                                  effectiveCatalogPage === pageNumber
                                  ? 'bg-[#020617] text-white'
                                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {pageNumber}
                            </button>
                          </div>
                        )
                      })}

                      <button
                        type="button"
                        onClick={() =>
                          setCurrentCatalogPage((current) =>
                            Math.min(totalCatalogPages, current + 1)
                          )
                        }
                          disabled={effectiveCatalogPage === totalCatalogPages}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        التالي
                      </button>
                    </div>
                  ) : null}
                  </div>
                )}
              </section>
            </main>

            <aside className="order-1 flex min-w-0 flex-col gap-3 border-b border-slate-100 bg-white p-4 shadow-sm lg:order-2 lg:h-full lg:w-[340px] lg:flex-none lg:border-b-0 lg:border-l lg:border-slate-200 lg:bg-slate-50 lg:[direction:rtl]">
              <div>
                <p className="text-xs font-bold tracking-[0.18em] text-slate-400">
                  AFEX POS
                </p>
                <h1 className="mt-1 text-xl font-black text-slate-950">
                  AFEX POS
                </h1>
                <div className="mt-3 space-y-2">
                  {isSystemAdmin && !posEmployeeBranchId ? (
                    <AdminBranchFilter
                      branches={branches}
                      selectedBranchId={selectedBranchId}
                      loading={loadingBranches}
                      onChange={setSelectedBranchId}
                      allLabel="اختر فرعًا للفاتورة"
                    />
                  ) : null}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">
                    الفرع: {invoiceBranchName}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <PosSidebarLink icon={<HomeIcon />} label="الرئيسية" href="/pos" />
                <PosSidebarLink
                  icon={<UserIcon />}
                  label="بيانات العميل"
                  href={customerStepHref}
                />
                <PosSidebarLink
                  icon={<BoxIcon />}
                  label="العناصر"
                  href="/pos/sale/items"
                  active
                />
                <PosSidebarLink
                  icon={<WalletIcon />}
                  label="الدفع"
                  href="/pos/sale/checkout"
                  disabled={invoiceItems.length === 0}
                />
                <PosSidebarButton icon={<NoteIcon />} label="الملاحظات" />
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
                <h3 className="text-sm font-extrabold text-slate-950">ملخص الفاتورة</h3>

                <div className="mt-3 space-y-3 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
                    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs font-bold text-slate-400">العميل</p>
                      <p className="mt-2 break-words text-sm font-black text-slate-950">
                        {customerName || 'بدون اسم'}
                      </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {customerPhone || 'بدون رقم جوال'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h4 className="text-sm font-extrabold text-slate-950">
                        العناصر المضافة
                      </h4>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                        {invoiceItems.length}
                      </span>
                    </div>

                    {invoiceItems.length === 0 ? (
                      <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                        لم يتم إضافة أي عنصر بعد
                      </div>
                    ) : (
                      <>
                          <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1 lg:min-h-0 lg:flex-1">
                          {visibleItems.map((item) => (
                            <div
                              key={item.item_name}
                              className="flex items-center justify-between border-b border-slate-200 py-2.5"
                            >
                              <div className="min-w-0 text-right">
                                <p className="truncate text-sm font-bold text-slate-900">
                                  {item.item_name}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {formatCurrency(item.unit_price)} • الكمية: {item.quantity}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => removeItem(item.item_name)}
                                className="flex h-10 w-10 flex-none touch-manipulation items-center justify-center rounded-md text-red-500 transition hover:bg-red-50"
                                aria-label={`حذف ${item.item_name}`}
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          ))}
                        </div>

                        {invoiceItems.length > 2 ? (
                          <button
                            type="button"
                            onClick={() => setShowItemsModal(true)}
                            className="mt-2 text-xs text-slate-500 transition hover:text-black"
                          >
                            عرض {invoiceItems.length - 2} عناصر أخرى
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="space-y-3">
                      <PosInvoiceMetric
                        label="عدد العناصر"
                        value={invoiceItemCount.toString()}
                      />
                      <PosInvoiceMetric
                        label="إجمالي العناصر"
                        value={formatCurrency(subtotal)}
                      />
                      <PosInvoiceMetric
                        label="الخصم"
                        value={formatCurrency(checkout.discountAmount)}
                      />
                      <PosInvoiceMetric
                        label="الضريبة"
                        value={formatCurrency(checkout.taxAmount)}
                      />
                      <div className="rounded-xl bg-slate-900 p-4 text-white">
                        <p className="text-xs font-bold text-slate-300">الإجمالي</p>
                        <p className="mt-2 text-3xl font-black text-white">
                          {formatCurrency(checkout.finalTotal)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-auto hidden space-y-2 border-t border-slate-200 pt-3 lg:sticky lg:bottom-0 lg:block lg:bg-slate-50">
                <button
                  type="button"
                  onClick={() => router.push(checkoutHref)}
                  disabled={invoiceItems.length === 0}
                  className="h-12 w-full rounded-xl bg-[#020617] text-base font-bold text-white transition hover:bg-[#020617]/90 disabled:cursor-not-allowed disabled:bg-slate-300 touch-manipulation"
                >
                  إتمام البيع
                </button>

                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  className="min-h-[44px] w-full rounded-xl border border-red-200 bg-red-50 text-sm font-bold text-red-600 transition hover:border-red-300 hover:bg-red-100 touch-manipulation"
                >
                  إلغاء الفاتورة
                </button>
              </div>
            </aside>
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-3 py-3.5 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
          <div className="mx-auto flex w-full max-w-6xl min-w-0 items-center justify-between gap-3">
            <div className="min-w-0 text-right">
              <p className="text-xs font-bold text-slate-400">ملخص الفاتورة</p>
              <p className="mt-1 text-sm font-black text-slate-950">
                {invoiceItemCount} عنصر
              </p>
              <p className="mt-0.5 text-base font-black text-slate-950">
                {formatCurrency(checkout.finalTotal)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push(checkoutHref)}
              disabled={invoiceItems.length === 0}
              className="min-h-[44px] shrink-0 rounded-xl bg-[#020617] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#020617]/90 disabled:cursor-not-allowed disabled:bg-slate-300 touch-manipulation"
            >
              إتمام البيع
            </button>
          </div>
        </div>

        {showItemsModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-lg">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-950">
                  جميع العناصر المضافة ({invoiceItems.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setShowItemsModal(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
                  aria-label="إغلاق"
                >
                  ✕
                </button>
              </div>

              <div className="max-h-[300px] space-y-2 overflow-y-auto">
                {invoiceItems.map((item) => (
                  <div
                    key={item.item_name}
                    className="flex items-center justify-between rounded-xl bg-slate-50 p-3"
                  >
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-950">
                        {item.item_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.quantity} × {formatCurrency(item.unit_price)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeItem(item.item_name)}
                      className="rounded-full p-2 text-red-500 transition hover:bg-red-50"
                      aria-label={`حذف ${item.item_name}`}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowItemsModal(false)}
                className="mt-4 min-h-[44px] w-full rounded-xl bg-slate-100 text-sm font-medium text-slate-700 transition duration-200 hover:bg-[#020617] hover:text-white touch-manipulation"
              >
                إغلاق
              </button>
            </div>
          </div>
        ) : null}

        {showCancelModal ? (
          <>
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" />

            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 text-right shadow-xl">
                <h2 className="mb-2 text-lg font-semibold text-slate-950">
                  إلغاء الفاتورة
                </h2>

                <p className="mb-6 text-gray-600">
                  هل أنت متأكد من إلغاء الفاتورة؟
                </p>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    onClick={() => setShowCancelModal(false)}
                  >
                    إلغاء
                  </button>

                  <button
                    type="button"
                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
                    onClick={() => {
                      setShowCancelModal(false)
                      clearInvoice()
                      localStorage.removeItem(INVOICE_SALE_ITEMS_STORAGE_KEY)
                      router.push('/pos')
                    }}
                  >
                    تأكيد
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </>
    )
  }

  return (
    <>
      {hasInvalidBranchContext ? (
        <div className="error-alert">
          لا يمكن استخدام شاشة الفاتورة لأن حسابك غير مرتبط بفرع صالح
        </div>
      ) : null}
      {hasAmbiguousAdminBranchContext ? (
        <div className="error-alert">
          اختر فرعًا محددًا من القائمة قبل إنشاء فاتورة جديدة
        </div>
      ) : null}
      {stockErrorMessage ? (
        <div className="error-alert">
          {stockErrorMessage}
        </div>
      ) : null}

      <PageHero>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="page-title">{heroTitle}</h1>
            <p className="page-subtitle">{heroSubtitle}</p>
            <p className="mt-2 text-sm text-slate-500">{heroDescription}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {isSystemAdmin ? (
              <AdminBranchFilter
                branches={branches}
                selectedBranchId={selectedBranchId}
                loading={loadingBranches}
                onChange={setSelectedBranchId}
                className="min-w-[220px]"
                allLabel="اختر فرعًا للفاتورة"
              />
            ) : null}

            <AdminButton onClick={() => router.push(primaryBackHref)} type="button">
              {primaryBackLabel}
            </AdminButton>

            <AdminButton onClick={() => router.push(secondaryBackHref)} type="button">
              {secondaryBackLabel}
            </AdminButton>

            <span className="badge badge-green">{originBadgeLabel}</span>
            <span className="badge badge-blue">الصلاحية: {roleLabel}</span>
          </div>
        </div>

        {showPosStepIndicator ? (
          <div className="mt-4">
            <PosStepIndicator currentStep="items" />
          </div>
        ) : null}
      </PageHero>

      <div className="mb-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="page-card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="section-title">سياق الفاتورة الحالية</h2>
              <p className="mt-1 text-sm text-slate-500">
                راجع العميل وملخص الفاتورة.
              </p>
            </div>

            <span className="badge badge-slate">
              {invoiceItemCount} عنصر داخل الفاتورة
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="inner-card">
              <h3 className="mb-3 text-sm font-bold text-slate-900">بيانات العميل</h3>
              <div className="space-y-3">
                <SummaryRow label="اسم العميل" value={customerName} />
                <SummaryRow label="رقم الجوال" value={customerPhone} />
              </div>
            </div>

            <div className="inner-card">
              <h3 className="mb-3 text-sm font-bold text-slate-900">ملخص الفاتورة</h3>
              <div className="space-y-3">
                <SummaryRow label="عدد العناصر" value={invoiceItemCount.toString()} />
                <SummaryRow label="المجموع الفرعي" value={formatCurrency(subtotal)} />
                <SummaryRow
                  label="الإجمالي الحالي"
                  value={formatCurrency(checkout.finalTotal)}
                />
              </div>
            </div>

            <div className="inner-card">
              <h3 className="mb-3 text-sm font-bold text-slate-900">آخر عملية</h3>
              <div className="space-y-3">
                <SummaryRow label="آخر فاتورة" value={checkout.lastInvoiceNumber || '—'} />
                <SummaryRow label="آخر طلب" value={checkout.lastOrderNumber || '—'} />
                <SummaryRow
                  label="طريقة الدفع الحالية"
                  value={getPaymentMethodLabel(checkout.paymentMethod)}
                />
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="page-card">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="section-title">المنتجات والخدمات</h2>
              <p className="mt-1 text-sm text-slate-500">اختر العناصر المطلوبة.</p>
            </div>
          </div>

          <div className="mb-4 rounded-[24px] border border-slate-200 bg-slate-50 p-3">
            <div className="mb-3 flex flex-wrap gap-2">
              {invoiceFilters.map((filter) => (
                <AdminButton
                  key={filter}
                  onClick={() => {
                    setActiveFilter(filter)
                    setCurrentCatalogPage(1)
                  }}
                  variant={activeFilter === filter ? 'primary' : 'secondary'}
                >
                  {filter}
                </AdminButton>
              ))}
            </div>

            <AdminInput
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setCurrentCatalogPage(1)
              }}
              placeholder="ابحث عن منتج أو خدمة"
            />

            {catalogRefreshing || (catalogLoading && canRenderCatalogImmediately) ? (
              <p className="mt-3 text-xs text-slate-500">تحديث...</p>
            ) : null}
          </div>

          {hasAmbiguousAdminBranchContext ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-8 text-center text-sm text-amber-800">
              اختر فرعًا محددًا أولًا حتى يتم تحميل كتالوج الفرع الصحيح للفاتورة.
            </div>
          ) : catalogLoading && !canRenderCatalogImmediately ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              جاري تحميل العناصر...
            </div>
          ) : catalogError && filteredProducts.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              تعذر تحميل العناصر، حاول تحديث الصفحة
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              لا توجد منتجات أو خدمات متاحة لهذا الفرع.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => {
                const inventoryState = getInventoryTrackingState(product)
                const productOutOfStock = inventoryState.isOutOfStock

                return (
                  <button
                    key={product.id}
                    onClick={() => addItem(product)}
                    className={`inner-card text-right transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white ${
                      productOutOfStock ? 'opacity-70' : ''
                    }`}
                  >
                  <div className="mb-4 overflow-hidden rounded-[20px] border border-slate-200 bg-slate-100">
                    <PosCatalogItemImage
                      key={product.image_url || product.id}
                      imageUrl={product.image_url}
                      posDisplayMode={getProductPosDisplayMode(product)}
                      posColor={getProductOptionalText(product, 'pos_color')}
                      posShape={getProductOptionalText(product, 'pos_shape')}
                      name={product.name}
                      type={product.type}
                    />
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-slate-900">
                        {product.name}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {product.type === 'service' ? 'خدمة' : 'منتج'} ⬢ {product.category}
                      </p>
                      <ProductStockIndicator product={product} variant="card" />
                    </div>

                    <span className="badge badge-slate">
                      {formatCurrency(product.price)}
                    </span>
                  </div>

                  <div className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white">
                    إضافة إلى الفاتورة
                  </div>
                </button>
                )
              })}
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="page-card">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="section-title">عناصر الفاتورة</h2>
                <p className="mt-1 text-sm text-slate-500">
                  راجع الكميات قبل المتابعة.
                </p>
              </div>
              <AdminButton onClick={clearInvoice} type="button">
                تفريغ
              </AdminButton>
            </div>

            {invoiceItems.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                لم يتم إضافة أي عنصر بعد
              </div>
            ) : (
              <div className="space-y-3">
                {invoiceItems.map((item) => (
                  <div
                    key={item.item_name}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          {item.item_name}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.item_type === 'service' ? 'خدمة' : 'منتج'}
                        </p>
                      </div>

                      <AdminButton onClick={() => removeItem(item.item_name)} type="button">
                        حذف
                      </AdminButton>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <AdminButton
                          onClick={() =>
                            decreaseOrRemoveItem(item.item_name, item.quantity)
                          }
                          type="button"
                        >
                          -
                        </AdminButton>

                        <div className="min-w-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-2 text-center font-bold text-slate-900">
                          {item.quantity}
                        </div>

                        <AdminButton
                          onClick={() => increaseQty(item)}
                          type="button"
                        >
                          +
                        </AdminButton>
                      </div>

                      <div className="text-left">
                        <p className="text-sm text-slate-500">
                          الوحدة: {formatCurrency(item.unit_price)}
                        </p>
                        <p className="mt-1 text-sm font-bold text-slate-900">
                          الإجمالي: {formatCurrency(item.quantity * item.unit_price)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {checkoutMode === 'embedded' ? (
            <InvoiceCheckoutPanel checkout={checkout} branchId={invoiceBranchId} />
          ) : (
            <section className="page-card">
              <div className="mb-4">
                <h2 className="section-title">الانتقال إلى الدفع</h2>
                <p className="mt-1 text-sm text-slate-500">
                  تابع إلى الدفع لإكمال الفاتورة.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      جاهزية الانتقال
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      راجع الملخص ثم تابع.
                    </p>
                  </div>
                  <span className="badge badge-slate">الخطوة 2 من 3</span>
                </div>

                <div className="inner-card space-y-3">
                  <SummaryRow label="عدد العناصر" value={invoiceItemCount.toString()} />
                  <SummaryRow label="المجموع الفرعي" value={formatCurrency(subtotal)} />
                  <SummaryRow
                    label="بيانات العميل"
                    value={`${customerName} • ${customerPhone}`}
                  />
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <AdminButton
                  onClick={() => router.push(checkoutHref)}
                  variant="primary"
                  className="min-h-[56px] w-full text-base"
                  type="button"
                  disabled={invoiceItems.length === 0}
                >
                  الانتقال إلى الدفع
                </AdminButton>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-500">
                  سيتم الاحتفاظ بالعناصر الحالية عند الانتقال.
                </div>
              </div>
            </section>
          )}
        </aside>
      </div>
    </>
  )
}

function PosCatalogItemImage({
  imageUrl,
  posDisplayMode,
  posColor,
  posShape,
  name,
  type,
  compact = false,
  frameClassName,
}: {
  imageUrl: string | null
  posDisplayMode?: 'style' | 'image' | null
  posColor?: string | null
  posShape?: string | null
  name: string
  type: 'product' | 'service'
  compact?: boolean
  frameClassName?: string
}) {
  const normalizedImageUrl = resolveInvoiceCatalogImageUrl(imageUrl)
  const [hasImageError, setHasImageError] = useState(false)
  const imageHeightClass = compact ? 'h-24 sm:h-24 md:h-28' : 'h-36 md:h-40 xl:h-44'
  const imageFrameClass =
    frameClassName?.trim()
      ? `relative overflow-hidden rounded-xl bg-slate-50 ${frameClassName}`
      : `relative w-full overflow-hidden rounded-xl bg-slate-50 ${imageHeightClass}`
  const shouldRenderImage = Boolean(normalizedImageUrl && !hasImageError)
  const shapeClasses =
    posShape === 'circle'
      ? 'rounded-full'
      : posShape === 'square'
        ? 'rounded-2xl'
        : 'rounded-none'

  const shapeStyle =
    posShape === 'hexagon'
      ? { clipPath: 'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0 50%)' }
      : posShape === 'gear'
        ? {
            clipPath:
              'polygon(50% 0%, 61% 12%, 76% 7%, 81% 22%, 95% 28%, 91% 44%, 100% 50%, 91% 56%, 95% 72%, 81% 78%, 76% 93%, 61% 88%, 50% 100%, 39% 88%, 24% 93%, 19% 78%, 5% 72%, 9% 56%, 0% 50%, 9% 44%, 5% 28%, 19% 22%, 24% 7%, 39% 12%)',
          }
        : undefined

  if (!shouldRenderImage) {
    return (
      <PosCatalogItemPlaceholder
        imageFrameClass={imageFrameClass}
        type={type}
        posDisplayMode={posDisplayMode}
        posColor={posColor}
        shapeClasses={shapeClasses}
        shapeStyle={shapeStyle}
      />
    )
  }

  if (!shouldRenderImage && (posDisplayMode as string) === '__legacy__') {
    const accentColor =
      posDisplayMode === 'style' && posColor?.trim() ? posColor : '#CBD5E1'
    return (
      <div
        className={`flex w-full items-center justify-center rounded-2xl bg-gradient-to-br from-slate-50 via-white to-slate-100 text-center ${imageHeightClass}`}
      >
        <div className="space-y-2 px-4">
          <div
            className={`mx-auto flex h-14 w-14 items-center justify-center border border-white/80 bg-white/90 text-slate-500 shadow-sm ${shapeClasses}`}
            style={{
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
              ...(posDisplayMode === 'style'
                ? {
                    backgroundColor: `${accentColor}22`,
                    borderColor: `${accentColor}55`,
                  }
                : {}),
              ...shapeStyle,
            }}
          >
            {type === 'service' ? 'خ' : 'م'}
          </div>
          <p className="text-xs font-bold text-slate-500">لا توجد صورة متاحة</p>
        </div>
      </div>
    )
  }

  return (
    <div className={imageFrameClass}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={normalizedImageUrl ?? undefined}
        alt={name}
        className="h-full w-full bg-slate-50 object-cover object-center"
        loading="lazy"
        onError={() => setHasImageError(true)}
      />
    </div>
  )
}

function PosCatalogItemPlaceholder({
  imageFrameClass,
  type,
  posDisplayMode,
  posColor,
  shapeClasses,
  shapeStyle,
}: {
  imageFrameClass: string
  type: 'product' | 'service'
  posDisplayMode?: 'style' | 'image' | null
  posColor?: string | null
  shapeClasses: string
  shapeStyle?: CSSProperties
}) {
  const accentColor =
    posDisplayMode === 'style' && posColor?.trim() ? posColor : '#CBD5E1'

  return (
    <div className={imageFrameClass}>
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 text-center">
        <div className="px-2">
        <div
          className={`mx-auto flex h-10 w-10 items-center justify-center border border-white/80 bg-white/90 text-slate-500 shadow-sm ${shapeClasses}`}
          style={{
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
            ...(posDisplayMode === 'style'
              ? {
                  backgroundColor: `${accentColor}22`,
                  borderColor: `${accentColor}55`,
                }
              : {}),
            ...shapeStyle,
          }}
        >
          {type === 'service' ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-[18px] w-[18px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.7 6.3a4.5 4.5 0 0 0-6.36 6.36L3 18v3h3l5.34-5.34a4.5 4.5 0 0 0 6.36-6.36l-3.3 3.3-2.12-2.12 3.3-3.3Z" />
            </svg>
          ) : type === 'product' ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-[18px] w-[18px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3 4 7l8 4 8-4-8-4Z" />
              <path d="M4 7v10l8 4 8-4V7" />
              <path d="M12 11v10" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-[18px] w-[18px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m12 3 1.6 4.84L18 9.5l-4.4 1.66L12 16l-1.6-4.84L6 9.5l4.4-1.66L12 3Z" />
            </svg>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}

function PosInvoiceMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-black text-slate-950">{value}</span>
    </div>
  )
}

function PosSidebarLink({
  icon,
  label,
  href,
  active = false,
  disabled = false,
}: {
  icon: React.ReactNode
  label: string
  href: string
  active?: boolean
  disabled?: boolean
}) {
  return (
    <Link
      href={disabled ? '#' : href}
      aria-disabled={disabled}
      className={`flex min-h-[48px] items-center justify-between rounded-xl px-3 text-sm font-bold touch-manipulation ${
        active ? 'bg-[#020617] text-white' : 'bg-slate-100 text-slate-700'
      } ${disabled ? 'pointer-events-none cursor-not-allowed opacity-50' : ''}`}
    >
      <span>{label}</span>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
        {icon}
      </span>
    </Link>
  )
}

function PosSidebarButton({
  icon,
  label,
  disabled = true,
}: {
  icon: React.ReactNode
  label: string
  disabled?: boolean
}) {
  return (
    <div
      aria-disabled={disabled}
      className={`flex min-h-[48px] items-center justify-between rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700 touch-manipulation ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      }`}
    >
      <span>{label}</span>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/60">
        {icon}
      </span>
    </div>
  )
}

function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M10.5 4a6.5 6.5 0 1 0 4.03 11.6l4.43 4.44 1.41-1.42-4.43-4.43A6.5 6.5 0 0 0 10.5 4zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z"
      />
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3 3 10.2V21h6.5v-5.8h5V21H21V10.2Zm7 16h-2.5v-5.8h-9V19H5v-7.84L12 5.6l7 5.56Z"
      />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-4.33 0-8 2.17-8 4.5V21h16v-2.5C20 16.17 16.33 14 12 14z"
      />
    </svg>
  )
}

function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2 3 6.5v11L12 22l9-4.5v-11Zm0 2.2 6.68 3.34L12 10.88 5.32 7.54Zm-7 4.95 6 3v7.36l-6-3Zm8 10.36v-7.36l6-3v7.36Z"
      />
    </svg>
  )
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 .71.29l2 2A1 1 0 0 1 21 8v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Zm2 0v2h14V8H5Zm10 5a2 2 0 1 0 2 2 2 2 0 0 0-2-2Z"
      />
    </svg>
  )
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 3h9l5 5v13H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm8 1.5V9h4.5ZM8 12v2h8v-2Zm0 4v2h6v-2Z"
      />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M4 7h16M10 11v6M14 11v6M6 7l1 11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-11M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

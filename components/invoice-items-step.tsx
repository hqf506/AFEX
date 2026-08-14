'use client'

import Link from 'next/link'
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useRouter } from 'next/navigation'
import { getClientErrorMessage } from '@/lib/api/client-error'
import { AdminBranchFilter } from '@/components/admin-branch-filter'
import { AdminButton } from '@/components/admin-button'
import { AdminInput } from '@/components/admin-input'
import { InvoiceCheckoutPanel } from '@/components/invoice-checkout-panel'
import { PageHero } from '@/components/page-hero'
import { PosStepIndicator } from '@/components/pos-step-indicator'
import { SummaryRow } from '@/components/summary-row'
import { useAdminBranchFilter } from '@/hooks/use-admin-branch-filter'
import { useMobileViewport } from '@/hooks/use-mobile-viewport'
import {
  useInvoiceCheckout,
  type CheckoutDiscountOption,
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
  isBranchInvoiceCatalogPageFresh,
  loadBranchInvoiceCatalogPage,
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
const ADMIN_SYSTEM_SETTINGS_CACHE_KEY = 'admin-system-settings'
const ADMIN_SYSTEM_SETTINGS_CACHE_TTL_MS = 60_000
const POS_RUNTIME_CACHE_TTL_MS = 30_000
const CATALOG_ITEMS_PER_PAGE = 10
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

  const vibrateFallback = () => {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
      return
    }

    navigator.vibrate(
      kind === 'add' ? 35 : kind === 'remove' ? 45 : [70, 40, 90]
    )
  }
  const capacitorHaptics = (
    window as typeof window & {
      Capacitor?: {
        Plugins?: {
          Haptics?: {
            impact?: (options: { style: 'LIGHT' | 'MEDIUM' }) => Promise<void> | void
          }
        }
      }
    }
  ).Capacitor?.Plugins?.Haptics

  if (!capacitorHaptics?.impact) {
    vibrateFallback()
    return
  }

  try {
    const impactResult = capacitorHaptics.impact({
      style: kind === 'error' ? 'MEDIUM' : 'LIGHT',
    })
    void Promise.resolve(impactResult).catch(vibrateFallback)
  } catch {
    vibrateFallback()
  }
}

function triggerPosFeedback(kind: PosFeedbackKind) {
  triggerHapticFeedback(kind)
  void playFeedbackSound(kind)
}

type PosRuntime = {
  discounts: CheckoutDiscountOption[]
  vat: CheckoutVatSetting | null
}

function getPosRuntimeCacheKey(tenantId: string | null, branchId: string | null) {
  return `pos-runtime:${tenantId || 'unknown'}:${branchId || 'all'}`
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
  const isLowStock =
    isInventoryTracked &&
    safeNormalizedQuantity > 0 &&
    lowStockThreshold > 0 &&
    safeNormalizedQuantity <= lowStockThreshold

  return {
    normalizedType: normalizedType === 'product' ? 'product' : 'service',
    isComposite,
    isInventoryTracked,
    normalizedQuantity: safeNormalizedQuantity,
    lowStockThreshold,
    isOutOfStock,
    isLowStock,
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

  const { isLowStock, isOutOfStock, normalizedQuantity } =
    getInventoryTrackingState(product)
  const baseClass =
    variant === 'compact'
      ? 'mt-1 inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-bold'
      : 'mt-3 inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold'
  const toneClass = isOutOfStock
    ? 'bg-red-50 text-red-700'
    : isLowStock
      ? 'bg-amber-50 text-amber-700'
      : 'bg-emerald-50 text-emerald-700'
  const label = isOutOfStock
    ? 'انتهى المخزون'
    : isLowStock
      ? 'المخزون منخفض'
      : `المخزون: ${formatStockNumber(normalizedQuantity)}`

  return (
    <span className={`${baseClass} ${toneClass}`}>
      {label}
    </span>
  )
}

function InventoryRefreshIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M20 7.4A8 8 0 0 0 6.6 5.6L4.5 7.7" />
      <path d="M4.5 3.8v3.9h3.9" />
      <path d="M4 16.6a8 8 0 0 0 13.4 1.8l2.1-2.1" />
      <path d="M19.5 20.2v-3.9h-3.9" />
    </svg>
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
          allowedRoles: ['admin', 'employee', 'cashier'],
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
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState(INVOICE_ALL_FILTER)
  const [invoiceItems, setInvoiceLineItems] = useState<InvoiceLineItem[]>([])
  const [catalogProducts, setCatalogProducts] = useState<PosInvoiceCatalogProduct[]>([])
  const [catalogProductById, setCatalogProductById] = useState<
    Record<string, PosInvoiceCatalogProduct>
  >({})
  const [catalogTotal, setCatalogTotal] = useState(0)
  const [catalogCategoryFilters, setCatalogCategoryFilters] = useState<string[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogRefreshing, setCatalogRefreshing] = useState(false)
  const [catalogError, setCatalogError] = useState(false)
  const [currentCatalogPage, setCurrentCatalogPage] = useState(1)
  const deferredSearch = useDeferredValue(search)
  const rememberCatalogProducts = useCallback(
    (products: PosInvoiceCatalogProduct[]) => {
      if (products.length === 0) return

      setCatalogProductById((current) => {
        const next = { ...current }

        for (const product of products) {
          const normalizedCatalogItemId = getNormalizedCatalogItemId(product)
          if (normalizedCatalogItemId) {
            next[normalizedCatalogItemId] = product
          }
        }

        return next
      })
    },
    []
  )
  const catalogReloadInFlightRef = useRef(false)
  const forceReloadCatalog = useCallback(
    async (options: { showRefreshing?: boolean } = {}) => {
      if (!invoiceBranchId || catalogReloadInFlightRef.current) return
      catalogReloadInFlightRef.current = true

      if (options.showRefreshing) {
        setCatalogRefreshing(true)
      }

      try {
        const nextCatalogPage = await loadBranchInvoiceCatalogPage(invoiceBranchId, {
          page: currentCatalogPage,
          pageSize: CATALOG_ITEMS_PER_PAGE,
          search: deferredSearch,
          category: activeFilter === INVOICE_ALL_FILTER ? '' : activeFilter,
          force: true,
          tenantId,
        })

        setCatalogProducts(nextCatalogPage.products)
        rememberCatalogProducts(nextCatalogPage.products)
        setCatalogTotal(nextCatalogPage.total)

        if (nextCatalogPage.categories.length > 0) {
          setCatalogCategoryFilters(
            nextCatalogPage.categories.filter(
              (categoryName) => !POS_HIDDEN_CATEGORY_FILTERS.has(categoryName)
            )
          )
        }

        setCatalogError(false)
      } catch (error) {
        if (isProtectedResourceAuthError(error)) {
          handlePosProtectedResourceUnauthorized()
          return
        }

        setCatalogError(true)
        triggerPosFeedback('error')
      } finally {
        catalogReloadInFlightRef.current = false
        setCatalogLoading(false)
        setCatalogRefreshing(false)
      }
    },
    [
      activeFilter,
      currentCatalogPage,
      deferredSearch,
      invoiceBranchId,
      rememberCatalogProducts,
      tenantId,
    ]
  )
  const [showItemsModal, setShowItemsModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [hydratedSaleDraft, setHydratedSaleDraft] = useState(false)
  const [vatSetting, setVatSetting] = useState<CheckoutVatSetting | null>(null)
  const [recentlyAddedItemId, setRecentlyAddedItemId] = useState<string | null>(null)
  const [pressedItemId, setPressedItemId] = useState<string | null>(null)
  const [stockErrorMessage, setStockErrorMessage] = useState('')
  const isMobileViewport = useMobileViewport()

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
      setCustomerId(parsed.customerId)
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
          variant === 'pos' || activeFilter !== INVOICE_ALL_FILTER || deferredSearch.trim()
            ? []
            : peekBranchInvoiceCatalog(invoiceBranchId, tenantId)

        if (!cancelled && cachedProducts.length > 0) {
          setCatalogProducts(cachedProducts)
          rememberCatalogProducts(cachedProducts)
          setCatalogError(false)
          setCatalogLoading(false)
          setCatalogRefreshing(true)
        }

        if (!cancelled) {
          setCatalogLoading(cachedProducts.length === 0)
          setCatalogError(false)
        }

        const nextCatalogPage = await loadBranchInvoiceCatalogPage(invoiceBranchId, {
          page: currentCatalogPage,
          pageSize: CATALOG_ITEMS_PER_PAGE,
          search: deferredSearch,
          category: activeFilter === INVOICE_ALL_FILTER ? '' : activeFilter,
          tenantId,
        })

        if (!cancelled) {
          setCatalogProducts(nextCatalogPage.products)
          rememberCatalogProducts(nextCatalogPage.products)
          setCatalogTotal(nextCatalogPage.total)

          if (nextCatalogPage.categories.length > 0) {
            setCatalogCategoryFilters(
              nextCatalogPage.categories.filter(
                (categoryName) => !POS_HIDDEN_CATEGORY_FILTERS.has(categoryName)
              )
            )
          }

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
          setCatalogTotal(0)
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
  }, [
    allowed,
    ready,
    invoiceBranchId,
    hasUnavailablePosBranchContext,
    variant,
    currentCatalogPage,
    activeFilter,
    deferredSearch,
    rememberCatalogProducts,
    tenantId,
  ])

  useEffect(() => {
    if (
      variant !== 'pos' ||
      !allowed ||
      !ready ||
      !tenantId ||
      !invoiceBranchId ||
      hasUnavailablePosBranchContext
    ) {
      return
    }

    let reloadTimeoutId: number | null = null
    const scheduleCatalogReload = () => {
      const catalogPageParams = {
        branchId: invoiceBranchId,
        tenantId,
        page: currentCatalogPage,
        pageSize: CATALOG_ITEMS_PER_PAGE,
        search: deferredSearch,
        category: activeFilter === INVOICE_ALL_FILTER ? '' : activeFilter,
      }

      if (isBranchInvoiceCatalogPageFresh(catalogPageParams)) {
        return
      }

      if (reloadTimeoutId) {
        window.clearTimeout(reloadTimeoutId)
      }

      reloadTimeoutId = window.setTimeout(() => {
        reloadTimeoutId = null
        if (!isBranchInvoiceCatalogPageFresh(catalogPageParams)) {
          void forceReloadCatalog({ showRefreshing: true })
        }
      }, 400)
    }

    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') {
        scheduleCatalogReload()
      }
    }

    document.addEventListener('visibilitychange', refreshOnReturn)
    window.addEventListener('focus', scheduleCatalogReload)

    return () => {
      if (reloadTimeoutId) {
        window.clearTimeout(reloadTimeoutId)
      }

      document.removeEventListener('visibilitychange', refreshOnReturn)
      window.removeEventListener('focus', scheduleCatalogReload)
    }
  }, [
    allowed,
    ready,
    tenantId,
    invoiceBranchId,
    currentCatalogPage,
    deferredSearch,
    activeFilter,
    hasUnavailablePosBranchContext,
    variant,
    forceReloadCatalog,
  ])

  const visibleCatalogProducts = useMemo(() => {
    if (hasUnavailablePosBranchContext) {
      return []
    }

    const normalizedSearch = search.trim().toLocaleLowerCase('ar')
    if (variant === 'pos' && normalizedSearch) {
      return Object.values(catalogProductById).filter((product) =>
        [product.name, product.category].some((value) =>
          value.toLocaleLowerCase('ar').includes(normalizedSearch)
        )
      )
    }

    return catalogProducts
  }, [
    catalogProductById,
    catalogProducts,
    hasUnavailablePosBranchContext,
    search,
    variant,
  ])

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

  const filteredProducts = visibleCatalogProducts
  const totalCatalogPages = Math.max(
    1,
    Math.ceil(catalogTotal / CATALOG_ITEMS_PER_PAGE)
  )
  const effectiveCatalogPage = Math.min(currentCatalogPage, totalCatalogPages)
  const paginatedProducts = filteredProducts
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
    }, 220)

    return () => window.clearTimeout(timeoutId)
  }, [recentlyAddedItemId])

  useEffect(() => {
    if (!pressedItemId) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setPressedItemId(null)
    }, 160)

    return () => window.clearTimeout(timeoutId)
  }, [pressedItemId])

  useEffect(() => {
    if (!allowed) {
      return
    }

    let cancelled = false

    async function loadPosRuntime() {
      try {
        const runtimeCacheKey = getPosRuntimeCacheKey(tenantId, invoiceBranchId)
        const cachedRuntime = peekClientResource<PosRuntime>(runtimeCacheKey)

        if (!cancelled && cachedRuntime) {
          setVatSetting(cachedRuntime.vat)
        }

        const searchParams = new URLSearchParams()
        if (invoiceBranchId) {
          searchParams.set('branchId', invoiceBranchId)
        }

        const runtime = await loadClientResource<PosRuntime>(
          runtimeCacheKey,
          async () => {
            const response = await fetch(
              `/api/pos/runtime${searchParams.toString() ? `?${searchParams.toString()}` : ''}`,
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
              throw new Error(getClientErrorMessage(result, 'تعذر تحميل إعدادات نقطة البيع حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
            }

            return {
              discounts: Array.isArray(result.runtime?.discounts)
                ? result.runtime.discounts
                : [],
              vat: (result.runtime?.vat as CheckoutVatSetting | null) || null,
            }
          },
          {
            ttlMs: POS_RUNTIME_CACHE_TTL_MS,
            logLabel: `fetch POS runtime (${invoiceBranchId || 'all'})`,
            protectedResource: true,
          }
        )

        if (!cancelled) {
          setVatSetting(runtime.vat)
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

    void loadPosRuntime()

    return () => {
      cancelled = true
    }
  }, [allowed, invoiceBranchId, tenantId])

  useEffect(() => {
    if (!allowed || !ready || hasUnavailablePosBranchContext) {
      return
    }

    router.prefetch(checkoutHref)

    void prefetchClientResource<PosRuntime>(
      getPosRuntimeCacheKey(tenantId, invoiceBranchId),
      async () => {
        const searchParams = new URLSearchParams()
        if (invoiceBranchId) {
          searchParams.set('branchId', invoiceBranchId)
        }

        const response = await fetch(
          `/api/pos/runtime${
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
          throw new Error(getClientErrorMessage(result, 'تعذر تحميل إعدادات نقطة البيع حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
        }

        return {
          discounts: Array.isArray(result.runtime?.discounts)
            ? result.runtime.discounts
            : [],
          vat: (result.runtime?.vat as CheckoutVatSetting | null) || null,
        }
      },
      {
        ttlMs: POS_RUNTIME_CACHE_TTL_MS,
        logLabel: `fetch POS runtime (${invoiceBranchId || 'all'})`,
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
  }, [allowed, checkoutHref, invoiceBranchId, hasUnavailablePosBranchContext, ready, router, tenantId])

  const checkout = useInvoiceCheckout({
    customerId,
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
      setStockErrorMessage('المنتج غير متوفر في المخزون حاليًا.')
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
        setStockErrorMessage(`الكمية المطلوبة غير متوفرة. الكمية المتاحة: ${normalizedQuantity}.`)
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
    const product =
      (item.item_id ? catalogProductById[item.item_id] : undefined) ||
      catalogProducts.find((catalogProduct) => {
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
    triggerHapticFeedback('add')
  }

  const decreaseQty = (itemName: string) => {
    setInvoiceLineItems((prev) => decreaseInvoiceLineItemQuantity(prev, itemName))
    triggerHapticFeedback('remove')
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
    return <div className="page-card">جارٍ تحميل العناصر...</div>
  }

  if (variant === 'pos') {
    const squarePosCategoryLabels = [
      INVOICE_ALL_FILTER,
      'الخدمات',
      'المنتجات',
      'تنظيف',
      'إصلاح',
      'عناية',
      'ألوان',
      'غسيل',
    ]

    return (
      <div className="pos-mobile-motion fixed inset-0 z-[50] h-[100svh] w-screen overflow-hidden bg-[#020817] text-white">
        <style jsx global>{`
          @keyframes pos-mobile-screen-enter {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }

          @keyframes pos-mobile-sheet-enter {
            from { opacity: 0; transform: translateY(18px) scale(0.99); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }

          @keyframes pos-mobile-skeleton-pulse {
            0%, 100% { opacity: 0.45; }
            50% { opacity: 0.8; }
          }

          @media (max-width: 639px) {
            .pos-mobile-screen-enter { animation: pos-mobile-screen-enter 200ms ease-out both; }
            .pos-mobile-sheet-enter { animation: pos-mobile-sheet-enter 200ms ease-out both; }
            .pos-mobile-skeleton { animation: pos-mobile-skeleton-pulse 1.2s ease-in-out infinite; }
          }

          @media (prefers-reduced-motion: reduce) {
            .pos-mobile-motion *,
            .pos-mobile-motion *::before,
            .pos-mobile-motion *::after {
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              scroll-behavior: auto !important;
              transition-duration: 0.01ms !important;
            }
          }
        `}</style>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_78%_84%,rgba(14,165,233,0.12),transparent_38%),linear-gradient(135deg,#020817_0%,#061426_48%,#020817_100%)]" />
        <div className="pos-mobile-screen-enter relative flex h-full w-full flex-col gap-3 overflow-hidden p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [direction:ltr] md:flex-row md:p-4 xl:gap-4">
          <main className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-hidden [direction:rtl]">
            {(hasInvalidBranchContext || hasAmbiguousAdminBranchContext || stockErrorMessage) ? (
              <div className="grid gap-2">
                {hasInvalidBranchContext ? (
                  <div className="rounded-3xl border border-red-400/25 bg-red-950/40 px-5 py-3 text-sm font-bold text-red-100 shadow-[0_18px_48px_rgba(127,29,29,0.18)]">
                    لا يمكن استخدام شاشة الفاتورة لأن حسابك غير مرتبط بفرع صالح
                  </div>
                ) : null}
                {hasAmbiguousAdminBranchContext ? (
                  <div className="rounded-3xl border border-amber-400/25 bg-amber-950/40 px-5 py-3 text-sm font-bold text-amber-100 shadow-[0_18px_48px_rgba(120,53,15,0.18)]">
                    اختر فرعًا محددًا من القائمة قبل إنشاء فاتورة جديدة
                  </div>
                ) : null}
                {stockErrorMessage ? (
                  <div className="rounded-3xl border border-red-400/25 bg-red-950/40 px-5 py-3 text-sm font-bold text-red-100 shadow-[0_18px_48px_rgba(127,29,29,0.18)]">
                    {stockErrorMessage}
                  </div>
                ) : null}
              </div>
            ) : null}

            <section className="grid shrink-0 grid-cols-[minmax(0,1fr)_54px] gap-2 sm:flex sm:flex-row sm:items-center sm:gap-3">
              <div className="col-span-2 flex min-h-[44px] items-center justify-between gap-2 sm:hidden">
                <a
                  href={customerStepHref}
                  className="flex min-h-[44px] items-center justify-center rounded-[18px] border border-cyan-300/18 bg-cyan-400/10 px-3 text-xs font-black text-cyan-100"
                >
                  العميل
                </a>
                <h1 className="min-w-0 flex-1 truncate text-center text-lg font-black text-white">
                  اختيار العناصر
                </h1>
                <button
                  type="button"
                  onClick={() => setShowItemsModal(true)}
                  aria-expanded={showItemsModal}
                  aria-controls="pos-cart-panel"
                  className="flex min-h-[44px] items-center justify-center gap-2 rounded-[18px] border border-cyan-300/18 bg-cyan-400/10 px-3 text-xs font-black text-cyan-100"
                >
                  السلة
                  <span className="rounded-full bg-cyan-300 px-2 py-0.5 text-[#02101c]">
                    {invoiceItemCount}
                  </span>
                </button>
              </div>

              <div className="relative min-w-0 flex-1">
                {search ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('')
                      setCurrentCatalogPage(1)
                    }}
                    aria-label="مسح البحث"
                    className="absolute left-1.5 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[16px] text-lg font-black text-cyan-100 transition hover:bg-cyan-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                  >
                    ×
                  </button>
                ) : (
                  <SearchIcon className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-cyan-200/70" />
                )}
                <input
                  type="text"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setCurrentCatalogPage(1)
                  }}
                  placeholder="ابحث عن منتج أو خدمة"
                  className="h-[54px] w-full rounded-[22px] border border-cyan-300/14 bg-[#020817]/70 pr-5 pl-14 text-right text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_14px_34px_rgba(8,47,73,0.16)] outline-none backdrop-blur-xl transition placeholder:text-slate-400 focus:border-cyan-300/36 focus:ring-4 focus:ring-cyan-300/10 touch-manipulation"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                />
              </div>

              <a
                href={customerStepHref}
                className="hidden h-[54px] shrink-0 items-center justify-center rounded-[22px] border border-cyan-300/18 bg-cyan-400/10 px-4 text-sm font-black text-cyan-100 shadow-[0_14px_30px_rgba(34,211,238,0.10)] transition hover:bg-cyan-400/15 touch-manipulation sm:flex"
              >
                إضافة عميل
              </a>

              <button
                type="button"
                onClick={() => void forceReloadCatalog({ showRefreshing: true })}
                disabled={catalogLoading || catalogRefreshing}
                aria-label="تحديث المخزون"
                className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-[20px] border border-cyan-300/14 bg-[#020817]/65 text-cyan-200 shadow-[0_14px_30px_rgba(34,211,238,0.10)] transition hover:border-cyan-300/30 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
              >
                <InventoryRefreshIcon
                  className={`h-6 w-6 ${catalogRefreshing ? 'animate-spin' : ''}`}
                />
              </button>
            </section>

            <section aria-label="تصنيفات العناصر" className="flex w-full min-w-0 shrink-0 snap-x snap-mandatory items-center gap-2 overflow-x-auto pb-1 [direction:rtl] [scrollbar-width:none] [-ms-overflow-style:none] sm:snap-proximity sm:gap-1.5 [&::-webkit-scrollbar]:hidden">
              {squarePosCategoryLabels.map((filter) => {
                const active = activeFilter === filter

                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => {
                      setActiveFilter(filter)
                      setCurrentCatalogPage(1)
                    }}
                    aria-pressed={active}
                    className={`min-h-[44px] max-w-[180px] shrink-0 snap-start truncate rounded-full px-4 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 touch-manipulation sm:max-w-[160px] sm:px-3.5 ${
                      active
                        ? 'bg-cyan-300 text-[#02101c] shadow-[0_0_34px_rgba(34,211,238,0.30)]'
                        : 'border border-cyan-300/12 bg-[#020817]/54 text-slate-300 hover:border-cyan-300/24 hover:bg-cyan-400/8'
                    }`}
                  >
                    {filter}
                  </button>
                )
              })}
            </section>

            {isSystemAdmin && !posEmployeeBranchId ? (
              <div className="shrink-0 rounded-[24px] border border-cyan-300/12 bg-[#020817]/60 p-3 backdrop-blur-xl">
                <AdminBranchFilter
                  branches={branches}
                  selectedBranchId={selectedBranchId}
                  loading={loadingBranches}
                  onChange={setSelectedBranchId}
                  allLabel="اختر فرعًا للفاتورة"
                />
              </div>
            ) : null}

            <section className="min-h-0 flex-1 overflow-hidden rounded-[24px] border border-cyan-300/10 bg-[#020817]/58 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_22px_58px_rgba(2,8,23,0.32)] backdrop-blur-2xl sm:rounded-[28px]">
              {hasAmbiguousAdminBranchContext ? (
                <div className="flex h-full items-center justify-center rounded-[28px] border border-amber-400/20 bg-amber-950/20 px-6 text-center text-sm font-bold text-amber-100">
                  اختر فرعًا محددًا أولًا حتى يتم تحميل كتالوج الفرع الصحيح للفاتورة.
                </div>
              ) : catalogLoading && !canRenderCatalogImmediately ? (
                <>
                  <div className="grid h-full content-start gap-2 overflow-hidden sm:hidden" aria-label="جارٍ تحميل العناصر" aria-busy="true">
                    {[0, 1, 2].map((skeletonItem) => (
                      <div key={skeletonItem} className="pos-mobile-skeleton flex min-h-[132px] gap-3 rounded-[22px] border border-cyan-300/10 bg-[#061426]/68 p-3">
                        <span className="h-[106px] w-[96px] shrink-0 rounded-[18px] bg-cyan-300/8" />
                        <span className="flex min-w-0 flex-1 flex-col gap-3 py-1">
                          <span className="h-4 w-4/5 rounded-full bg-cyan-300/10" />
                          <span className="h-3 w-2/5 rounded-full bg-cyan-300/8" />
                          <span className="mt-auto h-10 w-full rounded-[14px] bg-cyan-300/8" />
                        </span>
                      </div>
                    ))}
                    <span className="sr-only">جارٍ تحميل العناصر...</span>
                  </div>
                  <div className="hidden h-full items-center justify-center rounded-[28px] border border-cyan-300/10 bg-[#061426]/60 px-6 text-center text-sm font-bold text-slate-300 sm:flex">
                    جارٍ تحميل العناصر...
                  </div>
                </>
              ) : catalogError && filteredProducts.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center rounded-[28px] border border-red-400/20 bg-red-950/20 px-6 text-center text-sm font-bold text-red-100">
                  <p>تعذر تحميل العناصر، حاول تحديث الصفحة</p>
                  <button
                    type="button"
                    onClick={() => void forceReloadCatalog({ showRefreshing: true })}
                    disabled={catalogLoading || catalogRefreshing}
                    className="mt-4 min-h-[44px] rounded-[16px] border border-red-300/20 bg-red-300/10 px-5 text-sm font-black text-red-50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/70 disabled:cursor-not-allowed disabled:opacity-50 sm:hidden"
                  >
                    {catalogRefreshing ? 'جارٍ إعادة المحاولة...' : 'إعادة المحاولة'}
                  </button>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center rounded-[28px] border border-cyan-300/10 bg-[#061426]/60 px-6 text-center text-sm font-bold text-slate-300">
                  <p>
                    {search.trim()
                      ? 'لا توجد نتائج مطابقة للبحث.'
                      : 'لا توجد منتجات أو خدمات متاحة لهذا الفرع.'}
                  </p>
                  {search.trim() ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('')
                        setCurrentCatalogPage(1)
                      }}
                      className="mt-4 min-h-[44px] rounded-[18px] border border-cyan-300/18 bg-cyan-400/10 px-5 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                    >
                      مسح البحث
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="flex h-full min-h-0 flex-col gap-3">
                  {isMobileViewport ? (
                  <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto overscroll-contain pe-1">
                    {paginatedProducts.map((product) => {
                      const normalizedCatalogItemId =
                        getNormalizedCatalogItemId(product)
                      const inventoryState = getInventoryTrackingState(product)
                      const productOutOfStock = inventoryState.isOutOfStock
                      const productCartQuantity =
                        invoiceItemQuantities.byId.get(normalizedCatalogItemId) ??
                        invoiceItemQuantities.byName.get(product.name) ??
                        0
                      const reachedStockLimit =
                        inventoryState.isInventoryTracked &&
                        productCartQuantity >= inventoryState.normalizedQuantity

                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => addItemWithFeedback(product)}
                          disabled={productOutOfStock}
                          aria-label={
                            productOutOfStock
                              ? `${product.name} غير متوفر في المخزون`
                              : `إضافة ${product.name} إلى السلة`
                          }
                          className={`group flex min-h-[132px] w-full min-w-0 items-stretch gap-3 rounded-[22px] border bg-[#061426]/78 p-3 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_12px_28px_rgba(2,8,23,0.26)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.985] touch-manipulation ${
                            productOutOfStock
                              ? 'cursor-not-allowed border-slate-700/60 opacity-55'
                              : 'border-cyan-300/12'
                          } ${
                            recentlyAddedItemId === normalizedCatalogItemId
                              ? 'border-cyan-300/50 bg-cyan-400/10 shadow-[0_0_34px_rgba(34,211,238,0.18)]'
                              : ''
                          }`}
                        >
                          <span className="relative h-[106px] w-[96px] shrink-0 overflow-hidden rounded-[18px] border border-cyan-300/10 bg-[#020817]/72">
                            <PosCatalogItemImage
                              key={product.image_url || product.id}
                              imageUrl={product.image_url}
                              posDisplayMode={getProductPosDisplayMode(product)}
                              posColor={getProductOptionalText(product, 'pos_color')}
                              posShape={getProductOptionalText(product, 'pos_shape')}
                              name={product.name}
                              type={product.type}
                              frameClassName="h-full w-full rounded-[18px] bg-[#020817]"
                            />
                            {productCartQuantity > 0 ? (
                              <span className="absolute right-1.5 top-1.5 flex min-h-7 min-w-7 items-center justify-center rounded-full bg-cyan-300 px-1.5 text-xs font-black text-[#02101c] shadow-[0_0_18px_rgba(34,211,238,0.38)]">
                                {productCartQuantity}
                              </span>
                            ) : null}
                          </span>

                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="break-words text-[15px] font-black leading-6 text-white">
                              {product.name}
                            </span>
                            <span className="mt-1 truncate text-xs font-bold text-slate-400">
                              {product.category}
                            </span>
                            {inventoryState.isInventoryTracked ? (
                              <span className={`mt-1 inline-flex w-fit rounded-full px-2 py-1 text-[11px] font-black ${
                                productOutOfStock
                                  ? 'bg-red-400/12 text-red-200'
                                  : inventoryState.isLowStock
                                    ? 'bg-amber-400/12 text-amber-200'
                                    : 'bg-emerald-400/12 text-emerald-200'
                              }`}>
                                {productOutOfStock
                                  ? 'غير متوفر'
                                  : inventoryState.isLowStock
                                    ? 'المخزون منخفض'
                                    : `المتاح: ${formatStockNumber(inventoryState.normalizedQuantity)}`}
                              </span>
                            ) : (
                              <span className="mt-1 inline-flex w-fit rounded-full bg-emerald-400/12 px-2 py-1 text-[11px] font-black text-emerald-200">
                                متاح
                              </span>
                            )}
                            <span className="mt-auto flex items-end justify-between gap-2 pt-2">
                              <span className="text-lg font-black leading-none text-cyan-100">
                                {formatCurrency(product.price)}
                              </span>
                              <span className={`inline-flex min-h-[44px] shrink-0 items-center rounded-[15px] px-3 text-xs font-black ${
                                reachedStockLimit || productOutOfStock
                                  ? 'bg-slate-800 text-slate-400'
                                  : 'bg-cyan-300 text-[#02101c] shadow-[0_0_22px_rgba(34,211,238,0.24)]'
                              }`}>
                                {productOutOfStock
                                  ? 'غير متوفر'
                                  : reachedStockLimit
                                    ? `في السلة (${productCartQuantity})`
                                    : recentlyAddedItemId === normalizedCatalogItemId
                                      ? 'تمت الإضافة'
                                      : productCartQuantity > 0
                                        ? `إضافة أخرى (${productCartQuantity})`
                                        : 'إضافة للسلة'}
                              </span>
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  ) : (
                  <div className="grid min-h-0 flex-1 auto-rows-[232px] grid-cols-2 gap-3 overflow-y-auto overscroll-contain pe-1 lg:grid-cols-4">
                    {paginatedProducts.map((product) => {
                      const normalizedCatalogItemId =
                        getNormalizedCatalogItemId(product)
                      const inventoryState = getInventoryTrackingState(product)
                      const productOutOfStock = inventoryState.isOutOfStock
                      const productCartQuantity =
                        invoiceItemQuantities.byId.get(normalizedCatalogItemId) ??
                        invoiceItemQuantities.byName.get(product.name) ??
                        0
                      const reachedStockLimit =
                        inventoryState.isInventoryTracked &&
                        productCartQuantity >= inventoryState.normalizedQuantity

                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => addItemWithFeedback(product)}
                          disabled={productOutOfStock}
                          className={`group flex h-[216px] min-w-0 flex-col rounded-[22px] border border-cyan-300/12 bg-[#061426]/72 p-2 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_12px_28px_rgba(2,8,23,0.26)] transition hover:border-cyan-300/28 hover:bg-[#08203a]/74 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.985] touch-manipulation sm:h-[220px] sm:rounded-[24px] ${
                            productOutOfStock ? 'cursor-not-allowed opacity-55' : ''
                          } ${
                            pressedItemId === normalizedCatalogItemId
                              ? 'scale-[0.98]'
                              : 'scale-100'
                          } ${
                            recentlyAddedItemId === normalizedCatalogItemId
                              ? 'border-cyan-300/50 shadow-[0_0_42px_rgba(34,211,238,0.22)]'
                              : ''
                          }`}
                        >
                          <div className="relative h-[96px] shrink-0 overflow-hidden rounded-[18px] border border-cyan-300/10 bg-[#020817]/72 sm:h-[104px] sm:rounded-[20px]">
                            <PosCatalogItemImage
                              key={product.image_url || product.id}
                              imageUrl={product.image_url}
                              posDisplayMode={getProductPosDisplayMode(product)}
                              posColor={getProductOptionalText(product, 'pos_color')}
                              posShape={getProductOptionalText(product, 'pos_shape')}
                              name={product.name}
                              type={product.type}
                              frameClassName="h-full w-full rounded-[20px] bg-[#020817]"
                            />
                            {productCartQuantity > 0 ? (
                              <span className="absolute right-2 top-2 rounded-full bg-cyan-300 px-2 py-0.5 text-[11px] font-black text-[#02101c] shadow-[0_0_22px_rgba(34,211,238,0.38)]">
                                {productCartQuantity}
                              </span>
                            ) : null}
                          </div>

                          <div className="flex min-h-0 flex-1 flex-col px-1 pt-2">
                            <h3 className="line-clamp-2 h-[38px] shrink-0 break-words text-[13px] font-black leading-[19px] text-white">
                              {product.name}
                            </h3>
                            <p className="mt-0.5 h-[15px] shrink-0 truncate text-[11px] font-bold leading-[15px] text-slate-400">
                              {product.category}
                            </p>
                            <div className="mt-auto flex h-11 shrink-0 items-end justify-between gap-2 pt-1">
                              <div className="min-w-0 pb-1">
                                <p className="truncate whitespace-nowrap text-sm font-black text-cyan-100 sm:text-base">
                                  {formatCurrency(product.price)}
                                </p>
                              </div>
                              <span
                                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] text-xl font-black transition ${
                                  reachedStockLimit || productOutOfStock
                                    ? 'bg-slate-800 text-slate-500'
                                    : 'bg-cyan-300 text-[#02101c] shadow-[0_0_28px_rgba(34,211,238,0.32)] group-hover:scale-105'
                                }`}
                              >
                                +
                              </span>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  )}

                  {totalCatalogPages > 1 ? (
                    <div className="flex shrink-0 items-center justify-center gap-2 border-t border-cyan-300/10 pt-3">
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentCatalogPage((current) => Math.max(1, current - 1))
                        }
                        disabled={effectiveCatalogPage === 1}
                        className="min-h-[44px] rounded-2xl border border-cyan-300/12 bg-[#020817]/70 px-4 text-sm font-black text-slate-200 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation"
                      >
                        السابق
                      </button>
                      <span className="rounded-full bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100">
                        {effectiveCatalogPage} / {totalCatalogPages}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentCatalogPage((current) =>
                            Math.min(totalCatalogPages, current + 1)
                          )
                        }
                        disabled={effectiveCatalogPage === totalCatalogPages}
                        className="min-h-[44px] rounded-2xl border border-cyan-300/12 bg-[#020817]/70 px-4 text-sm font-black text-slate-200 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation"
                      >
                        التالي
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          </main>

          {showItemsModal ? (
            <button
              type="button"
              onClick={() => setShowItemsModal(false)}
              aria-label="إغلاق السلة"
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            />
          ) : null}

          <aside id="pos-cart-panel" className={`${showItemsModal ? 'pos-mobile-sheet-enter fixed inset-0 z-50 flex' : 'hidden'} w-auto shrink-0 flex-col overflow-y-auto overscroll-contain rounded-none border border-cyan-300/10 bg-[#020817]/95 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_22px_60px_rgba(0,0,0,0.34)] backdrop-blur-2xl [direction:rtl] sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] md:static md:flex md:h-full md:w-[280px] md:overflow-hidden md:rounded-[28px] md:bg-[#020817]/72 md:p-3 lg:w-[320px]`}>
            <div className="shrink-0 rounded-[24px] border border-cyan-300/10 bg-[#061426]/68 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black tracking-[0.18em] text-cyan-300">
                    AFEX POS
                  </p>
                  <h2 className="mt-1 text-xl font-black text-white">ملخص الفاتورة</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowItemsModal(false)}
                  aria-label="إغلاق ملخص الفاتورة"
                  className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-cyan-300/12 bg-[#020817]/70 text-xl font-black text-cyan-100 md:hidden"
                >
                  ×
                </button>
              </div>
              <p className="mt-1 text-xs font-bold text-slate-400">
                الفرع: {invoiceBranchName}
              </p>
            </div>

            <div className="mt-2.5 shrink-0 rounded-[24px] border border-cyan-300/10 bg-[#061426]/58 p-3.5">
              <p className="text-xs font-black text-slate-400">العميل</p>
              <p className="mt-2 truncate text-lg font-black text-white">
                {customerName || 'عميل غير محدد'}
              </p>
              <p className="mt-1 truncate text-sm font-bold text-slate-400">
                {customerPhone || 'بدون رقم جوال'}
              </p>
            </div>

            <div className="mt-2 flex min-h-[160px] shrink-0 flex-col rounded-[24px] border border-cyan-300/10 bg-[#061426]/50 p-2.5 md:min-h-0 md:flex-1">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-black text-white">العناصر المختارة</h3>
                <span className="rounded-full bg-cyan-300/12 px-3 py-1 text-xs font-black text-cyan-100">
                  {invoiceItemCount}
                </span>
              </div>

              {invoiceItems.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center rounded-[24px] border border-dashed border-cyan-300/16 bg-[#020817]/44 px-4 text-center text-sm font-bold leading-7 text-slate-400">
                  اختر العناصر من الشبكة لإضافتها إلى الفاتورة.
                </div>
              ) : (
                <div className="space-y-2 md:min-h-0 md:flex-1 md:overflow-y-auto md:pr-1">
                  {invoiceItems.map((item) => (
                    <div
                      key={item.item_name}
                      className="rounded-[20px] border border-cyan-300/10 bg-[#020817]/58 p-2.5 transition-all duration-200"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="line-clamp-2 break-words text-sm font-black text-white">
                            {item.item_name}
                          </p>
                          <p className="mt-1 text-xs font-bold text-slate-400">
                            <span className="sm:sr-only">سعر الوحدة: </span>
                            {formatCurrency(item.unit_price)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(item.item_name)}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-red-300 transition hover:bg-red-500/10 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70 touch-manipulation"
                          aria-label={`حذف ${item.item_name}`}
                        >
                          <TrashIcon />
                        </button>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1 rounded-2xl border border-cyan-300/10 bg-[#061426]/70 p-1">
                          <button
                            type="button"
                            onClick={() => decreaseOrRemoveItem(item.item_name, item.quantity)}
                            className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#020817]/80 text-lg font-black text-white transition hover:bg-cyan-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 touch-manipulation"
                            aria-label={`تقليل ${item.item_name}`}
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-sm font-black text-cyan-100">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => increaseQty(item)}
                            className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-300 text-lg font-black text-[#02101c] transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100 touch-manipulation"
                            aria-label={`زيادة ${item.item_name}`}
                          >
                            +
                          </button>
                        </div>
                        <p className="text-left text-sm font-black text-white">
                          <span className="mb-1 block text-[10px] font-bold text-slate-500 sm:hidden">
                            إجمالي العنصر
                          </span>
                          {formatCurrency(item.quantity * item.unit_price)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-2 shrink-0 rounded-[24px] border border-cyan-300/10 bg-[#061426]/58 p-3">
              <div className="space-y-2 text-sm font-bold">
                <div className="flex items-center justify-between text-slate-300">
                  <span>المجموع الفرعي</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {checkout.discountAmount > 0 ? (
                  <div className="flex items-center justify-between text-slate-300">
                    <span>الخصم</span>
                    <span>{formatCurrency(checkout.discountAmount)}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between text-slate-300">
                  <span>الضريبة</span>
                  <span>{formatCurrency(checkout.taxAmount)}</span>
                </div>
                <div className="mt-3 flex items-end justify-between border-t border-cyan-300/10 pt-3">
                  <span className="text-sm font-black text-cyan-100">الإجمالي</span>
                  <span className="text-3xl font-black text-white">
                    {formatCurrency(checkout.finalTotal)}
                  </span>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 z-10 -mx-3 mt-2 shrink-0 space-y-1.5 border-t border-cyan-300/10 bg-[#020817]/96 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:static sm:mx-0 sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0">
              <div className="flex items-end justify-between gap-3 px-1 pb-1 sm:hidden">
                <div>
                  <p className="text-[11px] font-black text-slate-400">{invoiceItemCount} عنصر في السلة</p>
                  <p className="mt-1 text-xl font-black text-white">
                    {formatCurrency(checkout.finalTotal)}
                  </p>
                </div>
                <p className="text-xs font-black text-emerald-200">جاهز للمتابعة</p>
              </div>
              <button
                type="button"
                onClick={() => router.push(checkoutHref)}
                disabled={invoiceItems.length === 0}
                className="h-14 w-full rounded-[22px] bg-emerald-400 text-base font-black text-[#02130c] shadow-[0_0_30px_rgba(52,211,153,0.28)] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none touch-manipulation"
              >
                إتمام البيع
              </button>
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                className="h-11 w-full rounded-[18px] border border-red-400/16 bg-red-500/8 text-sm font-black text-red-200 transition hover:bg-red-500/14 touch-manipulation"
              >
                إلغاء الفاتورة
              </button>
            </div>
          </aside>
        </div>

        {showCancelModal ? (
          <>
            <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" />
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
              <div className="w-full max-w-md rounded-[28px] border border-red-400/18 bg-[#020817]/95 p-6 text-right shadow-[0_28px_80px_rgba(0,0,0,0.55)]">
                <h2 className="text-lg font-black text-white">إلغاء الفاتورة</h2>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-300">
                  هل أنت متأكد من إلغاء الفاتورة؟
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    className="h-11 rounded-2xl border border-cyan-300/12 bg-[#061426] px-5 text-sm font-black text-slate-200 transition hover:bg-cyan-400/10"
                    onClick={() => setShowCancelModal(false)}
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    className="h-11 rounded-2xl bg-red-500 px-5 text-sm font-black text-white transition hover:bg-red-400"
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
      </div>
    )
  }

  const renderLegacyPosItemsLayout = false

  if (renderLegacyPosItemsLayout) {
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

        <div className="flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden bg-slate-950 p-0 pb-24 md:p-2 md:pb-28 lg:p-3 xl:pb-3">
          <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm lg:grid lg:[direction:ltr] lg:grid-cols-[1fr_340px]">
            <main className="order-2 min-w-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 md:p-4 lg:order-1 lg:flex lg:min-h-0 lg:flex-col lg:gap-3 lg:space-y-0 lg:overflow-hidden lg:[direction:rtl]">
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
                    <div className="flex items-center gap-3">
                      <div className="relative min-w-0 flex-1">
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
                      <div className="group relative shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            void forceReloadCatalog({ showRefreshing: true })
                          }
                          disabled={catalogLoading || catalogRefreshing}
                          aria-label="تحديث المخزون"
                          className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-100/80 text-slate-950 shadow-[0_10px_28px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.75)] transition hover:border-slate-300 hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60 touch-manipulation"
                        >
                          <InventoryRefreshIcon
                            className={`h-6 w-6 ${
                              catalogRefreshing ? 'animate-spin' : ''
                            }`}
                          />
                        </button>
                        <span className="pointer-events-none absolute left-1/2 top-[calc(100%+0.5rem)] z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100">
                          تحديث المخزون
                        </span>
                      </div>
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
                    جارٍ تحميل العناصر...
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
              جارٍ تحميل العناصر...
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
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)
  const [unsuitableImageUrl, setUnsuitableImageUrl] = useState<string | null>(null)
  const imageHeightClass = compact ? 'h-24 sm:h-24 md:h-28' : 'h-36 md:h-40 xl:h-44'
  const imageFrameClass =
    frameClassName?.trim()
      ? `relative overflow-hidden rounded-xl ${frameClassName}`
      : `relative w-full overflow-hidden rounded-xl bg-slate-50 ${imageHeightClass}`
  const shouldRenderImage = Boolean(
    normalizedImageUrl &&
      failedImageUrl !== normalizedImageUrl &&
      unsuitableImageUrl !== normalizedImageUrl
  )
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
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-110 bg-[#020817] object-cover object-center opacity-25 blur-xl"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-[#020817]/38" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={normalizedImageUrl ?? undefined}
        alt={name}
        className="relative z-10 mx-auto h-full max-h-[90%] w-full max-w-[90%] bg-transparent object-contain object-center"
        loading="lazy"
        onLoad={(event) => {
          const image = event.currentTarget
          if (image.naturalWidth < 300 || image.naturalHeight < 180) {
            setUnsuitableImageUrl(normalizedImageUrl)
          }
        }}
        onError={() => setFailedImageUrl(normalizedImageUrl)}
      />
    </div>
  )
}

function PosCatalogItemPlaceholder({
  imageFrameClass,
  posDisplayMode,
  posColor,
  shapeClasses,
  shapeStyle,
}: {
  imageFrameClass: string
  posDisplayMode?: 'style' | 'image' | null
  posColor?: string | null
  shapeClasses: string
  shapeStyle?: CSSProperties
}) {
  const accentColor =
    posDisplayMode === 'style' && posColor?.trim() ? posColor : '#22D3EE'

  return (
    <div className={imageFrameClass}>
      <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_38%,rgba(34,211,238,0.18),transparent_46%),linear-gradient(135deg,rgba(2,8,23,0.96),rgba(6,20,38,0.92))] text-center">
        <div className="px-2">
        <div
          className={`mx-auto flex h-10 w-10 items-center justify-center border border-cyan-300/20 bg-cyan-300/10 text-cyan-200 shadow-[0_0_26px_rgba(34,211,238,0.14)] ${shapeClasses}`}
          style={{
            boxShadow: '0 8px 24px rgba(34, 211, 238, 0.12)',
            ...(posDisplayMode === 'style'
              ? {
                  backgroundColor: `${accentColor}22`,
                  borderColor: `${accentColor}55`,
                }
              : {}),
            ...shapeStyle,
          }}
        >
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
        </div>
        <p className="mt-2 text-[10px] font-bold text-cyan-100/70">
          لا توجد صورة مناسبة
        </p>
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

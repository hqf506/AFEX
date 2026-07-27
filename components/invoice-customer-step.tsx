'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { PosStepIndicator } from '@/components/pos-step-indicator'
import { useMobileViewport } from '@/hooks/use-mobile-viewport'
import { getClientCaughtErrorMessage, getClientErrorMessage } from '@/lib/api/client-error'
import {
  isClientResourceFresh,
  loadClientResource,
  peekClientResource,
  prefetchClientResource,
} from '@/lib/client-resource-cache'
import {
  clearAllInvoiceCatalogCache,
  prefetchBranchInvoiceCatalog,
} from '@/lib/invoices/catalog'
import {
  INVOICE_CUSTOMER_STORAGE_KEY,
  isInvoiceCustomerDraftValid,
  parseStoredInvoiceCustomerDraft,
  serializeInvoiceCustomerDraft,
} from '@/lib/invoices/customer'
import {
  PosAddCustomerModal,
  type CreatedPosCustomer,
} from '@/components/pos-add-customer-modal'
import {
  clearActivePosEmployee,
  markPosLoggedOut,
  readActivePosEmployee,
} from '@/lib/pos-employee-session'
import { getRoleLabel } from '@/lib/app-roles'
import { usePageAccess, type UsePageAccessOptions } from '@/hooks/use-page-access'
import { formatPosGregorianDate } from '@/lib/pos/date-format'

type ExistingCustomer = CreatedPosCustomer

const ADMIN_CATEGORIES_CACHE_KEY = 'admin-categories'
const ADMIN_CATEGORIES_CACHE_TTL_MS = 60_000
const CUSTOMER_SEARCH_CACHE_TTL_MS = 30_000
const CUSTOMER_SEARCH_DEBOUNCE_MS = 300
const RECENT_CUSTOMERS_CACHE_TTL_MS = 30_000

const posSidebarItems = [
  { id: 'home', label: 'الرئيسية', href: '/pos', icon: 'home' as const },
  { id: 'new-sale', label: 'بيع جديد', href: '/pos/sale/customer', icon: 'cart' as const },
  { id: 'customers', label: 'العملاء', href: '/pos/sale/customer', icon: 'user' as const },
  { id: 'products', label: 'المنتجات', href: '/pos/sale/items', icon: 'box' as const },
  { id: 'orders', label: 'الطلبات', href: '/pos', icon: 'note' as const },
  { id: 'payments', label: 'المدفوعات', href: '/pos/sale/checkout', icon: 'card' as const },
  { id: 'settings', label: 'الإعدادات', href: '/pos/settings', icon: 'settings' as const },
]

type InvoiceCustomerStepProps = {
  heroTitle: string
  heroSubtitle: string
  sectionTitle: string
  sectionSubtitle: string
  backHref: string
  backLabel: string
  nextHref: string
  originBadgeLabel: string
  showPosStepIndicator?: boolean
  variant?: 'default' | 'pos'
}

function normalizeCustomerLookup(
  phone: string,
  name: string,
  branchKey: string | null
) {
  const normalizedPhone = phone.trim()
  const phoneDigits = normalizedPhone.replace(/\D/g, '')
  const normalizedName = name.trim()
  const cacheBranchKey = branchKey || 'all'

  if (phoneDigits.length >= 3) {
    return {
      query: normalizedPhone,
      cacheKey: `customer-search:${cacheBranchKey}:phone:${phoneDigits}`,
      active: true,
    } as const
  }

  if (normalizedName.length >= 2) {
    return {
      query: normalizedName,
      cacheKey: `customer-search:${cacheBranchKey}:name:${normalizedName.toLocaleLowerCase('ar')}`,
      active: true,
    } as const
  }

  return {
    query: '',
    cacheKey: '',
    active: false,
  } as const
}

export function InvoiceCustomerStep({
  heroTitle,
  heroSubtitle,
  sectionTitle,
  sectionSubtitle,
  backHref,
  backLabel,
  nextHref,
  originBadgeLabel,
  showPosStepIndicator = false,
  variant = 'default',
}: InvoiceCustomerStepProps) {
  const router = useRouter()
  const pathname = usePathname()
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
  const {
    authError,
    authLoading,
    authStatus,
    allowed,
    roleLabel,
    branchId,
    tenantId,
  } = usePageAccess(pageAccessOptions)

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerMatches, setCustomerMatches] = useState<ExistingCustomer[]>([])
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false)
  const [customerSearchError, setCustomerSearchError] = useState('')
  const [recentCustomers, setRecentCustomers] = useState<ExistingCustomer[]>([])
  const [recentCustomersLoading, setRecentCustomersLoading] = useState(false)
  const [recentCustomersError, setRecentCustomersError] = useState('')
  const [customerListLimit, setCustomerListLimit] = useState(6)
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const customerSearchRequestIdRef = useRef(0)
  const customerPhoneInputRef = useRef<HTMLInputElement | null>(null)
  const addCustomerButtonRef = useRef<HTMLButtonElement | null>(null)

  const normalizedCustomerPhone = customerPhone.replace(/[\s()-]/g, '')
  const isValidSaudiPhone = /^(?:\+?966|0)?5\d{8}$/.test(normalizedCustomerPhone)
  const isValid =
    isInvoiceCustomerDraftValid(customerName, customerPhone) && isValidSaudiPhone
  const activePosEmployee = variant === 'pos' ? readActivePosEmployee() : null
  const employeeDisplayName =
    activePosEmployee?.full_name?.trim() ||
    activePosEmployee?.username?.trim() ||
    'فيصل'
  const employeeRoleLabel =
    activePosEmployee?.role === 'cashier'
      ? 'أمين صندوق'
      : getRoleLabel(activePosEmployee?.role) || roleLabel || 'أمين صندوق'
  const customerSearchBranchId =
    variant === 'pos' ? activePosEmployee?.branch_id || branchId || null : null
  const customerSearch = normalizeCustomerLookup(
    customerPhone,
    customerName,
    customerSearchBranchId
  )
  const visibleCustomerCards = customerSearch.active
    ? customerMatches
    : recentCustomers
  const customerCardsLoading = customerSearch.active
    ? customerSearchLoading
    : recentCustomersLoading
  const customerCardsError = customerSearch.active
    ? customerSearchError
    : recentCustomersError
  const canLoadMoreCustomers = visibleCustomerCards.length > customerListLimit
  const isMobileViewport = useMobileViewport()

  useEffect(() => {
    if (!allowed) return

    if (!customerSearch.active) {
      const clearTimeoutId = window.setTimeout(() => {
        setCustomerMatches([])
        setCustomerSearchLoading(false)
        setCustomerSearchError('')
      }, 0)

      return () => window.clearTimeout(clearTimeoutId)
    }

    const requestId = customerSearchRequestIdRef.current + 1
    customerSearchRequestIdRef.current = requestId
    const cachedMatches =
      peekClientResource<ExistingCustomer[]>(customerSearch.cacheKey) || []

    if (
      isClientResourceFresh(
        customerSearch.cacheKey,
        CUSTOMER_SEARCH_CACHE_TTL_MS
      )
    ) {
      const cachedTimeoutId = window.setTimeout(() => {
        setCustomerMatches(cachedMatches)
        setCustomerSearchError('')
        setCustomerSearchLoading(false)
      }, 0)

      return () => window.clearTimeout(cachedTimeoutId)
    }

    let cachedTimeoutId: number | null = null

    if (cachedMatches.length > 0) {
      cachedTimeoutId = window.setTimeout(() => {
        setCustomerMatches(cachedMatches)
        setCustomerSearchError('')
        setCustomerSearchLoading(false)
      }, 0)
    }

    const controller = new AbortController()

    const timeoutId = window.setTimeout(async () => {

      if (process.env.NODE_ENV === 'development') {
        console.time('customer search')
      }

      setCustomerSearchLoading(true)
      setCustomerSearchError('')

      try {
        const nextMatches = await loadClientResource(
          customerSearch.cacheKey,
          async () => {
            const searchParams = new URLSearchParams({
              q: customerSearch.query,
            })

            if (customerSearchBranchId) {
              searchParams.set('branchId', customerSearchBranchId)
            } else if (variant === 'pos') {
              console.warn('[POS CUSTOMER] missing branch context for customer search', {
                authBranchId: branchId,
                activePosEmployeeBranchId: activePosEmployee?.branch_id || null,
              })
            }

            const response = await fetch(
              `/api/customers?${searchParams.toString()}`,
              {
                method: 'GET',
                credentials: 'include',
                signal: controller.signal,
              }
            )

            const result = await response.json().catch(() => null)

            if (!response.ok || !result?.success) {
              throw new Error(result?.error || 'فشل البحث عن العملاء')
            }

            return Array.isArray(result.customers)
              ? (result.customers as ExistingCustomer[])
              : []
          },
          {
            ttlMs: CUSTOMER_SEARCH_CACHE_TTL_MS,
            logLabel: 'fetch customers',
          }
        )

        if (customerSearchRequestIdRef.current !== requestId) {
          return
        }

        setCustomerMatches(nextMatches)
        setCustomerSearchError('')
        setCustomerSearchLoading(false)
      } catch (error) {
        if (controller.signal.aborted || customerSearchRequestIdRef.current !== requestId) {
          return
        }

        setCustomerMatches(
          peekClientResource<ExistingCustomer[]>(customerSearch.cacheKey) || []
        )
        setCustomerSearchError(
          getClientCaughtErrorMessage(error, 'فشل البحث عن العملاء')
        )
        setCustomerSearchLoading(false)
      } finally {
        if (process.env.NODE_ENV === 'development') {
          console.timeEnd('customer search')
        }
      }
    }, CUSTOMER_SEARCH_DEBOUNCE_MS)

    return () => {
      customerSearchRequestIdRef.current += 1
      controller.abort()
      if (cachedTimeoutId !== null) {
        window.clearTimeout(cachedTimeoutId)
      }
      window.clearTimeout(timeoutId)
    }
  }, [
    activePosEmployee?.branch_id,
    allowed,
    branchId,
    customerSearch.active,
    customerSearch.cacheKey,
    customerSearch.query,
    customerSearchBranchId,
    variant,
  ])

  useEffect(() => {
    if (!allowed || variant !== 'pos') {
      return
    }

    const controller = new AbortController()
    const cacheBranchKey = customerSearchBranchId || 'all'
    const cacheKey = `recent-customers:${cacheBranchKey}`
    const loadingTimeoutId = window.setTimeout(() => {
      setRecentCustomersLoading(true)
      setRecentCustomersError('')
    }, 0)

    void loadClientResource(
      cacheKey,
      async () => {
        const searchParams = new URLSearchParams({
          recent: '1',
        })

        if (customerSearchBranchId) {
          searchParams.set('branchId', customerSearchBranchId)
        }

        const response = await fetch(
          `/api/customers?${searchParams.toString()}`,
          {
            method: 'GET',
            credentials: 'include',
            signal: controller.signal,
          }
        )

        const result = await response.json().catch(() => null)

        if (!response.ok || !result?.success) {
          throw new Error(result?.error || 'فشل تحميل العملاء')
        }

        return Array.isArray(result.customers)
          ? (result.customers as ExistingCustomer[])
          : []
      },
      {
        ttlMs: RECENT_CUSTOMERS_CACHE_TTL_MS,
        logLabel: 'fetch recent customers',
      }
    )
      .then((customers) => {
        window.clearTimeout(loadingTimeoutId)
        if (!controller.signal.aborted) {
          setRecentCustomers(customers)
          setRecentCustomersError('')
          setRecentCustomersLoading(false)
        }
      })
      .catch((error) => {
        window.clearTimeout(loadingTimeoutId)
        if (controller.signal.aborted) {
          return
        }

        setRecentCustomers([])
        setRecentCustomersError(
          getClientCaughtErrorMessage(error, 'فشل تحميل العملاء')
        )
        setRecentCustomersLoading(false)
      })

    return () => {
      controller.abort()
      window.clearTimeout(loadingTimeoutId)
    }
  }, [allowed, customerSearchBranchId, variant])

  useEffect(() => {
    if (!allowed || variant !== 'pos') {
      return
    }

    router.prefetch('/pos/sale/items')
    router.prefetch('/pos/sale/checkout')

    void prefetchClientResource(
      ADMIN_CATEGORIES_CACHE_KEY,
      async () => {
        const response = await fetch('/api/admin/categories', {
          method: 'GET',
          cache: 'no-store',
        })

        const result = await response.json().catch(() => null)

        if (!response.ok || !result) {
          throw new Error(
            getClientErrorMessage(
              result,
              'تعذر تحميل المنتجات حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'
            )
          )
        }

        return Array.isArray(result.categories) ? result.categories : []
      },
      {
        ttlMs: ADMIN_CATEGORIES_CACHE_TTL_MS,
        logLabel: 'fetch categories',
      }
    )

    if (customerSearchBranchId && tenantId) {
      void prefetchBranchInvoiceCatalog(customerSearchBranchId, tenantId)
    }
  }, [allowed, customerSearchBranchId, router, tenantId, variant])

  useEffect(() => {
    if (variant !== 'pos' || !allowed) {
      return
    }

    const storedCustomer = parseStoredInvoiceCustomerDraft(
      localStorage.getItem(INVOICE_CUSTOMER_STORAGE_KEY)
    )

    const timeoutId = window.setTimeout(() => {
      if (storedCustomer) {
        setCustomerName(storedCustomer.name)
        setCustomerPhone(storedCustomer.phone)
      }
      customerPhoneInputRef.current?.focus({ preventScroll: true })
    }, 150)

    return () => window.clearTimeout(timeoutId)
  }, [allowed, variant])

  const handleNext = () => {
    if (!isValid) {
      alert(
        !customerName.trim()
          ? 'اسم العميل مطلوب.'
          : 'أدخل رقم جوال سعودي صحيحًا.'
      )
      return
    }

    localStorage.setItem(
      INVOICE_CUSTOMER_STORAGE_KEY,
      serializeInvoiceCustomerDraft({
        name: customerName,
        phone: customerPhone,
      })
    )

    router.push(nextHref)
  }

  const handleReset = () => {
    setCustomerName('')
    setCustomerPhone('')
    setSelectedCustomerId(null)
    setCustomerMatches([])
    setCustomerSearchError('')
  }

  const selectExistingCustomer = (customer: ExistingCustomer) => {
    setCustomerName(customer.name)
    setCustomerPhone(customer.phone)
    setSelectedCustomerId(customer.id)
    setCustomerSearchError('')
  }

  const openAddCustomerModal = () => {
    setAddCustomerOpen(true)
  }

  const closeAddCustomerModal = () => {
    setAddCustomerOpen(false)
    window.setTimeout(() => {
      addCustomerButtonRef.current?.focus({ preventScroll: true })
    }, 0)
  }

  const changeSelectedCustomer = () => {
    setSelectedCustomerId(null)
    window.setTimeout(() => {
      customerPhoneInputRef.current?.focus({ preventScroll: true })
    }, 0)
  }

  const handleCustomerCreated = (createdCustomer: ExistingCustomer) => {
    setCustomerName(createdCustomer.name)
    setCustomerPhone(createdCustomer.phone)
    setSelectedCustomerId(createdCustomer.id)
    setCustomerSearchError('')
    setCustomerMatches((currentMatches) => [
      createdCustomer,
      ...currentMatches.filter((customer) => customer.id !== createdCustomer.id),
    ])
    setRecentCustomers((currentCustomers) => [
      createdCustomer,
      ...currentCustomers.filter((customer) => customer.id !== createdCustomer.id),
    ])
    setAddCustomerOpen(false)
  }

  const handlePosLogout = () => {
    const hasActiveSale = Boolean(customerName.trim() || customerPhone.trim())
    if (
      hasActiveSale &&
      !window.confirm(
        'لديك عملية بيع غير مكتملة. هل تريد تسجيل الخروج وتركها محفوظة؟'
      )
    ) {
      return
    }

    if (hasActiveSale) {
      localStorage.setItem(
        INVOICE_CUSTOMER_STORAGE_KEY,
        serializeInvoiceCustomerDraft({ name: customerName, phone: customerPhone })
      )
    }

    clearAllInvoiceCatalogCache()
    clearActivePosEmployee()
    markPosLoggedOut()
    router.replace('/pos/login')
  }

  if (authError === 'timeout' && variant === 'pos') {
    console.warn('[POS CUSTOMER] auth timeout', pathname, authStatus)
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

  if (authLoading) {
    return <div className="page-card">جارٍ التحقق من الصلاحية...</div>
  }

  if (!allowed) {
    return <div className="page-card">جارٍ التحويل...</div>
  }

  if (variant === 'pos') {
    return (
      <div className="pos-customer-motion fixed inset-0 z-[60] flex h-[100svh] w-screen min-w-0 overflow-hidden bg-[#020817] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-white [direction:ltr] sm:p-5 xl:p-7">
        <style jsx global>{`
          @keyframes pos-customer-enter {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }

          @keyframes pos-customer-sheet-enter {
            from { opacity: 0; transform: translateY(18px) scale(0.99); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }

          @media (max-width: 639px) {
            .pos-customer-enter { animation: pos-customer-enter 200ms ease-out both; }
            .pos-customer-sheet-enter { animation: pos-customer-sheet-enter 200ms ease-out both; }
          }

          @media (prefers-reduced-motion: reduce) {
            .pos-customer-motion *,
            .pos-customer-motion *::before,
            .pos-customer-motion *::after {
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              scroll-behavior: auto !important;
              transition-duration: 0.01ms !important;
            }
          }
        `}</style>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(34,211,238,0.12),transparent_28%),radial-gradient(circle_at_82%_8%,rgba(34,211,238,0.09),transparent_26%),linear-gradient(135deg,#020817_0%,#04101F_48%,#061426_100%)]" />
        <div className="pointer-events-none absolute inset-x-32 top-0 h-px bg-[#22D3EE]/25 blur-sm" />

        <div className="pos-customer-enter relative z-10 flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto overscroll-contain sm:flex-row sm:overflow-hidden xl:gap-6">
          <aside className="order-6 hidden w-full shrink-0 flex-col overflow-hidden rounded-[28px] bg-[rgba(2,8,23,0.68)] p-3 shadow-[0_22px_60px_rgba(0,0,0,0.24),inset_0_0_0_1px_rgba(34,211,238,0.10)] backdrop-blur-2xl [direction:rtl] sm:order-3 sm:flex sm:w-[206px] xl:w-[220px]">
            <div className="mb-3 rounded-[24px] bg-[rgba(6,20,38,0.62)] px-3 py-3 text-center shadow-[inset_0_0_0_1px_rgba(34,211,238,0.07)] sm:mb-5 sm:py-4">
              <p className="text-2xl font-black tracking-[0.18em] text-cyan-50 drop-shadow-[0_0_14px_rgba(34,211,238,0.22)]">
                AFEX
              </p>
              <p className="mt-0.5 text-xs font-black tracking-[0.26em] text-[#22D3EE]">
                POS
              </p>
            </div>

            <nav className="grid min-h-0 flex-1 grid-cols-2 gap-1.5 overflow-hidden sm:block sm:space-y-1.5">
              {posSidebarItems.map((item) => {
                const isActive = item.id === 'customers'

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`group relative flex min-h-[45px] items-center gap-2.5 overflow-hidden rounded-[18px] border px-3 text-sm font-black transition-all duration-150 active:scale-[0.98] ${
                      isActive
                        ? 'border-transparent bg-[rgba(34,211,238,0.10)] text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.11),inset_0_0_24px_rgba(34,211,238,0.07)]'
                        : 'border-transparent text-slate-300/86 hover:border-[rgba(34,211,238,0.14)] hover:bg-[rgba(34,211,238,0.055)] hover:text-white'
                    }`}
                  >
                    {isActive ? (
                      <span
                        aria-hidden="true"
                        className="absolute bottom-3 left-2.5 top-3 w-1 rounded-full bg-[#22D3EE] shadow-[0_0_14px_rgba(34,211,238,0.70)]"
                      />
                    ) : null}
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-2xl transition ${
                        isActive ? 'text-cyan-100' : 'text-slate-400 group-hover:text-cyan-100'
                      }`}
                    >
                      <PosCustomerIcon name={item.icon} className="h-4.5 w-4.5" />
                    </span>
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </nav>

            <div className="mt-3 grid gap-2.5 sm:mt-4 sm:block sm:space-y-2.5">
              <div className="rounded-[22px] bg-[rgba(6,20,38,0.58)] p-3 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08),inset_0_0_20px_rgba(34,211,238,0.03)]">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#22D3EE] text-sm font-black text-slate-950 shadow-[0_0_16px_rgba(34,211,238,0.14)]">
                    {employeeDisplayName.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-white">{employeeDisplayName}</p>
                    <p className="mt-1 truncate text-xs font-bold text-slate-400">
                      {employeeRoleLabel}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    clearAllInvoiceCatalogCache()
                    clearActivePosEmployee()
                    router.replace('/pos/employee-pin')
                  }}
                  className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[14px] bg-[rgba(34,211,238,0.08)] text-xs font-black text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.10)] transition hover:bg-[rgba(34,211,238,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.98]"
                >
                  تبديل الموظف
                </button>
              </div>
              <button
                type="button"
                onClick={handlePosLogout}
                className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[18px] bg-red-500/12 px-4 text-sm font-black text-red-100 shadow-[0_0_20px_rgba(248,113,113,0.14),inset_0_0_0_1px_rgba(248,113,113,0.24)] transition hover:bg-red-500/18 active:scale-[0.98]"
              >
                <PosCustomerIcon name="logout" className="h-5 w-5" />
                تسجيل الخروج
              </button>
            </div>
          </aside>

          <aside className="contents sm:order-2 sm:flex sm:w-[250px] sm:shrink-0 sm:flex-col sm:overflow-hidden sm:rounded-[28px] sm:bg-[rgba(2,8,23,0.68)] sm:p-3.5 sm:shadow-[0_22px_60px_rgba(0,0,0,0.24),inset_0_0_0_1px_rgba(34,211,238,0.12)] sm:backdrop-blur-2xl sm:[direction:rtl] xl:w-[268px] xl:p-4">
            <h2 className="hidden px-1 text-right text-xl font-black text-white sm:order-none sm:block">العميل الحالي</h2>

            <div className={`order-2 min-w-0 rounded-[20px] bg-[rgba(6,20,38,0.62)] px-4 py-3 text-right shadow-[inset_0_0_0_1px_rgba(34,211,238,0.10)] [direction:rtl] sm:hidden ${selectedCustomerId ? 'block' : 'hidden'}`}>
              {selectedCustomerId ? (
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-400/14 text-base font-black text-emerald-200 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.22)]">
                    ✓
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-black text-white">{customerName.trim()}</p>
                    <p dir="ltr" className="mt-1 truncate text-right text-xs font-bold text-cyan-100/80">
                      {customerPhone.trim()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={changeSelectedCustomer}
                    className="min-h-[44px] shrink-0 rounded-[14px] bg-cyan-300/10 px-4 text-xs font-black text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 active:scale-[0.98]"
                  >
                    تغيير
                  </button>
                </div>
              ) : (
                <div className="flex min-h-[72px] items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-100">
                    <PosCustomerIcon name="user" className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-black text-white">لم يتم اختيار عميل</p>
                    <p className="mt-1 text-xs font-bold leading-5 text-slate-400">
                      ابحث بالجوال أو الاسم، ثم اختر بطاقة العميل.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="hidden rounded-[24px] bg-[rgba(6,20,38,0.52)] p-4 text-center shadow-[inset_0_0_0_1px_rgba(34,211,238,0.09)] sm:order-none sm:mt-4 sm:block">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(34,211,238,0.08)] text-[#22D3EE] shadow-[0_0_28px_rgba(34,211,238,0.12),inset_0_0_0_1px_rgba(34,211,238,0.12)]">
                <PosCustomerIcon name="user" className="h-7 w-7" />
              </span>
              <p className="mt-5 truncate text-2xl font-black text-white">
                {customerName.trim() || 'لم يتم اختيار عميل'}
              </p>
              <p className="mt-2 text-sm font-bold text-slate-400">
                {customerPhone.trim() ? 'رقم العميل' : 'اختر عميل من النتائج'}
              </p>
              <p dir="ltr" className="mt-2 break-all text-center text-lg font-black text-cyan-100">
                {customerPhone.trim() || '—'}
              </p>
              <p className="mt-2 text-sm font-black text-cyan-50/90">
                {selectedCustomerId ? 'عميل موجود' : customerName.trim() ? 'عميل جديد' : 'غير محدد'}
              </p>
            </div>

            <div className="contents sm:mt-4 sm:grid sm:gap-3">
              <button
                type="button"
                onClick={handleNext}
                disabled={!selectedCustomerId}
                className={`sticky bottom-0 z-20 order-7 flex min-h-[64px] items-center justify-between rounded-[22px] px-5 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80 active:scale-[0.98] sm:static sm:order-none ${
                  selectedCustomerId
                    ? 'bg-gradient-to-l from-cyan-300 via-sky-400 to-blue-600 text-white shadow-[0_16px_36px_rgba(14,165,233,0.28)] sm:bg-emerald-400 sm:bg-none sm:text-slate-950 sm:shadow-[0_0_24px_rgba(52,211,153,0.20)]'
                    : 'cursor-not-allowed bg-[rgba(6,20,38,0.42)] text-slate-500 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.08)]'
                }`}
              >
                <span>
                  <span className="block text-base font-black"><span className="sm:hidden">متابعة إلى نقطة البيع</span><span className="hidden sm:inline">الانتقال إلى العناصر →</span></span>
                  <span className="mt-1 hidden text-xs font-bold opacity-70 sm:block">تابع إلى المنتجات</span>
                </span>
                <PosCustomerIcon name="arrowLeft" className="h-6 w-6" />
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="order-5 hidden min-h-[62px] items-center justify-between rounded-[22px] bg-[rgba(6,20,38,0.46)] px-4 text-right text-slate-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)] transition hover:bg-red-400/10 hover:text-red-100 active:scale-[0.98] sm:order-none sm:flex"
              >
                <span>
                  <span className="block text-base font-black">مسح البيانات</span>
                  <span className="mt-1 block text-xs font-bold text-slate-500">إعادة تعيين البحث والاختيار</span>
                </span>
                <PosCustomerIcon name="trash" className="h-6 w-6" />
              </button>
            </div>

            <div className="order-8 mt-auto hidden pt-4 sm:order-none sm:block">
              <Link
                href={backHref}
                className="flex min-h-[56px] items-center justify-center gap-3 rounded-[20px] bg-[rgba(6,20,38,0.46)] px-4 text-sm font-black text-slate-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.06)] transition hover:bg-[rgba(34,211,238,0.07)] hover:text-cyan-100 active:scale-[0.98]"
              >
                <PosCustomerIcon name="arrowRight" className="h-5 w-5" />
                {backLabel}
              </Link>
            </div>
          </aside>

          <main className="contents sm:order-1 sm:flex sm:min-h-0 sm:min-w-0 sm:flex-1 sm:flex-col sm:overflow-hidden sm:rounded-[30px] sm:bg-transparent sm:p-1 sm:[direction:rtl]">
            <header data-pos-mobile-customer-header className="order-1 flex shrink-0 items-start justify-between gap-5 px-1 [direction:rtl]">
              <div className="flex min-w-0 items-start gap-3 text-right sm:block">
                <span className="mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-[16px] bg-cyan-300/[0.07] text-cyan-300 sm:hidden">
                  <PosCustomerIcon name="users" className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                <p className="hidden text-sm font-black text-[#22D3EE] sm:block">بيانات العميل</p>
                <h2 className="mt-2 text-[30px] font-black leading-tight text-white sm:mt-4 sm:text-4xl xl:text-[44px]">
                  <span className="sm:hidden">العملاء</span>
                  <span className="hidden sm:inline">بيانات العميل</span>
                </h2>
                <p className="mt-3 text-sm font-bold leading-6 text-slate-400">
                  <span className="sm:hidden">ابحث عن عميل أو أضف عميل جديد</span>
                  <span className="hidden sm:inline">ابحث بالجوال أو الاسم ثم اختر العميل أو تابع كعميل جديد.</span>
                </p>
                </div>
              </div>

              <Link
                href={backHref}
                aria-label={backLabel}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-[17px] border border-cyan-300/25 bg-cyan-300/[0.04] text-slate-200 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.96] sm:hidden"
              >
                <PosCustomerIcon name="arrowLeft" className="h-6 w-6" />
              </Link>

              <div className="hidden rounded-[22px] bg-[rgba(2,8,23,0.58)] px-5 py-4 text-left shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)] sm:block">
                <p className="text-xs font-bold text-slate-500">الخطوة</p>
                <p className="mt-1 text-sm font-black text-cyan-100">1 من 3</p>
              </div>
            </header>

            <section data-pos-mobile-customer-search className="order-3 mt-4 shrink-0 rounded-[26px] border border-cyan-300/12 bg-[rgba(6,20,38,0.62)] p-4 [direction:rtl] sm:mt-7 sm:rounded-[28px] sm:border-0 sm:bg-[rgba(2,8,23,0.62)] sm:p-5 sm:shadow-[0_0_26px_rgba(34,211,238,0.07),inset_0_0_0_1px_rgba(34,211,238,0.12)] xl:p-6">
              <h3 className="mb-5 text-xl font-black text-white sm:hidden">ابحث عن عميل</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-300">
                    <span className="sm:hidden">رقم الجوال </span><span className="hidden sm:inline">بحث بالجوال </span><span className="text-cyan-300">(مطلوب)</span>
                  </span>
                  <div className="relative">
                    <input
                      ref={customerPhoneInputRef}
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => {
                        setCustomerPhone(e.target.value)
                        setSelectedCustomerId(null)
                      }}
                      placeholder={isMobileViewport ? 'رقم الجوال' : '05xxxxxxxx'}
                      className="h-[60px] w-full rounded-[20px] border-0 bg-[rgba(2,8,23,0.64)] px-5 pl-14 text-right text-base font-bold text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16)] outline-none transition placeholder:text-slate-500 focus:shadow-[0_0_20px_rgba(34,211,238,0.10),inset_0_0_0_1px_rgba(34,211,238,0.34)] touch-manipulation sm:h-[66px] sm:rounded-[22px] sm:bg-[rgba(6,20,38,0.76)] sm:text-lg"
                      inputMode="tel"
                      autoComplete="tel"
                      enterKeyHint="search"
                      aria-required="true"
                    />
                    <PosCustomerIcon name="phone" className="pointer-events-none absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-cyan-100/80" />
                  </div>
                </label>

                <div className="flex items-center gap-3 text-xs font-black text-slate-500 sm:hidden">
                  <span className="h-px flex-1 bg-cyan-300/10" />
                  أو
                  <span className="h-px flex-1 bg-cyan-300/10" />
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-300">
                    بحث بالاسم <span className="text-cyan-300"><span className="sm:hidden">(اختياري)</span><span className="hidden sm:inline">(مطلوب)</span></span>
                  </span>
                  <div className="relative">
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => {
                        setCustomerName(e.target.value)
                        setSelectedCustomerId(null)
                      }}
                      placeholder={isMobileViewport ? 'بحث بالاسم' : 'اكتب اسم العميل'}
                      autoComplete="name"
                      enterKeyHint="search"
                      aria-required="true"
                      className="h-[60px] w-full rounded-[20px] border-0 bg-[rgba(2,8,23,0.64)] px-5 pl-14 text-right text-base font-bold text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16)] outline-none transition placeholder:text-slate-500 focus:shadow-[0_0_20px_rgba(34,211,238,0.10),inset_0_0_0_1px_rgba(34,211,238,0.34)] touch-manipulation sm:h-[66px] sm:rounded-[22px] sm:bg-[rgba(6,20,38,0.76)] sm:text-lg"
                    />
                    <PosCustomerIcon name="user" className="pointer-events-none absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-cyan-100/80" />
                  </div>
                </label>
              </div>

              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => customerPhoneInputRef.current?.blur()}
                  className="flex min-h-[56px] flex-1 items-center justify-center gap-3 rounded-[20px] bg-gradient-to-l from-cyan-300/25 to-blue-600/40 text-base font-black text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.55),0_12px_28px_rgba(14,165,233,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80 active:scale-[0.98] sm:hidden"
                >
                  بحث
                  <PosCustomerIcon name="search" className="h-5 w-5" />
                </button>
                <button
                  ref={addCustomerButtonRef}
                  type="button"
                  onClick={openAddCustomerModal}
                  aria-label="إضافة عميل جديد"
                  title="إضافة عميل جديد"
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-cyan-300/10 text-cyan-200 shadow-[0_0_22px_rgba(34,211,238,0.12),inset_0_0_0_1px_rgba(34,211,238,0.34)] transition hover:bg-cyan-300/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80 active:scale-95"
                >
                  <PosCustomerIcon name="userPlus" className="h-6 w-6 sm:hidden" />
                  <PosCustomerIcon name="plus" className="hidden h-6 w-6 sm:block" />
                </button>
              </div>

              {customerSearchLoading ? (
                <p className="mt-3 text-xs font-black text-cyan-100">بحث...</p>
              ) : null}
              {!isValid ? (
                <p className="mt-3 text-xs font-bold text-amber-100">
                  <span className="sm:hidden">أدخل رقم الجوال أو الاسم للبحث عن العميل.</span><span className="hidden sm:inline">أدخل اسم العميل ورقم الجوال للمتابعة إلى العناصر.</span>
                </p>
              ) : null}
            </section>

            <section data-pos-mobile-customer-results className="order-4 mt-5 flex min-h-0 flex-none flex-col overflow-visible rounded-[24px] bg-transparent p-0 [direction:rtl] sm:mt-5 sm:min-h-0 sm:flex-1 sm:overflow-hidden sm:rounded-[28px] sm:bg-[rgba(2,8,23,0.56)] sm:p-5 sm:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)] xl:p-6">
              <div className="mb-4 flex shrink-0 items-center justify-between gap-4">
                <div className="text-right">
                  <h3 className="text-xl font-black text-white sm:text-2xl">
                    {customerSearch.active ? 'نتائج البحث' : <><span className="sm:hidden">عملاء مختصرون</span><span className="hidden sm:inline">العملاء الأخيرون</span></>}
                  </h3>
                  <p className="mt-1 hidden text-xs font-bold text-slate-500 sm:block">
                    نتائج البحث وآخر العملاء بنفس نمط بطاقات POS.
                  </p>
                </div>
                <button type="button" onClick={() => setCustomerListLimit((currentLimit) => currentLimit + 6)} disabled={!canLoadMoreCustomers} className="min-h-[44px] rounded-full bg-[rgba(34,211,238,0.08)] px-3 text-xs font-black text-cyan-100 disabled:opacity-50 sm:hidden">
                  عرض الكل
                </button>
                <span className="hidden rounded-full bg-[rgba(34,211,238,0.08)] px-3 py-1 text-xs font-black text-cyan-100 sm:inline">
                  عرض الكل
                </span>
              </div>

              {customerCardsError ? (
                <div className="mb-3 rounded-[18px] border border-red-300/18 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                  {customerCardsError}
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-visible overscroll-contain sm:overflow-y-auto sm:pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {customerCardsLoading ? (
                  <div className="flex min-h-[150px] items-center justify-center rounded-[24px] border border-dashed border-[rgba(34,211,238,0.18)] bg-[rgba(6,20,38,0.40)] px-5 text-center">
                    <p className="text-sm font-bold leading-7 text-slate-400">
                      جارٍ تحميل العملاء...
                    </p>
                  </div>
                ) : visibleCustomerCards.length > 0 ? (
                  <>
                    {isMobileViewport ? (
                    <div className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {visibleCustomerCards.slice(0, customerListLimit).map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => selectExistingCustomer(customer)}
                          aria-pressed={selectedCustomerId === customer.id}
                          className={`min-h-[158px] w-[158px] shrink-0 snap-start rounded-[22px] border border-cyan-300/10 p-3 text-center shadow-[0_12px_30px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.035)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.98] ${
                            selectedCustomerId === customer.id
                              ? 'bg-emerald-400/12'
                              : 'bg-[rgba(6,20,38,0.62)]'
                          }`}
                        >
                          <span className="flex min-w-0 flex-col items-center gap-2">
                            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-cyan-300/10 text-sm font-black text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.12)]">
                              {(customer.name || 'ع').trim().slice(0, 2)}
                            </span>
                            <span className="min-w-0 max-w-full">
                              <span className="block truncate text-sm font-black text-white">
                                {customer.name || '—'}
                              </span>
                              <span dir="ltr" className="mt-1 block truncate text-center text-xs font-bold text-slate-300">
                                {customer.phone || '—'}
                              </span>
                            </span>
                            <span className={`inline-flex min-h-[36px] shrink-0 items-center rounded-[14px] px-4 text-xs font-black ${
                              selectedCustomerId === customer.id
                                ? 'bg-emerald-400/18 text-emerald-100'
                                : 'bg-cyan-300/10 text-cyan-100'
                            }`}>
                              {selectedCustomerId === customer.id ? 'تم الاختيار' : 'تحديد'}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                    ) : (
                    <div className="rounded-[24px] bg-[rgba(6,20,38,0.42)] shadow-[inset_0_0_0_1px_rgba(34,211,238,0.09)] sm:overflow-hidden">
                    <div className="sm:overflow-x-auto">
                      <table className="block w-full text-right sm:table sm:min-w-[860px] sm:border-separate sm:border-spacing-0">
                        <thead className="hidden sm:table-header-group">
                          <tr className="text-xs font-black text-cyan-100/80">
                            <th className="px-4 py-4">العميل</th>
                            <th className="px-4 py-4">الجوال</th>
                            <th className="px-4 py-4">أول زيارة</th>
                            <th className="px-4 py-4">آخر زيارة</th>
                            <th className="px-4 py-4">عدد الزيارات</th>
                            <th className="px-4 py-4">إجمالي الصرف</th>
                            <th className="px-4 py-4">اختيار</th>
                          </tr>
                        </thead>
                        <tbody className="grid gap-3 text-sm sm:table-row-group">
                          {visibleCustomerCards.slice(0, customerListLimit).map((customer) => (
                            <tr
                              key={customer.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => selectExistingCustomer(customer)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  selectExistingCustomer(customer)
                                }
                              }}
                              aria-pressed={selectedCustomerId === customer.id}
                              className="group grid cursor-pointer grid-cols-2 gap-x-3 rounded-[22px] bg-[rgba(6,20,38,0.52)] p-4 text-slate-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.09)] transition hover:bg-[rgba(34,211,238,0.065)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:table-row sm:rounded-none sm:bg-transparent sm:p-0 sm:shadow-none"
                            >
                              <td className="col-span-2 block border-b border-[rgba(34,211,238,0.08)] pb-3 sm:table-cell sm:border-b-0 sm:border-t sm:px-4 sm:py-4">
                                <span className="block break-words text-base font-black text-white sm:max-w-[180px] sm:truncate">
                                  {customer.name || '—'}
                                </span>
                              </td>
                              <td
                                dir="ltr"
                                data-label="الجوال"
                                className="block min-w-0 py-3 text-left font-bold text-slate-300 before:mb-1 before:block before:text-right before:text-[11px] before:font-black before:text-slate-500 before:content-[attr(data-label)] sm:table-cell sm:border-t sm:border-[rgba(34,211,238,0.07)] sm:px-4 sm:py-4 sm:text-right sm:before:hidden"
                              >
                                {customer.phone || '—'}
                              </td>
                              <td data-label="أول زيارة" className="block py-3 font-bold before:mb-1 before:block before:text-[11px] before:font-black before:text-slate-500 before:content-[attr(data-label)] sm:table-cell sm:border-t sm:border-[rgba(34,211,238,0.07)] sm:px-4 sm:py-4 sm:before:hidden">
                                {formatPosCustomerDate(customer.firstVisitAt)}
                              </td>
                              <td data-label="آخر زيارة" className="block py-3 font-bold before:mb-1 before:block before:text-[11px] before:font-black before:text-slate-500 before:content-[attr(data-label)] sm:table-cell sm:border-t sm:border-[rgba(34,211,238,0.07)] sm:px-4 sm:py-4 sm:before:hidden">
                                {formatPosCustomerDate(customer.lastActivityAt)}
                              </td>
                              <td data-label="عدد الزيارات" className="block py-3 font-black text-cyan-50 before:mb-1 before:block before:text-[11px] before:text-slate-500 before:content-[attr(data-label)] sm:table-cell sm:border-t sm:border-[rgba(34,211,238,0.07)] sm:px-4 sm:py-4 sm:before:hidden">
                                {customer.visitsCount ?? 0}
                              </td>
                              <td data-label="إجمالي الصرف" className="block py-3 font-black text-white before:mb-1 before:block before:text-[11px] before:text-slate-500 before:content-[attr(data-label)] sm:table-cell sm:border-t sm:border-[rgba(34,211,238,0.07)] sm:px-4 sm:py-4 sm:before:hidden">
                                {formatPosCustomerAmount(customer.totalSpent)}
                              </td>
                              <td className="col-span-2 block pt-2 sm:table-cell sm:border-t sm:border-[rgba(34,211,238,0.07)] sm:px-4 sm:py-3">
                                {selectedCustomerId === customer.id ? (
                                  <span className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[16px] bg-emerald-400/18 px-4 text-xs font-black text-emerald-100 shadow-[0_0_16px_rgba(52,211,153,0.14),inset_0_0_0_1px_rgba(52,211,153,0.26)] sm:h-11 sm:w-11 sm:px-0">
                                    <span aria-hidden="true">✔</span>
                                    <span className="sm:sr-only">تم الاختيار</span>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      selectExistingCustomer(customer)
                                    }}
                                    className="min-h-[44px] rounded-[16px] bg-[rgba(34,211,238,0.10)] px-5 text-xs font-black text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.12)] transition group-hover:bg-[rgba(34,211,238,0.15)] active:scale-[0.98]"
                                  >
                                    اختيار
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    </div>
                    )}
                  </>
                ) : customerSearch.active && !customerSearchLoading ? (
                  <div className="flex min-h-[170px] flex-col items-center justify-center rounded-[24px] border border-dashed border-[rgba(34,211,238,0.18)] bg-[rgba(6,20,38,0.40)] px-5 text-center">
                    <p className="text-sm font-bold leading-7 text-slate-400">
                      لا يوجد عميل مطابق للبحث. استخدم زر + لإضافة عميل جديد.
                    </p>
                  </div>
                ) : (
                  <div className="flex min-h-[150px] items-center justify-center rounded-[24px] border border-dashed border-[rgba(34,211,238,0.18)] bg-[rgba(6,20,38,0.40)] px-5 text-center">
                    <p className="text-sm font-bold leading-7 text-slate-400">
                      ابدأ البحث برقم الجوال أو الاسم لاختيار العميل.
                    </p>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setCustomerListLimit((currentLimit) => currentLimit + 6)
                }}
                disabled={!canLoadMoreCustomers}
                className={`mt-4 hidden min-h-[48px] shrink-0 rounded-[18px] text-sm font-black shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)] transition active:scale-[0.98] sm:block ${
                  canLoadMoreCustomers
                    ? 'bg-[rgba(6,20,38,0.46)] text-cyan-100 hover:bg-[rgba(34,211,238,0.07)]'
                    : 'cursor-not-allowed bg-[rgba(6,20,38,0.28)] text-slate-500'
                }`}
              >
                تحميل المزيد
              </button>
            </section>
          </main>
        </div>

        {addCustomerOpen ? (
          <PosAddCustomerModal
            branchId={customerSearchBranchId}
            initialName={customerName}
            initialPhone={customerPhone}
            onClose={closeAddCustomerModal}
            onCreated={handleCustomerCreated}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[880px]">
      <div className="page-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="page-title">{heroTitle}</h1>
            <p className="page-subtitle">{heroSubtitle}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href={backHref} className="secondary-btn min-h-[48px]">
              {backLabel}
            </Link>
            <span className="badge badge-slate">الخطوة 1 من 3</span>
            <span className="badge badge-blue">بيانات العميل</span>
            <span className="badge badge-green">{originBadgeLabel}</span>
            <span className="badge badge-blue">الصلاحية: {roleLabel}</span>
          </div>
        </div>

        {showPosStepIndicator ? (
          <div className="mt-4">
            <PosStepIndicator currentStep="customer" />
          </div>
        ) : null}
      </div>

      <div className="page-card">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="section-title">{sectionTitle}</h2>
            <p className="page-subtitle">{sectionSubtitle}</p>
          </div>

          <span className="badge badge-rose">حقول إلزامية</span>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="field-label">اسم العميل</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value)
                setSelectedCustomerId(null)
              }}
              placeholder="اكتب اسم العميل"
              className="field-input min-h-[48px] text-base touch-manipulation"
            />
          </div>

          <div>
            <label className="field-label">رقم الجوال</label>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => {
                setCustomerPhone(e.target.value)
                setSelectedCustomerId(null)
              }}
              placeholder="05xxxxxxxx"
              className="field-input min-h-[48px] text-base touch-manipulation"
              inputMode="tel"
              autoComplete="tel"
              enterKeyHint="search"
            />
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">بحث عن عميل موجود</h3>
              <p className="mt-1 text-sm text-slate-500">
                ابحث بالاسم أو رقم الجوال.
              </p>
            </div>

            {selectedCustomerId ? (
              <span className="badge badge-green">تم اختيار عميل موجود</span>
            ) : (
              <span className="badge badge-slate">إنشاء أو اختيار</span>
            )}
          </div>

          {customerSearchLoading ? (
            <p className="mb-3 text-xs text-slate-500">
              {customerMatches.length > 0 ? 'تحديث النتائج...' : 'جارٍ البحث عن العملاء...'}
            </p>
          ) : null}

          {customerSearchError ? (
            <div className="error-alert mb-3">{customerSearchError}</div>
          ) : null}

          {customerMatches.length > 0 ? (
            <div className="space-y-3">
              {customerMatches.slice(0, 6).map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => selectExistingCustomer(customer)}
                  className={`flex min-h-[72px] w-full items-center justify-between rounded-2xl border px-4 py-4 text-right transition ${
                    selectedCustomerId === customer.id
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="text-right">
                    <p className="text-sm font-bold">{customer.name}</p>
                    <p
                      className={`mt-1 text-xs ${
                        selectedCustomerId === customer.id
                          ? 'text-slate-200'
                          : 'text-slate-500'
                      }`}
                    >
                      {customer.phone}
                    </p>
                  </div>
                  <span className="badge badge-slate">اختيار</span>
                </button>
              ))}
            </div>
          ) : customerSearch.active && !customerSearchLoading ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
              لا يوجد عميل مطابق، يمكنك المتابعة كعميل جديد.
            </div>
          ) : null}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="inner-card">
            <h3 className="mb-3 text-sm font-bold text-slate-900">ملخص سريع</h3>

            <div className="space-y-3">
              <SummaryRow label="اسم العميل" value={customerName.trim() || '—'} />
              <SummaryRow label="رقم الجوال" value={customerPhone.trim() || '—'} />
              <SummaryRow
                label="جاهزية الانتقال"
                value={isValid ? 'جاهز' : 'غير مكتمل'}
                valueClassName={isValid ? 'text-emerald-700' : 'text-amber-700'}
              />
              <SummaryRow label="الصلاحية الحالية" value={roleLabel} />
              <SummaryRow
                label="نوع العميل"
                value={selectedCustomerId ? 'عميل موجود' : 'عميل جديد'}
              />
            </div>
          </div>

          <div className="page-card !p-4 md:!p-5">
            <div className="space-y-3">
              <button
                onClick={handleNext}
                disabled={!isValid}
                className="primary-btn min-h-[56px] w-full text-base"
              >
                المتابعة إلى العناصر
              </button>

              <button
                onClick={handleReset}
                className="secondary-btn min-h-[52px] w-full"
              >
                مسح البيانات
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-500">
              سيتم حفظ البيانات والمتابعة إلى الخطوة التالية.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  valueClassName = 'text-slate-900',
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`text-sm font-bold ${valueClassName}`}>{value}</span>
    </div>
  )
}

function formatPosCustomerAmount(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—'
  }

  return new Intl.NumberFormat('ar-SA', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value) + ' ر.س'
}

function formatPosCustomerDate(value: string | null | undefined) {
  return formatPosGregorianDate(value)
}

function PosCustomerIcon({
  name,
  className = 'h-5 w-5',
}: {
  name:
    | 'arrowLeft'
    | 'arrowRight'
    | 'box'
    | 'card'
    | 'cart'
    | 'home'
    | 'logout'
    | 'note'
    | 'phone'
    | 'plus'
    | 'search'
    | 'settings'
    | 'trash'
    | 'user'
    | 'userPlus'
    | 'users'
  className?: string
}) {
  const props = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  }

  switch (name) {
    case 'home':
      return (
        <svg {...props}>
          <path d="m3 10 9-7 9 7" />
          <path d="M5 9.5V21h5v-6h4v6h5V9.5" />
        </svg>
      )
    case 'cart':
      return (
        <svg {...props}>
          <path d="M5 6h2l1.4 8.2a2 2 0 0 0 2 1.8H17a2 2 0 0 0 2-1.6L20 9H8" />
          <path d="M10 20h.01M17 20h.01" />
        </svg>
      )
    case 'box':
      return (
        <svg {...props}>
          <path d="m12 2 8 4.5v9L12 20l-8-4.5v-9L12 2Z" />
          <path d="M4.5 7 12 11.2 19.5 7M12 20v-8.8" />
        </svg>
      )
    case 'user':
      return (
        <svg {...props}>
          <path d="M20 21a8 8 0 0 0-16 0" />
          <path d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
        </svg>
      )
    case 'phone':
      return (
        <svg {...props}>
          <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.6 1.9Z" />
        </svg>
      )
    case 'search':
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
      )
    case 'users':
      return (
        <svg {...props}>
          <path d="M16 21a6 6 0 0 0-12 0" />
          <path d="M10 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
          <path d="M22 21a5 5 0 0 0-4-4.8M17 5.2a4 4 0 0 1 0 7.6" />
        </svg>
      )
    case 'note':
      return (
        <svg {...props}>
          <path d="M8 3h7l5 5v13H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M14 3v6h6M10 13h6M10 17h5" />
        </svg>
      )
    case 'card':
      return (
        <svg {...props}>
          <path d="M4 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
          <path d="M2 11h20M6 15h4" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...props}>
          <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
          <path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.06.06a2.1 2.1 0 0 1-2.97 2.97l-.06-.06a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.66V21a2.1 2.1 0 0 1-4.2 0v-.1a1.8 1.8 0 0 0-1.08-1.65 1.8 1.8 0 0 0-2 .36l-.06.06a2.1 2.1 0 0 1-2.97-2.97l.06-.06a1.8 1.8 0 0 0 .36-2 1.8 1.8 0 0 0-1.66-1.1H2a2.1 2.1 0 0 1 0-4.2h.1a1.8 1.8 0 0 0 1.65-1.08 1.8 1.8 0 0 0-.36-2l-.06-.06a2.1 2.1 0 0 1 2.97-2.97l.06.06a1.8 1.8 0 0 0 2 .36 1.8 1.8 0 0 0 1.08-1.65V2a2.1 2.1 0 0 1 4.2 0v.1a1.8 1.8 0 0 0 1.08 1.65 1.8 1.8 0 0 0 2-.36l.06-.06a2.1 2.1 0 0 1 2.97 2.97l-.06.06a1.8 1.8 0 0 0-.36 2 1.8 1.8 0 0 0 1.65 1.08H21a2.1 2.1 0 0 1 0 4.2h-.1a1.8 1.8 0 0 0-1.5 1.36Z" />
        </svg>
      )
    case 'logout':
      return (
        <svg {...props}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5M21 12H9" />
        </svg>
      )
    case 'plus':
      return (
        <svg {...props}>
          <path d="M12 5v14M5 12h14" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      )
    case 'userPlus':
      return (
        <svg {...props}>
          <circle cx="9" cy="7" r="4" />
          <path d="M3 21v-2a6 6 0 0 1 12 0v2M19 8v6M16 11h6" />
        </svg>
      )
    case 'trash':
      return (
        <svg {...props}>
          <path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      )
    case 'arrowLeft':
      return (
        <svg {...props}>
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
      )
    case 'arrowRight':
      return (
        <svg {...props}>
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      )
  }
}

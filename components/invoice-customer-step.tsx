'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { PosStepIndicator } from '@/components/pos-step-indicator'
import {
  loadClientResource,
  peekClientResource,
  prefetchClientResource,
} from '@/lib/client-resource-cache'
import { prefetchBranchInvoiceCatalog } from '@/lib/invoices/catalog'
import {
  INVOICE_CUSTOMER_STORAGE_KEY,
  isInvoiceCustomerDraftValid,
  serializeInvoiceCustomerDraft,
} from '@/lib/invoices/customer'
import { readActivePosEmployee } from '@/lib/pos-employee-session'
import { usePageAccess, type UsePageAccessOptions } from '@/hooks/use-page-access'

type ExistingCustomer = {
  id: string
  name: string
  phone: string
}

const ADMIN_CATEGORIES_CACHE_KEY = 'admin-categories'
const ADMIN_CATEGORIES_CACHE_TTL_MS = 60_000
const CUSTOMER_SEARCH_CACHE_TTL_MS = 30_000
const CUSTOMER_SEARCH_DEBOUNCE_MS = 300

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
    scopeType,
  } = usePageAccess(pageAccessOptions)

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerMatches, setCustomerMatches] = useState<ExistingCustomer[]>([])
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false)
  const [customerSearchError, setCustomerSearchError] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const customerSearchRequestIdRef = useRef(0)
  const customerPhoneInputRef = useRef<HTMLInputElement | null>(null)

  const isValid = isInvoiceCustomerDraftValid(customerName, customerPhone)
  const isReady = isValid
  const isCustomer = pathname.includes('/pos/sale/customer')
  const activePosEmployee = variant === 'pos' ? readActivePosEmployee() : null
  const customerSearchBranchId =
    variant === 'pos' ? activePosEmployee?.branch_id || branchId || null : null
  const customerSearch = useMemo(
    () => normalizeCustomerLookup(customerPhone, customerName, customerSearchBranchId),
    [customerName, customerPhone, customerSearchBranchId]
  )
  const customerSearchTerm = customerSearch.query

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
        console.time(`customer search (${customerSearch.query})`)
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
            logLabel: `fetch customers (${customerSearch.query})`,
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
          error instanceof Error ? error.message : 'فشل البحث عن العملاء'
        )
        setCustomerSearchLoading(false)
      } finally {
        if (process.env.NODE_ENV === 'development') {
          console.timeEnd(`customer search (${customerSearch.query})`)
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
  }, [activePosEmployee?.branch_id, allowed, branchId, customerSearch, customerSearchBranchId, variant])

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
          throw new Error(result?.details || result?.error || 'Failed to load categories')
        }

        return Array.isArray(result.categories) ? result.categories : []
      },
      {
        ttlMs: ADMIN_CATEGORIES_CACHE_TTL_MS,
        logLabel: 'fetch categories',
      }
    )

    if (scopeType === 'branch' && branchId) {
      void prefetchBranchInvoiceCatalog(branchId)
    }
  }, [allowed, branchId, router, scopeType, variant])

  useEffect(() => {
    if (variant !== 'pos' || !allowed) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      customerPhoneInputRef.current?.focus()
    }, 150)

    return () => window.clearTimeout(timeoutId)
  }, [allowed, variant])

  const handleNext = () => {
    if (!isValid) {
      alert('اكتب اسم العميل ورقم الجوال')
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
      <div className="flex h-full w-full min-h-0 min-w-0 flex-col bg-slate-50 p-2 md:p-3 lg:p-4">
        <div className="grid h-full min-h-0 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm lg:[direction:ltr] lg:grid-cols-[minmax(0,1fr)_280px]">
          <main className="order-2 min-w-0 p-3 md:p-4 lg:order-1 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden lg:[direction:rtl]">
            <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="flex flex-col-reverse items-start justify-between gap-3 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 text-right">
                <h2 className="text-xl font-black text-slate-950 md:text-2xl">بيانات العميل</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  أدخل بيانات العميل أو ابحث عن عميل موجود.
                </p>
              </div>

              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#020617] text-white shadow-sm">
                <UserIcon />
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-white p-3">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    اسم العميل
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value)
                      setSelectedCustomerId(null)
                    }}
                    placeholder="اكتب اسم العميل"
                    className="h-14 min-h-[56px] w-full min-w-0 rounded-xl border border-slate-200 px-3 text-base text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-200 touch-manipulation"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    رقم الجوال
                  </label>
                  <input
                    ref={customerPhoneInputRef}
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => {
                      setCustomerPhone(e.target.value)
                      setSelectedCustomerId(null)
                    }}
                    placeholder="05xxxxxxxx"
                    className="h-14 min-h-[56px] w-full min-w-0 rounded-xl border border-slate-200 px-3 text-base text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-200 touch-manipulation"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="tel"
                    enterKeyHint="search"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-white p-3 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
              <div className="mb-3 text-right">
                <h3 className="text-base font-extrabold text-slate-950 md:text-lg">
                  بحث عن عميل موجود
                </h3>
              </div>

              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={customerSearchTerm}
                  readOnly
                  aria-label="بحث عن عميل موجود"
                  className="h-14 min-h-[56px] w-full min-w-0 rounded-xl border border-slate-200 pr-3 pl-12 text-right text-base text-slate-500 outline-none transition focus:ring-2 focus:ring-slate-200 touch-manipulation"
                  placeholder="ابحث بالاسم أو رقم الجوال"
                  inputMode="search"
                />
              </div>

              {customerSearchLoading ? (
                <p className="mt-2 text-xs text-slate-500">
                  {customerMatches.length > 0 ? 'تحديث النتائج...' : 'جاري البحث عن العملاء...'}
                </p>
              ) : null}

              <div className="mt-3 space-y-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                {customerSearchError ? (
                  <div className="error-alert">{customerSearchError}</div>
                ) : null}

                {customerMatches.length > 0 ? (
                  customerMatches.slice(0, 6).map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => selectExistingCustomer(customer)}
                      className={`w-full rounded-2xl border p-4 text-right shadow-sm transition ${
                        selectedCustomerId === customer.id
                          ? 'border-emerald-200 bg-emerald-50/40 ring-1 ring-emerald-100'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex min-w-0 flex-1 items-center gap-3 text-right">
                          <span
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                              selectedCustomerId === customer.id
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            <UserIcon />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-950">
                              {customer.name}
                            </p>
                            <p dir="ltr" className="mt-1 text-sm text-slate-500">
                              {customer.phone}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                              selectedCustomerId === customer.id
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            جاهز
                          </span>
                        </div>
                        <span className="flex h-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800">
                          اختيار العميل
                        </span>
                      </div>
                    </button>
                  ))
                ) : customerSearch.active && !customerSearchLoading ? (
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    لا يوجد عميل مطابق، يمكنك المتابعة كعميل جديد.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-auto rounded-xl border border-slate-100 bg-white p-3">
              <h3 className="text-base font-extrabold text-slate-950 md:text-lg">ملخص سريع</h3>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <CompactStat
                  label="نوع العميل"
                  value={selectedCustomerId ? 'عميل موجود' : 'عميل جديد'}
                  variant="pos"
                />
                <CompactStat
                  label="رقم الجوال"
                  value={customerPhone.trim() || '—'}
                  variant="pos"
                />
                <CompactStat
                  label="جاهزية الانتقال"
                  value={isValid ? 'جاهز' : 'غير مكتمل'}
                  valueClassName={isValid ? 'text-emerald-700' : 'text-amber-700'}
                  variant="pos"
                />
              </div>
            </div>
            </div>
          </main>

          <aside className="order-1 flex min-w-0 flex-col gap-3 border-b border-slate-100 bg-white p-3 md:p-4 lg:order-2 lg:h-full lg:border-b-0 lg:border-l lg:border-slate-100 lg:[direction:rtl]">
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-slate-400">
                AFEX POS
              </p>
              <h1 className="mt-1 text-xl font-black text-slate-950">AFEX POS</h1>
            </div>

            <div className="space-y-2">
              <SidebarStepItem icon={<HomeIcon />} label="الرئيسية" href="/pos" />
              <SidebarStepItem
                icon={<UserIcon />}
                label="بيانات العميل"
                href="/pos/sale/customer"
                active
              />
              <SidebarStepItem
                icon={<BoxIcon />}
                label="العناصر"
                href="/pos/sale/items"
                disabled={isCustomer}
              />
              <SidebarStepItem
                icon={<WalletIcon />}
                label="الدفع"
                href="/pos/sale/checkout"
                disabled={isCustomer}
              />
              <SidebarStepItem
                icon={<NoteIcon />}
                label="الملاحظات"
                disabled={isCustomer}
              />
            </div>

            <div className="mt-auto space-y-2">
              <button
                onClick={handleNext}
                disabled={!isReady}
                className={`h-11 w-full rounded-xl text-sm font-bold text-white transition ${
                  isReady
                    ? 'cursor-pointer bg-[#020617] hover:bg-[#020617]/90'
                    : 'cursor-not-allowed bg-slate-400'
                }`}
              >
                الانتقال إلى العناصر
              </button>

              <button
                onClick={handleReset}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                مسح البيانات
              </button>
            </div>
          </aside>
        </div>
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
              inputMode="numeric"
              pattern="[0-9]*"
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
              {customerMatches.length > 0 ? 'تحديث النتائج...' : 'جاري البحث عن العملاء...'}
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

function CompactStat({
  label,
  value,
  valueClassName = 'text-slate-950',
  variant = 'default',
}: {
  label: string
  value: string
  valueClassName?: string
  variant?: 'default' | 'pos'
}) {
  return (
    <div
      className={
        variant === 'pos'
          ? 'min-w-0 rounded-xl bg-slate-50 px-3 py-3 text-sm'
          : 'rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-slate-100'
      }
    >
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className={`mt-2 break-words text-sm font-black ${valueClassName}`}>{value}</p>
    </div>
  )
}

function SidebarStepItem({
  icon,
  label,
  href,
  active = false,
  disabled = false,
}: {
  icon: React.ReactNode
  label: string
  href?: string
  active?: boolean
  disabled?: boolean
}) {
  const className = `flex min-h-[52px] items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold ${
    active
      ? 'bg-slate-950 text-white shadow-sm'
      : 'bg-slate-100 text-slate-700'
  } ${disabled ? 'cursor-not-allowed pointer-events-none opacity-50' : ''}`

  const content = (
    <>
      <span className="min-w-0 break-words">{label}</span>
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10">
        {icon}
      </span>
    </>
  )

  if (href && !disabled) {
    return (
      <Link
        href={href}
        className={className}
      >
        {content}
      </Link>
    )
  }

  return (
    <div
      className={className}
      aria-disabled={disabled}
    >
      {content}
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

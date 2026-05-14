'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthState } from '@/components/auth-state-provider'
import { useAdminBranchFilter } from '@/hooks/use-admin-branch-filter'
import {
  useInvoiceCheckout,
  type CheckoutDiscountOption,
  type CheckoutVatSetting,
} from '@/hooks/use-invoice-checkout'
import { usePageAccess } from '@/hooks/use-page-access'
import {
  loadClientResource,
  peekClientResource,
} from '@/lib/client-resource-cache'
import {
  INVOICE_CUSTOMER_STORAGE_KEY,
  parseStoredInvoiceCustomerDraft,
} from '@/lib/invoices/customer'
import type { InvoiceLineItem } from '@/lib/invoices/items'
import {
  INVOICE_SALE_ITEMS_STORAGE_KEY,
  parseStoredInvoiceSaleItemsDraft,
  serializeInvoiceSaleItemsDraft,
} from '@/lib/invoices/sale-draft'
import { removeInvoiceLineItem } from '@/lib/invoices/items'
import {
  INVOICE_SUCCESS_STORAGE_KEY,
  serializeInvoiceSuccessSnapshot,
} from '@/lib/invoices/success'
import {
  getPaymentMethodLabel,
  normalizeUiPaymentMethod,
  PAYMENT_METHODS,
} from '@/lib/invoices/payment-method'
import { formatCurrency } from '@/lib/orders/format'

type ThermalReceiptSettings = {
  showQRCode: boolean
  showBranchName: boolean
  showCashierName: boolean
  showTaxNumber: boolean
  thermalReceiptLogoUrl: string
  footerText: string
  taxNumber: string
}

const THERMAL_RECEIPT_SETTINGS_KEY = 'THERMAL_RECEIPT_SETTINGS_KEY'

const DEFAULT_THERMAL_RECEIPT_SETTINGS: ThermalReceiptSettings = {
  showQRCode: false,
  showBranchName: false,
  showCashierName: false,
  showTaxNumber: false,
  thermalReceiptLogoUrl: '',
  footerText: 'شكراً لزيارتكم',
  taxNumber: '',
}

const ADMIN_DISCOUNTS_CACHE_TTL_MS = 30_000
const ADMIN_VAT_CACHE_TTL_MS = 30_000

function getDiscountsCacheKey(branchId: string | null) {
  return `admin-discounts:${branchId || 'all'}`
}

function getVatCacheKey(branchId: string | null) {
  return `admin-vat:${branchId || 'all'}`
}

function formatDiscountOptionLabel(option: CheckoutDiscountOption) {
  if (option.type === 'percentage') {
    return `${option.name} (${option.value}%)`
  }

  return `${option.name} (${formatCurrency(option.value)})`
}

function parseThermalReceiptSettings(
  value: string | null
): ThermalReceiptSettings {
  if (!value) {
    return DEFAULT_THERMAL_RECEIPT_SETTINGS
  }

  try {
    const parsed = JSON.parse(value) as Partial<ThermalReceiptSettings>

    return {
      showQRCode:
        parsed.showQRCode ?? DEFAULT_THERMAL_RECEIPT_SETTINGS.showQRCode,
      showBranchName:
        parsed.showBranchName ?? DEFAULT_THERMAL_RECEIPT_SETTINGS.showBranchName,
      showCashierName:
        parsed.showCashierName ??
        DEFAULT_THERMAL_RECEIPT_SETTINGS.showCashierName,
      showTaxNumber:
        parsed.showTaxNumber ?? DEFAULT_THERMAL_RECEIPT_SETTINGS.showTaxNumber,
      thermalReceiptLogoUrl:
        parsed.thermalReceiptLogoUrl?.trim() ||
        DEFAULT_THERMAL_RECEIPT_SETTINGS.thermalReceiptLogoUrl,
      footerText:
        parsed.footerText?.trim() ||
        DEFAULT_THERMAL_RECEIPT_SETTINGS.footerText,
      taxNumber:
        parsed.taxNumber?.trim() || DEFAULT_THERMAL_RECEIPT_SETTINGS.taxNumber,
    }
  } catch {
    return DEFAULT_THERMAL_RECEIPT_SETTINGS
  }
}

export default function PosSaleCheckoutPage() {
  const router = useRouter()
  const currentPathname =
    typeof window === 'undefined' ? 'server' : window.location.pathname
  const authState = useAuthState()
  const access = usePageAccess({
    allowedRoles: ['admin', 'employee'],
    redirectIfNoUser: '/pos/login',
    redirectIfForbidden: '/pos/login',
  })

  const authLoading = access.loading
  const authError = access.authError
  const authStatus = access.authStatus
  const allowed = access.allowed
  const branchId = access.branchId
  const scopeType = access.scopeType
  const { effectiveBranchId, selectedBranchName } = useAdminBranchFilter(
    scopeType,
    branchId,
    allowed
  )
  const hasInvalidBranchContext = scopeType === 'branch' && !branchId
  const hasAmbiguousAdminBranchContext =
    scopeType === 'system' && access.userRole === 'admin' && !effectiveBranchId

  const [ready, setReady] = useState(false)
  const [missingCheckoutData, setMissingCheckoutData] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [invoiceItems, setInvoiceItems] = useState<InvoiceLineItem[]>([])
  const [availableDiscounts, setAvailableDiscounts] = useState<
    CheckoutDiscountOption[]
  >(() => peekClientResource<CheckoutDiscountOption[]>(getDiscountsCacheKey(effectiveBranchId)) || [])
  const [loadingDiscounts, setLoadingDiscounts] = useState(false)
  const [availableVatSetting, setAvailableVatSetting] = useState<CheckoutVatSetting | null>(
    () => peekClientResource<CheckoutVatSetting | null>(getVatCacheKey(effectiveBranchId)) || null
  )
  const [loadingVat, setLoadingVat] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const cashReceivedInputRef = useRef<HTMLInputElement | null>(null)
  const [thermalReceiptSettings] = useState<ThermalReceiptSettings>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_THERMAL_RECEIPT_SETTINGS
    }

    return parseThermalReceiptSettings(
      window.localStorage.getItem(THERMAL_RECEIPT_SETTINGS_KEY)
    )
  })

  const initializedDefaultPayment = useRef(false)
  const cashierName = authState.profile?.full_name || ''
  const thermalReceiptLogoUrl =
    thermalReceiptSettings.thermalReceiptLogoUrl || null
  const printIssuedAt = useMemo(() => new Date(), [])
  const printDateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('ar-SA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(printIssuedAt),
    [printIssuedAt]
  )
  const printTimeLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('ar-SA', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(printIssuedAt),
    [printIssuedAt]
  )

  useEffect(() => {
    if (!allowed) return

    const parsedCustomer = parseStoredInvoiceCustomerDraft(
      localStorage.getItem(INVOICE_CUSTOMER_STORAGE_KEY)
    )
    const parsedItems = parseStoredInvoiceSaleItemsDraft(
      localStorage.getItem(INVOICE_SALE_ITEMS_STORAGE_KEY)
    )

    if (!parsedCustomer || !parsedItems || parsedItems.items.length === 0) {
      window.setTimeout(() => {
        setMissingCheckoutData(true)
        setReady(true)
      }, 0)
      return
    }

    window.setTimeout(() => {
      setMissingCheckoutData(false)
      setCustomerName(parsedCustomer.name)
      setCustomerPhone(parsedCustomer.phone)
      setInvoiceItems(parsedItems.items)
      setReady(true)
    }, 0)
  }, [allowed])

  useEffect(() => {
    if (!allowed) return

    let cancelled = false

    async function loadDiscounts() {
      try {
        const discountsCacheKey = getDiscountsCacheKey(effectiveBranchId)
        const cachedDiscounts =
          peekClientResource<CheckoutDiscountOption[]>(discountsCacheKey) || []

        if (!cancelled && cachedDiscounts.length > 0) {
          setAvailableDiscounts(cachedDiscounts)
          setLoadingDiscounts(false)
        } else {
          setLoadingDiscounts(true)
        }

        const searchParams = new URLSearchParams()
        if (effectiveBranchId) {
          searchParams.set('branchId', effectiveBranchId)
        }

        const nextDiscounts = await loadClientResource(
          discountsCacheKey,
          async () => {
            const response = await fetch(
              `/api/admin/discounts${
                searchParams.toString() ? `?${searchParams.toString()}` : ''
              }`,
              {
                method: 'GET',
                cache: 'no-store',
              }
            )

            const result = await response.json().catch(() => null)

            if (!response.ok || !result?.success) {
              throw new Error(
                result?.details || result?.error || 'تعذر تحميل الخصومات'
              )
            }

            return Array.isArray(result.discounts) ? result.discounts : []
          },
          {
            ttlMs: ADMIN_DISCOUNTS_CACHE_TTL_MS,
            logLabel: `fetch discounts (${effectiveBranchId || 'all'})`,
          }
        )

        if (!cancelled) {
          setAvailableDiscounts(nextDiscounts)
        }
      } catch {
        if (!cancelled) {
          setAvailableDiscounts([])
        }
      } finally {
        if (!cancelled) {
          setLoadingDiscounts(false)
        }
      }
    }

    void loadDiscounts()

    return () => {
      cancelled = true
    }
  }, [allowed, effectiveBranchId])

  useEffect(() => {
    if (!allowed) return

    let cancelled = false

    async function loadVatSetting() {
      try {
        const vatCacheKey = getVatCacheKey(effectiveBranchId)
        const cachedSetting =
          peekClientResource<CheckoutVatSetting | null>(vatCacheKey) || null

        if (!cancelled && cachedSetting) {
          setAvailableVatSetting(cachedSetting)
          setLoadingVat(false)
        } else {
          setLoadingVat(true)
        }

        const searchParams = new URLSearchParams()
        if (effectiveBranchId) {
          searchParams.set('branchId', effectiveBranchId)
        }

        const nextSetting = await loadClientResource(
          vatCacheKey,
          async () => {
            const response = await fetch(
              `/api/admin/vat${
                searchParams.toString() ? `?${searchParams.toString()}` : ''
              }`,
              {
                method: 'GET',
                cache: 'no-store',
              }
            )

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
            logLabel: `fetch vat (${effectiveBranchId || 'all'})`,
          }
        )

        if (!cancelled) {
          setAvailableVatSetting(nextSetting)
        }
      } catch {
        if (!cancelled) {
          setAvailableVatSetting(null)
        }
      } finally {
        if (!cancelled) {
          setLoadingVat(false)
        }
      }
    }

    void loadVatSetting()

    return () => {
      cancelled = true
    }
  }, [allowed, effectiveBranchId])

  const checkout = useInvoiceCheckout({
    customerName,
    customerPhone,
    invoiceItems,
    hasInvalidBranchContext,
    hasAmbiguousAdminBranchContext,
    vatSetting: availableVatSetting,
    onInvoiceCreated: (_, successSnapshot) => {
      const nextSnapshot = {
        ...successSnapshot,
        paymentMethod: checkout.paymentMethod,
      }

      localStorage.removeItem(INVOICE_SALE_ITEMS_STORAGE_KEY)
      checkout.clearCheckout()
      setInvoiceItems([])
      sessionStorage.setItem(
        INVOICE_SUCCESS_STORAGE_KEY,
        serializeInvoiceSuccessSnapshot(nextSnapshot)
      )
      router.push('/pos/sale/success')
    },
  })

  const selectedPaymentLabel = useMemo(
    () => getPaymentMethodLabel(checkout.paymentMethod),
    [checkout.paymentMethod]
  )
  const normalizedPaymentMethod = useMemo(
    () => normalizeUiPaymentMethod(checkout.paymentMethod),
    [checkout.paymentMethod]
  )

  const isCashOnDelivery =
    normalizedPaymentMethod === 'cod'

  const printPaymentMethodLabel = useMemo(
    () => (isCashOnDelivery ? 'عند الاستلام' : selectedPaymentLabel),
    [isCashOnDelivery, selectedPaymentLabel]
  )

  const printFinalAmountLabel = useMemo(
    () => (isCashOnDelivery ? 'المتبقي عند الاستلام' : 'الإجمالي المستحق'),
    [isCashOnDelivery]
  )

  const remainingCardTone = useMemo<'green' | 'red'>(() => {
    return checkout.remainingFromCustomer === 0 ? 'green' : 'red'
  }, [checkout.remainingFromCustomer])

  const remainingLabel = useMemo(() => {
    if (checkout.remainingFromCustomer > 0) {
      return 'المتبقي'
    }

    return 'تم السداد'
  }, [checkout.remainingFromCustomer])

  const canSubmitInvoice = useMemo(() => {
    if (checkout.loading) {
      return false
    }

    if (!customerName.trim() && !customerPhone.trim()) {
      return false
    }

    if (invoiceItems.length === 0) {
      return false
    }

    return true
  }, [checkout.loading, customerName, customerPhone, invoiceItems.length])

  const cashWarningMessage = useMemo(() => {
    if (normalizedPaymentMethod !== 'cash' || checkout.remainingFromCustomer <= 0) {
      return ''
    }

    return `المبلغ المستلم أقل من الإجمالي. المتبقي سيظهر على الفاتورة: ${formatCurrency(checkout.remainingFromCustomer)}`
  }, [checkout.remainingFromCustomer, normalizedPaymentMethod])

  const handleSelectPayment = (option: (typeof PAYMENT_METHODS)[number]) => {
    checkout.setPaymentMethod(option.id)
  }

  const handleApplyQuickAmount = (amount: number | 'full') => {
    const nextAmount =
      amount === 'full' ? checkout.finalTotal : amount

    checkout.setCashReceived(nextAmount.toFixed(2))
    window.setTimeout(() => {
      cashReceivedInputRef.current?.focus()
      cashReceivedInputRef.current?.select()
    }, 0)
  }

  const handleCreateInvoice = () => {
    if (!canSubmitInvoice) {
      return
    }

    void checkout.createInvoice()
  }

  const handleCancelInvoice = () => {
    setShowCancelModal(true)
  }

  const confirmCancelInvoice = () => {
    setShowCancelModal(false)
    checkout.clearCheckout()
    localStorage.removeItem(INVOICE_SALE_ITEMS_STORAGE_KEY)
    localStorage.removeItem(INVOICE_CUSTOMER_STORAGE_KEY)
    sessionStorage.removeItem(INVOICE_SUCCESS_STORAGE_KEY)
    window.location.href = '/pos'
  }

  const handleRemoveItem = (itemName: string) => {
    setInvoiceItems((prev) => removeInvoiceLineItem(prev, itemName))
  }

  useEffect(() => {
    const updateOnlineStatus = () => {
      setIsOffline(
        typeof navigator !== 'undefined' && navigator.onLine === false
      )
    }

    updateOnlineStatus()
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)

    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  useEffect(() => {
    if (!ready || initializedDefaultPayment.current) return

    initializedDefaultPayment.current = true
    checkout.setPaymentMethod('mada')
  }, [checkout, ready])

  useEffect(() => {
    if (!ready || !checkout.isReceivedAmountEditable) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      cashReceivedInputRef.current?.focus()
      cashReceivedInputRef.current?.select()
    }, 150)

    return () => window.clearTimeout(timeoutId)
  }, [checkout.isReceivedAmountEditable, ready])

  useEffect(() => {
    if (!ready) return

    if (invoiceItems.length === 0) {
      localStorage.removeItem(INVOICE_SALE_ITEMS_STORAGE_KEY)
      return
    }

    localStorage.setItem(
      INVOICE_SALE_ITEMS_STORAGE_KEY,
      serializeInvoiceSaleItemsDraft({ items: invoiceItems })
    )
  }, [invoiceItems, ready])

  if (authError === 'timeout') {
    console.warn('[POS CHECKOUT] auth timeout', currentPathname, authStatus)
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
    return <div className="page-card">جاري تحميل بيانات الفاتورة...</div>
  }

  if (missingCheckoutData) {
    return (
      <div className="pos-checkout-page">
        <style jsx global>{`
          body:has(.pos-checkout-page) .app-shell .page-wrap main.text-right {
            margin-top: 0 !important;
          }

          body:has(.pos-checkout-page) .app-shell .page-wrap main > .space-y-5,
          body:has(.pos-checkout-page) .app-shell .page-wrap main > .md\\:space-y-6 {
            margin-top: 0 !important;
          }
        `}</style>

        <div className="flex h-full w-full min-h-0 min-w-0 flex-col bg-slate-50 p-3 md:p-4 lg:p-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 text-right shadow-sm">
            <p className="text-sm font-medium text-slate-600">
              لا يمكن إتمام الفاتورة حالياً لأن بيانات العميل أو العناصر غير متوفرة بشكل صحيح.
            </p>
            <button
              type="button"
              onClick={() => router.push('/pos/sale/items')}
              className="mt-4 flex h-[48px] items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              العودة إلى العناصر
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pos-checkout-page">
      <style jsx global>{`
        body:has(.pos-checkout-page) .app-shell .page-wrap main.text-right {
          margin-top: 0 !important;
        }

        body:has(.pos-checkout-page) .app-shell .page-wrap main > .space-y-5,
        body:has(.pos-checkout-page) .app-shell .page-wrap main > .md\\:space-y-6 {
          margin-top: 0 !important;
        }

        @media print {
          body * {
            visibility: hidden;
          }

          #print-area,
          #print-area * {
            visibility: visible;
          }

          #print-area {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
          }
        }
      `}</style>

      {hasInvalidBranchContext ? (
        <div className="error-alert">
          لا يمكن إنشاء فاتورة لأن حسابك غير مرتبط بفرع صالح.
        </div>
      ) : null}

      {hasAmbiguousAdminBranchContext ? (
        <div className="error-alert">
          اختر فرعًا محددًا قبل استخدام شاشة الدفع.
        </div>
      ) : null}

      <div className="flex h-full w-full min-h-0 min-w-0 flex-col bg-slate-50 p-2 md:p-3 lg:p-4">
        <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm lg:flex lg:[direction:ltr]">
          <aside className="order-1 min-w-0 space-y-3 border-b border-slate-100 bg-white p-3 md:p-4 lg:flex lg:h-full lg:w-[280px] lg:flex-none lg:flex-col lg:border-b-0 lg:border-r lg:border-slate-100 lg:[direction:rtl] lg:overflow-hidden">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
              <h2 className="text-lg font-black text-slate-950 md:text-xl">ملخص الفاتورة</h2>

              <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
                <p className="text-xs font-bold text-slate-500">اسم العميل</p>
                <p className="mt-2 text-sm font-black text-slate-950">
                  {customerName || 'بدون اسم'}
                </p>

                <p className="mt-4 text-xs font-bold text-slate-400">رقم الجوال</p>
                <p className="mt-2 text-sm font-black text-slate-950">
                  {customerPhone || 'بدون رقم جوال'}
                </p>
              </div>

              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-extrabold text-slate-950">العناصر</h3>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                    {invoiceItems.length}
                  </span>
                </div>

                <div className="max-h-[160px] space-y-2 overflow-y-auto pr-1 lg:min-h-0 lg:flex-1 lg:max-h-none">
                  {invoiceItems.map((item) => (
                    <div
                      key={item.item_name}
                      className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-950">
                            {item.item_name}
                          </p>
                          <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                            <span>{formatCurrency(item.unit_price)}</span>
                            <span>{item.quantity}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.item_name)}
                          className="flex h-7 w-7 flex-none items-center justify-center rounded-md text-red-500 transition hover:bg-red-50"
                          aria-label={`حذف ${item.item_name}`}
                        >
                          <Trash2 />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="space-y-3">
                  <SummaryMetric
                    label="إجمالي العناصر"
                    value={formatCurrency(checkout.subtotal)}
                  />
                  <SummaryMetric
                    label="الخصم"
                    value={formatCurrency(checkout.discountAmount)}
                  />
                  <SummaryMetric
                    label="الضريبة"
                    value={formatCurrency(checkout.taxAmount)}
                  />
                </div>
              </div>

              <div className="mt-3 rounded-xl bg-slate-900 p-3 text-center text-white">
                <p className="text-xs font-bold text-slate-300">الإجمالي المستحق</p>
                <p className="mt-1.5 text-xl font-black md:text-2xl">
                  {formatCurrency(checkout.finalTotal)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => router.push('/pos/sale/items')}
              className="flex h-[48px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              العودة إلى العناصر
            </button>
          </aside>

          <main className="order-2 min-w-0 flex-1 p-3 md:p-4 lg:flex lg:min-h-0 lg:flex-col lg:[direction:rtl]">
            {checkout.successMessage ? (
              <div className="success-alert">{checkout.successMessage}</div>
            ) : null}
            {checkout.errorMessage ? (
              <div className="error-alert">{checkout.errorMessage}</div>
            ) : null}
            {checkout.offlineDraftMessage ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                {checkout.offlineDraftMessage}
              </div>
            ) : null}
            {isOffline ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
                أنت غير متصل، سيتم حفظ الفاتورة كمسودة فقط
              </div>
            ) : null}

            <section className="rounded-2xl border border-slate-100 bg-white p-3 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden">
              <div className="mb-3">
                <h1 className="text-xl font-black text-slate-950 md:text-2xl">
                  الدفع وإنهاء الفاتورة
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  اختر طريقة الدفع وأدخل المبلغ
                </p>
              </div>

              <div className="space-y-3 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {PAYMENT_METHODS.map((option) => {
                  const selected = checkout.paymentMethod === option.id

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleSelectPayment(option)}
                      className={`flex min-h-[44px] h-10 w-full items-center justify-center rounded-xl px-3 text-center text-sm font-medium transition-all duration-150 active:scale-[0.98] md:h-11 md:text-base ${
                        selected
                          ? 'bg-[#020617] text-white'
                          : 'border border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>

              <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
                <DiscountSelectorCard
                  discounts={availableDiscounts}
                  loading={loadingDiscounts}
                  selectedDiscount={checkout.selectedDiscount}
                  onClear={checkout.clearAppliedDiscount}
                  onSelect={checkout.setSelectedDiscount}
                />
                <VatInfoCard
                  rate={checkout.vatRate}
                  enabled={checkout.vatEnabled}
                  loading={loadingVat}
                />
              </div>

              <div className="space-y-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
              <div className="space-y-2">
                <label className="mb-2 block text-xs font-bold text-slate-400">
                  المبلغ المستلم
                </label>
                <input
                  ref={cashReceivedInputRef}
                  type="number"
                  value={checkout.cashReceived}
                  onChange={(event) => checkout.setCashReceived(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleCreateInvoice()
                    }
                  }}
                  placeholder="المبلغ المستلم"
                  readOnly={!checkout.isReceivedAmountEditable}
                  disabled={!checkout.isReceivedAmountEditable}
                  className={`h-11 w-full rounded-xl border px-4 text-right text-base font-medium outline-none transition placeholder:text-slate-400 ${
                    checkout.isReceivedAmountEditable
                      ? 'border-slate-200 bg-white text-slate-900 focus:border-slate-300 focus:ring-2 focus:ring-slate-100'
                      : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-600'
                  }`}
                />
              </div>

              <div className="grid grid-cols-4 gap-2">
                {([
                  { label: '50', value: 50 },
                  { label: '100', value: 100 },
                  { label: '200', value: 200 },
                  { label: 'كامل', value: 'full' as const },
                ]).map((amountOption) => (
                  <button
                    key={amountOption.label}
                    type="button"
                    onClick={() => handleApplyQuickAmount(amountOption.value)}
                    disabled={!checkout.isReceivedAmountEditable}
                    className="flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {amountOption.label}
                  </button>
                ))}
              </div>

              {cashWarningMessage ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-bold text-amber-700">
                  {cashWarningMessage}
                </div>
              ) : null}

              {checkout.cashChange > 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-700">
                  الباقي للعميل: {formatCurrency(checkout.cashChange)}
                </div>
              ) : null}

              <div className="grid gap-2 md:grid-cols-3">
                <CalculationCard
                  label="الإجمالي المستحق"
                  value={formatCurrency(checkout.finalTotal)}
                  tone="slate"
                />
                <CalculationCard
                  label="المدفوع"
                  value={formatCurrency(checkout.numericCashReceived)}
                  tone="green"
                />
                <CalculationCard
                  label={remainingLabel}
                  value={
                    checkout.cashChange > 0
                      ? formatCurrency(checkout.cashChange)
                      : formatCurrency(checkout.remainingFromCustomer)
                  }
                  tone={remainingCardTone}
                />
              </div>

              <div className="space-y-2">
                <label className="mb-2 block text-xs font-bold text-slate-400">
                  ملاحظة
                </label>
                <textarea
                  value={checkout.note}
                  onChange={(event) => checkout.setNote(event.target.value)}
                  placeholder="اكتب ملاحظة..."
                  className="min-h-[72px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-right text-sm text-slate-700 outline-none transition focus:ring-2 focus:ring-slate-200"
                />
              </div>
              </div>
              </div>

              <div className="mt-auto flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={handleCreateInvoice}
                  disabled={!canSubmitInvoice}
                  className="flex h-12 min-h-[44px] flex-1 items-center justify-center rounded-xl bg-slate-900 text-base font-bold text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  {checkout.loading ? 'جاري إنشاء الفاتورة...' : 'إنشاء الفاتورة'}
                </button>

                <button
                  type="button"
                  onClick={handleCancelInvoice}
                  className="flex min-h-[44px] items-center justify-center rounded-xl border border-red-200 bg-red-50 px-5 text-sm font-semibold text-red-600 transition active:scale-[0.98]"
                >
                  إلغاء الفاتورة
                </button>
              </div>
            </section>
          </main>
        </div>
      </div>

      <div id="print-area" dir="rtl" className="hidden print:block">
        <div
          className="mx-auto w-full max-w-[280px] p-3 text-[13px] leading-6 text-black"
          style={{ fontFamily: 'monospace' }}
        >
          <div className="mb-2 text-center">
            {thermalReceiptLogoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={thermalReceiptLogoUrl}
                alt="شعار الفاتورة"
                className="mx-auto h-12 w-auto object-contain"
              />
            ) : (
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-black font-bold">
                LF
              </div>
            )}
            <p className="mt-1 font-semibold">AFEX</p>
            <p className="text-xs text-slate-500">تنظيف وإصلاح الجلود</p>
          </div>

          {thermalReceiptSettings.showBranchName && selectedBranchName ? (
            <>
              <hr className="my-2 border-t border-dashed border-black" />
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span>{selectedBranchName}</span>
                  <span>الفرع</span>
                </div>
              </div>
            </>
          ) : null}

          <hr className="my-2 border-t border-dashed border-black" />

          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span>{snapshotLabel('LF-0030', 'LF-0030')}</span>
              <span>رقم الفاتورة</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>{snapshotLabel('LF-1053', 'LF-1053')}</span>
              <span>رقم الطلب</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>{printDateLabel}</span>
              <span>التاريخ</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>{printTimeLabel}</span>
              <span>الوقت</span>
            </div>
          </div>

          <hr className="my-2 border-t border-dashed border-black" />

          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span>{customerName || '—'}</span>
              <span>اسم العميل</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>{customerPhone || '—'}</span>
              <span>رقم الجوال</span>
            </div>
          </div>

          <hr className="my-2 border-t border-dashed border-black" />

          <div className="mt-2 text-xs">
            <div className="mb-1 grid grid-cols-3 gap-2 font-semibold">
              <span className="text-right">العناصر</span>
              <span className="text-center">الكمية</span>
              <span className="text-left">السعر</span>
            </div>

            <div className="space-y-1 pt-1">
              {invoiceItems.map((item) => (
                <div
                  key={`print-${item.item_name}`}
                  className="grid grid-cols-3 gap-2"
                >
                  <span className="truncate text-right">{item.item_name}</span>
                  <span className="text-center">{item.quantity}</span>
                  <span className="text-left">
                    {item.unit_price.toFixed(2)} ريال
                  </span>
                </div>
              ))}
            </div>
          </div>

          <hr className="my-2 border-t border-dashed border-black" />

          <div className="mt-2 space-y-1 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span>{checkout.subtotal.toFixed(2)} ريال</span>
              <span>إجمالي العناصر</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>{checkout.discountAmount.toFixed(2)} ريال</span>
              <span>الخصم</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>{checkout.taxAmount.toFixed(2)} ريال</span>
              <span>الضريبة</span>
            </div>
            {isCashOnDelivery ? (
              <div className="flex items-center justify-between gap-3">
                <span>
                  {(checkout.remainingFromCustomer > 0
                    ? checkout.remainingFromCustomer
                    : checkout.finalTotal
                  ).toFixed(2)} ريال
                </span>
                <span>المتبقي عند الاستلام</span>
              </div>
            ) : null}
          </div>

          <div className="mt-2 bg-black py-2 text-center text-sm font-bold text-white">
            <p className="text-xs">{printFinalAmountLabel}</p>
            <div className="mt-1">{checkout.finalTotal.toFixed(2)} ريال</div>
          </div>

          <p className="mt-2 text-center text-xs">
            طريقة الدفع: {printPaymentMethodLabel}
          </p>

          {thermalReceiptSettings.showCashierName && cashierName ? (
            <p className="mt-2 text-center text-xs">الكاشير: {cashierName}</p>
          ) : null}

          {thermalReceiptSettings.showTaxNumber &&
          thermalReceiptSettings.taxNumber ? (
            <p className="mt-1 text-center text-xs">
              الرقم الضريبي: {thermalReceiptSettings.taxNumber}
            </p>
          ) : null}

          {thermalReceiptSettings.showQRCode ? (
            <div className="mt-3 flex justify-center">
              <ThermalReceiptQrPlaceholder
                value={`${snapshotLabel('LF-0030', 'LF-0030')}|${Math.round(
                  checkout.finalTotal
                )}|${printDateLabel}`}
              />
            </div>
          ) : null}

          <p className="mt-3 text-center text-xs">
            {thermalReceiptSettings.footerText}
          </p>
        </div>
      </div>

      {showCancelModal ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />

          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
                  onClick={confirmCancelInvoice}
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

function snapshotLabel(value: string, fallback: string) {
  return value || fallback
}

function DiscountSelectorCard({
  discounts,
  loading,
  selectedDiscount,
  onClear,
  onSelect,
}: {
  discounts: CheckoutDiscountOption[]
  loading: boolean
  selectedDiscount: CheckoutDiscountOption | null
  onClear: () => void
  onSelect: (value: CheckoutDiscountOption | null) => void
}) {
  const currentLabel = selectedDiscount
    ? formatDiscountOptionLabel(selectedDiscount)
    : 'بدون خصم'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-700">الخصومات</p>
        <span className="truncate text-[11px] font-medium text-slate-500">
          {currentLabel}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onClear}
          className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
            !selectedDiscount
              ? 'bg-[#020617] text-white'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          بدون خصم
        </button>

        {discounts.map((discountOption) => (
          <button
            key={discountOption.id}
            type="button"
            onClick={() => onSelect(discountOption)}
            className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
              selectedDiscount?.id === discountOption.id
                ? 'bg-[#020617] text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {formatDiscountOptionLabel(discountOption)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-3 text-xs text-slate-500">جاري التحميل...</p>
      ) : null}
    </div>
  )
}

function VatInfoCard({
  rate,
  enabled,
  loading,
}: {
  rate: number
  enabled: boolean
  loading: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-2 text-sm font-bold text-slate-700">الضريبة VAT</p>
      <div className="flex min-h-[44px] items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <span
          className={`font-medium ${enabled ? 'text-emerald-600' : 'text-slate-500'}`}
        >
          {loading ? 'جاري التحميل...' : enabled ? 'مطبقة' : 'غير مفعلة'}
        </span>
        <span className="font-bold text-slate-900">{enabled ? `${rate}%` : '0%'}</span>
      </div>
    </div>
  )
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-black text-slate-900">{value}</span>
    </div>
  )
}

function CalculationCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'slate' | 'green' | 'red'
}) {
  const toneClass =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'red'
        ? 'border-red-200 bg-red-50 text-red-600'
        : 'border-slate-300 bg-slate-50 text-slate-900'

  return (
    <div className={`rounded-xl border p-3 text-center ${toneClass}`}>
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-black">{value}</p>
    </div>
  )
}

function Trash2() {
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

function ThermalReceiptQrPlaceholder({ value }: { value: string }) {
  const cells = useMemo(() => {
    const seed = value
      .split('')
      .reduce((total, char, index) => total + char.charCodeAt(0) * (index + 1), 0)

    return Array.from({ length: 81 }, (_, index) => {
      const row = Math.floor(index / 9)
      const col = index % 9
      const inCorner =
        (row < 3 && col < 3) || (row < 3 && col > 5) || (row > 5 && col < 3)

      if (inCorner) {
        return true
      }

      return ((seed + row * 7 + col * 11 + index * 3) % 5) < 2
    })
  }, [value])

  return (
    <div className="rounded-md border border-black p-1">
      <div className="grid grid-cols-9 gap-[2px]">
        {cells.map((filled, index) => (
          <span
            key={`qr-cell-${index}`}
            className={`h-2 w-2 ${filled ? 'bg-black' : 'bg-white'}`}
          />
        ))}
      </div>
    </div>
  )
}

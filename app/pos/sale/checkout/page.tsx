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
import {
  readActivePosEmployee,
  type ActivePosEmployee,
} from '@/lib/pos-employee-session'

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
    allowedRoles: ['admin', 'employee', 'cashier'],
    redirectIfNoUser: '/pos/login',
    redirectIfForbidden: '/pos/login',
  })

  const authLoading = access.loading
  const authError = access.authError
  const authStatus = access.authStatus
  const allowed = access.allowed
  const branchId = access.branchId
  const tenantId = access.tenantId
  const scopeType = access.scopeType
  const { effectiveBranchId, selectedBranchName } = useAdminBranchFilter(
    scopeType,
    branchId,
    allowed,
    tenantId
  )
  const [activePosEmployee] = useState<ActivePosEmployee | null>(() =>
    readActivePosEmployee()
  )
  const posEmployeeBranchId = activePosEmployee?.branch_id || null
  const checkoutBranchId = posEmployeeBranchId || effectiveBranchId
  const hasInvalidBranchContext =
    scopeType === 'branch' && !branchId && !posEmployeeBranchId
  const hasAmbiguousAdminBranchContext =
    scopeType === 'system' && access.userRole === 'admin' && !checkoutBranchId

  const [ready, setReady] = useState(false)
  const [missingCheckoutData, setMissingCheckoutData] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [invoiceItems, setInvoiceItems] = useState<InvoiceLineItem[]>([])
  const [availableDiscounts, setAvailableDiscounts] = useState<
    CheckoutDiscountOption[]
  >(() => peekClientResource<CheckoutDiscountOption[]>(getDiscountsCacheKey(checkoutBranchId)) || [])
  const [loadingDiscounts, setLoadingDiscounts] = useState(false)
  const [availableVatSetting, setAvailableVatSetting] = useState<CheckoutVatSetting | null>(
    () => peekClientResource<CheckoutVatSetting | null>(getVatCacheKey(checkoutBranchId)) || null
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
        const discountsCacheKey = getDiscountsCacheKey(checkoutBranchId)
        const cachedDiscounts =
          peekClientResource<CheckoutDiscountOption[]>(discountsCacheKey) || []

        if (!cancelled && cachedDiscounts.length > 0) {
          setAvailableDiscounts(cachedDiscounts)
          setLoadingDiscounts(false)
        } else {
          setLoadingDiscounts(true)
        }

        const searchParams = new URLSearchParams()
        if (checkoutBranchId) {
          searchParams.set('branchId', checkoutBranchId)
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
            logLabel: `fetch discounts (${checkoutBranchId || 'all'})`,
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
  }, [allowed, checkoutBranchId])

  useEffect(() => {
    if (!allowed) return

    let cancelled = false

    async function loadVatSetting() {
      try {
        const vatCacheKey = getVatCacheKey(checkoutBranchId)
        const cachedSetting =
          peekClientResource<CheckoutVatSetting | null>(vatCacheKey) || null

        if (!cancelled && cachedSetting) {
          setAvailableVatSetting(cachedSetting)
          setLoadingVat(false)
        } else {
          setLoadingVat(true)
        }

        const searchParams = new URLSearchParams()
        if (checkoutBranchId) {
          searchParams.set('branchId', checkoutBranchId)
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
            logLabel: `fetch vat (${checkoutBranchId || 'all'})`,
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
  }, [allowed, checkoutBranchId])

  const checkout = useInvoiceCheckout({
    customerName,
    customerPhone,
    invoiceItems,
    hasInvalidBranchContext,
    hasAmbiguousAdminBranchContext,
    branchId: checkoutBranchId,
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

  const remainingCardTone = useMemo<'teal' | 'red'>(() => {
    return checkout.remainingFromCustomer === 0 ? 'teal' : 'red'
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
      <div className="fixed inset-0 flex h-[100svh] w-screen items-center justify-center overflow-hidden bg-[#020817] p-5 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(34,211,238,0.16),transparent_34%),linear-gradient(135deg,#020817_0%,#061426_52%,#020817_100%)]" />
        <div className="relative w-full max-w-md space-y-4 rounded-[28px] border border-cyan-300/12 bg-[#020817]/72 p-5 text-right shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div>
            <h2 className="text-lg font-black text-white">تعذر تجهيز نقطة البيع</h2>
            <p className="mt-1 text-sm font-bold text-slate-400">تحقق من تسجيل الدخول أو أعد المحاولة</p>
          </div>
          <button
            type="button"
            onClick={() => {
              window.location.href = '/pos/login'
            }}
            className="rounded-2xl bg-cyan-300 px-4 py-2 text-sm font-black text-[#02101c]"
          >
            تسجيل الدخول
          </button>
        </div>
      </div>
    )
  }

  if (authLoading || !allowed || !ready) {
    return (
      <div className="fixed inset-0 flex h-[100svh] w-screen items-center justify-center overflow-hidden bg-[#020817] p-5 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(34,211,238,0.16),transparent_34%),linear-gradient(135deg,#020817_0%,#061426_52%,#020817_100%)]" />
        <div className="relative rounded-[28px] border border-cyan-300/12 bg-[#020817]/72 px-6 py-4 text-sm font-black text-cyan-100 shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          جاري تحميل بيانات الفاتورة...
        </div>
      </div>
    )
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

        <div className="fixed inset-0 z-[50] h-[100svh] w-screen overflow-hidden bg-[#020817] p-5 text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(34,211,238,0.16),transparent_34%),linear-gradient(135deg,#020817_0%,#061426_52%,#020817_100%)]" />
          <div className="relative rounded-[28px] border border-cyan-300/12 bg-[#020817]/72 p-5 text-right shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
            <p className="text-sm font-bold text-slate-300">
              لا يمكن إتمام الفاتورة حالياً لأن بيانات العميل أو العناصر غير متوفرة بشكل صحيح.
            </p>
            <button
              type="button"
              onClick={() => router.push('/pos/sale/items')}
              className="mt-4 flex h-[48px] items-center justify-center rounded-2xl border border-cyan-300/18 bg-cyan-400/10 px-5 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/15"
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
        <div className="fixed right-5 top-5 z-[60] rounded-[22px] border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100 backdrop-blur-xl">
          لا يمكن إنشاء فاتورة لأن حسابك غير مرتبط بفرع صالح.
        </div>
      ) : null}

      {hasAmbiguousAdminBranchContext ? (
        <div className="fixed right-5 top-20 z-[60] rounded-[22px] border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100 backdrop-blur-xl">
          اختر فرعًا محددًا قبل استخدام شاشة الدفع.
        </div>
      ) : null}

      <div className="fixed inset-0 z-[50] h-[100svh] w-screen overflow-hidden bg-[#020817] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_82%_82%,rgba(14,165,233,0.10),transparent_38%),linear-gradient(135deg,#020817_0%,#061426_52%,#020817_100%)]" />
        <div className="relative flex h-full w-full gap-4 overflow-hidden p-4 [direction:ltr] xl:p-5">
          <main className="order-1 flex min-w-0 flex-1 flex-col gap-3 overflow-hidden [direction:rtl]">
            {checkout.successMessage ? (
              <div className="rounded-[22px] border border-[#14B8A6]/25 bg-[#14B8A6]/10 px-4 py-3 text-sm font-bold text-teal-50 shadow-[0_0_28px_rgba(20,184,166,0.16)]">
                {checkout.successMessage}
              </div>
            ) : null}
            {checkout.errorMessage ? (
              <div className="rounded-[22px] border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">
                {checkout.errorMessage}
              </div>
            ) : null}
            {checkout.offlineDraftMessage ? (
              <div className="rounded-[22px] border border-[#14B8A6]/25 bg-[#14B8A6]/10 px-4 py-3 text-sm font-bold text-teal-50 shadow-[0_0_28px_rgba(20,184,166,0.16)]">
                {checkout.offlineDraftMessage}
              </div>
            ) : null}
            {isOffline ? (
              <div className="rounded-[22px] border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-100">
                أنت غير متصل، سيتم حفظ الفاتورة كمسودة فقط
              </div>
            ) : null}

            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[32px] border border-cyan-300/10 bg-[#020817]/62 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_70px_rgba(2,8,23,0.36)] backdrop-blur-2xl">
              <div className="mb-3 flex shrink-0 items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black tracking-[0.18em] text-cyan-300">
                    CHECKOUT
                  </p>
                  <h1 className="mt-1 text-3xl font-black text-white">
                  الدفع وإنهاء الفاتورة
                  </h1>
                  <p className="mt-1 text-sm font-bold text-slate-400">
                    اختر طريقة الدفع وأكمل عملية البيع
                  </p>
                </div>
                <div className="rounded-full border border-cyan-300/12 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100">
                  {selectedPaymentLabel}
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                <div className="grid grid-cols-4 gap-3">
                  {PAYMENT_METHODS.map((option) => {
                    const selected = checkout.paymentMethod === option.id

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handleSelectPayment(option)}
                        className={`flex min-h-[104px] flex-col items-center justify-center gap-3 rounded-[26px] border px-3 text-center transition-all duration-150 active:scale-[0.98] touch-manipulation ${
                          selected
                            ? 'border-cyan-300/55 bg-cyan-300/14 text-cyan-50 shadow-[0_0_42px_rgba(34,211,238,0.22)]'
                            : 'border-cyan-300/12 bg-[#061426]/62 text-slate-300 hover:border-cyan-300/28 hover:bg-cyan-300/8'
                        }`}
                      >
                        <span className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-cyan-300/12 bg-[#020817]/70 text-cyan-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                          <PaymentMethodIcon method={option.id} />
                        </span>
                        <span className="text-base font-black">{option.label}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
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

                <div className="rounded-[28px] border border-cyan-300/10 bg-[#061426]/58 p-4">
                  <label className="mb-2 block text-xs font-black text-slate-400">
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
                    className={`h-16 w-full rounded-[22px] border px-5 text-right text-2xl font-black outline-none transition placeholder:text-slate-500 ${
                      checkout.isReceivedAmountEditable
                        ? 'border-cyan-300/18 bg-[#020817]/75 text-white focus:border-cyan-300/42 focus:ring-4 focus:ring-cyan-300/10'
                        : 'cursor-not-allowed border-cyan-300/8 bg-[#020817]/45 text-slate-500'
                    }`}
                  />

                  <div className="mt-3 grid grid-cols-5 gap-2">
                    {([
                      { label: '+50', value: 50 },
                      { label: '+100', value: 100 },
                      { label: '+200', value: 200 },
                      { label: '+500', value: 500 },
                      { label: 'كامل', value: 'full' as const },
                    ]).map((amountOption) => (
                      <button
                        key={amountOption.label}
                        type="button"
                        onClick={() => handleApplyQuickAmount(amountOption.value)}
                        disabled={!checkout.isReceivedAmountEditable}
                        className="flex min-h-[48px] items-center justify-center rounded-[18px] border border-cyan-300/12 bg-[#020817]/70 px-3 text-sm font-black text-cyan-100 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900/50 disabled:text-slate-600"
                      >
                        {amountOption.label}
                      </button>
                    ))}
                  </div>
                </div>

                {cashWarningMessage ? (
                  <div className="rounded-[20px] border border-amber-300/20 bg-amber-400/10 px-3 py-2.5 text-sm font-bold text-amber-100">
                    {cashWarningMessage}
                  </div>
                ) : null}

                {checkout.cashChange > 0 ? (
                  <div className="rounded-[20px] border border-[#14B8A6]/25 bg-[#14B8A6]/10 px-3 py-2.5 text-sm font-bold text-teal-50 shadow-[0_0_24px_rgba(20,184,166,0.14)]">
                    الباقي للعميل: {formatCurrency(checkout.cashChange)}
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-3">
                  <CalculationCard
                    label="الإجمالي"
                    value={formatCurrency(checkout.finalTotal)}
                    tone="slate"
                  />
                  <CalculationCard
                    label="المبلغ المستلم"
                    value={formatCurrency(checkout.numericCashReceived)}
                    tone="teal"
                  />
                  <CalculationCard
                    label="الباقي"
                    value={
                      checkout.cashChange > 0
                        ? formatCurrency(checkout.cashChange)
                        : formatCurrency(checkout.remainingFromCustomer)
                    }
                    tone={remainingCardTone}
                  />
                </div>

                <div className="space-y-2">
                  <label className="mb-2 block text-xs font-black text-slate-400">
                    ملاحظة
                  </label>
                  <textarea
                    value={checkout.note}
                    onChange={(event) => checkout.setNote(event.target.value)}
                    placeholder="اكتب ملاحظة..."
                    className="min-h-[86px] w-full rounded-[22px] border border-cyan-300/12 bg-[#020817]/70 px-4 py-3 text-right text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/36 focus:ring-4 focus:ring-cyan-300/10"
                  />
                </div>
              </div>

              <div className="mt-3 flex shrink-0 flex-col gap-2 border-t border-cyan-300/10 pt-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={handleCreateInvoice}
                  disabled={!canSubmitInvoice}
                  className="flex h-16 flex-1 items-center justify-center rounded-[24px] bg-[linear-gradient(135deg,#14B8A6,#06B6D4)] text-lg font-black text-[#020817] shadow-[0_0_34px_rgba(20,184,166,0.28)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
                >
                  {checkout.loading ? 'جاري إنشاء الفاتورة...' : 'إنشاء الفاتورة'}
                </button>

                <button
                  type="button"
                  onClick={handleCancelInvoice}
                  className="flex h-14 items-center justify-center rounded-[22px] border border-red-400/18 bg-red-500/10 px-6 text-sm font-black text-red-200 transition active:scale-[0.98]"
                >
                  إلغاء الفاتورة
                </button>
              </div>
            </section>
          </main>

          <aside className="order-2 flex h-full w-[330px] shrink-0 flex-col overflow-hidden rounded-[30px] border border-cyan-300/10 bg-[#020817]/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_22px_60px_rgba(0,0,0,0.34)] backdrop-blur-2xl [direction:rtl]">
            <div className="shrink-0 rounded-[24px] border border-cyan-300/10 bg-[#061426]/68 p-3.5">
              <p className="text-xs font-black tracking-[0.18em] text-cyan-300">
                INVOICE
              </p>
              <h2 className="mt-1 text-xl font-black text-white">ملخص الفاتورة</h2>
            </div>

            <div className="mt-2.5 shrink-0 rounded-[24px] border border-cyan-300/10 bg-[#061426]/58 p-3.5">
              <p className="text-xs font-black text-slate-400">العميل</p>
              <p className="mt-2 truncate text-lg font-black text-white">
                {customerName || 'بدون اسم'}
              </p>
              <p className="mt-1 truncate text-sm font-bold text-slate-400">
                {customerPhone || 'بدون رقم جوال'}
              </p>
            </div>

            <div className="mt-2 flex min-h-0 flex-1 flex-col rounded-[24px] border border-cyan-300/10 bg-[#061426]/50 p-2.5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-black text-white">العناصر</h3>
                <span className="rounded-full bg-cyan-300/12 px-3 py-1 text-xs font-black text-cyan-100">
                  {invoiceItems.length}
                </span>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {invoiceItems.map((item) => (
                  <div
                    key={item.item_name}
                    className="rounded-[20px] border border-cyan-300/10 bg-[#020817]/58 p-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-white">
                          {item.item_name}
                        </p>
                        <div className="mt-1.5 flex items-center gap-3 text-xs font-bold text-slate-400">
                          <span>الكمية: {item.quantity}</span>
                          <span>{formatCurrency(item.unit_price)}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.item_name)}
                        className="flex h-9 w-9 flex-none items-center justify-center rounded-2xl text-red-300 transition hover:bg-red-500/10"
                        aria-label={`حذف ${item.item_name}`}
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-2 shrink-0 rounded-[24px] border border-cyan-300/10 bg-[#061426]/58 p-3">
              <div className="space-y-2">
                <SummaryMetric
                  label="المجموع الفرعي"
                  value={formatCurrency(checkout.subtotal)}
                />
                <SummaryMetric
                  label="الخصم"
                  value={formatCurrency(checkout.discountAmount)}
                />
                <SummaryMetric
                  label="VAT"
                  value={formatCurrency(checkout.taxAmount)}
                />
              </div>
              <div className="mt-3 border-t border-cyan-300/10 pt-3">
                <p className="text-xs font-black text-cyan-100">الإجمالي</p>
                <p className="mt-1 text-3xl font-black text-white">
                  {formatCurrency(checkout.finalTotal)}
                </p>
              </div>
            </div>

            <div className="mt-2 shrink-0 space-y-2">
              <button
                type="button"
                onClick={() => router.push('/pos/sale/items')}
                className="flex h-12 w-full items-center justify-center rounded-[20px] border border-cyan-300/14 bg-cyan-400/10 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/15"
              >
                العودة إلى العناصر
              </button>
              <button
                type="button"
                onClick={handleCancelInvoice}
                className="flex h-12 w-full items-center justify-center rounded-[20px] border border-red-400/18 bg-red-500/10 text-sm font-black text-red-200 transition hover:bg-red-500/14"
              >
                إلغاء الفاتورة
              </button>
            </div>
          </aside>
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
          <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" />

          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-[28px] border border-red-400/18 bg-[#020817]/95 p-6 text-right shadow-[0_28px_80px_rgba(0,0,0,0.55)]">
              <h2 className="mb-2 text-lg font-black text-white">
                إلغاء الفاتورة
              </h2>

              <p className="mb-6 text-sm font-bold leading-7 text-slate-300">
                هل أنت متأكد من إلغاء الفاتورة؟
              </p>

              <div className="flex justify-end gap-2">
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
    <div className="rounded-[26px] border border-cyan-300/10 bg-[#061426]/58 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black text-white">الخصومات</p>
        <span className="truncate text-[11px] font-bold text-slate-400">
          {currentLabel}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onClear}
          className={`min-h-[38px] rounded-2xl px-3 py-1.5 text-xs font-black transition ${
            !selectedDiscount
              ? 'bg-cyan-300 text-[#02101c] shadow-[0_0_24px_rgba(34,211,238,0.22)]'
              : 'border border-cyan-300/12 bg-[#020817]/65 text-slate-300 hover:bg-cyan-400/10'
          }`}
        >
          بدون خصم
        </button>

        {discounts.map((discountOption) => (
          <button
            key={discountOption.id}
            type="button"
            onClick={() => onSelect(discountOption)}
            className={`min-h-[38px] rounded-2xl px-3 py-1.5 text-xs font-black transition ${
              selectedDiscount?.id === discountOption.id
                ? 'bg-cyan-300 text-[#02101c] shadow-[0_0_24px_rgba(34,211,238,0.22)]'
                : 'border border-cyan-300/12 bg-[#020817]/65 text-slate-300 hover:bg-cyan-400/10'
            }`}
          >
            {formatDiscountOptionLabel(discountOption)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-3 text-xs font-bold text-slate-400">جاري التحميل...</p>
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
    <div className="rounded-[26px] border border-cyan-300/10 bg-[#061426]/58 p-3.5">
      <p className="mb-2 text-sm font-black text-white">الضريبة VAT</p>
      <div className="flex min-h-[52px] items-center justify-between rounded-[20px] border border-cyan-300/10 bg-[#020817]/65 px-3 py-2 text-sm">
        <span
          className={`font-black ${enabled ? 'text-[#14B8A6]' : 'text-slate-500'}`}
        >
          {loading ? 'جاري التحميل...' : enabled ? 'مطبقة' : 'غير مفعلة'}
        </span>
        <span className="font-black text-white">{enabled ? `${rate}%` : '0%'}</span>
      </div>
    </div>
  )
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="font-bold text-slate-400">{label}</span>
      <span className="font-black text-white">{value}</span>
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
  tone: 'slate' | 'teal' | 'red'
}) {
  const toneClass =
    tone === 'teal'
      ? 'border-[#14B8A6]/25 bg-[#0D9488]/12 text-teal-50 shadow-[0_0_24px_rgba(20,184,166,0.14)]'
      : tone === 'red'
        ? 'border-red-300/18 bg-red-500/10 text-red-100'
        : 'border-cyan-300/12 bg-[#061426]/58 text-white'

  return (
    <div className={`rounded-[24px] border p-3 text-center ${toneClass}`}>
      <p className="text-xs font-black text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-black">{value}</p>
    </div>
  )
}

function PaymentMethodIcon({
  method,
}: {
  method: (typeof PAYMENT_METHODS)[number]['id']
}) {
  if (method === 'cash') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10" aria-hidden="true">
        <path
          d="M3.5 7.5h17v9h-17z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7 7.5a3 3 0 0 1-3 3M17 7.5a3 3 0 0 0 3 3M7 16.5a3 3 0 0 0-3-3M17 16.5a3 3 0 0 1 3-3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx="12"
          cy="12"
          r="2.4"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
    )
  }

  if (method === 'cod') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10" aria-hidden="true">
        <path
          d="M3 7h11v10H3zM14 11h3.4l2.6 3v3h-6z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="7" cy="18" r="1.7" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="18" cy="18" r="1.7" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M6 10h5M6 13h3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    )
  }

  return (
    <span className="flex flex-col items-center justify-center gap-0.5">
      <svg viewBox="0 0 24 24" fill="none" className="h-9 w-9" aria-hidden="true">
        <rect
          x="3"
          y="5.5"
          width="18"
          height="13"
          rx="2.6"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M3.5 10h17M7 14.5h4.5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
      {method === 'visa' ? (
        <span className="text-[10px] font-black leading-none tracking-[0.18em] text-cyan-100">
          VISA
        </span>
      ) : null}
    </span>
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

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
import { useMobileViewport } from '@/hooks/use-mobile-viewport'
import { getClientErrorMessage } from '@/lib/api/client-error'
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
import { clearCompletedInvoiceDraftState } from '@/lib/invoices/sale-reset'
import {
  getPaymentMethodLabel,
  normalizeUiPaymentMethod,
  PAYMENT_METHODS,
} from '@/lib/invoices/payment-method'
import { formatCurrency } from '@/lib/orders/format'
import { formatPosGregorianDate, formatPosTime } from '@/lib/pos/date-format'
import {
  readActivePosEmployee,
  type ActivePosEmployee,
} from '@/lib/pos-employee-session'
import { PosCheckoutWorkspace } from '@/components/pos-checkout-workspace'

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

const POS_RUNTIME_CACHE_TTL_MS = 30_000

function triggerCheckoutHaptic(style: 'LIGHT' | 'MEDIUM') {
  if (typeof window === 'undefined') return

  const vibrateFallback = () => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(style === 'MEDIUM' ? 70 : 35)
    }
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
    const impactResult = capacitorHaptics.impact({ style })
    void Promise.resolve(impactResult).catch(vibrateFallback)
  } catch {
    vibrateFallback()
  }
}

type PosRuntime = {
  discounts: CheckoutDiscountOption[]
  vat: CheckoutVatSetting | null
}

function getPosRuntimeCacheKey(tenantId: string | null, branchId: string | null) {
  return `pos-runtime:${tenantId || 'unknown'}:${branchId || 'all'}`
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
  const isMobileViewport = useMobileViewport()
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
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [invoiceItems, setInvoiceItems] = useState<InvoiceLineItem[]>([])
  const [availableDiscounts, setAvailableDiscounts] = useState<
    CheckoutDiscountOption[]
  >([])
  const [loadingDiscounts, setLoadingDiscounts] = useState(false)
  const [availableVatSetting, setAvailableVatSetting] = useState<CheckoutVatSetting | null>(
    null
  )
  const [loadingVat, setLoadingVat] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showInvoiceConfirmation, setShowInvoiceConfirmation] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const cashReceivedInputRef = useRef<HTMLInputElement | null>(null)
  const submitLockedRef = useRef(false)
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
    () => formatPosGregorianDate(printIssuedAt),
    [printIssuedAt]
  )
  const printTimeLabel = useMemo(
    () => formatPosTime(printIssuedAt),
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
      setCustomerId(parsedCustomer.customerId)
      setInvoiceItems(parsedItems.items)
      setReady(true)
    }, 0)
  }, [allowed])

  useEffect(() => {
    if (!allowed) return

    let cancelled = false

    async function loadRuntime() {
      try {
        const runtimeCacheKey = getPosRuntimeCacheKey(tenantId, checkoutBranchId)
        const cachedRuntime = peekClientResource<PosRuntime>(runtimeCacheKey)

        if (!cancelled && cachedRuntime) {
          setAvailableDiscounts(cachedRuntime.discounts)
          setAvailableVatSetting(cachedRuntime.vat)
          setLoadingDiscounts(false)
          setLoadingVat(false)
        } else {
          setLoadingDiscounts(true)
          setLoadingVat(true)
        }

        const searchParams = new URLSearchParams()
        if (checkoutBranchId) {
          searchParams.set('branchId', checkoutBranchId)
        }

        const runtime = await loadClientResource<PosRuntime>(
          runtimeCacheKey,
          async () => {
            const response = await fetch(
              `/api/pos/runtime${
                searchParams.toString() ? `?${searchParams.toString()}` : ''
              }`,
              {
                method: 'GET',
                cache: 'no-store',
              }
            )

            const result = await response.json().catch(() => null)

            if (!response.ok || !result?.success) {
              throw new Error(getClientErrorMessage(result, 'تعذر تحميل الخصومات حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
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
            logLabel: `fetch POS runtime (${checkoutBranchId || 'all'})`,
          }
        )

        if (!cancelled) {
          setAvailableDiscounts(runtime.discounts)
          setAvailableVatSetting(runtime.vat)
        }
      } catch {
        if (!cancelled) {
          setAvailableDiscounts([])
          setAvailableVatSetting(null)
        }
      } finally {
        if (!cancelled) {
          setLoadingDiscounts(false)
          setLoadingVat(false)
        }
      }
    }

    void loadRuntime()

    return () => {
      cancelled = true
    }
  }, [allowed, checkoutBranchId, tenantId])

  const checkout = useInvoiceCheckout({
    customerId,
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

      clearCompletedInvoiceDraftState()
      setInvoiceItems([])
      sessionStorage.setItem(
        INVOICE_SUCCESS_STORAGE_KEY,
        serializeInvoiceSuccessSnapshot(nextSnapshot)
      )
      performance.mark('afex-checkout-navigation-start')
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

    if (hasInvalidBranchContext || hasAmbiguousAdminBranchContext) {
      return false
    }

    if (loadingDiscounts || loadingVat) {
      return false
    }

    if (normalizedPaymentMethod === 'cash' && checkout.numericCashReceived <= 0) {
      return false
    }

    return true
  }, [
    checkout.loading,
    checkout.numericCashReceived,
    customerName,
    customerPhone,
    hasAmbiguousAdminBranchContext,
    hasInvalidBranchContext,
    invoiceItems.length,
    loadingDiscounts,
    loadingVat,
    normalizedPaymentMethod,
  ])

  const cashWarningMessage = useMemo(() => {
    if (normalizedPaymentMethod !== 'cash' || checkout.remainingFromCustomer <= 0) {
      return ''
    }

    return `المبلغ المستلم أقل من الإجمالي. المتبقي سيظهر على الفاتورة: ${formatCurrency(checkout.remainingFromCustomer)}`
  }, [checkout.remainingFromCustomer, normalizedPaymentMethod])

  const handleSelectPayment = (option: (typeof PAYMENT_METHODS)[number]) => {
    checkout.setPaymentMethod(option.id)
    triggerCheckoutHaptic('LIGHT')
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

  const handleCreateInvoice = async () => {
    if (!canSubmitInvoice || submitLockedRef.current) {
      return
    }

    submitLockedRef.current = true
    triggerCheckoutHaptic('MEDIUM')
    try {
      await checkout.createInvoice()
    } finally {
      submitLockedRef.current = false
    }
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
    if (!showInvoiceConfirmation || !isMobileViewport) {
      return
    }

    const previousBodyOverflow = document.body.style.overflow
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !checkout.loading) {
        setShowInvoiceConfirmation(false)
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = previousBodyOverflow
      window.removeEventListener('keydown', handleEscape)
    }
  }, [checkout.loading, isMobileViewport, showInvoiceConfirmation])

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
          جارٍ تحميل بيانات الفاتورة...
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

  if (!missingCheckoutData) {
    return (
      <PosCheckoutWorkspace
        customerName={customerName}
        customerPhone={customerPhone}
        customerId={customerId}
        items={invoiceItems}
        subtotal={checkout.subtotal}
        taxAmount={checkout.taxAmount}
        discountAmount={checkout.discountAmount}
        finalTotal={checkout.finalTotal}
        paymentMethod={checkout.paymentMethod}
        cashReceived={checkout.cashReceived}
        cashChange={checkout.cashChange}
        remainingFromCustomer={checkout.remainingFromCustomer}
        note={checkout.note}
        discounts={availableDiscounts}
        selectedDiscount={checkout.selectedDiscount}
        loadingDiscounts={loadingDiscounts}
        loading={checkout.loading}
        canSubmit={canSubmitInvoice}
        errorMessage={checkout.errorMessage}
        offlineMessage={checkout.offlineDraftMessage || (isOffline ? 'أنت غير متصل؛ سيتم حفظ الفاتورة كمسودة فقط.' : '')}
        cashWarning={cashWarningMessage}
        onBack={() => router.push('/pos/sale/items')}
        onPaymentChange={(method) => handleSelectPayment({ id: method, label: getPaymentMethodLabel(method) })}
        onCashReceivedChange={checkout.setCashReceived}
        onDiscountChange={checkout.setSelectedDiscount}
        onNoteChange={checkout.setNote}
        onSubmit={handleCreateInvoice}
      />
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

        @keyframes pos-checkout-enter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 639px) {
          .pos-checkout-enter { animation: pos-checkout-enter 200ms ease-out both; }
        }

        @media (prefers-reduced-motion: reduce) {
          .pos-checkout-page *,
          .pos-checkout-page *::before,
          .pos-checkout-page *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
          }
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

      {isMobileViewport ? (
        <div className="fixed inset-0 z-[50] h-[100svh] w-screen overflow-hidden bg-[#020817] text-white [direction:rtl]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(34,211,238,0.11),transparent_30%),linear-gradient(180deg,#020817_0%,#041224_54%,#020817_100%)]" />
          <div className="pos-checkout-enter relative h-full overflow-y-auto overscroll-contain px-4 pb-48 pt-[max(1rem,env(safe-area-inset-top))]">
            <header className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black tracking-[0.24em] text-cyan-300">CHECKOUT</p>
                <h1 className="mt-1 text-[28px] font-black leading-tight text-white">ملخص الفاتورة</h1>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-400">راجع الفاتورة قبل إنشاء عملية البيع</p>
              </div>
              <button
                type="button"
                onClick={() => router.push('/pos/sale/items')}
                aria-label="العودة إلى العناصر"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] bg-cyan-300/[0.07] text-xl text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80 active:scale-95"
              >
                ←
              </button>
            </header>

            {checkout.successMessage ? (
              <div className="mb-3 rounded-[18px] bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.20)]">{checkout.successMessage}</div>
            ) : null}
            {checkout.errorMessage ? (
              <div className="mb-3 rounded-[18px] bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.18)]">{checkout.errorMessage}</div>
            ) : null}
            {checkout.offlineDraftMessage ? (
              <div className="mb-3 rounded-[18px] bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.20)]">{checkout.offlineDraftMessage}</div>
            ) : null}
            {isOffline ? (
              <div className="mb-3 rounded-[18px] bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-100 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.18)]">أنت غير متصل، سيتم حفظ الفاتورة كمسودة فقط</div>
            ) : null}

            <section className="flex items-center gap-3 rounded-[22px] bg-white/[0.035] p-3.5 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.12)]">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-cyan-300/10 text-base font-black text-cyan-100">
                {(customerName.trim().charAt(0) || 'ع').toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-white">{customerName || 'بدون اسم'}</p>
                <p dir="ltr" className="mt-1 truncate text-right text-xs font-bold text-slate-400">{customerPhone || 'بدون رقم جوال'}</p>
                {selectedBranchName ? <p className="mt-1 truncate text-[11px] font-bold text-cyan-100/70">{selectedBranchName}</p> : null}
              </div>
            </section>

            <section className="mt-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-base font-black text-white">العناصر</h2>
                <span className="text-xs font-black text-cyan-100">{invoiceItems.length} عنصر</span>
              </div>
              <div className="divide-y divide-cyan-300/10 overflow-hidden rounded-[22px] bg-white/[0.03] shadow-[inset_0_0_0_1px_rgba(34,211,238,0.10)]">
                {invoiceItems.map((item) => (
                  <div key={item.item_name} className="flex min-w-0 items-center gap-3 px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 break-words text-sm font-black text-white">{item.item_name}</p>
                      <p className="mt-1 text-xs font-bold text-slate-400">{item.quantity} × {formatCurrency(item.unit_price)}</p>
                    </div>
                    <p className="shrink-0 text-sm font-black text-cyan-100">{formatCurrency(item.quantity * item.unit_price)}</p>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.item_name)}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] text-red-300 transition hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70 active:scale-95"
                      aria-label={`حذف ${item.item_name}`}
                    >
                      <Trash2 />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-6">
              <h2 className="mb-3 text-base font-black text-white">طريقة الدفع</h2>
              <div className="grid grid-cols-2 gap-2.5">
                {PAYMENT_METHODS.map((option) => {
                  const selected = checkout.paymentMethod === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleSelectPayment(option)}
                      aria-pressed={selected}
                      className={`flex min-h-[54px] items-center justify-center rounded-[18px] px-3 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80 active:scale-[0.98] ${selected ? 'bg-cyan-300/15 text-cyan-50 shadow-[0_0_22px_rgba(34,211,238,0.13),inset_0_0_0_1px_rgba(34,211,238,0.50)]' : 'bg-white/[0.035] text-slate-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.11)]'}`}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </section>

            <div className="mt-4 grid gap-3">
              <DiscountSelectorCard
                discounts={availableDiscounts}
                loading={loadingDiscounts}
                selectedDiscount={checkout.selectedDiscount}
                onClear={checkout.clearAppliedDiscount}
                onSelect={checkout.setSelectedDiscount}
              />
              <VatInfoCard rate={checkout.vatRate} enabled={checkout.vatEnabled} loading={loadingVat} />
            </div>

            {normalizedPaymentMethod === 'cash' ? (
              <section className="mt-4 rounded-[22px] bg-white/[0.035] p-4 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.12)]">
                <label className="mb-2 block text-xs font-black text-slate-400">المبلغ المستلم</label>
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
                  inputMode="decimal"
                  enterKeyHint="done"
                  readOnly={!checkout.isReceivedAmountEditable}
                  disabled={!checkout.isReceivedAmountEditable}
                  className="h-14 w-full rounded-[18px] border-0 bg-[#020817]/70 px-4 text-right text-xl font-black text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.18)] outline-none placeholder:text-slate-600 focus:shadow-[0_0_18px_rgba(34,211,238,0.10),inset_0_0_0_1px_rgba(34,211,238,0.42)] disabled:text-slate-500"
                />
                <div className="mt-3 grid grid-cols-5 gap-1.5">
                  {([{ label: '+50', value: 50 }, { label: '+100', value: 100 }, { label: '+200', value: 200 }, { label: '+500', value: 500 }, { label: 'كامل', value: 'full' as const }]).map((amountOption) => (
                    <button key={amountOption.label} type="button" onClick={() => handleApplyQuickAmount(amountOption.value)} disabled={!checkout.isReceivedAmountEditable} className="min-h-11 rounded-[14px] bg-cyan-300/[0.06] px-1 text-xs font-black text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.12)] disabled:text-slate-600">
                      {amountOption.label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-[16px] bg-[#020817]/55 p-3">
                    <p className="text-[11px] font-bold text-slate-400">المتبقي</p>
                    <p className="mt-1 text-sm font-black text-amber-100">{formatCurrency(checkout.remainingFromCustomer)}</p>
                  </div>
                  <div className="rounded-[16px] bg-emerald-400/[0.07] p-3">
                    <p className="text-[11px] font-bold text-slate-400">الباقي للعميل</p>
                    <p className="mt-1 text-sm font-black text-emerald-100">{formatCurrency(checkout.cashChange)}</p>
                  </div>
                </div>
                {checkout.numericCashReceived <= 0 ? <p className="mt-3 text-sm font-bold text-amber-100">أدخل المبلغ المستلم قبل إنشاء الفاتورة.</p> : null}
                {cashWarningMessage ? <p className="mt-3 text-sm font-bold leading-6 text-amber-100">{cashWarningMessage}</p> : null}
              </section>
            ) : null}

            <section className="mt-4 rounded-[22px] bg-white/[0.035] p-4 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.12)]">
              <div className="space-y-2.5">
                <SummaryMetric label="المجموع الفرعي" value={formatCurrency(checkout.subtotal)} />
                <SummaryMetric label="الخصم" value={formatCurrency(checkout.discountAmount)} />
                <SummaryMetric label="VAT" value={formatCurrency(checkout.taxAmount)} />
              </div>
              <div className="mt-4 flex items-end justify-between gap-4 border-t border-cyan-300/12 pt-4">
                <p className="text-sm font-black text-cyan-100">الإجمالي المستحق</p>
                <p className="text-[28px] font-black leading-none text-white">{formatCurrency(checkout.finalTotal)}</p>
              </div>
            </section>

            <section className="mt-4">
              <label className="mb-2 block text-xs font-black text-slate-400">ملاحظة</label>
              <textarea value={checkout.note} onChange={(event) => checkout.setNote(event.target.value)} placeholder="اكتب ملاحظة..." className="min-h-[86px] w-full resize-none rounded-[20px] border-0 bg-white/[0.035] px-4 py-3 text-right text-sm font-bold text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.12)] outline-none placeholder:text-slate-600 focus:shadow-[0_0_18px_rgba(34,211,238,0.10),inset_0_0_0_1px_rgba(34,211,238,0.36)]" />
            </section>

            <button type="button" onClick={handleCancelInvoice} className="mt-5 min-h-11 px-3 text-sm font-black text-red-200/80 underline decoration-red-300/20 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60">
              إلغاء الفاتورة
            </button>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-20 border-t border-cyan-300/10 bg-[#020817]/94 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-2xl">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <span className="text-xs font-black text-slate-400">المبلغ المطلوب</span>
              <span className="text-lg font-black text-white">{formatCurrency(checkout.finalTotal)}</span>
            </div>
            <button type="button" onClick={() => setShowInvoiceConfirmation(true)} disabled={!canSubmitInvoice} className="flex min-h-[60px] w-full items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#14B8A6,#22D3EE)] px-5 text-base font-black text-[#020817] shadow-[0_0_28px_rgba(34,211,238,0.22)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none">
              إنشاء الفاتورة
            </button>
            <button type="button" onClick={() => router.push('/pos/sale/items')} className="mt-2 flex min-h-11 w-full items-center justify-center text-sm font-black text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70">
              الرجوع إلى العناصر
            </button>
          </div>
        </div>
      ) : (
      <div className="fixed inset-0 z-[50] h-[100svh] w-screen overflow-hidden bg-[#020817] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_82%_82%,rgba(14,165,233,0.10),transparent_38%),linear-gradient(135deg,#020817_0%,#061426_52%,#020817_100%)]" />
        <div className="pos-checkout-enter relative flex h-full w-full flex-col gap-3 overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [direction:ltr] md:flex-row md:overflow-hidden md:p-4 xl:p-5">
          <main className="order-2 flex min-w-0 shrink-0 flex-col gap-3 overflow-visible [direction:rtl] md:order-1 md:min-h-0 md:flex-1 md:overflow-hidden">
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

            <section className="flex min-h-0 flex-1 flex-col overflow-visible rounded-[28px] border border-cyan-300/10 bg-[#020817]/62 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_70px_rgba(2,8,23,0.36)] backdrop-blur-2xl sm:p-4 md:overflow-hidden md:rounded-[32px]">
              <div className="mb-3 flex shrink-0 items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black tracking-[0.18em] text-cyan-300">
                    CHECKOUT
                  </p>
                  <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">
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

              <div className="mb-3 flex items-end justify-between gap-4 rounded-[24px] border border-emerald-300/20 bg-emerald-400/10 p-4 shadow-[0_0_28px_rgba(52,211,153,0.10)] sm:hidden">
                <div>
                  <p className="text-xs font-black text-emerald-200">الإجمالي المستحق</p>
                  <p className="mt-1 text-3xl font-black text-white">
                    {formatCurrency(checkout.finalTotal)}
                  </p>
                </div>
                <p className="rounded-full bg-cyan-300/10 px-3 py-1.5 text-xs font-black text-cyan-100">
                  {invoiceItems.length} عنصر
                </p>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-visible md:overflow-y-auto md:pr-1">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {PAYMENT_METHODS.map((option) => {
                    const selected = checkout.paymentMethod === option.id

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handleSelectPayment(option)}
                        aria-pressed={selected}
                        className={`flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-[22px] border px-3 text-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.98] touch-manipulation sm:min-h-[104px] sm:gap-3 sm:rounded-[26px] ${
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
                    inputMode="decimal"
                    enterKeyHint="done"
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
                  {normalizedPaymentMethod === 'cash' && checkout.numericCashReceived <= 0 ? (
                    <p className="mt-3 text-sm font-bold text-amber-100">
                      أدخل المبلغ المستلم قبل إنشاء الفاتورة.
                    </p>
                  ) : null}
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

              <div className="sticky bottom-0 z-10 -mx-3 mt-3 flex shrink-0 flex-col gap-2 border-t border-cyan-300/10 bg-[#020817]/96 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:static sm:mx-0 sm:flex-row sm:items-center sm:bg-transparent sm:px-0 sm:pb-0">
                <div className="flex items-center justify-between gap-3 px-1 sm:hidden">
                  <span className="text-xs font-black text-slate-400">المطلوب</span>
                  <span className="text-xl font-black text-white">
                    {formatCurrency(checkout.finalTotal)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCreateInvoice}
                  disabled={!canSubmitInvoice}
                  className="flex min-h-16 w-full flex-1 items-center justify-center rounded-[24px] bg-[linear-gradient(135deg,#14B8A6,#06B6D4)] text-lg font-black text-[#020817] shadow-[0_0_34px_rgba(20,184,166,0.28)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
                >
                  {checkout.loading ? 'جارٍ إنشاء الفاتورة...' : 'إنشاء الفاتورة'}
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

          <aside className="order-1 flex h-auto w-full shrink-0 flex-col overflow-visible rounded-[28px] border border-cyan-300/10 bg-[#020817]/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_22px_60px_rgba(0,0,0,0.34)] backdrop-blur-2xl [direction:rtl] md:order-2 md:h-full md:w-[280px] md:overflow-hidden md:rounded-[30px] lg:w-[330px]">
            <div className="shrink-0 rounded-[24px] border border-cyan-300/10 bg-[#061426]/68 p-3.5">
              <p className="text-xs font-black tracking-[0.18em] text-cyan-300">
                INVOICE
              </p>
              <h2 className="mt-1 text-xl font-black text-white">ملخص الفاتورة</h2>
            </div>

            <div className="mt-2.5 shrink-0 rounded-[24px] border border-cyan-300/10 bg-[#061426]/58 p-3.5">
              <p className="text-xs font-black text-slate-400">العميل</p>
              <p className="mt-2 break-words text-lg font-black text-white">
                {customerName || 'بدون اسم'}
              </p>
              <p className="mt-1 break-words text-sm font-bold text-slate-400">
                {customerPhone || 'بدون رقم جوال'}
              </p>
              {selectedBranchName ? (
                <p className="mt-3 border-t border-cyan-300/10 pt-3 text-xs font-bold text-slate-400 sm:hidden">
                  الفرع: <span className="font-black text-cyan-100">{selectedBranchName}</span>
                </p>
              ) : null}
            </div>

            <div className="mt-2 flex min-h-0 shrink-0 flex-col rounded-[24px] border border-cyan-300/10 bg-[#061426]/50 p-2.5 md:flex-1">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-black text-white">العناصر</h3>
                <span className="rounded-full bg-cyan-300/12 px-3 py-1 text-xs font-black text-cyan-100">
                  {invoiceItems.length}
                </span>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-visible md:overflow-y-auto md:pr-1">
                {invoiceItems.map((item) => (
                  <div
                    key={item.item_name}
                    className="rounded-[20px] border border-cyan-300/10 bg-[#020817]/58 p-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 break-words text-sm font-black text-white">
                          {item.item_name}
                        </p>
                        <div className="mt-1.5 flex items-center gap-3 text-xs font-bold text-slate-400">
                          <span>الكمية: {item.quantity}</span>
                          <span>{formatCurrency(item.unit_price)}</span>
                        </div>
                        <p className="mt-2 text-sm font-black text-cyan-100 sm:hidden">
                          الإجمالي: {formatCurrency(item.quantity * item.unit_price)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.item_name)}
                        className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl text-red-300 transition hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70 touch-manipulation"
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
      )}

      {isMobileViewport && showInvoiceConfirmation ? (
        <div className="fixed inset-0 z-[90] h-[100svh] overflow-hidden bg-[#020817] [direction:rtl]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_8%,rgba(34,211,238,0.13),transparent_30%),linear-gradient(180deg,#020817_0%,#041224_56%,#020817_100%)]" />
          <section
            aria-labelledby="invoice-confirmation-title"
            className="pos-checkout-enter relative h-full overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-right text-white"
          >
            <header className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] bg-cyan-300/10 text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.12),inset_0_0_0_1px_rgba(34,211,238,0.25)]">
                  <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden="true">
                    <path d="M12 3 5 6v5c0 4.6 2.9 8.3 7 10 4.1-1.7 7-5.4 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <h2 id="invoice-confirmation-title" className="text-[25px] font-black leading-tight text-white">تأكيد إنشاء الفاتورة</h2>
                  <p className="mt-2 text-sm font-bold leading-6 text-slate-400">راجع التفاصيل النهائية قبل إنشاء الفاتورة</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInvoiceConfirmation(false)}
                disabled={checkout.loading}
                aria-label="إغلاق التأكيد"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px] bg-white/[0.04] text-xl text-slate-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 disabled:opacity-50"
              >
                ×
              </button>
            </header>

            <div className="mt-7 flex items-center gap-4 rounded-[24px] bg-white/[0.035] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.18),inset_0_0_0_1px_rgba(34,211,238,0.14)]">
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-cyan-300/10 text-2xl font-black text-cyan-100 shadow-[0_0_26px_rgba(34,211,238,0.10),inset_0_0_0_1px_rgba(34,211,238,0.38)]">
                {(customerName.trim().charAt(0) || 'ع').toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-slate-400">العميل</p>
                <p className="mt-1 truncate text-lg font-black text-white">{customerName || 'بدون اسم'}</p>
                <p dir="ltr" className="mt-2 truncate text-right text-sm font-bold text-slate-400">{customerPhone || 'بدون رقم جوال'}</p>
              </div>
            </div>

            <div className="mt-4 divide-y divide-cyan-300/10 overflow-hidden rounded-[24px] bg-white/[0.035] px-4 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.11)]">
              <div className="flex items-center justify-between gap-4 py-4">
                <span className="text-sm font-bold text-slate-400">عدد العناصر</span>
                <span className="text-base font-black text-white">{invoiceItems.length} عنصر</span>
              </div>
              <div className="flex items-center justify-between gap-4 py-4">
                <span className="text-sm font-bold text-slate-400">طريقة الدفع</span>
                <span className="rounded-full bg-cyan-300/10 px-4 py-2 text-sm font-black text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.18)]">{selectedPaymentLabel}</span>
              </div>
              <div className="flex items-end justify-between gap-4 py-5">
                <span className="text-sm font-bold text-slate-400">الإجمالي المستحق</span>
                <span className="text-[28px] font-black leading-none text-cyan-300">{formatCurrency(checkout.finalTotal)}</span>
              </div>
            </div>

            <div className="mt-4 flex items-start gap-3 rounded-[22px] bg-cyan-300/[0.045] p-4 text-sm font-bold leading-7 text-slate-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.18)]">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-cyan-300/50 text-lg font-black text-cyan-300">i</span>
              <p>بعد إنشاء الفاتورة لا يمكن تعديلها.<br />يرجى التأكد من صحة البيانات قبل المتابعة.</p>
            </div>

            <button
              type="button"
              onClick={handleCreateInvoice}
              disabled={!canSubmitInvoice}
              className="mt-6 flex min-h-[64px] w-full items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#14B8A6,#22D3EE)] px-5 text-lg font-black text-[#020817] shadow-[0_0_30px_rgba(34,211,238,0.24)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
            >
              {checkout.loading ? 'جارٍ إنشاء الفاتورة...' : 'إنشاء الفاتورة'}
            </button>
            <button
              type="button"
              onClick={() => setShowInvoiceConfirmation(false)}
              disabled={checkout.loading}
              className="mt-3 flex min-h-[56px] w-full items-center justify-center rounded-[20px] border border-cyan-300/45 bg-transparent text-base font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 disabled:opacity-50"
            >
              رجوع
            </button>
          </section>
        </div>
      ) : null}

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
              <>
                <div className="flex items-center justify-between gap-3">
                  <span>{checkout.numericCashReceived.toFixed(2)} ريال</span>
                  <span>المبلغ المدفوع</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{checkout.remainingFromCustomer.toFixed(2)} ريال</span>
                  <span>المتبقي عند الاستلام</span>
                </div>
              </>
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
                هل تريد إلغاء عملية البيع الحالية؟ سيتم حذف المنتجات والبيانات المدخلة في هذه العملية.
              </p>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="h-11 rounded-2xl border border-cyan-300/12 bg-[#061426] px-5 text-sm font-black text-slate-200 transition hover:bg-cyan-400/10"
                  onClick={() => setShowCancelModal(false)}
                >
                  العودة للبيع
                </button>

                <button
                  type="button"
                  className="h-11 rounded-2xl bg-red-500 px-5 text-sm font-black text-white transition hover:bg-red-400"
                  onClick={confirmCancelInvoice}
                >
                  نعم، إلغاء البيع
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
        <p className="mt-3 text-xs font-bold text-slate-400">جارٍ تحميل البيانات...</p>
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
          {loading ? 'جارٍ تحميل البيانات...' : enabled ? 'مطبقة' : 'غير مفعلة'}
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

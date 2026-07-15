'use client'

import { useEffect, useState } from 'react'
import { AdminButton } from '@/components/admin-button'
import { AdminInput, AdminTextarea } from '@/components/admin-input'
import { AdminSelect } from '@/components/admin-select'
import { SummaryRow } from '@/components/summary-row'
import { getClientErrorMessage } from '@/lib/api/client-error'
import {
  loadClientResource,
  peekClientResource,
} from '@/lib/client-resource-cache'
import {
  PAYMENT_METHODS,
  type PosPaymentMethod,
} from '@/lib/invoices/payment-method'
import {
  useInvoiceCheckout,
  type CheckoutDiscountOption,
} from '@/hooks/use-invoice-checkout'
import { formatCurrency } from '@/lib/orders/format'

type InvoiceCheckoutPanelProps = {
  checkout: ReturnType<typeof useInvoiceCheckout>
  title?: string
  subtitle?: string
  actionLabel?: string
  showClearButton?: boolean
  branchId?: string | null
}

const ADMIN_DISCOUNTS_CACHE_TTL_MS = 30_000

function getDiscountsCacheKey(branchId: string | null) {
  return `admin-discounts:${branchId || 'all'}`
}

function formatDiscountOptionLabel(option: CheckoutDiscountOption) {
  if (option.type === 'percentage') {
    return `${option.name} (${option.value}%)`
  }

  return `${option.name} (${formatCurrency(option.value)})`
}

function formatVatStatus(checkout: ReturnType<typeof useInvoiceCheckout>) {
  if (!checkout.vatEnabled) {
    return 'غير مفعلة'
  }

  return `${checkout.vatRate}%`
}

export function InvoiceCheckoutPanel({
  checkout,
  title = 'الدفع وإنهاء الفاتورة',
  subtitle = 'اختر طريقة الدفع وأدخل المبلغ',
  actionLabel = 'إنشاء الفاتورة',
  showClearButton = false,
  branchId = null,
}: InvoiceCheckoutPanelProps) {
  const [availableDiscounts, setAvailableDiscounts] = useState<
    CheckoutDiscountOption[]
  >(() => peekClientResource<CheckoutDiscountOption[]>(getDiscountsCacheKey(branchId)) || [])
  const [loadingDiscounts, setLoadingDiscounts] = useState(
    !(peekClientResource<CheckoutDiscountOption[]>(getDiscountsCacheKey(branchId)) || []).length
  )

  useEffect(() => {
    let cancelled = false

    async function loadDiscounts() {
      try {
        const discountsCacheKey = getDiscountsCacheKey(branchId)
        const cachedDiscounts =
          peekClientResource<CheckoutDiscountOption[]>(discountsCacheKey) || []

        if (!cancelled && cachedDiscounts.length > 0) {
          setAvailableDiscounts(cachedDiscounts)
          setLoadingDiscounts(false)
        } else {
          setLoadingDiscounts(true)
        }

        const searchParams = new URLSearchParams()
        if (branchId) {
          searchParams.set('branchId', branchId)
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
              throw new Error(getClientErrorMessage(result, 'تعذر تحميل الخصومات حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
            }

            return Array.isArray(result.discounts) ? result.discounts : []
          },
          {
            ttlMs: ADMIN_DISCOUNTS_CACHE_TTL_MS,
            logLabel: `fetch discounts (${branchId || 'all'})`,
          }
        )

        if (!cancelled) {
          setAvailableDiscounts(nextDiscounts)
        }
      } catch {
        if (!cancelled) {
          setAvailableDiscounts(
            peekClientResource<CheckoutDiscountOption[]>(
              getDiscountsCacheKey(branchId)
            ) || []
          )
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
  }, [branchId])

  return (
    <section className="page-card min-w-0 !p-4">
      {checkout.successMessage ? (
        <div className="success-alert mb-4">{checkout.successMessage}</div>
      ) : null}
      {checkout.errorMessage ? (
        <div className="error-alert mb-4">{checkout.errorMessage}</div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="section-title">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>

        {showClearButton ? (
          <AdminButton onClick={checkout.clearCheckout} type="button">
            تفريغ
          </AdminButton>
        ) : null}
      </div>

      <div className="min-w-0 space-y-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-bold text-slate-500">الإجمالي المستحق</p>
          <p className="mt-1 text-xl font-black text-slate-950">
            {formatCurrency(checkout.finalTotal)}
          </p>
        </div>

        <div>
          <label className="field-label">طريقة الدفع</label>
          <AdminSelect
            value={checkout.paymentMethod}
            onChange={(e) =>
              checkout.setPaymentMethod(
                e.target.value as PosPaymentMethod
              )
            }
            className="w-full min-w-0"
          >
            {PAYMENT_METHODS.map((paymentMethod) => (
              <option key={paymentMethod.id} value={paymentMethod.id}>
                {paymentMethod.label}
              </option>
            ))}
          </AdminSelect>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <DiscountSelectorCard
            discounts={availableDiscounts}
            loading={loadingDiscounts}
            selectedDiscount={checkout.selectedDiscount}
            onClear={checkout.clearAppliedDiscount}
            onSelect={checkout.setSelectedDiscount}
          />

          <div>
            <label className="field-label">الضريبة VAT</label>
            <div className="flex min-h-[52px] items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
              <span
                className={`font-medium ${
                  checkout.vatEnabled ? 'text-emerald-600' : 'text-slate-500'
                }`}
              >
                {checkout.vatEnabled ? 'مطبقة' : 'غير مفعلة'}
              </span>
              <span className="font-bold text-slate-900">
                {formatVatStatus(checkout)}
              </span>
            </div>
          </div>
        </div>

        <div>
          <label className="field-label">المبلغ المستلم</label>
          <AdminInput
            type="number"
            value={checkout.cashReceived}
            onChange={(e) => checkout.setCashReceived(e.target.value)}
            placeholder="المبلغ المستلم"
            readOnly={!checkout.isReceivedAmountEditable}
            disabled={!checkout.isReceivedAmountEditable}
            className={
              checkout.isReceivedAmountEditable
                ? ''
                : 'cursor-not-allowed bg-slate-50 text-slate-600'
            }
          />
        </div>

        <div>
          <label className="field-label">ملاحظة</label>
          <AdminTextarea
            value={checkout.note}
            onChange={(e) => checkout.setNote(e.target.value)}
            className="min-h-[84px]"
            placeholder="اكتب ملاحظة..."
          />
        </div>

        <div className="inner-card space-y-3">
          <SummaryRow
            label="إجمالي العناصر"
            value={formatCurrency(checkout.subtotal)}
          />
          <SummaryRow
            label={
              checkout.selectedDiscount
                ? `الخصم (${formatDiscountOptionLabel(checkout.selectedDiscount)})`
                : 'الخصم'
            }
            value={formatCurrency(checkout.discountAmount)}
          />
          <SummaryRow
            label="الضريبة"
            value={formatCurrency(checkout.taxAmount)}
          />
          <SummaryRow
            label="الإجمالي المستحق"
            value={formatCurrency(checkout.finalTotal)}
          />

          <SummaryRow
            label="المدفوع"
            value={formatCurrency(checkout.numericCashReceived)}
          />
          <SummaryRow
            label={
              checkout.remainingFromCustomer > 0 ? 'المتبقي' : 'تم السداد'
            }
            value={
              checkout.cashChange > 0
                ? formatCurrency(checkout.cashChange)
                : formatCurrency(checkout.remainingFromCustomer)
            }
          />
        </div>

        <AdminButton
          onClick={checkout.createInvoice}
          disabled={checkout.loading}
          className="w-full"
        >
          {checkout.loading ? 'جارٍ إنشاء الفاتورة...' : actionLabel}
        </AdminButton>
      </div>
    </section>
  )
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
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="field-label mb-0">الخصومات</label>
        <span className="text-xs font-medium text-slate-500">{currentLabel}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onClear}
          className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
            !selectedDiscount
              ? 'bg-slate-900 text-white'
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
            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
              selectedDiscount?.id === discountOption.id
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {formatDiscountOptionLabel(discountOption)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-3 text-xs text-slate-500">جارٍ تحميل الخصومات...</p>
      ) : null}
    </div>
  )
}

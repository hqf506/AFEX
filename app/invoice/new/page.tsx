'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  INVOICE_CUSTOMER_STORAGE_KEY,
  isInvoiceCustomerDraftValid,
  serializeInvoiceCustomerDraft,
} from '@/lib/invoices/customer'
import { usePageAccess } from '@/hooks/use-page-access'

type ExistingCustomer = {
  id: string
  name: string
  phone: string
}

export default function NewInvoiceCustomerPage() {
  const router = useRouter()

  const { authLoading, allowed, roleLabel } = usePageAccess({
    allowedRoles: ['admin', 'employee', 'cashier'],
  })

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerMatches, setCustomerMatches] = useState<ExistingCustomer[]>([])
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false)
  const [customerSearchError, setCustomerSearchError] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)

  const isValid = isInvoiceCustomerDraftValid(customerName, customerPhone)
  const customerSearchTerm =
    customerPhone.trim().length >= 2 ? customerPhone.trim() : customerName.trim()

  useEffect(() => {
    if (!allowed) return

    if (customerSearchTerm.length < 2) {
      const clearTimeoutId = window.setTimeout(() => {
        setCustomerMatches([])
        setCustomerSearchLoading(false)
        setCustomerSearchError('')
      }, 0)

      return () => window.clearTimeout(clearTimeoutId)
    }

    const timeoutId = window.setTimeout(async () => {
      setCustomerSearchLoading(true)
      setCustomerSearchError('')

      try {
        const response = await fetch(
          `/api/customers?q=${encodeURIComponent(customerSearchTerm)}`,
          {
            method: 'GET',
            credentials: 'include',
          }
        )

        const result = await response.json().catch(() => null)

        if (!response.ok || !result?.success) {
          setCustomerMatches([])
          setCustomerSearchError(result?.error || 'فشل البحث عن العملاء')
          setCustomerSearchLoading(false)
          return
        }

        setCustomerMatches(
          Array.isArray(result.customers)
            ? (result.customers as ExistingCustomer[])
            : []
        )
        setCustomerSearchLoading(false)
      } catch (error) {
        setCustomerMatches([])
        setCustomerSearchError(
          error instanceof Error ? error.message : 'فشل البحث عن العملاء'
        )
        setCustomerSearchLoading(false)
      }
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [allowed, customerSearchTerm])

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

    router.push('/invoice/items')
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

  if (authLoading) {
    return (
      <div className="app-shell">
        <div className="page-wrap">
          <div className="page-card">جاري التحقق من الصلاحية...</div>
        </div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="app-shell">
        <div className="page-wrap">
          <div className="page-card">جارٍ التحويل...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="page-wrap">
        <div className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-[880px] items-center justify-center">
          <div className="w-full">
            <div className="page-hero">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h1 className="page-title">إنشاء فاتورة جديدة</h1>
                  <p className="page-subtitle">Leather Fix ERP</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link href="/" className="secondary-btn">
                    العودة إلى القائمة الرئيسية
                  </Link>
                  <span className="badge badge-slate">الخطوة 1 من 2</span>
                  <span className="badge badge-blue">بيانات العميل</span>
                  <span className="badge badge-green">الصلاحية: {roleLabel}</span>
                </div>
              </div>
            </div>

            <div className="page-card">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="section-title">بيانات العميل</h2>
                  <p className="page-subtitle">
                    أدخل اسم العميل ورقم الجوال قبل الانتقال لشاشة المنتجات
                  </p>
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
                    className="field-input"
                  />
                </div>

                <div>
                  <label className="field-label">رقم الجوال</label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => {
                      setCustomerPhone(e.target.value)
                      setSelectedCustomerId(null)
                    }}
                    placeholder="05xxxxxxxx"
                    className="field-input"
                  />
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      بحث عن عميل موجود
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      اكتب الاسم أو رقم الجوال، ثم اختر عميلًا موجودًا أو أكمل كعميل جديد.
                    </p>
                  </div>

                  {selectedCustomerId ? (
                    <span className="badge badge-green">تم اختيار عميل موجود</span>
                  ) : (
                    <span className="badge badge-slate">إنشاء أو اختيار</span>
                  )}
                </div>

                {customerSearchLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                    جاري البحث عن العملاء...
                  </div>
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
                        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-right transition ${
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
                ) : customerSearchTerm.length >= 2 && !customerSearchLoading ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
                    لا يوجد عميل مطابق، يمكنك المتابعة كعميل جديد.
                  </div>
                ) : null}
              </div>

              <div className="mt-5 warning-alert">
                لازم الموظف يدخل اسم العميل ورقم الجوال قبل الانتقال لمرحلة المنتجات.
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
                <div className="inner-card">
                  <h3 className="mb-3 text-sm font-bold text-slate-900">
                    ملخص سريع
                  </h3>

                  <div className="space-y-3">
                    <SummaryRow
                      label="اسم العميل"
                      value={customerName.trim() || '—'}
                    />
                    <SummaryRow
                      label="رقم الجوال"
                      value={customerPhone.trim() || '—'}
                    />
                    <SummaryRow
                      label="جاهزية الانتقال"
                      value={isValid ? 'جاهز' : 'غير مكتمل'}
                      valueClassName={
                        isValid ? 'text-emerald-700' : 'text-amber-700'
                      }
                    />
                    <SummaryRow
                      label="الصلاحية الحالية"
                      value={roleLabel}
                    />
                    <SummaryRow
                      label="نوع العميل"
                      value={selectedCustomerId ? 'عميل موجود' : 'عميل جديد'}
                    />
                  </div>
                </div>

                <div className="page-card !p-4">
                  <div className="space-y-3">
                    <button
                      onClick={handleNext}
                      disabled={!isValid}
                      className="primary-btn w-full"
                    >
                      التالي
                    </button>

                    <button
                      onClick={handleReset}
                      className="secondary-btn w-full"
                    >
                      مسح البيانات
                    </button>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                    بعد الضغط على &quot;التالي&quot; سيتم حفظ البيانات مؤقتًا والانتقال إلى شاشة البيع السريع.
                  </div>
                </div>
              </div>
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

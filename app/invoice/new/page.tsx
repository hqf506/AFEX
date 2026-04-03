'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  INVOICE_CUSTOMER_STORAGE_KEY,
  isInvoiceCustomerValid,
  serializeInvoiceCustomer,
} from '@/lib/invoices/customer'
import { usePageAccess } from '@/hooks/use-page-access'

export default function NewInvoiceCustomerPage() {
  const router = useRouter()

  const { authLoading, allowed, roleLabel } = usePageAccess({
    allowedRoles: ['admin', 'employee', 'cashier'],
  })

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  const isValid = isInvoiceCustomerValid(customerName, customerPhone)

  const handleNext = () => {
    if (!isValid) {
      alert('اكتب اسم العميل ورقم الجوال')
      return
    }

    localStorage.setItem(
      INVOICE_CUSTOMER_STORAGE_KEY,
      serializeInvoiceCustomer({
        name: customerName,
        phone: customerPhone,
      })
    )

    router.push('/invoice/items')
  }

  const handleReset = () => {
    setCustomerName('')
    setCustomerPhone('')
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
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="اكتب اسم العميل"
                    className="field-input"
                  />
                </div>

                <div>
                  <label className="field-label">رقم الجوال</label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="05xxxxxxxx"
                    className="field-input"
                  />
                </div>
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

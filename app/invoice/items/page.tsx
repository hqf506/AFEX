'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { usePageAccess } from '@/hooks/use-page-access'

type Product = {
  id: string
  name: string
  type: 'product' | 'service'
  category: string
  price: number
}

type InvoiceItem = {
  item_id: string | null
  item_name: string
  item_type: 'product' | 'service'
  quantity: number
  unit_price: number
}

type InvoiceResult = {
  customer_id: string
  order_id: string
  order_number: string
  invoice_id: string
  invoice_number: string
  status: string
}

const products: Product[] = [
  { id: '1', name: 'تنظيف فاخر', type: 'service', category: 'تنظيف', price: 120 },
  { id: '2', name: 'إصلاح شنطة جلد', type: 'service', category: 'إصلاح', price: 240 },
  { id: '3', name: 'بخاخ حماية جلد', type: 'product', category: 'عناية', price: 85 },
  { id: '4', name: 'صبغة جلد بني', type: 'product', category: 'ألوان', price: 65 },
]

const filters = ['الكل', 'الخدمات', 'المنتجات', 'تنظيف', 'إصلاح', 'عناية']

function formatCurrency(value: number) {
  return `${value.toFixed(2)} ر.س`
}

export default function InvoiceItemsPage() {
  const router = useRouter()

  const access = usePageAccess(['admin', 'employee', 'cashier'])
  const authLoading = access.loading
  const allowed = access.allowed
  const roleLabel =
    access.userRole === 'admin'
      ? 'أدمن'
      : access.userRole === 'employee'
      ? 'موظف'
      : access.userRole === 'cashier'
      ? 'كاشير'
      : ''

  const [ready, setReady] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('الكل')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer'>('cash')
  const [discount, setDiscount] = useState(0)
  const [tax, setTax] = useState(0)
  const [note, setNote] = useState('')
  const [cashReceived, setCashReceived] = useState('')
  const [loading, setLoading] = useState(false)
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([])
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState('')
  const [lastOrderNumber, setLastOrderNumber] = useState('')

  useEffect(() => {
    if (!allowed) return

    const raw = localStorage.getItem('invoice_customer')

    if (!raw) {
      router.replace('/invoice/new')
      return
    }

    try {
      const parsed = JSON.parse(raw)

      if (!parsed?.name || !parsed?.phone) {
        router.replace('/invoice/new')
        return
      }

      window.setTimeout(() => {
        setCustomerName(parsed.name)
        setCustomerPhone(parsed.phone)
        setReady(true)
      }, 0)
    } catch {
      router.replace('/invoice/new')
    }
  }, [allowed, router])

  const filteredProducts = products.filter((product) => {
    const matchesFilter =
      activeFilter === 'الكل' ||
      (activeFilter === 'الخدمات' && product.type === 'service') ||
      (activeFilter === 'المنتجات' && product.type === 'product') ||
      product.category === activeFilter

    const normalizedSearch = search.trim()
    const matchesSearch =
      normalizedSearch === '' ||
      product.name.includes(normalizedSearch) ||
      product.category.includes(normalizedSearch)

    return matchesFilter && matchesSearch
  })

  const subtotal = useMemo(() => {
    return invoiceItems.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0
    )
  }, [invoiceItems])

  const finalTotal = subtotal - discount + tax

  const numericCashReceived = useMemo(() => {
    const value = Number(cashReceived)
    return Number.isNaN(value) ? 0 : value
  }, [cashReceived])

  const remainingFromCustomer = useMemo(() => {
    if (paymentMethod !== 'cash') return 0
    return Math.max(finalTotal - numericCashReceived, 0)
  }, [paymentMethod, finalTotal, numericCashReceived])

  const cashChange = useMemo(() => {
    if (paymentMethod !== 'cash') return 0
    return Math.max(numericCashReceived - finalTotal, 0)
  }, [paymentMethod, numericCashReceived, finalTotal])

  const addItem = (product: Product) => {
    setInvoiceItems((prev) => {
      const existing = prev.find((item) => item.item_name === product.name)

      if (existing) {
        return prev.map((item) =>
          item.item_name === product.name
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }

      return [
        ...prev,
        {
          item_id: null,
          item_name: product.name,
          item_type: product.type,
          quantity: 1,
          unit_price: product.price,
        },
      ]
    })
  }

  const increaseQty = (itemName: string) => {
    setInvoiceItems((prev) =>
      prev.map((item) =>
        item.item_name === itemName
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    )
  }

  const decreaseQty = (itemName: string) => {
    setInvoiceItems((prev) =>
      prev.map((item) =>
        item.item_name === itemName
          ? { ...item, quantity: Math.max(1, item.quantity - 1) }
          : item
      )
    )
  }

  const removeItem = (itemName: string) => {
    setInvoiceItems((prev) => prev.filter((item) => item.item_name !== itemName))
  }

  const clearInvoice = () => {
    setInvoiceItems([])
    setDiscount(0)
    setTax(0)
    setNote('')
    setPaymentMethod('cash')
    setCashReceived('')
  }

  const printInvoice = (invoiceNumber?: string, orderNumber?: string) => {
    const now = new Date()
    const printWindow = window.open('', '_blank', 'width=900,height=700')

    if (!printWindow) return

    const itemsHtml = invoiceItems
      .map(
        (item) => `
          <tr>
            <td>${item.item_name}</td>
            <td>${item.quantity}</td>
            <td>${item.unit_price} ر.س</td>
            <td>${item.quantity * item.unit_price} ر.س</td>
          </tr>
        `
      )
      .join('')

    printWindow.document.write(`
      <html lang="ar" dir="rtl">
        <head>
          <title>فاتورة ${invoiceNumber || ''}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 24px;
              color: #111827;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 24px;
            }
            .title {
              font-size: 28px;
              font-weight: bold;
            }
            .muted {
              color: #6b7280;
              font-size: 14px;
            }
            .box {
              border: 1px solid #e5e7eb;
              border-radius: 16px;
              padding: 16px;
              margin-bottom: 16px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 12px;
            }
            th, td {
              border-bottom: 1px solid #e5e7eb;
              padding: 12px;
              text-align: right;
            }
            th {
              background: #f8fafc;
            }
            .totals {
              margin-top: 20px;
            }
            .totals div {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
            }
            .final {
              font-size: 20px;
              font-weight: bold;
              border-top: 2px solid #111827;
              margin-top: 10px;
              padding-top: 10px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">Leather Fix ERP</div>
              <div class="muted">فاتورة عميل</div>
            </div>
            <div>
              <div><strong>رقم الفاتورة:</strong> ${invoiceNumber || '—'}</div>
              <div><strong>رقم الطلب:</strong> ${orderNumber || '—'}</div>
              <div><strong>التاريخ:</strong> ${now.toLocaleDateString('ar-SA')}</div>
              <div><strong>الوقت:</strong> ${now.toLocaleTimeString('ar-SA')}</div>
            </div>
          </div>

          <div class="box">
            <div><strong>اسم العميل:</strong> ${customerName}</div>
            <div><strong>رقم الجوال:</strong> ${customerPhone}</div>
            <div><strong>طريقة الدفع:</strong> ${
              paymentMethod === 'cash' ? 'كاش' : paymentMethod === 'card' ? 'شبكة' : 'تحويل'
            }</div>
            ${
              paymentMethod === 'cash'
                ? `
                  <div><strong>المبلغ المستلم:</strong> ${numericCashReceived} ر.س</div>
                  <div><strong>المتبقي من العميل:</strong> ${remainingFromCustomer} ر.س</div>
                  <div><strong>الباقي للعميل:</strong> ${cashChange} ر.س</div>
                `
                : ''
            }
          </div>

          <div class="box">
            <table>
              <thead>
                <tr>
                  <th>العنصر</th>
                  <th>الكمية</th>
                  <th>سعر الوحدة</th>
                  <th>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div class="totals">
              <div><span>المجموع الفرعي</span><span>${subtotal} ر.س</span></div>
              <div><span>الخصم</span><span>${discount} ر.س</span></div>
              <div><span>الضريبة</span><span>${tax} ر.س</span></div>
              <div class="final"><span>الإجمالي النهائي</span><span>${finalTotal} ر.س</span></div>
            </div>
          </div>

          ${
            note.trim()
              ? `<div class="box"><strong>ملاحظة:</strong> ${note}</div>`
              : ''
          }

          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `)

    printWindow.document.close()
  }

  const sendWhatsAppAutomatically = async (
    invoiceNumber?: string,
    orderNumber?: string
  ) => {
    const response = await fetch('/api/send-whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: customerPhone,
        customerName,
        invoiceNumber,
        orderNumber,
        total: finalTotal,
      }),
    })

    const result = await response.json().catch(() => null)

    if (!response.ok || !result?.success) {
      throw new Error('فشل إرسال الواتساب')
    }

    return result
  }

  const createInvoice = async () => {
    if (loading) return

    if (invoiceItems.length === 0) {
      setErrorMessage('أضف عنصرًا واحدًا على الأقل')
      return
    }

    if (paymentMethod === 'cash' && numericCashReceived <= 0) {
      setErrorMessage('اكتب المبلغ المستلم من العميل')
      return
    }

    setLoading(true)
    setErrorMessage('')
    setSuccessMessage('')

    const { data, error } = await supabase.rpc('create_invoice_with_items', {
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_customer_notes: '',
      p_payment_method: paymentMethod,
      p_discount: discount,
      p_tax: tax,
      p_note: note,
      p_items: invoiceItems,
    })

    if (error) {
      setLoading(false)
      setErrorMessage(error.message)
      return
    }

    const result = data as InvoiceResult

    if (result?.invoice_id) {
      const { error: updateInvoiceError } = await supabase
        .from('invoices')
        .update({
          cash_received: paymentMethod === 'cash' ? numericCashReceived : 0,
          remaining_from_customer: paymentMethod === 'cash' ? remainingFromCustomer : 0,
          cash_change: paymentMethod === 'cash' ? cashChange : 0,
        })
        .eq('id', result.invoice_id)

      if (updateInvoiceError) {
        console.error('Update invoice payment details error:', updateInvoiceError)
      }
    }

    setLastInvoiceNumber(result?.invoice_number || '')
    setLastOrderNumber(result?.order_number || '')

    try {
      await sendWhatsAppAutomatically(result?.invoice_number, result?.order_number)
      setSuccessMessage(
        `تم إنشاء الفاتورة ${result?.invoice_number || ''} وإرسال الواتساب بنجاح`
      )
    } catch {
      setSuccessMessage(
        `تم إنشاء الفاتورة ${result?.invoice_number || ''} لكن فشل إرسال الواتساب`
      )
    }

    printInvoice(result?.invoice_number, result?.order_number)

    setLoading(false)

    setTimeout(() => {
      setSuccessMessage('')
    }, 4000)
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

  if (!allowed || !ready) {
    return (
      <div className="app-shell">
        <div className="page-wrap">
          <div className="page-card">جاري التحميل...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="page-wrap">
        {successMessage && <div className="success-alert">{successMessage}</div>}
        {errorMessage && <div className="error-alert">{errorMessage}</div>}

        <div className="page-hero">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="page-title">شاشة البيع السريع POS</h1>
              <p className="page-subtitle">Leather Fix ERP</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => router.push('/invoice/new')}
                className="secondary-btn"
                type="button"
              >
                العودة إلى القائمة السابقة
              </button>

              <button
                onClick={() => router.push('/')}
                className="secondary-btn"
                type="button"
              >
                العودة إلى القائمة الرئيسية
              </button>

              <div className="badge badge-slate px-4 py-3 text-sm">
                {customerName} • {customerPhone}
              </div>

              <span className="badge badge-green">الصلاحية: {roleLabel}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="page-card">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="section-title">المنتجات والخدمات</h2>

              <div className="flex flex-wrap gap-2">
                {filters.map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={
                      activeFilter === filter ? 'primary-btn' : 'secondary-btn'
                    }
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن منتج أو خدمة"
              className="field-input mb-4"
            />

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addItem(product)}
                  className="inner-card text-right transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        {product.name}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {product.type === 'service' ? 'خدمة' : 'منتج'} • {product.category}
                      </p>
                    </div>

                    <span className="badge badge-slate">
                      {product.price} ر.س
                    </span>
                  </div>

                  <div className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white">
                    إضافة إلى الفاتورة
                  </div>
                </button>
              ))}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="page-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="section-title">عناصر الفاتورة</h2>
                <button onClick={clearInvoice} className="secondary-btn" type="button">
                  تفريغ
                </button>
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

                        <button
                          onClick={() => removeItem(item.item_name)}
                          className="secondary-btn"
                          type="button"
                        >
                          حذف
                        </button>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => decreaseQty(item.item_name)}
                            className="secondary-btn"
                            type="button"
                          >
                            -
                          </button>

                          <div className="min-w-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-2 text-center font-bold text-slate-900">
                            {item.quantity}
                          </div>

                          <button
                            onClick={() => increaseQty(item.item_name)}
                            className="secondary-btn"
                            type="button"
                          >
                            +
                          </button>
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

            <section className="page-card">
              <h2 className="section-title">الدفع والحسابات</h2>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="field-label">طريقة الدفع</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(e.target.value as 'cash' | 'card' | 'transfer')
                    }
                    className="field-select"
                  >
                    <option value="cash">كاش</option>
                    <option value="card">شبكة</option>
                    <option value="transfer">تحويل</option>
                  </select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="field-label">الخصم</label>
                    <input
                      type="number"
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                      className="field-input"
                    />
                  </div>

                  <div>
                    <label className="field-label">الضريبة</label>
                    <input
                      type="number"
                      value={tax}
                      onChange={(e) => setTax(Number(e.target.value) || 0)}
                      className="field-input"
                    />
                  </div>
                </div>

                {paymentMethod === 'cash' && (
                  <div>
                    <label className="field-label">المبلغ المستلم من العميل</label>
                    <input
                      type="number"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      className="field-input"
                      placeholder="اكتب المبلغ المستلم"
                    />
                  </div>
                )}

                <div>
                  <label className="field-label">ملاحظة</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="field-input min-h-[110px]"
                    placeholder="اكتب ملاحظة إن وجدت"
                  />
                </div>

                <div className="inner-card space-y-3">
                  <SummaryRow label="المجموع الفرعي" value={formatCurrency(subtotal)} />
                  <SummaryRow label="الخصم" value={formatCurrency(discount)} />
                  <SummaryRow label="الضريبة" value={formatCurrency(tax)} />
                  <SummaryRow label="الإجمالي النهائي" value={formatCurrency(finalTotal)} />

                  {paymentMethod === 'cash' && (
                    <>
                      <SummaryRow
                        label="المبلغ المستلم"
                        value={formatCurrency(numericCashReceived)}
                      />
                      <SummaryRow
                        label="المتبقي من العميل"
                        value={formatCurrency(remainingFromCustomer)}
                      />
                      <SummaryRow
                        label="الباقي للعميل"
                        value={formatCurrency(cashChange)}
                      />
                    </>
                  )}
                </div>

                <button
                  onClick={createInvoice}
                  disabled={loading}
                  className="primary-btn w-full"
                  type="button"
                >
                  {loading ? 'جاري إنشاء الفاتورة...' : 'إنشاء الفاتورة'}
                </button>

                {(lastInvoiceNumber || lastOrderNumber) && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <div>آخر فاتورة: {lastInvoiceNumber || '—'}</div>
                    <div className="mt-1">آخر طلب: {lastOrderNumber || '—'}</div>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-bold text-slate-900">{value}</span>
    </div>
  )
}

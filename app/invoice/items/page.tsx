'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminBranchFilter } from '@/components/admin-branch-filter'
import { AdminButton } from '@/components/admin-button'
import { AdminInput, AdminTextarea } from '@/components/admin-input'
import { AdminSelect } from '@/components/admin-select'
import { PageHero } from '@/components/page-hero'
import { SummaryRow } from '@/components/summary-row'
import { useAdminBranchFilter } from '@/hooks/use-admin-branch-filter'
import { getRoleLabel } from '@/lib/app-roles'
import {
  INVOICE_CUSTOMER_STORAGE_KEY,
  parseStoredInvoiceCustomerDraft,
} from '@/lib/invoices/customer'
import {
  addInvoiceLineItem,
  calculateCashChange,
  calculateInvoiceSubtotal,
  calculateRemainingFromCustomer,
  createInvoicePrintHtml,
  decreaseInvoiceLineItemQuantity,
  filterInvoiceProducts,
  parseCashReceivedAmount,
  increaseInvoiceLineItemQuantity,
  INVOICE_FILTERS,
  INVOICE_PRODUCTS,
  removeInvoiceLineItem,
  type InvoiceLineItem,
  type CreatedInvoiceRecord,
  type InvoiceCatalogItem,
} from '@/lib/invoices/items'
import { loadBranchInvoiceCatalog } from '@/lib/invoices/catalog'
import { supabase } from '@/lib/supabase/client'
import { usePageAccess } from '@/hooks/use-page-access'
import { formatCurrency } from '@/lib/orders/format'

const INVOICE_PDF_WHATSAPP_ENABLED = false

function PosCatalogItemImage({
  imageUrl,
  name,
  type,
}: {
  imageUrl: string | null
  name: string
  type: 'product' | 'service'
}) {
  const normalizedImageUrl = imageUrl?.trim() || ''
  const [hasImageError, setHasImageError] = useState(false)

  if (!normalizedImageUrl || hasImageError) {
    return (
      <div className="flex h-40 w-full items-center justify-center bg-slate-100 text-center">
        <div className="space-y-2 px-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 bg-white text-lg font-black text-slate-400">
            {type === 'service' ? 'خ' : 'م'}
          </div>
          <p className="text-xs font-bold text-slate-500">لا توجد صورة متاحة</p>
        </div>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={normalizedImageUrl}
      alt={name}
      className="h-40 w-full object-cover"
      loading="lazy"
      onError={() => setHasImageError(true)}
    />
  )
}

export default function InvoiceItemsPage() {
  const router = useRouter()

  const access = usePageAccess(['admin', 'employee', 'cashier'])
  const authLoading = access.loading
  const allowed = access.allowed
  const branchId = access.branchId
  const scopeType = access.scopeType
  const roleLabel = getRoleLabel(access.userRole)
  const {
    isSystemAdmin,
    branches,
    loadingBranches,
    selectedBranchId,
    effectiveBranchId,
    setSelectedBranchId,
  } = useAdminBranchFilter(scopeType, branchId, allowed)
  const hasInvalidBranchContext = scopeType === 'branch' && !branchId
  const hasAmbiguousAdminBranchContext = isSystemAdmin && !effectiveBranchId
  const hasUnavailablePosBranchContext =
    hasInvalidBranchContext || hasAmbiguousAdminBranchContext

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
  const [invoiceItems, setInvoiceLineItems] = useState<InvoiceLineItem[]>([])
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState('')
  const [lastOrderNumber, setLastOrderNumber] = useState('')
  const [catalogProducts, setCatalogProducts] = useState<InvoiceCatalogItem[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)

  useEffect(() => {
    if (!allowed) return

    const parsed = parseStoredInvoiceCustomerDraft(
      localStorage.getItem(INVOICE_CUSTOMER_STORAGE_KEY)
    )

    if (!parsed) {
      router.replace('/invoice/new')
      return
    }

    window.setTimeout(() => {
      setCustomerName(parsed.name)
      setCustomerPhone(parsed.phone)
      setReady(true)
    }, 0)
  }, [allowed, router])

  useEffect(() => {
    if (!allowed || !ready) return

    if (hasUnavailablePosBranchContext) {
      return
    }

    let cancelled = false

    const loadCatalog = async () => {
      try {
        if (!cancelled) {
          setCatalogLoading(true)
          setCatalogProducts([])
        }

        const nextProducts = await loadBranchInvoiceCatalog(effectiveBranchId)

        if (!cancelled) {
          setCatalogProducts(nextProducts)
          setCatalogLoading(false)
        }
      } catch (error) {
        console.error('Load branch invoice catalog error:', error)

        if (!cancelled) {
          setCatalogProducts(INVOICE_PRODUCTS)
          setCatalogLoading(false)
        }
      }
    }

    void loadCatalog()

    return () => {
      cancelled = true
    }
  }, [allowed, ready, effectiveBranchId, hasUnavailablePosBranchContext])

  const visibleCatalogProducts = useMemo(() => {
    return hasUnavailablePosBranchContext ? [] : catalogProducts
  }, [catalogProducts, hasUnavailablePosBranchContext])

  const filteredProducts = useMemo(() => {
    return filterInvoiceProducts(visibleCatalogProducts, activeFilter, search)
  }, [visibleCatalogProducts, activeFilter, search])

  const subtotal = useMemo(() => {
    return calculateInvoiceSubtotal(invoiceItems)
  }, [invoiceItems])

  const invoiceItemCount = useMemo(() => {
    return invoiceItems.reduce((total, item) => total + item.quantity, 0)
  }, [invoiceItems])

  const finalTotal = subtotal - discount + tax

  const numericCashReceived = useMemo(() => {
    return parseCashReceivedAmount(cashReceived)
  }, [cashReceived])

  const remainingFromCustomer = useMemo(() => {
    return calculateRemainingFromCustomer(
      paymentMethod,
      finalTotal,
      numericCashReceived
    )
  }, [paymentMethod, finalTotal, numericCashReceived])

  const cashChange = useMemo(() => {
    return calculateCashChange(paymentMethod, numericCashReceived, finalTotal)
  }, [paymentMethod, numericCashReceived, finalTotal])

  const addItem = (product: InvoiceCatalogItem) => {
    setInvoiceLineItems((prev) => addInvoiceLineItem(prev, product))
  }

  const increaseQty = (itemName: string) => {
    setInvoiceLineItems((prev) => increaseInvoiceLineItemQuantity(prev, itemName))
  }

  const decreaseQty = (itemName: string) => {
    setInvoiceLineItems((prev) => decreaseInvoiceLineItemQuantity(prev, itemName))
  }

  const removeItem = (itemName: string) => {
    setInvoiceLineItems((prev) => removeInvoiceLineItem(prev, itemName))
  }

  const clearInvoice = () => {
    setInvoiceLineItems([])
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

    printWindow.document.write(
      createInvoicePrintHtml({
        invoiceItems,
        invoiceNumber,
        orderNumber,
        customerName,
        customerPhone,
        paymentMethod,
        numericCashReceived,
        remainingFromCustomer,
        cashChange,
        subtotal,
        discount,
        tax,
        finalTotal,
        note,
        now,
      })
    )

    printWindow.document.close()
  }

  const createInvoice = async () => {
    if (loading) return

    if (hasInvalidBranchContext) {
      setErrorMessage('لا يمكن إنشاء فاتورة لأن حسابك غير مرتبط بفرع صالح')
      return
    }

    if (hasAmbiguousAdminBranchContext) {
      setErrorMessage('اختر فرعًا محددًا قبل استخدام شاشة الفاتورة')
      return
    }

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

    const result = data as CreatedInvoiceRecord

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
    printInvoice(result?.invoice_number, result?.order_number)

    if (!INVOICE_PDF_WHATSAPP_ENABLED) {
      setSuccessMessage(`تم إنشاء الفاتورة ${result?.invoice_number || ''} بنجاح`)
    }

    setLoading(false)

    setTimeout(() => {
      setSuccessMessage('')
    }, 4000)
  }

  if (authLoading) {
    return (
      <div className="app-shell">
        <div className="page-wrap" />
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
        {errorMessage && <div className="error-alert">{errorMessage}</div>}

        <PageHero>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="page-title">شاشة البيع السريع POS</h1>
              <p className="page-subtitle">Leather Fix ERP</p>
              <p className="mt-2 text-sm text-slate-500">
                أنشئ الفاتورة للعميل الحالي ثم راجع العناصر والدفع من نفس الشاشة.
              </p>
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

              <AdminButton
                onClick={() => router.push('/invoice/new')}
                type="button"
              >
                العودة إلى القائمة السابقة
              </AdminButton>

              <AdminButton
                onClick={() => router.push('/')}
                type="button"
              >
                العودة إلى القائمة الرئيسية
              </AdminButton>

              <span className="badge badge-green">الصلاحية: {roleLabel}</span>
            </div>
          </div>
        </PageHero>

        <div className="mb-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="page-card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="section-title">سياق الفاتورة الحالية</h2>
                <p className="mt-1 text-sm text-slate-500">
                  راجع بيانات العميل وملخص الفاتورة قبل الإكمال.
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
                  <SummaryRow label="الإجمالي الحالي" value={formatCurrency(finalTotal)} />
                </div>
              </div>

              <div className="inner-card">
                <h3 className="mb-3 text-sm font-bold text-slate-900">آخر عملية</h3>
                <div className="space-y-3">
                  <SummaryRow label="آخر فاتورة" value={lastInvoiceNumber || '—'} />
                  <SummaryRow label="آخر طلب" value={lastOrderNumber || '—'} />
                  <SummaryRow
                    label="طريقة الدفع الحالية"
                    value={
                      paymentMethod === 'cash'
                        ? 'كاش'
                        : paymentMethod === 'card'
                          ? 'شبكة'
                          : 'تحويل'
                    }
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
                <p className="mt-1 text-sm text-slate-500">
                  اختر العناصر التي تريد إضافتها، ثم انتقل إلى تفاصيل الفاتورة والدفع.
                </p>
              </div>
            </div>

            <div className="mb-4 rounded-[24px] border border-slate-200 bg-slate-50 p-3">
              <div className="mb-3 flex flex-wrap gap-2">
                {INVOICE_FILTERS.map((filter) => (
                  <AdminButton
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    variant={activeFilter === filter ? 'primary' : 'secondary'}
                  >
                    {filter}
                  </AdminButton>
                ))}
              </div>

              <AdminInput
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن منتج أو خدمة"
              />
            </div>

            {hasAmbiguousAdminBranchContext ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-8 text-center text-sm text-amber-800">
                اختر فرعًا محددًا أولًا حتى يتم تحميل كتالوج الفرع الصحيح للفاتورة.
              </div>
            ) : catalogLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                جاري تحميل الأصناف...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                لا توجد منتجات أو خدمات متاحة لهذا الفرع.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addItem(product)}
                    className="inner-card text-right transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
                  >
                    <div className="mb-4 overflow-hidden rounded-[20px] border border-slate-200 bg-slate-100">
                      <PosCatalogItemImage
                        key={product.image_url || product.id}
                        imageUrl={product.image_url}
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
            )}
          </section>

          <aside className="space-y-5">
            <section className="page-card">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="section-title">عناصر الفاتورة</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    راجع الكميات واحذف العناصر غير المطلوبة قبل إنشاء الفاتورة.
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

                        <AdminButton
                          onClick={() => removeItem(item.item_name)}
                          type="button"
                        >
                          حذف
                        </AdminButton>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <AdminButton
                            onClick={() => decreaseQty(item.item_name)}
                            type="button"
                          >
                            -
                          </AdminButton>

                          <div className="min-w-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-2 text-center font-bold text-slate-900">
                            {item.quantity}
                          </div>

                          <AdminButton
                            onClick={() => increaseQty(item.item_name)}
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

            <section className="page-card">
              <div className="mb-4">
                <h2 className="section-title">الدفع والحسابات</h2>
                <p className="mt-1 text-sm text-slate-500">
                  أكمل وسيلة الدفع والمبالغ، ثم راجع الإجمالي النهائي قبل الإنشاء.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="field-label">طريقة الدفع</label>
                  <AdminSelect
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(e.target.value as 'cash' | 'card' | 'transfer')
                    }
                    className="w-full min-w-0"
                  >
                    <option value="cash">كاش</option>
                    <option value="card">شبكة</option>
                    <option value="transfer">تحويل</option>
                  </AdminSelect>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="field-label">الخصم</label>
                    <AdminInput
                      type="number"
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                    />
                  </div>

                  <div>
                    <label className="field-label">الضريبة</label>
                    <AdminInput
                      type="number"
                      value={tax}
                      onChange={(e) => setTax(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>

                {paymentMethod === 'cash' && (
                  <div>
                    <label className="field-label">المبلغ المستلم من العميل</label>
                    <AdminInput
                      type="number"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      placeholder="اكتب المبلغ المستلم"
                    />
                  </div>
                )}

                <div>
                  <label className="field-label">ملاحظة</label>
                  <AdminTextarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="min-h-[110px]"
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

                <AdminButton
                  onClick={createInvoice}
                  disabled={loading}
                  variant="primary"
                  className="w-full"
                  type="button"
                >
                  {loading ? 'جاري إنشاء الفاتورة...' : 'إنشاء الفاتورة'}
                </AdminButton>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}

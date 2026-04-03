'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { supabase } from '@/lib/supabase/client'
import { usePageAccess } from '@/hooks/use-page-access'
import { formatCurrency } from '@/lib/orders/format'

const INVOICE_PDF_WHATSAPP_ENABLED = false

export default function InvoiceItemsPage() {
  const router = useRouter()

  const access = usePageAccess(['admin', 'employee', 'cashier'])
  const authLoading = access.loading
  const allowed = access.allowed
  const roleLabel = getRoleLabel(access.userRole)

  const [ready, setReady] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('Ø§Ù„ÙƒÙ„')
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

  const filteredProducts = useMemo(() => {
    return filterInvoiceProducts(INVOICE_PRODUCTS, activeFilter, search)
  }, [activeFilter, search])

  const subtotal = useMemo(() => {
    return calculateInvoiceSubtotal(invoiceItems)
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

    if (invoiceItems.length === 0) {
      setErrorMessage('Ø£Ø¶Ù Ø¹Ù†ØµØ±Ù‹Ø§ ÙˆØ§Ø­Ø¯Ù‹Ø§ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„')
      return
    }

    if (paymentMethod === 'cash' && numericCashReceived <= 0) {
      setErrorMessage('Ø§ÙƒØªØ¨ Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„Ù…Ø³ØªÙ„Ù… Ù…Ù† Ø§Ù„Ø¹Ù…ÙŠÙ„')
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

    // Temporary feature flag: keep invoice creation/print active while
    // disabling the post-create PDF and WhatsApp flow.
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
        <div className="page-wrap">
          <div className="page-card">Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ©...</div>
        </div>
      </div>
    )
  }

  if (!allowed || !ready) {
    return (
      <div className="app-shell">
        <div className="page-wrap">
          <div className="page-card">Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ­Ù…ÙŠÙ„...</div>
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
              <h1 className="page-title">Ø´Ø§Ø´Ø© Ø§Ù„Ø¨ÙŠØ¹ Ø§Ù„Ø³Ø±ÙŠØ¹ POS</h1>
              <p className="page-subtitle">Leather Fix ERP</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => router.push('/invoice/new')}
                className="secondary-btn"
                type="button"
              >
                Ø§Ù„Ø¹ÙˆØ¯Ø© Ø¥Ù„Ù‰ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø³Ø§Ø¨Ù‚Ø©
              </button>

              <button
                onClick={() => router.push('/')}
                className="secondary-btn"
                type="button"
              >
                Ø§Ù„Ø¹ÙˆØ¯Ø© Ø¥Ù„Ù‰ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ©
              </button>

              <div className="badge badge-slate px-4 py-3 text-sm">
                {customerName} â€¢ {customerPhone}
              </div>

              <span className="badge badge-green">Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ©: {roleLabel}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="page-card">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="section-title">Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª ÙˆØ§Ù„Ø®Ø¯Ù…Ø§Øª</h2>

              <div className="flex flex-wrap gap-2">
                {INVOICE_FILTERS.map((filter) => (
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
              placeholder="Ø§Ø¨Ø­Ø« Ø¹Ù† Ù…Ù†ØªØ¬ Ø£Ùˆ Ø®Ø¯Ù…Ø©"
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
                        {product.type === 'service' ? 'Ø®Ø¯Ù…Ø©' : 'Ù…Ù†ØªØ¬'} â€¢ {product.category}
                      </p>
                    </div>

                    <span className="badge badge-slate">
                      {product.price} Ø±.Ø³
                    </span>
                  </div>

                  <div className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white">
                    Ø¥Ø¶Ø§ÙØ© Ø¥Ù„Ù‰ Ø§Ù„ÙØ§ØªÙˆØ±Ø©
                  </div>
                </button>
              ))}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="page-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="section-title">Ø¹Ù†Ø§ØµØ± Ø§Ù„ÙØ§ØªÙˆØ±Ø©</h2>
                <button onClick={clearInvoice} className="secondary-btn" type="button">
                  ØªÙØ±ÙŠØº
                </button>
              </div>

              {invoiceItems.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Ù„Ù… ÙŠØªÙ… Ø¥Ø¶Ø§ÙØ© Ø£ÙŠ Ø¹Ù†ØµØ± Ø¨Ø¹Ø¯
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
                            {item.item_type === 'service' ? 'Ø®Ø¯Ù…Ø©' : 'Ù…Ù†ØªØ¬'}
                          </p>
                        </div>

                        <button
                          onClick={() => removeItem(item.item_name)}
                          className="secondary-btn"
                          type="button"
                        >
                          Ø­Ø°Ù
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
                            Ø§Ù„ÙˆØ­Ø¯Ø©: {formatCurrency(item.unit_price)}
                          </p>
                          <p className="mt-1 text-sm font-bold text-slate-900">
                            Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ: {formatCurrency(item.quantity * item.unit_price)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="page-card">
              <h2 className="section-title">Ø§Ù„Ø¯ÙØ¹ ÙˆØ§Ù„Ø­Ø³Ø§Ø¨Ø§Øª</h2>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="field-label">Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ø¯ÙØ¹</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(e.target.value as 'cash' | 'card' | 'transfer')
                    }
                    className="field-select"
                  >
                    <option value="cash">ÙƒØ§Ø´</option>
                    <option value="card">Ø´Ø¨ÙƒØ©</option>
                    <option value="transfer">ØªØ­ÙˆÙŠÙ„</option>
                  </select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="field-label">Ø§Ù„Ø®ØµÙ…</label>
                    <input
                      type="number"
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                      className="field-input"
                    />
                  </div>

                  <div>
                    <label className="field-label">Ø§Ù„Ø¶Ø±ÙŠØ¨Ø©</label>
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
                    <label className="field-label">Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„Ù…Ø³ØªÙ„Ù… Ù…Ù† Ø§Ù„Ø¹Ù…ÙŠÙ„</label>
                    <input
                      type="number"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      className="field-input"
                      placeholder="Ø§ÙƒØªØ¨ Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„Ù…Ø³ØªÙ„Ù…"
                    />
                  </div>
                )}

                <div>
                  <label className="field-label">Ù…Ù„Ø§Ø­Ø¸Ø©</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="field-input min-h-[110px]"
                    placeholder="Ø§ÙƒØªØ¨ Ù…Ù„Ø§Ø­Ø¸Ø© Ø¥Ù† ÙˆØ¬Ø¯Øª"
                  />
                </div>

                <div className="inner-card space-y-3">
                  <SummaryRow label="Ø§Ù„Ù…Ø¬Ù…ÙˆØ¹ Ø§Ù„ÙØ±Ø¹ÙŠ" value={formatCurrency(subtotal)} />
                  <SummaryRow label="Ø§Ù„Ø®ØµÙ…" value={formatCurrency(discount)} />
                  <SummaryRow label="Ø§Ù„Ø¶Ø±ÙŠØ¨Ø©" value={formatCurrency(tax)} />
                  <SummaryRow label="Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠ" value={formatCurrency(finalTotal)} />

                  {paymentMethod === 'cash' && (
                    <>
                      <SummaryRow
                        label="Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„Ù…Ø³ØªÙ„Ù…"
                        value={formatCurrency(numericCashReceived)}
                      />
                      <SummaryRow
                        label="Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ Ù…Ù† Ø§Ù„Ø¹Ù…ÙŠÙ„"
                        value={formatCurrency(remainingFromCustomer)}
                      />
                      <SummaryRow
                        label="Ø§Ù„Ø¨Ø§Ù‚ÙŠ Ù„Ù„Ø¹Ù…ÙŠÙ„"
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
                  {loading ? 'Ø¬Ø§Ø±ÙŠ Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„ÙØ§ØªÙˆØ±Ø©...' : 'Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„ÙØ§ØªÙˆØ±Ø©'}
                </button>

                {(lastInvoiceNumber || lastOrderNumber) && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <div>Ø¢Ø®Ø± ÙØ§ØªÙˆØ±Ø©: {lastInvoiceNumber || 'â€”'}</div>
                    <div className="mt-1">Ø¢Ø®Ø± Ø·Ù„Ø¨: {lastOrderNumber || 'â€”'}</div>
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

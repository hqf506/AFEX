'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePageAccess } from '@/hooks/use-page-access'
import { getClientErrorMessage } from '@/lib/api/client-error'
import { formatCurrency } from '@/lib/orders/format'
import { mapOrderSummaryToOrderRecord, type OrderRecord } from '@/lib/orders/orders-page'
import { normalizeOrderRecord, type OrderSourceRow } from '@/lib/orders/normalize'
import { POS_ACCESS_ROLES } from '@/lib/permissions'
import { resolveInvoicePaymentDisplay } from '@/lib/invoices/order-payment'
import { formatRiyadhDateTime, formatRiyadhTime, groupInvoicesByRiyadhDate, normalizeInvoiceLedgerSearch } from '@/lib/pos/invoice-ledger'

const PAGE_SIZE = 24
type InvoiceFilter = 'all' | 'paid' | 'refunded'

function InvoiceIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v16l-3-2-4 2-4-2-3 2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7"/><path d="M9 8h6M9 12h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
}
function PrintIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>
}
function paymentStatusLabel(value: string) {
  const normalized = value.trim().toLowerCase()
  if (['paid', 'completed', 'succeeded'].includes(normalized)) return 'مدفوعة'
  if (normalized === 'refunded') return 'مستردة'
  if (['partial', 'partially_paid', 'pending'].includes(normalized)) return 'غير مكتملة'
  if (['cancelled', 'canceled', 'void'].includes(normalized)) return 'ملغاة'
  return value && value !== '—' ? value : 'حالة غير محددة'
}

export default function PosInvoiceHistoryPage() {
  const router = useRouter()
  const access = usePageAccess({ allowedRoles: [...POS_ACCESS_ROLES], redirectIfNoUser: '/pos/login', redirectIfForbidden: '/pos' })
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedDetails, setSelectedDetails] = useState<OrderRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [error, setError] = useState('')
  const [detailsError, setDetailsError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<InvoiceFilter>('all')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const loadingRef = useRef(false)
  const detailsRequestRef = useRef(0)
  const detailBodyRef = useRef<HTMLDivElement>(null)
  const normalizedSearch = useMemo(() => normalizeInvoiceLedgerSearch(search), [search])

  const loadInvoices = useCallback(async (requestedPage = 1) => {
    if (!access.allowed || !access.tenantId || !access.branchId || loadingRef.current) return
    loadingRef.current = true; setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ mode: 'full', page: String(requestedPage), pageSize: String(PAGE_SIZE) })
      if (normalizedSearch) params.set('search', normalizedSearch)
      const response = await fetch(`/api/orders?${params}`, { credentials: 'include', cache: 'no-store' })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success) throw new Error(getClientErrorMessage(result, 'تعذر تحميل سجل الفواتير.'))
      const rows = Array.isArray(result.items) ? result.items as OrderSourceRow[] : []
      const mapped = rows.map((row, index) => mapOrderSummaryToOrderRecord(normalizeOrderRecord(row, index)))
      setOrders((current) => {
        if (requestedPage === 1) return mapped
        const unique = new Map(current.map((order) => [order.id, order]))
        for (const order of mapped) unique.set(order.id, order)
        return [...unique.values()]
      })
      setPage(requestedPage); setHasMore(Boolean(result.hasMore)); setTotalCount(Number(result.totalCount) || mapped.length)
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل سجل الفواتير.') }
    finally { loadingRef.current = false; setLoading(false) }
  }, [access.allowed, access.branchId, access.tenantId, normalizedSearch])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadInvoices(1), 250)
    return () => window.clearTimeout(timeoutId)
  }, [loadInvoices])

  const visibleOrders = useMemo(() => orders.filter((order) => {
    const matchesSearch = !normalizedSearch || [order.invoice_number, order.order_number, order.customer_name].some((value) => normalizeInvoiceLedgerSearch(value).includes(normalizedSearch))
    const status = order.payment_status.trim().toLowerCase()
    const matchesFilter = filter === 'all' || (filter === 'paid' ? ['paid', 'completed', 'succeeded'].includes(status) : status === 'refunded')
    return matchesSearch && matchesFilter
  }), [filter, normalizedSearch, orders])
  const groups = useMemo(() => groupInvoicesByRiyadhDate(visibleOrders), [visibleOrders])
  const selectedSummary = useMemo(() => visibleOrders.find((order) => order.id === selectedId) ?? visibleOrders[0] ?? null, [selectedId, visibleOrders])
  const selected = selectedDetails?.id === selectedSummary?.id ? selectedDetails : selectedSummary
  const selectedSummaryId = selectedSummary?.id

  useEffect(() => {
    if (!selectedSummaryId) return
    const requestId = ++detailsRequestRef.current
    void (async () => {
      setDetailsLoading(true); setDetailsError('')
      try {
        const response = await fetch(`/api/orders?${new URLSearchParams({ mode: 'details', id: selectedSummaryId })}`, { credentials: 'include', cache: 'no-store' })
        const result = await response.json().catch(() => null)
        if (!response.ok || !result?.success || !Array.isArray(result.items) || result.items.length !== 1) throw new Error('تعذر تحميل تفاصيل الفاتورة المحددة.')
        const detailed = mapOrderSummaryToOrderRecord(normalizeOrderRecord(result.items[0] as OrderSourceRow, 0))
        if (detailed.id !== selectedSummaryId) throw new Error('تعذر مطابقة تفاصيل الفاتورة المحددة.')
        if (detailsRequestRef.current === requestId) setSelectedDetails(detailed)
      } catch (detailsLoadError) {
        if (detailsRequestRef.current === requestId) setDetailsError(detailsLoadError instanceof Error ? detailsLoadError.message : 'تعذر تحميل تفاصيل الفاتورة المحددة.')
      } finally { if (detailsRequestRef.current === requestId) setDetailsLoading(false) }
    })()
  }, [selectedSummaryId])

  const printInvoice = async () => {
    if (!selected || printing || detailsLoading || detailsError) return
    setPrinting(true)
    try {
      const response = await fetch('/api/invoices/pdf', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        invoiceNumber: selected.invoice_number, orderNumber: selected.order_number, customerName: selected.customer_name, customerPhone: selected.customer_phone,
        issuedAt: selected.created_at, paymentMethod: selected.payment_method_raw || selected.payment_method_key, numericCashReceived: selected.cash_received,
        remainingFromCustomer: selected.remaining_from_customer, cashChange: selected.cash_change,
        invoiceItems: selected.items.map((item) => ({ item_name: item.item_name, quantity: item.quantity, unit_price: item.unit_price, line_total: item.line_total })),
        subtotal: selected.subtotal, discount: selected.discount, tax: selected.tax, finalTotal: selected.total, note: selected.note,
      }) })
      if (!response.ok) throw new Error('تعذر تجهيز الفاتورة للطباعة.')
      const url = URL.createObjectURL(await response.blob()); window.open(url, '_blank', 'noopener,noreferrer'); window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (printError) { setDetailsError(printError instanceof Error ? printError.message : 'تعذر تجهيز الفاتورة للطباعة.') }
    finally { setPrinting(false) }
  }

  if (access.loading || !access.allowed) return <div className="pos-history-gate">جارٍ التحقق من الصلاحية...</div>
  const paymentDisplay = selected ? resolveInvoicePaymentDisplay({ paymentMethod: selected.payment_method_raw || selected.payment_method_key, paymentStatus: selected.payment_status, total: selected.total, cashReceived: selected.cash_received, remainingFromCustomer: selected.remaining_from_customer }) : null

  return <div className="pos-invoice-history pos-invoices-page" dir="rtl"><main>
    <header className="pos-invoices-header"><div className="pos-history-heading"><span><InvoiceIcon /></span><div><h1>الفواتير</h1><p>سجل المبيعات والفواتير</p></div></div><div><button type="button" className="is-close" onClick={() => router.push('/pos')}>إغلاق</button><button type="button" onClick={() => void loadInvoices(1)} disabled={loading}>{loading ? 'جارٍ التحديث...' : 'تحديث'}</button></div></header>
    <div className="pos-invoices-toolbar"><label><span className="sr-only">ابحث برقم الفاتورة أو اسم العميل</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث برقم الفاتورة أو اسم العميل" /></label><div role="group" aria-label="تصفية الفواتير"><button type="button" data-active={filter === 'all'} onClick={() => setFilter('all')}>الكل</button><button type="button" data-active={filter === 'paid'} onClick={() => setFilter('paid')}>مدفوعة</button><button type="button" data-active={filter === 'refunded'} onClick={() => setFilter('refunded')}>مستردة</button></div></div>
    <section className="pos-invoices-workspace">
      <div className="pos-invoice-ledger" data-testid="invoices-scroll-viewport">
        {error ? <div className="pos-history-error" role="alert"><p>{error}</p><button type="button" onClick={() => void loadInvoices(1)}>إعادة المحاولة</button></div> : null}
        {loading && orders.length === 0 ? <div className="pos-invoice-ledger-loading" aria-label="جارٍ تحميل الفواتير">جارٍ تحميل الفواتير...</div> : null}
        {!loading && !error && visibleOrders.length === 0 ? <section className="pos-invoice-ledger-empty"><InvoiceIcon /><h2>لا توجد فواتير مطابقة</h2><p>غيّر البحث أوعامل التصفية لعرض الفواتير.</p></section> : null}
        {!error ? groups.map((group) => <section className="pos-invoice-date-group" key={group.key}><h2>{group.label}</h2><div>{group.invoices.map((order) => <button type="button" className="pos-invoice-ledger-row" data-selected={order.id === selectedSummary?.id} aria-pressed={order.id === selectedSummary?.id} onClick={() => { setSelectedId(order.id); setDetailOpen(true) }} key={order.id}><span className="is-identity"><strong dir="ltr">{order.invoice_number}</strong><small>{order.customer_name || 'عميل نقدي'}</small></span><time>{formatRiyadhTime(order.created_at)}</time><span>{order.payment_method}</span><b>{formatCurrency(order.total)}</b><i>{paymentStatusLabel(order.payment_status)}</i></button>)}</div></section>) : null}
        {!error && hasMore ? <div className="pos-history-more"><button type="button" onClick={() => void loadInvoices(page + 1)} disabled={loading}>{loading ? 'جارٍ التحميل...' : `تحميل المزيد (${orders.length} من ${totalCount})`}</button></div> : null}
      </div>
      <aside className="pos-invoice-detail-pane" data-open={detailOpen} data-testid="invoice-detail-pane" aria-live="polite">
        {!selected ? <div className="pos-invoice-detail-empty"><InvoiceIcon /><h2>اختر فاتورة</h2><p>ستظهر تفاصيل الفاتورة المحددة هنا.</p></div> : <>
          <header><div><small>تفاصيل الفاتورة</small><h2 dir="ltr">{selected.invoice_number}</h2></div><i>{paymentStatusLabel(selected.payment_status)}</i><button type="button" className="pos-invoice-mobile-close" onClick={() => setDetailOpen(false)}>إغلاق</button></header>
          <div className="pos-invoice-detail-scroll" ref={detailBodyRef}>
            {detailsLoading ? <p className="pos-sheet-message">جارٍ تحميل التفاصيل...</p> : null}{detailsError ? <p className="pos-sheet-error" role="alert">{detailsError}</p> : null}
            {!detailsLoading && !detailsError ? <>
              <dl className="pos-invoice-detail-meta"><div><dt>العميل</dt><dd>{selected.customer_name || 'عميل نقدي'}</dd></div><div><dt>التاريخ والوقت</dt><dd>{formatRiyadhDateTime(selected.created_at)}</dd></div><div><dt>طريقة الدفع</dt><dd>{selected.payment_method}</dd></div><div><dt>رقم الطلب</dt><dd dir="ltr">{selected.order_number}</dd></div></dl>
              <section className="pos-invoice-detail-items"><h3>المنتجات والخدمات</h3>{selected.items.length ? selected.items.map((item, index) => <div key={`${selected.id}-${index}`}><span><b>{item.item_name || 'عنصر'}</b><small>{item.quantity} × {formatCurrency(item.unit_price)}</small></span><strong>{formatCurrency(item.line_total)}</strong></div>) : <p>لا توجد تفاصيل عناصر متاحة.</p>}</section>
              <dl className="pos-invoice-detail-totals"><div><dt>المجموع قبل الضريبة</dt><dd>{formatCurrency(selected.subtotal)}</dd></div>{selected.discount > 0 ? <div><dt>الخصم</dt><dd>{formatCurrency(selected.discount)}</dd></div> : null}<div><dt>الضريبة</dt><dd>{formatCurrency(selected.tax)}</dd></div><div className="is-total"><dt>الإجمالي</dt><dd>{formatCurrency(selected.total)}</dd></div></dl>
              {paymentDisplay?.kind === 'cash-details-available' ? <section className="pos-invoice-cash-breakdown"><h3>تفاصيل الدفع النقدي</h3><dl><div><dt>إجمالي الفاتورة</dt><dd>{formatCurrency(selected.total)}</dd></div><div><dt>المبلغ المستلم من العميل</dt><dd>{formatCurrency(paymentDisplay.received)}</dd></div><div><dt>الباقي للعميل</dt><dd>{formatCurrency(paymentDisplay.change)}</dd></div></dl></section> : null}
              {paymentDisplay?.kind === 'cash-details-unavailable' ? <p className="pos-invoice-payment-unavailable">تفاصيل التحصيل النقدي غير متاحة لهذه الفاتورة</p> : null}
              {paymentDisplay?.kind === 'deferred-balance-available' ? <section className="pos-invoice-outstanding"><span>المبلغ المتبقي على العميل</span><b>{formatCurrency(paymentDisplay.outstanding)}</b></section> : null}
              {paymentDisplay?.kind === 'deferred-balance-unavailable' ? <p className="pos-invoice-payment-unavailable">تفاصيل المبلغ المتبقي غير متاحة لهذه الفاتورة</p> : null}
              {paymentDisplay?.kind === 'refunded-without-refund-amount' ? <p className="pos-invoice-refund-note">الفاتورة مستردة. مبلغ الاسترداد التفصيلي غير متاح.</p> : null}
            </> : null}
          </div>
          <footer><button type="button" onClick={() => detailBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}>عرض التفاصيل</button><button type="button" onClick={() => void printInvoice()} disabled={printing || detailsLoading || Boolean(detailsError)}><PrintIcon />{printing ? 'جارٍ التجهيز...' : 'طباعة'}</button></footer>
        </>}
      </aside>
    </section>
  </main></div>
}

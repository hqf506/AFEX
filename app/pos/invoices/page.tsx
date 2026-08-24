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
import { isLatestInvoiceLedgerRequest, mergeInvoiceLedgerPage, selectInvoiceLedgerCollection } from '@/lib/pos/invoice-ledger-collection'
import { PosInvoicePreviewCurtain, type InvoicePreviewMode } from '@/components/pos-invoice-preview-curtain'

const PAGE_SIZE = 24
type InvoiceFilter = 'all' | 'paid' | 'refunded'

function InvoiceIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v16l-3-2-4 2-4-2-3 2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7"/><path d="M9 8h6M9 12h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
}
function ReceiptIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" stroke="currentColor" strokeWidth="1.7"/><path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
}
function DigitalInvoiceIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3h7l4 4v14H7V3Z" stroke="currentColor" strokeWidth="1.7"/><path d="M14 3v5h5M10 13h5M10 17h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
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
  const [searchResults, setSearchResults] = useState<OrderRecord[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedDetails, setSelectedDetails] = useState<OrderRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [preview, setPreview] = useState<{ mode: InvoicePreviewMode; invoice: OrderRecord } | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [error, setError] = useState('')
  const [detailsError, setDetailsError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<InvoiceFilter>('all')
  const [unfilteredMeta, setUnfilteredMeta] = useState({ page: 1, hasMore: false, totalCount: 0 })
  const [searchMeta, setSearchMeta] = useState({ page: 1, hasMore: false, totalCount: 0 })
  const invoiceRequestRef = useRef(0)
  const invoiceRequestControllerRef = useRef<AbortController | null>(null)
  const authoritativeLoadedRef = useRef(false)
  const detailsRequestRef = useRef(0)
  const normalizedSearch = useMemo(() => normalizeInvoiceLedgerSearch(search), [search])

  const loadInvoices = useCallback(async (requestedPage = 1, query = normalizedSearch) => {
    if (!access.allowed || !access.tenantId || !access.branchId) return
    invoiceRequestControllerRef.current?.abort()
    const controller = new AbortController()
    invoiceRequestControllerRef.current = controller
    const requestId = ++invoiceRequestRef.current
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ mode: 'full', page: String(requestedPage), pageSize: String(PAGE_SIZE) })
      if (query) params.set('search', query)
      const response = await fetch(`/api/orders?${params}`, { credentials: 'include', cache: 'no-store', signal: controller.signal })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success) throw new Error(getClientErrorMessage(result, 'تعذر تحميل سجل الفواتير.'))
      const rows = Array.isArray(result.items) ? result.items as OrderSourceRow[] : []
      const mapped = rows.map((row, index) => mapOrderSummaryToOrderRecord(normalizeOrderRecord(row, index)))
      if (!isLatestInvoiceLedgerRequest(invoiceRequestRef.current, requestId, controller.signal.aborted)) return
      const updateCollection = (current: OrderRecord[]) => mergeInvoiceLedgerPage(current, mapped, requestedPage)
      const nextMeta = { page: requestedPage, hasMore: Boolean(result.hasMore), totalCount: Number(result.totalCount) || mapped.length }
      if (query) {
        setSearchResults((current) => updateCollection(current ?? []))
        setSearchMeta(nextMeta)
      } else {
        setOrders(updateCollection)
        setUnfilteredMeta(nextMeta)
        authoritativeLoadedRef.current = true
      }
    } catch (loadError) {
      if (!controller.signal.aborted && invoiceRequestRef.current === requestId) setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل سجل الفواتير.')
    } finally {
      if (invoiceRequestRef.current === requestId) setLoading(false)
    }
  }, [access.allowed, access.branchId, access.tenantId, normalizedSearch])

  useEffect(() => {
    if (!normalizedSearch) {
      if (!authoritativeLoadedRef.current) void loadInvoices(1, '')
      return
    }
    const timeoutId = window.setTimeout(() => void loadInvoices(1), 250)
    return () => window.clearTimeout(timeoutId)
  }, [loadInvoices, normalizedSearch])

  useEffect(() => () => {
    invoiceRequestControllerRef.current?.abort()
    invoiceRequestRef.current += 1
  }, [])

  const updateSearch = (value: string) => {
    const nextQuery = normalizeInvoiceLedgerSearch(value)
    if (nextQuery !== normalizedSearch) {
      invoiceRequestControllerRef.current?.abort()
      invoiceRequestRef.current += 1
      setLoading(false)
    }
    setSearch(nextQuery ? value : '')
    if (!nextQuery) {
      setSearchResults(null)
      setError('')
    }
  }
  const activeOrders = useMemo(() => selectInvoiceLedgerCollection(normalizedSearch, orders, searchResults), [normalizedSearch, orders, searchResults])
  const activeMeta = normalizedSearch ? searchMeta : unfilteredMeta
  const visibleOrders = useMemo(() => activeOrders.filter((order) => {
    const matchesSearch = !normalizedSearch || [order.invoice_number, order.order_number, order.customer_name].some((value) => normalizeInvoiceLedgerSearch(value).includes(normalizedSearch))
    const status = order.payment_status.trim().toLowerCase()
    const matchesFilter = filter === 'all' || (filter === 'paid' ? ['paid', 'completed', 'succeeded'].includes(status) : status === 'refunded')
    return matchesSearch && matchesFilter
  }), [activeOrders, filter, normalizedSearch])
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

  const openPreview = (mode: InvoicePreviewMode) => {
    if (!selected || detailsLoading || detailsError) return
    setPreview({ mode, invoice: selected })
  }

  if (access.loading || !access.allowed) return <div className="pos-history-gate">جارٍ التحقق من الصلاحية...</div>
  const paymentDisplay = selected ? resolveInvoicePaymentDisplay({ paymentMethod: selected.payment_method_raw || selected.payment_method_key, paymentStatus: selected.payment_status, total: selected.total, cashReceived: selected.cash_received, remainingFromCustomer: selected.remaining_from_customer }) : null

  return <div className="pos-invoice-history pos-invoices-page" dir="rtl"><main>
    <header className="pos-invoices-header"><div className="pos-history-heading"><span><InvoiceIcon /></span><div><h1>الفواتير</h1><p>سجل المبيعات والفواتير</p></div></div><div><button type="button" className="is-close" onClick={() => router.push('/pos')}>إغلاق</button><button type="button" onClick={() => void loadInvoices(1)} disabled={loading}>{loading ? 'جارٍ التحديث...' : 'تحديث'}</button></div></header>
    <div className="pos-invoices-toolbar"><label className="pos-invoices-search"><span className="sr-only">ابحث برقم الفاتورة أو اسم العميل</span><input value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="ابحث برقم الفاتورة أو اسم العميل" />{search ? <button type="button" className="pos-invoices-search-clear" aria-label="مسح البحث" onClick={() => updateSearch('')}>مسح</button> : null}</label><div role="group" aria-label="تصفية الفواتير"><button type="button" data-active={filter === 'all'} onClick={() => setFilter('all')}>الكل</button><button type="button" data-active={filter === 'paid'} onClick={() => setFilter('paid')}>مدفوعة</button><button type="button" data-active={filter === 'refunded'} onClick={() => setFilter('refunded')}>مستردة</button></div></div>
    <section className="pos-invoices-workspace">
      <div className="pos-invoice-ledger" data-testid="invoices-scroll-viewport" role="grid" aria-label="سجل الفواتير">
        <div className="pos-invoice-ledger-columns" role="row"><span data-column="invoice-number" role="columnheader">رقم الفاتورة</span><span data-column="customer" role="columnheader">اسم العميل</span><span data-column="time" role="columnheader">التوقيت</span><span data-column="payment" role="columnheader">طريقة الدفع</span><span data-column="total" role="columnheader">الإجمالي</span><span data-column="status" role="columnheader">حالة الفاتورة</span></div>
        {error ? <div className="pos-history-error" role="alert"><p>{error}</p><button type="button" onClick={() => void loadInvoices(1)}>إعادة المحاولة</button></div> : null}
        {loading && orders.length === 0 ? <div className="pos-invoice-ledger-loading" aria-label="جارٍ تحميل الفواتير">جارٍ تحميل الفواتير...</div> : null}
        {!loading && !error && visibleOrders.length === 0 ? <section className="pos-invoice-ledger-empty"><InvoiceIcon /><h2>لا توجد فواتير مطابقة</h2><p>غيّر البحث أوعامل التصفية لعرض الفواتير.</p></section> : null}
        {!error ? groups.map((group) => <section className="pos-invoice-date-group" role="rowgroup" key={group.key}><h2>{group.label}</h2><div>{group.invoices.map((order) => <button type="button" className="pos-invoice-ledger-row" role="row" data-selected={order.id === selectedSummary?.id} data-mobile-action="عرض التفاصيل" aria-selected={order.id === selectedSummary?.id} onClick={() => { setPreview(null); setSelectedId(order.id); setDetailOpen(true) }} key={order.id}><strong role="gridcell" data-column="invoice-number" data-label="رقم الفاتورة" className="is-invoice-number" dir="ltr">{order.invoice_number}</strong><span role="gridcell" data-column="customer" data-label="اسم العميل" className="is-customer" title={order.customer_name || 'عميل نقدي'}>{order.customer_name || 'عميل نقدي'}</span><time role="gridcell" data-column="time" data-label="التوقيت">{formatRiyadhTime(order.created_at)}</time><span role="gridcell" data-column="payment" data-label="طريقة الدفع" className="is-payment">{order.payment_method}</span><b role="gridcell" data-column="total" data-label="الإجمالي">{formatCurrency(order.total)}</b><i role="gridcell" data-column="status" data-label="حالة الفاتورة">{paymentStatusLabel(order.payment_status)}</i></button>)}</div></section>) : null}
        {!error && activeMeta.hasMore ? <div className="pos-history-more"><button type="button" onClick={() => void loadInvoices(activeMeta.page + 1)} disabled={loading}>{loading ? 'جارٍ التحميل...' : `تحميل المزيد (${activeOrders.length} من ${activeMeta.totalCount})`}</button></div> : null}
      </div>
      <aside className="pos-invoice-detail-pane" data-open={detailOpen} data-testid="invoice-detail-pane" aria-live="polite">
        {!selected ? <div className="pos-invoice-detail-empty"><InvoiceIcon /><h2>اختر فاتورة</h2><p>ستظهر تفاصيل الفاتورة المحددة هنا.</p></div> : <>
          <header><div><small>تفاصيل الفاتورة</small><h2 dir="ltr">{selected.invoice_number}</h2></div><i>{paymentStatusLabel(selected.payment_status)}</i><button type="button" className="pos-invoice-mobile-close" onClick={() => setDetailOpen(false)}>إغلاق</button></header>
          <div className="pos-invoice-detail-scroll">
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
          <footer><button type="button" onClick={() => openPreview('thermal')} disabled={detailsLoading || Boolean(detailsError)}><ReceiptIcon />الفاتورة الحرارية</button><button type="button" onClick={() => openPreview('digital')} disabled={detailsLoading || Boolean(detailsError)}><DigitalInvoiceIcon />عرض الفاتورة الرقمية</button></footer>
        </>}
      </aside>
    </section>
  </main>{preview ? <PosInvoicePreviewCurtain key={`${preview.mode}-${preview.invoice.id}`} mode={preview.mode} invoice={preview.invoice} onClose={() => setPreview(null)} /> : null}</div>
}

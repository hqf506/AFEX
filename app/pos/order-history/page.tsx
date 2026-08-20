'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePageAccess } from '@/hooks/use-page-access'
import { getClientErrorMessage } from '@/lib/api/client-error'
import { formatCurrency } from '@/lib/orders/format'
import { mapOrderSummaryToOrderRecord, type OrderRecord } from '@/lib/orders/orders-page'
import { normalizeOrderRecord, type OrderSourceRow } from '@/lib/orders/normalize'
import { POS_ACCESS_ROLES } from '@/lib/permissions'
import { formatPosGregorianDateTime } from '@/lib/pos/date-format'
import { countUniqueOperationCustomers, currentRiyadhDayOperations, filterPosOperations, formatPosOperationTime, getRiyadhDayLabel, mapOrdersToPosOperations, millisecondsUntilNextRiyadhMidnight } from '@/lib/pos/operations-timeline'
import { readActivePosEmployee } from '@/lib/pos-employee-session'
import styles from './operations-history.module.css'

const PAGE_SIZE = 24

function DetailsIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h16v14H4z M8 9h8 M8 13h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function ActivityIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v16l-3-2-4 2-4-2-3 2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7"/><path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
}
function InvoiceIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v16l-3-2-4 2-4-2-3 2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7"/><path d="M9 8h6M9 12h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg> }
function UserIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M5 20c.7-3.2 3-5 7-5s6.3 1.8 7 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg> }
function RefreshIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11a8 8 0 1 0 1 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M20 4v7h-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> }

function paymentStatusLabel(value: string) {
  const normalized = value.trim().toLowerCase()
  if (['paid', 'completed', 'succeeded'].includes(normalized)) return 'مدفوعة'
  if (['partial', 'partially_paid'].includes(normalized)) return 'مدفوعة جزئيًا'
  if (['cancelled', 'canceled', 'void'].includes(normalized)) return 'ملغاة'
  return value && value !== '—' ? value : 'حالة غير محددة'
}

export default function PosOrderHistoryPage() {
  const router = useRouter()
  const access = usePageAccess({ allowedRoles: [...POS_ACCESS_ROLES], redirectIfNoUser: '/pos/login', redirectIfForbidden: '/pos' })
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [selected, setSelected] = useState<OrderRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailsError, setDetailsError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [operationKind, setOperationKind] = useState<'all' | 'invoice'>('all')
  const [employeeName, setEmployeeName] = useState('موظف نقطة البيع')
  const sheetRef = useRef<HTMLElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const detailsRequestRef = useRef(0)
  const loadRequestRef = useRef(0)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const employee = readActivePosEmployee()
      if (employee?.full_name) setEmployeeName(employee.full_name)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const loadInvoices = useCallback(async (requestedPage = 1) => {
    if (!access.allowed || !access.tenantId || !access.branchId) return
    const requestId = loadRequestRef.current + 1
    loadRequestRef.current = requestId
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ mode: 'full', page: String(requestedPage), pageSize: String(PAGE_SIZE), todayRiyadh: '1' })
      if (search.trim()) params.set('search', search.trim())
      const response = await fetch(`/api/orders?${params}`, { credentials: 'include', cache: 'no-store' })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success) throw new Error(getClientErrorMessage(result, 'تعذر تحميل سجل العمليات.'))
      const rows = Array.isArray(result.items) ? result.items as OrderSourceRow[] : []
      const mapped = rows.map((row, index) => mapOrderSummaryToOrderRecord(normalizeOrderRecord(row, index)))
      if (loadRequestRef.current !== requestId) return
      setOrders((current) => {
        if (requestedPage === 1) return mapped
        const unique = new Map(current.map((order) => [order.id, order]))
        for (const order of mapped) unique.set(order.id, order)
        return [...unique.values()]
      })
      setPage(requestedPage)
      setHasMore(Boolean(result.hasMore))
      setTotalCount(Number(result.totalCount) || mapped.length)
    } catch (loadError) {
      if (loadRequestRef.current === requestId) setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل سجل العمليات.')
    } finally { if (loadRequestRef.current === requestId) setLoading(false) }
  }, [access.allowed, access.branchId, access.tenantId, search])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadInvoices(1), 250)
    return () => window.clearTimeout(timeoutId)
  }, [loadInvoices])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadInvoices(1), millisecondsUntilNextRiyadhMidnight())
    return () => window.clearTimeout(timer)
  }, [loadInvoices])

  const closeDetails = useCallback(() => {
    detailsRequestRef.current += 1
    setSelected(null); setDetailsError('')
    window.setTimeout(() => returnFocusRef.current?.focus({ preventScroll: true }), 0)
  }, [])

  useEffect(() => {
    if (!selected) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDetails()
      if (event.key !== 'Tab') return
      const focusable = sheetRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')
      if (!focusable?.length) return
      const first = focusable[0]; const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    window.setTimeout(() => sheetRef.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true }), 0)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown) }
  }, [closeDetails, selected])

  const openDetails = async (order: OrderRecord, trigger: HTMLElement) => {
    const requestSequence = detailsRequestRef.current + 1
    detailsRequestRef.current = requestSequence
    returnFocusRef.current = trigger; setSelected(order); setDetailsLoading(true); setDetailsError('')
    try {
      const params = new URLSearchParams({ mode: 'details', id: order.id })
      const response = await fetch(`/api/orders?${params}`, { credentials: 'include', cache: 'no-store' })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success || !Array.isArray(result.items) || result.items.length !== 1) throw new Error('تعذر تحميل تفاصيل الطلب المحدد.')
      const detailed = mapOrderSummaryToOrderRecord(normalizeOrderRecord(result.items[0] as OrderSourceRow, 0))
      if (detailed.id !== order.id) throw new Error('تعذر مطابقة تفاصيل الطلب المحدد.')
      if (detailsRequestRef.current === requestSequence) setSelected(detailed)
    } catch (detailsLoadError) {
      if (detailsRequestRef.current === requestSequence) setDetailsError(detailsLoadError instanceof Error ? detailsLoadError.message : 'تعذر تحميل تفاصيل الطلب المحدد.')
    } finally {
      if (detailsRequestRef.current === requestSequence) setDetailsLoading(false)
    }
  }

  const operations = useMemo(() => mapOrdersToPosOperations(orders), [orders])
  const todayOperations = useMemo(() => currentRiyadhDayOperations(operations), [operations])
  const filtered = useMemo(() => filterPosOperations(todayOperations, search, operationKind), [todayOperations, search, operationKind])
  const todayCount = todayOperations.length
  const customerCount = useMemo(() => countUniqueOperationCustomers(todayOperations), [todayOperations])

  if (access.loading || !access.allowed) return <div className="pos-history-gate">جارٍ التحقق من الصلاحية...</div>

  return <div className={styles.page} dir="rtl"><main className={styles.main}>
    <div className={styles.headerArea}>
      <header className={styles.header}><div className={styles.title}><span><InvoiceIcon /></span><div><h1>سجل العمليات</h1><p>نشاطك في نقطة البيع</p></div></div><span className={styles.employee}><UserIcon />{employeeName}</span><div className={styles.actions}><button type="button" onClick={() => void loadInvoices(1)} disabled={loading}><RefreshIcon /><span>تحديث</span></button><button type="button" onClick={() => router.push('/pos')} aria-label="إغلاق سجل العمليات"><span aria-hidden="true">×</span><span>إغلاق</span></button></div></header>
      <div className={styles.summary} aria-label="إحصائيات العمليات"><div><UserIcon /><small>عملاء</small><strong>{customerCount}</strong></div><div><InvoiceIcon /><small>فواتير</small><strong>{todayCount}</strong></div><div><ActivityIcon /><small>عمليات اليوم</small><strong>{todayCount}</strong></div></div>
      <div className={styles.toolbar}><label><span className="sr-only">ابحث برقم الفاتورة أو العميل أو نوع العملية</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث برقم الفاتورة أو العميل أو نوع العملية" /></label><label><span className="sr-only">تصفية العمليات</span><select value={operationKind} onChange={(event) => setOperationKind(event.target.value as 'all' | 'invoice')}><option value="all">كل العمليات</option><option value="invoice">فواتير</option></select></label></div>
    </div>
    <div className={styles.scroll} data-testid="order-history-scroll-viewport">
    {error ? <div className="pos-history-error" role="alert"><p>{error}</p><button type="button" onClick={() => void loadInvoices(1)}>إعادة المحاولة</button></div> : null}
    {loading && orders.length === 0 ? <div className={styles.timeline} aria-label="جارٍ تحميل العمليات">{[1,2,3].map((item) => <div className={styles.skeleton} key={item} />)}</div> : null}
    {!loading && !error && filtered.length === 0 ? <section className="pos-history-empty"><ActivityIcon /><h2>{search ? 'لا توجد عمليات مطابقة' : 'لا توجد عمليات مسجلة'}</h2><p>{search ? 'جرّب عبارة بحث مختلفة.' : 'تظهر هنا عمليات الطلبات والفواتير المتاحة فقط.'}</p></section> : null}
    {!error && filtered.length > 0 ? <section className={styles.timeline} aria-label="سجل عمليات اليوم"><section><h2 className={styles.day}>{getRiyadhDayLabel()}</h2>{filtered.map((operation) => <article className={styles.item} key={operation.id} aria-label={`فتح تفاصيل ${operation.reference}`} onClick={(event) => void openDetails(operation.order, event.currentTarget)}><time>{formatPosOperationTime(operation.createdAt)}</time><div className={styles.marker}><InvoiceIcon /></div><div className={styles.card}><div className={styles.operation}><strong>{operation.title}</strong><p>{operation.description}</p></div><small className={styles.reference} dir="ltr">{operation.reference}</small><small className={styles.customer}>{operation.customerName || 'عميل نقدي'}</small><span className={`${styles.status} ${styles[operation.statusTone]}`}>{operation.statusLabel}</span><button type="button" aria-label={`عرض تفاصيل ${operation.reference}`} onClick={(event) => { event.stopPropagation(); void openDetails(operation.order, event.currentTarget) }}><DetailsIcon /></button></div></article>)}</section></section> : null}
      {!error && hasMore ? <div className="pos-history-more"><button type="button" onClick={() => void loadInvoices(page + 1)} disabled={loading}>{loading ? 'جارٍ التحميل...' : `تحميل المزيد (${orders.length} من ${totalCount})`}</button></div> : null}
    </div>
  </main>
  {selected ? <div className="pos-invoice-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDetails() }}><section ref={sheetRef} className="pos-invoice-sheet" role="dialog" aria-modal="true" aria-labelledby="pos-invoice-sheet-title"><header><div><small>تفاصيل الطلب</small><h2 id="pos-invoice-sheet-title" dir="ltr">{selected.order_number} / {selected.invoice_number}</h2></div><button type="button" onClick={closeDetails} aria-label="إغلاق تفاصيل الطلب">إغلاق</button></header><div className="pos-invoice-sheet-body">
    {detailsLoading ? <p className="pos-sheet-message">جارٍ تحميل التفاصيل...</p> : null}{detailsError ? <p className="pos-sheet-error" role="alert">{detailsError}</p> : null}
    {!detailsLoading && !detailsError ? <><section className="pos-invoice-customer"><div><b>{selected.customer_name || 'عميل نقدي'}</b>{selected.customer_phone && selected.customer_phone !== '—' ? <span dir="ltr">{selected.customer_phone}</span> : null}</div><time>{formatPosGregorianDateTime(selected.created_at)}</time></section><section><h3>المنتجات والخدمات</h3><div className="pos-invoice-lines">{selected.items.length ? selected.items.map((item, index) => <div key={`${selected.id}-${index}`}><div><b>{item.item_name || 'عنصر'}</b><span>{item.quantity} × {formatCurrency(item.unit_price)}</span></div><strong>{formatCurrency(item.line_total)}</strong></div>) : <p>لا توجد تفاصيل عناصر متاحة.</p>}</div></section><section className="pos-invoice-totals"><div><span>المجموع قبل الضريبة</span><b>{formatCurrency(selected.subtotal)}</b></div><div><span>الضريبة</span><b>{formatCurrency(selected.tax)}</b></div><div><span>الخصم</span><b>{formatCurrency(selected.discount)}</b></div><div className="is-total"><span>الإجمالي</span><b>{formatCurrency(selected.total)}</b></div></section><section className="pos-invoice-payment"><div><span>طريقة الدفع</span><b>{selected.payment_method}</b></div><div><span>حالة الدفع</span><b>{paymentStatusLabel(selected.payment_status)}</b></div>{selected.payment_method_key === 'cash' ? <div className="pos-invoice-cash-details"><div><span>المبلغ المستلم من العميل</span><b>{selected.cash_received_available ? formatCurrency(selected.cash_received) : 'غير متاح'}</b></div><div><span>المبلغ المطبق على الطلب</span><b>{selected.applied_amount_available ? formatCurrency(selected.total) : 'غير متاح'}</b></div><div><span>الباقي للعميل</span><b>{selected.cash_change_available ? formatCurrency(selected.cash_change) : 'غير متاح'}</b></div></div> : null}</section></> : null}
  </div></section></div> : null}</div>
}

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
import { filterPosOperations, formatPosOperationTime, groupPosOperations, mapOrdersToPosOperations } from '@/lib/pos/operations-timeline'
import { readActivePosEmployee } from '@/lib/pos-employee-session'

const PAGE_SIZE = 24

function DetailsIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h16v14H4z M8 9h8 M8 13h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function ActivityIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v16l-3-2-4 2-4-2-3 2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7"/><path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
}

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
      const params = new URLSearchParams({ mode: 'full', page: String(requestedPage), pageSize: String(PAGE_SIZE), recentHours: '48' })
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
  const filtered = useMemo(() => filterPosOperations(operations, search, operationKind), [operations, search, operationKind])
  const grouped = useMemo(() => groupPosOperations(filtered), [filtered])
  const todayCount = useMemo(() => groupPosOperations(operations).find((group) => group.label === 'اليوم')?.operations.length || 0, [operations])

  if (access.loading || !access.allowed) return <div className="pos-history-gate">جارٍ التحقق من الصلاحية...</div>

  return <div className="pos-invoice-history pos-order-history-page" dir="rtl"><main>
    <div className="pos-order-history-controls pos-operations-controls">
      <header className="pos-history-header pos-operations-header"><div className="pos-history-heading"><span><ActivityIcon /></span><div><h1>سجل العمليات</h1><p>نشاطك في نقطة البيع</p></div></div><div className="pos-operations-header-actions"><span className="pos-operations-employee">{employeeName}</span><button type="button" onClick={() => router.push('/pos')} aria-label="إغلاق سجل العمليات">إغلاق</button></div></header>
      <div className="pos-operations-stats" aria-label="إحصائيات العمليات"><div><small>عمليات اليوم</small><strong>{todayCount}</strong></div><div><small>فواتير</small><strong>{totalCount}</strong></div></div>
      <div className="pos-history-tools pos-operations-tools"><label><span className="sr-only">ابحث برقم الفاتورة أو العميل أو نوع العملية</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث برقم الفاتورة أو العميل أو نوع العملية" /></label><label className="pos-operations-filter"><span className="sr-only">تصفية العمليات</span><select value={operationKind} onChange={(event) => setOperationKind(event.target.value as 'all' | 'invoice')}><option value="all">كل العمليات</option><option value="invoice">فواتير</option></select></label><button type="button" onClick={() => void loadInvoices(1)} disabled={loading}>تحديث</button></div>
      <p className="pos-operations-coverage">يعرض السجل عمليات الطلبات والفواتير المتاحة حاليًا.</p>
    </div>
    <div className="pos-order-history-scroll" data-testid="order-history-scroll-viewport">
    {error ? <div className="pos-history-error" role="alert"><p>{error}</p><button type="button" onClick={() => void loadInvoices(1)}>إعادة المحاولة</button></div> : null}
    {loading && orders.length === 0 ? <div className="pos-operations-timeline" aria-label="جارٍ تحميل العمليات">{[1,2,3].map((item) => <div className="pos-operations-skeleton" key={item} />)}</div> : null}
    {!loading && !error && filtered.length === 0 ? <section className="pos-history-empty"><ActivityIcon /><h2>{search ? 'لا توجد عمليات مطابقة' : 'لا توجد عمليات مسجلة'}</h2><p>{search ? 'جرّب عبارة بحث مختلفة.' : 'تظهر هنا عمليات الطلبات والفواتير المتاحة فقط.'}</p></section> : null}
    {!error && grouped.length > 0 ? <section className="pos-operations-timeline" aria-label="سجل العمليات خلال آخر 48 ساعة">{grouped.map((group) => <section className="pos-operations-day" key={group.key}><h2>{group.label}</h2>{group.operations.map((operation) => <article className="pos-operation" key={operation.id}><div className="pos-operation-marker"><ActivityIcon /></div><time>{formatPosOperationTime(operation.createdAt)}</time><div className="pos-operation-content"><div><span className="pos-operation-kind">{operation.kindLabel}</span><strong>{operation.title}</strong><span className={`pos-operation-status is-${operation.statusTone}`}>{operation.statusLabel}</span></div><p>{operation.description}</p><small dir="ltr">{operation.reference}</small><button type="button" onClick={(event) => void openDetails(operation.order, event.currentTarget)}><DetailsIcon /><span>عرض التفاصيل</span></button></div></article>)}</section>)}</section> : null}
      {!error && hasMore ? <div className="pos-history-more"><button type="button" onClick={() => void loadInvoices(page + 1)} disabled={loading}>{loading ? 'جارٍ التحميل...' : `تحميل المزيد (${orders.length} من ${totalCount})`}</button></div> : null}
    </div>
  </main>
  {selected ? <div className="pos-invoice-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDetails() }}><section ref={sheetRef} className="pos-invoice-sheet" role="dialog" aria-modal="true" aria-labelledby="pos-invoice-sheet-title"><header><div><small>تفاصيل الطلب</small><h2 id="pos-invoice-sheet-title" dir="ltr">{selected.order_number} / {selected.invoice_number}</h2></div><button type="button" onClick={closeDetails} aria-label="إغلاق تفاصيل الطلب">إغلاق</button></header><div className="pos-invoice-sheet-body">
    {detailsLoading ? <p className="pos-sheet-message">جارٍ تحميل التفاصيل...</p> : null}{detailsError ? <p className="pos-sheet-error" role="alert">{detailsError}</p> : null}
    {!detailsLoading && !detailsError ? <><section className="pos-invoice-customer"><div><b>{selected.customer_name || 'عميل نقدي'}</b>{selected.customer_phone && selected.customer_phone !== '—' ? <span dir="ltr">{selected.customer_phone}</span> : null}</div><time>{formatPosGregorianDateTime(selected.created_at)}</time></section><section><h3>المنتجات والخدمات</h3><div className="pos-invoice-lines">{selected.items.length ? selected.items.map((item, index) => <div key={`${selected.id}-${index}`}><div><b>{item.item_name || 'عنصر'}</b><span>{item.quantity} × {formatCurrency(item.unit_price)}</span></div><strong>{formatCurrency(item.line_total)}</strong></div>) : <p>لا توجد تفاصيل عناصر متاحة.</p>}</div></section><section className="pos-invoice-totals"><div><span>المجموع قبل الضريبة</span><b>{formatCurrency(selected.subtotal)}</b></div><div><span>الضريبة</span><b>{formatCurrency(selected.tax)}</b></div><div><span>الخصم</span><b>{formatCurrency(selected.discount)}</b></div><div className="is-total"><span>الإجمالي</span><b>{formatCurrency(selected.total)}</b></div></section><section className="pos-invoice-payment"><div><span>طريقة الدفع</span><b>{selected.payment_method}</b></div><div><span>حالة الدفع</span><b>{paymentStatusLabel(selected.payment_status)}</b></div>{selected.payment_method_key === 'cash' ? <div className="pos-invoice-cash-details"><div><span>المبلغ المستلم من العميل</span><b>{selected.cash_received_available ? formatCurrency(selected.cash_received) : 'غير متاح'}</b></div><div><span>المبلغ المطبق على الطلب</span><b>{selected.applied_amount_available ? formatCurrency(selected.total) : 'غير متاح'}</b></div><div><span>الباقي للعميل</span><b>{selected.cash_change_available ? formatCurrency(selected.cash_change) : 'غير متاح'}</b></div></div> : null}</section></> : null}
  </div></section></div> : null}</div>
}

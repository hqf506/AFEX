'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePageAccess } from '@/hooks/use-page-access'
import { getClientErrorMessage } from '@/lib/api/client-error'
import { formatCurrency } from '@/lib/orders/format'
import { mapOrderSummaryToOrderRecord, ORDER_STATUS_MAP, type OrderRecord } from '@/lib/orders/orders-page'
import { normalizeOrderRecord, type OrderSourceRow, type OrderStatus } from '@/lib/orders/normalize'
import { POS_ACCESS_ROLES } from '@/lib/permissions'
import { formatPosGregorianDateTime } from '@/lib/pos/date-format'
import { supabase } from '@/lib/supabase/client'

const STATUS_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus>> = {
  in_progress: 'ready',
  ready: 'closed',
}
const PAGE_SIZE = 24
function WorkflowIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="m16 15 2 2 3-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function RefreshIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.34 5.66M20 5v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 18-6-6 6-6M9 12h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export default function PosOrderStatusPage() {
  const router = useRouter()
  const access = usePageAccess({ allowedRoles: [...POS_ACCESS_ROLES], redirectIfNoUser: '/pos/login', redirectIfForbidden: '/pos' })
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const listRef = useRef<HTMLElement>(null)
  const selectedRowRef = useRef<HTMLButtonElement>(null)

  const loadOrders = useCallback(async (requestedPage = 1) => {
    if (!access.allowed || !access.tenantId || !access.branchId) return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ mode: 'full', page: String(requestedPage), pageSize: String(PAGE_SIZE), listFilter: 'all' })
      const response = await fetch(`/api/orders?${params}`, { credentials: 'include', cache: 'no-store' })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success) throw new Error(getClientErrorMessage(result, 'تعذر تحميل حالة الطلبات.'))
      const mapped: OrderRecord[] = []
      for (const [index, row] of (Array.isArray(result.items) ? result.items as OrderSourceRow[] : []).entries()) {
        const order = mapOrderSummaryToOrderRecord(normalizeOrderRecord(row, index))
        if (STATUS_TRANSITIONS[order.status]) mapped.push(order)
      }
      setOrders((current) => {
        const unique = new Map((requestedPage === 1 ? [] : current).map((order) => [order.id, order]))
        for (const order of mapped) unique.set(order.id, order)
        return [...unique.values()]
      })
      setPage(requestedPage)
      setHasMore(Boolean(result.hasMore))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل حالة الطلبات.')
    } finally {
      setLoading(false)
    }
  }, [access.allowed, access.branchId, access.tenantId])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadOrders(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadOrders])

  const columns = useMemo(() => ({
    in_progress: orders.filter((order) => order.status === 'in_progress'),
    ready: orders.filter((order) => order.status === 'ready'),
  }), [orders])

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedId) ?? orders[0] ?? null,
    [orders, selectedId],
  )
  const selectedNextStatus = selectedOrder ? STATUS_TRANSITIONS[selectedOrder.status] : undefined

  useEffect(() => {
    const list = listRef.current
    const row = selectedRowRef.current
    if (!list || !row) return
    const frame = window.requestAnimationFrame(() => {
      const listRect = list.getBoundingClientRect()
      const rowRect = row.getBoundingClientRect()
      if (rowRect.top < listRect.top || rowRect.bottom > listRect.bottom) {
        row.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [orders, selectedOrder?.id])

  const advance = async (order: OrderRecord) => {
    const nextStatus = STATUS_TRANSITIONS[order.status]
    if (!nextStatus || updatingId || !access.tenantId || !access.branchId) return
    setUpdatingId(order.id)
    setError('')
    const { data, error: updateError } = await supabase.from('orders').update({ status: nextStatus }).eq('id', order.id).eq('tenant_id', access.tenantId).eq('branch_id', access.branchId).eq('status', order.status).select('id').maybeSingle()
    if (updateError || !data) {
      setError(`تعذر تحديث حالة الطلب ${order.order_number}. أعد تحميل الصفحة للتحقق.`)
      setUpdatingId(null)
      return
    }
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: nextStatus } : item).filter((item) => STATUS_TRANSITIONS[item.status]))
    setUpdatingId(null)
  }

  if (access.loading || !access.allowed) return <div className="pos-history-gate">جارٍ التحقق من الصلاحية...</div>

  return <div className="pos-invoice-history pos-order-status-workflow" data-order-status-page dir="rtl"><main>
    <header className="pos-status-header" data-order-status-header>
      <div className="pos-history-heading"><span><WorkflowIcon /></span><div><h1>حالة الطلبات</h1><p>عرض ومتابعة الطلبات الحالية وتحديث حالتها</p></div></div>
      <div className="pos-status-header-actions">
        <button type="button" onClick={() => void loadOrders()} disabled={loading}><RefreshIcon /><span>{loading ? 'جارٍ التحديث...' : 'تحديث'}</span></button>
        <button type="button" onClick={() => router.push('/pos')}><CloseIcon /><span>إغلاق وعودة إلى POS</span></button>
      </div>
    </header>

    <section className="pos-status-metrics" aria-label="ملخص حالات الطلبات">
      <article><span className="pos-status-dot is-progress" /><div><small>قيد التنفيذ</small><strong>{columns.in_progress.length}</strong></div></article>
      <article><span className="pos-status-dot is-ready" /><div><small>جاهزة</small><strong>{columns.ready.length}</strong></div></article>
    </section>

    {error ? <div className="pos-history-error" role="alert"><p>{error}</p><button type="button" onClick={() => void loadOrders()}>إعادة المحاولة</button></div> : null}
    {loading && orders.length === 0 ? <div className="pos-status-loading" aria-label="جارٍ تحميل حالة الطلبات">{[1, 2, 3].map((item) => <div className="pos-history-skeleton" key={item} />)}</div> : null}
    {!loading && !error && orders.length === 0 ? <section className="pos-history-empty"><WorkflowIcon /><h2>لا توجد طلبات تشغيلية حالية</h2><p>ستظهر الطلبات قيد التنفيذ أو الجاهزة هنا.</p></section> : null}

    {!error && orders.length > 0 ? <section className="pos-status-workspace">
      <section className="pos-status-list" data-order-status-list aria-label="الطلبات التشغيلية" ref={listRef}>
        <div className="pos-status-list-labels" aria-hidden="true"><span>الطلب والعميل</span><span>التاريخ</span><span>الإجمالي</span><span>الحالة</span></div>
        {orders.map((order) => <button
          type="button"
          className="pos-status-row"
          data-order-status-row
          data-selected={order.id === selectedOrder?.id ? 'true' : 'false'}
          aria-pressed={order.id === selectedOrder?.id}
          ref={order.id === selectedOrder?.id ? selectedRowRef : undefined}
          key={order.id}
          onClick={() => setSelectedId(order.id)}
        >
          <span className="pos-status-row-identity"><strong dir="ltr">{order.order_number}</strong><small>{order.customer_name || 'عميل نقدي'}{order.customer_phone ? ` · ${order.customer_phone}` : ''}</small></span>
          <time dateTime={order.created_at}>{formatPosGregorianDateTime(order.created_at)}</time>
          <b>{formatCurrency(order.total)}</b>
          <span className={ORDER_STATUS_MAP[order.status].className}>{ORDER_STATUS_MAP[order.status].label}</span>
        </button>)}
        {hasMore ? <div className="pos-history-more"><button type="button" onClick={() => void loadOrders(page + 1)} disabled={loading}>{loading ? 'جارٍ التحميل...' : 'تحميل المزيد'}</button></div> : null}
      </section>

      {selectedOrder ? <aside className="pos-status-details" data-order-status-details aria-live="polite">
        <header><div><small>تفاصيل الطلب</small><h2 dir="ltr">{selectedOrder.order_number}</h2></div><span className={ORDER_STATUS_MAP[selectedOrder.status].className}>{ORDER_STATUS_MAP[selectedOrder.status].label}</span></header>
        <div className="pos-status-details-body">
          <dl className="pos-status-details-meta">
            <div><dt>العميل</dt><dd>{selectedOrder.customer_name || 'عميل نقدي'}</dd></div>
            <div><dt>الهاتف</dt><dd dir="ltr">{selectedOrder.customer_phone || 'غير متاح'}</dd></div>
            <div><dt>التاريخ والوقت</dt><dd>{formatPosGregorianDateTime(selectedOrder.created_at)}</dd></div>
            <div><dt>طريقة الدفع</dt><dd>{selectedOrder.payment_method || 'غير متاح'}</dd></div>
          </dl>
          <section className="pos-status-details-items" aria-label="عناصر الطلب">
            <h3>العناصر</h3>
            {selectedOrder.items.length > 0 ? selectedOrder.items.map((item, index) => <article key={`${selectedOrder.id}-${index}`}>
              <div><strong>{item.item_name || 'عنصر غير متاح'}</strong><small>{item.quantity} × {formatCurrency(item.unit_price)}</small></div><b>{formatCurrency(item.line_total)}</b>
            </article>) : <p>غير متاح</p>}
          </section>
          <dl className="pos-status-totals">
            <div><dt>المجموع قبل الضريبة</dt><dd>{formatCurrency(selectedOrder.subtotal)}</dd></div>
            <div><dt>الضريبة</dt><dd>{formatCurrency(selectedOrder.tax)}</dd></div>
            <div><dt>الخصم</dt><dd>{formatCurrency(selectedOrder.discount)}</dd></div>
            <div className="is-grand-total"><dt>الإجمالي النهائي</dt><dd>{formatCurrency(selectedOrder.total)}</dd></div>
          </dl>
          <div className="pos-status-history"><span>سجل الحالة</span><strong>غير متاح</strong></div>
        </div>
        <footer data-order-status-action>
          {selectedNextStatus ? <button type="button" onClick={() => void advance(selectedOrder)} disabled={updatingId !== null} aria-busy={updatingId === selectedOrder.id}>{updatingId === selectedOrder.id ? 'جارٍ التحديث...' : selectedNextStatus === 'ready' ? 'نقل إلى جاهز' : 'تم التسليم'}</button> : <p role="status">لا يوجد انتقال حالة متاح لهذا الطلب.</p>}
        </footer>
      </aside> : null}
    </section> : null}
  </main></div>
}

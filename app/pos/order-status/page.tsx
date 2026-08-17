'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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

export default function PosOrderStatusPage() {
  const router = useRouter()
  const access = usePageAccess({ allowedRoles: [...POS_ACCESS_ROLES], redirectIfNoUser: '/pos/login', redirectIfForbidden: '/pos' })
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)

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

  return <div className="pos-invoice-history pos-order-status-workflow" dir="rtl"><main>
    <header className="pos-history-header"><div className="pos-history-heading"><span><WorkflowIcon /></span><div><h1>حالة الطلبات</h1><p>متابعة الطلبات ضمن سير العمل التشغيلي</p></div></div><button type="button" onClick={() => router.push('/pos')} aria-label="العودة إلى نقطة البيع">←</button></header>
    <div className="pos-history-tools"><p>الانتقالات المتاحة فقط: قيد التنفيذ ← جاهز ← تم التسليم</p><button type="button" onClick={() => void loadOrders()} disabled={loading}>تحديث</button></div>
    {error ? <div className="pos-history-error" role="alert"><p>{error}</p><button type="button" onClick={() => void loadOrders()}>إعادة المحاولة</button></div> : null}
    {loading && orders.length === 0 ? <div className="pos-history-grid" aria-label="جارٍ تحميل حالة الطلبات">{[1, 2, 3].map((item) => <div className="pos-history-skeleton" key={item} />)}</div> : null}
    {!loading && !error && orders.length === 0 ? <section className="pos-history-empty"><WorkflowIcon /><h2>لا توجد طلبات تشغيلية حالية</h2><p>ستظهر الطلبات قيد التنفيذ أو الجاهزة هنا.</p></section> : null}
    {!error && orders.length > 0 ? <section className="pos-status-columns" aria-label="حالة الطلبات التشغيلية">{(['in_progress', 'ready'] as const).map((status) => <section key={status} className="pos-status-column"><header><span className={ORDER_STATUS_MAP[status].className}>{ORDER_STATUS_MAP[status].label}</span><b>{columns[status].length}</b></header><div>{columns[status].map((order) => <article className="pos-history-card" key={order.id}><div className="pos-history-card-top"><div><small>رقم الطلب</small><strong dir="ltr">{order.order_number}</strong></div><span>{ORDER_STATUS_MAP[order.status].label}</span></div><dl><div className="is-customer"><dt>العميل</dt><dd>{order.customer_name || 'عميل نقدي'}</dd></div><div><dt>التاريخ والوقت</dt><dd>{formatPosGregorianDateTime(order.created_at)}</dd></div><div className="is-total"><dt>الإجمالي</dt><dd>{formatCurrency(order.total)}</dd></div></dl><button type="button" onClick={() => void advance(order)} disabled={updatingId === order.id}>{updatingId === order.id ? 'جارٍ التحديث...' : order.status === 'in_progress' ? 'نقل إلى جاهز' : 'تم التسليم'}</button></article>)}</div></section>)}</section> : null}
    {!error && hasMore ? <div className="pos-history-more"><button type="button" onClick={() => void loadOrders(page + 1)} disabled={loading}>{loading ? 'جارٍ التحميل...' : 'تحميل المزيد'}</button></div> : null}
  </main></div>
}

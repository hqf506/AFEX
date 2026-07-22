'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PosMobileBottomNavigation } from '@/components/pos-mobile-bottom-navigation'
import { usePageAccess } from '@/hooks/use-page-access'
import { getClientErrorMessage } from '@/lib/api/client-error'
import {
  mapOrderSummaryToOrderRecord,
  type OrderRecord,
} from '@/lib/orders/orders-page'
import {
  normalizeOrderRecord,
  type OrderSourceRow,
  type OrderStatus,
} from '@/lib/orders/normalize'
import { POS_ACCESS_ROLES } from '@/lib/permissions'
import { supabase } from '@/lib/supabase/client'

type ActiveOrderStatus = Extract<OrderStatus, 'in_progress' | 'ready'>

const ACTIVE_ORDER_STATUSES = new Set<ActiveOrderStatus>(['in_progress', 'ready'])
const ORDERS_PAGE_SIZE = 100

const STATUS_UI: Record<
  ActiveOrderStatus,
  { label: string; badgeClassName: string; dotClassName: string }
> = {
  in_progress: {
    label: 'قيد التجهيز',
    badgeClassName: 'bg-cyan-300/10 text-cyan-100',
    dotClassName: 'bg-cyan-300',
  },
  ready: {
    label: 'جاهز للتسليم',
    badgeClassName: 'bg-emerald-400/10 text-emerald-100',
    dotClassName: 'bg-emerald-300',
  },
}

function isActiveOrderStatus(status: OrderStatus): status is ActiveOrderStatus {
  return ACTIVE_ORDER_STATUSES.has(status as ActiveOrderStatus)
}

function formatRelativeOrderTime(value: string, now: number) {
  const createdAt = new Date(value).getTime()
  if (!Number.isFinite(createdAt)) return 'وقت غير محدد'

  const elapsedMinutes = Math.max(0, Math.floor((now - createdAt) / 60_000))
  if (elapsedMinutes < 1) return 'الآن'
  if (elapsedMinutes < 60) return `منذ ${elapsedMinutes} دقيقة`

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `منذ ${elapsedHours} ساعة`

  return new Intl.DateTimeFormat('ar-SA', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(createdAt))
}

function ClipboardStatusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden="true">
      <path d="M9 5h6M9 3h6v4H9zM7 5H5v16h14V5h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m8 14 2 2 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RefreshIcon({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`h-5 w-5 ${spinning ? 'animate-spin' : ''}`} aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function PosOrderStatusPage() {
  const router = useRouter()
  const access = usePageAccess({
    allowedRoles: [...POS_ACCESS_ROLES],
    redirectIfNoUser: '/pos/login',
    redirectIfForbidden: '/pos',
  })
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [pageError, setPageError] = useState('')
  const [orderErrors, setOrderErrors] = useState<Record<string, string>>({})
  const [updatingOrderIds, setUpdatingOrderIds] = useState<Record<string, boolean>>({})
  const [exitingOrderIds, setExitingOrderIds] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const updatingOrderIdsRef = useRef(new Set<string>())

  const loadOrders = useCallback(async () => {
    if (!access.allowed || !access.tenantId || !access.branchId) return

    setLoading(true)
    setPageError('')

    try {
      const searchParams = new URLSearchParams({
        page: '1',
        pageSize: ORDERS_PAGE_SIZE.toString(),
        listFilter: 'all',
      })
      const response = await fetch(`/api/orders?${searchParams.toString()}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      })
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        throw new Error(getClientErrorMessage(result, 'تعذر تحميل الطلبات الحالية.'))
      }

      const rows = Array.isArray(result.items) ? (result.items as OrderSourceRow[]) : []
      const nextOrders = rows
        .map((row, index) => normalizeOrderRecord(row, index))
        .map(mapOrderSummaryToOrderRecord)
        .filter((order) => isActiveOrderStatus(order.status))
        .sort((first, second) => Date.parse(first.created_at) - Date.parse(second.created_at))

      setOrders(nextOrders)
      setLastRefreshedAt(new Date())
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'تعذر تحميل الطلبات الحالية.')
    } finally {
      setLoading(false)
    }
  }, [access.allowed, access.branchId, access.tenantId])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadOrders()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadOrders])

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(intervalId)
  }, [])

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ar')
    if (!query) return orders

    return orders.filter((order) => {
      return (
        order.order_number.toLocaleLowerCase('ar').includes(query) ||
        order.customer_name.toLocaleLowerCase('ar').includes(query)
      )
    })
  }, [orders, search])

  const sendStatusWhatsApp = async (orderId: string, status: 'ready' | 'closed') => {
    const response = await fetch('/api/whatsapp/send', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'text',
        mode: 'text',
        notification: {
          orderId,
          status,
          channel: 'whatsapp',
        },
      }),
    })
    const result = await response.json().catch(() => null)

    if (!response.ok || !result?.success) {
      throw new Error('تم تحديث الحالة، لكن تعذر إرسال إشعار واتساب.')
    }
  }

  const updateOrderStatus = async (order: OrderRecord, nextStatus: 'ready' | 'closed') => {
    if (
      updatingOrderIdsRef.current.has(order.id) ||
      !access.tenantId ||
      !access.branchId ||
      (order.status === 'in_progress' && nextStatus !== 'ready') ||
      (order.status === 'ready' && nextStatus !== 'closed') ||
      !isActiveOrderStatus(order.status)
    ) {
      return
    }

    updatingOrderIdsRef.current.add(order.id)
    setUpdatingOrderIds((current) => ({ ...current, [order.id]: true }))
    setOrderErrors((current) => ({ ...current, [order.id]: '' }))

    const currentStatus = order.status
    const { data: updatedOrder, error } = await supabase
      .from('orders')
      .update({ status: nextStatus })
      .eq('id', order.id)
      .eq('tenant_id', access.tenantId)
      .eq('branch_id', access.branchId)
      .eq('status', currentStatus)
      .select('id, status')
      .maybeSingle()

    if (error || !updatedOrder || updatedOrder.status !== nextStatus) {
      setOrderErrors((current) => ({ ...current, [order.id]: 'تعذر تحديث حالة الطلب. حاول مرة أخرى.' }))
      updatingOrderIdsRef.current.delete(order.id)
      setUpdatingOrderIds((current) => ({ ...current, [order.id]: false }))
      return
    }

    if (nextStatus === 'closed') {
      setExitingOrderIds((current) => ({ ...current, [order.id]: true }))
      window.setTimeout(() => {
        setOrders((current) => current.filter((item) => item.id !== order.id))
        setExitingOrderIds((current) => ({ ...current, [order.id]: false }))
      }, 180)
    } else {
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: 'ready' } : item))
    }

    try {
      await sendStatusWhatsApp(order.id, nextStatus)
    } catch (notificationError) {
      setPageError(notificationError instanceof Error ? notificationError.message : 'تم تحديث الحالة، لكن تعذر إرسال إشعار واتساب.')
    } finally {
      updatingOrderIdsRef.current.delete(order.id)
      setUpdatingOrderIds((current) => ({ ...current, [order.id]: false }))
    }
  }

  if (access.loading || !access.allowed) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-[#020817] text-sm font-black text-cyan-100">جارٍ التحقق من الصلاحية...</div>
    )
  }

  const hasBranchContext = Boolean(access.tenantId && access.branchId)

  return (
    <div className="fixed inset-0 h-[100svh] overflow-hidden bg-[#020817] text-white [direction:rtl]">
      <style jsx global>{`
        @keyframes pos-order-status-exit {
          to { opacity: 0; transform: translateY(-8px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .pos-order-status-page *,
          .pos-order-status-page *::before,
          .pos-order-status-page *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_8%,rgba(34,211,238,0.12),transparent_30%),linear-gradient(180deg,#020817_0%,#041224_56%,#020817_100%)]" />
      <main className="pos-order-status-page relative h-full overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-5xl">
          <header className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] bg-cyan-300/10 text-cyan-300 shadow-[0_0_22px_rgba(34,211,238,0.10),inset_0_0_0_1px_rgba(34,211,238,0.24)]"><ClipboardStatusIcon /></span>
              <div>
                <h1 className="text-[26px] font-black leading-tight text-white sm:text-3xl">حالة الطلبات</h1>
                <p className="mt-1 text-sm font-bold text-slate-400">طلبات فرعك الحالي</p>
              </div>
            </div>
            <button type="button" onClick={() => router.push('/pos')} className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] bg-white/[0.035] text-xl text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 active:scale-95" aria-label="العودة إلى نقطة البيع">←</button>
          </header>

          <div className="mt-6 flex gap-3">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">ابحث برقم الطلب أو اسم العميل</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث برقم الطلب أو اسم العميل" className="h-14 w-full rounded-[19px] border-0 bg-white/[0.04] px-4 pl-12 text-right text-sm font-bold text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.14)] outline-none placeholder:text-slate-500 focus:shadow-[0_0_18px_rgba(34,211,238,0.08),inset_0_0_0_1px_rgba(34,211,238,0.38)]" />
            </label>
            <button type="button" onClick={() => void loadOrders()} disabled={loading || !hasBranchContext} className="grid h-14 w-14 shrink-0 place-items-center rounded-[19px] bg-cyan-300/10 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 disabled:text-slate-600" aria-label="تحديث الطلبات"><RefreshIcon spinning={loading} /></button>
          </div>

          {!hasBranchContext ? <p className="mt-4 rounded-[18px] bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-100">لا يمكن عرض الطلبات دون فرع مرتبط بالحساب.</p> : null}
          {pageError ? <p role="alert" className="mt-4 rounded-[18px] bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.18)]">{pageError}</p> : null}

          {loading && orders.length === 0 ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="h-44 animate-pulse rounded-[22px] bg-white/[0.04]" /><div className="h-44 animate-pulse rounded-[22px] bg-white/[0.04]" /></div>
          ) : filteredOrders.length === 0 ? (
            <section className="mt-8 flex min-h-64 flex-col items-center justify-center rounded-[24px] bg-white/[0.025] px-5 text-center shadow-[inset_0_0_0_1px_rgba(34,211,238,0.10)]">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-cyan-300/[0.06] text-cyan-200"><ClipboardStatusIcon /></span>
              <h2 className="mt-4 text-xl font-black text-white">لا توجد طلبات حالية</h2>
              <p className="mt-2 text-sm font-bold text-slate-400">{search.trim() ? 'لا توجد نتائج مطابقة للبحث.' : 'جميع الطلبات تم تسليمها'}</p>
              {lastRefreshedAt ? <p className="mt-4 text-xs font-bold text-slate-500">آخر تحديث: {new Intl.DateTimeFormat('ar-SA', { hour: '2-digit', minute: '2-digit' }).format(lastRefreshedAt)}</p> : null}
            </section>
          ) : (
            <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredOrders.map((order) => {
                if (!isActiveOrderStatus(order.status)) return null
                const statusUi = STATUS_UI[order.status]
                const updating = Boolean(updatingOrderIds[order.id])
                const preparing = order.status === 'in_progress'

                return (
                  <article key={order.id} className={`rounded-[22px] bg-white/[0.035] p-4 shadow-[0_16px_42px_rgba(0,0,0,0.16),inset_0_0_0_1px_rgba(34,211,238,0.12)] ${exitingOrderIds[order.id] ? 'animate-[pos-order-status-exit_180ms_ease-in_forwards]' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="break-words text-lg font-black text-white [overflow-wrap:anywhere]">{order.order_number}</p><p className="mt-1 truncate text-sm font-bold text-slate-300">{order.customer_name || 'بدون اسم'}</p><p className="mt-1 text-xs font-bold text-slate-500">{formatRelativeOrderTime(order.created_at, now)}</p></div>
                      <span className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${statusUi.badgeClassName}`}><span className={`h-1.5 w-1.5 rounded-full ${statusUi.dotClassName}`} />{statusUi.label}</span>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-2.5">
                      <button type="button" onClick={() => void updateOrderStatus(order, 'ready')} disabled={!preparing || updating} className={`min-h-[50px] rounded-[17px] px-2 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 disabled:cursor-not-allowed ${preparing && !updating ? 'bg-cyan-300/15 text-cyan-50 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.45)] active:scale-[0.98]' : 'bg-white/[0.025] text-slate-500 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.10)]'}`}>{!preparing ? '✓ تم التجهيز' : updating ? 'جارٍ التحديث...' : 'تم التجهيز'}</button>
                      <button type="button" onClick={() => void updateOrderStatus(order, 'closed')} disabled={preparing || updating} className={`min-h-[50px] rounded-[17px] px-2 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/70 disabled:cursor-not-allowed ${!preparing && !updating ? 'bg-emerald-400/15 text-emerald-50 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.42)] active:scale-[0.98]' : 'bg-white/[0.025] text-slate-500 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.10)]'}`}>{updating ? 'جارٍ التحديث...' : 'تم التسليم'}</button>
                    </div>
                    {orderErrors[order.id] ? <p role="alert" className="mt-3 text-xs font-bold leading-5 text-red-200">{orderErrors[order.id]}</p> : null}
                  </article>
                )
              })}
            </section>
          )}
        </div>
        <div className="mx-auto mt-4 w-full max-w-md sm:hidden">
          <PosMobileBottomNavigation />
        </div>
      </main>
    </div>
  )
}

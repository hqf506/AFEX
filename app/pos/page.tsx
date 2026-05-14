'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { usePosTabletFrame } from '@/components/pos-tablet-frame'
import { usePageAccess } from '@/hooks/use-page-access'
import { useSystemSettings } from '@/hooks/use-system-settings'
import {
  createProtectedResourceAuthError,
  markProtectedResourcesUnauthorized,
  prefetchClientResource,
} from '@/lib/client-resource-cache'
import { prefetchBranchInvoiceCatalog } from '@/lib/invoices/catalog'
import {
  mapOrderSummaryToOrderRecord,
  type OrderRecord,
} from '@/lib/orders/orders-page'
import {
  normalizeOrderRecord,
  type OrderSourceRow,
  type OrderStatus,
} from '@/lib/orders/normalize'
import { formatCurrency } from '@/lib/orders/format'
import {
  clearActivePosEmployee,
  readActivePosEmployee,
  type ActivePosEmployee,
} from '@/lib/pos-employee-session'
import {
  getPosOfflineDraftSyncState,
  POS_OFFLINE_DRAFTS_SYNC_EVENT,
  POS_OFFLINE_DRAFTS_UPDATED_EVENT,
  type PosOfflineDraftSyncState,
} from '@/lib/pos-offline-draft'
import { supabase } from '@/lib/supabase/client'

const ADMIN_CATEGORIES_CACHE_KEY = 'admin-categories'
const ADMIN_CATEGORIES_CACHE_TTL_MS = 60_000
const POS_HOME_ORDERS_PAGE_SIZE = 100
const POS_CLICK_SOUND_COOLDOWN_MS = 140
let posClickSound: HTMLAudioElement | null = null
let lastPosClickSoundAt = 0

function getPosClickSound() {
  if (typeof window === 'undefined') {
    return null
  }

  if (!posClickSound) {
    posClickSound = new Audio('/sounds/click.wav')
    posClickSound.volume = 0.2
    posClickSound.preload = 'auto'
  }

  return posClickSound
}

function triggerPosClickFeedback() {
  if (typeof window === 'undefined') {
    return
  }

  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(10)
  }

  const now = Date.now()

  if (now - lastPosClickSoundAt < POS_CLICK_SOUND_COOLDOWN_MS) {
    return
  }

  lastPosClickSoundAt = now

  const clickSound = getPosClickSound()

  if (!clickSound) {
    return
  }

  clickSound.currentTime = 0
  void clickSound.play().catch(() => undefined)
}

const sidebarItems = [
  {
    label: 'الرئيسية',
    href: '/pos',
    active: true,
    disabled: false,
    icon: 'home' as const,
  },
  {
    label: 'بيانات العميل',
    href: '/pos/sale/customer',
    active: false,
    disabled: true,
    icon: 'user' as const,
  },
  {
    label: 'العناصر',
    href: '/pos/sale/items',
    active: false,
    disabled: true,
    icon: 'package' as const,
  },
  {
    label: 'الدفع',
    href: '/pos/sale/checkout',
    active: false,
    disabled: true,
    icon: 'creditCard' as const,
  },
]

const orderStatusCards = [
  {
    status: 'in_progress' as const,
    label: 'قيد التنفيذ',
    description: 'طلبات تحت المعالجة',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    icon: 'clock' as const,
  },
  {
    status: 'ready' as const,
    label: 'جاهز',
    description: 'طلبات جاهزة للتسليم',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: 'checkCircle' as const,
  },
  {
    status: 'closed' as const,
    label: 'تم تسليم',
    description: 'طلبات مكتملة',
    className: 'border-slate-300 bg-slate-100 text-slate-700',
    icon: 'truck' as const,
  },
] as const

type PosKanbanStatus = 'in_progress' | 'ready' | 'closed'
type PosKanbanTransitionStatus = Exclude<PosKanbanStatus, 'closed'>

const STATUS_TRANSITIONS: Record<PosKanbanTransitionStatus, PosKanbanStatus> = {
  in_progress: 'ready',
  ready: 'closed',
}

const POS_KANBAN_STATUSES = new Set<PosKanbanStatus>([
  'in_progress',
  'ready',
  'closed',
])

const POS_ORDER_STATUS_UI: Record<
  'in_progress' | 'ready' | 'closed',
  {
    label: string
    emptyLabel: string
    nextActionLabel?: string
    badgeClassName: string
    columnClassName: string
    dotClassName: string
  }
> = {
  in_progress: {
    label: 'قيد التنفيذ',
    emptyLabel: 'لا توجد طلبات قيد التنفيذ',
    nextActionLabel: 'نقل إلى جاهز',
    badgeClassName: 'bg-amber-100 text-amber-700',
    columnClassName: 'bg-amber-50',
    dotClassName: 'bg-amber-500',
  },
  ready: {
    label: 'جاهز',
    emptyLabel: 'لا توجد طلبات جاهزة',
    nextActionLabel: 'نقل إلى تم تسليم',
    badgeClassName: 'bg-emerald-100 text-emerald-700',
    columnClassName: 'bg-emerald-50',
    dotClassName: 'bg-emerald-500',
  },
  closed: {
    label: 'تم تسليم',
    emptyLabel: 'لا توجد طلبات بهذه الحالة',
    badgeClassName: 'bg-slate-200 text-slate-700',
    columnClassName: 'bg-slate-100',
    dotClassName: 'bg-slate-500',
  },
}

type IconName =
  | 'checkCircle'
  | 'clipboard'
  | 'clock'
  | 'creditCard'
  | 'home'
  | 'package'
  | 'shoppingCart'
  | 'truck'
  | 'user'
  | 'zap'

function PosIcon({
  name,
  className = 'h-5 w-5',
}: {
  name: IconName
  className?: string
}) {
  const props = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  }

  switch (name) {
    case 'home':
      return (
        <svg {...props}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
          <path d="M9.5 21v-6h5v6" />
        </svg>
      )
    case 'user':
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      )
    case 'package':
      return (
        <svg {...props}>
          <path d="m7.5 4.5 9 5" />
          <path d="m16.5 4.5-9 5" />
          <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z" />
          <path d="M12 12v9" />
        </svg>
      )
    case 'clipboard':
      return (
        <svg {...props}>
          <rect x="5" y="4" width="14" height="17" rx="2.5" />
          <path d="M9 4.5V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v.5" />
          <path d="M9 9h6" />
          <path d="M9 13h6" />
          <path d="M9 17h3" />
        </svg>
      )
    case 'creditCard':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="M3 10h18" />
          <path d="M7 15h3" />
        </svg>
      )
    case 'shoppingCart':
      return (
        <svg {...props}>
          <path d="M4 5h2l2 10h9.5l2-7H7" />
          <circle cx="10" cy="20" r="1.3" />
          <circle cx="17" cy="20" r="1.3" />
        </svg>
      )
    case 'clock':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      )
    case 'checkCircle':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m8.5 12.2 2.3 2.3 4.8-5" />
        </svg>
      )
    case 'truck':
      return (
        <svg {...props}>
          <path d="M3 7h11v8H3z" />
          <path d="M14 10h3l3 3v2h-6v-5Z" />
          <circle cx="7" cy="18" r="1.7" />
          <circle cx="17" cy="18" r="1.7" />
        </svg>
      )
    case 'zap':
      return (
        <svg {...props}>
          <path d="M13 2 5 13h5l-1 9 8-11h-5l1-9Z" />
        </svg>
      )
  }
}

function TabletOrientationIcon({
  mode,
  className = 'h-4 w-4',
}: {
  mode: 'portrait' | 'landscape'
  className?: string
}) {
  const isPortrait = mode === 'portrait'

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect
        x={isPortrait ? 7 : 4}
        y={isPortrait ? 3 : 6}
        width={isPortrait ? 10 : 16}
        height={isPortrait ? 18 : 12}
        rx="2.5"
      />
      <circle cx="12" cy={isPortrait ? 18 : 12} r="0.8" fill="currentColor" stroke="none" />
    </svg>
  )
}

function resolvePosKanbanStatus(status: OrderStatus): PosKanbanStatus | null {
  return POS_KANBAN_STATUSES.has(status as PosKanbanStatus)
    ? (status as PosKanbanStatus)
    : null
}

function getNextPosOrderStatus(
  status: OrderStatus
): PosKanbanStatus | null {
  const kanbanStatus = resolvePosKanbanStatus(status)

  if (!kanbanStatus || kanbanStatus === 'closed') {
    return null
  }

  return STATUS_TRANSITIONS[kanbanStatus]
}

function getPosEmployeeDisplayName(employee: ActivePosEmployee | null) {
  return employee?.full_name?.trim() || employee?.username?.trim() || 'غير محدد'
}

export default function PosPage() {
  const router = useRouter()
  const pathname = usePathname()
  const tabletFrame = usePosTabletFrame()
  const isPosLoginPage = pathname?.startsWith('/pos/login') ?? false
  const [loggingOut, setLoggingOut] = useState(false)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState('')
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null)
  const [activePosEmployee, setActivePosEmployee] =
    useState<ActivePosEmployee | null>(null)
  const [offlineDraftSyncState, setOfflineDraftSyncState] =
    useState<PosOfflineDraftSyncState>({
      draftsCount: 0,
      isSyncing: false,
    })
  const access = usePageAccess({
    allowedRoles: ['admin', 'employee'],
    redirectIfNoUser: '/pos/login',
    redirectIfForbidden: '/pos/login',
  })
  const { settings } = useSystemSettings(
    !isPosLoginPage && !access.loading && access.allowed
  )

  const storeName = settings?.store_name?.trim() || 'AFEX POS'
  const orderStatusCounts = useMemo(
    () => ({
      in_progress: orders.filter(
        (order) => resolvePosKanbanStatus(order.status) === 'in_progress'
      ).length,
      ready: orders.filter(
        (order) => resolvePosKanbanStatus(order.status) === 'ready'
      ).length,
      closed: orders.filter(
        (order) => resolvePosKanbanStatus(order.status) === 'closed'
      ).length,
    }),
    [orders]
  )
  const visibleKanbanOrdersCount =
    orderStatusCounts.in_progress +
    orderStatusCounts.ready +
    orderStatusCounts.closed
  const showKanbanStartPrompt =
    !ordersLoading && !ordersError && visibleKanbanOrdersCount === 0

  useEffect(() => {
    if (!access.allowed || isPosLoginPage) {
      return
    }

    setActivePosEmployee(readActivePosEmployee())
  }, [access.allowed, isPosLoginPage])

  useEffect(() => {
    const refreshOfflineDraftState = () => {
      setOfflineDraftSyncState(getPosOfflineDraftSyncState())
    }

    const handleOfflineDraftEvent = (event: Event) => {
      const detail = (event as CustomEvent<PosOfflineDraftSyncState>).detail
      setOfflineDraftSyncState(detail || getPosOfflineDraftSyncState())
    }

    refreshOfflineDraftState()
    window.addEventListener(
      POS_OFFLINE_DRAFTS_UPDATED_EVENT,
      handleOfflineDraftEvent
    )
    window.addEventListener(
      POS_OFFLINE_DRAFTS_SYNC_EVENT,
      handleOfflineDraftEvent
    )

    return () => {
      window.removeEventListener(
        POS_OFFLINE_DRAFTS_UPDATED_EVENT,
        handleOfflineDraftEvent
      )
      window.removeEventListener(
        POS_OFFLINE_DRAFTS_SYNC_EVENT,
        handleOfflineDraftEvent
      )
    }
  }, [])

  useEffect(() => {
    if (!access.allowed || isPosLoginPage) {
      return
    }

    router.prefetch('/pos/sale/customer')
    router.prefetch('/pos/sale/items')
    router.prefetch('/pos/sale/checkout')

    void prefetchClientResource(
      ADMIN_CATEGORIES_CACHE_KEY,
      async () => {
        const response = await fetch('/api/admin/categories', {
          method: 'GET',
          cache: 'no-store',
        })

        if (response.status === 401) {
          markProtectedResourcesUnauthorized()
          throw createProtectedResourceAuthError()
        }

        const result = await response.json().catch(() => null)

        if (!response.ok || !result) {
          throw new Error(result?.details || result?.error || 'Failed to load categories')
        }

        return Array.isArray(result.categories) ? result.categories : []
      },
      {
        ttlMs: ADMIN_CATEGORIES_CACHE_TTL_MS,
        logLabel: 'fetch categories',
        protectedResource: true,
      }
    )

    if (access.scopeType === 'branch' && access.branchId) {
      void prefetchBranchInvoiceCatalog(access.branchId)
    }
  }, [access.allowed, access.branchId, access.scopeType, isPosLoginPage, router])

  useEffect(() => {
    if (!access.allowed || isPosLoginPage) {
      return
    }

    let cancelled = false

    const fetchOrders = async () => {
      setOrdersLoading(true)
      setOrdersError('')

      try {
        const searchParams = new URLSearchParams()
        searchParams.set('page', '1')
        searchParams.set('pageSize', POS_HOME_ORDERS_PAGE_SIZE.toString())

        if (access.scopeType === 'system' && access.branchId) {
          searchParams.set('branchId', access.branchId)
        }

        const response = await fetch(`/api/orders?${searchParams.toString()}`, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        })

        const result = await response.json().catch(() => null)

        if (!response.ok || !result?.success) {
          throw new Error(result?.message || 'تعذر تحميل الطلبات')
        }

        const rows = Array.isArray(result.items)
          ? (result.items as OrderSourceRow[])
          : []
        const nextOrders = rows
          .map((row, index) => normalizeOrderRecord(row, index))
          .map(mapOrderSummaryToOrderRecord)

        if (!cancelled) {
          setOrders(nextOrders)
        }
      } catch (error) {
        if (!cancelled) {
          setOrders([])
          setOrdersError(
            error instanceof Error ? error.message : 'تعذر تحميل الطلبات'
          )
        }
      } finally {
        if (!cancelled) {
          setOrdersLoading(false)
        }
      }
    }

    void fetchOrders()

    return () => {
      cancelled = true
    }
  }, [access.allowed, access.branchId, access.scopeType, isPosLoginPage])

  const handleAdvanceOrderStatus = async (order: OrderRecord) => {
    const currentStatus = resolvePosKanbanStatus(order.status)
    const nextStatus = getNextPosOrderStatus(order.status)

    if (!currentStatus || !nextStatus || updatingOrderId) {
      if (!currentStatus) {
        console.error('[POS KANBAN] Refused order status update for unknown status.', {
          orderId: order.id,
          orderNumber: order.order_number,
          currentStatus: order.status,
        })
      }
      return
    }

    if (!access.tenantId) {
      console.error('[POS KANBAN] Refused order status update without tenant id.', {
        orderId: order.id,
        orderNumber: order.order_number,
        currentStatus,
        nextStatus,
      })
      setOrdersError('تعذر تحديد نطاق المنشأة لتحديث الطلب')
      return
    }

    const updatePayload = { status: nextStatus }

    triggerPosClickFeedback()
    setUpdatingOrderId(order.id)
    setOrdersError('')

    const { error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', order.id)
      .eq('tenant_id', access.tenantId)

    if (error) {
      console.error('[POS KANBAN] Failed to update order status.', {
        orderId: order.id,
        orderNumber: order.order_number,
        tenantId: access.tenantId,
        currentStatus,
        payload: updatePayload,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      })
      setOrdersError(`تعذر تحديث حالة الطلب ${order.order_number}`)
      setUpdatingOrderId(null)
      return
    }

    setOrders((currentOrders) =>
      currentOrders.map((currentOrder) =>
        currentOrder.id === order.id
          ? { ...currentOrder, status: nextStatus }
          : currentOrder
      )
    )
    setUpdatingOrderId(null)
  }

  const handleLogout = async () => {
    try {
      setLoggingOut(true)
      clearActivePosEmployee()
      await supabase.auth.signOut()
    } finally {
      clearActivePosEmployee()
      window.location.href = '/pos/login'
    }
  }

  const handleSwitchEmployee = () => {
    clearActivePosEmployee()
    setActivePosEmployee(null)
    router.push('/pos/employee-pin')
  }

  const handleStartSale = () => {
    triggerPosClickFeedback()
    router.push('/pos/sale/customer')
  }

  if (access.authError === 'timeout') {
    console.warn('[POS PAGE] auth timeout', pathname, access.authStatus)
    return (
      <div className="page-card space-y-4 text-right">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">تعذر تجهيز نقطة البيع</h2>
          <p className="mt-1 text-sm text-slate-600">تحقق من تسجيل الدخول أو أعد المحاولة</p>
        </div>
        <button
          type="button"
          onClick={() => {
            window.location.href = '/pos/login'
          }}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          تسجيل الدخول
        </button>
      </div>
    )
  }

  if (access.loading || !access.allowed) {
    return <div className="page-card">جاري تحميل نقطة البيع...</div>
  }

  return (
    <div className="flex h-full w-full min-h-0 min-w-0 flex-col bg-slate-50">
      <div className="grid h-full min-h-0 gap-2 rounded-[28px] border border-slate-200 bg-white p-2 shadow-sm md:gap-3 md:p-3 lg:[direction:ltr] lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-4">
        <main className="order-2 min-w-0 lg:order-1 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden lg:[direction:rtl]">
          <div className="flex h-full min-h-0 flex-col gap-5">
            <div className="space-y-5">
              <div className="flex flex-col items-start gap-3 rounded-[24px] bg-slate-50/80 p-3 md:p-4 sm:flex-row">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                  <PosIcon name="zap" className="h-6 w-6" />
                </div>

                <div className="min-w-0">
                  <h2 className="break-words text-2xl font-black tracking-tight text-slate-950">{storeName}</h2>
                  <p className="mt-1 text-sm leading-7 text-slate-400">
                    لوحة تشغيل خفيفة وسريعة للوصول إلى البيع اليومي والفواتير الحالية.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleStartSale}
                className="group flex h-20 w-full items-center justify-between gap-4 rounded-2xl bg-[#0B1B34] px-5 text-right text-white shadow-sm transition-all duration-150 hover:scale-[1.01] hover:bg-[#0B1B34]/95 active:scale-[0.98]"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/30 text-white transition-all duration-150 group-hover:translate-x-1 group-hover:scale-105 group-hover:rotate-[2deg] group-active:scale-95">
                    <PosIcon name="shoppingCart" className="h-6 w-6" />
                  </div>

                  <div className="min-w-0">
                    <div className="text-xl font-black text-white md:text-2xl">بدء البيع</div>
                    <div className="text-sm text-white/70">ابدأ فاتورة جديدة بسرعة</div>
                  </div>
                </div>

                <span className="rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-base font-semibold text-white/85 shadow-inner transition-colors duration-150 group-hover:bg-white/15">
                  ابدأ الآن
                </span>
              </button>

              <div className="rounded-[24px] bg-slate-50/70 p-3 shadow-sm ring-1 ring-slate-100 md:p-4">
                <div className="mb-3">
                  <h3 className="text-lg font-extrabold text-slate-950">حالة الطلبات</h3>
                  <p className="mt-1 text-sm text-slate-500">تحديث حالة الطلبات بسرعة من شاشة POS</p>
                </div>

                {ordersError ? (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                    {ordersError}
                  </div>
                ) : null}

                {showKanbanStartPrompt ? (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-3 text-right">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                        <PosIcon name="clipboard" className="h-5 w-5" />
                      </span>

                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-800">
                          لا توجد طلبات حالياً
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-400">
                          ابدأ أول عملية بيع
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleStartSale}
                      className="shrink-0 rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold text-white transition-all duration-150 hover:scale-105 hover:bg-slate-800 active:scale-95"
                    >
                      بدء البيع
                    </button>
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-3 gap-5">
                  {orderStatusCards.map((statusCard) => {
                    const statusOrders = orders.filter(
                      (order) => resolvePosKanbanStatus(order.status) === statusCard.status
                    )
                    const statusUi = POS_ORDER_STATUS_UI[statusCard.status]

                    return (
                        <div
                          key={`kanban-${statusCard.status}`}
                          className={`group/kanban flex min-h-[280px] min-w-0 flex-col gap-2 rounded-2xl p-2 ${statusUi.columnClassName}`}
                        >
                          <div className="flex min-h-[44px] items-center justify-between gap-2 border-b border-slate-200 px-1 pb-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/70 text-gray-500 opacity-70 ring-1 ring-white/70 transition-opacity duration-150 group-hover/kanban:opacity-100">
                              <PosIcon
                                name={statusCard.icon}
                                className="h-4 w-4 text-gray-500"
                              />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-950">
                                {statusUi.label}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                              <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                                {orderStatusCounts[statusCard.status]} طلب
                              </span>
                            {ordersLoading ? (
                              <span className="text-[11px] font-semibold text-slate-400">
                                تحميل...
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {ordersLoading ? (
                          <div className="space-y-2">
                            {Array.from({ length: 3 }).map((_, index) => (
                              <div
                                key={`${statusCard.status}-skeleton-${index}`}
                                className="h-[112px] animate-pulse rounded-lg border border-slate-200 bg-white/80"
                              />
                            ))}
                          </div>
                        ) : statusOrders.length === 0 ? (
                            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 py-6 text-center text-slate-400 opacity-75">
                              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 ring-1 ring-white/80">
                                <PosIcon name="clipboard" className="h-5 w-5" />
                              </span>
                              <span className="text-xs font-semibold">
                                لا توجد طلبات
                              </span>
                            </div>
                          ) : (
                            <div className="flex max-h-[280px] flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                            {statusOrders.map((order) => {
                              const nextStatus = getNextPosOrderStatus(order.status)
                              const isUpdatingOrder = updatingOrderId === order.id

                              return (
                                <div
                                  key={order.id}
                                  className={`flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] ${
                                    isUpdatingOrder ? 'opacity-60' : 'opacity-100'
                                  }`}
                                  >
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="truncate text-sm font-black text-slate-950">
                                      {order.order_number}
                                    </p>
                                    <span
                                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusUi.badgeClassName}`}
                                    >
                                      {statusUi.label}
                                    </span>
                                  </div>

                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-sm font-black text-slate-950">
                                        {formatCurrency(order.total)}
                                      </p>

                                      {nextStatus ? (
                                        <button
                                          type="button"
                                          onClick={() => handleAdvanceOrderStatus(order)}
                                          disabled={isUpdatingOrder}
                                          className="h-8 rounded-md bg-slate-950 px-3 text-xs font-bold text-white transition hover:bg-slate-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                          {isUpdatingOrder
                                            ? 'جارٍ...'
                                            : order.status === 'in_progress'
                                              ? 'جاهز'
                                              : 'تم تسليم'}
                                        </button>
                                      ) : (
                                        <span className="text-xs text-slate-400">
                                          مكتمل
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

          </div>
        </main>

        <aside className="order-1 flex min-w-0 flex-col gap-3 lg:order-2 lg:h-full lg:border-l lg:border-slate-200 lg:pl-4 lg:[direction:rtl]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-[0.18em] text-slate-400">
                الرئيسية
              </p>
              <h1 className="mt-2 break-words text-2xl font-black text-slate-950">
                AFEX POS
              </h1>
            </div>

            {tabletFrame ? (
              <button
                type="button"
                onClick={tabletFrame.toggleMode}
                aria-label={
                  tabletFrame.mode === 'portrait'
                    ? 'تبديل إلى وضع العرض'
                    : 'تبديل إلى وضع الطول'
                }
                title={
                  tabletFrame.mode === 'portrait'
                    ? 'تبديل إلى وضع العرض'
                    : 'تبديل إلى وضع الطول'
                }
                className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-slate-700 transition-all duration-150 ease-out hover:scale-105 hover:bg-slate-200 active:scale-95 lg:flex ${
                  tabletFrame.mode === 'landscape'
                    ? 'bg-slate-300 ring-2 ring-slate-400'
                    : 'bg-slate-100'
                }`}
              >
                <TabletOrientationIcon mode={tabletFrame.mode} />
              </button>
            ) : null}
          </div>

          <div className="space-y-2">
            {sidebarItems.map((item) =>
              item.disabled ? (
                <div
                  key={item.href}
                  aria-disabled="true"
                  className="flex min-h-[52px] cursor-not-allowed items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-gray-500 opacity-75"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/60">
                    <PosIcon
                      name={item.icon}
                      className="h-5 w-5 text-gray-500"
                    />
                  </span>
                  <span>{item.label}</span>
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group relative flex min-h-[52px] origin-right items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 text-sm transition-all duration-150 hover:scale-[1.02] active:scale-95 ${
                    item.active
                      ? 'bg-slate-950 font-semibold text-white shadow-sm'
                      : 'bg-slate-100 font-medium text-gray-500 hover:bg-slate-200 hover:text-gray-700'
                  }`}
                >
                  {item.active ? (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-3 right-0 top-3 w-[3px] rounded-l-full bg-white/80"
                    />
                  ) : null}

                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-150 group-hover:scale-105 group-active:scale-95 ${
                      item.active ? 'bg-white/10' : 'bg-white/70'
                    }`}
                  >
                    <PosIcon
                      name={item.icon}
                      className={`${
                        item.active
                          ? 'h-[22px] w-[22px] text-white'
                          : 'h-5 w-5 text-gray-500 group-hover:text-gray-700'
                      }`}
                    />
                  </span>
                  <span>{item.label}</span>
                </Link>
              )
            )}
          </div>

          <div className="mt-auto space-y-3">
            <Link
              href="/pos/offline-drafts"
              className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 transition-all duration-150 hover:scale-[1.02] hover:bg-slate-50 active:scale-95"
            >
              <PosIcon name="clipboard" className="h-5 w-5 text-gray-500" />
              <span>المسودات</span>
            </Link>

            {offlineDraftSyncState.draftsCount > 0 ||
            offlineDraftSyncState.isSyncing ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                {offlineDraftSyncState.isSyncing
                  ? 'جارٍ المزامنة...'
                  : `يوجد ${offlineDraftSyncState.draftsCount} مسودات غير متزامنة`}
              </div>
            ) : null}

            {activePosEmployee ? (
              <div className="flex items-center justify-between gap-2 px-1 text-xs text-slate-500">
                <span className="min-w-0 truncate">
                  الموظف:{' '}
                  <span className="font-bold text-slate-700">
                    {getPosEmployeeDisplayName(activePosEmployee)}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={handleSwitchEmployee}
                  className="shrink-0 text-xs font-bold text-slate-700 underline-offset-4 transition hover:text-slate-950 hover:underline active:scale-[0.98]"
                >
                  تبديل
                </button>
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex min-h-[52px] w-full items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 text-base font-bold text-red-600 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loggingOut ? 'جارٍ تسجيل الخروج...' : 'تسجيل الخروج'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { usePageAccess } from '@/hooks/use-page-access'
import { useSystemSettings } from '@/hooks/use-system-settings'
import { getClientErrorMessage } from '@/lib/api/client-error'
import {
  createProtectedResourceAuthError,
  markProtectedResourcesUnauthorized,
  prefetchClientResource,
} from '@/lib/client-resource-cache'
import { INVOICE_CUSTOMER_STORAGE_KEY } from '@/lib/invoices/customer'
import {
  clearAllInvoiceCatalogCache,
  prefetchBranchInvoiceCatalog,
} from '@/lib/invoices/catalog'
import { INVOICE_SALE_ITEMS_STORAGE_KEY } from '@/lib/invoices/sale-draft'
import { INVOICE_SUCCESS_STORAGE_KEY } from '@/lib/invoices/success'
import {
  clearCompletedInvoiceSaleState,
  hasCompletedInvoiceSaleState,
} from '@/lib/invoices/sale-reset'
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
  markPosLoggedOut,
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
    id: 'home',
    label: 'الرئيسية',
    href: '/pos',
    active: true,
    disabled: false,
    icon: 'home' as const,
  },
  {
    id: 'new-sale',
    label: 'بيع جديد',
    href: '/pos/sale/customer',
    active: false,
    disabled: false,
    icon: 'shoppingCart' as const,
  },
  {
    id: 'products',
    label: 'المنتجات',
    href: '/pos/sale/items',
    active: false,
    disabled: true,
    icon: 'package' as const,
  },
  {
    id: 'customers',
    label: 'العملاء',
    href: '/pos/sale/customer',
    active: false,
    disabled: true,
    icon: 'user' as const,
  },
  {
    id: 'orders',
    label: 'الطلبات',
    href: '/pos',
    active: false,
    disabled: true,
    icon: 'clipboard' as const,
  },
  {
    id: 'payments',
    label: 'المدفوعات',
    href: '/pos/sale/checkout',
    active: false,
    disabled: true,
    icon: 'creditCard' as const,
  },
  {
    id: 'settings',
    label: 'الإعدادات',
    href: '/pos/offline-drafts',
    active: false,
    disabled: false,
    icon: 'settings' as const,
  },
]

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
    dotClassName: string
  }
> = {
  in_progress: {
    label: 'قيد التنفيذ',
    emptyLabel: 'لا توجد طلبات قيد التنفيذ',
    nextActionLabel: 'نقل إلى جاهز',
    badgeClassName: 'bg-[rgba(34,211,238,0.10)] text-cyan-100',
    dotClassName: 'bg-[#22D3EE]',
  },
  ready: {
    label: 'جاهز',
    emptyLabel: 'لا توجد طلبات جاهزة',
    nextActionLabel: 'نقل إلى تم تسليم',
    badgeClassName: 'bg-[rgba(34,211,238,0.08)] text-cyan-100',
    dotClassName: 'bg-cyan-200',
  },
  closed: {
    label: 'تم تسليم',
    emptyLabel: 'لا توجد طلبات بهذه الحالة',
    badgeClassName: 'bg-slate-300/10 text-slate-200',
    dotClassName: 'bg-slate-400',
  },
}

type IconName =
  | 'checkCircle'
  | 'clipboard'
  | 'clock'
  | 'creditCard'
  | 'home'
  | 'logout'
  | 'package'
  | 'shoppingCart'
  | 'settings'
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
    case 'settings':
      return (
        <svg {...props}>
          <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
          <path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.06.06a2.1 2.1 0 0 1-2.97 2.97l-.06-.06a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.66V21a2.1 2.1 0 0 1-4.2 0v-.1a1.8 1.8 0 0 0-1.08-1.65 1.8 1.8 0 0 0-2 .36l-.06.06a2.1 2.1 0 0 1-2.97-2.97l.06-.06a1.8 1.8 0 0 0 .36-2 1.8 1.8 0 0 0-1.66-1.1H2a2.1 2.1 0 0 1 0-4.2h.1a1.8 1.8 0 0 0 1.65-1.08 1.8 1.8 0 0 0-.36-2l-.06-.06a2.1 2.1 0 0 1 2.97-2.97l.06.06a1.8 1.8 0 0 0 2 .36h.01A1.8 1.8 0 0 0 9.45 2V2a2.1 2.1 0 0 1 4.2 0v.1a1.8 1.8 0 0 0 1.08 1.65 1.8 1.8 0 0 0 2-.36l.06-.06a2.1 2.1 0 0 1 2.97 2.97l-.06.06a1.8 1.8 0 0 0-.36 2v.01A1.8 1.8 0 0 0 21 9.45h.1a2.1 2.1 0 0 1 0 4.2H21a1.8 1.8 0 0 0-1.6 1.35Z" />
        </svg>
      )
    case 'logout':
      return (
        <svg {...props}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      )
  }
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
  return employee?.full_name?.trim() || employee?.username?.trim() || 'لم يُسجل الموظف'
}

function formatOrderTime(createdAt: string) {
  const date = new Date(createdAt)

  if (Number.isNaN(date.getTime())) {
    return '--:--'
  }

  return new Intl.DateTimeFormat('ar-SA', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function PosPage() {
  const router = useRouter()
  const pathname = usePathname()
  const isPosLoginPage = pathname?.startsWith('/pos/login') ?? false
  const [loggingOut, setLoggingOut] = useState(false)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState('')
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null)
  const [activePosEmployee, setActivePosEmployee] =
    useState<ActivePosEmployee | null>(null)
  const [currentNow, setCurrentNow] = useState(() => new Date())
  const [offlineDraftSyncState, setOfflineDraftSyncState] =
    useState<PosOfflineDraftSyncState>({
      draftsCount: 0,
      isSyncing: false,
    })
  const access = usePageAccess({
    allowedRoles: ['admin', 'employee', 'cashier'],
    redirectIfNoUser: '/pos/login',
    redirectIfForbidden: '/pos/login',
  })
  const { settings } = useSystemSettings(
    !isPosLoginPage && !access.loading && access.allowed
  )

  const storeName = settings?.store_name?.trim() || 'AFEX POS'
  const branchName = settings?.branch_name?.trim() || storeName
  const employeeDisplayName = getPosEmployeeDisplayName(activePosEmployee)
  const resolvedPosBranchId =
    activePosEmployee?.branch_id ||
    (access.scopeType === 'branch' ? access.branchId : null)
  const recentOrders = orders.slice(0, 6)
  const mobileOrderStatusSummary = [
    {
      status: 'in_progress' as const,
      count: orders.filter((order) => order.status === 'in_progress').length,
    },
    {
      status: 'ready' as const,
      count: orders.filter((order) => order.status === 'ready').length,
    },
    {
      status: 'closed' as const,
      count: orders.filter((order) => order.status === 'closed').length,
    },
  ]
  const dayName = new Intl.DateTimeFormat('ar-SA', {
    weekday: 'long',
  }).format(currentNow)
  const dateLabel = new Intl.DateTimeFormat('ar-SA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(currentNow)
  const timeLabel = new Intl.DateTimeFormat('ar-SA', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(currentNow)

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentNow(new Date())
    }, 30_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    if (!access.allowed || isPosLoginPage) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setActivePosEmployee(readActivePosEmployee())
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
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
          throw new Error(getClientErrorMessage(result, 'تعذر تحميل المنتجات حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
        }

        return Array.isArray(result.categories) ? result.categories : []
      },
      {
        ttlMs: ADMIN_CATEGORIES_CACHE_TTL_MS,
        logLabel: 'fetch categories',
        protectedResource: true,
      }
    )

    if (resolvedPosBranchId && access.tenantId) {
      void prefetchBranchInvoiceCatalog(resolvedPosBranchId, access.tenantId)
    }
  }, [
    access.allowed,
    access.branchId,
    access.scopeType,
    access.tenantId,
    resolvedPosBranchId,
    isPosLoginPage,
    router,
  ])

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
    const hasActiveSale = Boolean(
      localStorage.getItem(INVOICE_CUSTOMER_STORAGE_KEY) ||
        localStorage.getItem(INVOICE_SALE_ITEMS_STORAGE_KEY)
    )

    if (
      hasActiveSale &&
      !window.confirm(
        'لديك عملية بيع غير مكتملة. هل تريد تسجيل الخروج وتركها محفوظة؟'
      )
    ) {
      return
    }

    try {
      setLoggingOut(true)
      clearAllInvoiceCatalogCache()
      clearActivePosEmployee()
      sessionStorage.removeItem(INVOICE_SUCCESS_STORAGE_KEY)
      markPosLoggedOut()
      setActivePosEmployee(null)
      router.push('/pos/login')
    } finally {
      clearActivePosEmployee()
      setLoggingOut(false)
    }
  }

  const handleSwitchEmployee = () => {
    clearAllInvoiceCatalogCache()
    clearActivePosEmployee()
    setActivePosEmployee(null)
    router.push('/pos/employee-pin')
  }

  const handleStartSale = () => {
    triggerPosClickFeedback()

    if (hasCompletedInvoiceSaleState()) {
      clearCompletedInvoiceSaleState()
    }

    router.push('/pos/sale/customer')
  }

  const handleQuickCustomer = () => {
    triggerPosClickFeedback()
    router.push('/pos/sale/customer')
  }

  const handleScanProduct = () => {
    triggerPosClickFeedback()
    router.push('/pos/sale/items')
  }

  if (access.authError === 'timeout') {
    console.warn('[POS PAGE] auth timeout', pathname, access.authStatus)
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#020817] p-6 text-right text-white">
        <div className="w-full max-w-md rounded-[28px] border border-cyan-300/20 bg-[rgba(2,8,23,0.72)] p-6 shadow-[0_0_45px_rgba(34,211,238,0.14)] backdrop-blur-2xl">
          <h2 className="text-xl font-black">تعذر تجهيز نقطة البيع</h2>
          <p className="mt-2 text-sm leading-7 text-slate-300">تحقق من تسجيل الدخول أو أعد المحاولة</p>
          <button
            type="button"
            onClick={() => {
              window.location.href = '/pos/login'
            }}
            className="mt-5 min-h-[48px] rounded-2xl border border-cyan-300/30 bg-cyan-300 px-5 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.24)] transition active:scale-[0.98]"
          >
            تسجيل الدخول
          </button>
        </div>
      </div>
    )
  }

  if (access.loading || !access.allowed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#020817] text-white">
        <div className="rounded-[24px] border border-cyan-300/20 bg-[rgba(2,8,23,0.72)] px-6 py-4 text-sm font-bold text-slate-200 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
          جارٍ تحميل نقطة البيع...
        </div>
      </div>
    )
  }

  return (
    <main
      dir="rtl"
      className="fixed inset-0 z-[60] h-[100svh] w-screen overflow-hidden bg-[#020817] text-white"
    >
      <section
        className="relative h-full w-full overflow-hidden bg-[#020817]"
      >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(34,211,238,0.10),transparent_30%),radial-gradient(circle_at_82%_2%,rgba(34,211,238,0.08),transparent_28%),linear-gradient(135deg,#020817_0%,#04101F_48%,#061426_100%)]" />
      <div className="pointer-events-none absolute inset-x-28 top-0 h-px bg-[#22D3EE]/25 blur-sm" />

      <div className="relative z-10 grid h-full w-full gap-3 overflow-y-auto overscroll-contain p-3 [direction:rtl] lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6 lg:overflow-hidden lg:p-6 xl:grid-cols-[232px_minmax(0,1fr)] xl:gap-8 xl:p-8">
        <aside className="flex min-h-0 flex-col overflow-visible rounded-[24px] bg-[rgba(2,8,23,0.68)] p-3 shadow-[0_22px_60px_rgba(0,0,0,0.24),inset_0_0_0_1px_rgba(34,211,238,0.10)] backdrop-blur-2xl [direction:rtl] lg:overflow-hidden lg:rounded-[26px]">
          <div className="mb-5 hidden rounded-[24px] bg-[rgba(6,20,38,0.62)] px-3 py-4 text-center shadow-[inset_0_0_0_1px_rgba(34,211,238,0.07)] lg:block">
            <p className="text-2xl font-black tracking-[0.18em] text-cyan-50 drop-shadow-[0_0_14px_rgba(34,211,238,0.22)]">
              AFEX
            </p>
            <p className="mt-0.5 text-xs font-black tracking-[0.26em] text-[#22D3EE]">
              POS
            </p>
          </div>

          <nav aria-label="تنقل نقطة البيع" className="order-2 mt-3 grid min-h-0 grid-cols-3 gap-2 overflow-hidden lg:order-none lg:mt-0 lg:block lg:flex-1 lg:space-y-1.5">
            {sidebarItems.map((item) =>
              item.disabled ? (
                <div
                  key={item.id}
                  aria-disabled="true"
                  className="hidden min-h-[46px] cursor-not-allowed items-center gap-2.5 rounded-[18px] border border-transparent px-3 text-sm font-bold text-slate-500/80 lg:flex"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-2xl text-slate-500/80">
                    <PosIcon name={item.icon} className="h-4.5 w-4.5" />
                  </span>
                  <span>{item.label}</span>
                </div>
              ) : (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={item.active ? 'page' : undefined}
                  className={`group relative flex min-h-[48px] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-[16px] border px-2 text-xs font-black transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.98] lg:min-h-[46px] lg:flex-row lg:justify-start lg:gap-2.5 lg:rounded-[18px] lg:px-3 lg:text-sm ${
                    item.active
                      ? 'border-transparent bg-[rgba(34,211,238,0.10)] text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.11),inset_0_0_24px_rgba(34,211,238,0.07)]'
                      : 'border-transparent text-slate-300/86 hover:border-[rgba(34,211,238,0.14)] hover:bg-[rgba(34,211,238,0.055)] hover:text-white'
                  }`}
                >
                  {item.active ? (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-3 left-2.5 top-3 w-1 rounded-full bg-[#22D3EE] shadow-[0_0_14px_rgba(34,211,238,0.70)]"
                    />
                  ) : null}

                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-2xl transition ${
                      item.active
                        ? 'text-cyan-100'
                        : 'text-slate-400 group-hover:text-cyan-100'
                    }`}
                  >
                    <PosIcon name={item.icon} className="h-4.5 w-4.5" />
                  </span>
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              )
            )}
          </nav>

          <div className="order-1 grid grid-cols-2 gap-2.5 lg:order-none lg:mt-4 lg:block lg:space-y-2.5">
            {activePosEmployee ? (
              <div className="col-span-2 rounded-[20px] bg-[rgba(6,20,38,0.58)] p-2.5 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08),inset_0_0_20px_rgba(34,211,238,0.03)] lg:rounded-[22px] lg:p-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#22D3EE] text-sm font-black text-slate-950 shadow-[0_0_16px_rgba(34,211,238,0.14)]">
                    {employeeDisplayName.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-white">
                      {employeeDisplayName}
                    </p>
                    <p className="mt-1 truncate text-xs font-bold text-slate-400">
                      {branchName} · الكاشير النشط
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSwitchEmployee}
                    aria-label="تبديل الموظف"
                    className="min-h-[44px] min-w-[44px] rounded-xl px-2 py-1 text-xs font-bold text-slate-400 transition hover:bg-[rgba(34,211,238,0.08)] hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.98]"
                  >
                    تبديل
                  </button>
                </div>
              </div>
            ) : null}

            {offlineDraftSyncState.draftsCount > 0 ||
            offlineDraftSyncState.isSyncing ? (
              <Link
                href="/pos/offline-drafts"
                className="flex min-h-[44px] items-center justify-between rounded-[18px] bg-[rgba(6,20,38,0.55)] px-3 text-xs font-black text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)] transition hover:bg-[rgba(34,211,238,0.055)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.98]"
              >
                <span className="flex items-center gap-2">
                  <PosIcon name="clipboard" className="h-4 w-4" />
                  {offlineDraftSyncState.isSyncing ? 'مزامنة المسودات' : 'مسودات معلقة'}
                </span>
                {offlineDraftSyncState.draftsCount > 0 ? (
                  <span className="rounded-full bg-[#22D3EE] px-2 py-0.5 text-xs font-black text-slate-950">
                    {offlineDraftSyncState.draftsCount}
                  </span>
                ) : null}
              </Link>
            ) : null}

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[18px] bg-[rgba(6,20,38,0.46)] px-3 text-xs font-black text-slate-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.06)] transition hover:bg-red-400/10 hover:text-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 lg:px-4 lg:text-sm"
            >
              <PosIcon name="logout" className="h-5 w-5" />
              {loggingOut ? 'جارٍ تسجيل الخروج...' : 'تسجيل الخروج'}
            </button>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col overflow-visible rounded-[24px] bg-[rgba(2,8,23,0.24)] p-3 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.06)] backdrop-blur-xl [direction:rtl] sm:p-5 lg:overflow-hidden lg:rounded-[28px] lg:p-6 xl:p-8">
          <header className="flex shrink-0 flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-start sm:gap-6">
            <div className="min-w-0 text-right">
              <p className="text-sm font-black tracking-[0.18em] text-[#22D3EE]">
                {storeName}
              </p>
              <p className="mt-1 truncate text-xs font-bold text-slate-400 lg:hidden">
                {branchName}
              </p>
              <h1 className="mt-2 text-2xl font-black leading-tight text-white sm:mt-3 sm:text-3xl xl:text-[42px]">
                مرحباً بك، فيصل
              </h1>
              <p className="mt-2 text-base font-bold text-slate-300 xl:text-lg">
                جاهز لبدء البيع
              </p>
            </div>

            <div className="flex min-w-0 flex-wrap items-center justify-start gap-3 [direction:rtl] sm:w-auto sm:shrink-0 sm:justify-end">
              <div className="flex min-h-[48px] min-w-0 flex-1 items-center gap-2.5 rounded-[20px] bg-[rgba(2,8,23,0.68)] px-3 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.10),inset_0_0_18px_rgba(34,211,238,0.03)] sm:flex-none sm:px-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[rgba(34,211,238,0.07)] text-[#22D3EE] shadow-[inset_0_0_0_1px_rgba(34,211,238,0.10)]">
                  <PosIcon name="clock" className="h-4.5 w-4.5" />
                </span>
                <span className="text-sm font-black text-white">{timeLabel}</span>
              </div>
              <div className="flex min-h-[48px] min-w-0 flex-1 items-center gap-2.5 rounded-[20px] bg-[rgba(2,8,23,0.68)] px-3 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.10),inset_0_0_18px_rgba(34,211,238,0.03)] sm:flex-none sm:px-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[rgba(34,211,238,0.07)] text-[#22D3EE] shadow-[inset_0_0_0_1px_rgba(34,211,238,0.10)]">
                  <PosIcon name="clipboard" className="h-4.5 w-4.5" />
                </span>
                <div className="text-right">
                  <p className="text-xs font-bold text-slate-300">{dayName}</p>
                  <p className="text-xs font-bold text-slate-500">{dateLabel}</p>
                </div>
              </div>
            </div>
          </header>

          <section className="mt-5 grid shrink-0 gap-3 sm:mt-7 sm:gap-5 xl:mt-9 xl:gap-6">
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleStartSale}
                className="group relative flex h-[156px] w-full flex-col items-center justify-center overflow-hidden rounded-[26px] bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.18),transparent_58%),rgba(2,8,23,0.72)] px-5 text-center shadow-[0_0_36px_rgba(34,211,238,0.13),inset_0_0_0_1px_rgba(34,211,238,0.16),inset_0_1px_0_rgba(34,211,238,0.08)] transition hover:shadow-[0_0_44px_rgba(34,211,238,0.16),inset_0_0_0_1px_rgba(34,211,238,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.99] sm:h-[198px] sm:rounded-[32px] sm:px-9 xl:h-[232px]"
              >
                <span className="absolute inset-x-24 top-0 h-px bg-[#22D3EE]/55 blur-sm" />
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[rgba(34,211,238,0.09)] text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.12),inset_0_0_0_1px_rgba(34,211,238,0.12)] sm:h-20 sm:w-20 xl:h-24 xl:w-24">
                  <PosIcon name="shoppingCart" className="h-8 w-8 sm:h-10 sm:w-10 xl:h-12 xl:w-12" />
                </span>
                <h2 className="mt-3 text-3xl font-black text-white sm:mt-6 sm:text-4xl xl:text-5xl">
                  بدء بيع جديد
                </h2>
                <p className="mt-2 text-sm font-bold text-slate-400 xl:text-base">
                  ابدأ عملية بيع بسرعة وسهولة
                </p>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 [direction:rtl] sm:grid-cols-3 sm:gap-4 xl:gap-5">
              <button
                type="button"
                onClick={handleQuickCustomer}
                className="group flex min-h-[76px] min-w-0 items-center gap-2 rounded-[22px] bg-[rgba(2,8,23,0.60)] px-3 text-right shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08),inset_0_0_24px_rgba(34,211,238,0.028)] transition hover:bg-[rgba(34,211,238,0.055)] hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16),0_0_20px_rgba(34,211,238,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.98] sm:h-[104px] sm:gap-4 sm:rounded-[26px] sm:px-5"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-[rgba(34,211,238,0.07)] text-[#22D3EE] shadow-[inset_0_0_0_1px_rgba(34,211,238,0.10)] sm:h-14 sm:w-14 sm:rounded-[20px]">
                  <PosIcon name="user" className="h-6 w-6" />
                </span>
                <span className="text-base font-black text-white">إضافة عميل</span>
              </button>

              <button
                type="button"
                onClick={handleStartSale}
                className="group flex min-h-[76px] min-w-0 items-center gap-2 rounded-[22px] bg-[rgba(2,8,23,0.60)] px-3 text-right shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08),inset_0_0_24px_rgba(34,211,238,0.028)] transition hover:bg-[rgba(34,211,238,0.055)] hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16),0_0_20px_rgba(34,211,238,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.98] sm:h-[104px] sm:gap-4 sm:rounded-[26px] sm:px-5"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-[rgba(34,211,238,0.07)] text-[#22D3EE] shadow-[inset_0_0_0_1px_rgba(34,211,238,0.10)] sm:h-14 sm:w-14 sm:rounded-[20px]">
                  <PosIcon name="zap" className="h-6 w-6" />
                </span>
                <span className="text-base font-black text-white">عميل سريع</span>
              </button>

              <button
                type="button"
                onClick={handleScanProduct}
                className="group col-span-2 flex min-h-[76px] min-w-0 items-center justify-center gap-2 rounded-[22px] bg-[rgba(2,8,23,0.60)] px-3 text-right shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08),inset_0_0_24px_rgba(34,211,238,0.028)] transition hover:bg-[rgba(34,211,238,0.055)] hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16),0_0_20px_rgba(34,211,238,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.98] sm:col-span-1 sm:h-[104px] sm:justify-start sm:gap-4 sm:rounded-[26px] sm:px-5"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-[rgba(34,211,238,0.07)] text-[#22D3EE] shadow-[inset_0_0_0_1px_rgba(34,211,238,0.10)] sm:h-14 sm:w-14 sm:rounded-[20px]">
                  <PosIcon name="package" className="h-6 w-6" />
                </span>
                <span className="text-base font-black text-white">مسح منتج</span>
              </button>
            </div>
          </section>

          <section aria-label="ملخص الطلبات الظاهرة" className="mt-4 grid grid-cols-2 gap-2 sm:hidden">
            <p className="col-span-2 px-1 text-right text-xs font-black text-slate-400">
              ملخص الطلبات الظاهرة
            </p>
            {mobileOrderStatusSummary.map(({ status, count }) => {
              const statusUi = POS_ORDER_STATUS_UI[status]

              return (
                <div
                  key={status}
                  className={`min-w-0 rounded-[20px] bg-[rgba(2,8,23,0.60)] p-3 text-center shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)] ${
                    status === 'closed' ? 'col-span-2' : ''
                  }`}
                >
                  <span className={`mx-auto block h-2 w-2 rounded-full ${statusUi.dotClassName}`} />
                  <p className="mt-2 text-2xl font-black text-white">{count}</p>
                  <p className="mt-1 truncate text-[11px] font-black text-slate-300">
                    {statusUi.label}
                  </p>
                </div>
              )
            })}
          </section>

          <section className="mt-4 flex min-h-0 flex-1 flex-col overflow-visible rounded-[24px] bg-[rgba(2,8,23,0.60)] p-3 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08),inset_0_0_28px_rgba(34,211,238,0.03)] sm:mt-6 sm:rounded-[28px] sm:p-5 lg:overflow-hidden xl:mt-8">
            <div className="mb-4 flex shrink-0 items-center justify-between gap-4">
                <div className="text-right">
                  <h2 className="text-xl font-black text-white xl:text-2xl">آخر الطلبات</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500 xl:text-sm">
                    صفوف مختصرة لآخر عمليات البيع
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {ordersLoading ? (
                    <span className="rounded-full border border-[rgba(34,211,238,0.18)] bg-[rgba(34,211,238,0.075)] px-3 py-1 text-xs font-bold text-cyan-100">
                      تحميل...
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="min-h-[44px] rounded-2xl bg-[rgba(34,211,238,0.07)] px-4 text-xs font-black text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)] transition hover:bg-[rgba(34,211,238,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.98]"
                  >
                    عرض الكل
                  </button>
                </div>
              </div>

              {ordersError ? (
                <div className="rounded-[18px] border border-red-300/18 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                  {ordersError}
                </div>
              ) : null}

              {!ordersError && ordersLoading ? (
                <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:gap-4">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={`pos-order-skeleton-${index}`}
                      className="h-full min-h-[118px] animate-pulse rounded-[24px] bg-[rgba(6,20,38,0.55)] shadow-[inset_0_0_0_1px_rgba(34,211,238,0.06)]"
                    />
                  ))}
                </div>
              ) : null}

              {!ordersError && !ordersLoading && recentOrders.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center rounded-[22px] border border-dashed border-[rgba(34,211,238,0.16)] bg-[rgba(6,20,38,0.42)] text-center">
                  <div>
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-[22px] border border-[rgba(34,211,238,0.16)] bg-[rgba(34,211,238,0.06)] text-cyan-100">
                      <PosIcon name="clipboard" className="h-7 w-7" />
                    </span>
                    <p className="mt-3 text-sm font-black text-slate-200">لا توجد طلبات مطابقة للحالة الحالية.</p>
                  </div>
                </div>
              ) : null}

              {!ordersError && !ordersLoading && recentOrders.length > 0 ? (
                <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-visible sm:grid-cols-2 lg:overflow-y-auto lg:overscroll-contain lg:pr-1 lg:[scrollbar-width:none] lg:[-ms-overflow-style:none] lg:[&::-webkit-scrollbar]:hidden xl:gap-4">
                  {recentOrders.map((order) => {
                    const statusKey = resolvePosKanbanStatus(order.status)
                    const statusUi = statusKey ? POS_ORDER_STATUS_UI[statusKey] : null
                    const nextStatus = getNextPosOrderStatus(order.status)
                    const isUpdatingOrder = updatingOrderId === order.id

                    return (
                      <div
                        key={order.id}
                        className={`flex min-h-[118px] flex-col justify-between rounded-[24px] bg-[rgba(6,20,38,0.54)] p-4 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.07)] transition hover:bg-[rgba(34,211,238,0.045)] hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.14),0_0_18px_rgba(34,211,238,0.07)] xl:min-h-[132px] ${
                          isUpdatingOrder ? 'opacity-60' : 'opacity-100'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-lg font-black text-white">
                              {order.order_number}
                            </p>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                              POS · {formatOrderTime(order.created_at)}
                            </p>
                          </div>

                          <span
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${
                              statusUi?.badgeClassName ||
                              'bg-slate-300/10 text-slate-200'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                statusUi?.dotClassName || 'bg-slate-400'
                              }`}
                            />
                            {statusUi?.label || order.status}
                          </span>
                        </div>

                        <div className="flex items-end justify-between gap-3">
                          <p className="text-xl font-black text-cyan-100">
                            {formatCurrency(order.total)}
                          </p>

                          {nextStatus ? (
                            <button
                              type="button"
                              onClick={() => handleAdvanceOrderStatus(order)}
                              disabled={isUpdatingOrder}
                              className="min-h-[44px] rounded-2xl bg-[rgba(34,211,238,0.08)] px-3 text-xs font-black text-cyan-100 transition hover:bg-[rgba(34,211,238,0.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isUpdatingOrder
                                ? 'جارٍ...'
                                : order.status === 'in_progress'
                                  ? 'جاهز'
                                  : 'تم تسليم'}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-500">
                              <PosIcon name="clock" className="h-4 w-4" />
                              {formatOrderTime(order.created_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}
          </section>
        </main>
      </div>
      </section>
    </main>
  )
}

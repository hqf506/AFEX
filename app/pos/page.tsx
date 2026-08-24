'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { usePageAccess } from '@/hooks/use-page-access'
import { useMobileViewport } from '@/hooks/use-mobile-viewport'
import { useSystemSettings } from '@/hooks/use-system-settings'
import { getClientErrorMessage } from '@/lib/api/client-error'
import { getRoleLabel } from '@/lib/app-roles'
import {
  createProtectedResourceAuthError,
  loadClientResource,
  markProtectedResourcesUnauthorized,
  prefetchClientResource,
} from '@/lib/client-resource-cache'
import {
  clearAllInvoiceCatalogCache,
  prefetchBranchInvoiceCatalog,
} from '@/lib/invoices/catalog'
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
  endPosActorSessionAndRequireReauthentication,
  readActivePosEmployee,
  type ActivePosEmployee,
} from '@/lib/pos-employee-session'
import {
  getPosOfflineDraftSyncState,
  POS_OFFLINE_DRAFTS_SYNC_EVENT,
  POS_OFFLINE_DRAFTS_UPDATED_EVENT,
  type PosOfflineDraftSyncState,
} from '@/lib/pos-offline-draft'
import {
  formatPosGregorianDate,
  formatPosTime,
  formatPosWeekday,
} from '@/lib/pos/date-format'
import {
  PosAddCustomerModal,
  type CreatedPosCustomer,
} from '@/components/pos-add-customer-modal'
import { PosPreparingScreen } from '@/components/pos-preparing-screen'

const ADMIN_CATEGORIES_CACHE_KEY = 'admin-categories'
const ADMIN_CATEGORIES_CACHE_TTL_MS = 60_000
const POS_HOME_ORDERS_PAGE_SIZE = 6
const POS_HOME_ORDERS_CACHE_TTL_MS = 15_000
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
    label: 'حالة الطلبات',
    href: '/pos/order-status',
    active: false,
    disabled: false,
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
    href: '/pos/settings',
    active: false,
    disabled: false,
    icon: 'settings' as const,
  },
]

type PosKanbanStatus = 'in_progress' | 'ready' | 'closed'
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
  }
}

function resolvePosKanbanStatus(status: OrderStatus): PosKanbanStatus | null {
  return POS_KANBAN_STATUSES.has(status as PosKanbanStatus)
    ? (status as PosKanbanStatus)
    : null
}

function getPosEmployeeDisplayName(employee: ActivePosEmployee | null) {
  return employee?.full_name?.trim() || employee?.username?.trim() || 'لم يُسجل الموظف'
}

function formatOrderTime(createdAt: string) {
  const formatted = formatPosTime(createdAt)
  return formatted === '—' ? '--:--' : formatted
}

type PosOperationalHomeProps = {
  employeeName: string
  organizationName: string
  branchName: string
  dayName: string
  dateLabel: string
  timeLabel: string
  orders: OrderRecord[]
  ordersLoading: boolean
  ordersError: string
  offlineDrafts: PosOfflineDraftSyncState
  customerSuccess: string
  customerModal: ReactNode
  onStartSale: () => void
  onAddCustomer: () => void
}

function PosOperationalHome({
  employeeName,
  organizationName,
  branchName,
  dayName,
  dateLabel,
  timeLabel,
  orders,
  ordersLoading,
  ordersError,
  offlineDrafts,
  customerSuccess,
  customerModal,
  onStartSale,
  onAddCustomer,
}: PosOperationalHomeProps) {
  const statusSummary = [
    { status: 'in_progress' as const, count: orders.filter((order) => order.status === 'in_progress').length },
    { status: 'ready' as const, count: orders.filter((order) => order.status === 'ready').length },
    { status: 'closed' as const, count: orders.filter((order) => order.status === 'closed').length },
  ]

  return (
    <main className="pos-operational-home" dir="rtl">
      <div className="pos-operational-canvas">
        <header className="pos-operational-header">
          <div className="pos-operational-heading">
            <p>{organizationName}</p>
            <h1>مرحباً، {employeeName}</h1>
            <span>{branchName}</span>
          </div>
          <div className="pos-operational-clock" aria-label={`${dayName} ${dateLabel} ${timeLabel}`}>
            <strong>{timeLabel}</strong>
            <span>{dayName} · {dateLabel}</span>
          </div>
        </header>

        <section className="pos-home-actions" aria-label="إجراءات نقطة البيع الرئيسية">
          <button type="button" className="pos-home-action is-primary" onClick={onStartSale}>
            <span className="pos-home-action-icon"><PosIcon name="shoppingCart" /></span>
            <div>
              <b>بيع جديد</b>
              <small>ابدأ عملية بيع جديدة</small>
            </div>
          </button>
          <div className="pos-home-action-pair">
            <button type="button" className="pos-home-action" onClick={onAddCustomer}>
              <span className="pos-home-action-icon"><PosIcon name="user" /></span>
              <div><b>إضافة عميل</b><small>تسجيل عميل جديد</small></div>
            </button>
            <Link className="pos-home-action" href="/pos/order-history">
              <span className="pos-home-action-icon"><PosIcon name="clipboard" /></span>
              <div><b>سجل العمليات</b><small>نشاط الطلبات والفواتير</small></div>
            </Link>
          </div>
          <Link className="pos-home-action is-drafts" href="/pos/offline-drafts">
            <span className="pos-home-action-icon"><PosIcon name="clipboard" /></span>
            <div><b>مسودات الفواتير</b><small>{offlineDrafts.draftsCount > 0 ? `${offlineDrafts.draftsCount} مسودات محفوظة` : 'عرض المسودات غير المتصلة'}</small></div>
          </Link>
        </section>

        {customerSuccess ? <p className="pos-operational-success" role="status">{customerSuccess}</p> : null}

        <section className="pos-operational-summary" aria-label="ملخص حالات الطلبات">
          {statusSummary.map(({ status, count }) => (
            <div key={status}>
              <span className={POS_ORDER_STATUS_UI[status].dotClassName} />
              <b>{count}</b>
              <small>{POS_ORDER_STATUS_UI[status].label}</small>
            </div>
          ))}
          {offlineDrafts.draftsCount > 0 || offlineDrafts.isSyncing ? (
            <Link href="/pos/offline-drafts" className="pos-operational-drafts">
              <PosIcon name="clipboard" />
              {offlineDrafts.isSyncing ? 'مزامنة المسودات' : `${offlineDrafts.draftsCount} مسودات معلقة`}
            </Link>
          ) : null}
        </section>

        <section className="pos-recent-orders" aria-labelledby="pos-recent-orders-title">
          <header>
            <div>
              <h2 id="pos-recent-orders-title">سجل الطلبات</h2>
              <p>أحدث ستة طلبات خلال آخر 48 ساعة</p>
            </div>
            <Link href="/pos/order-history">عرض سجل العمليات</Link>
          </header>

          {ordersError ? <p className="pos-orders-message is-error" role="alert">تعذر تحميل الطلبات حاليًا. حاول مرة أخرى.</p> : null}
          {!ordersError && ordersLoading ? <p className="pos-orders-message">جارٍ تحميل آخر الطلبات...</p> : null}
          {!ordersError && !ordersLoading && orders.length === 0 ? <p className="pos-orders-message">لا توجد طلبات حديثة. ابدأ أول عملية بيع.</p> : null}

          {!ordersError && !ordersLoading && orders.length > 0 ? (
            <div className="pos-orders-list" role="list">
              <div className="pos-orders-list-head" aria-hidden="true">
                <span>رقم الطلب</span><span>التاريخ والوقت</span><span>الحالة</span><span>الإجمالي</span><span>الإجراء</span>
              </div>
              {orders.map((order) => {
                const status = resolvePosKanbanStatus(order.status)
                const statusUi = status ? POS_ORDER_STATUS_UI[status] : null
                return (
                  <article key={order.id} className="pos-order-row" role="listitem">
                    <div className="pos-order-number"><small>رقم الطلب</small><strong dir="ltr">{order.order_number}</strong></div>
                    <div className="pos-order-date"><small>التاريخ والوقت</small><span><bdi>{formatPosGregorianDate(order.created_at)}</bdi><span aria-hidden="true"> · </span><bdi>{formatOrderTime(order.created_at)}</bdi></span></div>
                    <div className="pos-order-status"><small>الحالة</small><span><i className={statusUi?.dotClassName || 'bg-slate-400'} />{statusUi?.label || order.status}</span></div>
                    <div className="pos-order-total"><small>الإجمالي</small><strong dir="ltr">{formatCurrency(order.total)}</strong></div>
                    <div className="pos-order-action"><Link href="/pos/order-history">عرض التفاصيل</Link></div>
                  </article>
                )
              })}
            </div>
          ) : null}
        </section>
      </div>
      {customerModal}
    </main>
  )
}

export default function PosPage() {
  const router = useRouter()
  const pathname = usePathname()
  const isMobileViewport = useMobileViewport()
  const isPosLoginPage = pathname?.startsWith('/pos/login') ?? false
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState('')
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [showMobileRecentOrders, setShowMobileRecentOrders] = useState(false)
  const [showMobileAddCustomer, setShowMobileAddCustomer] = useState(false)
  const [mobileCustomerSuccess, setMobileCustomerSuccess] = useState('')
  const [selectedMobileOrderId, setSelectedMobileOrderId] = useState<string | null>(null)
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
  const mobileStoreName = storeName
  const mobileBranchName = branchName
  const employeeDisplayName = getPosEmployeeDisplayName(activePosEmployee)
  const resolvedPosBranchId =
    activePosEmployee?.branch_id ||
    (access.scopeType === 'branch' ? access.branchId : null)
  const recentOrders = orders.slice(0, 6)
  const mapRecentOrders = (
    renderOrder: (order: OrderRecord) => ReactNode
  ) => recentOrders.map(renderOrder)
  const selectedMobileOrder = selectedMobileOrderId
    ? recentOrders.find((order) => order.id === selectedMobileOrderId) || null
    : null
  const selectedMobileOrderStatusKey = selectedMobileOrder
    ? resolvePosKanbanStatus(selectedMobileOrder.status)
    : null
  const selectedMobileOrderStatusUi = selectedMobileOrderStatusKey
    ? POS_ORDER_STATUS_UI[selectedMobileOrderStatusKey]
    : null
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
  const dayName = formatPosWeekday(currentNow)
  const dateLabel = formatPosGregorianDate(currentNow)
  const timeLabel = formatPosTime(currentNow)

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentNow(new Date())
    }, 30_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    if (!selectedMobileOrderId) {
      return
    }

    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedMobileOrderId(null)
      }
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [selectedMobileOrderId])

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
    router.prefetch('/pos/order-status')
    router.prefetch('/pos/order-history')
    router.prefetch('/pos/invoices')
    const orderStatusPrefetchIntervalId = window.setInterval(
      () => {
        router.prefetch('/pos/order-status')
        router.prefetch('/pos/order-history')
        router.prefetch('/pos/invoices')
      },
      15_000
    )

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

    return () => window.clearInterval(orderStatusPrefetchIntervalId)

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
    const ordersCacheKey = [
      'pos-home-orders',
      access.tenantId || 'unknown',
      access.scopeType || 'unknown',
      access.branchId || 'all',
      POS_HOME_ORDERS_PAGE_SIZE,
    ].join(':')

    const fetchOrders = async () => {
      setOrdersLoading(true)
      setOrdersError('')

      try {
        const searchParams = new URLSearchParams()
        searchParams.set('page', '1')
        searchParams.set('pageSize', POS_HOME_ORDERS_PAGE_SIZE.toString())
        searchParams.set('recentHours', '48')

        if (access.scopeType === 'system' && access.branchId) {
          searchParams.set('branchId', access.branchId)
        }

        const result = await loadClientResource(
          ordersCacheKey,
          async () => {
            const response = await fetch(`/api/orders?${searchParams.toString()}`, {
              method: 'GET',
              credentials: 'include',
              cache: 'no-store',
            })

            const payload = await response.json().catch(() => null)

            if (!response.ok || !payload?.success) {
              throw new Error(payload?.message || 'تعذر تحميل الطلبات')
            }

            return payload
          },
          {
            ttlMs: POS_HOME_ORDERS_CACHE_TTL_MS,
            protectedResource: true,
          }
        )

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
  }, [
    access.allowed,
    access.branchId,
    access.scopeType,
    access.tenantId,
    isPosLoginPage,
  ])

  const handleSwitchEmployee = async () => {
    clearAllInvoiceCatalogCache()
    await endPosActorSessionAndRequireReauthentication()
    setActivePosEmployee(null)
    router.push('/pos/login')
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

  const handleOpenAddCustomer = () => {
    triggerPosClickFeedback()
    setMobileCustomerSuccess('')
    setShowMobileAddCustomer(true)
  }

  const handleMobileCustomerCreated = (customer: CreatedPosCustomer) => {
    setShowMobileAddCustomer(false)
    setMobileCustomerSuccess(`تمت إضافة العميل ${customer.name} بنجاح.`)
  }

  const handleOpenRecentOrders = () => {
    triggerPosClickFeedback()
    router.push('/pos/order-history')
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
    return <PosPreparingScreen />
  }

  if (Boolean(activePosEmployee)) {
    return (
      <PosOperationalHome
        employeeName={employeeDisplayName}
        organizationName={mobileStoreName}
        branchName={mobileBranchName}
        dayName={dayName}
        dateLabel={dateLabel}
        timeLabel={timeLabel}
        orders={recentOrders}
        ordersLoading={ordersLoading}
        ordersError={ordersError}
        offlineDrafts={offlineDraftSyncState}
        customerSuccess={mobileCustomerSuccess}
        customerModal={showMobileAddCustomer ? (
          <PosAddCustomerModal
            branchId={resolvedPosBranchId}
            onClose={() => setShowMobileAddCustomer(false)}
            onCreated={handleMobileCustomerCreated}
          />
        ) : null}
        onStartSale={handleStartSale}
        onAddCustomer={handleOpenAddCustomer}
      />
    )
  }

  return (
    <main
      dir="rtl"
      className="pos-home-legacy-root relative h-full min-h-0 w-full overflow-hidden bg-[#020817] text-white"
    >
      <style jsx global>{`
        @keyframes pos-order-details-sheet-in {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .pos-order-details-sheet { animation: none !important; }
        }
      `}</style>
      <section
        className="relative h-full w-full overflow-hidden bg-[#020817]"
      >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(34,211,238,0.10),transparent_30%),radial-gradient(circle_at_82%_2%,rgba(34,211,238,0.08),transparent_28%),linear-gradient(135deg,#020817_0%,#04101F_48%,#061426_100%)]" />
      <div className="pointer-events-none absolute inset-x-28 top-0 h-px bg-[#22D3EE]/25 blur-sm" />

      {isMobileViewport ? (
        <div className="relative z-10 h-full overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] [direction:rtl]">
          <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4">
            <header className="flex items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black tracking-[0.14em] text-white">AFEX</span>
                  <span className="text-xs font-black tracking-[0.22em] text-cyan-300">POS</span>
                </div>
                <p className="mt-1 truncate text-xs font-bold text-slate-400">{mobileStoreName}</p>
              </div>
              <div className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 text-xs font-black text-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.75)]" />
                جاهز للبيع
              </div>
            </header>

            <section className="rounded-[26px] border border-cyan-300/12 bg-[rgba(6,20,38,0.68)] p-5 shadow-[0_18px_45px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
              <p className="text-sm font-bold text-cyan-300">مرحباً بك</p>
              <h1 className="mt-2 truncate text-2xl font-black text-white">{employeeDisplayName}</h1>
              <div className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-300">
                <PosIcon name="home" className="h-4 w-4 text-cyan-300" />
                <span className="truncate">{mobileBranchName}</span>
              </div>
            </section>

            <section className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[22px] border border-cyan-300/10 bg-[rgba(2,8,23,0.62)] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">{dayName}</p>
                <p className="mt-1 truncate text-xs font-bold text-slate-400">{dateLabel}</p>
              </div>
              <p className="text-2xl font-black tabular-nums text-cyan-200">{timeLabel}</p>
            </section>

            <section aria-label="إجراءات نقطة البيع" className="grid grid-cols-2 gap-3">
              {[
                {
                  label: 'بيع جديد',
                  subtitle: 'بدء عملية بيع جديدة',
                  icon: 'shoppingCart' as const,
                  onClick: handleStartSale,
                  className: 'col-span-2 min-h-[108px] bg-cyan-300/[0.08]',
                },
                {
                  label: 'إضافة عميل',
                  subtitle: 'تسجيل عميل جديد',
                  icon: 'user' as const,
                  onClick: handleOpenAddCustomer,
                  className: 'min-h-[104px]',
                },
                {
                  label: 'سجل العمليات',
                  subtitle: 'نشاط الطلبات والفواتير',
                  icon: 'clipboard' as const,
                  onClick: handleOpenRecentOrders,
                  className: 'min-h-[104px]',
                },
              ].map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className={`group flex flex-col items-center justify-center gap-2 rounded-[24px] border border-cyan-300/10 bg-[rgba(6,20,38,0.68)] px-3 text-center shadow-[0_14px_34px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.035)] transition duration-150 hover:border-cyan-300/20 hover:bg-cyan-300/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.97] ${action.className}`}
                >
                  <span className="grid h-11 w-11 place-items-center rounded-[17px] bg-cyan-300/10 text-cyan-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.12)] transition group-active:scale-95">
                    <PosIcon name={action.icon} className="h-6 w-6" />
                  </span>
                  <span className="text-sm font-black text-white">{action.label}</span>
                  <span className="text-[11px] font-bold text-slate-400">{action.subtitle}</span>
                </button>
              ))}

              <Link
                href="/pos/offline-drafts"
                className="col-span-2 flex min-h-[76px] items-center gap-3 rounded-[22px] border border-cyan-300/10 bg-[rgba(6,20,38,0.58)] px-4 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.98]"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[16px] bg-cyan-300/10 text-cyan-200">
                  <PosIcon name="creditCard" className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black text-white">مسودات الفواتير</span>
                  <span className="mt-1 block text-[11px] font-bold text-slate-400">
                    عرض وإكمال الفواتير غير المرسلة
                  </span>
                </span>
              </Link>
            </section>

            {mobileCustomerSuccess ? (
              <div role="status" aria-live="polite" className="rounded-[18px] border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-black text-emerald-100">
                {mobileCustomerSuccess}
              </div>
            ) : null}

            <section aria-label="ملخص حالات الطلبات" className="grid grid-cols-3 gap-2">
              {mobileOrderStatusSummary.map(({ status, count }) => {
                const statusUi = POS_ORDER_STATUS_UI[status]

                return (
                  <div key={status} className="min-w-0 rounded-[20px] border border-cyan-300/10 bg-[#07111f] p-3 text-center">
                    <span className={`mx-auto block h-2 w-2 rounded-full ${statusUi.dotClassName}`} />
                    <p className="mt-2 text-2xl font-black text-white">{count}</p>
                    <p className="mt-1 truncate text-[11px] font-black text-slate-400">{statusUi.label}</p>
                  </div>
                )
              })}
            </section>

            <section className="mt-auto rounded-[24px] border border-cyan-300/10 bg-[rgba(6,20,38,0.62)] p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] bg-cyan-300 text-base font-black text-slate-950">
                  {employeeDisplayName.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-white">{employeeDisplayName}</p>
                  <p className="mt-1 truncate text-xs font-bold text-slate-400">
                    {activePosEmployee ? getRoleLabel(activePosEmployee.role) : access.roleLabel} · {mobileBranchName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSwitchEmployee}
                  className="min-h-[44px] shrink-0 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] px-3 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.97]"
                >
                  تبديل المستخدم
                </button>
              </div>
              {offlineDraftSyncState.draftsCount > 0 || offlineDraftSyncState.isSyncing ? (
                <Link href="/pos/offline-drafts" className="mt-3 flex min-h-[44px] items-center justify-between rounded-2xl bg-cyan-300/[0.07] px-3 text-xs font-black text-cyan-100">
                  <span>{offlineDraftSyncState.isSyncing ? 'مزامنة المسودات' : 'مسودات معلقة'}</span>
                  <span>{offlineDraftSyncState.draftsCount}</span>
                </Link>
              ) : null}
            </section>

          </div>

          {showMobileAddCustomer ? (
            <PosAddCustomerModal
              branchId={resolvedPosBranchId}
              onClose={() => setShowMobileAddCustomer(false)}
              onCreated={handleMobileCustomerCreated}
            />
          ) : null}

          {showMobileRecentOrders ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-recent-orders-title"
              className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#020817] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.09),transparent_32%),linear-gradient(180deg,#020817_0%,#04101d_100%)]" />
              <section className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-md flex-col">
                <header className="flex shrink-0 items-start justify-between gap-4 pb-5 pt-1">
                  <div>
                    <h2 id="mobile-recent-orders-title" className="text-[28px] font-black leading-tight text-white">سجل الطلبات</h2>
                    <p className="mt-2 text-sm font-bold leading-6 text-slate-400">طلبات آخر 48 ساعة</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMobileOrderId(null)
                      setShowMobileRecentOrders(false)
                    }}
                    aria-label="إغلاق سجل الطلبات"
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-[17px] border border-cyan-300/20 bg-cyan-300/[0.05] text-2xl font-black text-slate-200 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.96]"
                  >
                    ←
                  </button>
                </header>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {ordersError ? (
                    <div className="rounded-[18px] border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                      {ordersError}
                    </div>
                  ) : null}

                  {!ordersError && ordersLoading ? (
                    Array.from({ length: 3 }).map((_, index) => (
                      <div key={`mobile-recent-order-skeleton-${index}`} className="h-[176px] animate-pulse rounded-[24px] border border-cyan-300/[0.06] bg-[rgba(6,20,38,0.62)] p-4">
                        <div className="h-5 w-24 rounded-lg bg-slate-700/70" />
                        <div className="mt-4 h-4 w-36 rounded-lg bg-slate-800" />
                        <div className="mt-3 h-3 w-44 rounded-lg bg-slate-800" />
                        <div className="mt-6 h-7 w-28 rounded-lg bg-slate-700/60" />
                      </div>
                    ))
                  ) : null}

                  {!ordersError && !ordersLoading && recentOrders.length === 0 ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[26px] border border-dashed border-cyan-300/15 bg-cyan-300/[0.025] px-6 text-center">
                      <span className="grid h-16 w-16 place-items-center rounded-[22px] bg-cyan-300/[0.08] text-cyan-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.12)]">
                        <PosIcon name="clipboard" className="h-8 w-8" />
                      </span>
                      <h3 className="mt-5 text-xl font-black text-white">لا توجد طلبات حديثة</h3>
                      <p className="mt-2 text-sm font-bold text-slate-400">ستظهر آخر عمليات البيع هنا.</p>
                    </div>
                  ) : null}

                  {!ordersError && !ordersLoading ? mapRecentOrders((order) => {
                    const statusKey = resolvePosKanbanStatus(order.status)
                    const statusUi = statusKey ? POS_ORDER_STATUS_UI[statusKey] : null
                    return (
                      <article key={order.id} className="rounded-[24px] border border-cyan-300/10 bg-[rgba(6,20,38,0.68)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-lg font-black text-white">{order.order_number}</p>
                            <p className="mt-2 truncate text-sm font-bold text-slate-200">{order.customer_name || 'عميل نقدي'}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                              <span>{formatPosGregorianDate(order.created_at)}</span>
                              <span aria-hidden="true">•</span>
                              <span>{formatOrderTime(order.created_at)}</span>
                            </div>
                          </div>
                          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${statusUi?.badgeClassName || 'bg-slate-300/10 text-slate-200'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${statusUi?.dotClassName || 'bg-slate-400'}`} />
                            {statusUi?.label || order.status}
                          </span>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3 border-t border-cyan-300/10 pt-3">
                          <p className="text-xl font-black text-cyan-100">{formatCurrency(order.total)}</p>
                          <button
                            type="button"
                            onClick={() => setSelectedMobileOrderId(order.id)}
                            className="flex min-h-[44px] items-center rounded-2xl bg-cyan-300/[0.07] px-3 text-xs font-black text-cyan-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.97]"
                          >
                            عرض التفاصيل
                          </button>
                        </div>
                      </article>
                    )
                  }) : null}
                </div>
              </section>

              {selectedMobileOrder ? (
                <div className="fixed inset-0 z-20 flex items-end bg-slate-950/75 backdrop-blur-sm">
                  <button
                    type="button"
                    aria-label="إغلاق تفاصيل الطلب"
                    onClick={() => setSelectedMobileOrderId(null)}
                    className="absolute inset-0 cursor-default"
                  />
                  <section
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="mobile-order-details-title"
                    className="pos-order-details-sheet relative z-10 flex max-h-[88svh] w-full flex-col overflow-hidden rounded-t-[30px] border-x border-t border-cyan-300/15 bg-[#06101e] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_rgba(0,0,0,0.38)] motion-safe:animate-[pos-order-details-sheet-in_180ms_ease-out]"
                  >
                    <span aria-hidden="true" className="mx-auto mt-3 h-1 w-12 shrink-0 rounded-full bg-slate-600" />
                    <header className="flex shrink-0 items-start justify-between gap-4 border-b border-cyan-300/10 px-4 pb-4 pt-3">
                      <div className="min-w-0">
                        <p className="text-xs font-black text-cyan-300">تفاصيل الطلب</p>
                        <h3 id="mobile-order-details-title" className="mt-2 truncate text-2xl font-black text-white">
                          {selectedMobileOrder.order_number}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedMobileOrderId(null)}
                        aria-label="إغلاق"
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px] bg-cyan-300/[0.06] text-xl font-black text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.96]"
                      >
                        ×
                      </button>
                    </header>

                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <section className="rounded-[22px] border border-cyan-300/10 bg-[#071524] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-base font-black text-white">{selectedMobileOrder.customer_name || 'عميل نقدي'}</p>
                            {selectedMobileOrder.customer_phone && selectedMobileOrder.customer_phone !== '—' ? (
                              <p dir="ltr" className="mt-2 text-right text-sm font-bold text-slate-400">{selectedMobileOrder.customer_phone}</p>
                            ) : null}
                            <p className="mt-2 text-xs font-bold text-slate-500">
                              {formatPosGregorianDate(selectedMobileOrder.created_at)} · {formatOrderTime(selectedMobileOrder.created_at)}
                            </p>
                          </div>
                          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${selectedMobileOrderStatusUi?.badgeClassName || 'bg-slate-300/10 text-slate-200'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${selectedMobileOrderStatusUi?.dotClassName || 'bg-slate-400'}`} />
                            {selectedMobileOrderStatusUi?.label || selectedMobileOrder.status}
                          </span>
                        </div>
                      </section>

                      <section>
                        <h4 className="text-sm font-black text-white">المنتجات</h4>
                        <div className="mt-3 space-y-2">
                          {selectedMobileOrder.items.length > 0 ? selectedMobileOrder.items.map((item, index) => (
                            <div key={`${selectedMobileOrder.id}-${item.item_name}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-[18px] border border-cyan-300/[0.08] bg-[#071524] p-3">
                              <div className="min-w-0">
                                <p className="break-words text-sm font-black text-white">{item.item_name}</p>
                                <p className="mt-1 text-xs font-bold text-slate-500">الكمية: {item.quantity} × {formatCurrency(item.unit_price)}</p>
                              </div>
                              <p className="self-center text-sm font-black text-cyan-200">{formatCurrency(item.line_total)}</p>
                            </div>
                          )) : (
                            <p className="rounded-[18px] border border-dashed border-cyan-300/10 px-4 py-6 text-center text-sm font-bold text-slate-500">لا توجد تفاصيل منتجات متاحة.</p>
                          )}
                        </div>
                      </section>

                      <section className="rounded-[22px] border border-cyan-300/10 bg-[#071524] p-4">
                        <div className="flex items-center justify-between gap-3 text-sm font-bold text-slate-400">
                          <span>الإجمالي الفرعي</span>
                          <span>{formatCurrency(selectedMobileOrder.subtotal)}</span>
                        </div>
                        {selectedMobileOrder.discount > 0 ? (
                          <div className="mt-3 flex items-center justify-between gap-3 text-sm font-bold text-emerald-300">
                            <span>الخصم</span>
                            <span>{formatCurrency(selectedMobileOrder.discount)}</span>
                          </div>
                        ) : null}
                        <div className="mt-3 flex items-center justify-between gap-3 text-sm font-bold text-slate-400">
                          <span>الضريبة</span>
                          <span>{formatCurrency(selectedMobileOrder.tax)}</span>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3 border-t border-cyan-300/10 pt-4">
                          <span className="text-base font-black text-white">الإجمالي</span>
                          <span className="text-2xl font-black text-cyan-200">{formatCurrency(selectedMobileOrder.total)}</span>
                        </div>
                      </section>

                      {selectedMobileOrder.payment_method && selectedMobileOrder.payment_method !== '—' ? (
                        <section className="rounded-[22px] border border-cyan-300/10 bg-[#071524] p-4">
                          <h4 className="text-sm font-black text-white">الدفع</h4>
                          <div className="mt-3 flex items-center justify-between gap-3 text-sm font-bold text-slate-400">
                            <span>وسيلة الدفع</span>
                            <span className="text-slate-200">{selectedMobileOrder.payment_method}</span>
                          </div>
                          {selectedMobileOrder.payment_status && selectedMobileOrder.payment_status !== '—' ? (
                            <div className="mt-3 flex items-center justify-between gap-3 text-sm font-bold text-slate-400">
                              <span>حالة الدفع</span>
                              <span className="text-slate-200">{selectedMobileOrder.payment_status}</span>
                            </div>
                          ) : null}
                        </section>
                      ) : null}

                    </div>
                  </section>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
      <div className="pos-home-desktop-layout relative z-10 grid h-full w-full gap-3 overflow-y-auto overscroll-contain p-3 [direction:rtl] lg:grid-cols-[minmax(0,1fr)] lg:gap-6 lg:overflow-hidden lg:p-6 xl:grid-cols-[minmax(0,1fr)] xl:gap-8 xl:p-8">
        <aside className="pos-home-legacy-sidebar hidden">
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
                مرحباً بك، {employeeDisplayName}
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

          <section aria-label="ملخص الطلبات الظاهرة" className="mt-4 flex snap-x gap-2 overflow-x-auto pb-1 sm:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {mobileOrderStatusSummary.map(({ status, count }) => {
              const statusUi = POS_ORDER_STATUS_UI[status]

              return (
                <div
                  key={status}
                  className="min-h-[94px] min-w-[104px] shrink-0 snap-start rounded-[18px] border border-cyan-300/10 bg-[#07111f] p-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
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

          <section className="mt-4 flex min-h-0 flex-1 flex-col overflow-visible rounded-[24px] bg-transparent p-0 sm:mt-6 sm:rounded-[28px] sm:bg-[rgba(2,8,23,0.60)] sm:p-5 sm:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08),inset_0_0_28px_rgba(34,211,238,0.03)] lg:overflow-hidden xl:mt-8">
            <div className="mb-4 flex min-h-[54px] shrink-0 items-center justify-between gap-4 rounded-[18px] border border-cyan-300/15 bg-[#07111f] px-4 sm:min-h-0 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0">
                <div className="text-right">
                  <h2 className="text-sm font-black text-cyan-300 sm:text-xl sm:text-white xl:text-2xl">سجل الطلبات</h2>
                  <p className="mt-1 hidden text-xs font-semibold text-slate-500 sm:block xl:text-sm">
                    أحدث ستة طلبات خلال آخر 48 ساعة
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {ordersLoading ? (
                    <span className="rounded-full border border-[rgba(34,211,238,0.18)] bg-[rgba(34,211,238,0.075)] px-3 py-1 text-xs font-bold text-cyan-100">
                      تحميل...
                    </span>
                  ) : null}
                  <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-2xl text-cyan-300 sm:hidden">
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M7 12h10M10 17h4" strokeLinecap="round"/><path d="M7 4v6M17 9v6" strokeLinecap="round"/></svg>
                  </span>
                  <Link
                    href="/pos/order-history"
                    prefetch={true}
                    className="hidden min-h-[44px] items-center rounded-2xl bg-[rgba(34,211,238,0.07)] px-4 text-xs font-black text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)] transition hover:bg-[rgba(34,211,238,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:inline-flex"
                  >
                    عرض سجل العمليات
                  </Link>
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

              {!showMobileRecentOrders && !ordersError && !ordersLoading && recentOrders.length > 0 ? (
                <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-visible sm:grid-cols-2 lg:overflow-y-auto lg:overscroll-contain lg:pr-1 lg:[scrollbar-width:none] lg:[-ms-overflow-style:none] lg:[&::-webkit-scrollbar]:hidden xl:gap-4">
                  {mapRecentOrders((order) => {
                    const statusKey = resolvePosKanbanStatus(order.status)
                    const statusUi = statusKey ? POS_ORDER_STATUS_UI[statusKey] : null
                    return (
                      <div
                        key={order.id}
                        className="flex min-h-[156px] flex-col justify-between rounded-[22px] border border-cyan-300/10 bg-[#07111f] p-4 shadow-[0_14px_34px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.035)] transition hover:bg-[rgba(34,211,238,0.045)] hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.14),0_0_18px_rgba(34,211,238,0.07)] sm:min-h-[118px] sm:rounded-[24px] sm:border-0 sm:bg-[rgba(6,20,38,0.54)] sm:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.07)] xl:min-h-[132px]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-lg font-black text-white">
                              {order.order_number}
                            </p>
                            <p className="mt-2 truncate text-sm font-bold text-slate-200 sm:hidden">
                              {order.customer_name || 'عميل نقدي'}
                            </p>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                              {formatPosGregorianDate(order.created_at)} · {formatOrderTime(order.created_at)}
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

                        <div className="flex items-end justify-between gap-3 border-t border-cyan-300/10 pt-3 sm:border-0 sm:pt-0">
                          <p className="text-xl font-black text-cyan-100">
                            {formatCurrency(order.total)}
                          </p>

                          <Link href="/pos/order-history" className="inline-flex min-h-[44px] items-center rounded-2xl bg-[rgba(34,211,238,0.08)] px-3 text-xs font-black text-cyan-100">عرض التفاصيل</Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}
          </section>
        </main>
      </div>
      )}
      </section>
    </main>
  )
}

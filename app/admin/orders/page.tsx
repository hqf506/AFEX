'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdminBranchFilter } from '@/components/admin-branch-filter'
import { useAdminBranchFilter } from '@/hooks/use-admin-branch-filter'
import {
  isBranchScopedWithoutBranchId,
  shouldFilterByBranch,
} from '@/lib/branch-access'
import {
  buildOrdersPageSummary,
  getTodayOrderRecords,
  mapOrderSummaryToOrderRecord,
  ORDER_STATUS_MAP,
  type OrderRecord,
  type OrderFilter,
} from '@/lib/orders/orders-page'
import { supabase } from '@/lib/supabase/client'
import { usePageAccess } from '@/hooks/use-page-access'
import { normalizeOrderRecord, type OrderStatus, type OrderSourceRow } from '@/lib/orders/normalize'
import {
  buildDeliveredOrderStatusWhatsAppMessage,
  buildReadyOrderStatusWhatsAppMessage,
  isSendableWhatsAppPhone,
} from '@/lib/whatsapp/messages'

function fixArabic(text: string) {
  try {
    return decodeURIComponent(escape(text))
  } catch {
    return text
  }
}

function maskDebugId(id: string | null | undefined) {
  if (!id || id.length <= 8) return '[missing]'
  return `${id.slice(0, 4)}...${id.slice(-4)}`
}

const EMPTY_DASH = '-'

const ORDERS_FETCH_LIMIT = 200

type OrdersFilterKey = OrderFilter | 'new' | 'delivered' | 'cancelled'
type AdminOrderStatus = 'in_progress' | 'ready' | 'closed' | 'cancelled'
type StatusEditOptionKey = AdminOrderStatus | 'delivered_closed'
type WhatsAppDeliveryStatus = 'sent' | 'failed' | 'not_sent' | 'pending'
type PageOrderRecord = OrderRecord & {
  status_raw: string
}

function filterOrders(
  orders: PageOrderRecord[],
  search: string,
  filter: OrdersFilterKey
) {
  const normalizedSearch = search.trim().toLowerCase()

  return orders.filter((order) => {
    const isCancelled = isCancelledOrder(order)

    if (filter === 'today') {
      const today = new Date().toISOString().slice(0, 10)
      if (!order.created_at.startsWith(today)) {
        return false
      }
    } else if (filter === 'cancelled') {
      if (!isCancelled) {
        return false
      }
    } else if (filter === 'delivered') {
      if (
        isCancelled ||
        (order.status !== 'closed' &&
          !['delivered', 'completed'].includes(order.status_raw))
      ) {
        return false
      }
    } else if (filter === 'new') {
      return false
    } else if (filter === 'all') {
      if (order.status === 'closed') {
        return false
      }
    } else {
      if (isCancelled || order.status !== filter) {
        return false
      }
    }

    if (!normalizedSearch) {
      return true
    }

    const haystack = [
      order.order_number,
      order.invoice_number,
      order.customer_phone,
      fixArabic(order.customer_name),
      fixArabic(order.payment_method),
      fixArabic(order.payment_status),
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(normalizedSearch)
  })
}

function buildOrderComparisonSignature(orders: PageOrderRecord[]) {
  return orders
    .map((order) =>
      [
        order.id,
        order.status,
        order.created_at,
        order.total,
        order.invoice_number,
      ].join('|')
    )
    .join('||')
}

const ORDER_STATUS_ACTIONS: Array<{
  status: string
  label: string
  description: string
}> = [
  {
    status: 'new',
    label: 'جديد',
    description: 'إرجاع الطلب إلى قائمة الطلبات الجديدة.',
  },
  {
    status: 'in_progress',
    label: 'قيد التنفيذ',
    description: 'بدء تنفيذ الطلب داخل الورشة.',
  },
  {
    status: 'ready',
    label: 'جاهز',
    description: 'تأكيد أن الطلب جاهز للاستلام.',
  },
  {
    status: 'delivered',
    label: 'مستلم',
    description: 'تأكيد أن العميل استلم الطلب.',
  },
]

const STANDARDIZED_ORDER_STATUS_ACTIONS: Array<{
  status: OrderStatus
  label: string
  description: string
}> = [
  {
    status: 'in_progress',
    label: 'قيد التنفيذ',
    description: 'بدء تنفيذ الطلب داخل الورشة.',
  },
  {
    status: 'ready',
    label: 'جاهز',
    description: 'تأكيد أن الطلب جاهز للتسليم.',
  },
  {
    status: 'closed',
    label: 'تم تسليم',
    description: 'تأكيد أن العميل استلم الطلب.',
  },
]

void ORDER_STATUS_ACTIONS
void STANDARDIZED_ORDER_STATUS_ACTIONS

const ORDER_FILTER_OPTIONS: { key: OrdersFilterKey; label: string }[] = [
  { key: 'today', label: 'اليوم' },
]

const ORDER_STATE_FILTER_OPTIONS: { key: OrdersFilterKey; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'in_progress', label: 'قيد التجهيز' },
  { key: 'ready', label: 'جاهز' },
  { key: 'delivered', label: 'تم التسليم' },
  { key: 'cancelled', label: 'ملغي' },
  ...ORDER_FILTER_OPTIONS,
]

const STATUS_EDIT_OPTIONS: Array<{
  id: StatusEditOptionKey
  value: AdminOrderStatus
  label: string
  disabled?: boolean
  hint?: string
}> = [
  { id: 'in_progress', value: 'in_progress', label: 'قيد التجهيز' },
  { id: 'ready', value: 'ready', label: 'جاهز' },
  { id: 'delivered_closed', value: 'closed', label: 'تم التسليم' },
  {
    id: 'cancelled',
    value: 'cancelled',
    label: 'ملغي',
    disabled: true,
    hint: 'الإلغاء يتم من مسار إلغاء الإيصال',
  },
]

const ORDER_STATUS_UI: Record<
  OrderStatus,
  { label: string; badgeClassName: string; dotClassName: string }
> = {
  in_progress: {
    label: 'قيد التجهيز',
    badgeClassName:
      'border-sky-400/35 bg-sky-500/10 text-sky-200 shadow-[0_0_18px_rgba(14,165,233,0.12)]',
    dotClassName: 'bg-sky-300',
  },
  ready: {
    label: 'جاهز',
    badgeClassName:
      'border-emerald-400/35 bg-emerald-500/10 text-emerald-200 shadow-[0_0_18px_rgba(16,185,129,0.12)]',
    dotClassName: 'bg-emerald-300',
  },
  closed: {
    label: 'تم التسليم',
    badgeClassName:
      'border-slate-400/25 bg-slate-500/10 text-slate-200 shadow-[0_0_18px_rgba(148,163,184,0.08)]',
    dotClassName: 'bg-slate-300',
  },
  unknown: {
    label: 'غير معروف',
    badgeClassName:
      'border-rose-400/35 bg-rose-500/10 text-rose-200 shadow-[0_0_18px_rgba(244,63,94,0.12)]',
    dotClassName: 'bg-rose-300',
  },
}

const CANCELLED_ORDER_UI = {
  label: 'ملغي',
  badgeClassName:
    'border-rose-400/35 bg-rose-500/10 text-rose-200 shadow-[0_0_18px_rgba(244,63,94,0.12)]',
  dotClassName: 'bg-rose-300',
}

const CANCELLED_RECEIPT_WHATSAPP_UI = {
  label: 'تم إلغاء الإيصال',
  className: 'border-rose-300/35 bg-rose-500/[0.12] text-rose-100',
  dotClassName: 'bg-rose-300',
}

function isCancelledOrder(order: OrderRecord) {
  const status = `${order.status || ''}`.toLowerCase()
  const paymentStatus = `${order.payment_status || ''}`.toLowerCase()
  const rawStatus = `${(order as PageOrderRecord).status_raw || ''}`.toLowerCase()

  return (
    status === 'cancelled' ||
    status === 'canceled' ||
    paymentStatus === 'cancelled' ||
    paymentStatus === 'canceled' ||
    rawStatus === 'cancelled' ||
    rawStatus === 'canceled'
  )
}

function getWhatsAppStatusUi(status: WhatsAppDeliveryStatus) {
  if (status === 'sent') {
    return {
      label: 'وصلت الرسالة',
      className: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100',
      dotClassName: 'bg-emerald-300',
    }
  }

  if (status === 'failed') {
    return {
      label: 'فشل الإرسال',
      className: 'border-rose-300/30 bg-rose-400/10 text-rose-100',
      dotClassName: 'bg-rose-300',
    }
  }

  if (status === 'pending') {
    return {
      label: 'قيد الإرسال',
      className: 'border-amber-300/30 bg-amber-400/10 text-amber-100',
      dotClassName: 'bg-amber-300',
    }
  }

  return {
    label: 'لم ترسل',
    className: 'border-slate-400/20 bg-slate-500/10 text-slate-300',
    dotClassName: 'bg-slate-400',
  }
}

function applyReadyOrderWhatsAppTemplate(
  template: string,
  order: OrderRecord,
  branchName: string,
  mapUrl: string,
  storeName: string
) {
  const trimmedTemplate = template.trim()

  if (!trimmedTemplate) {
    return buildReadyOrderStatusWhatsAppMessage({
      customerName: order.customer_name,
      orderNumber: order.order_number,
      storeName,
      branchName,
      mapUrl,
    })
  }

  const values: Record<string, string> = {
    store_name: storeName,
    storeName,
    branch_name: branchName,
    branchName,
    customer_name: order.customer_name,
    customerName: order.customer_name,
    order_number: order.order_number,
    orderNumber: order.order_number,
    total: String(order.total),
    map_url: mapUrl,
    mapUrl,
  }

  return trimmedTemplate.replace(
    /\{\{\s*(store_name|storeName|branch_name|branchName|customer_name|customerName|order_number|orderNumber|total|map_url|mapUrl)\s*\}\}|\{\s*(store_name|storeName|branch_name|branchName|customer_name|customerName|order_number|orderNumber|total|map_url|mapUrl)\s*\}/g,
    (_match, doubleBraceKey: string | undefined, singleBraceKey: string | undefined) =>
      values[doubleBraceKey || singleBraceKey || ''] || ''
  )
}

function applyDeliveredOrderWhatsAppTemplate(
  template: string,
  order: OrderRecord,
  branchName: string,
  storeName: string
) {
  const trimmedTemplate = template.trim()

  if (!trimmedTemplate) {
    return buildDeliveredOrderStatusWhatsAppMessage({
      customerName: order.customer_name,
      orderNumber: order.order_number,
      storeName,
      branchName,
    })
  }

  const values: Record<string, string> = {
    store_name: storeName,
    storeName,
    branch_name: branchName,
    branchName,
    customer_name: order.customer_name,
    customerName: order.customer_name,
    order_number: order.order_number,
    orderNumber: order.order_number,
    total: String(order.total),
    map_url: '',
    mapUrl: '',
  }

  return trimmedTemplate.replace(
    /\{\{\s*(store_name|storeName|branch_name|branchName|customer_name|customerName|order_number|orderNumber|total|map_url|mapUrl)\s*\}\}|\{\s*(store_name|storeName|branch_name|branchName|customer_name|customerName|order_number|orderNumber|total|map_url|mapUrl)\s*\}/g,
    (_match, doubleBraceKey: string | undefined, singleBraceKey: string | undefined) =>
      values[doubleBraceKey || singleBraceKey || ''] || ''
  )
}

export default function OrdersPage() {
  const access = usePageAccess(['admin', 'employee'])
  const authLoading = access.loading
  const allowed = access.allowed
  const role = access.userRole
  const branchId = access.branchId
  const tenantId = access.tenantId
  const scopeType = access.scopeType
  const {
    isSystemAdmin,
    branches,
    loadingBranches,
    selectedBranchId,
    selectedBranchName,
    effectiveBranchId,
    setSelectedBranchId,
  } = useAdminBranchFilter(scopeType, branchId, allowed, tenantId)

  const [orders, setOrders] = useState<PageOrderRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<OrdersFilterKey>('all')
  const [statusModalOrder, setStatusModalOrder] =
    useState<PageOrderRecord | null>(null)
  const [statusModalValue, setStatusModalValue] =
    useState<AdminOrderStatus>('in_progress')
  const [statusModalOptionKey, setStatusModalOptionKey] =
    useState<StatusEditOptionKey>('in_progress')
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const [whatsappStatusByOrderId, setWhatsappStatusByOrderId] = useState<
    Record<string, WhatsAppDeliveryStatus>
  >({})

  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('orders_sound_enabled') !== 'false'
  })

  const initializedRef = useRef(false)
  const isFetchInFlightRef = useRef(false)
  const ordersSignatureRef = useRef('')
  const previousOrderIdsRef = useRef<Set<string>>(new Set())

  const roleValue = role ? String(role) : ''
  const canManageOrders = role === 'admin' || roleValue === 'manager'
  const canUseOrderSound = role === 'admin' || role === 'employee'

  const showSuccess = (message: string) => {
    setSuccessMessage(message)
    setTimeout(() => setSuccessMessage(''), 3000)
  }

  const showError = (message: string) => {
    setErrorMessage(message)
    setTimeout(() => setErrorMessage(''), 5000)
  }

  const playNewOrderSound = useCallback(() => {
    try {
      const audioContext = new window.AudioContext()

      const osc1 = audioContext.createOscillator()
      const osc2 = audioContext.createOscillator()
      const gain = audioContext.createGain()

      osc1.type = 'sine'
      osc2.type = 'triangle'

      osc1.frequency.setValueAtTime(784, audioContext.currentTime)
      osc1.frequency.exponentialRampToValueAtTime(
        1046,
        audioContext.currentTime + 0.18
      )

      osc2.frequency.setValueAtTime(523, audioContext.currentTime)
      osc2.frequency.exponentialRampToValueAtTime(
        784,
        audioContext.currentTime + 0.18
      )

      gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
      gain.gain.exponentialRampToValueAtTime(
        0.09,
        audioContext.currentTime + 0.03
      )
      gain.gain.exponentialRampToValueAtTime(
        0.05,
        audioContext.currentTime + 0.16
      )
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        audioContext.currentTime + 0.45
      )

      osc1.connect(gain)
      osc2.connect(gain)
      gain.connect(audioContext.destination)

      osc1.start(audioContext.currentTime)
      osc2.start(audioContext.currentTime)
      osc1.stop(audioContext.currentTime + 0.45)
      osc2.stop(audioContext.currentTime + 0.45)

      osc2.onended = () => {
        void audioContext.close()
      }
    } catch (error) {
      console.error('Sound playback error:', error)
    }
  }, [])

  const fetchOrders = useCallback(
    async (silent = false) => {
      if (isFetchInFlightRef.current) return
      isFetchInFlightRef.current = true

      if (silent) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setErrorMessage('')

      try {
        if (!tenantId) {
          console.warn('[admin/orders] blocked fetch without tenant', {
            tenantId: maskDebugId(tenantId),
          })
          setOrders([])
          ordersSignatureRef.current = ''
          setLastUpdated(new Date().toLocaleTimeString('ar-SA'))
          showError('تعذر تحميل الطلبات: لا يوجد tenant مرتبط بالحساب')
          setLoading(false)
          setRefreshing(false)
          return
        }

        if (isBranchScopedWithoutBranchId(scopeType, branchId)) {
          setOrders([])
          ordersSignatureRef.current = ''
          setLastUpdated(new Date().toLocaleTimeString('ar-SA'))
          setLoading(false)
          setRefreshing(false)
          return
        }

        let query = supabase
          .from('orders')
          .select(`
          id,
          order_number,
          branch_id,
          status,
          created_at,
          customers (
            name,
            phone
          ),
          invoices (
            invoice_number,
            payment_method,
            payment_status,
            note,
            total,
            subtotal,
            discount,
            tax,
            cash_received,
            remaining_from_customer,
            cash_change,
            invoice_items (
              item_name_snapshot,
              item_type_snapshot,
              quantity,
              unit_price,
              line_total
            )
          )
        `)
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(ORDERS_FETCH_LIMIT)

        if (shouldFilterByBranch(scopeType, branchId)) {
          query = query.eq('branch_id', branchId as string)
        } else if (effectiveBranchId) {
          query = query.eq('branch_id', effectiveBranchId)
        }

        const {
          data: {
            user,
          },
        } = await supabase.auth.getUser()
        const { data, error } = await query

      if (error) {
        console.error('Supabase orders fetch error:', error)
          showError(`فشل تحميل الطلبات: ${error.message}`)
        setOrders([])
        ordersSignatureRef.current = ''
        setLoading(false)
        setRefreshing(false)
        return
      }

      const rows = Array.isArray(data) ? (data as OrderSourceRow[]) : []
      console.info('[admin/orders] tenant-scoped fetch', {
        userId: maskDebugId(user?.id),
        tenantId: maskDebugId(tenantId),
        ordersCount: rows.length,
      })
      const normalized = rows
        .map((row, index) => ({
          ...mapOrderSummaryToOrderRecord(normalizeOrderRecord(row, index)),
          status_raw: typeof row.status === 'string' ? row.status : '',
        }))
      const nextIds = new Set(normalized.map((order) => order.id))

      if (!initializedRef.current) {
        previousOrderIdsRef.current = nextIds
        initializedRef.current = true
      } else {
        const newOrdersOnly = normalized.filter(
          (order) =>
            !previousOrderIdsRef.current.has(order.id) &&
            order.status === 'in_progress'
        )

        if (newOrdersOnly.length > 0 && soundEnabled && canUseOrderSound) {
          playNewOrderSound()
            showSuccess(`دخل ${newOrdersOnly.length} طلب جديد`)
        }

        previousOrderIdsRef.current = nextIds
      }

      const nextSignature = buildOrderComparisonSignature(normalized)

      if (ordersSignatureRef.current !== nextSignature) {
        ordersSignatureRef.current = nextSignature
        setOrders(normalized)
      }

      setLastUpdated(new Date().toLocaleTimeString('ar-SA'))
      setLoading(false)
      setRefreshing(false)
      } finally {
        isFetchInFlightRef.current = false
      }
    },
    [
      playNewOrderSound,
      soundEnabled,
      canUseOrderSound,
      scopeType,
      branchId,
      effectiveBranchId,
      tenantId,
    ]
  )

  useEffect(() => {
    localStorage.setItem(
      'orders_sound_enabled',
      soundEnabled ? 'true' : 'false'
    )
  }, [soundEnabled])

  useEffect(() => {
    initializedRef.current = false
    previousOrderIdsRef.current = new Set()
  }, [effectiveBranchId])

  useEffect(() => {
    if (!allowed) return

    const timeoutId = window.setTimeout(() => {
      void fetchOrders()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [allowed, fetchOrders])

  useEffect(() => {
    if (!allowed) return

    const interval = setInterval(() => {
      if (document.hidden) return
      fetchOrders(true)
    }, 15000)

    return () => clearInterval(interval)
  }, [allowed, fetchOrders])

  useEffect(() => {
    if (!allowed) return

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void fetchOrders(true)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [allowed, fetchOrders])

  useEffect(() => {
    if (!allowed || orders.length === 0) return

    const orderIds = new Set(orders.map((order) => order.id))
    let cancelled = false

    async function fetchWhatsAppDeliveryStatus() {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('created_at, metadata')
        .eq('action', 'whatsapp.message_sent')
        .eq('entity_type', 'whatsapp_message')
        .order('created_at', { ascending: false })
        .limit(500)

      if (cancelled || error || !Array.isArray(data)) {
        return
      }

      const nextStatuses: Record<string, WhatsAppDeliveryStatus> = {}

      for (const log of data) {
        const metadata =
          log && typeof log.metadata === 'object' && log.metadata
            ? (log.metadata as Record<string, unknown>)
            : null
        const orderId =
          typeof metadata?.order_id === 'string' ? metadata.order_id : ''

        if (orderId && orderIds.has(orderId) && !nextStatuses[orderId]) {
          nextStatuses[orderId] = 'sent'
        }
      }

      setWhatsappStatusByOrderId((current) => ({
        ...nextStatuses,
        ...current,
      }))
    }

    void fetchWhatsAppDeliveryStatus()

    return () => {
      cancelled = true
    }
  }, [allowed, orders])

  const todayOrders = useMemo(() => {
    return getTodayOrderRecords(orders)
  }, [orders])

  const filteredOrders = useMemo(() => {
    return filterOrders(orders, search, filter)
  }, [orders, search, filter])

  const stats = useMemo(() => {
    return buildOrdersPageSummary(
      orders.filter((order) => !isCancelledOrder(order)),
      todayOrders
    )
  }, [orders, todayOrders])

  const cancelledOrdersCount = useMemo(() => {
    return orders.filter(isCancelledOrder).length
  }, [orders])

  const deliveredOrdersCount = useMemo(() => {
    return orders.filter(
      (order) =>
        !isCancelledOrder(order) &&
        (order.status === 'closed' ||
          ['delivered', 'completed'].includes(order.status_raw))
    ).length
  }, [orders])

  const selectedStatusOption = useMemo(() => {
    return (
      STATUS_EDIT_OPTIONS.find((option) => option.id === statusModalOptionKey) ||
      STATUS_EDIT_OPTIONS.find((option) => option.value === statusModalValue)
    )
  }, [statusModalOptionKey, statusModalValue])

  const branchNameById = useMemo(() => {
    return new Map(
      branches.map((branch) => [
        branch.id,
        branch.display_branch_name?.trim() || branch.name,
      ])
    )
  }, [branches])

  const branchStoreNameById = useMemo(() => {
    return new Map(
      branches.map((branch) => [
        branch.id,
        branch.display_store_name?.trim() || '',
      ])
    )
  }, [branches])

  const branchMapUrlById = useMemo(() => {
    return new Map(
      branches.map((branch) => {
        const branchDetails = branch as typeof branch & {
          map_url?: string | null
          mapUrl?: string | null
          google_maps_url?: string | null
          googleMapsUrl?: string | null
          location_url?: string | null
          locationUrl?: string | null
        }

        return [
          branch.id,
          branchDetails.map_url ||
            branchDetails.mapUrl ||
            branchDetails.google_maps_url ||
            branchDetails.googleMapsUrl ||
            branchDetails.location_url ||
            branchDetails.locationUrl ||
            '',
        ]
      })
    )
  }, [branches])

  const getOrderBranchLabel = (order: OrderRecord) => {
    if (!order.branch_id) return 'غير محدد'

    const branchName = branchNameById.get(order.branch_id)
    if (branchName) return fixArabic(branchName)

    if (order.branch_id === branchId && selectedBranchName) {
      return fixArabic(selectedBranchName)
    }

    return 'فرع محدد'
  }

  const getOrderBranchMapUrl = (order: OrderRecord) => {
    if (!order.branch_id) return ''
    return branchMapUrlById.get(order.branch_id) || ''
  }

  const getOrderStoreName = (order: OrderRecord) => {
    if (!order.branch_id) return ''
    return branchStoreNameById.get(order.branch_id) || ''
  }

  const updateStatus = async (
    order: PageOrderRecord,
    status: AdminOrderStatus
  ) => {
    if (!canManageOrders) {
      showError('لا تملك صلاحية لتغيير حالة الطلب')
      return
    }

    if (status === 'cancelled') {
      showError('إلغاء الطلب يتم من مسار إلغاء الإيصال وليس من حالة الطلب')
      return
    }

    if (!access.tenantId) {
      showError('تعذر تحديد نطاق المنشأة لتحديث الطلب')
      return
    }

    if (updatingId) return

    setUpdatingId(order.id)
    setErrorMessage('')
    setSuccessMessage('')

    const response = await fetch(`/api/admin/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    })
    const result = await response.json().catch(() => null)
    const error = { message: result?.error || 'تعذر تحديث حالة الطلب' }

    if (!response.ok || !result?.success) {
      setUpdatingId(null)
      showError(`فشل تحديث حالة الطلب: ${error.message}`)
      return
    }

    setOrders((prev) => {
      const nextOrders = prev.map((item) =>
        item.id === order.id ? { ...item, status } : item
      )
      ordersSignatureRef.current = buildOrderComparisonSignature(nextOrders)
      return nextOrders
    })

    const shouldSendReadyNotification =
      order.status !== status &&
      status === 'ready' &&
      isSendableWhatsAppPhone(order.customer_phone)
    const shouldSendDeliveredNotification =
      order.status !== status &&
      status === 'closed' &&
      isSendableWhatsAppPhone(order.customer_phone)

    if (shouldSendReadyNotification || shouldSendDeliveredNotification) {
      setWhatsappStatusByOrderId((current) => ({
        ...current,
        [order.id]: 'pending',
      }))

      try {
        const response = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: order.customer_phone,
            branchId: effectiveBranchId || order.branch_id || branchId || undefined,
            mode: 'text',
            text: shouldSendReadyNotification
              ? applyReadyOrderWhatsAppTemplate(
                  '',
                  order,
                  getOrderBranchLabel(order),
                  getOrderBranchMapUrl(order),
                  getOrderStoreName(order)
                )
              : applyDeliveredOrderWhatsAppTemplate(
                  '',
                  order,
                  getOrderBranchLabel(order),
                  getOrderStoreName(order)
                ),
            notification: {
              orderId: order.id,
              status,
              channel: 'whatsapp',
            },
          }),
        })

        const result = await response.json().catch(() => null)

        if (!response.ok || !result?.success) {
          setWhatsappStatusByOrderId((current) => ({
            ...current,
            [order.id]: 'failed',
          }))
          showError('تم تحديث الحالة لكن فشل إرسال الواتساب')
          setUpdatingId(null)
          return
        }
        setWhatsappStatusByOrderId((current) => ({
          ...current,
          [order.id]: 'sent',
        }))
      } catch (err) {
        console.error('WhatsApp send error:', err)
        setWhatsappStatusByOrderId((current) => ({
          ...current,
          [order.id]: 'failed',
        }))
        showError('تم تحديث الحالة لكن فشل إرسال الواتساب')
        setUpdatingId(null)
        return
      }
    }

    showSuccess('تم تحديث الحالة بنجاح')
    setStatusModalOrder(null)
    setStatusDropdownOpen(false)
    setUpdatingId(null)
  }

  const printThermalReceipt = (order: OrderRecord) => {
    const printWindow = window.open('', '_blank', 'width=420,height=800')

    if (!printWindow) {
      showError('تعذر فتح نافذة الطباعة')
      return
    }

    const itemsHtml =
      order.items.length > 0
        ? order.items
            .map(
              (item) => `
                <div class="item">
                  <div class="item-name">${item.item_name}</div>
                  <div class="item-meta">
                    <span>الكمية: ${item.quantity}</span>
                    <span>الوحدة: ${item.unit_price} ر.س</span>
                  </div>
                  <div class="item-total">الإجمالي: ${item.line_total} ر.س</div>
                </div>
              `
            )
            .join('')
        : `<div class="empty">لا توجد عناصر</div>`

    const statusLabel = ORDER_STATUS_MAP[order.status]?.label || EMPTY_DASH
    const printedAt = new Date().toLocaleString('ar-SA')

    printWindow.document.write(`
      <html lang="ar" dir="rtl">
        <head>
          <title>طباعة حرارية - ${order.order_number}</title>
          <style>
            @page { size: 80mm auto; margin: 4mm; }
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
              color: #000;
              background: #fff;
              width: 72mm;
              direction: rtl;
            }
            .receipt { width: 100%; padding: 4mm 2mm; box-sizing: border-box; }
            .center { text-align: center; }
            .title { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
            .subtitle { font-size: 12px; margin-bottom: 12px; }
            .line { border-top: 1px dashed #000; margin: 10px 0; }
            .row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; margin-bottom: 6px; }
            .label { font-weight: 700; }
            .value { text-align: left; word-break: break-word; }
            .section-title { font-size: 13px; font-weight: 700; margin: 10px 0 6px; }
            .item { border-bottom: 1px dashed #000; padding: 6px 0; }
            .item-name { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
            .item-meta { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; margin-bottom: 4px; }
            .item-total { font-size: 12px; font-weight: 700; }
            .total-box {
              margin-top: 10px;
              padding-top: 8px;
              border-top: 2px solid #000;
              font-size: 15px;
              font-weight: 700;
              display: flex;
              justify-content: space-between;
            }
            .note { font-size: 11px; margin-top: 8px; white-space: pre-wrap; }
            .footer { text-align: center; font-size: 11px; margin-top: 14px; }
            .empty { font-size: 11px; color: #444; text-align: center; padding: 8px 0; }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="center">
              <div class="title">AFEX</div>
              <div class="subtitle">فاتورة طباعة حرارية</div>
            </div>

            <div class="line"></div>

            <div class="row"><span class="label">رقم الطلب</span><span class="value">${order.order_number}</span></div>
            <div class="row"><span class="label">رقم الفاتورة</span><span class="value">${order.invoice_number}</span></div>
            <div class="row"><span class="label">اسم العميل</span><span class="value">${fixArabic(order.customer_name)}</span></div>
            <div class="row"><span class="label">الجوال</span><span class="value">${order.customer_phone}</span></div>
            <div class="row"><span class="label">الحالة</span><span class="value">${fixArabic(statusLabel)}</span></div>
            <div class="row"><span class="label">الدفع</span><span class="value">${fixArabic(order.payment_method)}</span></div>
            <div class="row"><span class="label">تاريخ الطلب</span><span class="value">${
              order.created_at
                ? new Date(order.created_at).toLocaleString('ar-SA')
                : EMPTY_DASH
            }</span></div>

            <div class="line"></div>
            <div class="section-title">العناصر</div>
            ${itemsHtml}

            <div class="total-box">
              <span>الإجمالي</span>
              <span>${order.total} ر.س</span>
            </div>

            ${
              fixArabic(order.note) !== EMPTY_DASH
                ? `<div class="line"></div><div class="note"><strong>ملاحظة:</strong> ${fixArabic(order.note)}</div>`
                : ''
            }

            <div class="line"></div>

            <div class="footer">
              <div>وقت الطباعة: ${printedAt}</div>
              <div style="margin-top:6px;">شكراً لتعاملكم معنا</div>
            </div>
          </div>

          <script>
            window.onload = function () {
              window.print();
            };
          </script>
        </body>
      </html>
    `)

    printWindow.document.close()
  }
  void printThermalReceipt

  if (authLoading) {
    return (
      <div className="w-full max-w-full overflow-x-hidden bg-transparent text-white">
        <div className="rounded-3xl border border-cyan-300/10 bg-[#07111d]/90 p-5 text-sm font-bold text-slate-300 shadow-[0_0_40px_rgba(34,211,238,0.06)]">
          جارٍ التحقق من الصلاحية...
        </div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="w-full max-w-full overflow-x-hidden bg-transparent text-white">
        <div className="rounded-3xl border border-cyan-300/10 bg-[#07111d]/90 p-5 text-sm font-bold text-slate-300 shadow-[0_0_40px_rgba(34,211,238,0.06)]">
          <div className="text-slate-300">جارٍ التحويل...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-transparent text-white">
      <div className="min-w-0 space-y-4">
        {successMessage && <div className="success-alert">{fixArabic(successMessage)}</div>}
        {errorMessage && <div className="error-alert">{fixArabic(errorMessage)}</div>}

        <section dir="rtl" className="w-full max-w-full space-y-5 text-white">
          <div className="relative overflow-hidden rounded-[28px] border border-cyan-300/15 bg-[#07111d]/90 p-5 backdrop-blur-xl">
            <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-cyan-400/12 blur-3xl" />
            <div className="pointer-events-none absolute -left-24 bottom-0 h-52 w-52 rounded-full bg-blue-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-400/10 text-cyan-200 shadow-[0_0_28px_rgba(34,211,238,0.18)]">
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 5h12M6 9h12M6 13h8M6 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2h11A2.5 2.5 0 0 1 20 4.5v15A2.5 2.5 0 0 1 17.5 22h-11A2.5 2.5 0 0 1 4 19.5v-15Z" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-200/70">AFEX Orders</p>
                  <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">حالة الطلبات</h1>
                  <p className="mt-2 text-sm text-slate-400">عرض ومتابعة حالة الطلبات من جدول واحد سريع وواضح.</p>
                  <p className="mt-2 text-xs text-slate-500">
                    آخر تحديث: {lastUpdated || EMPTY_DASH}
                    {refreshing ? ' • جارٍ التحديث...' : ''}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canUseOrderSound ? (
                  <button
                    type="button"
                    onClick={() => {
                      const nextValue = !soundEnabled
                      setSoundEnabled(nextValue)

                      if (nextValue) {
                        playNewOrderSound()
                        showSuccess('تم تشغيل الصوت')
                      } else {
                        showSuccess('تم إيقاف الصوت')
                      }
                    }}
                    className={`h-11 rounded-2xl border px-4 text-sm font-bold transition ${
                      soundEnabled
                        ? 'border-cyan-300/30 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/15'
                        : 'border-cyan-300/10 bg-cyan-300/[0.035] text-slate-300 hover:bg-cyan-300/[0.07]'
                    }`}
                  >
                    {soundEnabled ? 'الصوت مفعل' : 'الصوت متوقف'}
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => fetchOrders()}
                  className="h-11 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.035] px-4 text-sm font-bold text-white transition hover:border-cyan-300/45 hover:bg-cyan-400/10"
                >
                  تحديث
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
            {[
              { label: 'الكل', value: orders.length, filterKey: 'all' as const, tone: 'from-indigo-500/20 to-blue-500/5', icon: 'M7 7h10M7 12h10M7 17h6' },
              { label: 'قيد التجهيز', value: stats.inProgressCount, filterKey: 'in_progress' as const, tone: 'from-sky-500/20 to-cyan-500/5', icon: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
              { label: 'جاهز', value: stats.readyCount, filterKey: 'ready' as const, tone: 'from-amber-500/20 to-orange-500/5', icon: 'M20 7 10 17l-5-5' },
              { label: 'تم التسليم', value: deliveredOrdersCount, filterKey: 'delivered' as const, tone: 'from-emerald-500/20 to-green-500/5', icon: 'M5 12l4 4L19 6' },
              { label: 'ملغي', value: cancelledOrdersCount, filterKey: 'cancelled' as const, tone: 'from-rose-500/20 to-red-500/5', icon: 'M6 6l12 12M18 6 6 18' },
            ].map((card) => {
              const isActive = filter === card.filterKey

              return (
              <button
                type="button"
                key={card.label}
                onClick={() => setFilter(card.filterKey)}
                aria-pressed={isActive}
                className={`min-h-[76px] cursor-pointer rounded-2xl border bg-gradient-to-br ${card.tone} p-3 text-right shadow-[0_0_28px_rgba(0,0,0,0.16)] transition-all duration-150 hover:-translate-y-0.5 hover:border-cyan-300/40 hover:shadow-[0_0_26px_rgba(34,211,238,0.12)] active:scale-[0.98] ${
                  isActive
                    ? 'border-cyan-300/70 ring-2 ring-cyan-300/25'
                    : 'border-cyan-300/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate whitespace-nowrap text-xs font-bold text-slate-300">{card.label}</p>
                    <p className="mt-1 text-2xl font-black leading-none text-white">{card.value}</p>
                  </div>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/[0.045] text-cyan-200">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d={card.icon} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              </button>
              )
            })}
          </div>

          <div className="rounded-[22px] border border-cyan-300/10 bg-[#07111d]/90 p-3 backdrop-blur-xl">
            <div className="grid items-end gap-3 xl:grid-cols-[minmax(280px,1fr)_minmax(360px,1.4fr)_minmax(190px,0.65fr)_auto]">
              <div className="relative">
                <label className="mb-1.5 block text-xs font-bold text-slate-400">
                  بحث
                </label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث برقم الطلب أو اسم العميل أو الجوال..."
                  className="h-10 w-full rounded-xl border border-cyan-300/15 bg-cyan-300/[0.03] px-3 pr-10 text-right text-xs font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/55 focus:ring-2 focus:ring-cyan-300/15"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-cyan-200/70">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="m21 21-4.2-4.2M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </span>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-400">
                  الفترة / الحالة
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {ORDER_STATE_FILTER_OPTIONS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setFilter(item.key)}
                      className={`h-9 rounded-xl px-3 text-xs font-black transition ${
                        filter === item.key
                          ? 'bg-cyan-300 text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.25)]'
                          : 'border border-cyan-300/10 bg-cyan-300/[0.03] text-slate-300 hover:border-cyan-300/35 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                {isSystemAdmin ? (
                  <AdminBranchFilter
                    branches={branches}
                    selectedBranchId={selectedBranchId}
                    loading={loadingBranches}
                    onChange={setSelectedBranchId}
                    className="min-w-0"
                  />
                ) : (
                  <div className="text-right">
                    <label className="mb-1.5 block text-xs font-bold text-slate-400">
                      الفرع
                    </label>
                    <div className="flex h-10 items-center rounded-xl border border-cyan-300/10 bg-cyan-300/[0.03] px-3 text-xs font-black text-slate-200">
                      {selectedBranchName ? fixArabic(selectedBranchName) : EMPTY_DASH}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex h-10 items-center justify-end whitespace-nowrap text-xs font-bold text-slate-400">
                عرض {filteredOrders.length} من {orders.length} طلب
              </div>
            </div>
          </div>

          <div className="max-w-full overflow-hidden rounded-[30px] border border-cyan-300/10 bg-[#07111d]/95 shadow-[0_0_45px_rgba(34,211,238,0.06)] backdrop-blur-xl">
            <div className="flex items-end justify-between gap-4 border-b border-cyan-300/10 px-5 py-4">
              <div className="text-right">
                <h2 className="text-2xl font-black text-white">جدول الطلبات</h2>
                <p className="mt-1 text-sm text-slate-400">أزرار الحالة تستخدم نفس منطق تحديث الطلب الحالي.</p>
              </div>
              <p className="text-left text-sm font-bold text-cyan-100">{filteredOrders.length} طلب</p>
            </div>

            {loading ? (
              <div className="py-16 text-center text-sm font-bold text-slate-400">جارٍ تحميل الطلبات...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="py-16 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-400/10 text-cyan-200">
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 5h12M6 10h12M6 15h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="mt-4 text-sm font-bold text-white">لا توجد طلبات مطابقة</p>
                <p className="mt-1 text-xs text-slate-500">جرّب تغيير الفلتر أو البحث.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] table-fixed text-right" dir="rtl">
                  <colgroup>
                    <col className="w-[150px]" />
                    <col className="w-[180px]" />
                    <col className="w-[150px]" />
                    <col className="w-[140px]" />
                    <col className="w-[190px]" />
                    <col className="w-[330px]" />
                  </colgroup>
                  <thead className="bg-[#0b1626]/90">
                    <tr className="border-b border-cyan-300/10 text-[11px] font-black text-slate-300">
                      <th className="px-4 py-3">رقم الفاتورة / الطلب</th>
                      <th className="px-4 py-3">العميل</th>
                      <th className="px-4 py-3">الجوال</th>
                      <th className="px-4 py-3">الفرع</th>
                      <th className="px-4 py-3">الحالة / واتساب</th>
                      <th className="px-4 py-3">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => {
                      const orderIsCancelled = isCancelledOrder(order)
                      const statusUi = orderIsCancelled
                        ? CANCELLED_ORDER_UI
                        : ORDER_STATUS_UI[order.status]
                      const isUpdating = updatingId === order.id
                      const canPrepare =
                        canManageOrders && !orderIsCancelled && order.status === 'in_progress'
                      const canDeliver =
                        canManageOrders && !orderIsCancelled && order.status === 'ready'
                      const isClosed = order.status === 'closed'
                      const whatsAppStatusUi = getWhatsAppStatusUi(
                        whatsappStatusByOrderId[order.id] || 'not_sent'
                      )
                      const deliveryStatusUi = orderIsCancelled
                        ? CANCELLED_RECEIPT_WHATSAPP_UI
                        : whatsAppStatusUi

                      return (
                        <tr
                          key={order.id}
                          className="border-b border-cyan-300/10 bg-[#07111d]/60 transition hover:bg-cyan-400/[0.055]"
                        >
                          <td className="px-4 py-4 align-middle">
                            <div className="space-y-1">
                              <p className="text-sm font-black text-white">{order.invoice_number || order.order_number}</p>
                              <p className="text-[11px] font-bold text-slate-500">{order.order_number}</p>
                              <p className="text-[11px] font-bold text-cyan-100/65">
                                {order.created_at
                                  ? new Date(order.created_at).toLocaleString('ar-SA', {
                                      dateStyle: 'medium',
                                      timeStyle: 'short',
                                    })
                                  : EMPTY_DASH}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-4 align-middle">
                            <p className="truncate text-sm font-bold text-slate-100">{fixArabic(order.customer_name)}</p>
                          </td>
                          <td className="px-4 py-4 align-middle">
                            <p className="text-sm font-bold text-slate-300">{order.customer_phone}</p>
                          </td>
                          <td className="px-4 py-4 align-middle">
                            <p className="truncate text-sm font-bold text-slate-300">{getOrderBranchLabel(order)}</p>
                          </td>
                          <td className="px-4 py-4 align-middle">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-black ${statusUi.badgeClassName}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${statusUi.dotClassName}`} />
                                {statusUi.label}
                              </span>
                              <span className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-black ${deliveryStatusUi.className}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${deliveryStatusUi.dotClassName}`} />
                                {deliveryStatusUi.label}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4 align-middle">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                disabled={!canManageOrders || isUpdating}
                                onClick={() => {
                                  const nextStatus =
                                    order.status === 'unknown'
                                      ? 'in_progress'
                                      : order.status
                                  setStatusModalOrder(order)
                                  setStatusModalValue(nextStatus)
                                  setStatusModalOptionKey(
                                    nextStatus === 'closed'
                                      ? 'delivered_closed'
                                      : nextStatus
                                  )
                                  setStatusDropdownOpen(false)
                                }}
                                className="h-9 rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-3 text-[11px] font-black text-cyan-100 transition hover:bg-cyan-400/15 hover:shadow-[0_0_14px_rgba(34,211,238,0.16)] disabled:cursor-not-allowed disabled:border-slate-500/25 disabled:bg-slate-500/10 disabled:text-slate-500 disabled:hover:shadow-none"
                              >
                                تعديل الحالة
                              </button>
                              <button
                                type="button"
                                disabled={!canPrepare || isUpdating}
                                onClick={() => updateStatus(order, 'ready')}
                                className="h-9 rounded-xl border border-sky-300/35 bg-sky-500/15 px-3 text-[11px] font-black text-sky-100 transition hover:bg-sky-500/25 hover:shadow-[0_0_14px_rgba(14,165,233,0.18)] disabled:cursor-not-allowed disabled:border-slate-500/25 disabled:bg-slate-500/10 disabled:text-slate-500 disabled:hover:shadow-none"
                              >
                                تم التجهيز
                              </button>
                              <button
                                type="button"
                                disabled={!canDeliver || isUpdating || isClosed}
                                onClick={() => updateStatus(order, 'closed')}
                                className="h-9 rounded-xl border border-emerald-300/35 bg-emerald-500/15 px-3 text-[11px] font-black text-emerald-100 transition hover:bg-emerald-500/25 hover:shadow-[0_0_14px_rgba(16,185,129,0.18)] disabled:cursor-not-allowed disabled:border-slate-500/25 disabled:bg-slate-500/10 disabled:text-slate-500 disabled:hover:shadow-none"
                              >
                                تم التسليم
                              </button>
                              <button
                                type="button"
                                disabled
                                title="إلغاء الطلب غير متاح حاليًا"
                                className="h-9 cursor-not-allowed rounded-xl border border-rose-300/25 bg-rose-500/10 px-3 text-[11px] font-black text-rose-300/60 opacity-70"
                              >
                                إلغاء الطلب
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {statusModalOrder ? (
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-[28px] border border-cyan-300/20 bg-[#07111d] p-5 text-right shadow-[0_30px_100px_rgba(0,0,0,0.55)]">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200/70">
                      AFEX Orders
                    </p>
                    <h3 className="mt-2 text-xl font-black text-white">
                      تعديل الحالة
                    </h3>
                    <p className="mt-1 text-xs font-bold text-slate-400">
                      {statusModalOrder.order_number}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusModalOrder(null)
                      setStatusDropdownOpen(false)
                    }}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-black text-slate-300 transition hover:border-cyan-300/30 hover:text-cyan-100"
                  >
                    إلغاء
                  </button>
                </div>

                <label className="mb-2 block text-sm font-bold text-slate-300">
                  الحالة الجديدة
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setStatusDropdownOpen((open) => !open)}
                    className="flex h-12 w-full items-center justify-between rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] px-4 text-right text-sm font-bold text-white outline-none transition hover:border-cyan-300/35 hover:bg-cyan-300/[0.055] focus:border-cyan-300/55 focus:ring-2 focus:ring-cyan-300/15"
                    aria-haspopup="listbox"
                    aria-expanded={statusDropdownOpen}
                  >
                    <span className="flex min-w-0 flex-col items-start">
                      <span className="truncate">{selectedStatusOption?.label}</span>
                      {selectedStatusOption?.hint ? (
                        <span className="mt-0.5 truncate text-[11px] font-bold text-slate-500">
                          {selectedStatusOption.hint}
                        </span>
                      ) : null}
                    </span>
                    <svg
                      className={`h-4 w-4 shrink-0 text-cyan-200 transition ${
                        statusDropdownOpen ? 'rotate-180' : ''
                      }`}
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="m6 9 6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>

                  {statusDropdownOpen ? (
                    <div
                      className="absolute right-0 top-[calc(100%+8px)] z-[140] w-full overflow-hidden rounded-xl border border-cyan-300/20 bg-[#07111d] p-1.5 shadow-[0_20px_55px_rgba(0,0,0,0.42),0_0_26px_rgba(34,211,238,0.12)]"
                      role="listbox"
                    >
                      {STATUS_EDIT_OPTIONS.map((option) => {
                        const isSelected = statusModalOptionKey === option.id

                        return (
                          <button
                            key={option.id}
                            type="button"
                            disabled={option.disabled}
                            onClick={() => {
                              if (option.disabled) return
                              setStatusModalValue(option.value)
                              setStatusModalOptionKey(option.id)
                              setStatusDropdownOpen(false)
                            }}
                            className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-right text-sm font-black transition ${
                              option.disabled
                                ? 'cursor-not-allowed text-slate-500 opacity-55'
                                : isSelected
                                  ? 'border border-cyan-300/25 bg-cyan-300/[0.12] text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.11)]'
                                  : 'text-slate-200 hover:bg-cyan-300/[0.075] hover:text-cyan-100'
                            }`}
                            role="option"
                            aria-selected={isSelected}
                          >
                            <span className="min-w-0">
                              <span className="block truncate">{option.label}</span>
                              {option.hint ? (
                                <span className="mt-0.5 block truncate text-[11px] font-bold text-slate-500">
                                  {option.hint}
                                </span>
                              ) : null}
                            </span>
                            {isSelected ? (
                              <svg
                                className="h-4 w-4 shrink-0 text-cyan-200"
                                viewBox="0 0 24 24"
                                fill="none"
                                aria-hidden="true"
                              >
                                <path
                                  d="M20 7 10 17l-5-5"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStatusModalOrder(null)
                      setStatusDropdownOpen(false)
                    }}
                    className="h-11 rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-sm font-black text-slate-300 transition hover:border-white/25 hover:text-white"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    disabled={updatingId === statusModalOrder.id}
                    onClick={() => updateStatus(statusModalOrder, statusModalValue)}
                    className="h-11 rounded-2xl border border-cyan-300/30 bg-cyan-400/15 px-5 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/25 disabled:cursor-wait disabled:opacity-60"
                  >
                    {updatingId === statusModalOrder.id
                      ? 'جارٍ الحفظ...'
                      : 'حفظ الحالة'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>

      </div>
    </div>
  )
}

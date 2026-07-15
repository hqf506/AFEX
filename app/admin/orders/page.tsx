'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { AdminBranchFilter } from '@/components/admin-branch-filter'
import { useAdminBranchFilter } from '@/hooks/use-admin-branch-filter'
import {
  isBranchScopedWithoutBranchId,
  shouldFilterByBranch,
} from '@/lib/branch-access'
import {
  mapOrderSummaryToOrderRecord,
  type OrderRecord,
  type OrderFilter,
} from '@/lib/orders/orders-page'
import { supabase } from '@/lib/supabase/client'
import { applyTenantFilter } from '@/lib/tenant-filter'
import {
  buildWhatsAppStatusByOrderId,
  mergePersistentWhatsAppStatuses,
  type WhatsAppDeliveryStatus,
} from '@/lib/orders/whatsapp-status'
import { usePageAccess } from '@/hooks/use-page-access'
import { useSystemSettings } from '@/hooks/use-system-settings'
import { FeatureDisabledState } from '@/components/feature-disabled-state'
import { normalizeOrderRecord, type OrderStatus, type OrderSourceRow } from '@/lib/orders/normalize'
import {
  buildDeliveredOrderStatusWhatsAppMessage,
  buildReadyOrderStatusWhatsAppMessage,
  isSendableWhatsAppPhone,
} from '@/lib/whatsapp/messages'
import {
  renderThermalInvoiceHtml,
  type ThermalPaperWidth,
} from '@/lib/invoices/thermal-template'
import {
  normalizeDigitalInvoiceNote,
  normalizeDigitalInvoicePaymentMethod,
} from '@/lib/invoices/digital-preview'
import {
  fitThermalPreviewIframe,
  getThermalPreviewWidth,
  prepareThermalInvoicePreviewHtml,
} from '@/lib/invoices/thermal-preview'
import { INVOICE_UX_MESSAGES } from '@/lib/invoice-ux-messages'
import { ADMIN_UX_MESSAGES } from '@/lib/admin-ux-messages'

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

const ORDERS_PAGE_SIZE = 25
const WHATSAPP_FEATURE_DISABLED_MESSAGE =
  'ميزة الواتساب غير مفعلة من إعدادات النظام.'
const INVALID_STATUS_SEQUENCE_MESSAGE = 'لا يمكن تغيير الحالة بهذا التسلسل.'

type OrdersFilterKey = OrderFilter | 'new' | 'delivered' | 'cancelled'
type AdminOrderStatus = 'in_progress' | 'ready' | 'closed' | 'cancelled'
type StatusEditOptionKey = AdminOrderStatus | 'delivered_closed'
type NotificationChannel = 'whatsapp' | 'email' | 'sms' | 'push' | 'system'
type NotificationAuditAction =
  | 'invoice.payment_snapshot_failed'
  | 'invoice.pdf_generation_failed'
  | 'whatsapp.message_failed'
  | 'whatsapp.message_sent'
type InvoicePdfAction = 'preview' | 'send' | 'print'
type PageOrderRecord = OrderRecord & {
  status_raw: string
  created_by_employee_id: string
  updated_at: string
}
type NotificationHistoryRecord = {
  id: string
  action: NotificationAuditAction
  created_at: string
  status: 'sent' | 'failed'
  messageType: string
  channel: NotificationChannel
  recipient: string
  error: string | undefined
}
type InvoicePreviewFrame = {
  title: string
  src?: string
  srcDoc?: string
  paperWidth?: ThermalPaperWidth
}

function buildOrderComparisonSignature(orders: PageOrderRecord[]) {
  return orders
    .map((order) =>
      [
        order.id,
        order.order_number,
        order.status,
        order.created_at,
        order.updated_at,
        order.total,
        order.invoice_number,
      ].join('|')
    )
    .join('||')
}

function mapOrderSourceRowToPageOrder(row: OrderSourceRow, index: number): PageOrderRecord {
  return {
    ...mapOrderSummaryToOrderRecord(normalizeOrderRecord(row, index)),
    status_raw: typeof row.status === 'string' ? row.status : '',
    created_by_employee_id:
      typeof row.created_by_employee_id === 'string'
        ? row.created_by_employee_id
        : '',
    updated_at:
      typeof row.updated_at === 'string' ? row.updated_at : '',
  }
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
    label: 'قيد التجهيز',
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
    label: 'قيد التجهيز',
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
      'border-amber-300/40 bg-amber-400/10 text-amber-100 shadow-[0_0_18px_rgba(245,158,11,0.12)]',
    dotClassName: 'bg-amber-300',
  },
  closed: {
    label: 'تم التسليم',
    badgeClassName:
      'border-emerald-400/35 bg-emerald-500/10 text-emerald-200 shadow-[0_0_18px_rgba(16,185,129,0.12)]',
    dotClassName: 'bg-emerald-300',
  },
  unknown: {
    label: 'لم تُحدد الحالة',
    badgeClassName:
      'border-slate-400/20 bg-slate-400/10 text-slate-300 shadow-[0_0_18px_rgba(148,163,184,0.08)]',
    dotClassName: 'bg-slate-400',
  },
}

const CANCELLED_ORDER_UI = {
  label: 'ملغي',
  badgeClassName:
    'border-rose-400/35 bg-rose-500/10 text-rose-200 shadow-[0_0_18px_rgba(244,63,94,0.12)]',
  dotClassName: 'bg-rose-300',
}

function formatDateTime(value?: string | null) {
  if (!value || value === EMPTY_DASH) return EMPTY_DASH
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return EMPTY_DASH

  return date.toLocaleString('ar-SA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatMoney(value: number) {
  return `${Number(value || 0).toLocaleString('ar-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ر.س`
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

function isFinalOrderStatus(order: OrderRecord) {
  return order.status === 'closed' || isCancelledOrder(order)
}

function isAllowedStatusTransition(
  order: OrderRecord,
  nextStatus: AdminOrderStatus
) {
  if (isFinalOrderStatus(order)) return false
  if (nextStatus === 'cancelled') return false
  if (order.status === 'in_progress') return nextStatus === 'ready'
  if (order.status === 'ready') return nextStatus === 'closed'
  return false
}

function getNextAllowedStatus(order: OrderRecord): AdminOrderStatus | null {
  if (order.status === 'in_progress' && !isFinalOrderStatus(order)) return 'ready'
  if (order.status === 'ready' && !isFinalOrderStatus(order)) return 'closed'
  return null
}

function getOrderStatusUi(order: OrderRecord) {
  return isCancelledOrder(order) ? CANCELLED_ORDER_UI : ORDER_STATUS_UI[order.status]
}

function isInteractiveOrderRowTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    ? Boolean(target.closest('button, a, input, select, textarea, [role="button"]'))
    : false
}

function OrderStatusBadge({ order }: { order: OrderRecord }) {
  const statusUi = getOrderStatusUi(order)

  return (
    <span
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-black ${statusUi.badgeClassName}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${statusUi.dotClassName}`} />
      {statusUi.label}
    </span>
  )
}

function DrawerSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="rounded-[24px] border border-cyan-300/12 bg-[#07111d]/85 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
      <h3 className="mb-3 text-base font-black text-white">{title}</h3>
      {children}
    </section>
  )
}

function DetailGrid({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`grid gap-2 sm:grid-cols-2 ${className}`}>{children}</div>
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-cyan-300/10 bg-[#091522]/75 px-3 py-2">
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-slate-100">
        {value || EMPTY_DASH}
      </p>
    </div>
  )
}

function FinancialCard({
  label,
  value,
  strong = false,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border px-3 py-3 ${
        strong
          ? 'border-cyan-300/25 bg-cyan-300/10'
          : 'border-cyan-300/10 bg-[#091522]/75'
      }`}
    >
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-base font-black text-white">{value}</p>
    </div>
  )
}

function EmptyDrawerText({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-cyan-300/10 bg-[#091522]/65 px-4 py-5 text-center text-sm font-bold text-slate-400">
      {children}
    </div>
  )
}

function NoteBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-cyan-300/10 bg-[#091522]/75 p-3">
      <p className="text-xs font-black text-cyan-100">{title}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-7 text-slate-200">
        {value}
      </p>
    </div>
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

function getNotificationChannel(rawChannel: unknown): NotificationChannel {
  return rawChannel === 'email' ||
    rawChannel === 'sms' ||
    rawChannel === 'push' ||
    rawChannel === 'system'
    ? rawChannel
    : 'whatsapp'
}

function getNotificationChannelUi(channel: NotificationChannel) {
  switch (channel) {
    case 'email':
      return {
        label: 'Email',
        icon: '🔵',
        dotClassName: 'bg-sky-300',
      }
    case 'sms':
      return {
        label: 'SMS',
        icon: '🟣',
        dotClassName: 'bg-violet-300',
      }
    case 'push':
      return {
        label: 'Push',
        icon: '🟠',
        dotClassName: 'bg-orange-300',
      }
    case 'system':
      return {
        label: 'النظام',
        icon: '🟠',
        dotClassName: 'bg-orange-300',
      }
    default:
      return {
        label: 'WhatsApp',
        icon: '🟢',
        dotClassName: 'bg-emerald-300',
      }
  }
}

function getNotificationTypeLabel(
  action: NotificationAuditAction,
  messageType: string
) {
  if (action === 'invoice.payment_snapshot_failed') {
    return 'فشل حفظ بيانات الدفع'
  }
  if (action === 'invoice.pdf_generation_failed') {
    return 'فشل إنشاء ملف الفاتورة'
  }
  if (action === 'whatsapp.message_failed') return 'فشل إرسال رسالة واتساب'
  if (action === 'whatsapp.message_sent') return 'تم إرسال رسالة واتساب'
  if (messageType === 'invoice_pdf') return 'فاتورة PDF'
  if (messageType === 'ready') return 'رسالة تم التجهيز'
  if (messageType === 'closed' || messageType === 'delivered') {
    return 'رسالة تم التسليم'
  }
  if (messageType === 'announcement') return 'Announcement'
  return messageType ? fixArabic(messageType) : 'إشعار'
}

function getNotificationAuditAction(value: unknown): NotificationAuditAction | null {
  if (
    value === 'invoice.payment_snapshot_failed' ||
    value === 'invoice.pdf_generation_failed' ||
    value === 'whatsapp.message_failed' ||
    value === 'whatsapp.message_sent'
  ) {
    return value
  }

  return null
}

function getNotificationFailureMessage(action: NotificationAuditAction) {
  if (action === 'invoice.payment_snapshot_failed') {
    return 'تعذر تأكيد بيانات الدفع المحفوظة.'
  }
  if (action === 'invoice.pdf_generation_failed') {
    return 'تعذر إنشاء ملف الفاتورة الرقمية.'
  }
  if (action === 'whatsapp.message_failed') {
    return 'تعذر إرسال فاتورة واتساب.'
  }

  return undefined
}

function getNotificationStatusLabel(entry: NotificationHistoryRecord) {
  if (entry.status === 'sent') return '✓ تم الإرسال'
  if (entry.action === 'invoice.payment_snapshot_failed') return '✕ فشل حفظ الدفع'
  if (entry.action === 'invoice.pdf_generation_failed') return '✕ فشل إنشاء PDF'
  return '✕ فشل الإرسال'
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
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalOrders, setTotalOrders] = useState(0)
  const [summaryCounts, setSummaryCounts] = useState({
    in_progress: 0,
    ready: 0,
    delivered: 0,
    cancelled: 0,
  })
  const [statusModalOrder, setStatusModalOrder] =
    useState<PageOrderRecord | null>(null)
  const [cancelModalOrder, setCancelModalOrder] =
    useState<PageOrderRecord | null>(null)
  const [statusModalValue, setStatusModalValue] =
    useState<AdminOrderStatus>('in_progress')
  const [statusModalOptionKey, setStatusModalOptionKey] =
    useState<StatusEditOptionKey>('in_progress')
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const [whatsappStatusByOrderId, setWhatsappStatusByOrderId] = useState<
    Record<string, WhatsAppDeliveryStatus>
  >({})
  const [invoicePdfActionByOrderId, setInvoicePdfActionByOrderId] = useState<
    Record<string, InvoicePdfAction | undefined>
  >({})
  const [detailsDrawerOrderId, setDetailsDrawerOrderId] = useState<string | null>(
    null
  )
  const [orderDetailsById, setOrderDetailsById] = useState<
    Record<string, PageOrderRecord>
  >({})
  const [orderDetailsLoadingId, setOrderDetailsLoadingId] = useState<
    string | null
  >(null)
  const [orderDetailsErrorById, setOrderDetailsErrorById] = useState<
    Record<string, string | undefined>
  >({})
  const [orderDetailsRetryKey, setOrderDetailsRetryKey] = useState(0)
  const [notificationHistoryByOrderId, setNotificationHistoryByOrderId] = useState<
    Record<string, NotificationHistoryRecord[]>
  >({})
  const [notificationHistoryLoadingId, setNotificationHistoryLoadingId] =
    useState<string | null>(null)
  const [employeeNameById, setEmployeeNameById] = useState<Record<string, string>>(
    {}
  )
  const [invoicePreviewFrame, setInvoicePreviewFrame] =
    useState<InvoicePreviewFrame | null>(null)
  const [thermalPreviewHeight, setThermalPreviewHeight] = useState(360)

  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('orders_sound_enabled') !== 'false'
  })

  const initializedRef = useRef(false)
  const isFetchInFlightRef = useRef(false)
  const isMetaFetchInFlightRef = useRef(false)
  const orderDetailsInFlightRef = useRef<Set<string>>(new Set())
  const ordersSignatureRef = useRef('')
  const previousOrderIdsRef = useRef<Set<string>>(new Set())
  const listAbortControllerRef = useRef<AbortController | null>(null)

  const roleValue = role ? String(role) : ''
  const canManageOrders =
    role === 'admin' || role === 'employee' || roleValue === 'manager'
  const canCancelOrders = canManageOrders
  const canUseOrderSound = role === 'admin' || role === 'employee'
  const { settings: systemSettings, loading: settingsLoading } =
    useSystemSettings(allowed && !authLoading)
  const whatsappFeatureEnabled = systemSettings?.enable_whatsapp !== false

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setCurrentPage(1)
    }, 300)
    return () => window.clearTimeout(timeoutId)
  }, [search])

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

        listAbortControllerRef.current?.abort()
        const controller = new AbortController()
        listAbortControllerRef.current = controller
        const params = new URLSearchParams({
          page: String(currentPage),
          pageSize: String(ORDERS_PAGE_SIZE),
          listFilter: filter,
        })
        if (debouncedSearch) params.set('search', debouncedSearch)
        if (effectiveBranchId) params.set('branchId', effectiveBranchId)
        if (filter === 'today') {
          const today = new Date().toISOString().slice(0, 10)
          params.set('dateFrom', today)
          params.set('dateTo', today)
        }

        const response = await fetch(`/api/orders?${params}`, {
          credentials: 'include',
          signal: controller.signal,
        })
        const result = await response.json().catch(() => null)
        if (!response.ok || !result?.success) {
          throw new Error(result?.message || 'فشل تحميل الطلبات')
        }

        const rows = Array.isArray(result.items) ? (result.items as OrderSourceRow[]) : []
        const nextTotalOrders = Number(result.totalCount) || 0
        setTotalOrders(nextTotalOrders)
        const nextTotalPages = Math.max(1, Math.ceil(nextTotalOrders / ORDERS_PAGE_SIZE))
        if (currentPage > nextTotalPages) {
          setCurrentPage(nextTotalPages)
          return
        }
        if (result.summary) {
          setSummaryCounts({
            in_progress: Number(result.summary.in_progress) || 0,
            ready: Number(result.summary.ready) || 0,
            delivered: Number(result.summary.delivered) || 0,
            cancelled: Number(result.summary.cancelled) || 0,
          })
        }
        if (result.employeeNames) {
          setEmployeeNameById((current) => ({ ...current, ...result.employeeNames }))
        }
      const normalized = rows.map(mapOrderSourceRowToPageOrder)
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
        setOrderDetailsById({})
        setOrderDetailsErrorById({})
      }

      setLastUpdated(new Date().toLocaleTimeString('ar-SA'))
      setLoading(false)
      setRefreshing(false)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        showError(error instanceof Error ? error.message : 'فشل تحميل الطلبات')
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
      currentPage,
      debouncedSearch,
      filter,
    ]
  )

  const checkOrdersMetaAndReload = useCallback(async () => {
    if (isMetaFetchInFlightRef.current || isFetchInFlightRef.current) return

    if (!tenantId || isBranchScopedWithoutBranchId(scopeType, branchId)) {
      return
    }

    isMetaFetchInFlightRef.current = true

    try {
      const params = new URLSearchParams({
        mode: 'meta',
        page: String(currentPage),
        pageSize: String(ORDERS_PAGE_SIZE),
        listFilter: filter,
      })

      if (debouncedSearch) params.set('search', debouncedSearch)
      if (filter === 'today') {
        const today = new Date().toISOString().slice(0, 10)
        params.set('dateFrom', today)
        params.set('dateTo', today)
      }

      const branchFilter = shouldFilterByBranch(scopeType, branchId)
        ? branchId
        : effectiveBranchId

      if (branchFilter) {
        params.set('branchId', branchFilter)
      }

      const response = await fetch(`/api/orders?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
      })
      const result = (await response.json().catch(() => null)) as
        | {
            success?: boolean
            comparisonSignature?: string
          }
        | null

      if (!response.ok || !result?.success) {
        return
      }

      const nextSignature = result.comparisonSignature || ''

      if (nextSignature !== ordersSignatureRef.current) {
        await fetchOrders(true)
      } else {
        setLastUpdated(new Date().toLocaleTimeString('ar-SA'))
      }
    } catch (error) {
      console.error('[admin/orders] lightweight metadata poll failed', error)
    } finally {
      isMetaFetchInFlightRef.current = false
    }
  }, [branchId, currentPage, debouncedSearch, effectiveBranchId, fetchOrders, filter, scopeType, tenantId])

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
      void checkOrdersMetaAndReload()
    }, 15000)

    return () => clearInterval(interval)
  }, [allowed, checkOrdersMetaAndReload])

  useEffect(() => {
    if (!allowed) return

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void checkOrdersMetaAndReload()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [allowed, checkOrdersMetaAndReload])

  useEffect(() => {
    if (!allowed || !tenantId || orders.length === 0) return

    const orderIds = new Set(orders.map((order) => order.id))
    let cancelled = false

    async function fetchWhatsAppDeliveryStatus() {
      let auditQuery = supabase
        .from('audit_logs')
        .select('action, created_at, metadata')
        .in('action', ['whatsapp.message_sent', 'whatsapp.message_failed'])
        .eq('entity_type', 'whatsapp_message')
        .in('metadata->>order_id', [...orderIds])
        .order('created_at', { ascending: false })
        .limit(1000)

      auditQuery = applyTenantFilter(auditQuery, tenantId)
      const { data, error } = await auditQuery

      if (cancelled) {
        return
      }

      if (error || !Array.isArray(data)) {
        console.error('[admin/orders] failed to load WhatsApp delivery status')
        return
      }

      const persistentStatuses = buildWhatsAppStatusByOrderId(data, orderIds)
      setWhatsappStatusByOrderId((current) =>
        mergePersistentWhatsAppStatuses(current, persistentStatuses)
      )
    }

    void fetchWhatsAppDeliveryStatus()

    return () => {
      cancelled = true
    }
  }, [allowed, orders, tenantId])

  const filteredOrders = orders
  const stats = {
    inProgressCount: summaryCounts.in_progress,
    readyCount: summaryCounts.ready,
  }
  const cancelledOrdersCount = summaryCounts.cancelled
  const deliveredOrdersCount = summaryCounts.delivered

  const detailsDrawerSummaryOrder = useMemo(() => {
    if (!detailsDrawerOrderId) return null
    return orders.find((order) => order.id === detailsDrawerOrderId) || null
  }, [detailsDrawerOrderId, orders])

  const detailsDrawerOrder = useMemo(() => {
    if (!detailsDrawerOrderId) return null
    return (
      orderDetailsById[detailsDrawerOrderId] ||
      detailsDrawerSummaryOrder ||
      null
    )
  }, [detailsDrawerOrderId, detailsDrawerSummaryOrder, orderDetailsById])

  const detailsDrawerIsLoading = Boolean(
    detailsDrawerOrderId &&
      orderDetailsLoadingId === detailsDrawerOrderId &&
      !orderDetailsById[detailsDrawerOrderId]
  )
  const detailsDrawerError = detailsDrawerOrderId
    ? orderDetailsErrorById[detailsDrawerOrderId] || ''
    : ''
  const detailsDrawerHasFullDetails = Boolean(
    detailsDrawerOrderId && orderDetailsById[detailsDrawerOrderId]
  )
  const detailsDrawerActionsDisabled =
    detailsDrawerIsLoading || Boolean(detailsDrawerError) || !detailsDrawerHasFullDetails

  useEffect(() => {
    if (
      !tenantId ||
      !detailsDrawerOrderId ||
      orderDetailsById[detailsDrawerOrderId] ||
      orderDetailsInFlightRef.current.has(detailsDrawerOrderId)
    ) {
      return
    }

    let cancelled = false
    const orderId = detailsDrawerOrderId

    async function fetchOrderDetails() {
      orderDetailsInFlightRef.current.add(orderId)
      setOrderDetailsLoadingId(orderId)
      setOrderDetailsErrorById((current) => {
        const nextErrors = { ...current }
        delete nextErrors[orderId]
        return nextErrors
      })

      try {
        const params = new URLSearchParams({
          mode: 'details',
          id: orderId,
        })
        const response = await fetch(`/api/orders?${params.toString()}`, {
          method: 'GET',
          credentials: 'include',
        })
        const result = (await response.json().catch(() => null)) as
          | {
              success?: boolean
              items?: unknown[]
            }
          | null

        if (cancelled) return

        if (!response.ok || !result?.success || !Array.isArray(result.items) || result.items.length === 0) {
          throw new Error('تعذر تحميل تفاصيل الطلب. يرجى المحاولة مرة أخرى.')
        }

        const detail = mapOrderSourceRowToPageOrder(
          result.items[0] as OrderSourceRow,
          0
        )

        setOrderDetailsById((current) => ({ ...current, [orderId]: detail }))
      } catch (error) {
        if (cancelled) return

        console.error('[admin/orders] failed to fetch order details', error)
        setOrderDetailsErrorById((current) => ({
          ...current,
          [orderId]: 'تعذر تحميل تفاصيل الطلب. يرجى المحاولة مرة أخرى.',
        }))
      } finally {
        orderDetailsInFlightRef.current.delete(orderId)

        if (!cancelled) {
          setOrderDetailsLoadingId((current) => (current === orderId ? null : current))
        }
      }
    }

    void fetchOrderDetails()

    return () => {
      cancelled = true
    }
  }, [detailsDrawerOrderId, orderDetailsById, orderDetailsRetryKey, tenantId])

  const drawerCustomerSummary = useMemo(() => {
    if (!detailsDrawerOrder) {
      return {
        visits: 0,
        spend: 0,
        lastVisit: '',
      }
    }

    const customerPhone = detailsDrawerOrder.customer_phone
    const customerOrders = orders.filter(
      (order) => order.customer_phone === customerPhone
    )
    const spend = customerOrders.reduce((sum, order) => sum + order.total, 0)
    const lastVisit =
      customerOrders
        .map((order) => order.created_at)
        .filter(Boolean)
        .sort()
        .at(-1) || ''

    return {
      visits: customerOrders.length,
      spend,
      lastVisit,
    }
  }, [detailsDrawerOrder, orders])

  useEffect(() => {
    if (
      !tenantId ||
      !detailsDrawerOrderId ||
      notificationHistoryByOrderId[detailsDrawerOrderId]
    ) {
      return
    }

    let cancelled = false

    async function fetchNotificationHistory(orderId: string) {
      setNotificationHistoryLoadingId(orderId)
      const maskedOrderId = maskDebugId(orderId)
      const matchingOrderIds = new Set([orderId, maskedOrderId])

      let auditQuery = supabase
        .from('audit_logs')
        .select('id, action, entity_type, entity_id, created_at, metadata')
        .in('action', [
          'invoice.payment_snapshot_failed',
          'invoice.pdf_generation_failed',
          'whatsapp.message_failed',
          'whatsapp.message_sent',
        ])
        .in('metadata->>order_id', [orderId, maskedOrderId])
        .order('created_at', { ascending: false })
        .limit(100)

      auditQuery = applyTenantFilter(auditQuery, tenantId)
      const { data, error } = await auditQuery

      if (cancelled) return

      if (error || !Array.isArray(data)) {
        setNotificationHistoryByOrderId((current) => ({
          ...current,
          [orderId]: [],
        }))
        setNotificationHistoryLoadingId(null)
        return
      }

      const fallbackRecipient = detailsDrawerOrder?.customer_phone || EMPTY_DASH
      const history = data
        .map((log) => {
          const action = getNotificationAuditAction(log.action)

          if (!action) return null

          const metadata =
            log && typeof log.metadata === 'object' && log.metadata
              ? (log.metadata as Record<string, unknown>)
              : null
          const notification =
            metadata?.notification &&
            typeof metadata.notification === 'object' &&
            !Array.isArray(metadata.notification)
              ? (metadata.notification as Record<string, unknown>)
              : null
          const logOrderId =
            typeof metadata?.order_id === 'string'
              ? metadata.order_id
              : typeof metadata?.orderId === 'string'
                ? metadata.orderId
                : typeof notification?.orderId === 'string'
                  ? notification.orderId
                  : typeof log.entity_id === 'string'
                    ? log.entity_id
                    : ''

          if (!matchingOrderIds.has(logOrderId)) return null

          const messageType =
            (typeof metadata?.order_status === 'string'
              ? metadata.order_status
              : '') ||
            (typeof metadata?.status === 'string' ? metadata.status : '') ||
            (typeof notification?.status === 'string'
              ? notification.status
              : '') ||
            (typeof metadata?.type === 'string' ? metadata.type : '') ||
            (metadata?.has_file === true ? 'invoice_pdf' : 'whatsapp')
          const recipient =
            (typeof metadata?.recipient === 'string'
              ? metadata.recipient
              : '') ||
            (typeof metadata?.recipient_masked === 'string'
              ? metadata.recipient_masked
              : '') ||
            (typeof notification?.recipient === 'string'
              ? notification.recipient
              : '') ||
            fallbackRecipient

          return {
            id: typeof log.id === 'string' ? log.id : `${orderId}-${log.created_at}`,
            action,
            created_at:
              typeof log.created_at === 'string' ? log.created_at : '',
            status:
              action === 'whatsapp.message_sent' ? 'sent' : 'failed',
            messageType,
            channel: action.startsWith('invoice.')
              ? 'system'
              : getNotificationChannel(
                  notification?.channel || metadata?.channel
                ),
            recipient: action.startsWith('invoice.') ? EMPTY_DASH : recipient,
            error: getNotificationFailureMessage(action),
          } satisfies NotificationHistoryRecord
        })
        .filter(
          (item): item is NotificationHistoryRecord => item !== null
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at))

      setNotificationHistoryByOrderId((current) => ({
        ...current,
        [orderId]: history,
      }))
      setNotificationHistoryLoadingId(null)
    }

    void fetchNotificationHistory(detailsDrawerOrderId)

    return () => {
      cancelled = true
    }
  }, [
    detailsDrawerOrder?.customer_phone,
    detailsDrawerOrderId,
    notificationHistoryByOrderId,
    tenantId,
  ])

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
    if (!order.branch_id) return 'غير مرتبط بفرع'

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

  const buildInvoicePdfPayload = (order: PageOrderRecord) => {
    const invoiceItems = order.items.map((item) => ({
      item_id: null,
      item_name: item.item_name,
      item_type: item.item_type === 'product' ? 'product' : 'service',
      quantity: item.quantity,
      unit_price: item.unit_price,
    }))

    return {
      invoiceItems,
      invoiceNumber: order.invoice_number,
      orderNumber: order.order_number,
      customerName: fixArabic(order.customer_name),
      customerPhone: order.customer_phone,
      branchName: getOrderBranchLabel(order),
      paymentMethod: normalizeDigitalInvoicePaymentMethod(
        order.payment_method_key === 'unknown'
          ? order.payment_method
          : order.payment_method_key
      ),
      numericCashReceived: order.cash_received,
      remainingFromCustomer: order.remaining_from_customer,
      cashChange: order.cash_change,
      subtotal: order.subtotal || order.total,
      discount: order.discount,
      tax: order.tax,
      finalTotal: order.total,
      note: normalizeDigitalInvoiceNote(fixArabic(order.note)),
      issuedAt: order.created_at,
    }
  }

  const buildThermalInvoiceHtmlForOrder = (order: OrderRecord) =>
    renderThermalInvoiceHtml({
      thermalLogoUrl: systemSettings?.logo_url || undefined,
      thermalBrandName:
        systemSettings?.thermal_invoice_brand_name ||
        systemSettings?.store_name ||
        undefined,
      thermalBranchName:
        systemSettings?.thermal_invoice_branch_name ||
        getOrderBranchLabel(order),
      addressLine1: systemSettings?.digital_invoice_address_line_1 || undefined,
      addressLine2: systemSettings?.digital_invoice_address_line_2 || undefined,
      thermalPaperWidth:
        systemSettings?.thermal_invoice_paper_width === '58mm'
          ? ('58mm' as ThermalPaperWidth)
          : ('80mm' as ThermalPaperWidth),
      thermalShowCustomerPhone:
        systemSettings?.thermal_invoice_show_customer_phone ?? true,
      thermalShowPaymentMethod:
        systemSettings?.thermal_invoice_show_payment_method ?? true,
      thermalShowNote: systemSettings?.thermal_invoice_show_note ?? true,
      thermalNote: systemSettings?.thermal_invoice_note ?? undefined,
      thermalFooterMessage:
        systemSettings?.thermal_invoice_footer_message || undefined,
      thermalShowWhatsapp:
        systemSettings?.thermal_invoice_show_whatsapp ?? true,
      thermalShowInstagram:
        systemSettings?.thermal_invoice_show_instagram ?? false,
      thermalShowTiktok:
        systemSettings?.thermal_invoice_show_tiktok ?? false,
      thermalShowGoogleReview:
        systemSettings?.thermal_invoice_show_google_review ?? true,
      thermalShowMap: systemSettings?.thermal_invoice_show_map ?? true,
      whatsappNumber:
        systemSettings?.digital_invoice_whatsapp_number || undefined,
      instagramLink:
        systemSettings?.digital_invoice_instagram_link || undefined,
      tiktokLink: systemSettings?.digital_invoice_tiktok_link || undefined,
      googleReviewLink:
        systemSettings?.digital_invoice_google_review_link || undefined,
      mapLink:
        systemSettings?.digital_invoice_map_link ||
        getOrderBranchMapUrl(order) ||
        undefined,
      customerName: fixArabic(order.customer_name),
      customerPhone: order.customer_phone,
      invoiceNumber: order.invoice_number,
      orderNumber: order.order_number,
      issuedAt: order.created_at,
      paymentMethod:
        order.payment_method_key === 'unknown'
          ? order.payment_method
          : order.payment_method_key,
      invoiceItems: order.items.map((item) => ({
        item_name: fixArabic(item.item_name),
        name: fixArabic(item.item_name),
        item_type: item.item_type === 'product' ? 'product' : 'service',
        quantity: item.quantity,
        unit_price: item.unit_price,
        price: item.unit_price,
        line_total: item.line_total,
      })),
      subtotal: order.subtotal || order.total,
      taxAmount: order.tax,
      finalTotal: order.total,
      total: order.total,
      numericCashReceived: order.cash_received,
      remainingFromCustomer: order.remaining_from_customer,
      cashChange: order.cash_change,
      note: order.note === EMPTY_DASH ? '' : fixArabic(order.note),
    })

  const encodeInvoicePreviewPayload = (order: PageOrderRecord) => {
    const json = JSON.stringify(buildInvoicePdfPayload(order))
    const bytes = new TextEncoder().encode(json)
    let binary = ''

    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }

    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  }

  const previewDigitalInvoice = (order: PageOrderRecord) => {
    if (order.items.length === 0) {
      showError('لا توجد عناصر في الفاتورة لمعاينة PDF')
      return
    }

    setInvoicePdfActionByOrderId((current) => ({
      ...current,
      [order.id]: 'preview',
    }))

    try {
      const payload = encodeInvoicePreviewPayload(order)
      window.open(`/api/invoices/pdf?format=html&payload=${payload}`, '_blank')
    } catch (error) {
      console.error('Invoice preview error:', error)
      showError(INVOICE_UX_MESSAGES.previewFailure)
    } finally {
      setInvoicePdfActionByOrderId((current) => ({
        ...current,
        [order.id]: undefined,
      }))
    }
  }
  void previewDigitalInvoice

  const previewDigitalInvoiceInPage = (order: PageOrderRecord) => {
    if (order.items.length === 0) {
      showError('لا توجد عناصر في الفاتورة لمعاينة PDF')
      return
    }

    try {
      const payload = encodeInvoicePreviewPayload(order)
      setInvoicePreviewFrame({
        title: 'معاينة الفاتورة الرقمية',
        src: `/api/invoices/pdf?format=html&payload=${payload}`,
      })
    } catch (error) {
      console.error('Invoice preview error:', error)
      showError(INVOICE_UX_MESSAGES.previewFailure)
    }
  }

  const sendDigitalInvoicePdf = async (order: PageOrderRecord) => {
    if (!canManageOrders) {
      showError('لا تملك صلاحية لإرسال الفاتورة الرقمية')
      return
    }

    if (!whatsappFeatureEnabled) {
      showError(INVOICE_UX_MESSAGES.providerDisabled)
      return
    }

    if (!isSendableWhatsAppPhone(order.customer_phone)) {
      showError(INVOICE_UX_MESSAGES.missingPhone)
      return
    }

    if (order.items.length === 0) {
      showError('لا توجد عناصر في الفاتورة لإرسال PDF')
      return
    }

    if (invoicePdfActionByOrderId[order.id]) return

    setInvoicePdfActionByOrderId((current) => ({
      ...current,
      [order.id]: 'send',
    }))
    setWhatsappStatusByOrderId((current) => ({
      ...current,
      [order.id]: 'pending',
    }))

    let sendStage: 'pdf' | 'whatsapp' = 'pdf'
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 30000)

    try {
      const pdfResponse = await fetch('/api/invoices/pdf?delivery=whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildInvoicePdfPayload(order)),
        signal: controller.signal,
      })
      const pdfResult = await pdfResponse.json().catch(() => null)

      if (!pdfResponse.ok || !pdfResult?.success || !pdfResult?.fileUrl) {
        throw new Error('safe-pdf-failure')
      }

      const invoiceNumber = order.invoice_number || ''
      const safeInvoiceNumber = `\u200E${invoiceNumber}\u200E`

      sendStage = 'whatsapp'
      const whatsappResponse = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'file',
          to: order.customer_phone,
          branchId: effectiveBranchId || order.branch_id || branchId || undefined,
          fileUrl: pdfResult.fileUrl,
          filename:
            typeof pdfResult.filename === 'string'
              ? pdfResult.filename
              : `${order.invoice_number || order.order_number || 'invoice'}.pdf`,
          caption: `فاتورتك من: ${getOrderStoreName(order)}\nرقم الفاتورة: ${safeInvoiceNumber}`,
          notification: {
            orderId: order.id,
            status: 'invoice_pdf',
            channel: 'whatsapp',
          },
        }),
        signal: controller.signal,
      })
      const whatsappResult = await whatsappResponse.json().catch(() => null)

      if (!whatsappResponse.ok || !whatsappResult?.success) {
        throw new Error('safe-whatsapp-failure')
      }

      setWhatsappStatusByOrderId((current) => ({
        ...current,
        [order.id]: 'sent',
      }))
      showSuccess(INVOICE_UX_MESSAGES.whatsappSuccess)
    } catch (error) {
      console.error('Invoice PDF WhatsApp send error:', error)
      setWhatsappStatusByOrderId((current) => ({
        ...current,
        [order.id]: 'failed',
      }))
      showError(
        error instanceof DOMException && error.name === 'AbortError'
          ? sendStage === 'whatsapp'
            ? INVOICE_UX_MESSAGES.whatsappTimeout
            : INVOICE_UX_MESSAGES.pdfFailureAfterSavedOrder
          : sendStage === 'pdf'
            ? INVOICE_UX_MESSAGES.pdfFailureAfterSavedOrder
            : INVOICE_UX_MESSAGES.whatsappFailure
      )
    } finally {
      window.clearTimeout(timeoutId)
      setInvoicePdfActionByOrderId((current) => ({
        ...current,
        [order.id]: undefined,
      }))
    }
  }

  const updateStatus = async (
    order: PageOrderRecord,
    status: AdminOrderStatus
  ) => {
    if (!canManageOrders) {
      showError('لا تملك صلاحية لتغيير حالة الطلب')
      return
    }

    if (!isAllowedStatusTransition(order, status)) {
      showError(INVALID_STATUS_SEQUENCE_MESSAGE)
      return
    }

    const nextOrderStatus = status as OrderStatus

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

    if (!response.ok || !result?.success) {
      setUpdatingId(null)
      showError(ADMIN_UX_MESSAGES.orderStatusFailure)
      return
    }

    setOrders((prev) => {
      const nextOrders = prev.map((item) =>
        item.id === order.id ? { ...item, status: nextOrderStatus } : item
      )
      ordersSignatureRef.current = buildOrderComparisonSignature(nextOrders)
      return nextOrders
    })
    setOrderDetailsById((current) => {
      const nextDetails = { ...current }
      delete nextDetails[order.id]
      return nextDetails
    })
    setOrderDetailsErrorById((current) => {
      const nextErrors = { ...current }
      delete nextErrors[order.id]
      return nextErrors
    })

    const shouldSendReadyNotification =
      order.status !== status &&
      status === 'ready' &&
      isSendableWhatsAppPhone(order.customer_phone)
    const shouldSendDeliveredNotification =
      order.status !== status &&
      status === 'closed' &&
      isSendableWhatsAppPhone(order.customer_phone)

    if (
      (shouldSendReadyNotification || shouldSendDeliveredNotification) &&
      whatsappFeatureEnabled
    ) {
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
                  systemSettings?.whatsapp_order_ready_message_template || '',
                  order,
                  getOrderBranchLabel(order),
                  getOrderBranchMapUrl(order),
                  getOrderStoreName(order)
                )
              : applyDeliveredOrderWhatsAppTemplate(
                  systemSettings?.whatsapp_order_delivered_message_template || '',
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
    } else if (
      (shouldSendReadyNotification || shouldSendDeliveredNotification) &&
      !whatsappFeatureEnabled
    ) {
      setWhatsappStatusByOrderId((current) => ({
        ...current,
        [order.id]: 'not_sent',
      }))
      showError(WHATSAPP_FEATURE_DISABLED_MESSAGE)
    }

    showSuccess(ADMIN_UX_MESSAGES.orderStatusSuccess)
    setStatusModalOrder(null)
    setStatusDropdownOpen(false)
    setUpdatingId(null)
  }

  const cancelOrder = async (order: PageOrderRecord) => {
    if (!canCancelOrders) {
      showError('لا تملك صلاحية إلغاء الطلب')
      return
    }

    if (isCancelledOrder(order)) {
      showError('الطلب ملغي مسبقًا')
      return
    }

    if (!access.tenantId) {
      showError('تعذر تحديد نطاق المنشأة لإلغاء الطلب')
      return
    }

    if (updatingId) return

    setUpdatingId(order.id)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const response = await fetch(
        `/api/admin/receipts/${encodeURIComponent(order.id)}/cancel`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        showError(ADMIN_UX_MESSAGES.orderCancelFailure)
        return
      }

      setOrders((prev) => {
        const nextOrders = prev.map((item) =>
          item.id === order.id
            ? {
                ...item,
                payment_status: 'cancelled',
                status_raw: 'cancelled',
              }
            : item
        )
        ordersSignatureRef.current = buildOrderComparisonSignature(nextOrders)
        return nextOrders
      })
      setOrderDetailsById((current) => {
        const nextDetails = { ...current }
        delete nextDetails[order.id]
        return nextDetails
      })
      setOrderDetailsErrorById((current) => {
        const nextErrors = { ...current }
        delete nextErrors[order.id]
        return nextErrors
      })

      setWhatsappStatusByOrderId((current) => ({
        ...current,
        [order.id]: 'not_sent',
      }))
      setCancelModalOrder(null)
      showSuccess('تم إلغاء الطلب بنجاح')
      void fetchOrders(true)
    } catch (error) {
      console.error('[admin/orders] cancel order failed', error)
      showError(ADMIN_UX_MESSAGES.orderCancelFailure)
    } finally {
      setUpdatingId(null)
    }
  }

  const printThermalReceipt = (order: OrderRecord) => {
    if (invoicePdfActionByOrderId[order.id]) return

    setInvoicePdfActionByOrderId((current) => ({
      ...current,
      [order.id]: 'print',
    }))
    showSuccess(INVOICE_UX_MESSAGES.printPreparing)
    const printWindow = window.open('', '_blank', 'width=420,height=800')

    if (!printWindow) {
      showError(INVOICE_UX_MESSAGES.printPreparationFailure)
      setInvoicePdfActionByOrderId((current) => ({
        ...current,
        [order.id]: undefined,
      }))
      return
    }

    try {
      printWindow.document.write(
        buildThermalInvoiceHtmlForOrder(order).replace(
          '</body>',
          '<script>window.onload = function () { window.print(); };</script></body>'
        )
      )
      printWindow.document.close()
      showSuccess(INVOICE_UX_MESSAGES.printDialogOpened)
    } catch {
      printWindow.close()
      showError(INVOICE_UX_MESSAGES.printFailureAfterSavedOrder)
    } finally {
      setInvoicePdfActionByOrderId((current) => ({
        ...current,
        [order.id]: undefined,
      }))
    }
  }
  void printThermalReceipt

  const previewThermalInvoiceInPage = (order: PageOrderRecord) => {
    setThermalPreviewHeight(360)
    const paperWidth =
      systemSettings?.thermal_invoice_paper_width === '58mm' ? '58mm' : '80mm'
    setInvoicePreviewFrame({
      title: 'معاينة الفاتورة الحرارية',
      srcDoc: prepareThermalInvoicePreviewHtml(
        buildThermalInvoiceHtmlForOrder(order),
        paperWidth
      ),
      paperWidth,
    })
  }

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

  if (!settingsLoading && systemSettings?.enable_orders === false) {
    return (
      <FeatureDisabledState
        title="ميزة الطلبات غير مفعلة"
        message="تم تعطيل متابعة الطلبات من إعدادات النظام."
      />
    )
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-transparent text-white">
      <div className="min-w-0 space-y-4">
        {successMessage && <div className="success-alert">{fixArabic(successMessage)}</div>}
        {errorMessage && <div className="error-alert">{fixArabic(errorMessage)}</div>}
        <style>{`
          @keyframes ordersDrawerSlideIn {
            from {
              opacity: 0;
              transform: translateX(28px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }
        `}</style>

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
                onClick={() => {
                  setFilter(card.filterKey)
                  setCurrentPage(1)
                }}
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
                      onClick={() => {
                        setFilter(item.key)
                        setCurrentPage(1)
                      }}
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
                    onChange={(value) => {
                      setSelectedBranchId(value)
                      setCurrentPage(1)
                    }}
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
                عرض {filteredOrders.length} من {totalOrders} طلب
              </div>
            </div>
          </div>

          <div className="max-w-full overflow-hidden rounded-[30px] border border-cyan-300/10 bg-[#07111d]/95 shadow-[0_0_45px_rgba(34,211,238,0.06)] backdrop-blur-xl">
            <div className="flex items-end justify-between gap-4 border-b border-cyan-300/10 px-5 py-4">
              <div className="text-right">
                <h2 className="text-2xl font-black text-white">جدول الطلبات</h2>
                <p className="mt-1 text-sm text-slate-400">أزرار الحالة تستخدم نفس منطق تحديث الطلب الحالي.</p>
              </div>
              <p className="text-left text-sm font-bold text-cyan-100">{totalOrders} طلب</p>
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
                <p className="mt-4 text-sm font-bold text-white">لا توجد طلبات مطابقة للفلاتر الحالية.</p>
                <p className="mt-1 text-xs text-slate-500">جرّب تغيير الفلتر أو البحث.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] table-fixed text-right" dir="rtl">
                  <colgroup>
                    <col className="w-[150px]" />
                    <col className="w-[180px]" />
                    <col className="w-[150px]" />
                    <col className="w-[140px]" />
                    <col className="w-[190px]" />
                    <col className="w-[190px]" />
                  </colgroup>
                  <thead className="bg-[#091424]">
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
                      const whatsAppStatusUi = getWhatsAppStatusUi(
                        whatsappStatusByOrderId[order.id] || 'not_sent'
                      )
                      const deliveryStatusUi = orderIsCancelled
                        ? CANCELLED_RECEIPT_WHATSAPP_UI
                        : whatsAppStatusUi

                      return (
                        <tr
                          key={order.id}
                          tabIndex={0}
                          onClick={(event: MouseEvent<HTMLTableRowElement>) => {
                            if (isInteractiveOrderRowTarget(event.target)) return
                            setDetailsDrawerOrderId(order.id)
                          }}
                          onKeyDown={(event: KeyboardEvent<HTMLTableRowElement>) => {
                            if (
                              isInteractiveOrderRowTarget(event.target) ||
                              (event.key !== 'Enter' && event.key !== ' ')
                            ) {
                              return
                            }
                            event.preventDefault()
                            setDetailsDrawerOrderId(order.id)
                          }}
                          className="cursor-pointer border-b border-cyan-300/10 bg-[#07111d]/60 transition hover:bg-cyan-400/[0.055] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-cyan-300/25"
                        >
                          <td className="px-4 py-4 align-middle">
                            <div className="space-y-1">
                              <button
                                type="button"
                                onClick={() => setDetailsDrawerOrderId(order.id)}
                                className="text-sm font-black text-white transition hover:text-cyan-100 hover:underline hover:decoration-cyan-300/80 hover:underline-offset-4 hover:drop-shadow-[0_0_10px_rgba(34,211,238,0.35)] focus:outline-none focus:text-cyan-100 focus:underline"
                              >
                                {order.invoice_number || order.order_number}
                              </button>
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
                              <OrderStatusBadge order={order} />
                              <span className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-black ${deliveryStatusUi.className}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${deliveryStatusUi.dotClassName}`} />
                                {deliveryStatusUi.label}
                              </span>
                            </div>
                          </td>
                          <td className="sticky left-0 bg-[#07111d] px-4 py-4 align-middle">
                            <div className="flex items-center">
                              <button
                                type="button"
                                onClick={() => setDetailsDrawerOrderId(order.id)}
                                className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-cyan-200/55 bg-cyan-300/15 px-4 text-[11px] font-black text-cyan-50 shadow-[0_0_16px_rgba(34,211,238,0.12)] transition hover:border-cyan-200/80 hover:bg-cyan-300/25 hover:shadow-[0_0_22px_rgba(34,211,238,0.24)]"
                              >
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path d="M7 3h10a2 2 0 0 1 2 2v16l-3-1.5-3 1.5-3-1.5L7 21V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                                  <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                </svg>
                                تفاصيل الطلب
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
          {totalOrders > ORDERS_PAGE_SIZE ? (
            <div className="flex items-center justify-center gap-3 py-4" dir="rtl">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                className="h-11 rounded-xl border border-cyan-300/15 bg-cyan-300/10 px-4 text-xs font-black text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                السابق
              </button>
              <span className="text-xs font-black text-slate-300">
                صفحة {currentPage} من {Math.ceil(totalOrders / ORDERS_PAGE_SIZE)}
              </span>
              <button
                type="button"
                disabled={currentPage >= Math.ceil(totalOrders / ORDERS_PAGE_SIZE)}
                onClick={() => setCurrentPage((page) => page + 1)}
                className="h-11 rounded-xl border border-cyan-300/15 bg-cyan-300/10 px-4 text-xs font-black text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                التالي
              </button>
            </div>
          ) : null}
          {detailsDrawerOrder ? (
            <div
              className="fixed inset-0 z-[110] flex justify-end bg-slate-950/70 backdrop-blur-sm"
              onClick={() => setDetailsDrawerOrderId(null)}
            >
              <aside
                dir="rtl"
                className="flex h-full w-full max-w-[560px] animate-[ordersDrawerSlideIn_180ms_ease-out] flex-col border-r border-cyan-300/20 bg-[#06101c]/95 text-right text-white shadow-[0_0_90px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:w-[92vw]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="sticky top-0 z-10 border-b border-cyan-300/15 bg-[#07111d]/95 p-5 backdrop-blur-xl">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200/70">
                        AFEX Order
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-black text-white">
                          #{detailsDrawerOrder.invoice_number || detailsDrawerOrder.order_number}
                        </h2>
                        <OrderStatusBadge order={detailsDrawerOrder} />
                        {detailsDrawerOrder.status === 'closed' ? (
                          <span className="inline-flex h-8 items-center rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 text-[11px] font-black text-emerald-100">
                            مكتمل
                          </span>
                        ) : null}
                        {isCancelledOrder(detailsDrawerOrder) ? (
                          <span className="inline-flex h-8 items-center rounded-full border border-rose-300/30 bg-rose-400/10 px-2.5 text-[11px] font-black text-rose-100">
                            ملغي
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-slate-400">
                        <span className="truncate text-slate-200">
                          {fixArabic(detailsDrawerOrder.customer_name)}
                        </span>
                        <span>{formatDateTime(detailsDrawerOrder.created_at)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailsDrawerOrderId(null)}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-100 transition hover:border-cyan-300/45 hover:bg-cyan-300/12"
                      aria-label="إغلاق تفاصيل الطلب"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-2xl border border-cyan-300/15 bg-[#091522]/85 px-3 py-3">
                      <p className="text-[11px] font-bold text-slate-500">
                        الإجمالي
                      </p>
                      <p className="mt-1 text-base font-black text-white">
                        {formatMoney(detailsDrawerOrder.total)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/10 px-3 py-3">
                      <p className="text-[11px] font-bold text-emerald-100/70">
                        المدفوع
                      </p>
                      <p className="mt-1 text-base font-black text-emerald-100">
                        {formatMoney(detailsDrawerOrder.cash_received)}
                      </p>
                    </div>
                    <div
                      className={`rounded-2xl border px-3 py-3 ${
                        detailsDrawerOrder.remaining_from_customer > 0
                          ? 'border-amber-300/25 bg-amber-400/10'
                          : 'border-emerald-300/15 bg-emerald-400/10'
                      }`}
                    >
                      <p
                        className={`text-[11px] font-bold ${
                          detailsDrawerOrder.remaining_from_customer > 0
                            ? 'text-amber-100/75'
                            : 'text-emerald-100/70'
                        }`}
                      >
                        المتبقي
                      </p>
                      <p
                        className={`mt-1 text-base font-black ${
                          detailsDrawerOrder.remaining_from_customer > 0
                            ? 'text-amber-100'
                            : 'text-emerald-100'
                        }`}
                      >
                        {formatMoney(detailsDrawerOrder.remaining_from_customer)}
                      </p>
                    </div>
                  </div>

                  {detailsDrawerIsLoading ? (
                    <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm font-black text-cyan-100">
                      جارٍ تحميل تفاصيل الطلب...
                    </div>
                  ) : null}

                  {detailsDrawerError ? (
                    <div className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">
                      <p>{detailsDrawerError}</p>
                      <button
                        type="button"
                        onClick={() => {
                          if (!detailsDrawerOrderId) return
                          setOrderDetailsErrorById((current) => {
                            const nextErrors = { ...current }
                            delete nextErrors[detailsDrawerOrderId]
                            return nextErrors
                          })
                          setOrderDetailsRetryKey((key) => key + 1)
                        }}
                        className="mt-3 h-10 rounded-xl border border-rose-200/35 bg-rose-300/10 px-4 text-xs font-black text-rose-50 transition hover:bg-rose-300/20"
                      >
                        إعادة المحاولة
                      </button>
                    </div>
                  ) : null}

                  <DrawerSection title="معلومات الطلب">
                    <DetailGrid>
                      <DetailItem label="رقم الطلب" value={detailsDrawerOrder.order_number} />
                      <DetailItem label="رقم الفاتورة" value={detailsDrawerOrder.invoice_number} />
                      <DetailItem
                        label="الحالة الحالية"
                        value={
                          <span className="flex flex-wrap items-center gap-2">
                            <OrderStatusBadge order={detailsDrawerOrder} />
                            {detailsDrawerOrder.status === 'closed' ? (
                              <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-black text-emerald-100">
                                مكتمل
                              </span>
                            ) : null}
                            {isCancelledOrder(detailsDrawerOrder) ? (
                              <span className="rounded-full border border-rose-300/30 bg-rose-400/10 px-2 py-0.5 text-[10px] font-black text-rose-100">
                                ملغي
                              </span>
                            ) : null}
                          </span>
                        }
                      />
                      <DetailItem label="الفرع" value={getOrderBranchLabel(detailsDrawerOrder)} />
                      <DetailItem
                        label="الموظف"
                        value={
                          detailsDrawerOrder.created_by_employee_id
                            ? employeeNameById[
                                detailsDrawerOrder.created_by_employee_id
                              ] || 'لم تُسجل'
                            : 'لم تُسجل'
                        }
                      />
                      <DetailItem
                        label="تاريخ الإنشاء"
                        value={formatDateTime(detailsDrawerOrder.created_at)}
                      />
                      <DetailItem
                        label="آخر تحديث"
                        value={formatDateTime(detailsDrawerOrder.updated_at || detailsDrawerOrder.created_at)}
                      />
                    </DetailGrid>
                  </DrawerSection>

                  <DrawerSection title="بيانات العميل">
                    <DetailGrid>
                      <DetailItem label="الاسم" value={fixArabic(detailsDrawerOrder.customer_name)} />
                      <DetailItem label="الجوال" value={detailsDrawerOrder.customer_phone} />
                      <DetailItem
                        label="عدد الزيارات"
                        value={drawerCustomerSummary.visits.toLocaleString('ar-SA')}
                      />
                      <DetailItem
                        label="إجمالي الصرف"
                        value={formatMoney(drawerCustomerSummary.spend)}
                      />
                      <DetailItem
                        label="آخر زيارة"
                        value={formatDateTime(drawerCustomerSummary.lastVisit)}
                      />
                    </DetailGrid>
                  </DrawerSection>

                  <DrawerSection title="المعلومات المالية">
                    {detailsDrawerOrder.remaining_from_customer > 0 ? (
                      <div className="mb-3 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm font-black text-amber-100">
                        متبقي على العميل مبلغ {formatMoney(detailsDrawerOrder.remaining_from_customer)}
                      </div>
                    ) : null}
                    <div className="grid gap-2 sm:grid-cols-2">
                      <FinancialCard label="الإجمالي" value={formatMoney(detailsDrawerOrder.subtotal || detailsDrawerOrder.total)} />
                      <FinancialCard label="الخصم" value={formatMoney(detailsDrawerOrder.discount)} />
                      <FinancialCard label="الضريبة" value={formatMoney(detailsDrawerOrder.tax)} />
                      <FinancialCard label="الإجمالي النهائي" value={formatMoney(detailsDrawerOrder.total)} strong />
                      <FinancialCard label="المدفوع" value={formatMoney(detailsDrawerOrder.cash_received)} />
                      <FinancialCard label="المتبقي" value={formatMoney(detailsDrawerOrder.remaining_from_customer)} />
                    </div>
                    <DetailGrid className="mt-3">
                      <DetailItem label="طريقة الدفع" value={fixArabic(detailsDrawerOrder.payment_method)} />
                      <DetailItem label="حالة الدفع" value={fixArabic(detailsDrawerOrder.payment_status)} />
                    </DetailGrid>
                  </DrawerSection>

                  <DrawerSection title="المنتجات">
                    {detailsDrawerIsLoading ? (
                      <EmptyDrawerText>جارٍ تحميل المنتجات...</EmptyDrawerText>
                    ) : detailsDrawerError ? (
                      <EmptyDrawerText>تعذر تحميل المنتجات.</EmptyDrawerText>
                    ) : detailsDrawerOrder.items.length > 0 ? (
                      <div className="space-y-2">
                        {detailsDrawerOrder.items.map((item, index) => (
                          <div
                            key={`${item.item_name}-${index}`}
                            className="flex gap-3 rounded-2xl border border-cyan-300/10 bg-[#091522]/80 p-3"
                          >
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/10 text-xs font-black text-cyan-100">
                              {index + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-black text-white">
                                {fixArabic(item.item_name)}
                              </p>
                              <p className="mt-1 text-xs font-bold text-slate-400">
                                الكمية: {item.quantity} · سعر الوحدة: {formatMoney(item.unit_price)}
                              </p>
                              <p className="mt-1 text-xs font-black text-cyan-100">
                                الإجمالي: {formatMoney(item.line_total)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyDrawerText>لا توجد منتجات.</EmptyDrawerText>
                    )}
                  </DrawerSection>

                  <DrawerSection title="سجل الإشعارات">
                    {notificationHistoryLoadingId === detailsDrawerOrder.id ? (
                      <EmptyDrawerText>جارٍ تحميل سجل الإشعارات...</EmptyDrawerText>
                    ) : (notificationHistoryByOrderId[detailsDrawerOrder.id] || []).length > 0 ? (
                      <div className="relative space-y-3 before:absolute before:bottom-3 before:right-3 before:top-3 before:w-px before:bg-cyan-300/15">
                        {(notificationHistoryByOrderId[detailsDrawerOrder.id] || []).map((entry) => {
                          const entryUi = getWhatsAppStatusUi(entry.status)
                          const channelUi = getNotificationChannelUi(entry.channel)

                          return (
                            <div key={entry.id} className="relative flex gap-3 pr-8">
                              <span className={`absolute right-2 top-5 h-2.5 w-2.5 rounded-full shadow-[0_0_18px_rgba(34,211,238,0.35)] ${entryUi.dotClassName}`} />
                              <div className="min-w-0 flex-1 rounded-2xl border border-cyan-300/10 bg-[#091522]/80 p-3 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-[#0b1b2b]">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-xs font-black text-white">
                                      {getNotificationTypeLabel(entry.action, entry.messageType)}
                                    </p>
                                    <p className="mt-1 text-[11px] font-bold text-slate-400">
                                      <span aria-hidden="true">{channelUi.icon}</span>{' '}
                                      {channelUi.label}
                                    </p>
                                  </div>
                                  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${entryUi.className}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${channelUi.dotClassName}`} />
                                    {getNotificationStatusLabel(entry)}
                                  </span>
                                </div>
                                <div className="mt-3 grid gap-2 text-[11px] font-bold text-slate-400 sm:grid-cols-[1fr_auto]">
                                  <span>المستلم: {entry.recipient}</span>
                                  <span className="text-left text-slate-500">
                                    {formatDateTime(entry.created_at)}
                                  </span>
                                </div>
                                {entry.error ? (
                                  <p className="mt-2 rounded-xl border border-rose-300/15 bg-rose-400/10 px-3 py-2 text-xs font-bold text-rose-200">
                                    {entry.error}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <EmptyDrawerText>لا توجد إشعارات لهذا الطلب حتى الآن.</EmptyDrawerText>
                    )}
                  </DrawerSection>

                  <DrawerSection title="سجل حالة الطلب">
                    <div className="relative space-y-2 before:absolute before:bottom-4 before:right-3 before:top-4 before:w-px before:bg-cyan-300/15">
                      {[
                        {
                          key: 'created',
                          label: 'تم إنشاء الطلب',
                          time: detailsDrawerOrder.created_at,
                          reached: true,
                          current: false,
                          cancelled: false,
                        },
                        {
                          key: 'in_progress',
                          label: 'قيد التجهيز',
                          time: detailsDrawerOrder.created_at,
                          reached:
                            !isCancelledOrder(detailsDrawerOrder) &&
                            ['in_progress', 'ready', 'closed'].includes(
                              detailsDrawerOrder.status
                            ),
                          current: detailsDrawerOrder.status === 'in_progress',
                          cancelled: false,
                        },
                        {
                          key: 'ready',
                          label: 'جاهز',
                          time:
                            detailsDrawerOrder.status === 'ready'
                              ? detailsDrawerOrder.updated_at ||
                                detailsDrawerOrder.created_at
                              : '',
                          reached:
                            !isCancelledOrder(detailsDrawerOrder) &&
                            ['ready', 'closed'].includes(detailsDrawerOrder.status),
                          current: detailsDrawerOrder.status === 'ready',
                          cancelled: false,
                        },
                        {
                          key: 'closed',
                          label: 'تم التسليم',
                          time:
                            detailsDrawerOrder.status === 'closed'
                              ? detailsDrawerOrder.updated_at ||
                                detailsDrawerOrder.created_at
                              : '',
                          reached:
                            !isCancelledOrder(detailsDrawerOrder) &&
                            detailsDrawerOrder.status === 'closed',
                          current: detailsDrawerOrder.status === 'closed',
                          cancelled: false,
                        },
                        {
                          key: 'cancelled',
                          label: 'ملغي',
                          time: isCancelledOrder(detailsDrawerOrder)
                            ? detailsDrawerOrder.updated_at ||
                              detailsDrawerOrder.created_at
                            : '',
                          reached: isCancelledOrder(detailsDrawerOrder),
                          current: isCancelledOrder(detailsDrawerOrder),
                          cancelled: true,
                        },
                      ].map((step) => (
                        <div
                          key={step.key}
                          className={`relative flex items-center gap-3 rounded-2xl border py-2 pl-3 pr-8 transition ${
                            step.current
                              ? step.cancelled
                                ? 'border-rose-300/30 bg-rose-500/10'
                                : 'border-emerald-300/30 bg-emerald-400/10 shadow-[0_0_22px_rgba(16,185,129,0.12)]'
                              : step.reached
                                ? 'border-emerald-300/15 bg-[#091522]/85'
                                : 'border-cyan-300/10 bg-[#091522]/55 opacity-60'
                          }`}
                        >
                          <span
                            className={`absolute right-2.5 top-1/2 h-2.5 w-2.5 shrink-0 -translate-y-1/2 rounded-full ${
                              step.reached
                                ? step.cancelled
                                  ? 'bg-rose-300 shadow-[0_0_18px_rgba(244,63,94,0.45)]'
                                  : step.current
                                    ? 'bg-emerald-300 shadow-[0_0_22px_rgba(16,185,129,0.6)]'
                                    : 'bg-emerald-300'
                                : 'bg-slate-600'
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black text-white">
                              {step.label}
                            </p>
                            <p className="text-[11px] font-bold text-slate-500">
                              {formatDateTime(step.time)}
                            </p>
                          </div>
                          {step.current && detailsDrawerOrder.status === 'closed' ? (
                            <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-1 text-[10px] font-black text-emerald-100">
                              مكتمل
                            </span>
                          ) : null}
                          {step.current && step.cancelled ? (
                            <span className="rounded-full border border-rose-300/30 bg-rose-400/10 px-2 py-1 text-[10px] font-black text-rose-100">
                              ملغي
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </DrawerSection>

                  <DrawerSection title="الملاحظات">
                    {detailsDrawerOrder.note && detailsDrawerOrder.note !== EMPTY_DASH ? (
                      <div className="space-y-2">
                        <NoteBlock title="ملاحظات الفاتورة" value={fixArabic(detailsDrawerOrder.note)} />
                      </div>
                    ) : (
                      <EmptyDrawerText>لا توجد ملاحظات.</EmptyDrawerText>
                    )}
                  </DrawerSection>

                  <DrawerSection title="الفواتير">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={detailsDrawerActionsDisabled || detailsDrawerOrder.items.length === 0}
                        onClick={() => previewDigitalInvoiceInPage(detailsDrawerOrder)}
                        className="h-11 rounded-2xl border border-violet-300/30 bg-violet-500/15 px-4 text-xs font-black text-violet-100 transition hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:border-slate-500/20 disabled:bg-slate-500/10 disabled:text-slate-500"
                      >
                        معاينة الفاتورة الرقمية
                      </button>
                      <button
                        type="button"
                        disabled={detailsDrawerActionsDisabled}
                        onClick={() => previewThermalInvoiceInPage(detailsDrawerOrder)}
                        className="h-11 rounded-2xl border border-cyan-300/30 bg-cyan-500/15 px-4 text-xs font-black text-cyan-100 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:border-slate-500/20 disabled:bg-slate-500/10 disabled:text-slate-500"
                      >
                        معاينة الفاتورة الحرارية
                      </button>
                    </div>
                  </DrawerSection>
                </div>

                <div className="sticky bottom-0 border-t border-cyan-300/15 bg-[#07111d]/95 p-4 backdrop-blur-xl">
                  <p className="mb-3 text-sm font-black text-white">إجراءات سريعة</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={
                        !canManageOrders ||
                        isFinalOrderStatus(detailsDrawerOrder) ||
                        updatingId === detailsDrawerOrder.id
                      }
                      onClick={() => {
                        const nextStatus = getNextAllowedStatus(detailsDrawerOrder)
                        if (!nextStatus) {
                          showError(INVALID_STATUS_SEQUENCE_MESSAGE)
                          return
                        }
                        setStatusModalOrder(detailsDrawerOrder)
                        setStatusModalValue(nextStatus)
                        setStatusModalOptionKey(
                          nextStatus === 'closed' ? 'delivered_closed' : nextStatus
                        )
                        setStatusDropdownOpen(false)
                      }}
                      className="h-10 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-3 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/15 disabled:opacity-50"
                    >
                      تعديل الحالة
                    </button>
                    <button
                      type="button"
                      disabled={
                        !canManageOrders ||
                        !whatsappFeatureEnabled ||
                        detailsDrawerActionsDisabled ||
                        detailsDrawerOrder.items.length === 0 ||
                        Boolean(invoicePdfActionByOrderId[detailsDrawerOrder.id])
                      }
                      onClick={() => sendDigitalInvoicePdf(detailsDrawerOrder)}
                      className="h-10 rounded-xl border border-teal-300/25 bg-teal-500/15 px-3 text-xs font-black text-teal-100 transition hover:bg-teal-500/25 disabled:opacity-50"
                    >
                      {invoicePdfActionByOrderId[detailsDrawerOrder.id] === 'send'
                        ? 'جارٍ تجهيز الفاتورة وإرسالها...'
                        : whatsappStatusByOrderId[detailsDrawerOrder.id] === 'sent'
                        ? 'إعادة إرسال PDF'
                        : 'إرسال PDF'}
                    </button>
                    <button
                      type="button"
                      disabled={
                        detailsDrawerActionsDisabled ||
                        Boolean(invoicePdfActionByOrderId[detailsDrawerOrder.id])
                      }
                      onClick={() => printThermalReceipt(detailsDrawerOrder)}
                      className="h-10 rounded-xl border border-slate-300/20 bg-slate-400/10 px-3 text-xs font-black text-slate-100 transition hover:bg-slate-400/15 disabled:opacity-50"
                    >
                      {invoicePdfActionByOrderId[detailsDrawerOrder.id] === 'print'
                        ? INVOICE_UX_MESSAGES.printPreparing
                        : 'طباعة'}
                    </button>
                    <button
                      type="button"
                      disabled={
                        !canCancelOrders || isFinalOrderStatus(detailsDrawerOrder)
                      }
                      onClick={() => setCancelModalOrder(detailsDrawerOrder)}
                      className="h-10 rounded-xl border border-rose-300/25 bg-rose-500/15 px-3 text-xs font-black text-rose-100 transition hover:bg-rose-500/25 disabled:opacity-50"
                    >
                      إلغاء الطلب
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          ) : null}
          {invoicePreviewFrame ? (
            <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#020817]/80 p-3 backdrop-blur-md sm:p-5">
              <div className={`flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-[28px] border border-cyan-300/25 bg-[#07111d]/95 shadow-[0_0_80px_rgba(34,211,238,0.18)] sm:max-h-[88dvh] ${
                invoicePreviewFrame.srcDoc ? 'max-w-[520px]' : 'max-w-[1180px]'
              }`}>
                <div className="flex items-center justify-between gap-4 border-b border-cyan-300/15 px-4 py-3 sm:px-5">
                  <div className="text-right">
                    <h3 className="text-lg font-black text-white">
                      {invoicePreviewFrame.title}
                    </h3>
                    <p className="mt-1 text-xs font-bold text-cyan-100/70">
                      معاينة داخل تفاصيل الطلب
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInvoicePreviewFrame(null)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/30 bg-[#091522]/80 text-cyan-100 transition hover:border-cyan-200/70 hover:bg-cyan-300/10 hover:text-white hover:shadow-[0_0_24px_rgba(34,211,238,0.22)] focus:outline-none focus:ring-2 focus:ring-cyan-300/25"
                    aria-label="إغلاق المعاينة"
                    title="إغلاق"
                  >
                    ×
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto bg-[#020817] p-4 sm:p-6">
                  {invoicePreviewFrame.srcDoc ? (
                    <div className="flex justify-center">
                      <iframe
                        key={invoicePreviewFrame.srcDoc}
                        title={invoicePreviewFrame.title}
                        srcDoc={invoicePreviewFrame.srcDoc}
                        onLoad={(event) => {
                          fitThermalPreviewIframe(
                            event.currentTarget,
                            setThermalPreviewHeight
                          )
                        }}
                        onError={() => showError(INVOICE_UX_MESSAGES.previewFailure)}
                        scrolling="no"
                        className="block rounded-sm border-0 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
                        style={{
                          width: getThermalPreviewWidth(
                            invoicePreviewFrame.paperWidth
                          ),
                          height: thermalPreviewHeight,
                        }}
                      />
                    </div>
                  ) : (
                    <iframe
                      key={invoicePreviewFrame.src || ''}
                      title={invoicePreviewFrame.title}
                      src={invoicePreviewFrame.src}
                      onError={() => showError(INVOICE_UX_MESSAGES.previewFailure)}
                      className="h-[78vh] w-full rounded-[20px] border border-cyan-300/10 bg-white"
                    />
                  )}
                </div>
              </div>
            </div>
          ) : null}
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
                        const isOptionDisabled =
                          option.disabled ||
                          !isAllowedStatusTransition(
                            statusModalOrder,
                            option.value
                          )

                        return (
                          <button
                            key={option.id}
                            type="button"
                            disabled={isOptionDisabled}
                            onClick={() => {
                              if (isOptionDisabled) return
                              setStatusModalValue(option.value)
                              setStatusModalOptionKey(option.id)
                              setStatusDropdownOpen(false)
                            }}
                            className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-right text-sm font-black transition ${
                              isOptionDisabled
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
                    disabled={
                      updatingId === statusModalOrder.id ||
                      !isAllowedStatusTransition(
                        statusModalOrder,
                        statusModalValue
                      )
                    }
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
          {cancelModalOrder ? (
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-[28px] border border-rose-300/20 bg-[#07111d] p-5 text-right shadow-[0_30px_100px_rgba(0,0,0,0.55)]">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200/70">
                      AFEX Orders
                    </p>
                    <h3 className="mt-2 text-xl font-black text-white">
                      تأكيد إلغاء الطلب
                    </h3>
                    <p className="mt-1 text-xs font-bold text-slate-400">
                      {cancelModalOrder.order_number}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCancelModalOrder(null)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-black text-slate-300 transition hover:border-cyan-300/30 hover:text-cyan-100"
                  >
                    إغلاق
                  </button>
                </div>

                <div className="rounded-2xl border border-rose-300/15 bg-rose-500/[0.06] p-4">
                  <p className="text-sm font-black text-rose-100">
                    هل تريد إلغاء هذا الطلب؟
                  </p>
                  <p className="mt-2 text-xs font-bold leading-6 text-slate-400">
                    سيتم تحديث حالة الطلب والإيصال المرتبط به، واسترجاع المخزون حسب منطق الإلغاء الحالي.
                  </p>
                </div>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCancelModalOrder(null)}
                    className="h-11 rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-sm font-black text-slate-300 transition hover:border-white/25 hover:text-white"
                  >
                    تراجع
                  </button>
                  <button
                    type="button"
                    disabled={updatingId === cancelModalOrder.id}
                    onClick={() => cancelOrder(cancelModalOrder)}
                    className="h-11 rounded-2xl border border-rose-300/35 bg-rose-500/15 px-5 text-sm font-black text-rose-100 transition hover:bg-rose-500/25 disabled:cursor-wait disabled:opacity-60"
                  >
                    {updatingId === cancelModalOrder.id
                      ? 'جارٍ الإلغاء...'
                      : 'تأكيد الإلغاء'}
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

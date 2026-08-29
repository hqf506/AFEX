'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useRouter } from 'next/navigation'
import { usePageAccess } from '@/hooks/use-page-access'
import { getClientErrorMessage } from '@/lib/api/client-error'
import { formatCurrency } from '@/lib/orders/format'
import {
  formatOrderStatusHistoryDateTime,
  parseOrderStatusHistoryEntries,
  type OrderStatusHistoryEntry,
} from '@/lib/orders/order-status-details'
import { mapOrderSummaryToOrderRecord, ORDER_STATUS_MAP, type OrderRecord } from '@/lib/orders/orders-page'
import { normalizeOrderRecord, type OrderSourceRow, type OrderStatus } from '@/lib/orders/normalize'
import { readOfflineOrderRecord, readOfflineOrderRecords } from '@/lib/orders/offline-client'
import { shouldUseOfflineReadFallback } from '@/lib/offline/read-fallback'
import { POS_ACCESS_ROLES } from '@/lib/permissions'
import { formatPosGregorianDateTime } from '@/lib/pos/date-format'
import { PosThemeToggle } from '@/components/pos-theme-toggle'
import styles from './order-status.module.css'

const STATUS_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus>> = {
  in_progress: 'ready',
  ready: 'closed',
}
const PAGE_SIZE = 24
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const EASTERN_ARABIC_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const PHONE_LAYOUT_QUERY = '(max-width: 767.98px)'
const SHORT_PHONE_LANDSCAPE_QUERY = '(max-height: 500px) and (hover: none) and (pointer: coarse)'

type OrderDetailsReadState = 'loading' | 'success' | 'error'

type OrderDetailsCacheEntry = {
  readState: OrderDetailsReadState
  order?: OrderRecord
  historyReadState: OrderDetailsReadState
  history: OrderStatusHistoryEntry[]
}

type OrderDetailsApiResponse = {
  success?: boolean
  items?: unknown[]
  statusHistory?: {
    readState?: unknown
    entries?: unknown
  }
}

type OrderStatusMutationResponse = {
  success?: boolean
  errorCode?: string
  idempotent?: boolean
  order?: { id?: unknown; status?: unknown }
  transition?: { outcome?: unknown; classification?: unknown }
  notification?: {
    outcome?: unknown
    classification?: unknown
  }
}

type MutationFeedback = { type: 'success' | 'error'; message: string }

type TransitionResultDialogSnapshot = {
  kind: 'success' | 'warning'
  publicOrderNumber: string
  previousStatus: 'in_progress' | 'ready'
  nextStatus: 'ready' | 'closed'
  transitionClassification: 'ORDER_STATUS_UPDATED'
  notificationClassification: string
}

function getOrderStatusMutationMessage(errorCode: string | undefined, status: number) {
  if (status === 401 || errorCode === 'POS_ACTOR_SESSION_REQUIRED') {
    return 'انتهت جلسة موظف نقطة البيع. أدخل رمز الموظف مرة أخرى.'
  }
  if (status === 403 || errorCode === 'ORDER_STATUS_FORBIDDEN' || errorCode === 'ORDER_SCOPE_FORBIDDEN') {
    return 'لا تملك صلاحية تحديث حالة هذا الطلب.'
  }
  if (errorCode === 'ORDER_STATUS_STALE' || errorCode === 'ORDER_STATUS_TRANSITION_INVALID') {
    return 'تغيرت حالة الطلب في جلسة أخرى. حدّث القائمة ثم حاول مجددًا.'
  }
  if (status === 404 || errorCode === 'ORDER_NOT_FOUND') {
    return 'الطلب غير موجود أو لم يعد متاحًا.'
  }
  return 'تعذر حفظ حالة الطلب. بقيت الحالة الحالية دون تغيير.'
}

function getOrderStatusSuccessFeedback(
  result: OrderStatusMutationResponse,
  nextStatus: 'ready' | 'closed'
): MutationFeedback {
  const notificationClassification = result.notification?.classification

  if (result.idempotent || notificationClassification === 'ALREADY_APPLIED_NO_RESEND') {
    return {
      type: 'success',
      message: 'حالة الطلب محدثة مسبقًا. لم يُعد إرسال إشعار واتساب.',
    }
  }

  if (notificationClassification === 'WHATSAPP_SENT') {
    return {
      type: 'success',
      message: nextStatus === 'ready'
        ? 'تم نقل الطلب إلى جاهز وإشعار العميل عبر واتساب.'
        : 'تم تسجيل تسليم الطلب وإشعار العميل عبر واتساب.',
    }
  }

  if (notificationClassification === 'PHONE_UNAVAILABLE') {
    return {
      type: 'error',
      message: 'تم تحديث حالة الطلب، ولا يوجد رقم جوال صالح لإرسال إشعار واتساب.',
    }
  }

  return {
    type: 'error',
    message: 'تم تحديث حالة الطلب، لكن تعذر إرسال إشعار واتساب للعميل.',
  }
}

function createTransitionResultDialogSnapshot(
  result: OrderStatusMutationResponse,
  order: OrderRecord,
  nextStatus: 'ready' | 'closed'
): TransitionResultDialogSnapshot | null {
  const transitionClassification = result.transition?.classification
  const notificationClassification = result.notification?.classification

  if (
    transitionClassification !== 'ORDER_STATUS_UPDATED' ||
    typeof notificationClassification !== 'string'
  ) return null

  return {
    kind: notificationClassification === 'WHATSAPP_SENT' ? 'success' : 'warning',
    publicOrderNumber: order.order_number,
    previousStatus: nextStatus === 'ready' ? 'in_progress' : 'ready',
    nextStatus,
    transitionClassification,
    notificationClassification,
  }
}

function normalizeDisplayedOrderNumber(value: string) {
  return value
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(EASTERN_ARABIC_DIGITS.indexOf(digit)))
    .replace(/[\s\u00a0\u2000-\u200b\u2010-\u2015-]+/g, '')
    .toLowerCase()
}

function WorkflowIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="m16 15 2 2 3-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function RefreshIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.34 5.66M20 5v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 18-6-6 6-6M9 12h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
}

function OrderStatusResultDialog({
  fallbackFocusRef,
  onClose,
  restoreFocusRef,
  snapshot,
}: {
  fallbackFocusRef: RefObject<HTMLElement | null>
  onClose: () => void
  restoreFocusRef: RefObject<HTMLElement | null>
  snapshot: TransitionResultDialogSnapshot
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const titleId = 'pos-order-status-result-title'
  const descriptionId = 'pos-order-status-result-description'
  const successfulNotification = snapshot.kind === 'success'
  const title = successfulNotification
    ? snapshot.nextStatus === 'ready' ? 'تم نقل الطلب إلى جاهز' : 'تم تسليم الطلب'
    : 'تم تحديث حالة الطلب'
  const description = successfulNotification
    ? snapshot.nextStatus === 'ready'
      ? 'تم تحديث حالة الطلب وإرسال رسالة واتساب للعميل بنجاح.'
      : 'تم تسجيل تسليم الطلب وإرسال رسالة واتساب للعميل بنجاح.'
    : snapshot.notificationClassification === 'PHONE_UNAVAILABLE'
      ? 'تم تحديث الحالة، ولا يوجد رقم جوال صالح لإرسال إشعار واتساب.'
      : 'تم تحديث الحالة، لكن تعذر إرسال رسالة واتساب للعميل.'

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousFocus = restoreFocusRef.current
    const fallbackFocus = fallbackFocusRef.current
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      ))
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable.at(-1)!
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
      const safeTarget = previousFocus?.isConnected ? previousFocus : fallbackFocus
      safeTarget?.focus()
    }
  }, [fallbackFocusRef, onClose, restoreFocusRef])

  return <div className={styles.resultDialogBackdrop} data-order-status-result-layer>
    <div
      ref={dialogRef}
      className={styles.resultDialog}
      data-result-kind={snapshot.kind}
      data-transition-classification={snapshot.transitionClassification}
      data-notification-classification={snapshot.notificationClassification}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
    >
      <span className={styles.resultDialogIcon} aria-hidden="true">
        {successfulNotification
          ? <svg viewBox="0 0 24 24" fill="none"><path d="m6 12 4 4 8-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          : <svg viewBox="0 0 24 24" fill="none"><path d="M12 7v6m0 4h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>}
      </span>
      <div className={styles.resultDialogCopy}>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <p className={styles.resultDialogOrder}>الطلب: <b dir="ltr">{snapshot.publicOrderNumber}</b></p>
      </div>
      <button ref={closeButtonRef} type="button" className={styles.resultDialogButton} onClick={onClose}>تم</button>
    </div>
  </div>
}

function isPhoneLayout() {
  return window.matchMedia(PHONE_LAYOUT_QUERY).matches || window.matchMedia(SHORT_PHONE_LANDSCAPE_QUERY).matches
}

function OrderDetailsPanel({
  id,
  inline,
  nextStatus,
  onAdvance,
  order,
  details,
  onRetryDetails,
  updatingId,
}: {
  id?: string
  inline?: boolean
  nextStatus?: OrderStatus
  onAdvance: (order: OrderRecord) => void
  order: OrderRecord
  details?: OrderDetailsCacheEntry
  onRetryDetails: (orderId: string) => void
  updatingId: string | null
}) {
  const detailsReadState = details?.readState ?? 'loading'
  const historyReadState = details?.historyReadState ?? (detailsReadState === 'error' ? 'error' : 'loading')
  const detailedOrder = details?.order ?? order

  return <aside
    id={id}
    className={`pos-status-details ${inline ? styles.inlineDetails : styles.desktopDetails}`}
    data-order-status-details={inline ? undefined : ''}
    data-order-status-inline-details={inline ? '' : undefined}
    aria-live="polite"
  >
    <header className={inline ? styles.inlineDetailsHeader : undefined} data-order-status-inline-header={inline ? '' : undefined}>
      <div><small>{inline ? 'تفاصيل الطلب المحدد' : 'تفاصيل الطلب'}</small><h2 dir="ltr">{order.order_number}</h2></div>
      {inline ? <div className={styles.inlineDetailsStatus}>
        <span className={ORDER_STATUS_MAP[order.status].className}>{ORDER_STATUS_MAP[order.status].label}</span>
        <span className={styles.collapseChevron} aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><path d="m5 12 5-5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
      </div> : <span className={ORDER_STATUS_MAP[order.status].className}>{ORDER_STATUS_MAP[order.status].label}</span>}
    </header>
    <div className="pos-status-details-body">
      <dl className="pos-status-details-meta">
        <div><dt>العميل</dt><dd>{order.customer_name || 'عميل نقدي'}</dd></div>
        <div><dt>الهاتف</dt><dd dir="ltr">{order.customer_phone || 'غير متاح'}</dd></div>
        <div><dt>التاريخ والوقت</dt><dd>{formatPosGregorianDateTime(order.created_at)}</dd></div>
        <div><dt>طريقة الدفع</dt><dd>{order.payment_method || 'غير متاح'}</dd></div>
      </dl>
      <section className="pos-status-details-items" aria-label="عناصر الطلب">
        <h3>العناصر</h3>
        {detailsReadState === 'loading' ? <p role="status">جارٍ تحميل عناصر الطلب...</p> : null}
        {detailsReadState === 'error' ? <div className={styles.detailsReadError} role="alert"><p>تعذر تحميل عناصر الطلب.</p><button type="button" onClick={() => onRetryDetails(order.id)}>إعادة المحاولة</button></div> : null}
        {detailsReadState === 'success' && detailedOrder.items.length > 0 ? detailedOrder.items.map((item, index) => <article key={`${order.id}-${index}`}>
          <div><strong>{item.item_name || 'عنصر غير متاح'}</strong><small>الكمية: {item.quantity} × {formatCurrency(item.unit_price)}</small></div><b>الإجمالي: {formatCurrency(item.line_total)}</b>
        </article>) : null}
        {detailsReadState === 'success' && detailedOrder.items.length === 0 ? <p>لا توجد عناصر مسجلة لهذا الطلب</p> : null}
      </section>
      <dl className="pos-status-totals">
        <div><dt>المجموع قبل الضريبة</dt><dd>{formatCurrency(order.subtotal)}</dd></div>
        <div><dt>الضريبة</dt><dd>{formatCurrency(order.tax)}</dd></div>
        <div><dt>الخصم</dt><dd>{formatCurrency(order.discount)}</dd></div>
        <div className="is-grand-total"><dt>الإجمالي النهائي</dt><dd>{formatCurrency(order.total)}</dd></div>
      </dl>
      <section className="pos-status-history" aria-label="سجل الحالة">
        <span>سجل الحالة</span>
        {historyReadState === 'loading' ? <p role="status">جارٍ تحميل سجل الحالة...</p> : null}
        {historyReadState === 'error' ? <div className={styles.detailsReadError} role="alert"><p>تعذر تحميل سجل الحالة.</p><button type="button" onClick={() => onRetryDetails(order.id)}>إعادة المحاولة</button></div> : null}
        {historyReadState === 'success' && details?.history.length ? <ol className={styles.historyList}>
          {details.history.map((entry) => <li key={entry.id} data-current={entry.isCurrent ? 'true' : 'false'}>
            <div><strong>{ORDER_STATUS_MAP[entry.status].label}</strong>{entry.employeeName ? <small>{entry.employeeName}</small> : null}</div>
            <time dateTime={entry.createdAt}>{formatOrderStatusHistoryDateTime(entry.createdAt)}</time>
          </li>)}
        </ol> : null}
        {historyReadState === 'success' && details?.history.length === 0 ? <p>لا يوجد سجل تغييرات لهذا الطلب</p> : null}
      </section>
    </div>
    <footer data-order-status-action>
      {nextStatus ? <button type="button" onClick={() => onAdvance(order)} disabled={updatingId === order.id} aria-busy={updatingId === order.id}>{updatingId === order.id ? 'جارٍ التحديث...' : nextStatus === 'ready' ? 'نقل إلى جاهز' : 'تم التسليم'}</button> : <p role="status">لا يوجد انتقال حالة متاح لهذا الطلب.</p>}
    </footer>
  </aside>
}

export default function PosOrderStatusPage() {
  const router = useRouter()
  const access = usePageAccess({ allowedRoles: [...POS_ACCESS_ROLES], redirectIfNoUser: '/pos/login', redirectIfForbidden: '/pos' })
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mutationFeedback, setMutationFeedback] = useState<MutationFeedback | null>(null)
  const [resultDialog, setResultDialog] = useState<TransitionResultDialogSnapshot | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [orderDetailsById, setOrderDetailsById] = useState<Record<string, OrderDetailsCacheEntry>>({})
  const listRef = useRef<HTMLDivElement>(null)
  const pageHeadingRef = useRef<HTMLHeadingElement>(null)
  const selectedRowRef = useRef<HTMLButtonElement>(null)
  const transitionTriggerRef = useRef<HTMLElement | null>(null)
  const orderDetailsCacheRef = useRef<Record<string, OrderDetailsCacheEntry>>({})
  const orderDetailsInFlightRef = useRef(new Map<string, AbortController>())

  const storeOrderDetails = useCallback((orderId: string, entry: OrderDetailsCacheEntry) => {
    orderDetailsCacheRef.current = { ...orderDetailsCacheRef.current, [orderId]: entry }
    setOrderDetailsById((current) => ({ ...current, [orderId]: entry }))
  }, [])

  const loadOrderDetails = useCallback(async (orderId: string, force = false) => {
    const cached = orderDetailsCacheRef.current[orderId]
    if (!force && cached?.readState === 'success') return
    if (orderDetailsInFlightRef.current.has(orderId)) return

    const controller = new AbortController()
    orderDetailsInFlightRef.current.set(orderId, controller)
    storeOrderDetails(orderId, {
      readState: 'loading',
      order: cached?.order,
      historyReadState: 'loading',
      history: cached?.history ?? [],
    })

    const loadOfflineDetails = async () => {
      const detailedOrder = await readOfflineOrderRecord(orderId)
      if (!detailedOrder) throw new Error('OFFLINE_ORDER_NOT_READY')
      storeOrderDetails(orderId, {
        readState: 'success',
        order: detailedOrder,
        historyReadState: 'success',
        history: [],
      })
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await loadOfflineDetails()
        return
      }
      const params = new URLSearchParams({ mode: 'details', id: orderId })
      const response = await fetch(`/api/orders?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      })
      const result = await response.json().catch(() => null) as OrderDetailsApiResponse | null
      if (!response.ok || !result?.success || !Array.isArray(result.items) || result.items.length !== 1) {
        throw new Error('ORDER_DETAILS_READ_FAILED')
      }

      const detailedOrder = mapOrderSummaryToOrderRecord(normalizeOrderRecord(result.items[0] as OrderSourceRow, 0))
      if (detailedOrder.id !== orderId) throw new Error('ORDER_DETAILS_ID_MISMATCH')

      const historyReadState = result.statusHistory?.readState === 'success' ? 'success' : 'error'
      storeOrderDetails(orderId, {
        readState: 'success',
        order: detailedOrder,
        historyReadState,
        history: historyReadState === 'success'
          ? parseOrderStatusHistoryEntries(result.statusHistory?.entries)
          : [],
      })
    } catch (detailsError) {
      if (controller.signal.aborted) return
      if (shouldUseOfflineReadFallback(detailsError)) {
        try {
          await loadOfflineDetails()
          return
        } catch {
          // The local snapshot is not complete; expose the bounded error state.
        }
      }
      storeOrderDetails(orderId, {
        readState: 'error',
        historyReadState: 'error',
        history: [],
      })
    } finally {
      if (orderDetailsInFlightRef.current.get(orderId) === controller) {
        orderDetailsInFlightRef.current.delete(orderId)
      }
    }
  }, [storeOrderDetails])

  useEffect(() => () => {
    for (const controller of orderDetailsInFlightRef.current.values()) controller.abort()
    orderDetailsInFlightRef.current.clear()
  }, [])

  const loadOrders = useCallback(async (requestedPage = 1) => {
    if (!access.allowed || !access.tenantId || !access.branchId) return
    setLoading(true)
    setError('')
    const loadOfflineOrders = async () => {
      const allOrders = (await readOfflineOrderRecords()).filter(
        (order) => Boolean(STATUS_TRANSITIONS[order.status])
      )
      const start = (requestedPage - 1) * PAGE_SIZE
      const mapped = allOrders.slice(start, start + PAGE_SIZE)
      setOrders((current) => {
        const unique = new Map((requestedPage === 1 ? [] : current).map((order) => [order.id, order]))
        for (const order of mapped) unique.set(order.id, order)
        return [...unique.values()]
      })
      setPage(requestedPage)
      setHasMore(start + mapped.length < allOrders.length)
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await loadOfflineOrders()
        return
      }
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
      if (shouldUseOfflineReadFallback(loadError)) {
        try {
          await loadOfflineOrders()
          return
        } catch {
          setError('لقطة حالات الطلبات المحلية غير مكتملة.')
          return
        }
      }
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

  const normalizedSearchQuery = useMemo(() => normalizeDisplayedOrderNumber(searchQuery), [searchQuery])
  const filteredOrders = useMemo(
    () => normalizedSearchQuery ? orders.filter((order) => normalizeDisplayedOrderNumber(order.order_number).includes(normalizedSearchQuery)) : orders,
    [normalizedSearchQuery, orders],
  )
  const selectedOrder = useMemo(
    () => filteredOrders.find((order) => order.id === selectedId) ?? filteredOrders[0] ?? null,
    [filteredOrders, selectedId],
  )
  const selectedNextStatus = selectedOrder ? STATUS_TRANSITIONS[selectedOrder.status] : undefined

  useEffect(() => {
    if (selectedOrder?.id) void loadOrderDetails(selectedOrder.id)
  }, [loadOrderDetails, selectedOrder?.id])

  useEffect(() => {
    if (!selectedId || filteredOrders.some((order) => order.id === selectedId)) return
    const timeoutId = window.setTimeout(() => {
      setSelectedId((current) => current === selectedId ? null : current)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [filteredOrders, selectedId])

  useEffect(() => {
    if (!selectedId) return
    const list = listRef.current
    const row = selectedRowRef.current
    if (!list || !row) return
    const frame = window.requestAnimationFrame(() => {
      const phoneLayout = isPhoneLayout()
      const scrollViewport = phoneLayout ? list.closest<HTMLElement>('.pos-status-workspace') : list
      if (!scrollViewport) return
      const listRect = scrollViewport.getBoundingClientRect()
      const rowRect = row.getBoundingClientRect()
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (phoneLayout) {
        const breathingRoom = 10
        const detailHeader = document.querySelector<HTMLElement>(`#pos-order-status-details-${CSS.escape(selectedId)} [data-order-status-inline-header]`)
        const detailHeaderRect = detailHeader?.getBoundingClientRect()
        const selectedHeaderIsClipped = rowRect.top < listRect.top + breathingRoom
          || (detailHeaderRect?.bottom ?? rowRect.bottom) > listRect.bottom - breathingRoom
        if (selectedHeaderIsClipped) {
          const targetTop = Math.max(0, scrollViewport.scrollTop + rowRect.top - listRect.top - breathingRoom)
          scrollViewport.scrollTo({ top: targetTop, behavior: reducedMotion ? 'auto' : 'smooth' })
        }
      } else if (rowRect.top < listRect.top || rowRect.bottom > listRect.bottom) {
        row.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [orders, selectedId])

  const updateSearch = (value: string) => {
    const normalizedValue = normalizeDisplayedOrderNumber(value)
    const nextOrders = normalizedValue ? orders.filter((order) => normalizeDisplayedOrderNumber(order.order_number).includes(normalizedValue)) : orders
    const phoneLayout = isPhoneLayout()
    setSearchQuery(value)
    setSelectedId((current) => current && nextOrders.some((order) => order.id === current) ? current : phoneLayout ? null : nextOrders[0]?.id ?? null)
  }

  const selectOrder = (orderId: string) => {
    const phoneLayout = isPhoneLayout()
    setSelectedId((current) => phoneLayout && current === orderId ? null : orderId)
  }

  const closeResultDialog = useCallback(() => setResultDialog(null), [])

  const advance = async (order: OrderRecord) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setMutationFeedback({
        type: 'error',
        message: 'تحديث حالة الطلب يتطلب الاتصال حاليًا.',
      })
      return
    }
    const nextStatus = STATUS_TRANSITIONS[order.status]
    if (!nextStatus || updatingId || !access.tenantId || !access.branchId) return
    if (nextStatus !== 'ready' && nextStatus !== 'closed') return
    transitionTriggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    setUpdatingId(order.id)
    setMutationFeedback(null)
    try {
      const response = await fetch(`/api/pos/orders/${encodeURIComponent(order.id)}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const result = await response.json().catch(() => null) as OrderStatusMutationResponse | null
      const persistedStatus = result?.order?.status
      if (!response.ok || !result?.success || result.order?.id !== order.id || persistedStatus !== nextStatus) {
        setMutationFeedback({
          type: 'error',
          message: getOrderStatusMutationMessage(result?.errorCode, response.status),
        })
        return
      }

      const dialogSnapshot = createTransitionResultDialogSnapshot(result, order, nextStatus)
      if (dialogSnapshot) setResultDialog(dialogSnapshot)
      setMutationFeedback(dialogSnapshot ? null : getOrderStatusSuccessFeedback(result, nextStatus))
      setOrders((current) => current
        .map((item) => item.id === order.id ? { ...item, status: nextStatus } : item)
        .filter((item) => STATUS_TRANSITIONS[item.status]))
      const cached = orderDetailsCacheRef.current[order.id]
      if (cached?.order) {
        storeOrderDetails(order.id, {
          ...cached,
          order: { ...cached.order, status: nextStatus },
        })
      }
      await loadOrders(1)
      if (nextStatus === 'ready') await loadOrderDetails(order.id, true)
    } catch {
      setMutationFeedback({
        type: 'error',
        message: 'تعذر الاتصال بالخادم. بقيت حالة الطلب دون تغيير.',
      })
    } finally {
      setUpdatingId(null)
    }
  }

  if (access.loading || !access.allowed) return <div className="pos-history-gate">جارٍ التحقق من الصلاحية...</div>

  return <div className={`pos-invoice-history pos-order-status-workflow ${styles.orderStatusPage}`} data-order-status-page dir="rtl"><main>
    <header className="pos-status-header" data-order-status-header>
      <div className="pos-history-heading"><span><WorkflowIcon /></span><div><h1 ref={pageHeadingRef} tabIndex={-1}>حالة الطلبات</h1><p>عرض ومتابعة الطلبات الحالية وتحديث حالتها</p></div></div>
      <div className="pos-status-header-actions">
        <span className="afex-pos-desktop-theme-control"><PosThemeToggle /></span>
        <button type="button" onClick={() => void loadOrders()} disabled={loading}><RefreshIcon /><span>{loading ? 'جارٍ التحديث...' : 'تحديث'}</span></button>
        <button type="button" onClick={() => router.push('/pos')} aria-label="إغلاق"><CloseIcon /><span>إغلاق</span></button>
      </div>
    </header>

    <section className="pos-status-metrics" aria-label="ملخص حالات الطلبات">
      <article><span className="pos-status-dot is-progress" /><div><small>قيد التنفيذ</small><strong>{columns.in_progress.length}</strong></div></article>
      <article><span className="pos-status-dot is-ready" /><div><small>جاهزة</small><strong>{columns.ready.length}</strong></div></article>
    </section>

    {error ? <div className="pos-history-error" role="alert"><p>{error}</p><button type="button" onClick={() => void loadOrders()}>إعادة المحاولة</button></div> : null}
    {mutationFeedback ? <div className="pos-history-error" role={mutationFeedback.type === 'error' ? 'alert' : 'status'} data-feedback-type={mutationFeedback.type}><p>{mutationFeedback.message}</p></div> : null}
    {loading && orders.length === 0 ? <div className="pos-status-loading" aria-label="جارٍ تحميل حالة الطلبات">{[1, 2, 3].map((item) => <div className="pos-history-skeleton" key={item} />)}</div> : null}
    {!loading && !error && orders.length === 0 ? <section className="pos-history-empty"><WorkflowIcon /><h2>لا توجد طلبات تشغيلية حالية</h2><p>ستظهر الطلبات قيد التنفيذ أو الجاهزة هنا.</p></section> : null}

    {!error && orders.length > 0 ? <section className="pos-status-workspace">
      <section className="pos-status-list" aria-label="الطلبات التشغيلية">
        <div className="pos-status-search">
          <label><span className="sr-only">البحث برقم الفاتورة</span><SearchIcon /><input type="search" inputMode="numeric" value={searchQuery} onChange={(event) => updateSearch(event.target.value)} placeholder="البحث برقم الفاتورة" aria-label="البحث برقم الفاتورة" /></label>
          {searchQuery ? <button type="button" onClick={() => updateSearch('')} aria-label="مسح البحث">مسح</button> : null}
        </div>
        <div className="pos-status-list-scroll" data-order-status-list ref={listRef}>
          <div className="pos-status-list-labels" aria-hidden="true"><span>الطلب والعميل</span><span>التاريخ</span><span>الإجمالي</span><span>الحالة</span></div>
          {filteredOrders.map((order) => {
            const expanded = order.id === selectedId
            const detailsId = `pos-order-status-details-${order.id}`
            const orderDetails = orderDetailsById[order.id]
            const displayedOrder = orderDetails?.order ?? order
            return <Fragment key={order.id}>
              <button
                type="button"
                className={`pos-status-row ${styles.mobileOrderRow}`}
                data-order-status-row
                data-selected={order.id === selectedOrder?.id ? 'true' : 'false'}
                data-mobile-expanded={expanded ? 'true' : 'false'}
                aria-pressed={order.id === selectedOrder?.id}
                aria-expanded={expanded}
                aria-controls={detailsId}
                aria-label={`عرض تفاصيل الطلب ${order.order_number}`}
                ref={expanded ? selectedRowRef : undefined}
                onClick={() => selectOrder(order.id)}
              >
                <span className="pos-status-row-identity"><strong dir="ltr">{order.order_number}</strong><small>{order.customer_name || 'عميل نقدي'}{order.customer_phone ? ` · ${order.customer_phone}` : ''}</small></span>
                <time dateTime={order.created_at}>{formatPosGregorianDateTime(order.created_at)}</time>
                <b>{formatCurrency(order.total)}</b>
                <span className={ORDER_STATUS_MAP[order.status].className}>{ORDER_STATUS_MAP[order.status].label}</span>
              </button>
              {expanded ? <OrderDetailsPanel id={detailsId} inline order={displayedOrder} details={orderDetails} nextStatus={STATUS_TRANSITIONS[order.status]} updatingId={updatingId} onRetryDetails={(orderId) => void loadOrderDetails(orderId, true)} onAdvance={(selected) => void advance(selected)} /> : null}
            </Fragment>
          })}
          {filteredOrders.length === 0 ? <div className="pos-status-search-empty"><SearchIcon /><strong>لا توجد فاتورة مطابقة</strong><button type="button" onClick={() => updateSearch('')}>مسح البحث</button></div> : null}
          {hasMore && filteredOrders.length > 0 ? <div className="pos-history-more"><button type="button" onClick={() => void loadOrders(page + 1)} disabled={loading}>{loading ? 'جارٍ التحميل...' : 'تحميل المزيد'}</button></div> : null}
        </div>
      </section>

      {selectedOrder ? <OrderDetailsPanel order={orderDetailsById[selectedOrder.id]?.order ?? selectedOrder} details={orderDetailsById[selectedOrder.id]} nextStatus={selectedNextStatus} updatingId={updatingId} onRetryDetails={(orderId) => void loadOrderDetails(orderId, true)} onAdvance={(selected) => void advance(selected)} /> : <aside className={`pos-status-details is-empty ${styles.desktopDetails}`} data-order-status-details aria-live="polite"><SearchIcon /><h2>لا توجد فاتورة مطابقة</h2><p>امسح البحث لعرض الطلبات المتاحة.</p></aside>}
    </section> : null}
  </main>
  {resultDialog ? <OrderStatusResultDialog snapshot={resultDialog} onClose={closeResultDialog} restoreFocusRef={transitionTriggerRef} fallbackFocusRef={pageHeadingRef} /> : null}
  </div>
}

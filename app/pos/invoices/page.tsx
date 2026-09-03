'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePageAccess } from '@/hooks/use-page-access'
import { getClientErrorMessage } from '@/lib/api/client-error'
import { formatCurrency } from '@/lib/orders/format'
import { mapOrderSummaryToOrderRecord, type OrderRecord } from '@/lib/orders/orders-page'
import { normalizeOrderRecord, type OrderSourceRow } from '@/lib/orders/normalize'
import { readOfflineOrderRecord, readOfflineOrderRecords } from '@/lib/orders/offline-client'
import { shouldUseOfflineReadFallback } from '@/lib/offline/read-fallback'
import { POS_ACCESS_ROLES } from '@/lib/permissions'
import { resolveInvoicePaymentDisplay } from '@/lib/invoices/order-payment'
import { formatRiyadhDateTime, formatRiyadhTime, groupInvoicesByRiyadhDate, normalizeInvoiceLedgerSearch } from '@/lib/pos/invoice-ledger'
import { isLatestInvoiceLedgerRequest, mergeInvoiceLedgerPage, selectInvoiceLedgerCollection } from '@/lib/pos/invoice-ledger-collection'
import { PosInvoicePreviewCurtain, type InvoicePreviewMode } from '@/components/pos-invoice-preview-curtain'
import { PosThemeToggle } from '@/components/pos-theme-toggle'
import styles from './invoice-mobile-interactions.module.css'

const PAGE_SIZE = 24
const MOBILE_INVOICE_MEDIA_QUERY = '(max-width: 767.98px)'
const MOBILE_SHEET_ANIMATION_MS = 240
type InvoiceFilter = 'all' | 'paid' | 'refunded'
type PaymentDisplay = ReturnType<typeof resolveInvoicePaymentDisplay>

function InvoiceIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v16l-3-2-4 2-4-2-3 2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7"/><path d="M9 8h6M9 12h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
}

function ReceiptIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" stroke="currentColor" strokeWidth="1.7"/><path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
}

function DigitalInvoiceIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3h7l4 4v14H7V3Z" stroke="currentColor" strokeWidth="1.7"/><path d="M14 3v5h5M10 13h5M10 17h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
}

function paymentStatusLabel(value: string) {
  const normalized = value.trim().toLowerCase()
  if (['paid', 'completed', 'succeeded'].includes(normalized)) return 'مدفوعة'
  if (normalized === 'refunded') return 'مستردة'
  if (['partial', 'partially_paid', 'pending'].includes(normalized)) return 'غير مكتملة'
  if (['cancelled', 'canceled', 'void'].includes(normalized)) return 'ملغاة'
  return value && value !== '—' ? value : 'حالة غير محددة'
}

function InvoiceRowFields({ order }: { order: OrderRecord }) {
  return <>
    <strong role="gridcell" data-column="invoice-number" data-label="رقم الفاتورة" className="is-invoice-number" dir="ltr">{order.invoice_number}</strong>
    <span role="gridcell" data-column="customer" data-label="اسم العميل" className="is-customer" title={order.customer_name || 'عميل نقدي'}>{order.customer_name || 'عميل نقدي'}</span>
    <time role="gridcell" data-column="time" data-label="التوقيت">{formatRiyadhTime(order.created_at)}</time>
    <span role="gridcell" data-column="payment" data-label="طريقة الدفع" className="is-payment">{order.payment_method}</span>
    <b role="gridcell" data-column="total" data-label="الإجمالي">{formatCurrency(order.total)}</b>
    <i role="gridcell" data-column="status" data-label="حالة الفاتورة">{paymentStatusLabel(order.payment_status)}</i>
  </>
}

function InvoiceDetailsContent({ invoice, loading, error, paymentDisplay }: { invoice: OrderRecord; loading: boolean; error: string; paymentDisplay: PaymentDisplay | null }) {
  return <>
    {loading ? <p className="pos-sheet-message">جارٍ تحميل التفاصيل...</p> : null}
    {error ? <p className="pos-sheet-error" role="alert">{error}</p> : null}
    {!loading && !error ? <>
      <dl className="pos-invoice-detail-meta"><div><dt>العميل</dt><dd>{invoice.customer_name || 'عميل نقدي'}</dd></div><div><dt>التاريخ والوقت</dt><dd>{formatRiyadhDateTime(invoice.created_at)}</dd></div><div><dt>طريقة الدفع</dt><dd>{invoice.payment_method}</dd></div><div><dt>رقم الطلب</dt><dd dir="ltr">{invoice.order_number}</dd></div></dl>
      <section className="pos-invoice-detail-items"><h3>المنتجات والخدمات</h3>{invoice.items.length ? invoice.items.map((item, index) => <div key={`${invoice.id}-${index}`}><span><b>{item.item_name || 'عنصر'}</b><small>{item.quantity} × {formatCurrency(item.unit_price)}</small></span><strong>{formatCurrency(item.line_total)}</strong></div>) : <p>لا توجد تفاصيل عناصر متاحة.</p>}</section>
      <dl className="pos-invoice-detail-totals"><div><dt>المجموع قبل الضريبة</dt><dd>{formatCurrency(invoice.subtotal)}</dd></div>{invoice.discount > 0 ? <div><dt>الخصم</dt><dd>{formatCurrency(invoice.discount)}</dd></div> : null}<div><dt>الضريبة</dt><dd>{formatCurrency(invoice.tax)}</dd></div><div className="is-total"><dt>الإجمالي</dt><dd>{formatCurrency(invoice.total)}</dd></div></dl>
      {paymentDisplay?.kind === 'cash-details-available' ? <section className="pos-invoice-cash-breakdown"><h3>تفاصيل الدفع النقدي</h3><dl><div><dt>إجمالي الفاتورة</dt><dd>{formatCurrency(invoice.total)}</dd></div><div><dt>المبلغ المستلم من العميل</dt><dd>{formatCurrency(paymentDisplay.received)}</dd></div><div><dt>الباقي للعميل</dt><dd>{formatCurrency(paymentDisplay.change)}</dd></div></dl></section> : null}
      {paymentDisplay?.kind === 'cash-details-unavailable' ? <p className="pos-invoice-payment-unavailable">تفاصيل التحصيل النقدي غير متاحة لهذه الفاتورة</p> : null}
      {paymentDisplay?.kind === 'deferred-balance-available' ? <section className="pos-invoice-outstanding"><span>المبلغ المتبقي على العميل</span><b>{formatCurrency(paymentDisplay.outstanding)}</b></section> : null}
      {paymentDisplay?.kind === 'deferred-balance-unavailable' ? <p className="pos-invoice-payment-unavailable">تفاصيل المبلغ المتبقي غير متاحة لهذه الفاتورة</p> : null}
      {paymentDisplay?.kind === 'refunded-without-refund-amount' ? <p className="pos-invoice-refund-note">الفاتورة مستردة. مبلغ الاسترداد التفصيلي غير متاح.</p> : null}
    </> : null}
  </>
}

function InvoiceDetailActions({ className, disabled, onPreview }: { className?: string; disabled: boolean; onPreview: (mode: InvoicePreviewMode) => void }) {
  return <footer className={className}><button type="button" onClick={() => onPreview('thermal')} disabled={disabled}><ReceiptIcon />الفاتورة الحرارية</button><button type="button" onClick={() => onPreview('digital')} disabled={disabled}><DigitalInvoiceIcon />عرض الفاتورة الرقمية</button></footer>
}

export default function PosInvoiceHistoryPage() {
  const router = useRouter()
  const access = usePageAccess({ allowedRoles: [...POS_ACCESS_ROLES], redirectIfNoUser: '/pos/login', redirectIfForbidden: '/pos' })
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [searchResults, setSearchResults] = useState<OrderRecord[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedDetails, setSelectedDetails] = useState<OrderRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [preview, setPreview] = useState<{ mode: InvoicePreviewMode; invoice: OrderRecord } | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [error, setError] = useState('')
  const [detailsError, setDetailsError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<InvoiceFilter>('all')
  const [unfilteredMeta, setUnfilteredMeta] = useState({ page: 1, hasMore: false, totalCount: 0 })
  const [searchMeta, setSearchMeta] = useState({ page: 1, hasMore: false, totalCount: 0 })
  const [mobileDetailsSummary, setMobileDetailsSummary] = useState<OrderRecord | null>(null)
  const [mobileDetails, setMobileDetails] = useState<OrderRecord | null>(null)
  const [mobileDetailsLoading, setMobileDetailsLoading] = useState(false)
  const [mobileDetailsError, setMobileDetailsError] = useState('')
  const [mobileSheetClosing, setMobileSheetClosing] = useState(false)
  const invoiceRequestRef = useRef(0)
  const invoiceRequestControllerRef = useRef<AbortController | null>(null)
  const authoritativeLoadedRef = useRef(false)
  const detailsRequestRef = useRef(0)
  const mobileDetailsRequestRef = useRef(0)
  const mobileDetailsTriggerRef = useRef<HTMLButtonElement | null>(null)
  const mobileSheetRef = useRef<HTMLElement | null>(null)
  const mobileSheetCloseRef = useRef<HTMLButtonElement | null>(null)
  const mobileSheetCloseTimerRef = useRef<number | null>(null)
  const mobileSheetClosingRef = useRef(false)
  const invoiceLedgerRef = useRef<HTMLDivElement | null>(null)
  const normalizedSearch = useMemo(() => normalizeInvoiceLedgerSearch(search), [search])

  const loadInvoices = useCallback(async (requestedPage = 1, query = normalizedSearch) => {
    if (!access.allowed || !access.tenantId || !access.branchId) return
    invoiceRequestControllerRef.current?.abort()
    const controller = new AbortController()
    invoiceRequestControllerRef.current = controller
    const requestId = ++invoiceRequestRef.current
    setLoading(true); setError('')
    const loadOfflineInvoices = async () => {
      const allOrders = await readOfflineOrderRecords()
      const source = query
        ? allOrders.filter((order) =>
            [order.invoice_number, order.order_number, order.customer_name]
              .some((value) => normalizeInvoiceLedgerSearch(value).includes(query))
          )
        : allOrders
      const start = (requestedPage - 1) * PAGE_SIZE
      const mapped = source.slice(start, start + PAGE_SIZE)
      if (!isLatestInvoiceLedgerRequest(invoiceRequestRef.current, requestId, controller.signal.aborted)) return
      const updateCollection = (current: OrderRecord[]) => mergeInvoiceLedgerPage(current, mapped, requestedPage)
      const nextMeta = { page: requestedPage, hasMore: start + mapped.length < source.length, totalCount: source.length }
      if (query) {
        setSearchResults((current) => updateCollection(current ?? []))
        setSearchMeta(nextMeta)
      } else {
        setOrders(updateCollection)
        setUnfilteredMeta(nextMeta)
        authoritativeLoadedRef.current = true
      }
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await loadOfflineInvoices()
        return
      }
      const params = new URLSearchParams({ mode: 'full', page: String(requestedPage), pageSize: String(PAGE_SIZE) })
      if (query) params.set('search', query)
      const response = await fetch(`/api/orders?${params}`, { credentials: 'include', cache: 'no-store', signal: controller.signal })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success) throw new Error(getClientErrorMessage(result, 'تعذر تحميل سجل الفواتير.'))
      const rows = Array.isArray(result.items) ? result.items as OrderSourceRow[] : []
      const mapped = rows.map((row, index) => mapOrderSummaryToOrderRecord(normalizeOrderRecord(row, index)))
      if (!isLatestInvoiceLedgerRequest(invoiceRequestRef.current, requestId, controller.signal.aborted)) return
      const updateCollection = (current: OrderRecord[]) => mergeInvoiceLedgerPage(current, mapped, requestedPage)
      const nextMeta = { page: requestedPage, hasMore: Boolean(result.hasMore), totalCount: Number(result.totalCount) || mapped.length }
      if (query) {
        setSearchResults((current) => updateCollection(current ?? []))
        setSearchMeta(nextMeta)
      } else {
        setOrders(updateCollection)
        setUnfilteredMeta(nextMeta)
        authoritativeLoadedRef.current = true
      }
    } catch (loadError) {
      if (!controller.signal.aborted && invoiceRequestRef.current === requestId) {
        if (shouldUseOfflineReadFallback(loadError)) {
          try {
            await loadOfflineInvoices()
            return
          } catch {
            setError('لقطة سجل الفواتير المحلية غير مكتملة.')
            return
          }
        }
        setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل سجل الفواتير.')
      }
    } finally {
      if (invoiceRequestRef.current === requestId) setLoading(false)
    }
  }, [access.allowed, access.branchId, access.tenantId, normalizedSearch])

  useEffect(() => {
    if (!normalizedSearch) {
      if (!authoritativeLoadedRef.current) void loadInvoices(1, '')
      return
    }
    const timeoutId = window.setTimeout(() => void loadInvoices(1), 250)
    return () => window.clearTimeout(timeoutId)
  }, [loadInvoices, normalizedSearch])

  useEffect(() => () => {
    invoiceRequestControllerRef.current?.abort()
    invoiceRequestRef.current += 1
    detailsRequestRef.current += 1
    mobileDetailsRequestRef.current += 1
    if (mobileSheetCloseTimerRef.current !== null) window.clearTimeout(mobileSheetCloseTimerRef.current)
  }, [])

  const updateSearch = (value: string) => {
    const nextQuery = normalizeInvoiceLedgerSearch(value)
    if (nextQuery !== normalizedSearch) {
      invoiceRequestControllerRef.current?.abort()
      invoiceRequestRef.current += 1
      setLoading(false)
    }
    setSearch(nextQuery ? value : '')
    if (!nextQuery) {
      setSearchResults(null)
      setError('')
    }
  }

  const activeOrders = useMemo(() => selectInvoiceLedgerCollection(normalizedSearch, orders, searchResults), [normalizedSearch, orders, searchResults])
  const activeMeta = normalizedSearch ? searchMeta : unfilteredMeta
  const visibleOrders = useMemo(() => activeOrders.filter((order) => {
    const matchesSearch = !normalizedSearch || [order.invoice_number, order.order_number, order.customer_name].some((value) => normalizeInvoiceLedgerSearch(value).includes(normalizedSearch))
    const status = order.payment_status.trim().toLowerCase()
    const matchesFilter = filter === 'all' || (filter === 'paid' ? ['paid', 'completed', 'succeeded'].includes(status) : status === 'refunded')
    return matchesSearch && matchesFilter
  }), [activeOrders, filter, normalizedSearch])
  const groups = useMemo(() => groupInvoicesByRiyadhDate(visibleOrders), [visibleOrders])
  const selectedSummary = useMemo(() => visibleOrders.find((order) => order.id === selectedId) ?? visibleOrders[0] ?? null, [selectedId, visibleOrders])
  const selected = selectedDetails?.id === selectedSummary?.id ? selectedDetails : selectedSummary
  const selectedSummaryId = selectedSummary?.id
  const mobileInvoice = mobileDetails?.id === mobileDetailsSummary?.id ? mobileDetails : mobileDetailsSummary

  useEffect(() => {
    if (!selectedSummaryId) return
    const requestId = ++detailsRequestRef.current
    void (async () => {
      setDetailsLoading(true); setDetailsError('')
      const loadOfflineDetails = async () => {
        const detailed = await readOfflineOrderRecord(selectedSummaryId)
        if (!detailed) throw new Error('OFFLINE_ORDER_NOT_READY')
        if (detailsRequestRef.current === requestId) setSelectedDetails(detailed)
      }
      try {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          await loadOfflineDetails()
          return
        }
        const response = await fetch(`/api/orders?${new URLSearchParams({ mode: 'details', id: selectedSummaryId })}`, { credentials: 'include', cache: 'no-store' })
        const result = await response.json().catch(() => null)
        if (!response.ok || !result?.success || !Array.isArray(result.items) || result.items.length !== 1) throw new Error('تعذر تحميل تفاصيل الفاتورة المحددة.')
        const detailed = mapOrderSummaryToOrderRecord(normalizeOrderRecord(result.items[0] as OrderSourceRow, 0))
        if (detailed.id !== selectedSummaryId) throw new Error('تعذر مطابقة تفاصيل الفاتورة المحددة.')
        if (detailsRequestRef.current === requestId) setSelectedDetails(detailed)
      } catch (detailsLoadError) {
        if (detailsRequestRef.current === requestId) {
          if (shouldUseOfflineReadFallback(detailsLoadError)) {
            try {
              await loadOfflineDetails()
              return
            } catch {
              setDetailsError('تفاصيل الفاتورة المحلية غير مكتملة.')
              return
            }
          }
          setDetailsError(detailsLoadError instanceof Error ? detailsLoadError.message : 'تعذر تحميل تفاصيل الفاتورة المحددة.')
        }
      } finally {
        if (detailsRequestRef.current === requestId) setDetailsLoading(false)
      }
    })()
  }, [selectedSummaryId])

  useEffect(() => {
    if (!mobileDetailsSummary) return
    const requestId = ++mobileDetailsRequestRef.current
    const controller = new AbortController()
    const requestedInvoiceId = mobileDetailsSummary.id
    void (async () => {
      const loadOfflineDetails = async () => {
        const detailed = await readOfflineOrderRecord(requestedInvoiceId)
        if (!detailed) throw new Error('OFFLINE_ORDER_NOT_READY')
        if (mobileDetailsRequestRef.current === requestId) setMobileDetails(detailed)
      }
      try {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          await loadOfflineDetails()
          return
        }
        const response = await fetch(`/api/orders?${new URLSearchParams({ mode: 'details', id: requestedInvoiceId })}`, { credentials: 'include', cache: 'no-store', signal: controller.signal })
        const result = await response.json().catch(() => null)
        if (!response.ok || !result?.success || !Array.isArray(result.items) || result.items.length !== 1) throw new Error('تعذر تحميل تفاصيل الفاتورة المحددة.')
        const detailed = mapOrderSummaryToOrderRecord(normalizeOrderRecord(result.items[0] as OrderSourceRow, 0))
        if (detailed.id !== requestedInvoiceId) throw new Error('تعذر مطابقة تفاصيل الفاتورة المحددة.')
        if (mobileDetailsRequestRef.current === requestId) setMobileDetails(detailed)
      } catch (detailsLoadError) {
        if (!controller.signal.aborted && mobileDetailsRequestRef.current === requestId) {
          if (shouldUseOfflineReadFallback(detailsLoadError)) {
            try {
              await loadOfflineDetails()
              return
            } catch {
              setMobileDetailsError('تفاصيل الفاتورة المحلية غير مكتملة.')
              return
            }
          }
          setMobileDetailsError(detailsLoadError instanceof Error ? detailsLoadError.message : 'تعذر تحميل تفاصيل الفاتورة المحددة.')
        }
      } finally {
        if (!controller.signal.aborted && mobileDetailsRequestRef.current === requestId) setMobileDetailsLoading(false)
      }
    })()
    return () => controller.abort()
  }, [mobileDetailsSummary])

  const finishMobileDetailsClose = useCallback(() => {
    if (mobileSheetCloseTimerRef.current !== null) window.clearTimeout(mobileSheetCloseTimerRef.current)
    mobileSheetCloseTimerRef.current = null
    mobileDetailsRequestRef.current += 1
    mobileSheetClosingRef.current = false
    setMobileSheetClosing(false)
    setMobileDetailsSummary(null)
    setMobileDetails(null)
    setMobileDetailsLoading(false)
    setMobileDetailsError('')
  }, [])

  const requestMobileDetailsClose = useCallback(() => {
    if (!mobileDetailsSummary || mobileSheetClosingRef.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finishMobileDetailsClose()
      return
    }
    mobileSheetClosingRef.current = true
    setMobileSheetClosing(true)
    mobileSheetCloseTimerRef.current = window.setTimeout(finishMobileDetailsClose, MOBILE_SHEET_ANIMATION_MS)
  }, [finishMobileDetailsClose, mobileDetailsSummary])

  useEffect(() => {
    if (!mobileDetailsSummary) return
    const pageMain = document.querySelector<HTMLElement>('.pos-invoices-page > main')
    const ledger = invoiceLedgerRef.current
    const previousBodyOverflow = document.body.style.overflow
    const previousDocumentOverflow = document.documentElement.style.overflow
    const previousLedgerOverflow = ledger?.style.overflow ?? ''
    const previousMainInert = pageMain?.inert ?? false
    const focusFrame = window.requestAnimationFrame(() => mobileSheetCloseRef.current?.focus())
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    if (ledger) ledger.style.overflow = 'hidden'
    if (pageMain) pageMain.inert = true

    const handleSheetKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        requestMobileDetailsClose()
        return
      }
      if (event.key !== 'Tab' || !mobileSheetRef.current) return
      const focusable = Array.from(mobileSheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
        .filter((element) => element.getClientRects().length > 0)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    const mobileQuery = window.matchMedia(MOBILE_INVOICE_MEDIA_QUERY)
    const closeAfterLeavingMobileGeometry = () => {
      if (!mobileQuery.matches) finishMobileDetailsClose()
    }
    window.addEventListener('keydown', handleSheetKeyDown)
    mobileQuery.addEventListener('change', closeAfterLeavingMobileGeometry)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousDocumentOverflow
      if (ledger) ledger.style.overflow = previousLedgerOverflow
      if (pageMain) pageMain.inert = previousMainInert
      window.removeEventListener('keydown', handleSheetKeyDown)
      mobileQuery.removeEventListener('change', closeAfterLeavingMobileGeometry)
      const returnFocusTarget = mobileDetailsTriggerRef.current
      mobileDetailsTriggerRef.current = null
      if (returnFocusTarget?.isConnected) returnFocusTarget.focus()
    }
  }, [finishMobileDetailsClose, mobileDetailsSummary, requestMobileDetailsClose])

  const openMobileDetails = (order: OrderRecord, trigger: HTMLButtonElement) => {
    if (mobileDetailsSummary) return
    mobileDetailsTriggerRef.current = trigger
    setPreview(null)
    mobileSheetClosingRef.current = false
    setMobileSheetClosing(false)
    setMobileDetails(null)
    setMobileDetailsLoading(true)
    setMobileDetailsError('')
    setMobileDetailsSummary(order)
  }

  const openPreviewFor = (invoice: OrderRecord | null, mode: InvoicePreviewMode, disabled: boolean) => {
    if (!invoice || disabled) return
    setPreview({ mode, invoice })
  }

  const openMobilePreview = (mode: InvoicePreviewMode) => {
    if (!mobileInvoice || mobileDetailsLoading || mobileDetailsError) return
    if (mobileSheetCloseTimerRef.current !== null) window.clearTimeout(mobileSheetCloseTimerRef.current)
    mobileSheetCloseTimerRef.current = null
    mobileDetailsTriggerRef.current = null
    mobileDetailsRequestRef.current += 1
    mobileSheetClosingRef.current = false
    setMobileDetailsSummary(null)
    setMobileDetails(null)
    setMobileSheetClosing(false)
    setPreview({ mode, invoice: mobileInvoice })
  }

  const closeInvoicePage = useCallback(() => router.push('/pos'), [router])

  if (access.loading || !access.allowed) return <div className="pos-history-gate">جارٍ التحقق من الصلاحية...</div>
  const paymentDisplay = selected ? resolveInvoicePaymentDisplay({ paymentMethod: selected.payment_method_raw || selected.payment_method_key, paymentStatus: selected.payment_status, total: selected.total, cashReceived: selected.cash_received, remainingFromCustomer: selected.remaining_from_customer }) : null
  const mobilePaymentDisplay = mobileInvoice ? resolveInvoicePaymentDisplay({ paymentMethod: mobileInvoice.payment_method_raw || mobileInvoice.payment_method_key, paymentStatus: mobileInvoice.payment_status, total: mobileInvoice.total, cashReceived: mobileInvoice.cash_received, remainingFromCustomer: mobileInvoice.remaining_from_customer }) : null

  return <div className="pos-invoice-history pos-invoices-page" dir="rtl"><main>
    <header className="pos-invoices-header"><div className="pos-history-heading"><span><InvoiceIcon /></span><div><h1>الفواتير</h1><p>سجل المبيعات والفواتير</p></div></div><div><span className="afex-pos-desktop-theme-control"><PosThemeToggle /></span><button type="button" className="is-close" data-pos-invoices-page-close onClick={closeInvoicePage}>إغلاق</button><button type="button" onClick={() => void loadInvoices(1)} disabled={loading}>{loading ? 'جارٍ التحديث...' : 'تحديث'}</button></div></header>
    <div className="pos-invoices-toolbar"><label className="pos-invoices-search"><span className="sr-only">ابحث برقم الفاتورة أو اسم العميل</span><input value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="ابحث برقم الفاتورة أو اسم العميل" />{search ? <button type="button" className="pos-invoices-search-clear" aria-label="مسح البحث" onClick={() => updateSearch('')}>مسح</button> : null}</label><div role="group" aria-label="تصفية الفواتير"><button type="button" data-active={filter === 'all'} onClick={() => setFilter('all')}>الكل</button><button type="button" data-active={filter === 'paid'} onClick={() => setFilter('paid')}>مدفوعة</button><button type="button" data-active={filter === 'refunded'} onClick={() => setFilter('refunded')}>مستردة</button></div></div>
    <section className="pos-invoices-workspace">
      <div ref={invoiceLedgerRef} className="pos-invoice-ledger" data-testid="invoices-scroll-viewport" role="grid" aria-label="سجل الفواتير">
        <div className="pos-invoice-ledger-columns" role="row"><span data-column="invoice-number" role="columnheader">رقم الفاتورة</span><span data-column="customer" role="columnheader">اسم العميل</span><span data-column="time" role="columnheader">التوقيت</span><span data-column="payment" role="columnheader">طريقة الدفع</span><span data-column="total" role="columnheader">الإجمالي</span><span data-column="status" role="columnheader">حالة الفاتورة</span></div>
        {error ? <div className="pos-history-error" role="alert"><p>{error}</p><button type="button" onClick={() => void loadInvoices(1)}>إعادة المحاولة</button></div> : null}
        {loading && orders.length === 0 ? <div className="pos-invoice-ledger-loading" aria-label="جارٍ تحميل الفواتير">جارٍ تحميل الفواتير...</div> : null}
        {!loading && !error && visibleOrders.length === 0 ? <section className="pos-invoice-ledger-empty"><InvoiceIcon /><h2>لا توجد فواتير مطابقة</h2><p>غيّر البحث أوعامل التصفية لعرض الفواتير.</p></section> : null}
        {!error ? groups.map((group) => <section className="pos-invoice-date-group" role="rowgroup" key={group.key}><h2>{group.label}</h2><div>{group.invoices.map((order) => <Fragment key={order.id}>
          <button type="button" className={`pos-invoice-ledger-row ${styles.desktopRow}`} role="row" data-desktop-invoice-row data-selected={order.id === selectedSummary?.id} aria-selected={order.id === selectedSummary?.id} onClick={() => { setPreview(null); setSelectedId(order.id); setDetailOpen(true) }}><InvoiceRowFields order={order} /></button>
          <article className={`pos-invoice-ledger-row ${styles.mobileRow}`} role="row" data-mobile-invoice-row data-invoice-reference={order.invoice_number}><InvoiceRowFields order={order} /><span role="gridcell" className={styles.mobileDetailsCell}><button type="button" className={styles.mobileDetailsButton} data-mobile-invoice-details-trigger aria-label={`عرض تفاصيل الفاتورة ${order.invoice_number}`} onClick={(event) => openMobileDetails(order, event.currentTarget)}>عرض التفاصيل</button></span></article>
        </Fragment>)}</div></section>) : null}
        {!error && activeMeta.hasMore ? <div className="pos-history-more"><button type="button" onClick={() => void loadInvoices(activeMeta.page + 1)} disabled={loading}>{loading ? 'جارٍ التحميل...' : `تحميل المزيد (${activeOrders.length} من ${activeMeta.totalCount})`}</button></div> : null}
      </div>
      <aside className={`pos-invoice-detail-pane ${styles.desktopPane}`} data-open={detailOpen} data-testid="invoice-detail-pane" aria-live="polite">
        {!selected ? <div className="pos-invoice-detail-empty"><InvoiceIcon /><h2>اختر فاتورة</h2><p>ستظهر تفاصيل الفاتورة المحددة هنا.</p></div> : <>
          <header><div><small>تفاصيل الفاتورة</small><h2 dir="ltr">{selected.invoice_number}</h2></div><i>{paymentStatusLabel(selected.payment_status)}</i></header>
          <div className="pos-invoice-detail-scroll"><InvoiceDetailsContent invoice={selected} loading={detailsLoading} error={detailsError} paymentDisplay={paymentDisplay} /></div>
          <InvoiceDetailActions disabled={detailsLoading || Boolean(detailsError)} onPreview={(mode) => openPreviewFor(selected, mode, detailsLoading || Boolean(detailsError))} />
        </>}
      </aside>
    </section>
  </main>
  {mobileDetailsSummary && mobileInvoice ? <div className={styles.mobileSheetLayer} data-mobile-blocking-overlay data-mobile-invoice-sheet data-closing={mobileSheetClosing}>
    <div className={styles.mobileSheetBackdrop} aria-hidden="true" />
    <section ref={mobileSheetRef} className={styles.mobileSheet} role="dialog" aria-modal="true" aria-labelledby="mobile-invoice-details-title" data-invoice-reference={mobileInvoice.invoice_number}>
      <header className={styles.mobileSheetHeader}><div><small>تفاصيل الفاتورة</small><h2 id="mobile-invoice-details-title" dir="ltr">{mobileInvoice.invoice_number}</h2></div><button ref={mobileSheetCloseRef} type="button" className={styles.mobileSheetClose} aria-label="إغلاق تفاصيل الفاتورة" onClick={requestMobileDetailsClose}><span aria-hidden="true">×</span></button></header>
      <div className={`pos-invoice-detail-scroll ${styles.mobileSheetBody}`} data-testid="mobile-invoice-details-scroll-owner"><InvoiceDetailsContent invoice={mobileInvoice} loading={mobileDetailsLoading} error={mobileDetailsError} paymentDisplay={mobilePaymentDisplay} /></div>
      <InvoiceDetailActions className={styles.mobileSheetFooter} disabled={mobileDetailsLoading || Boolean(mobileDetailsError)} onPreview={openMobilePreview} />
    </section>
  </div> : null}
  {preview ? <PosInvoicePreviewCurtain key={`${preview.mode}-${preview.invoice.id}`} mode={preview.mode} invoice={preview.invoice} onClose={() => setPreview(null)} /> : null}</div>
}

'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { usePageAccess } from '@/hooks/use-page-access'

type OrderStatus = 'new' | 'in_progress' | 'ready' | 'delivered'
type OrderFilter = 'all' | 'today' | OrderStatus

type RawInvoiceItem = {
  item_name_snapshot?: string
  item_type_snapshot?: string
  quantity?: number | string
  unit_price?: number | string
  line_total?: number | string
  [key: string]: unknown
}

type RawInvoice = {
  invoice_number?: string
  payment_method?: string
  payment_status?: string
  note?: string
  total?: number | string
  subtotal?: number | string
  discount?: number | string
  tax?: number | string
  cash_received?: number | string
  remaining_from_customer?: number | string
  cash_change?: number | string
  invoice_items?: RawInvoiceItem[]
}

type RawOrder = {
  id?: string
  order_number?: string
  status?: string
  created_at?: string
  customers?:
    | {
        name?: string
        phone?: string
        phone_number?: string
      }
    | {
        name?: string
        phone?: string
        phone_number?: string
      }[]
  invoices?: RawInvoice[] | RawInvoice
  [key: string]: unknown
}

type OrderItem = {
  item_name: string
  item_type: string
  quantity: number
  unit_price: number
  line_total: number
}

type Order = {
  id: string
  order_number: string
  customer_name: string
  customer_phone: string
  total: number
  status: OrderStatus
  created_at: string
  invoice_number: string
  payment_method: string
  payment_status: string
  note: string
  cash_received: number
  remaining_from_customer: number
  cash_change: number
  items: OrderItem[]
}

const statusMap: Record<OrderStatus, { label: string; className: string }> = {
  new: {
    label: 'جديد',
    className: 'badge badge-blue',
  },
  in_progress: {
    label: 'قيد التنفيذ',
    className: 'badge badge-amber',
  },
  ready: {
    label: 'جاهز',
    className: 'badge badge-green',
  },
  delivered: {
    label: 'مستلم',
    className: 'badge badge-slate',
  },
}

const filters: { key: OrderFilter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'today', label: 'اليوم' },
  { key: 'new', label: 'جديد' },
  { key: 'in_progress', label: 'قيد التنفيذ' },
  { key: 'ready', label: 'جاهز' },
  { key: 'delivered', label: 'مستلم' },
]

const ORDERS_FETCH_LIMIT = 100

function normalizeStatus(value: unknown): OrderStatus {
  if (value === 'in_progress') return 'in_progress'
  if (value === 'ready') return 'ready'
  if (value === 'delivered') return 'delivered'
  return 'new'
}

function getStringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return '—'
}

function getNumberValue(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (!Number.isNaN(parsed)) {
        return parsed
      }
    }
  }
  return 0
}

function getPrimaryInvoice(invoices: RawOrder['invoices']): RawInvoice | null {
  if (Array.isArray(invoices)) {
    return invoices[0] || null
  }

  if (invoices && typeof invoices === 'object') {
    return invoices
  }

  return null
}

function getPrimaryCustomer(customers: RawOrder['customers']) {
  if (Array.isArray(customers)) return customers[0] || null
  if (customers && typeof customers === 'object') return customers
  return null
}

function normalizePaymentMethod(value: string): string {
  if (value === 'cash') return 'كاش'
  if (value === 'card') return 'شبكة'
  if (value === 'transfer') return 'تحويل'
  return value || '—'
}

function normalizeItems(items: RawInvoiceItem[] | undefined): OrderItem[] {
  if (!Array.isArray(items)) return []

  return items.map((item) => {
    const quantity = getNumberValue(item.quantity, 1)
    const unitPrice = getNumberValue(item.unit_price)
    const lineTotal = getNumberValue(item.line_total, quantity * unitPrice)

    return {
      item_name: getStringValue(item.item_name_snapshot),
      item_type: getStringValue(item.item_type_snapshot),
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
    }
  })
}

function normalizeOrder(row: RawOrder, index: number): Order {
  const primaryInvoice = getPrimaryInvoice(row.invoices)
  const primaryCustomer = getPrimaryCustomer(row.customers)

  return {
    id:
      typeof row.id === 'string' && row.id.trim() ? row.id : `row-${index}`,
    order_number: getStringValue(row.order_number),
    customer_name: getStringValue(primaryCustomer?.name),
    customer_phone: getStringValue(
      primaryCustomer?.phone,
      primaryCustomer?.phone_number
    ),
    total: getNumberValue(primaryInvoice?.total, primaryInvoice?.subtotal),
    status: normalizeStatus(row.status),
    created_at: getStringValue(row.created_at),
    invoice_number: getStringValue(primaryInvoice?.invoice_number),
    payment_method: normalizePaymentMethod(
      getStringValue(primaryInvoice?.payment_method)
    ),
    payment_status: getStringValue(primaryInvoice?.payment_status),
    note: getStringValue(primaryInvoice?.note),
    cash_received: getNumberValue(primaryInvoice?.cash_received),
    remaining_from_customer: getNumberValue(
      primaryInvoice?.remaining_from_customer
    ),
    cash_change: getNumberValue(primaryInvoice?.cash_change),
    items: normalizeItems(primaryInvoice?.invoice_items),
  }
}

function isSameDay(dateString: string): boolean {
  if (!dateString) return false

  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return false

  const now = new Date()

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

function formatCurrency(value: number) {
  return `${value.toFixed(2)} ر.س`
}

function formatDateTime(value: string) {
  if (!value || value === '—') return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('ar-SA')
}

export default function OrdersPage() {
  const access = usePageAccess(['admin', 'employee'])
  const authLoading = access.loading
  const allowed = access.allowed
  const role = access.userRole
  const roleLabel =
    role === 'admin'
      ? 'أدمن'
      : role === 'employee'
      ? 'موظف'
      : role === 'cashier'
      ? 'كاشير'
      : ''

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<OrderFilter>('all')

  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('orders_sound_enabled') !== 'false'
  })

  const initializedRef = useRef(false)
  const previousOrderIdsRef = useRef<Set<string>>(new Set())

  const canManageOrders = role === 'admin' || role === 'employee'
  const canUseOrderSound = role === 'admin' || role === 'employee'

  const showSuccess = (message: string) => {
    setSuccessMessage(message)
    setTimeout(() => setSuccessMessage(''), 3000)
  }

  const showError = (message: string) => {
    setErrorMessage(message)
    setTimeout(() => setErrorMessage(''), 5000)
  }

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showSuccess(`تم نسخ ${label}`)
    } catch {
      showError(`فشل نسخ ${label}`)
    }
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
      if (silent) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setErrorMessage('')

      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
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
        .order('created_at', { ascending: false })
        .limit(ORDERS_FETCH_LIMIT)

      if (error) {
        console.error('Supabase orders fetch error:', error)
        showError(`فشل تحميل الطلبات: ${error.message}`)
        setOrders([])
        setLoading(false)
        setRefreshing(false)
        return
      }

      const rows = Array.isArray(data) ? (data as RawOrder[]) : []
      const normalized = rows.map((row, index) => normalizeOrder(row, index))
      const nextIds = new Set(normalized.map((order) => order.id))

      if (!initializedRef.current) {
        previousOrderIdsRef.current = nextIds
        initializedRef.current = true
      } else {
        const newOrdersOnly = normalized.filter(
          (order) =>
            !previousOrderIdsRef.current.has(order.id) && order.status === 'new'
        )

        if (newOrdersOnly.length > 0 && soundEnabled && canUseOrderSound) {
          playNewOrderSound()
          showSuccess(`دخل ${newOrdersOnly.length} طلب جديد`)
        }

        previousOrderIdsRef.current = nextIds
      }

      setOrders(normalized)
      setLastUpdated(new Date().toLocaleTimeString('ar-SA'))
      setLoading(false)
      setRefreshing(false)
    },
    [playNewOrderSound, soundEnabled, canUseOrderSound]
  )

  useEffect(() => {
    localStorage.setItem(
      'orders_sound_enabled',
      soundEnabled ? 'true' : 'false'
    )
  }, [soundEnabled])

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
      fetchOrders(true)
    }, 15000)

    return () => clearInterval(interval)
  }, [allowed, fetchOrders])

  const todayOrders = useMemo(() => {
    return orders.filter((order) => isSameDay(order.created_at))
  }, [orders])

  const filteredOrders = useMemo(() => {
    const normalizedSearch = search.trim()

    return orders.filter((order) => {
      const matchesSearch =
        normalizedSearch === '' ||
        order.customer_name.includes(normalizedSearch) ||
        order.customer_phone.includes(normalizedSearch) ||
        order.order_number.includes(normalizedSearch) ||
        order.invoice_number.includes(normalizedSearch)

      const matchesFilter =
        filter === 'all'
          ? true
          : filter === 'today'
          ? isSameDay(order.created_at)
          : order.status === filter

      return matchesSearch && matchesFilter
    })
  }, [orders, search, filter])

  const stats = useMemo(() => {
    return {
      totalOrders: filteredOrders.length,
      newCount: filteredOrders.filter((order) => order.status === 'new').length,
      inProgressCount: filteredOrders.filter(
        (order) => order.status === 'in_progress'
      ).length,
      readyCount: filteredOrders.filter((order) => order.status === 'ready')
        .length,
      deliveredCount: filteredOrders.filter(
        (order) => order.status === 'delivered'
      ).length,
      revenue: filteredOrders.reduce((sum, order) => sum + order.total, 0),
      todayOrdersCount: todayOrders.length,
      todayRevenue: todayOrders.reduce((sum, order) => sum + order.total, 0),
    }
  }, [filteredOrders, todayOrders])

  const updateStatus = async (order: Order, status: OrderStatus) => {
    if (!canManageOrders) {
      showError('ليس لديك صلاحية لتغيير حالة الطلب')
      return
    }

    if (updatingId) return

    setUpdatingId(order.id)
    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', order.id)

    if (error) {
      console.error('Supabase status update error:', error)
      setUpdatingId(null)
      showError(`فشل تحديث حالة الطلب: ${error.message}`)
      return
    }

    setOrders((prev) =>
      prev.map((item) => (item.id === order.id ? { ...item, status } : item))
    )

    if (status === 'ready' && order.customer_phone !== '—') {
      try {
        const response = await fetch('/api/send-whatsapp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phone: order.customer_phone,
            customerName: order.customer_name,
            orderNumber: order.order_number,
            total: order.total,
          }),
        })

        const result = await response.json().catch(() => null)

        if (!response.ok || !result?.success) {
          showError('تم تحديث الحالة لكن فشل إرسال الواتساب')
          setUpdatingId(null)
          return
        }
      } catch (err) {
        console.error('WhatsApp send error:', err)
        showError('تم تحديث الحالة لكن فشل إرسال الواتساب')
        setUpdatingId(null)
        return
      }
    }

    showSuccess('تم تحديث الحالة بنجاح')
    setUpdatingId(null)
  }

  const printThermalReceipt = (order: Order) => {
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

    const statusLabel = statusMap[order.status]?.label || '—'
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
              <div class="title">Leather Fix ERP</div>
              <div class="subtitle">فاتورة طباعة حرارية</div>
            </div>

            <div class="line"></div>

            <div class="row"><span class="label">رقم الطلب</span><span class="value">${order.order_number}</span></div>
            <div class="row"><span class="label">رقم الفاتورة</span><span class="value">${order.invoice_number}</span></div>
            <div class="row"><span class="label">اسم العميل</span><span class="value">${order.customer_name}</span></div>
            <div class="row"><span class="label">الجوال</span><span class="value">${order.customer_phone}</span></div>
            <div class="row"><span class="label">الحالة</span><span class="value">${statusLabel}</span></div>
            <div class="row"><span class="label">الدفع</span><span class="value">${order.payment_method}</span></div>
            <div class="row"><span class="label">تاريخ الطلب</span><span class="value">${
              order.created_at
                ? new Date(order.created_at).toLocaleString('ar-SA')
                : '—'
            }</span></div>

            <div class="line"></div>
            <div class="section-title">العناصر</div>
            ${itemsHtml}

            <div class="total-box">
              <span>الإجمالي</span>
              <span>${order.total} ر.س</span>
            </div>

            ${
              order.note !== '—'
                ? `<div class="line"></div><div class="note"><strong>ملاحظة:</strong> ${order.note}</div>`
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

  const selectedOrder = useMemo(() => {
    return filteredOrders.find((order) => order.id === expandedOrderId) || null
  }, [filteredOrders, expandedOrderId])

  if (authLoading) {
    return (
      <div className="app-shell">
        <div className="page-wrap">
          <div className="page-card">جاري التحقق من الصلاحية...</div>
        </div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="app-shell">
        <div className="page-wrap">
          <div className="page-card">جارٍ التحويل...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="page-wrap">
        {successMessage && <div className="success-alert">{successMessage}</div>}
        {errorMessage && <div className="error-alert">{errorMessage}</div>}

        <div className="page-hero">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="page-title">إدارة الطلبات</h1>
              <p className="page-subtitle">Leather Fix ERP</p>
              <p className="mt-2 text-xs text-slate-400">
                آخر تحديث: {lastUpdated || '—'}
                {refreshing ? ' • جاري التحديث...' : ''}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/" className="secondary-btn">
                العودة إلى القائمة الرئيسية
              </Link>

              {roleLabel ? (
                <span className="badge badge-blue">الصلاحية: {roleLabel}</span>
              ) : (
                <span className="badge badge-slate">الصلاحية: غير معروفة</span>
              )}

              {canUseOrderSound && (
                <>
                  <button
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
                    className={soundEnabled ? 'primary-btn' : 'secondary-btn'}
                  >
                    {soundEnabled ? 'الصوت: شغال' : 'الصوت: مقفل'}
                  </button>

                  <button
                    onClick={() => {
                      if (!soundEnabled) {
                        showError('شغّل الصوت أولاً')
                        return
                      }
                      playNewOrderSound()
                      showSuccess('تم اختبار الصوت')
                    }}
                    className="secondary-btn"
                  >
                    اختبار الصوت
                  </button>
                </>
              )}

              <button onClick={() => fetchOrders()} className="secondary-btn">
                تحديث القائمة
              </button>
            </div>
          </div>
        </div>

        <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          يتم عرض آخر {ORDERS_FETCH_LIMIT} طلب فقط لتحسين السرعة والأداء.
        </div>

        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
          <StatCard title="إجمالي الطلبات" value={stats.totalOrders.toString()} />
          <StatCard
            title="طلبات اليوم"
            value={stats.todayOrdersCount.toString()}
            valueClassName="text-indigo-700"
          />
          <StatCard
            title="إيراد اليوم"
            value={formatCurrency(stats.todayRevenue)}
            valueClassName="text-teal-700"
          />
          <StatCard
            title="جديد"
            value={stats.newCount.toString()}
            valueClassName="text-blue-700"
          />
          <StatCard
            title="قيد التنفيذ"
            value={stats.inProgressCount.toString()}
            valueClassName="text-amber-700"
          />
          <StatCard
            title="جاهز"
            value={stats.readyCount.toString()}
            valueClassName="text-emerald-700"
          />
          <StatCard title="مستلم" value={stats.deliveredCount.toString()} />
        </div>

        <div className="mb-5 page-card">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم العميل أو الجوال أو رقم الطلب أو رقم الفاتورة"
              className="field-input"
            />

            <div className="flex flex-wrap gap-2">
              {filters.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setFilter(item.key)}
                  className={filter === item.key ? 'primary-btn' : 'secondary-btn'}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="page-card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="section-title">قائمة الطلبات</h2>
              <span className="muted-text">{filteredOrders.length} طلب</span>
            </div>

            {loading ? (
              <div className="py-10 text-center text-sm text-slate-500">
                جاري تحميل الطلبات...
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                لا توجد طلبات مطابقة
              </div>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map((order) => (
                  <div
                    key={order.id}
                    className={`rounded-[24px] border p-4 transition ${
                      expandedOrderId === order.id
                        ? 'border-slate-300 bg-slate-50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-bold text-slate-900">
                            {order.order_number}
                          </span>
                          <span className={statusMap[order.status].className}>
                            {statusMap[order.status].label}
                          </span>
                        </div>

                        <p className="text-sm text-slate-700">
                          {order.customer_name} • {order.customer_phone}
                        </p>

                        <p className="text-xs text-slate-400">
                          {formatDateTime(order.created_at)}
                        </p>

                        <div className="flex flex-wrap gap-2 pt-1">
                          <span className="badge badge-slate">
                            {order.invoice_number}
                          </span>
                          <span className="badge badge-slate">
                            {order.payment_method}
                          </span>
                          <span className="badge badge-slate">
                            {formatCurrency(order.total)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() =>
                            setExpandedOrderId(
                              expandedOrderId === order.id ? null : order.id
                            )
                          }
                          className="secondary-btn"
                        >
                          {expandedOrderId === order.id
                            ? 'إخفاء التفاصيل'
                            : 'عرض التفاصيل'}
                        </button>

                        <button
                          onClick={() => printThermalReceipt(order)}
                          className="secondary-btn"
                        >
                          طباعة حرارية
                        </button>

                        <button
                          onClick={() => copyText(order.customer_phone, 'رقم الجوال')}
                          className="secondary-btn"
                        >
                          نسخ الجوال
                        </button>
                      </div>
                    </div>

                    {expandedOrderId === order.id && (
                      <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="inner-card">
                            <h3 className="mb-3 text-sm font-bold text-slate-900">
                              تفاصيل الطلب
                            </h3>

                            <div className="space-y-2 text-sm text-slate-700">
                              <Row label="رقم الفاتورة" value={order.invoice_number} />
                              <Row label="طريقة الدفع" value={order.payment_method} />
                              <Row label="حالة الدفع" value={order.payment_status} />
                              <Row label="الإجمالي" value={formatCurrency(order.total)} />
                              <Row
                                label="المبلغ المستلم"
                                value={formatCurrency(order.cash_received)}
                              />
                              <Row
                                label="المتبقي من العميل"
                                value={formatCurrency(order.remaining_from_customer)}
                              />
                              <Row
                                label="الباقي للعميل"
                                value={formatCurrency(order.cash_change)}
                              />
                            </div>
                          </div>

                          <div className="inner-card">
                            <h3 className="mb-3 text-sm font-bold text-slate-900">
                              تغيير الحالة
                            </h3>

                            {canManageOrders ? (
                              <div className="grid gap-2 sm:grid-cols-2">
                                <button
                                  onClick={() => updateStatus(order, 'new')}
                                  disabled={updatingId === order.id}
                                  className="secondary-btn"
                                >
                                  جديد
                                </button>

                                <button
                                  onClick={() => updateStatus(order, 'in_progress')}
                                  disabled={updatingId === order.id}
                                  className="secondary-btn"
                                >
                                  قيد التنفيذ
                                </button>

                                <button
                                  onClick={() => updateStatus(order, 'ready')}
                                  disabled={updatingId === order.id}
                                  className="secondary-btn"
                                >
                                  جاهز
                                </button>

                                <button
                                  onClick={() => updateStatus(order, 'delivered')}
                                  disabled={updatingId === order.id}
                                  className="secondary-btn"
                                >
                                  مستلم
                                </button>
                              </div>
                            ) : (
                              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                                لا تملك صلاحية تغيير حالة الطلب.
                              </div>
                            )}

                            {order.note !== '—' && (
                              <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                                <span className="font-bold text-slate-900">
                                  ملاحظة:
                                </span>{' '}
                                {order.note}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="inner-card">
                          <h3 className="mb-3 text-sm font-bold text-slate-900">
                            العناصر
                          </h3>

                          {order.items.length === 0 ? (
                            <div className="text-sm text-slate-500">لا توجد عناصر</div>
                          ) : (
                            <div className="space-y-2">
                              {order.items.map((item, index) => (
                                <div
                                  key={`${order.id}-${index}`}
                                  className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between"
                                >
                                  <div>
                                    <p className="text-sm font-bold text-slate-900">
                                      {item.item_name}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {item.item_type} • الكمية: {item.quantity}
                                    </p>
                                  </div>

                                  <div className="text-right">
                                    <p className="text-sm text-slate-700">
                                      الوحدة: {formatCurrency(item.unit_price)}
                                    </p>
                                    <p className="mt-1 text-sm font-bold text-slate-900">
                                      الإجمالي: {formatCurrency(item.line_total)}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="page-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="section-title">الطلب المحدد</h2>
                <span className="badge badge-slate">
                  {selectedOrder?.order_number || 'لا يوجد'}
                </span>
              </div>

              {!selectedOrder ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  اختر طلبًا من القائمة لعرض ملخصه بسرعة
                </div>
              ) : (
                <div className="space-y-3">
                  <SummaryRow label="اسم العميل" value={selectedOrder.customer_name} />
                  <SummaryRow label="الجوال" value={selectedOrder.customer_phone} />
                  <SummaryRow label="طريقة الدفع" value={selectedOrder.payment_method} />
                  <SummaryRow
                    label="الإجمالي"
                    value={formatCurrency(selectedOrder.total)}
                  />
                  <SummaryRow
                    label="المبلغ المستلم"
                    value={formatCurrency(selectedOrder.cash_received)}
                  />
                  <SummaryRow
                    label="المتبقي"
                    value={formatCurrency(selectedOrder.remaining_from_customer)}
                  />
                  <SummaryRow
                    label="الباقي"
                    value={formatCurrency(selectedOrder.cash_change)}
                  />
                </div>
              )}
            </div>

            <div className="page-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="section-title">ملخص التصفية الحالية</h2>
                <span className="badge badge-slate">
                  {filters.find((f) => f.key === filter)?.label}
                </span>
              </div>

              <div className="space-y-3">
                <SummaryRow label="إجمالي الطلبات" value={stats.totalOrders.toString()} />
                <SummaryRow label="جديد" value={stats.newCount.toString()} />
                <SummaryRow
                  label="قيد التنفيذ"
                  value={stats.inProgressCount.toString()}
                />
                <SummaryRow label="جاهز" value={stats.readyCount.toString()} />
                <SummaryRow label="مستلم" value={stats.deliveredCount.toString()} />
                <SummaryRow
                  label="إجمالي الإيراد"
                  value={formatCurrency(stats.revenue)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  title,
  value,
  valueClassName = 'text-slate-900',
}: {
  title: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="stat-card">
      <p className="stat-label">{title}</p>
      <p className={`stat-value ${valueClassName}`}>{value}</p>
    </div>
  )
}

function SummaryRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-bold text-slate-900">{value}</span>
    </div>
  )
}

function Row({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 py-2 last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  )
}

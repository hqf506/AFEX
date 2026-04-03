'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getRoleLabel } from '@/lib/app-roles'
import {
  buildReportDateRange,
  buildReportOrderSummary,
  escapeCsvValue,
  getReportTopServices,
  mapOrderSourceRowToReportOrderRecord,
  sanitizeExportValue,
  type ReportOrderRecord,
  type ReportRange,
} from '@/lib/orders/reports'
import { supabase } from '@/lib/supabase/client'
import { usePageAccess } from '@/hooks/use-page-access'
import { type OrderSourceRow } from '@/lib/orders/normalize'
import {
  formatCurrency,
  formatDateTime,
  formatPaymentMethod,
  getDateInputValue,
} from '@/lib/orders/format'

export default function ReportsPage() {
  const access = usePageAccess(['admin'])
  const authLoading = access.loading
  const allowed = access.allowed
  const roleLabel = getRoleLabel(access.userRole)

  const today = new Date()
  const todayString = getDateInputValue(today)

  const [orders, setOrders] = useState<ReportOrderRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [range, setRange] = useState<ReportRange>('daily')
  const [dateFrom, setDateFrom] = useState(todayString)
  const [dateTo, setDateTo] = useState(todayString)

  const fetchReportsData = useCallback(async (silent = false) => {
    if (!dateFrom) {
      setOrders([])
      setLoading(false)
      setRefreshing(false)
      return
    }

    if (range === 'custom' && dateTo && dateTo < dateFrom) {
      setErrorMessage('تاريخ "إلى" يجب أن يكون بعد أو مساويًا لتاريخ "من"')
      setOrders([])
      setLoading(false)
      setRefreshing(false)
      return
    }

    if (silent) setRefreshing(true)
    else setLoading(true)

    setErrorMessage('')

    const { fromIso, toIso } = buildReportDateRange(range, dateFrom, dateTo)

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
          subtotal,
          discount,
          tax,
          total,
          note,
          cash_received,
          remaining_from_customer,
          cash_change,
          invoice_items (
            item_name_snapshot,
            quantity,
            line_total
          )
        )
      `)
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(`فشل تحميل التقارير: ${error.message}`)
      setOrders([])
      setLoading(false)
      setRefreshing(false)
      return
    }

    const normalized = Array.isArray(data)
      ? data.map((row, index) => mapOrderSourceRowToReportOrderRecord(row as OrderSourceRow, index))
      : []

    setOrders(normalized)
    setLastUpdated(new Date().toLocaleTimeString('en-GB'))
    setLoading(false)
    setRefreshing(false)
  }, [range, dateFrom, dateTo])

  useEffect(() => {
    if (!allowed) return

    const timeoutId = window.setTimeout(() => {
      void fetchReportsData()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [allowed, fetchReportsData])

  const filteredOrders = orders

  const stats = useMemo(() => {
    return buildReportOrderSummary(orders)
  }, [orders])

  const topServices = useMemo(() => {
    return getReportTopServices(orders)
  }, [orders])

  const exportExcel = () => {
    const headers = [
      'رقم الطلب',
      'رقم الفاتورة',
      'اسم العميل',
      'الجوال',
      'الحالة',
      'طريقة الدفع',
      'حالة الدفع',
      'الإجمالي',
      'المجموع الفرعي',
      'الخصم',
      'الضريبة',
      'المبلغ المستلم',
      'المتبقي من العميل',
      'الباقي للعميل',
      'التاريخ',
      'الملاحظة',
    ]

    const rows = orders.map((order) => [
      order.order_number,
      order.invoice_number,
      order.customer_name,
      order.customer_phone,
      order.status,
      formatPaymentMethod(order.payment_method),
      order.payment_status,
      order.total,
      order.subtotal,
      order.discount,
      order.tax,
      order.cash_received,
      order.remaining_from_customer,
      order.cash_change,
      formatDateTime(order.created_at, 'en-GB'),
      order.note === '—' ? '' : order.note,
    ])

    const csvContent = [
      headers.map(escapeCsvValue).join(','),
      ...rows.map((row) => row.map(escapeCsvValue).join(',')),
    ].join('\n')

    const blob = new Blob(['\ufeff' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    })

    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `reports-${range}-${dateFrom}-to-${dateTo}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const exportPdf = () => {
    const printWindow = window.open('', '_blank', 'width=1200,height=900')
    if (!printWindow) return

    const rowsHtml =
      orders.length === 0
        ? `<tr><td colspan="7" style="text-align:center;padding:16px;">لا توجد بيانات</td></tr>`
        : orders
            .map(
              (order) => `
                <tr>
                  <td>${sanitizeExportValue(order.order_number)}</td>
                  <td>${sanitizeExportValue(order.invoice_number)}</td>
                  <td>${sanitizeExportValue(order.customer_name)}</td>
                  <td>${sanitizeExportValue(formatPaymentMethod(order.payment_method))}</td>
                  <td>${order.total.toFixed(2)} ر.س</td>
                  <td>${sanitizeExportValue(order.status)}</td>
                  <td>${sanitizeExportValue(formatDateTime(order.created_at, 'en-GB'))}</td>
                </tr>
              `
            )
            .join('')

    const topServicesHtml =
      topServices.length === 0
        ? '<p>لا توجد بيانات كافية</p>'
        : topServices
            .map(
              (item) => `
                <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;">
                  <span>${sanitizeExportValue(item.name)}</span>
                  <span>${item.qty} | ${item.total.toFixed(2)} ر.س</span>
                </div>
              `
            )
            .join('')

    printWindow.document.write(`
      <html lang="ar" dir="rtl">
        <head>
          <title>تقرير ${range}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 24px;
              color: #111827;
              direction: rtl;
            }
            .header {
              display:flex;
              justify-content:space-between;
              align-items:flex-start;
              margin-bottom:24px;
            }
            .title {
              font-size:28px;
              font-weight:700;
            }
            .muted {
              color:#6b7280;
              font-size:14px;
              margin-top:6px;
            }
            .box {
              border:1px solid #e5e7eb;
              border-radius:16px;
              padding:16px;
              margin-bottom:16px;
            }
            .stats {
              display:grid;
              grid-template-columns:repeat(3,1fr);
              gap:12px;
            }
            .stat {
              border:1px solid #e5e7eb;
              border-radius:14px;
              padding:12px;
            }
            .stat .label {
              font-size:13px;
              color:#64748b;
            }
            .stat .value {
              font-size:22px;
              font-weight:700;
              margin-top:8px;
            }
            table {
              width:100%;
              border-collapse:collapse;
              margin-top:12px;
            }
            th, td {
              border-bottom:1px solid #e5e7eb;
              padding:10px;
              text-align:right;
              font-size:13px;
            }
            th {
              background:#f8fafc;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">تقرير التقارير - Leather Fix ERP</div>
              <div class="muted">الفترة: ${dateFrom} إلى ${dateTo}</div>
              <div class="muted">نوع التقرير: ${range}</div>
            </div>
            <div class="muted">تاريخ الطباعة: ${new Date().toLocaleString('en-GB')}</div>
          </div>

          <div class="box">
            <div class="stats">
              <div class="stat">
                <div class="label">عدد الطلبات</div>
                <div class="value">${stats.totalOrders}</div>
              </div>
              <div class="stat">
                <div class="label">إجمالي المبيعات</div>
                <div class="value">${stats.totalSales.toFixed(2)} ر.س</div>
              </div>
              <div class="stat">
                <div class="label">إجمالي الكاش</div>
                <div class="value">${stats.cashTotal.toFixed(2)} ر.س</div>
              </div>
              <div class="stat">
                <div class="label">إجمالي الشبكة</div>
                <div class="value">${stats.cardTotal.toFixed(2)} ر.س</div>
              </div>
              <div class="stat">
                <div class="label">إجمالي التحويل</div>
                <div class="value">${stats.transferTotal.toFixed(2)} ر.س</div>
              </div>
              <div class="stat">
                <div class="label">المتبقي من العملاء</div>
                <div class="value">${stats.outstandingFromCustomers.toFixed(2)} ر.س</div>
              </div>
            </div>
          </div>

          <div class="box">
            <h3>آخر الطلبات</h3>
            <table>
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>رقم الفاتورة</th>
                  <th>العميل</th>
                  <th>الدفع</th>
                  <th>الإجمالي</th>
                  <th>الحالة</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>

          <div class="box">
            <h3>الخدمات الأكثر مبيعًا</h3>
            ${topServicesHtml}
          </div>

          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `)

    printWindow.document.close()
  }

  const rangeLabel =
    range === 'daily'
      ? 'تقرير يومي'
      : range === 'monthly'
      ? 'تقرير شهري'
      : range === 'yearly'
      ? 'تقرير سنوي'
      : 'تقرير بين تاريخين'

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

  if (loading) {
    return (
      <div className="app-shell">
        <div className="page-wrap">
          <div className="page-card">جاري تحميل التقارير...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="page-wrap">
        {errorMessage && <div className="error-alert">{errorMessage}</div>}

        <div className="page-hero">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="page-title">التقارير</h1>
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
              ) : null}

              <button
                onClick={() => setRange('daily')}
                className={range === 'daily' ? 'primary-btn' : 'secondary-btn'}
                type="button"
              >
                يومي
              </button>
              <button
                onClick={() => setRange('monthly')}
                className={range === 'monthly' ? 'primary-btn' : 'secondary-btn'}
                type="button"
              >
                شهري
              </button>
              <button
                onClick={() => setRange('yearly')}
                className={range === 'yearly' ? 'primary-btn' : 'secondary-btn'}
                type="button"
              >
                سنوي
              </button>
              <button
                onClick={() => setRange('custom')}
                className={range === 'custom' ? 'primary-btn' : 'secondary-btn'}
                type="button"
              >
                تاريخ محدد
              </button>
            </div>
          </div>
        </div>

        <div className="page-card mb-5">
          <div className="grid gap-5 xl:grid-cols-[260px_1fr_220px]">
            <div className="inner-card">
              <h2 className="section-title mb-4">الفترة الزمنية</h2>

              <div className="space-y-4">
                <div>
                  <label className="field-label">من تاريخ</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="field-input"
                  />
                </div>

                <div>
                  <label className="field-label">إلى تاريخ</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="field-input"
                    disabled={range !== 'custom'}
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                  في التقرير اليومي والشهري والسنوي يتم الاعتماد على
                  <span className="font-bold text-slate-800"> من تاريخ </span>
                  كأساس للتصفية.
                  <br />
                  أما
                  <span className="font-bold text-slate-800"> تاريخ محدد </span>
                  فيعتمد على المدى الكامل من
                  <span className="font-bold text-slate-800"> من تاريخ </span>
                  إلى
                  <span className="font-bold text-slate-800"> إلى تاريخ</span>.
                </div>
              </div>
            </div>

            <div className="inner-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="section-title">ملخص الفلتر الحالي</h2>
                <span className="badge badge-blue">{rangeLabel}</span>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <p className="text-sm font-bold text-slate-900">نوع التقرير</p>
                  <p className="mt-2 text-sm text-slate-500">{rangeLabel}</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <p className="text-sm font-bold text-slate-900">من تاريخ</p>
                    <p className="mt-2 text-sm text-slate-500">{dateFrom || '—'}</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <p className="text-sm font-bold text-slate-900">إلى تاريخ</p>
                    <p className="mt-2 text-sm text-slate-500">
                      {range === 'custom' ? dateTo || '—' : 'تلقائي حسب النوع'}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-500">
                  اليومي: يعتمد على نفس يوم من تاريخ.
                  <br />
                  الشهري: يعتمد على كامل شهر من تاريخ.
                  <br />
                  السنوي: يعتمد على كامل سنة من تاريخ.
                  <br />
                  تاريخ محدد: يعتمد على الفترة بين التاريخين.
                </div>
              </div>
            </div>

            <div className="inner-card">
              <h2 className="section-title mb-4">أدوات التقرير</h2>

              <div className="space-y-3">
                <button
                  onClick={() => fetchReportsData()}
                  className="secondary-btn w-full"
                  type="button"
                >
                  تحديث البيانات
                </button>

                <button
                  onClick={exportPdf}
                  className="secondary-btn w-full"
                  type="button"
                >
                  تحميل PDF
                </button>

                <button
                  onClick={exportExcel}
                  className="secondary-btn w-full"
                  type="button"
                >
                  تحميل Excel
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                تقدر تحمل نفس النتائج الظاهرة الآن مباشرة بصيغة PDF أو Excel.
              </div>
            </div>
          </div>
        </div>

        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard title="عدد الطلبات" value={stats.totalOrders.toString()} />
          <StatCard title="إجمالي المبيعات" value={formatCurrency(stats.totalSales)} />
          <StatCard title="إجمالي الكاش" value={formatCurrency(stats.cashTotal)} />
          <StatCard title="إجمالي الشبكة" value={formatCurrency(stats.cardTotal)} />
          <StatCard title="إجمالي التحويل" value={formatCurrency(stats.transferTotal)} />
        </div>

        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard title="المجموع الفرعي" value={formatCurrency(stats.totalSubtotal)} />
          <StatCard title="إجمالي الخصم" value={formatCurrency(stats.totalDiscount)} />
          <StatCard title="إجمالي الضريبة" value={formatCurrency(stats.totalTax)} />
          <StatCard title="المتبقي من العملاء" value={formatCurrency(stats.outstandingFromCustomers)} />
          <StatCard title="الباقي للعملاء" value={formatCurrency(stats.changeForCustomers)} />
        </div>

        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="جديد" value={stats.newCount.toString()} valueClassName="text-blue-700" />
          <StatCard title="قيد التنفيذ" value={stats.inProgressCount.toString()} valueClassName="text-amber-700" />
          <StatCard title="جاهز" value={stats.readyCount.toString()} valueClassName="text-emerald-700" />
          <StatCard title="مستلم" value={stats.deliveredCount.toString()} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="page-card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="section-title">آخر الطلبات في التقرير</h2>
              <span className="badge badge-slate">{filteredOrders.length} طلب</span>
            </div>

            {orders.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                لا توجد بيانات في هذه الفترة
              </div>
            ) : (
              <div className="table-list">
                {orders.slice(0, 12).map((order) => (
                  <div key={order.id} className="list-row">
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-900">
                        {order.order_number} • {order.invoice_number}
                      </p>
                      <p className="text-sm text-slate-600">
                        {order.customer_name} • {order.customer_phone}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatDateTime(order.created_at, 'en-GB')}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">
                        {formatCurrency(order.total)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatPaymentMethod(order.payment_method)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="page-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="section-title">الخدمات الأكثر مبيعًا</h2>
                <span className="badge badge-blue">{rangeLabel}</span>
              </div>

              {topServices.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  لا توجد بيانات كافية
                </div>
              ) : (
                <div className="space-y-3">
                  {topServices.map((item, index) => (
                    <div
                      key={`${item.name}-${index}`}
                      className="inner-card flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-bold text-slate-900">{item.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          الكمية: {item.qty}
                        </p>
                      </div>

                      <div className="text-left">
                        <p className="text-sm font-bold text-slate-900">
                          {formatCurrency(item.total)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="page-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="section-title">ملخص مالي</h2>
                <span className="badge badge-slate">مختصر</span>
              </div>

              <div className="space-y-3">
                <SummaryRow label="المبالغ المستلمة نقدًا" value={formatCurrency(stats.cashReceived)} />
                <SummaryRow label="المتبقي من العملاء" value={formatCurrency(stats.outstandingFromCustomers)} />
                <SummaryRow label="الباقي للعملاء" value={formatCurrency(stats.changeForCustomers)} />
                <SummaryRow label="إجمالي الطلبات" value={stats.totalOrders.toString()} />
                <SummaryRow label="إجمالي المبيعات" value={formatCurrency(stats.totalSales)} />
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


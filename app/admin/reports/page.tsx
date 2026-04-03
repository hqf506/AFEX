'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminButton } from '@/components/admin-button'
import { getRoleLabel } from '@/lib/app-roles'
import { AdminBranchFilter } from '@/components/admin-branch-filter'
import { AdminInput } from '@/components/admin-input'
import { PageHero } from '@/components/page-hero'
import { StatCard } from '@/components/stat-card'
import { SummaryRow } from '@/components/summary-row'
import { useAdminBranchFilter } from '@/hooks/use-admin-branch-filter'
import {
  isBranchScopedWithoutBranchId,
  shouldFilterByBranch,
} from '@/lib/branch-access'
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

function ReportsShellPlaceholder() {
  return (
    <div className="app-shell">
      <div className="page-wrap">
        <div className="page-hero min-h-[140px] animate-pulse bg-slate-100" />
        <div className="page-card mt-5 min-h-[260px] animate-pulse bg-slate-100" />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="stat-card min-h-[120px] animate-pulse bg-slate-100"
            />
          ))}
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="page-card min-h-[320px] animate-pulse bg-slate-100" />
          <div className="page-card min-h-[320px] animate-pulse bg-slate-100" />
        </div>
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const access = usePageAccess(['admin'])
  const authLoading = access.loading
  const allowed = access.allowed
  const roleLabel = getRoleLabel(access.userRole)
  const branchId = access.branchId
  const scopeType = access.scopeType
  const {
    isSystemAdmin,
    branches,
    loadingBranches,
    selectedBranchId,
    effectiveBranchId,
    setSelectedBranchId,
  } = useAdminBranchFilter(scopeType, branchId, allowed)

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

    if (isBranchScopedWithoutBranchId(scopeType, branchId)) {
      setOrders([])
      setLastUpdated(new Date().toLocaleTimeString('en-GB'))
      setLoading(false)
      setRefreshing(false)
      return
    }

    let query = supabase
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

    if (shouldFilterByBranch(scopeType, branchId)) {
      query = query.eq('branch_id', branchId as string)
    } else if (effectiveBranchId) {
      query = query.eq('branch_id', effectiveBranchId)
    }

    const { data, error } = await query

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
  }, [range, dateFrom, dateTo, scopeType, branchId, effectiveBranchId])

  useEffect(() => {
    if (!allowed) return

    const timeoutId = window.setTimeout(() => {
      void fetchReportsData()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [allowed, fetchReportsData])

  const filteredOrders = orders

  const visibleOrders = useMemo(() => orders.slice(0, 12), [orders])

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
        <div className="page-wrap" />
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
    return <ReportsShellPlaceholder />
  }

  return (
    <div className="app-shell">
      <div className="page-wrap">
        {errorMessage && <div className="error-alert">{errorMessage}</div>}

        <PageHero>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="page-title">التقارير</h1>
              <p className="page-subtitle">Leather Fix ERP</p>
              <p className="mt-2 text-sm text-slate-500">
                اختر الفترة المناسبة، ثم راجع الملخصات ونتائج التقرير وصدّرها عند الحاجة.
              </p>
              <p className="mt-2 text-xs text-slate-400">
                آخر تحديث: {lastUpdated || '—'}
                {refreshing ? ' • جاري التحديث...' : ''}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {isSystemAdmin ? (
                <AdminBranchFilter
                  branches={branches}
                  selectedBranchId={selectedBranchId}
                  loading={loadingBranches}
                  onChange={setSelectedBranchId}
                  className="min-w-[220px]"
                />
              ) : null}
              <Link href="/" className="secondary-btn">
                العودة إلى القائمة الرئيسية
              </Link>

              {roleLabel ? (
                <span className="badge badge-blue">الصلاحية: {roleLabel}</span>
              ) : null}
            </div>
          </div>
        </PageHero>

        <div className="page-card mb-5 space-y-5">
          <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <div>
                <h2 className="section-title">فلاتر التقرير</h2>
                <p className="mt-1 text-sm text-slate-500">
                  اختر نوع التقرير وحدد المدة الزمنية قبل تحديث النتائج.
                </p>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 flex flex-wrap gap-2">
                  <AdminButton
                    onClick={() => setRange('daily')}
                    variant={range === 'daily' ? 'primary' : 'secondary'}
                    type="button"
                  >
                    يومي
                  </AdminButton>
                  <AdminButton
                    onClick={() => setRange('monthly')}
                    variant={range === 'monthly' ? 'primary' : 'secondary'}
                    type="button"
                  >
                    شهري
                  </AdminButton>
                  <AdminButton
                    onClick={() => setRange('yearly')}
                    variant={range === 'yearly' ? 'primary' : 'secondary'}
                    type="button"
                  >
                    سنوي
                  </AdminButton>
                  <AdminButton
                    onClick={() => setRange('custom')}
                    variant={range === 'custom' ? 'primary' : 'secondary'}
                    type="button"
                  >
                    تاريخ محدد
                  </AdminButton>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="field-label">من تاريخ</label>
                    <AdminInput
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="field-label">إلى تاريخ</label>
                    <AdminInput
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      disabled={range !== 'custom'}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="inner-card">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="section-title">ملخص الفلتر الحالي</h2>
                  <span className="badge badge-blue">{rangeLabel}</span>
                </div>

                <div className="space-y-3">
                  <SummaryRow label="نوع التقرير" value={rangeLabel} />
                  <SummaryRow label="من تاريخ" value={dateFrom || '—'} />
                  <SummaryRow
                    label="إلى تاريخ"
                    value={range === 'custom' ? dateTo || '—' : 'تلقائي حسب النوع'}
                  />
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

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="section-title">أدوات التقرير</h2>
                <p className="mt-1 text-sm text-slate-500">
                  حدّث النتائج أولاً، ثم صدّر نفس البيانات الظاهرة الآن إذا احتجتها.
                </p>
              </div>
              <span className="badge badge-slate">{visibleOrders.length} نتيجة معروضة</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <AdminButton onClick={() => fetchReportsData()} type="button">
                تحديث البيانات
              </AdminButton>
              <AdminButton onClick={exportPdf} type="button">
                تحميل PDF
              </AdminButton>
              <AdminButton onClick={exportExcel} type="button">
                تحميل Excel
              </AdminButton>
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
                {visibleOrders.map((order) => (
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


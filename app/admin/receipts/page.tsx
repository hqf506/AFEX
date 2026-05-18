'use client'

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react'

import { AdminDarkDateInput } from '@/components/admin-dark-date-input'
import { AdminDarkSelect } from '@/components/admin-dark-select'
import { useAuthState } from '@/components/auth-state-provider'
import { useAdminBranchFilter } from '@/hooks/use-admin-branch-filter'
import { usePageAccess } from '@/hooks/use-page-access'
import { ADMIN_BRANCH_FILTER_ALL } from '@/lib/admin/branch-filter'
import { getDateInputValue } from '@/lib/orders/format'
import { type OrderSourceRow } from '@/lib/orders/normalize'
import {
  escapeCsvValue,
  mapOrderSourceRowToReportOrderRecord,
  type ReportOrderItemRecord,
} from '@/lib/reports/core'
import { renderThermalInvoiceHtml } from '@/lib/invoices/thermal-template'
import { supabase } from '@/lib/supabase/client'
import { applyTenantFilter } from '@/lib/tenant-filter'

const ALL_EMPLOYEES = 'all'
const PAGE_SIZE = 10

type PeriodOption = 'today' | 'week' | 'month' | 'custom'

type EmployeeProfile = {
  id: string
  full_name?: string | null
  username?: string | null
}

type BranchRecord = {
  id: string
  name: string
}

type ReceiptRecord = {
  id: string
  receiptNumber: string
  orderNumber: string
  status: string
  paymentStatus: string
  createdAt: string
  employeeId: string | null
  employeeName: string
  branchId: string | null
  branchName: string
  customerName: string
  customerPhone: string
  paymentType: string
  subtotal: number
  discount: number
  tax: number
  refunds: number
  netTotal: number
  total: number
  note: string
  items: ReportOrderItemRecord[]
}

type CancelReceiptResponse = {
  success?: boolean
  error?: string
  details?: string
  receipt?: {
    id: string
    status: string
    payment_status?: string | null
  }
}

type IconProps = {
  className?: string
}

function IconBase({ className = '', children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

function ReceiptIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </IconBase>
  )
}

function DownloadIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </IconBase>
  )
}

function EyeIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="3" />
    </IconBase>
  )
}

function PrintIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M7 8V3h10v5" />
      <path d="M7 17H5a2 2 0 0 1-2-2v-4a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4a2 2 0 0 1-2 2h-2" />
      <path d="M7 14h10v7H7z" />
      <path d="M17 11h.01" />
    </IconBase>
  )
}

function UndoIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-2" />
    </IconBase>
  )
}

function CloseIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </IconBase>
  )
}

function SearchIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </IconBase>
  )
}

function CalendarIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M4 10h16" />
    </IconBase>
  )
}

function ChevronLeftIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="m15 18-6-6 6-6" />
    </IconBase>
  )
}

function ChevronRightIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="m9 18 6-6-6-6" />
    </IconBase>
  )
}

const periodOptions: { value: PeriodOption; label: string }[] = [
  { value: 'today', label: 'اليوم' },
  { value: 'week', label: 'الأسبوع' },
  { value: 'month', label: 'الشهر' },
  { value: 'custom', label: 'مخصص' },
]

function formatSar(value: number) {
  return `${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} SAR`
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'غير محدد'

  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'غير محدد'

  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function startOfWeek(date: Date) {
  const next = new Date(date)
  next.setDate(next.getDate() - next.getDay())
  return next
}

function endOfWeek(date: Date) {
  const next = startOfWeek(date)
  next.setDate(next.getDate() + 6)
  return next
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function toRangeIso(date: Date, boundary: 'start' | 'end') {
  const value = getDateInputValue(date)
  return boundary === 'start'
    ? `${value}T00:00:00.000Z`
    : `${value}T23:59:59.999Z`
}

function buildDateRange(period: PeriodOption) {
  const today = new Date()

  if (period === 'week') {
    return {
      from: toRangeIso(startOfWeek(today), 'start'),
      to: toRangeIso(endOfWeek(today), 'end'),
    }
  }

  if (period === 'month') {
    return {
      from: toRangeIso(startOfMonth(today), 'start'),
      to: toRangeIso(endOfMonth(today), 'end'),
    }
  }

  return {
    from: toRangeIso(today, 'start'),
    to: toRangeIso(today, 'end'),
  }
}

function getStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getPaymentTypeLabel(value: ReceiptRecord['paymentType']) {
  if (value === 'cash') return 'بيع نقدي'
  if (value === 'card') return 'بيع شبكة'
  if (value === 'transfer') return 'تحويل'
  return 'بيع'
}

function isCancelledReceiptStatus(status: string | null | undefined) {
  return ['cancelled', 'canceled', 'void', 'refunded', 'ملغي'].includes(status || '')
}

function canShowCancelReceiptAction(status: string) {
  return !isCancelledReceiptStatus(status)
}

function buildReceiptRecords(
  rows: OrderSourceRow[],
  employees: EmployeeProfile[],
  branches: BranchRecord[],
) {
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]))
  const branchById = new Map(branches.map((branch) => [branch.id, branch]))

  return rows.map((row, index): ReceiptRecord => {
    const order = mapOrderSourceRowToReportOrderRecord(row, index)
    const employeeId = getStringValue(row.created_by_employee_id)
    const branchId = getStringValue(row.branch_id)
    const employee = employeeId ? employeeById.get(employeeId) : null
    const branch = branchId ? branchById.get(branchId) : null
    const employeeName = employee?.full_name?.trim() || employee?.username?.trim() || 'غير محدد'
    const receiptNumber = order.invoice_number && order.invoice_number !== '—' ? order.invoice_number : order.order_number
    const receiptStatus = isCancelledReceiptStatus(order.payment_status) ? 'cancelled' : order.status

    return {
      id: order.id,
      receiptNumber,
      orderNumber: order.order_number,
      status: receiptStatus,
      paymentStatus: order.payment_status,
      createdAt: order.created_at,
      employeeId,
      employeeName,
      branchId,
      branchName: branch?.name || 'غير محدد',
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      paymentType: order.payment_method,
      subtotal: order.subtotal,
      discount: order.discount,
      tax: order.tax,
      refunds: 0,
      netTotal: order.total,
      total: order.total,
      note: order.note,
      items: order.items,
    }
  })
}

function buildThermalReceiptHtml(receipt: ReceiptRecord) {
  return renderThermalInvoiceHtml({
    thermalBrandName: 'AFEX',
    thermalBranchName: receipt.branchName,
    thermalPaperWidth: '80mm',
    thermalShowCustomerPhone: Boolean(receipt.customerPhone && receipt.customerPhone !== '—'),
    thermalShowPaymentMethod: true,
    thermalShowNote: Boolean(receipt.note && receipt.note !== '—'),
    thermalNote: receipt.note && receipt.note !== '—' ? receipt.note : '',
    thermalFooterMessage: 'شكراً لزيارتكم',
    customerName: receipt.customerName,
    customerPhone: receipt.customerPhone,
    invoiceNumber: receipt.receiptNumber,
    orderNumber: receipt.orderNumber,
    issuedAt: receipt.createdAt,
    paymentMethod: receipt.paymentType,
    invoiceItems: receipt.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.unit_price,
    })),
    subtotal: receipt.subtotal || receipt.total,
    taxAmount: receipt.tax,
    finalTotal: receipt.total,
    total: receipt.total,
  })
}

function printThermalReceipt(receipt: ReceiptRecord) {
  const printWindow = window.open('', '_blank', 'width=420,height=900')

  if (!printWindow) {
    window.print()
    return
  }

  printWindow.document.write(buildThermalReceiptHtml(receipt))
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
}

export default function AdminReceiptsPage() {
  const authState = useAuthState()
  const access = usePageAccess(['admin'])
  const tenantId = authState.profile?.tenant_id ?? null
  const {
    branches: branchOptionsSource,
    selectedBranchId,
    effectiveBranchId,
    setSelectedBranchId,
  } = useAdminBranchFilter(
    access.scopeType,
    access.branchId,
    access.allowed,
    tenantId
  )

  const [period, setPeriod] = useState<PeriodOption>('today')
  const [dateRange, setDateRange] = useState(() => buildDateRange('today'))
  const [employeeId, setEmployeeId] = useState(ALL_EMPLOYEES)
  const [searchTerm, setSearchTerm] = useState('')
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    if (!selectedReceiptId) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSelectedReceiptId(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedReceiptId])

  useEffect(() => {
    let mounted = true

    async function fetchReceipts() {
      if (!access.allowed || access.loading) {
        return
      }

      if (!tenantId) {
        setReceipts([])
        setError('تعذر تحديد نطاق المنشأة.')
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')

      let query = supabase
        .from('orders')
        .select(
          `
          id,
          order_number,
          status,
          created_at,
          branch_id,
          created_by_employee_id,
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
            cash_received,
            remaining_from_customer,
            cash_change,
            note,
            invoice_items (
              item_name_snapshot,
              item_type_snapshot,
              item_category_snapshot,
              quantity,
              unit_price,
              line_total,
              cost_price
            )
          )
        `,
        )
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to)
        .order('created_at', { ascending: false })

      query = applyTenantFilter(query, tenantId)

      if (effectiveBranchId) {
        query = query.eq('branch_id', effectiveBranchId)
      }

      const { data, error: ordersError } = await query

      if (!mounted) return

      if (ordersError) {
        console.error('[admin-receipts] failed to fetch receipts', ordersError)
        setReceipts([])
        setError('تعذر تحميل الإيصالات.')
        setLoading(false)
        return
      }

      const sourceRows = (data ?? []) as OrderSourceRow[]
      const employeeIds = Array.from(
        new Set(sourceRows.map((row) => getStringValue(row.created_by_employee_id)).filter((id): id is string => Boolean(id))),
      )
      const branchIds = Array.from(
        new Set(sourceRows.map((row) => getStringValue(row.branch_id)).filter((id): id is string => Boolean(id))),
      )

      let employees: EmployeeProfile[] = []
      let branches: BranchRecord[] = []

      if (employeeIds.length > 0) {
        let employeesQuery = supabase
          .from('profiles')
          .select('id, full_name, username')
          .in('id', employeeIds)

        employeesQuery = applyTenantFilter(employeesQuery, tenantId)
        const { data: employeesData, error: employeesError } = await employeesQuery

        if (employeesError) {
          console.error('[admin-receipts] failed to fetch employees', employeesError)
        } else {
          employees = (employeesData ?? []) as EmployeeProfile[]
        }

        let posEmployeesQuery = supabase
          .from('pos_profiles')
          .select('id, full_name, username')
          .in('id', employeeIds)

        posEmployeesQuery = applyTenantFilter(posEmployeesQuery, tenantId)
        const { data: posEmployeesData, error: posEmployeesError } =
          await posEmployeesQuery

        if (posEmployeesError) {
          console.error(
            '[admin-receipts] failed to fetch POS employees',
            posEmployeesError
          )
        } else {
          employees = [
            ...employees,
            ...((posEmployeesData ?? []) as EmployeeProfile[]),
          ]
        }
      }

      if (branchIds.length > 0) {
        let branchesQuery = supabase
          .from('branches')
          .select('id, name')
          .in('id', branchIds)

        branchesQuery = applyTenantFilter(branchesQuery, tenantId)
        const { data: branchesData, error: branchesError } = await branchesQuery

        if (branchesError) {
          console.error('[admin-receipts] failed to fetch branches', branchesError)
        } else {
          branches = (branchesData ?? []) as BranchRecord[]
        }
      }

      if (!mounted) return

      setReceipts(buildReceiptRecords(sourceRows, employees, branches))
      setLoading(false)
    }

    void fetchReceipts()

    return () => {
      mounted = false
    }
  }, [access.allowed, access.loading, dateRange.from, dateRange.to, effectiveBranchId, tenantId])

  const employees = useMemo(() => {
    const map = new Map<string, string>()
    receipts.forEach((receipt) => {
      if (receipt.employeeId) {
        map.set(receipt.employeeId, receipt.employeeName)
      }
    })
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }))
  }, [receipts])

  const filteredReceipts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return receipts.filter((receipt) => {
      const matchesEmployee = employeeId === ALL_EMPLOYEES || receipt.employeeId === employeeId
      const matchesSearch =
        !normalizedSearch ||
        receipt.receiptNumber.toLowerCase().includes(normalizedSearch) ||
        receipt.customerName.toLowerCase().includes(normalizedSearch) ||
        receipt.customerPhone.toLowerCase().includes(normalizedSearch)

      return matchesEmployee && matchesSearch
    })
  }, [employeeId, receipts, searchTerm])

  const selectedReceipt = useMemo(
    () => receipts.find((receipt) => receipt.id === selectedReceiptId) ?? null,
    [receipts, selectedReceiptId],
  )

  const handleReceiptCanceled = (receiptId: string) => {
    setReceipts((currentReceipts) =>
      currentReceipts.map((receipt) =>
        receipt.id === receiptId ? { ...receipt, status: 'cancelled', paymentStatus: 'cancelled' } : receipt,
      ),
    )
  }

  const summary = useMemo(
    () =>
      filteredReceipts.reduce(
        (acc, receipt) => ({
          receipts: acc.receipts + 1,
          sales: acc.sales + receipt.netTotal,
          refunds: acc.refunds + receipt.refunds,
          cancelled: acc.cancelled + (isCancelledReceiptStatus(receipt.paymentStatus) ? 1 : 0),
        }),
        { receipts: 0, sales: 0, refunds: 0, cancelled: 0 },
      ),
    [filteredReceipts],
  )

  const totalPages = Math.max(1, Math.ceil(filteredReceipts.length / PAGE_SIZE))
  const pageReceipts = filteredReceipts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const branchOptions = useMemo(
    () => [
      { value: ADMIN_BRANCH_FILTER_ALL, label: 'جميع المتاجر' },
      ...branchOptionsSource.map((branch) => ({ value: branch.id, label: branch.name })),
    ],
    [branchOptionsSource],
  )

  const employeeOptions = useMemo(
    () => [{ value: ALL_EMPLOYEES, label: 'كل الموظفين' }, ...employees],
    [employees],
  )

  const handlePeriodChange = (nextPeriod: PeriodOption) => {
    setPeriod(nextPeriod)
    setCurrentPage(1)
    if (nextPeriod !== 'custom') {
      setDateRange(buildDateRange(nextPeriod))
    }
  }

  const handleBranchChange = (value: string) => {
    setSelectedBranchId(value)
    setCurrentPage(1)
  }

  const handleEmployeeChange = (value: string) => {
    setEmployeeId(value)
    setCurrentPage(1)
  }

  const handleDateFromChange = (value: string) => {
    setDateRange((current) => ({ ...current, from: `${value}T00:00:00.000Z` }))
    setCurrentPage(1)
  }

  const handleDateToChange = (value: string) => {
    setDateRange((current) => ({ ...current, to: `${value}T23:59:59.999Z` }))
    setCurrentPage(1)
  }

  const handleExport = (event: FormEvent) => {
    event.preventDefault()

    const headers = ['رقم الإيصال', 'التاريخ', 'الموظف', 'العميل', 'النوع', 'الإجمالي']
    const rows = filteredReceipts.map((receipt) => [
      receipt.receiptNumber,
      `${formatDate(receipt.createdAt)} ${formatTime(receipt.createdAt)}`,
      receipt.employeeName,
      receipt.customerName,
      getPaymentTypeLabel(receipt.paymentType),
      receipt.netTotal.toFixed(2),
    ])
    const csv = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `receipts-${getDateInputValue(new Date())}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (access.loading) {
    return (
      <main className="rounded-3xl border border-cyan-500/15 bg-[#07111d]/90 p-8 text-center text-slate-300">
        جارٍ تجهيز الإيصالات...
      </main>
    )
  }

  if (!access.allowed) {
    return (
      <main className="rounded-3xl border border-rose-500/20 bg-rose-500/10 p-8 text-center text-rose-100">
        هذه الصفحة متاحة لمدير النظام فقط.
      </main>
    )
  }

  return (
    <main dir="rtl" className="relative min-h-screen overflow-x-hidden text-white">
      <section className="space-y-5">
        <header className="rounded-3xl border border-cyan-500/15 bg-[#07111d]/90 p-6 shadow-[0_0_45px_rgba(34,211,238,0.08)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-500/10 text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.18)]">
                <ReceiptIcon className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs font-bold text-cyan-200/80">التقارير / الإيصالات</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-white">الإيصالات</h1>
                <p className="mt-2 text-sm text-slate-400">عرض الإيصالات وتفاصيل البيع من نفس الجدول</p>
              </div>
            </div>

            <form onSubmit={handleExport}>
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-cyan-400/25 bg-white/[0.03] px-5 text-sm font-black text-cyan-100 transition hover:border-cyan-300/70 hover:bg-cyan-500/10"
              >
                <DownloadIcon className="h-4 w-4" />
                تصدير
              </button>
            </form>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="كافة الإيصالات" value={summary.receipts.toLocaleString('ar-SA')} icon={<ReceiptIcon className="h-6 w-6" />} />
          <SummaryCard title="الإيصالات الملغية" value={summary.cancelled.toLocaleString('ar-SA')} icon={<UndoIcon className="h-6 w-6" />} accent="rose" />
          <SummaryCard title="المبيعات" value={formatSar(summary.sales)} icon={<CalendarIcon className="h-6 w-6" />} />
          <SummaryCard title="المبالغ المستردة" value={formatSar(summary.refunds)} icon={<ReceiptIcon className="h-6 w-6" />} accent="rose" />
        </section>

        <section className="rounded-3xl border border-cyan-500/15 bg-[#07111d]/90 p-4 shadow-[0_0_35px_rgba(34,211,238,0.06)] backdrop-blur-xl">
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_1.3fr] xl:items-end">
            <div>
              <span className="mb-2 block text-xs font-bold text-slate-400">الفترة الزمنية</span>
              <div className="flex rounded-2xl border border-cyan-500/15 bg-white/[0.03] p-1">
                {periodOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handlePeriodChange(option.value)}
                    className={`h-10 flex-1 rounded-xl text-sm font-bold transition ${
                      period === option.value
                        ? 'bg-gradient-to-l from-cyan-300 to-teal-300 text-slate-950 shadow-[0_0_18px_rgba(34,211,238,0.22)]'
                        : 'text-slate-300 hover:bg-cyan-500/10 hover:text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-400">الفرع / المتجر</span>
              <AdminDarkSelect value={selectedBranchId} onChange={handleBranchChange} options={branchOptions} />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-400">الموظف</span>
              <AdminDarkSelect value={employeeId} onChange={handleEmployeeChange} options={employeeOptions} />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-400">بحث</span>
              <div className="flex h-12 items-center gap-3 rounded-2xl border border-cyan-300/15 bg-[#06111f] px-4 text-white transition focus-within:border-cyan-300/50 focus-within:ring-2 focus-within:ring-cyan-300/15">
                <SearchIcon className="h-4 w-4 text-cyan-300" />
                <input
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value)
                    setCurrentPage(1)
                  }}
                  placeholder="بحث برقم الإيصال أو العميل..."
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none placeholder:text-slate-500"
                />
              </div>
            </label>
          </div>

          {period === 'custom' ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-bold text-slate-400">من تاريخ</span>
                <AdminDarkDateInput value={dateRange.from.slice(0, 10)} onChange={handleDateFromChange} />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-bold text-slate-400">إلى تاريخ</span>
                <AdminDarkDateInput value={dateRange.to.slice(0, 10)} onChange={handleDateToChange} />
              </label>
            </div>
          ) : null}
        </section>

        {error ? (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">
            {error}
          </div>
        ) : null}

        <section className="rounded-3xl border border-cyan-500/15 bg-[#07111d]/90 shadow-[0_0_40px_rgba(0,255,255,0.06)] backdrop-blur-xl">
          <div className="flex items-end justify-between border-b border-cyan-500/10 p-5">
            <div className="text-right">
              <h2 className="text-2xl font-black text-white">جدول الإيصالات</h2>
              <p className="mt-1 text-sm text-slate-400">اضغط على أي إيصال لعرض التفاصيل في الدرج الجانبي</p>
            </div>
            <p className="text-left text-sm font-bold text-slate-400">
              عرض {pageReceipts.length.toLocaleString('ar-SA')} من {filteredReceipts.length.toLocaleString('ar-SA')} إيصال
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-right">
              <thead className="bg-[#081320]">
                <tr className="border-b border-cyan-500/10 text-xs font-bold text-slate-300">
                  <th className="w-[150px] px-5 py-4">رقم الإيصال</th>
                  <th className="w-[180px] px-5 py-4">التاريخ</th>
                  <th className="w-[150px] px-5 py-4">الموظف</th>
                  <th className="w-[230px] px-5 py-4">العميل</th>
                  <th className="w-[130px] px-5 py-4">النوع</th>
                  <th className="w-[140px] px-5 py-4">الإجمالي</th>
                  <th className="w-[120px] px-5 py-4">الحالة</th>
                  <th className="w-[110px] px-5 py-4">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 7 }).map((_, index) => (
                    <tr key={index} className="border-b border-cyan-500/10">
                      <td colSpan={8} className="px-5 py-4">
                        <div className="h-12 animate-pulse rounded-2xl bg-white/[0.04]" />
                      </td>
                    </tr>
                  ))
                ) : pageReceipts.length > 0 ? (
                  pageReceipts.map((receipt) => {
                    const isCancelledReceipt = isCancelledReceiptStatus(receipt.paymentStatus)

                    return (
                      <tr
                        key={receipt.id}
                        onClick={() => setSelectedReceiptId(receipt.id)}
                        className={`cursor-pointer border-b transition ${
                          isCancelledReceipt
                            ? 'border-red-500/25 bg-red-500/[0.07] hover:bg-red-500/10'
                            : 'border-cyan-500/10 hover:bg-cyan-500/5'
                        } ${
                          selectedReceiptId === receipt.id
                            ? isCancelledReceipt
                              ? 'outline outline-1 outline-red-400/70'
                              : 'bg-cyan-500/10 outline outline-1 outline-cyan-400/60'
                            : ''
                        }`}
                      >
                        <td className="px-5 py-4 text-sm font-black text-white">{receipt.receiptNumber}</td>
                        <td className="px-5 py-4 text-sm text-slate-300">
                          <div>{formatDate(receipt.createdAt)}</div>
                          <div className="text-xs text-slate-500">{formatTime(receipt.createdAt)}</div>
                        </td>
                        <td className="px-5 py-4 text-sm font-bold text-slate-100">{receipt.employeeName}</td>
                        <td className="px-5 py-4">
                          <div className="text-sm font-bold text-white">{receipt.customerName}</div>
                          <div className="text-xs text-slate-500">{receipt.customerPhone}</div>
                        </td>
                        <td className="px-5 py-4 text-sm font-bold text-slate-200">{getPaymentTypeLabel(receipt.paymentType)}</td>
                        <td className="px-5 py-4 text-sm font-black text-cyan-200">{formatSar(receipt.netTotal)}</td>
                        <td className="px-5 py-4">
                          {isCancelledReceipt ? (
                            <span className="inline-flex rounded-full border border-red-500/35 bg-red-500/10 px-3 py-1 text-xs font-black text-red-200">
                              ملغي
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-200">
                              مكتمل
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setSelectedReceiptId(receipt.id)
                            }}
                            className="inline-flex h-9 items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 text-xs font-black text-cyan-100 transition hover:border-cyan-300/70 hover:bg-cyan-500/15"
                          >
                            <EyeIcon className="h-4 w-4" />
                            عرض
                          </button>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center">
                      <div className="mx-auto max-w-md rounded-3xl border border-cyan-500/15 bg-white/[0.03] p-8">
                        <ReceiptIcon className="mx-auto h-10 w-10 text-cyan-300/70" />
                        <h3 className="mt-4 text-lg font-black text-white">لا توجد إيصالات</h3>
                        <p className="mt-2 text-sm text-slate-400">جرّب تغيير الفلاتر أو الفترة الزمنية.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-cyan-500/10 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-400">الصفحة {currentPage} من {totalPages}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/15 bg-white/[0.03] text-slate-200 transition hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
              <span className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-4 py-2 text-sm font-black text-cyan-100">
                {currentPage}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/15 bg-white/[0.03] text-slate-200 transition hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </section>

      <ReceiptDrawer
        receipt={selectedReceipt}
        onClose={() => setSelectedReceiptId(null)}
        onCanceled={handleReceiptCanceled}
      />
    </main>
  )
}

function SummaryCard({
  title,
  value,
  icon,
  accent = 'cyan',
}: {
  title: string
  value: string
  icon: ReactNode
  accent?: 'cyan' | 'rose'
}) {
  const accentClass =
    accent === 'rose'
      ? 'border-rose-400/20 bg-rose-500/10 text-rose-200'
      : 'border-cyan-400/20 bg-cyan-500/10 text-cyan-200'

  return (
    <div className="rounded-3xl border border-cyan-500/15 bg-[#07111d]/90 p-5 shadow-[0_0_28px_rgba(34,211,238,0.05)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-400">{title}</p>
          <p className="mt-2 text-3xl font-black text-white">{value}</p>
        </div>
        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${accentClass}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

function ReceiptDrawer({
  receipt,
  onClose,
  onCanceled,
}: {
  receipt: ReceiptRecord | null
  onClose: () => void
  onCanceled: (receiptId: string) => void
}) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelFeedback, setCancelFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [canceling, setCanceling] = useState(false)
  const thermalReceiptHtml = receipt ? buildThermalReceiptHtml(receipt) : ''
  const receiptCancelled = receipt ? isCancelledReceiptStatus(receipt.paymentStatus) : false
  const cancelActionVisible = receipt ? canShowCancelReceiptAction(receipt.paymentStatus) : false

  const handleConfirmCancelReceipt = async () => {
    if (!receipt) return

    setCanceling(true)
    setCancelFeedback(null)

    try {
      const response = await fetch(`/api/admin/receipts/${encodeURIComponent(receipt.id)}/cancel`, {
        method: 'POST',
      })
      const result = (await response.json().catch(() => ({}))) as CancelReceiptResponse

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.details || 'تعذر إلغاء الإيصال')
      }

      onCanceled(receipt.id)
      setShowCancelConfirm(false)
      setCancelFeedback({ type: 'success', message: 'تم إلغاء الإيصال بنجاح' })
    } catch (error) {
      setCancelFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'تعذر إلغاء الإيصال',
      })
    } finally {
      setCanceling(false)
    }
  }

  const handleCloseDrawer = () => {
    setShowCancelConfirm(false)
    setCancelFeedback(null)
    onClose()
  }

  return (
    <>
      <div
        aria-hidden="true"
        onClick={handleCloseDrawer}
        className={`fixed inset-0 z-[80] bg-black/45 backdrop-blur-[2px] transition-opacity duration-200 ${
          receipt ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        dir="rtl"
        className={`fixed left-0 top-0 z-[90] h-screen w-[min(380px,calc(100vw-24px))] border-r border-cyan-400/25 bg-[#06111f]/95 shadow-[0_0_70px_rgba(34,211,238,0.18)] backdrop-blur-2xl transition-transform duration-300 ${
          receipt ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {receipt ? (
          <div className="flex h-full flex-col">
            <header className="flex items-center justify-between gap-3 border-b border-white/10 p-5">
              <button
                type="button"
                onClick={handleCloseDrawer}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-200 transition hover:border-cyan-300/40 hover:text-white"
                aria-label="إغلاق التفاصيل"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
              {cancelActionVisible ? (
                <button
                  type="button"
                  onClick={() => {
                    setCancelFeedback(null)
                    setShowCancelConfirm(true)
                  }}
                  className="inline-flex h-10 shrink-0 appearance-none items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 text-xs font-black text-red-300 shadow-none transition hover:bg-red-500/20 hover:shadow-[0_0_24px_rgba(248,113,113,0.18)]"
                >
                  <UndoIcon className="h-4 w-4 text-red-300" />
                  إلغاء الإيصال
                </button>
              ) : null}
              <div className="text-left">
                <p className="text-xs text-slate-500">رقم الإيصال</p>
                <p className="text-lg font-black text-white">{receipt.receiptNumber}</p>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="mb-4 text-center">
                <p className="text-2xl font-black text-white">{formatSar(receipt.total)}</p>
                <p className="mt-1 text-xs font-bold text-slate-400">الإجمالي</p>
              </div>

              <section className="rounded-3xl border border-cyan-500/15 bg-[#020817]/80 p-4 shadow-[0_0_35px_rgba(34,211,238,0.08)]">
                {receiptCancelled ? (
                  <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-center text-sm font-black text-red-200 shadow-[0_0_24px_rgba(248,113,113,0.16)]">
                    ملغي
                  </div>
                ) : null}
                <div className="mx-auto w-fit rounded-md bg-white shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
                  <iframe
                    title={`إيصال ${receipt.receiptNumber}`}
                    srcDoc={thermalReceiptHtml}
                    className="block h-[760px] w-[302px] rounded-sm bg-white"
                    sandbox=""
                  />
                </div>
              </section>
            </div>

            <footer className="grid grid-cols-1 gap-3 border-t border-white/10 p-5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => printThermalReceipt(receipt)}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-white/[0.04] text-sm font-black text-slate-100 transition hover:border-cyan-300/50 hover:bg-cyan-500/10"
              >
                <PrintIcon className="h-4 w-4" />
                طباعة
              </button>
              <button
                type="button"
                onClick={handleCloseDrawer}
                className="h-12 rounded-2xl border border-cyan-300/35 bg-cyan-500/10 text-sm font-black text-cyan-100 transition hover:bg-cyan-500/15"
              >
                إغلاق
              </button>
            </footer>
          </div>
        ) : null}
      </aside>

      {receipt && cancelFeedback ? (
        <div
          className={`fixed left-5 top-5 z-[130] w-[min(340px,calc(100vw-40px))] rounded-2xl border bg-[#07111d]/95 p-4 text-right backdrop-blur-2xl ${
            cancelFeedback.type === 'success'
              ? 'border-emerald-500/30 shadow-[0_0_45px_rgba(16,185,129,0.16)]'
              : 'border-red-500/30 shadow-[0_0_45px_rgba(248,113,113,0.16)]'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={() => setCancelFeedback(null)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-cyan-300/40 hover:text-white"
              aria-label="إغلاق الرسالة"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
            <div>
              <p className={`text-sm font-black ${cancelFeedback.type === 'success' ? 'text-emerald-200' : 'text-red-200'}`}>
                {cancelFeedback.message}
              </p>
              <p className="mt-1 text-xs font-semibold leading-6 text-slate-400">
                {cancelFeedback.type === 'success'
                  ? 'تم تحديث حالة الإيصال في القائمة والدرج.'
                  : 'لم يتم تنفيذ أي تعديل مالي أو حذف بيانات.'}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {receipt && showCancelConfirm ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <div
            dir="rtl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-receipt-title"
            className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#07111d]/95 p-6 text-right shadow-[0_0_55px_rgba(248,113,113,0.14)] backdrop-blur-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 id="cancel-receipt-title" className="text-xl font-black text-white">
                  تأكيد إلغاء الإيصال
                </h3>
                <p className="mt-2 text-sm font-semibold leading-7 text-slate-300">
                  هل أنت متأكد من إلغاء هذا الإيصال؟
                </p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-300">
                <UndoIcon className="h-5 w-5" />
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-500/15 bg-white/[0.035] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-black text-white">{receipt.receiptNumber}</span>
                <span className="text-xs font-bold text-slate-400">رقم الإيصال</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleConfirmCancelReceipt}
                disabled={canceling}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-red-500/40 bg-red-500/10 text-sm font-black text-red-200 transition hover:bg-red-500/20 hover:shadow-[0_0_24px_rgba(248,113,113,0.18)] disabled:cursor-wait disabled:opacity-60"
              >
                <UndoIcon className="h-4 w-4" />
                {canceling ? 'جارٍ الإلغاء...' : 'تأكيد الإلغاء'}
              </button>
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="h-12 rounded-2xl border border-cyan-300/20 bg-white/[0.04] text-sm font-black text-slate-100 transition hover:border-cyan-300/50 hover:bg-cyan-500/10"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

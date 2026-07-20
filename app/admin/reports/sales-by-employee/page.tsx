'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react'

import { AdminDarkDateInput } from '@/components/admin-dark-date-input'
import { AdminDarkSelect } from '@/components/admin-dark-select'
import { useAuthState } from '@/components/auth-state-provider'
import { usePageAccess } from '@/hooks/use-page-access'
import { useAdminBranchFilter } from '@/hooks/use-admin-branch-filter'
import { ADMIN_BRANCH_FILTER_ALL } from '@/lib/admin/branch-filter'
import { getDateInputValue } from '@/lib/orders/format'
import { canViewReportRange } from '@/lib/permissions'
import { escapeCsvValue } from '@/lib/reports/core'
import { type SalesByEmployeeRow } from '@/lib/reports/sales-by-employee'

const ALL_BRANCHES = ADMIN_BRANCH_FILTER_ALL
const ALL_EMPLOYEES = '__all__'
const PAGE_SIZE = 10

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

function DownloadIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </IconBase>
  )
}

function ChartIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 16V9" />
      <path d="M12 16V7" />
      <path d="M16 16v-5" />
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

function RefreshIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M20 12a8 8 0 0 1-13.66 5.66" />
      <path d="M4 12A8 8 0 0 1 17.66 6.34" />
      <path d="M17 2v5h5" />
      <path d="M7 22v-5H2" />
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

function UserIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </IconBase>
  )
}

function UsersIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M16 21a6 6 0 0 0-12 0" />
      <circle cx="10" cy="8" r="4" />
      <path d="M22 21a5 5 0 0 0-4-4.9" />
      <path d="M17 4.2a4 4 0 0 1 0 7.6" />
    </IconBase>
  )
}

function WalletIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M4 7a3 3 0 0 1 3-3h11v4H7a3 3 0 0 0 0 6h12v6H7a3 3 0 0 1-3-3Z" />
      <path d="M16 14h4" />
    </IconBase>
  )
}

type PeriodOption = 'today' | 'week' | 'month' | 'custom'

const periodOptions: { value: PeriodOption; label: string }[] = [
  { value: 'today', label: 'اليوم' },
  { value: 'week', label: 'الأسبوع' },
  { value: 'month', label: 'الشهر' },
  { value: 'custom', label: 'مخصص' },
]

function formatSarCurrency(value: number): string {
  return `${value.toLocaleString('ar-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ريال`
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('ar-SA', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function startOfWeek(date: Date) {
  const next = new Date(date)
  const day = next.getDay()
  next.setDate(next.getDate() - day)
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

function buildPresetDateRange(period: PeriodOption) {
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

function getRoleLabel(role: string | null): string {
  switch (role) {
    case 'admin':
      return 'مدير النظام'
    case 'manager':
      return 'مدير'
    case 'employee':
      return 'موظف'
    case 'cashier':
      return 'أمين الصندوق'
    default:
      return 'لم يُحدد'
  }
}

function getRoleBadgeClassName(role: string | null): string {
  if (role === 'admin') {
    return 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'
  }

  if (role === 'employee') {
    return 'border-cyan-300/25 bg-cyan-400/10 text-cyan-100'
  }

  if (role === 'cashier') {
    return 'border-amber-300/25 bg-amber-400/10 text-amber-100'
  }

  return 'border-slate-400/20 bg-slate-400/10 text-slate-300'
}

function getPerformanceLabel(row: SalesByEmployeeRow): string {
  if (row.netSales >= 10000 || row.receiptsCount >= 25) {
    return 'مميز'
  }

  if (row.netSales >= 3000 || row.receiptsCount >= 8) {
    return 'نشط'
  }

  return 'متوسط'
}

export default function SalesByEmployeeReportPage() {
  const { profile } = useAuthState()
  const access = usePageAccess(['admin', 'employee'])
  const tenantId = profile?.tenant_id ?? null
  const {
    branches,
    selectedBranchId,
    effectiveBranchId,
    setSelectedBranchId,
  } = useAdminBranchFilter(
    access.scopeType,
    access.branchId,
    access.allowed,
    tenantId
  )

  const [serverEmployeeRows, setServerEmployeeRows] = useState<SalesByEmployeeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<PeriodOption>('today')
  const [employeeId, setEmployeeId] = useState(ALL_EMPLOYEES)
  const [dateRange, setDateRange] = useState(() => buildPresetDateRange('today'))
  const [currentPage, setCurrentPage] = useState(1)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)

  useEffect(() => {
    let mounted = true

    async function fetchReportData() {
      if (!tenantId) {
        setServerEmployeeRows([])
        setLoading(false)
        setError('تعذر تحديد نطاق المنشأة لهذا التقرير.')
        return
      }

      setLoading(true)
      setError(null)

      if (!canViewReportRange(access.userRole, dateRange.from, dateRange.to)) {
        setServerEmployeeRows([])
        setLoading(false)
        setError('يمكن للموظف عرض فترة لا تتجاوز 31 يومًا.')
        return
      }

      const params = new URLSearchParams({
        type: 'employee',
        range: 'custom',
        dateFrom: dateRange.from.slice(0, 10),
        dateTo: dateRange.to.slice(0, 10),
      })

      if (effectiveBranchId) {
        params.set('branchId', effectiveBranchId)
      }

      const response = await fetch(
        `/api/admin/reports/sales-performance?${params.toString()}`,
        { cache: 'no-store' }
      )
      const result = (await response.json().catch(() => ({}))) as {
        success?: boolean
        message?: string
        error?: string
        employeeRows?: SalesByEmployeeRow[]
      }

      if (!mounted) {
        return
      }

      if (!response.ok || result.success === false) {
        setServerEmployeeRows([])
        setError(
          result.message ||
            result.error ||
            'تعذر تحميل تقرير المبيعات حسب الموظف.'
        )
        setLoading(false)
        return
      }

      setServerEmployeeRows(Array.isArray(result.employeeRows) ? result.employeeRows : [])
      setLastUpdatedAt(new Date())
      setLoading(false)
    }

    if (!access.loading && access.allowed) {
      void fetchReportData()
    }

    return () => {
      mounted = false
    }
  }, [
    access.allowed,
    access.loading,
    access.userRole,
    dateRange.from,
    dateRange.to,
    effectiveBranchId,
    tenantId,
  ])
  const employeeRows = serverEmployeeRows

  const filteredRows = useMemo(() => {
    if (employeeId === ALL_EMPLOYEES) {
      return employeeRows
    }

    return employeeRows.filter((row) => row.employeeKey === employeeId)
  }, [employeeId, employeeRows])

  const summary = useMemo(
    () =>
      filteredRows.reduce(
        (acc, row) => ({
          employees: acc.employees + 1,
          grossSales: acc.grossSales + row.grossSales,
          refunds: acc.refunds + row.refunds,
          discounts: acc.discounts + row.discounts,
          netSales: acc.netSales + row.netSales,
          receipts: acc.receipts + row.receiptsCount,
          customers: acc.customers + row.registeredCustomersCount,
        }),
        {
          employees: 0,
          grossSales: 0,
          refunds: 0,
          discounts: 0,
          netSales: 0,
          receipts: 0,
          customers: 0,
        },
      ),
    [filteredRows],
  )

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const employeeOptions = useMemo(
    () => [
      { value: ALL_EMPLOYEES, label: 'جميع الموظفين' },
      ...employeeRows.map((row) => ({
        value: row.employeeKey,
        label: row.employeeName,
      })),
    ],
    [employeeRows],
  )

  const branchOptions = useMemo(
    () => [
      { value: ALL_BRANCHES, label: 'جميع الفروع' },
      ...branches.map((branch) => ({
        value: branch.id,
        label: branch.name,
      })),
    ],
    [branches],
  )

  const handleRefresh = () => {
    setDateRange((current) => ({ ...current }))
  }

  const handlePeriodChange = (nextPeriod: PeriodOption) => {
    setPeriod(nextPeriod)
    setCurrentPage(1)

    if (nextPeriod !== 'custom') {
      setDateRange(buildPresetDateRange(nextPeriod))
    }
  }

  const handleBranchChange = (nextBranchId: string) => {
    setSelectedBranchId(nextBranchId)
    setCurrentPage(1)
  }

  const handleEmployeeChange = (nextEmployeeId: string) => {
    setEmployeeId(nextEmployeeId)
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

    const headers = [
      'الاسم',
      'إجمالي المبيعات',
      'المبالغ المستردة',
      'الخصومات',
      'صافي المبيعات',
      'الإيصالات',
      'متوسط البيع',
      'العملاء المسجلين',
    ]
    const rows = filteredRows.map((row) => [
      row.employeeName,
      row.grossSales.toFixed(2),
      row.refunds.toFixed(2),
      row.discounts.toFixed(2),
      row.netSales.toFixed(2),
      String(row.receiptsCount),
      row.averageSale.toFixed(2),
      String(row.registeredCustomersCount),
    ])
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvValue).join(','))
      .join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sales-by-employee-${getDateInputValue(new Date())}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (access.loading) {
    return (
      <main className="min-h-screen bg-[#020817] p-6 text-white">
        <div className="rounded-3xl border border-cyan-500/15 bg-[#07111d]/90 p-8 text-center text-slate-300">
          جارٍ تجهيز التقرير...
        </div>
      </main>
    )
  }

  if (!access.allowed) {
    return (
      <main className="min-h-screen bg-[#020817] p-6 text-white">
        <div className="rounded-3xl border border-rose-500/20 bg-rose-500/10 p-8 text-center text-rose-100">
          هذه الصفحة متاحة لمدير النظام فقط.
        </div>
      </main>
    )
  }

  return (
    <main dir="rtl" className="min-h-screen overflow-x-hidden bg-[#020817] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.16),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(20,184,166,0.12),transparent_24%)]" />

      <section className="space-y-5 p-4 sm:p-6">
        <header className="rounded-3xl border border-cyan-500/15 bg-[#07111d]/90 p-6 shadow-[0_0_45px_rgba(34,211,238,0.08)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-500/10 text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.18)]">
                <UsersIcon className="h-7 w-7" />
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs text-cyan-200/80">
                  <Link href="/admin/reports" className="hover:text-cyan-200">
                    التقارير
                  </Link>
                  <span>/</span>
                  <span>المبيعات حسب الموظف</span>
                </div>
                <h1 className="text-3xl font-black tracking-tight text-white">المبيعات حسب الموظف</h1>
                <p className="mt-2 text-sm text-slate-400">عرض أداء الموظفين في المبيعات خلال الفترة الحالية</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-bold text-cyan-200">
                آخر تحديث: {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : 'غير محدد'}
              </span>
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-cyan-500/20 bg-white/[0.03] px-4 text-sm font-bold text-slate-100 transition hover:border-cyan-400/60 hover:bg-cyan-500/10"
              >
                <RefreshIcon className="h-4 w-4 text-cyan-300" />
                تحديث
              </button>
            </div>
          </div>
        </header>

        <form
          onSubmit={handleExport}
          className="rounded-3xl border border-cyan-500/15 bg-[#07111d]/90 p-5 shadow-[0_0_35px_rgba(34,211,238,0.06)] backdrop-blur-xl"
        >
          <div data-responsive-filters className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_auto] xl:items-end">
            <div>
              <label className="mb-2 block text-xs font-bold text-slate-400">الفترة الزمنية</label>
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

            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-cyan-400/25 bg-white/[0.03] px-5 text-sm font-black text-cyan-100 transition hover:border-cyan-300/70 hover:bg-cyan-500/10 hover:shadow-[0_0_20px_rgba(34,211,238,0.14)]"
            >
              <DownloadIcon className="h-4 w-4" />
              تصدير
            </button>
          </div>

          {period === 'custom' ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-bold text-slate-400">من تاريخ</span>
                <AdminDarkDateInput
                  value={dateRange.from.slice(0, 10)}
                  onChange={handleDateFromChange}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-bold text-slate-400">إلى تاريخ</span>
                <AdminDarkDateInput
                  value={dateRange.to.slice(0, 10)}
                  onChange={handleDateToChange}
                />
              </label>
            </div>
          ) : null}
        </form>

        {error ? (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'الموظفون', value: summary.employees.toLocaleString('ar-SA'), hint: 'داخل النتائج', icon: UserIcon },
            { label: 'صافي المبيعات', value: formatSarCurrency(summary.netSales), hint: 'بعد الخصومات والمستردات', icon: WalletIcon },
            { label: 'الإيصالات', value: summary.receipts.toLocaleString('ar-SA'), hint: 'عدد عمليات البيع', icon: CalendarIcon },
            { label: 'العملاء المسجلين', value: summary.customers.toLocaleString('ar-SA'), hint: 'حسب بيانات الطلبات', icon: UsersIcon },
          ].map((card) => {
            const Icon = card.icon

            return (
              <div
                key={card.label}
                className="rounded-3xl border border-cyan-500/15 bg-[#07111d]/90 p-5 shadow-[0_0_28px_rgba(34,211,238,0.05)]"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-400">{card.label}</p>
                    <p className="mt-2 text-2xl font-black text-white">{card.value}</p>
                    <p className="mt-1 text-xs font-bold text-cyan-300">{card.hint}</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-300">
                    <Icon className="h-6 w-6" />
                  </div>
                </div>
              </div>
            )
          })}
        </section>

        <section className="rounded-3xl border border-cyan-500/15 bg-[#07111d]/90 shadow-[0_0_40px_rgba(0,255,255,0.06)] backdrop-blur-xl">
          <div className="flex flex-col gap-3 border-b border-cyan-500/10 p-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="text-right">
              <h2 className="text-2xl font-black text-white">إجمالي النتائج</h2>
              <p className="mt-1 text-sm text-slate-400">{filteredRows.length.toLocaleString('ar-SA')} موظف في التقرير</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/15 bg-cyan-500/10 px-3 py-1.5 text-xs font-bold text-cyan-200">
              <ChartIcon className="h-4 w-4" />
              أداء المبيعات حسب الموظف
            </div>
          </div>

          <div data-responsive-report-cards className="grid gap-3 p-4 xl:hidden">
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-40 animate-pulse rounded-2xl bg-white/[0.04]" />
              ))
            ) : pageRows.length > 0 ? (
              pageRows.map((row) => (
                <article
                  key={row.employeeKey}
                  className="min-w-0 rounded-2xl border border-cyan-500/15 bg-white/[0.035] p-4"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0 text-right">
                      <h3 className="break-words text-base font-black text-white">{row.employeeName}</h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${getRoleBadgeClassName(row.role)}`}>
                          {getRoleLabel(row.role)}
                        </span>
                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                          {getPerformanceLabel(row)}
                        </span>
                      </div>
                    </div>
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-300">
                      <UserIcon className="h-5 w-5" />
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="min-w-0 rounded-xl bg-black/20 p-3">
                      <dt className="text-xs text-slate-500">صافي المبيعات</dt>
                      <dd className="mt-1 break-words font-black text-cyan-200">{formatSarCurrency(row.netSales)}</dd>
                    </div>
                    <div className="min-w-0 rounded-xl bg-black/20 p-3">
                      <dt className="text-xs text-slate-500">الإيصالات</dt>
                      <dd className="mt-1 font-black text-white">{row.receiptsCount.toLocaleString('ar-SA')}</dd>
                    </div>
                    <div className="min-w-0 rounded-xl bg-black/20 p-3">
                      <dt className="text-xs text-slate-500">متوسط البيع</dt>
                      <dd className="mt-1 break-words font-bold text-slate-100">{formatSarCurrency(row.averageSale)}</dd>
                    </div>
                    <div className="min-w-0 rounded-xl bg-black/20 p-3">
                      <dt className="text-xs text-slate-500">العملاء</dt>
                      <dd className="mt-1 font-black text-white">{row.registeredCustomersCount.toLocaleString('ar-SA')}</dd>
                    </div>
                  </dl>
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-cyan-500/15 p-6 text-center text-sm text-slate-400">
                لا توجد بيانات موظفين خلال الفترة الحالية.
              </div>
            )}
          </div>

          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[1180px] text-right">
              <thead className="sticky top-0 z-10 bg-[#091424]">
                <tr className="border-b border-cyan-500/10 text-xs font-bold text-slate-300">
                  <th className="w-[230px] px-5 py-4">الاسم</th>
                  <th className="w-[150px] px-5 py-4">إجمالي المبيعات</th>
                  <th className="w-[150px] px-5 py-4">المبالغ المستردة</th>
                  <th className="w-[130px] px-5 py-4">الخصومات</th>
                  <th className="w-[150px] px-5 py-4">صافي المبيعات</th>
                  <th className="w-[110px] px-5 py-4">الإيصالات</th>
                  <th className="w-[140px] px-5 py-4">متوسط البيع</th>
                  <th className="w-[150px] px-5 py-4">العملاء المسجلين</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index} className="border-b border-cyan-500/10">
                      <td colSpan={8} className="px-5 py-4">
                        <div className="h-12 animate-pulse rounded-2xl bg-white/[0.04]" />
                      </td>
                    </tr>
                  ))
                ) : pageRows.length > 0 ? (
                  pageRows.map((row) => (
                    <tr key={row.employeeKey} className="border-b border-cyan-500/10 transition hover:bg-cyan-500/5">
                      <td className="px-5 py-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-300">
                            <UserIcon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-white">{row.employeeName}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${getRoleBadgeClassName(row.role)}`}
                              >
                                {getRoleLabel(row.role)}
                              </span>
                              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                                {getPerformanceLabel(row)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-slate-100">{formatSarCurrency(row.grossSales)}</td>
                      <td className="px-5 py-4 text-sm font-bold text-rose-200">{formatSarCurrency(row.refunds)}</td>
                      <td className="px-5 py-4 text-sm font-bold text-amber-200">{formatSarCurrency(row.discounts)}</td>
                      <td className="px-5 py-4 text-sm font-black text-cyan-200">{formatSarCurrency(row.netSales)}</td>
                      <td className="px-5 py-4 text-sm font-bold text-white">{row.receiptsCount.toLocaleString('ar-SA')}</td>
                      <td className="px-5 py-4 text-sm font-bold text-slate-100">{formatSarCurrency(row.averageSale)}</td>
                      <td className="px-5 py-4 text-sm font-bold text-white">{row.registeredCustomersCount.toLocaleString('ar-SA')}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-5 py-12">
                      <div className="mx-auto flex max-w-md flex-col items-center rounded-3xl border border-cyan-500/15 bg-white/[0.03] p-8 text-center">
                        <SearchIcon className="h-10 w-10 text-cyan-300/70" />
                        <h3 className="mt-4 text-lg font-black text-white">لا توجد بيانات موظفين خلال الفترة الحالية</h3>
                        <p className="mt-2 text-sm text-slate-400">جرّب تغيير الفترة أو الفرع أو الموظف.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-cyan-500/10 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-400">
              عرض {pageRows.length.toLocaleString('ar-SA')} من {filteredRows.length.toLocaleString('ar-SA')} موظف
            </p>
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
                {currentPage} / {totalPages}
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
    </main>
  )
}

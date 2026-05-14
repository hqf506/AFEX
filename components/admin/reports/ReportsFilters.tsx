'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdminButton } from '@/components/admin-button'
import { type ReportRange } from '@/lib/reports/core'
import { getDateInputValue } from '@/lib/orders/format'
import BranchDropdown from '@/components/admin/reports/BranchDropdown'
import DatePicker from '@/components/admin/reports/DatePicker'

type DatePickerField = 'from' | 'to'

type BranchOption = {
  value: string
  label: string
}

type ReportsFiltersProps = {
  roleLabel: string
  range: ReportRange
  setRange: React.Dispatch<React.SetStateAction<ReportRange>>
  dateFrom: string
  dateTo: string
  setDateFrom: React.Dispatch<React.SetStateAction<string>>
  setDateTo: React.Dispatch<React.SetStateAction<string>>
  lastUpdated: string
  refreshing: boolean
  exportPdf: () => void
  exportExcel: () => void
  fetchReportsData: () => void
  isSystemAdmin: boolean
  loadingBranches: boolean
  selectedBranchId: string
  selectedBranchLabel: string
  branchOptions: BranchOption[]
  setSelectedBranchId: (value: string) => void
}

function parseDateValue(value: string) {
  if (!value) return null

  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null

  return new Date(year, month - 1, day)
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function shiftMonth(date: Date, direction: number) {
  return new Date(date.getFullYear(), date.getMonth() + direction, 1)
}

export default function ReportsFilters({
  roleLabel,
  range,
  setRange,
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  lastUpdated,
  refreshing,
  exportPdf,
  exportExcel,
  fetchReportsData,
  isSystemAdmin,
  loadingBranches,
  selectedBranchId,
  selectedBranchLabel,
  branchOptions,
  setSelectedBranchId,
}: ReportsFiltersProps) {
  const todayString = useMemo(() => getDateInputValue(new Date()), [])
  const todayDate = useMemo(
    () => parseDateValue(todayString) || new Date(),
    [todayString]
  )
  const [openDatePicker, setOpenDatePicker] = useState<DatePickerField | null>(
    null
  )
  const [datePickerViews, setDatePickerViews] = useState(() => ({
    from: startOfMonth(parseDateValue(todayString) || new Date()),
    to: startOfMonth(parseDateValue(todayString) || new Date()),
  }))
  const fromDatePickerRef = useRef<HTMLDivElement | null>(null)
  const toDatePickerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!openDatePicker) return

    function handlePointerDown(event: MouseEvent) {
      const activeRef =
        openDatePicker === 'from'
          ? fromDatePickerRef.current
          : toDatePickerRef.current

      if (activeRef && !activeRef.contains(event.target as Node)) {
        setOpenDatePicker(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [openDatePicker])

  const handleDatePickerToggle = useCallback(
    (field: DatePickerField) => {
      setOpenDatePicker((current) => (current === field ? null : field))
      setDatePickerViews((current) => ({
        ...current,
        [field]: startOfMonth(
          parseDateValue(field === 'from' ? dateFrom : dateTo) || todayDate
        ),
      }))
    },
    [dateFrom, dateTo, todayDate]
  )

  const handleDateSelection = useCallback(
    (field: DatePickerField, value: string) => {
      if (field === 'from') {
        setDateFrom(value)
      } else {
        setDateTo(value)
      }

      setDatePickerViews((current) => ({
        ...current,
        [field]: startOfMonth(parseDateValue(value) || todayDate),
      }))
      setOpenDatePicker(null)
    },
    [setDateFrom, setDateTo, todayDate]
  )

  const handleDatePickerToday = useCallback(
    (field: DatePickerField) => {
      const value = getDateInputValue(new Date())
      handleDateSelection(field, value)
    },
    [handleDateSelection]
  )

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-7 shadow-sm">
      <div className="mb-5 flex flex-col gap-4 text-right lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">فلاتر التقرير</h2>
          <p className="mt-1 text-sm text-slate-500">
            اختر نوع التقرير وحدد الفترة الزمنية ثم طبّق النتائج
          </p>
          <p className="mt-3 text-xs text-slate-400">
            آخر تحديث: {lastUpdated || '—'}
            {refreshing ? ' • جارٍ التحديث...' : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <button
            type="button"
            onClick={exportPdf}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
          >
            تصدير PDF
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
          >
            تصدير Excel
          </button>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-[1.35fr_1.1fr_0.9fr_0.9fr_0.9fr_auto] xl:items-end">
        <div className="xl:col-span-2">
          <label className="field-label">الفترة</label>
          <div className="mt-2 flex flex-wrap gap-2">
            <AdminButton
              onClick={() => {
                setRange('daily')
                setOpenDatePicker(null)
              }}
              variant={range === 'daily' ? 'primary' : 'secondary'}
              type="button"
            >
              يوم
            </AdminButton>
            <AdminButton
              onClick={() => {
                setRange('yearly')
                setOpenDatePicker(null)
              }}
              variant={range === 'yearly' ? 'primary' : 'secondary'}
              type="button"
            >
              أسبوع
            </AdminButton>
            <AdminButton
              onClick={() => {
                setRange('monthly')
                setOpenDatePicker(null)
              }}
              variant={range === 'monthly' ? 'primary' : 'secondary'}
              type="button"
            >
              شهر
            </AdminButton>
            <AdminButton
              onClick={() => setRange('custom')}
              variant={range === 'custom' ? 'primary' : 'secondary'}
              type="button"
            >
              مخصص
            </AdminButton>
          </div>
        </div>

        <BranchDropdown
          isSystemAdmin={isSystemAdmin}
          loadingBranches={loadingBranches}
          selectedBranchId={selectedBranchId}
          selectedBranchLabel={selectedBranchLabel}
          branchOptions={branchOptions}
          onSelectBranch={setSelectedBranchId}
        />

        <DatePicker
          field="from"
          label="من تاريخ"
          value={dateFrom}
          disabled={range !== 'custom'}
          isOpen={openDatePicker === 'from'}
          viewDate={datePickerViews.from}
          todayString={todayString}
          onToggle={handleDatePickerToggle}
          onSelect={handleDateSelection}
          onToday={handleDatePickerToday}
          onShiftMonth={(field, direction) =>
            setDatePickerViews((current) => ({
              ...current,
              [field]: shiftMonth(current[field], direction),
            }))
          }
          pickerRef={fromDatePickerRef}
        />

        <DatePicker
          field="to"
          label="إلى تاريخ"
          value={dateTo}
          disabled={range !== 'custom'}
          isOpen={openDatePicker === 'to'}
          viewDate={datePickerViews.to}
          todayString={todayString}
          onToggle={handleDatePickerToggle}
          onSelect={handleDateSelection}
          onToday={handleDatePickerToday}
          onShiftMonth={(field, direction) =>
            setDatePickerViews((current) => ({
              ...current,
              [field]: shiftMonth(current[field], direction),
            }))
          }
          pickerRef={toDatePickerRef}
        />

        <div>
          <label className="field-label">تطبيق</label>
          <button
            type="button"
            onClick={fetchReportsData}
            className="mt-2 w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
          >
            تطبيق
          </button>
        </div>
      </div>

      {roleLabel ? (
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            الصلاحية: {roleLabel}
          </span>
        </div>
      ) : null}
    </div>
  )
}

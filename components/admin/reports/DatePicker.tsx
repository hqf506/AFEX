'use client'

import type { RefObject } from 'react'

const ARABIC_WEEKDAY_LABELS = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']

type DatePickerProps = {
  field: 'from' | 'to'
  label: string
  value: string
  disabled?: boolean
  isOpen: boolean
  viewDate: Date
  todayString: string
  onToggle: (field: 'from' | 'to') => void
  onSelect: (field: 'from' | 'to', value: string) => void
  onToday: (field: 'from' | 'to') => void
  onShiftMonth: (field: 'from' | 'to', direction: number) => void
  pickerRef: RefObject<HTMLDivElement | null>
}

function getDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getMonthLabel(date: Date) {
  return new Intl.DateTimeFormat('ar-EG-u-ca-gregory', {
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function getCalendarDays(viewDate: Date) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDayIndex = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days: Array<Date | null> = []

  for (let index = 0; index < firstDayIndex; index += 1) {
    days.push(null)
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(new Date(year, month, day))
  }

  while (days.length % 7 !== 0) {
    days.push(null)
  }

  return days
}

export default function DatePicker({
  field,
  label,
  value,
  disabled = false,
  isOpen,
  viewDate,
  todayString,
  onToggle,
  onSelect,
  onToday,
  onShiftMonth,
  pickerRef,
}: DatePickerProps) {
  const calendarDays = getCalendarDays(viewDate)

  return (
    <div ref={pickerRef} className="relative">
      <label className="field-label">{label}</label>
      <div className="mt-2">
        <button
          type="button"
          onClick={() => {
            if (disabled) return
            onToggle(field)
          }}
          disabled={disabled}
          className={`flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 px-4 text-sm transition focus:outline-none focus:ring-2 focus:ring-slate-200 ${
            disabled
              ? 'cursor-not-allowed bg-slate-50 text-slate-400 opacity-70'
              : 'cursor-pointer bg-white text-slate-900 hover:border-slate-300'
          }`}
        >
          <span className={disabled ? 'text-slate-300' : 'text-slate-400'}>
            📅
          </span>
          <span className="font-medium">{value || 'YYYY-MM-DD'}</span>
        </button>

        {isOpen ? (
          <div className="absolute right-0 top-full z-50 mt-2 w-[280px] rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => onShiftMonth(field, 1)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
              >
                ›
              </button>
              <div className="text-sm font-semibold text-slate-900">
                {getMonthLabel(viewDate)}
              </div>
              <button
                type="button"
                onClick={() => onShiftMonth(field, -1)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
              >
                ‹
              </button>
            </div>

            <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
              {ARABIC_WEEKDAY_LABELS.map((day) => (
                <span key={`${field}-${day}`} className="py-1">
                  {day}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, index) => {
                if (!day) {
                  return <span key={`${field}-empty-${index}`} className="h-9" />
                }

                const dayValue = getDateInputValue(day)
                const isSelected = value === dayValue
                const isToday = todayString === dayValue

                return (
                  <button
                    key={`${field}-${dayValue}`}
                    type="button"
                    onClick={() => onSelect(field, dayValue)}
                    className={`h-9 rounded-xl text-sm transition ${
                      isSelected
                        ? 'bg-black text-white'
                        : isToday
                          ? 'border border-black text-slate-900 hover:bg-slate-100'
                          : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {day.getDate()}
                  </button>
                )
              })}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onToday(field)}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                اليوم
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

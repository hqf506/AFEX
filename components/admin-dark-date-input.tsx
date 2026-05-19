'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type AdminDarkDateInputProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  triggerClassName?: string
  calendarClassName?: string
  placeholder?: string
  ariaLabel?: string
  allowClear?: boolean
}

type CalendarPosition = {
  top: number
  left: number
  width: number
}

const ARABIC_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
]

const WEEK_DAYS = [
  'الأحد',
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
]

function parseDateValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)

  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  return date
}

function formatDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getDisplayDate(value: string) {
  const date = parseDateValue(value)

  if (!date) return ''

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')

  return `${day}/${month}/${date.getFullYear()}`
}

function getCalendarAnchor(value: string) {
  const parsed = parseDateValue(value)
  return parsed ?? new Date()
}

function isSameDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function buildCalendarDays(monthDate: Date) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: Array<Date | null> = []

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    cells.push(null)
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day))
  }

  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  return cells
}

export function AdminDarkDateInput({
  value,
  onChange,
  disabled = false,
  className = '',
  triggerClassName = '',
  calendarClassName = '',
  placeholder = 'اختر التاريخ',
  ariaLabel,
  allowClear = false,
}: AdminDarkDateInputProps) {
  const [open, setOpen] = useState(false)
  const [calendarPosition, setCalendarPosition] =
    useState<CalendarPosition | null>(null)
  const [monthDate, setMonthDate] = useState(() => getCalendarAnchor(value))
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const calendarRef = useRef<HTMLDivElement | null>(null)
  const calendarId = useId()
  const selectedDate = useMemo(() => parseDateValue(value), [value])
  const today = useMemo(() => new Date(), [])
  const calendarDays = useMemo(() => buildCalendarDays(monthDate), [monthDate])
  const displayValue = getDisplayDate(value)

  useEffect(() => {
    if (!open) return

    function updateCalendarPosition() {
      const trigger = triggerRef.current

      if (!trigger) return

      const rect = trigger.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth
      const menuGap = 8
      const calendarHeight = 328
      const spaceBelow = viewportHeight - rect.bottom - menuGap
      const spaceAbove = rect.top - menuGap
      const shouldOpenUp = spaceBelow < calendarHeight && spaceAbove > spaceBelow
      const calendarWidth = Math.max(rect.width, 284)
      const left = Math.min(
        Math.max(8, rect.right - calendarWidth),
        Math.max(8, viewportWidth - calendarWidth - 8)
      )
      const top = shouldOpenUp
        ? Math.max(8, rect.top - calendarHeight - menuGap)
        : Math.min(rect.bottom + menuGap, viewportHeight - 56)

      setCalendarPosition({
        top,
        left,
        width: calendarWidth,
      })
    }

    updateCalendarPosition()

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target

      if (!(target instanceof Node)) return

      const clickedTrigger = wrapperRef.current?.contains(target)
      const clickedCalendar = calendarRef.current?.contains(target)

      if (!clickedTrigger && !clickedCalendar) {
        setOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', updateCalendarPosition)
    window.addEventListener('scroll', updateCalendarPosition, true)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', updateCalendarPosition)
      window.removeEventListener('scroll', updateCalendarPosition, true)
    }
  }, [open])

  function openCalendar() {
    if (disabled) return

    setMonthDate(getCalendarAnchor(value))
    setOpen((current) => !current)
  }

  function moveMonth(amount: number) {
    setMonthDate(
      (current) => new Date(current.getFullYear(), current.getMonth() + amount, 1)
    )
  }

  function selectDate(date: Date) {
    onChange(formatDateValue(date))
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} className={`relative text-right ${className}`} dir="rtl">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={calendarId}
        aria-label={ariaLabel}
        onClick={openCalendar}
        className={`flex h-12 w-full items-center justify-between gap-3 rounded-2xl border border-cyan-300/15 bg-[#06111f] px-4 text-sm font-bold text-white outline-none transition hover:border-cyan-300/35 hover:bg-white/[0.055] focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-black/20 disabled:text-slate-500 disabled:opacity-70 ${triggerClassName}`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="4" y="5" width="16" height="15" rx="2" />
            <path d="M8 3v4" />
            <path d="M16 3v4" />
            <path d="M4 10h16" />
          </svg>
        </span>
        <span className="min-w-0 flex-1 truncate text-right">
          {displayValue || placeholder}
        </span>
      </button>

      {open && !disabled && calendarPosition && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={calendarRef}
              id={calendarId}
              role="dialog"
              aria-label={ariaLabel ?? 'اختيار التاريخ'}
              dir="rtl"
              style={{
                position: 'fixed',
                top: calendarPosition.top,
                left: calendarPosition.left,
                width: calendarPosition.width,
              }}
              className={`z-[9999] overflow-hidden rounded-[20px] border border-cyan-300/15 bg-[#06111f] p-3 text-right text-white shadow-[0_24px_80px_rgba(0,0,0,0.46)] backdrop-blur-xl ${calendarClassName}`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => moveMonth(1)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] text-cyan-100 transition hover:border-cyan-300/30 hover:bg-cyan-300/10"
                  aria-label="الشهر التالي"
                >
                  ‹
                </button>
                <div className="text-center">
                  <p className="text-sm font-black text-white">
                    {ARABIC_MONTHS[monthDate.getMonth()]} {monthDate.getFullYear()}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                    اختر يومًا من التقويم
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => moveMonth(-1)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] text-cyan-100 transition hover:border-cyan-300/30 hover:bg-cyan-300/10"
                  aria-label="الشهر السابق"
                >
                  ›
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-slate-500">
                {WEEK_DAYS.map((day) => (
                  <div key={day} className="py-1.5">
                    {day}
                  </div>
                ))}
              </div>

              <div className="mt-1 grid grid-cols-7 gap-1">
                {calendarDays.map((date, index) => {
                  if (!date) {
                    return <div key={`empty-${index}`} className="h-8" />
                  }

                  const selected = selectedDate ? isSameDate(date, selectedDate) : false
                  const currentDay = isSameDate(date, today)

                  return (
                    <button
                      key={formatDateValue(date)}
                      type="button"
                      onClick={() => selectDate(date)}
                      className={`h-8 rounded-lg text-xs font-black transition ${
                        selected
                          ? 'bg-gradient-to-l from-cyan-300 to-teal-300 text-slate-950 shadow-[0_0_26px_rgba(34,211,238,0.22)]'
                          : currentDay
                            ? 'border border-cyan-300/35 bg-cyan-300/10 text-cyan-100'
                            : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'
                      }`}
                    >
                      {date.getDate()}
                    </button>
                  )
                })}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-2.5">
                {allowClear ? (
                  <button
                    type="button"
                    onClick={() => {
                      onChange('')
                      setOpen(false)
                    }}
                    className="h-9 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-xs font-black text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                  >
                    مسح
                  </button>
                ) : (
                  <span />
                )}

                <button
                  type="button"
                  onClick={() => selectDate(new Date())}
                  className="h-9 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/15"
                >
                  اليوم
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

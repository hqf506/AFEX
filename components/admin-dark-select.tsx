'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

export type AdminDarkSelectOption = {
  value: string
  label: ReactNode
  disabled?: boolean
}

type AdminDarkSelectProps = {
  value: string
  options: AdminDarkSelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  triggerClassName?: string
  menuClassName?: string
  placeholder?: string
  ariaLabel?: string
}

type MenuPosition = {
  top: number
  left: number
  width: number
  maxHeight: number
}

export function AdminDarkSelect({
  value,
  options,
  onChange,
  disabled = false,
  className = '',
  triggerClassName = '',
  menuClassName = '',
  placeholder = 'اختر',
  ariaLabel,
}: AdminDarkSelectProps) {
  const [open, setOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()
  const selectedOption = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return

    function updateMenuPosition() {
      const trigger = triggerRef.current

      if (!trigger) return

      const rect = trigger.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth
      const menuGap = 8
      const minimumHeight = 160
      const preferredHeight = 288
      const spaceBelow = viewportHeight - rect.bottom - menuGap
      const spaceAbove = rect.top - menuGap
      const shouldOpenUp = spaceBelow < minimumHeight && spaceAbove > spaceBelow
      const availableHeight = shouldOpenUp ? spaceAbove : spaceBelow
      const maxHeight = Math.max(
        minimumHeight,
        Math.min(preferredHeight, availableHeight)
      )
      const menuWidth = Math.max(rect.width, 190)
      const left = Math.min(
        Math.max(8, rect.right - menuWidth),
        Math.max(8, viewportWidth - menuWidth - 8)
      )
      const top = shouldOpenUp
        ? Math.max(8, rect.top - maxHeight - menuGap)
        : Math.min(rect.bottom + menuGap, viewportHeight - 56)

      setMenuPosition({
        top,
        left,
        width: menuWidth,
        maxHeight,
      })
    }

    updateMenuPosition()

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target

      if (!(target instanceof Node)) return

      const clickedTrigger = wrapperRef.current?.contains(target)
      const clickedMenu = menuRef.current?.contains(target)

      if (!clickedTrigger && !clickedMenu) {
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
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open])

  return (
    <div ref={wrapperRef} className={`relative text-right ${className}`} dir="rtl">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-12 w-full items-center justify-between gap-3 rounded-2xl border border-cyan-300/15 bg-[#06111f] px-4 text-sm font-bold text-white outline-none transition hover:border-cyan-300/35 hover:bg-white/[0.055] focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-55 ${triggerClassName}`}
      >
        <span className="text-cyan-200" aria-hidden="true">
          ▾
        </span>
        <span className="min-w-0 flex-1 truncate text-right">
          {selectedOption?.label ?? placeholder}
        </span>
      </button>

      {open && !disabled && menuPosition && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="listbox"
              dir="rtl"
              style={{
                position: 'fixed',
                top: menuPosition.top,
                left: menuPosition.left,
                width: menuPosition.width,
                maxHeight: menuPosition.maxHeight,
              }}
              className={`z-[11000] overflow-y-auto rounded-2xl border border-cyan-300/15 bg-[#06111f] p-1 text-right shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl ${menuClassName}`}
            >
              {options.map((option) => {
                const selected = option.value === value

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={option.disabled}
                    onClick={() => {
                      if (option.disabled) return
                      onChange(option.value)
                      setOpen(false)
                    }}
                    className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-right text-sm transition ${
                      selected
                        ? 'bg-cyan-300/10 font-black text-cyan-100'
                        : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'
                    } disabled:cursor-not-allowed disabled:opacity-45`}
                  >
                    <span className="text-cyan-200">
                      {selected ? '✓' : ''}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                    </span>
                  </button>
                )
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

export type MobileBottomNavItem = {
  key: string
  label: string
  icon: ReactNode
  href?: string
  active?: boolean
  disabled?: boolean
  onSelect?: (trigger: HTMLButtonElement) => void
}

export function MobileBottomNav({
  items,
  ariaLabel = 'التنقل الرئيسي',
}: {
  items: MobileBottomNavItem[]
  ariaLabel?: string
}) {
  return (
    <nav
      aria-label={ariaLabel}
      data-mobile-bottom-nav
      className="fixed inset-x-0 bottom-0 z-[90] border-t border-cyan-300/15 bg-[#06111f]/95 px-2 pt-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom))] shadow-[0_-18px_55px_rgba(0,0,0,0.38)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid min-h-[4rem] max-w-xl grid-flow-col auto-cols-fr items-stretch gap-1" dir="rtl">
        {items.map((item) => {
          const className = `group flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-black outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300/40 ${
            item.active
              ? 'bg-cyan-300/10 text-cyan-100'
              : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-200'
          } ${item.disabled ? 'pointer-events-none opacity-40' : ''}`
          const content = (
            <>
              <span
                aria-hidden="true"
                className={`grid size-6 place-items-center ${item.active ? 'text-cyan-200' : ''}`}
              >
                {item.icon}
              </span>
              <span className="max-w-full truncate">{item.label}</span>
              {item.active ? (
                <span className="absolute top-0 h-0.5 w-7 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.85)]" />
              ) : null}
            </>
          )

          return item.href ? (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={`relative ${className}`}
            >
              {content}
            </Link>
          ) : (
            <button
              key={item.key}
              type="button"
              disabled={item.disabled}
              aria-pressed={item.active}
              onClick={(event) => item.onSelect?.(event.currentTarget)}
              className={`relative ${className}`}
            >
              {content}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

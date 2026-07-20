'use client'

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function useMobileOverlay(
  open: boolean,
  onClose: () => void,
  panelRef: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    const returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const panel = panelRef.current
    const firstFocusable = panel?.querySelector<HTMLElement>(focusableSelector)

    document.body.style.overflow = 'hidden'
    window.setTimeout(() => (firstFocusable || panel)?.focus(), 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') return
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector)
      if (!focusable?.length) {
        event.preventDefault()
        panelRef.current?.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      window.setTimeout(() => returnFocus?.focus(), 0)
    }
  }, [onClose, open, panelRef])
}

type OverlayBaseProps = {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  closeLabel?: string
  className?: string
}

export function MobileFilterSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeLabel = 'إغلاق الفلاتر',
  className = '',
}: OverlayBaseProps & { footer?: ReactNode }) {
  const titleId = useId()
  const panelRef = useRef<HTMLElement | null>(null)
  useMobileOverlay(open, onClose, panelRef)

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[12000] md:hidden" dir="rtl">
      <button
        type="button"
        aria-label={closeLabel}
        className="absolute inset-0 h-full w-full bg-slate-950/75 backdrop-blur-sm"
        onClick={onClose}
      />
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`absolute inset-x-0 bottom-0 flex max-h-[min(88dvh,760px)] min-h-0 flex-col overflow-hidden rounded-t-[28px] border-t border-cyan-300/20 bg-[#07111f] pb-[env(safe-area-inset-bottom)] text-right shadow-[0_-30px_100px_rgba(0,0,0,0.55)] outline-none ${className}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="break-words text-lg font-black text-white">{title}</h2>
            {description ? <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.045] text-xl text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40">×</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
        {footer ? <footer className="shrink-0 border-t border-white/10 bg-[#07111f]/95 px-4 py-3">{footer}</footer> : null}
      </section>
    </div>,
    document.body
  )
}

export type MobileActionSheetAction = {
  key: string
  label: ReactNode
  icon?: ReactNode
  disabled?: boolean
  destructive?: boolean
  onSelect: () => void
}

export function MobileActionSheet({
  open,
  onClose,
  title,
  description,
  actions,
  closeLabel = 'إغلاق قائمة الإجراءات',
}: Omit<OverlayBaseProps, 'children'> & { actions: MobileActionSheetAction[] }) {
  return (
    <MobileFilterSheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      closeLabel={closeLabel}
      className="max-h-[80dvh]"
    >
      <div className="grid gap-2">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            disabled={action.disabled}
            onClick={() => {
              action.onSelect()
              onClose()
            }}
            className={`flex min-h-12 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-right text-sm font-black outline-none transition focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-45 ${
              action.destructive
                ? 'border-red-300/20 bg-red-400/[0.08] text-red-200 focus-visible:ring-red-300/35'
                : 'border-white/10 bg-white/[0.045] text-slate-100 hover:border-cyan-300/25 hover:bg-cyan-300/[0.08] focus-visible:ring-cyan-300/35'
            }`}
          >
            {action.icon ? <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center">{action.icon}</span> : null}
            <span className="min-w-0 flex-1 break-words">{action.label}</span>
          </button>
        ))}
      </div>
    </MobileFilterSheet>
  )
}

export function MobileFullScreenDrawer({
  open,
  onClose,
  title,
  description,
  children,
  closeLabel = 'إغلاق',
  className = '',
}: OverlayBaseProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLElement | null>(null)
  useMobileOverlay(open, onClose, panelRef)

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[12000] xl:hidden" dir="rtl">
      <button type="button" aria-label={closeLabel} onClick={onClose} className="absolute inset-0 hidden h-full w-full bg-slate-950/75 backdrop-blur-sm md:block" />
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`absolute inset-0 flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-[#020817] text-right outline-none md:left-0 md:right-auto md:w-[min(78vw,880px)] md:border-r md:border-cyan-300/15 ${className}`}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-white/10 bg-[#07111f]/95 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-xl">
          <button type="button" onClick={onClose} aria-label={closeLabel} className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.045] text-xl text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40">‹</button>
          <div className="min-w-0 flex-1 pt-1">
            <h2 id={titleId} className="break-words text-base font-black text-white">{title}</h2>
            {description ? <p className="mt-1 break-words text-xs text-slate-400">{description}</p> : null}
          </div>
        </header>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">{children}</div>
      </section>
    </div>,
    document.body
  )
}

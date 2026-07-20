import type { ReactNode } from 'react'

type MobilePageHeaderProps = {
  title: ReactNode
  subtitle?: ReactNode
  leading?: ReactNode
  action?: ReactNode
  notification?: ReactNode
  className?: string
}

export function MobilePageHeader({
  title,
  subtitle,
  leading,
  action,
  notification,
  className = '',
}: MobilePageHeaderProps) {
  return (
    <header
      data-mobile-page-header
      className={`flex min-h-14 min-w-0 items-center gap-2 rounded-2xl border border-cyan-300/15 bg-[#07111f]/95 px-2.5 py-2 text-right shadow-[0_16px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl md:hidden ${className}`}
    >
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-black text-white">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 truncate text-[11px] font-bold text-slate-400">
            {subtitle}
          </p>
        ) : null}
      </div>
      {notification ? <div className="shrink-0">{notification}</div> : null}
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}

type MobileDataCardProps = {
  title: ReactNode
  subtitle?: ReactNode
  status?: ReactNode
  metric?: ReactNode
  metadata?: ReactNode
  footer?: ReactNode
  leading?: ReactNode
  className?: string
}

export function MobileDataCard({
  title,
  subtitle,
  status,
  metric,
  metadata,
  footer,
  leading,
  className = '',
}: MobileDataCardProps) {
  return (
    <article
      className={`min-w-0 overflow-hidden rounded-[22px] border border-cyan-300/15 bg-[#07111f]/92 p-4 text-right shadow-[0_16px_50px_rgba(0,0,0,0.24)] ${className}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        {leading ? <div className="shrink-0">{leading}</div> : null}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="break-words text-sm font-black text-white">{title}</h2>
              {subtitle ? (
                <p className="mt-1 break-words text-xs leading-5 text-slate-400">
                  {subtitle}
                </p>
              ) : null}
            </div>
            {status ? <div className="shrink-0">{status}</div> : null}
          </div>
          {metric ? <div className="mt-3 text-xl font-black text-cyan-100">{metric}</div> : null}
          {metadata ? <div className="mt-3 min-w-0 text-xs text-slate-300">{metadata}</div> : null}
        </div>
      </div>
      {footer ? (
        <footer className="mt-4 border-t border-white/[0.07] pt-3">{footer}</footer>
      ) : null}
    </article>
  )
}

type MobileSectionProps = {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function MobileSection({
  title,
  description,
  action,
  children,
  className = '',
}: MobileSectionProps) {
  return (
    <section
      className={`min-w-0 rounded-[22px] border border-cyan-300/15 bg-white/[0.045] p-4 text-right shadow-[0_16px_50px_rgba(0,0,0,0.22)] ${className}`}
    >
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-base font-black text-white">{title}</h2>
          {description ? (
            <p className="mt-1 break-words text-xs leading-5 text-slate-400">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="mt-4 min-w-0">{children}</div>
    </section>
  )
}

type MobileStickyActionBarProps = {
  primaryAction: ReactNode
  secondaryAction?: ReactNode
  loading?: boolean
  disabled?: boolean
  hasBottomNavigation?: boolean
  className?: string
}

export function MobileStickyActionBar({
  primaryAction,
  secondaryAction,
  loading = false,
  disabled = false,
  hasBottomNavigation = true,
  className = '',
}: MobileStickyActionBarProps) {
  return (
    <div
      aria-busy={loading}
      data-disabled={disabled || undefined}
      className={`fixed inset-x-0 z-[10000] border-t border-cyan-300/15 bg-[#07111f]/95 px-3 pt-3 shadow-[0_-16px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl md:hidden ${
        hasBottomNavigation
          ? 'bottom-[calc(4.75rem+env(safe-area-inset-bottom))] pb-3'
          : 'bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]'
      } ${className}`}
    >
      <div
        className={`mx-auto flex w-full max-w-xl gap-2 ${
          disabled || loading ? 'pointer-events-none opacity-60' : ''
        }`}
      >
        <div className="min-w-0 flex-1">{primaryAction}</div>
        {secondaryAction ? <div className="shrink-0">{secondaryAction}</div> : null}
      </div>
    </div>
  )
}

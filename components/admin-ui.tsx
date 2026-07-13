import type { ReactNode } from 'react'

type AdminUiProps = {
  children?: ReactNode
  className?: string
}

export function AdminGlassSection({ children, className = '' }: AdminUiProps) {
  return (
    <section
      className={`rounded-[28px] border border-cyan-300/15 bg-white/[0.055] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-6 ${className}`}
    >
      {children}
    </section>
  )
}

export function AdminLoadingState({ className = '' }: { className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="جارٍ تحميل البيانات"
      className={`mx-auto h-32 max-w-7xl animate-pulse rounded-[28px] border border-cyan-300/10 bg-white/[0.055] shadow-[0_24px_80px_rgba(0,0,0,0.28)] ${className}`}
    >
      <span className="sr-only">جارٍ تحميل البيانات...</span>
    </div>
  )
}

type AdminAlertTone = 'success' | 'error' | 'warning' | 'info'

const alertToneClassNames: Record<AdminAlertTone, string> = {
  success:
    'border-emerald-300/20 bg-emerald-400/10 text-emerald-200 shadow-[0_18px_50px_rgba(0,0,0,0.2)]',
  error:
    'border-red-300/20 bg-red-500/10 text-red-200 shadow-[0_18px_50px_rgba(0,0,0,0.2)]',
  warning:
    'border-amber-300/20 bg-amber-400/10 text-amber-100 shadow-[0_18px_50px_rgba(0,0,0,0.2)]',
  info:
    'border-cyan-300/20 bg-cyan-300/10 text-cyan-100 shadow-[0_18px_50px_rgba(0,0,0,0.2)]',
}

export function AdminAlert({
  children,
  tone = 'info',
  className = '',
}: AdminUiProps & { tone?: AdminAlertTone }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={`whitespace-pre-wrap rounded-2xl border px-4 py-3 text-sm font-bold ${alertToneClassNames[tone]} ${className}`}
    >
      {children}
    </div>
  )
}

export function AdminEmptyState({
  title,
  description,
  icon,
  className = '',
}: {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-3xl border border-dashed border-cyan-300/20 bg-cyan-300/5 p-8 text-center ${className}`}
    >
      {icon ? (
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-[#06111f] text-cyan-200">
          {icon}
        </div>
      ) : null}
      <h3 className={icon ? 'mt-4 text-lg font-black text-white' : 'text-lg font-black text-white'}>
        {title}
      </h3>
      {description ? (
        <p className="mt-2 text-sm text-slate-400">{description}</p>
      ) : null}
    </div>
  )
}

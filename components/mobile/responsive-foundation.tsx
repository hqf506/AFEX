import type { HTMLAttributes, ReactNode } from 'react'

type SharedProps = {
  children: ReactNode
  className?: string
}

export function ResponsivePageContainer({ children, className = '' }: SharedProps) {
  return (
    <main
      className={`mx-auto w-full min-w-0 max-w-[1600px] px-[var(--afex-page-gutter)] ${className}`}
    >
      {children}
    </main>
  )
}

type ResponsiveGridProps = HTMLAttributes<HTMLDivElement> & {
  variant?: 'cards' | 'compact' | 'split'
}

const gridVariants: Record<NonNullable<ResponsiveGridProps['variant']>, string> = {
  cards: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
  compact: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  split: 'grid-cols-1 lg:grid-cols-2',
}

export function ResponsiveGrid({
  children,
  className = '',
  variant = 'cards',
  ...props
}: ResponsiveGridProps) {
  return (
    <div
      className={`grid min-w-0 gap-[var(--afex-section-gap)] ${gridVariants[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function ResponsiveCard({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={`min-w-0 overflow-hidden rounded-[22px] border border-cyan-300/15 bg-[#07111f]/92 p-[var(--afex-card-padding)] text-right shadow-[0_16px_50px_rgba(0,0,0,0.24)] ${className}`}
      {...props}
    >
      {children}
    </section>
  )
}

type MobileSectionHeaderProps = {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function MobileSectionHeader({
  title,
  description,
  action,
  className = '',
}: MobileSectionHeaderProps) {
  return (
    <header
      className={`flex min-w-0 items-start justify-between gap-3 text-right md:hidden ${className}`}
    >
      <div className="min-w-0 flex-1">
        <h2 className="break-words text-base font-black text-white">{title}</h2>
        {description ? (
          <p className="mt-1 break-words text-xs leading-5 text-slate-400">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}

export function BottomSafeArea({ children, className = '' }: SharedProps) {
  return (
    <div className={`afex-safe-area-bottom min-w-0 ${className}`}>
      {children}
    </div>
  )
}

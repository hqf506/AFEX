'use client'

import type { ReactNode } from 'react'

type PageHeroProps = {
  title?: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
  bodyClassName?: string
}

export function PageHero({
  title,
  subtitle,
  meta,
  actions,
  children,
  className = '',
  bodyClassName = 'flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between',
}: PageHeroProps) {
  return (
    <div className={`page-hero ${className}`}>
      <div className={bodyClassName}>
        {(title || subtitle || meta) ? (
          <div>
            {title ? <h1 className="page-title">{title}</h1> : null}
            {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
            {meta ? <div className="mt-2 text-xs text-slate-400">{meta}</div> : null}
          </div>
        ) : null}

        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>

      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  )
}

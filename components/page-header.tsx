'use client'

import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  actions,
  className = '',
}: PageHeaderProps) {
  return (
    <div
      className={`flex flex-col gap-3 md:flex-row md:items-start md:justify-between ${className}`}
    >
      <div className="text-right">
        <h1 className="text-4xl font-black text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>

      {actions ? <div className="flex flex-wrap justify-end gap-3">{actions}</div> : null}
    </div>
  )
}

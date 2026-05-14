'use client'

import type { ReactNode } from 'react'

type StatCardProps = {
  title: ReactNode
  value: ReactNode
  note?: ReactNode
  valueClassName?: string
  className?: string
}

export function StatCard({
  title,
  value,
  note,
  valueClassName = 'text-slate-900',
  className = '',
}: StatCardProps) {
  return (
    <div className={`stat-card ${className}`}>
      <p className="stat-label">{title}</p>
      <p className={`stat-value ${valueClassName}`}>{value}</p>
      {note ? <div className="mt-2 text-sm">{note}</div> : null}
    </div>
  )
}

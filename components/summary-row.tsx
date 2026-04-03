'use client'

import type { ReactNode } from 'react'

type SummaryRowProps = {
  label: ReactNode
  value: ReactNode
  className?: string
  rowClassName?: string
  labelClassName?: string
  valueClassName?: string
}

export function SummaryRow({
  label,
  value,
  className = '',
  rowClassName = 'flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3',
  labelClassName = 'text-sm text-slate-600',
  valueClassName = 'text-sm font-bold text-slate-900',
}: SummaryRowProps) {
  return (
    <div className={`${rowClassName} ${className}`}>
      <span className={labelClassName}>{label}</span>
      <span className={valueClassName}>{value}</span>
    </div>
  )
}

'use client'

import type { SelectHTMLAttributes } from 'react'

type AdminSelectProps = SelectHTMLAttributes<HTMLSelectElement>

export function AdminSelect({
  className = '',
  children,
  ...props
}: AdminSelectProps) {
  return (
    <select
      {...props}
      className={`h-11 min-w-[220px] appearance-none rounded-2xl border border-slate-300 bg-white px-4 text-right text-sm font-bold text-slate-900 outline-none transition focus:border-slate-500 focus:outline-none focus:ring-0 focus-visible:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </select>
  )
}

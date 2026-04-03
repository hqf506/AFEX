'use client'

import { ADMIN_BRANCH_FILTER_ALL } from '@/lib/admin/branch-filter'
import type { AdminBranchRecord } from '@/lib/admin/branches'

type AdminBranchFilterProps = {
  branches: AdminBranchRecord[]
  selectedBranchId: string
  loading?: boolean
  onChange: (value: string) => void
  label?: string
  allLabel?: string
  className?: string
}

export function AdminBranchFilter({
  branches,
  selectedBranchId,
  loading = false,
  onChange,
  label = 'الفرع',
  allLabel = 'كل الفروع',
  className = '',
}: AdminBranchFilterProps) {
  return (
    <div className={`text-right ${className}`}>
      <label className="mb-2 block text-sm font-bold text-slate-700">
        {label}
      </label>
      <select
        value={selectedBranchId}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        className="h-11 min-w-[220px] rounded-2xl border border-slate-300 bg-white px-4 text-right outline-none focus:border-slate-500 disabled:opacity-60"
      >
        <option value={ADMIN_BRANCH_FILTER_ALL}>{allLabel}</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
            {!branch.is_active ? ' - معطل' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

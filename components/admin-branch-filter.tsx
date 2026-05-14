'use client'

import { AdminDarkSelect } from '@/components/admin-dark-select'
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
  const options = [
    { value: ADMIN_BRANCH_FILTER_ALL, label: allLabel },
    ...branches.map((branch) => ({
      value: branch.id,
      label: `${branch.name}${!branch.is_active ? ' - معطل' : ''}`,
    })),
  ]

  return (
    <div className={`text-right ${className}`}>
      <label className="mb-2 block text-sm font-bold text-slate-400">
        {label}
      </label>
      <AdminDarkSelect
        value={selectedBranchId}
        onChange={onChange}
        disabled={loading}
        options={options}
        className="min-w-[220px]"
        ariaLabel={label}
      />
    </div>
  )
}

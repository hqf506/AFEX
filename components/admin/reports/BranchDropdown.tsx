'use client'

import { useEffect, useRef, useState } from 'react'

type BranchOption = {
  value: string
  label: string
}

type BranchDropdownProps = {
  isSystemAdmin: boolean
  loadingBranches: boolean
  selectedBranchId: string
  selectedBranchLabel: string
  branchOptions: BranchOption[]
  onSelectBranch: (value: string) => void
}

export default function BranchDropdown({
  isSystemAdmin,
  loadingBranches,
  selectedBranchId,
  selectedBranchLabel,
  branchOptions,
  onSelectBranch,
}: BranchDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [branchSearch, setBranchSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen])

  const query = branchSearch.trim().toLowerCase()
  const filteredBranchOptions = query
    ? branchOptions.filter((option) =>
        option.label.toLowerCase().includes(query)
      )
    : branchOptions

  return (
    <div>
      <label className="field-label">الفرع</label>
      <div className="mt-2">
        {isSystemAdmin ? (
          <div ref={dropdownRef} className="relative w-full text-right">
            <button
              type="button"
              onClick={() => {
                setIsOpen((current) => !current)
                if (isOpen) {
                  setBranchSearch('')
                }
              }}
              disabled={loadingBranches}
              className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            >
              <span className="text-slate-400">▾</span>
              <span className="truncate font-medium text-slate-700">
                {loadingBranches ? 'جارٍ تحميل الفروع...' : selectedBranchLabel}
              </span>
            </button>

            {isOpen ? (
              <div className="absolute right-0 top-full z-50 mt-2 w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
                <div className="mb-2">
                  <input
                    type="text"
                    value={branchSearch}
                    onChange={(event) => setBranchSearch(event.target.value)}
                    placeholder="ابحث عن فرع"
                    className="h-10 w-full rounded-xl border border-slate-100 bg-slate-50 px-3 text-right text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-200 focus:bg-white"
                  />
                </div>

                <div className="max-h-64 overflow-y-auto">
                  {filteredBranchOptions.length > 0 ? (
                    <div className="space-y-1">
                      {filteredBranchOptions.map((option) => {
                        const isSelected = option.value === selectedBranchId

                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              onSelectBranch(option.value)
                              setIsOpen(false)
                              setBranchSearch('')
                            }}
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 ${
                              isSelected ? 'bg-slate-100 font-semibold' : ''
                            }`}
                          >
                            <span className="text-slate-400">
                              {isSelected ? '✓' : ''}
                            </span>
                            <span className="truncate">{option.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="px-3 py-4 text-center text-sm text-slate-500">
                      لا توجد نتائج
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {selectedBranchLabel}
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import type { AuthScopeType } from '@/lib/auth-profile'
import type { AdminBranchRecord } from '@/lib/admin/branches'
import {
  ADMIN_BRANCH_FILTER_ALL,
  getStoredAdminBranchFilter,
  normalizeAdminBranchFilterValue,
  resolveEffectiveBranchFilter,
  setStoredAdminBranchFilter,
} from '@/lib/admin/branch-filter'

export function useAdminBranchFilter(
  scopeType: AuthScopeType | null,
  actorBranchId: string | null,
  enabled = true
) {
  const [branches, setBranches] = useState<AdminBranchRecord[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [selectedBranchId, setSelectedBranchIdState] = useState(() =>
    getStoredAdminBranchFilter()
  )

  const isSystemAdmin = scopeType === 'system'

  useEffect(() => {
    if (!enabled || !isSystemAdmin) {
      setBranches([])
      return
    }

    let cancelled = false

    async function loadBranches() {
      try {
        setLoadingBranches(true)
        const response = await fetch('/api/admin/branches', { method: 'GET' })
        const result = await response.json().catch(() => null)

        if (!response.ok || !result?.success) {
          if (!cancelled) {
            setBranches([])
          }
          return
        }

        if (!cancelled) {
          setBranches(Array.isArray(result.branches) ? result.branches : [])
        }
      } finally {
        if (!cancelled) {
          setLoadingBranches(false)
        }
      }
    }

    void loadBranches()

    return () => {
      cancelled = true
    }
  }, [enabled, isSystemAdmin])

  useEffect(() => {
    if (!isSystemAdmin) {
      setSelectedBranchIdState(ADMIN_BRANCH_FILTER_ALL)
      return
    }

    const normalizedSelected = normalizeAdminBranchFilterValue(selectedBranchId)

    if (
      normalizedSelected !== ADMIN_BRANCH_FILTER_ALL &&
      branches.length > 0 &&
      !branches.some((branch) => branch.id === normalizedSelected)
    ) {
      setSelectedBranchIdState(ADMIN_BRANCH_FILTER_ALL)
      setStoredAdminBranchFilter(ADMIN_BRANCH_FILTER_ALL)
    }
  }, [branches, isSystemAdmin, selectedBranchId])

  const setSelectedBranchId = (value: string) => {
    const normalizedValue = normalizeAdminBranchFilterValue(value)
    setSelectedBranchIdState(normalizedValue)
    setStoredAdminBranchFilter(normalizedValue)
  }

  const effectiveBranchId = useMemo(() => {
    return resolveEffectiveBranchFilter(scopeType, actorBranchId, selectedBranchId)
  }, [scopeType, actorBranchId, selectedBranchId])

  const selectedBranchName = useMemo(() => {
    if (!isSystemAdmin) {
      return (
        branches.find((branch) => branch.id === actorBranchId)?.name || 'الفرع الحالي'
      )
    }

    if (selectedBranchId === ADMIN_BRANCH_FILTER_ALL) {
      return 'كل الفروع'
    }

    return (
      branches.find((branch) => branch.id === selectedBranchId)?.name ||
      'فرع محدد'
    )
  }, [actorBranchId, branches, isSystemAdmin, selectedBranchId])

  return {
    isSystemAdmin,
    branches,
    loadingBranches,
    selectedBranchId,
    selectedBranchName,
    effectiveBranchId,
    setSelectedBranchId,
  }
}

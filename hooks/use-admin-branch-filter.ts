'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { AuthScopeType } from '@/lib/auth-profile'
import type { AdminBranchRecord } from '@/lib/admin/branches'
import {
  createProtectedResourceAuthError,
  isClientResourceFresh,
  isProtectedResourceAuthError,
  loadClientResource,
  markProtectedResourcesUnauthorized,
  peekClientResource,
} from '@/lib/client-resource-cache'
import {
  ADMIN_BRANCH_FILTER_ALL,
  ADMIN_BRANCH_OPTIONS_UPDATED_EVENT,
  getStoredAdminBranchFilter,
  normalizeAdminBranchFilterValue,
  resolveEffectiveBranchFilter,
  setStoredAdminBranchFilter,
} from '@/lib/admin/branch-filter'

const BRANCHES_CACHE_KEY = 'admin-branches'
const BRANCHES_CACHE_TTL_MS = 60_000

export function useAdminBranchFilter(
  scopeType: AuthScopeType | null,
  actorBranchId: string | null,
  enabled = true
) {
  const pathname = usePathname()
  const isPosLoginPage = pathname?.startsWith('/pos/login') ?? false
  const shouldFetch = enabled && !isPosLoginPage
  const [branches, setBranches] = useState<AdminBranchRecord[]>(() =>
    peekClientResource<AdminBranchRecord[]>(BRANCHES_CACHE_KEY) || []
  )
  const [loadingBranches, setLoadingBranches] = useState(
    shouldFetch &&
      scopeType === 'system' &&
      !(peekClientResource<AdminBranchRecord[]>(BRANCHES_CACHE_KEY) || []).length
  )
  const [selectedBranchId, setSelectedBranchIdState] = useState(() =>
    getStoredAdminBranchFilter()
  )

  const isSystemAdmin = scopeType === 'system'

  useEffect(() => {
    if (!shouldFetch || !isSystemAdmin) {
      setBranches([])
      setLoadingBranches(false)
      return
    }

    let cancelled = false

    async function loadBranches(force = false) {
      const cachedBranches =
        peekClientResource<AdminBranchRecord[]>(BRANCHES_CACHE_KEY) || []

      if (cachedBranches.length > 0) {
        setBranches(cachedBranches)
        setLoadingBranches(false)
      } else {
        setLoadingBranches(true)
      }

      try {
        const nextBranches = await loadClientResource(
          BRANCHES_CACHE_KEY,
          async () => {
            const response = await fetch('/api/admin/branches', {
              method: 'GET',
              cache: 'no-store',
            })

            if (response.status === 401) {
              markProtectedResourcesUnauthorized()
              throw createProtectedResourceAuthError()
            }

            const result = await response.json().catch(() => null)

            if (!response.ok || !result?.success) {
              throw new Error(result?.details || result?.error || 'تعذر تحميل الفروع')
            }

            return Array.isArray(result.branches) ? result.branches : []
          },
          {
            ttlMs: BRANCHES_CACHE_TTL_MS,
            force,
            logLabel: 'fetch branches',
            protectedResource: true,
          }
        )

        if (!cancelled) {
          setBranches(nextBranches)
        }
      } catch (error) {
        if (!cancelled && isProtectedResourceAuthError(error)) {
          if (typeof window !== 'undefined' && window.location.pathname.startsWith('/pos')) {
            window.location.href = '/pos/login'
            return
          }
        }

        if (!cancelled && cachedBranches.length === 0) {
          setBranches([])
        }
      } finally {
        if (!cancelled) {
          setLoadingBranches(false)
        }
      }
    }

    const handleOptionsUpdated = () => {
      void loadBranches(true)
    }

    const handleWindowFocus = () => {
      if (!isClientResourceFresh(BRANCHES_CACHE_KEY, BRANCHES_CACHE_TTL_MS)) {
        void loadBranches(true)
      }
    }

    if (!isClientResourceFresh(BRANCHES_CACHE_KEY, BRANCHES_CACHE_TTL_MS)) {
      void loadBranches()
    } else {
      setLoadingBranches(false)
    }

    window.addEventListener(
      ADMIN_BRANCH_OPTIONS_UPDATED_EVENT,
      handleOptionsUpdated
    )
    window.addEventListener('focus', handleWindowFocus)

    return () => {
      cancelled = true
      window.removeEventListener(
        ADMIN_BRANCH_OPTIONS_UPDATED_EVENT,
        handleOptionsUpdated
      )
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [isSystemAdmin, shouldFetch])

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
        branches.find((branch) => branch.id === actorBranchId)?.name ||
        'الفرع الحالي'
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

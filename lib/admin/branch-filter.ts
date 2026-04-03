import type { AuthScopeType } from '@/lib/auth-profile'

export const ADMIN_BRANCH_FILTER_ALL = 'all'
export const ADMIN_BRANCH_FILTER_STORAGE_KEY = 'admin_branch_filter'

export function normalizeAdminBranchFilterValue(value: unknown) {
  if (typeof value !== 'string') {
    return ADMIN_BRANCH_FILTER_ALL
  }

  const trimmed = value.trim()

  return trimmed || ADMIN_BRANCH_FILTER_ALL
}

export function getStoredAdminBranchFilter() {
  if (typeof window === 'undefined') {
    return ADMIN_BRANCH_FILTER_ALL
  }

  return normalizeAdminBranchFilterValue(
    window.localStorage.getItem(ADMIN_BRANCH_FILTER_STORAGE_KEY)
  )
}

export function setStoredAdminBranchFilter(value: string) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    ADMIN_BRANCH_FILTER_STORAGE_KEY,
    normalizeAdminBranchFilterValue(value)
  )
}

export function resolveEffectiveBranchFilter(
  scopeType: AuthScopeType | null,
  actorBranchId: string | null,
  selectedBranchId: string
) {
  if (scopeType === 'system') {
    const normalizedSelected = normalizeAdminBranchFilterValue(selectedBranchId)

    return normalizedSelected === ADMIN_BRANCH_FILTER_ALL
      ? null
      : normalizedSelected
  }

  return actorBranchId
}

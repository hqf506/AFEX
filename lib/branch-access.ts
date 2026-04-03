import type { AuthScopeType } from '@/lib/auth-profile'

export function shouldFilterByBranch(
  scopeType: AuthScopeType | null | undefined,
  branchId: string | null | undefined
) {
  return scopeType !== 'system' && !!branchId
}

export function isBranchScopedWithoutBranchId(
  scopeType: AuthScopeType | null | undefined,
  branchId: string | null | undefined
) {
  return scopeType !== 'system' && !branchId
}

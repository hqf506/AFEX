import type { AppRole } from '@/lib/app-roles'

export type AuthScopeType = 'system' | 'branch'

export type BranchAwareProfileFields = {
  branch_id: string | null
  scope_type: AuthScopeType
}

export function resolveAuthScopeType(
  role: AppRole | null | undefined,
  branchId: string | null | undefined
): AuthScopeType {
  if (role === 'admin' && !branchId) {
    return 'system'
  }

  return 'branch'
}

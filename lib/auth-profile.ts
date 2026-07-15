export type AuthScopeType = 'system' | 'branch'

export type BranchAwareProfileFields = {
  branch_id: string | null
  scope_type: AuthScopeType
}

export function resolveAuthScopeType(
  role: string | null | undefined
): AuthScopeType {
  if (role === 'admin' || role === 'manager' || role === 'owner') {
    return 'system'
  }

  return 'branch'
}

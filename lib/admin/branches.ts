import type { AuthScopeType } from '@/lib/auth-profile'
import type { AppRole } from '@/lib/app-roles'

export type AdminBranchRecord = {
  id: string
  code: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export const BRANCH_CODE_PATTERN = /^[a-z0-9-]{2,32}$/

export function normalizeAdminBranchId(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeAdminBranchCode(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function normalizeAdminBranchName(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function isValidAdminBranchCode(value: string) {
  return BRANCH_CODE_PATTERN.test(value)
}

export function requiresAssignedBranch(role: AppRole) {
  return role !== 'admin'
}

export function isSystemScopedAdmin(scopeType: AuthScopeType) {
  return scopeType === 'system'
}

export function canManageBranchScopedTarget(
  actorScopeType: AuthScopeType,
  actorBranchId: string | null,
  targetBranchId: string | null
) {
  if (actorScopeType === 'system') {
    return true
  }

  return Boolean(actorBranchId) && actorBranchId === targetBranchId
}

export function resolveManagedUserBranchId(
  actorScopeType: AuthScopeType,
  actorBranchId: string | null,
  requestedBranchId: string | null
) {
  if (actorScopeType === 'system') {
    return requestedBranchId
  }

  return actorBranchId
}

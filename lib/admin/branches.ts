import type { AuthScopeType } from '@/lib/auth-profile'
import type { AppRole } from '@/lib/app-roles'

export type AdminBranchRecord = {
  id: string
  code: string
  name: string
  display_store_name: string | null
  display_branch_name: string | null
  map_url: string | null
  is_active: boolean
  deleted_at: string | null
  deleted_by: string | null
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

export function normalizeAdminBranchDisplayName(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeAdminBranchMapUrl(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function isValidAdminBranchCode(value: string) {
  return BRANCH_CODE_PATTERN.test(value)
}

export function requiresAssignedBranch(role: AppRole | string) {
  return role === 'employee' || role === 'cashier'
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

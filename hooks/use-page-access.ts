'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthState } from '@/components/auth-state-provider'
import { getRoleLabel, type AppRole } from '@/lib/app-roles'
import { type AuthScopeType } from '@/lib/auth-profile'
import { isFullAdmin } from '@/lib/permissions'

export type { AppRole }

export type UsePageAccessOptions = {
  allowedRoles?: AppRole[]
  redirectIfNoUser?: string
  redirectIfForbidden?: string
}

export type UsePageAccessResult = {
  loading: boolean
  authLoading: boolean
  authError: string | null
  authStatus: 'loading' | 'authenticated' | 'unauthenticated'
  allowed: boolean
  userRole: AppRole | null
  branchId: string | null
  tenantId: string | null
  scopeType: AuthScopeType | null
  roleLabel: string
}

const DEFAULT_REDIRECT_IF_NO_USER = '/login'
const DEFAULT_REDIRECT_IF_FORBIDDEN = '/'

function resolvePageAccessOptions(
  allowedRolesOrOptions: AppRole[] | UsePageAccessOptions,
  redirectIfNoUser: string,
  redirectIfForbidden: string
) {
  const allowedRoles = Array.isArray(allowedRolesOrOptions)
    ? allowedRolesOrOptions
    : allowedRolesOrOptions.allowedRoles || []

  return {
    allowedRoles,
    redirectIfNoUser: Array.isArray(allowedRolesOrOptions)
      ? redirectIfNoUser
      : allowedRolesOrOptions.redirectIfNoUser || redirectIfNoUser,
    redirectIfForbidden: Array.isArray(allowedRolesOrOptions)
      ? redirectIfForbidden
      : allowedRolesOrOptions.redirectIfForbidden || redirectIfForbidden,
  }
}

export function usePageAccess(
  allowedRolesOrOptions: AppRole[] | UsePageAccessOptions = [],
  redirectIfNoUser = DEFAULT_REDIRECT_IF_NO_USER,
  redirectIfForbidden = DEFAULT_REDIRECT_IF_FORBIDDEN
): UsePageAccessResult {
  const router = useRouter()
  const pathname = usePathname()
  const authState = useAuthState()
  const {
    allowedRoles,
    redirectIfNoUser: resolvedRedirectIfNoUser,
    redirectIfForbidden: resolvedRedirectIfForbidden,
  } = resolvePageAccessOptions(
    allowedRolesOrOptions,
    redirectIfNoUser,
    redirectIfForbidden
  )
  const allowedRolesKey = allowedRoles.join('|')
  const stableAllowedRoles = allowedRolesKey
    ? (allowedRolesKey.split('|') as AppRole[])
    : []

  const profile = authState.profile
  const loading = authState.loading
  const userRole = profile?.role || null
  const userRoleValue = userRole ? String(userRole) : ''
  const branchId = profile?.branch_id || null
  const tenantId = profile?.tenant_id || null
  const scopeType = profile?.scope_type || null
  const roleAllowed =
    stableAllowedRoles.length === 0 ||
    (userRole ? stableAllowedRoles.includes(userRole) : false) ||
    (stableAllowedRoles.includes('admin') && isFullAdmin(userRoleValue))
  const allowed =
    Boolean(profile) &&
    roleAllowed

  useEffect(() => {
    const stableAllowedRolesForEffect = allowedRolesKey
      ? (allowedRolesKey.split('|') as AppRole[])
      : []
    const userRoleValueForEffect = userRole ? String(userRole) : ''
    const roleAllowedForEffect =
      stableAllowedRolesForEffect.length === 0 ||
      (userRole ? stableAllowedRolesForEffect.includes(userRole) : false) ||
      (stableAllowedRolesForEffect.includes('admin') &&
        isFullAdmin(userRoleValueForEffect))

    if (loading) {
      return
    }

    if (!profile) {
      router.replace(resolvedRedirectIfNoUser)
      return
    }

    if (
      stableAllowedRolesForEffect.length > 0 &&
      userRole &&
      !roleAllowedForEffect
    ) {
      router.replace(resolvedRedirectIfForbidden)
    }
  }, [
    allowedRolesKey,
    loading,
    pathname,
    profile,
    resolvedRedirectIfForbidden,
    resolvedRedirectIfNoUser,
    router,
    userRole,
  ])

  return {
    loading,
    authLoading: loading,
    authError: authState.error,
    authStatus: authState.status,
    allowed,
    userRole,
    branchId,
    tenantId,
    scopeType,
    roleLabel: getRoleLabel(userRole),
  }
}

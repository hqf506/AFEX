'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getRoleLabel, type AppRole } from '@/lib/app-roles'
import {
  resolveAuthScopeType,
  type AuthScopeType,
} from '@/lib/auth-profile'
import { supabase } from '@/lib/supabase/client'

export type { AppRole }

export type UsePageAccessOptions = {
  allowedRoles?: AppRole[]
  redirectIfNoUser?: string
  redirectIfForbidden?: string
}

export type UsePageAccessResult = {
  loading: boolean
  authLoading: boolean
  allowed: boolean
  userRole: AppRole | null
  branchId: string | null
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
  const mountedRef = useRef(true)
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

  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [userRole, setUserRole] = useState<AppRole | null>(null)
  const [branchId, setBranchId] = useState<string | null>(null)
  const [scopeType, setScopeType] = useState<AuthScopeType | null>(null)

  useEffect(() => {
    mountedRef.current = true

    async function checkAccess() {
      const stableAllowedRoles = allowedRolesKey
        ? (allowedRolesKey.split('|') as AppRole[])
        : []

      try {
        if (mountedRef.current) {
          setLoading(true)
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError || !session?.user) {
          if (mountedRef.current) {
            setAllowed(false)
            setUserRole(null)
            setLoading(false)
            router.replace(resolvedRedirectIfNoUser)
          }
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, is_active, branch_id')
          .eq('id', session.user.id)
          .single()

        if (profileError || !profile) {
          if (mountedRef.current) {
            setAllowed(false)
            setUserRole(null)
            setBranchId(null)
            setScopeType(null)
            setLoading(false)
            await supabase.auth.signOut()
            router.replace(resolvedRedirectIfNoUser)
          }
          return
        }

        if (!profile.is_active) {
          await supabase.auth.signOut()

          if (mountedRef.current) {
            setAllowed(false)
            setUserRole(null)
            setBranchId(null)
            setScopeType(null)
            setLoading(false)
            router.replace('/login')
          }
          return
        }

        const role = profile.role as AppRole

        if (!role) {
          if (mountedRef.current) {
            setAllowed(false)
            setUserRole(null)
            setBranchId(null)
            setScopeType(null)
            setLoading(false)
            router.replace(resolvedRedirectIfForbidden)
          }
          return
        }

        if (
          stableAllowedRoles.length > 0 &&
          !stableAllowedRoles.includes(role)
        ) {
          if (mountedRef.current) {
            setAllowed(false)
            setUserRole(role)
            setBranchId(
              typeof profile.branch_id === 'string' ? profile.branch_id : null
            )
            setScopeType(
              resolveAuthScopeType(
                role,
                typeof profile.branch_id === 'string' ? profile.branch_id : null
              )
            )
            setLoading(false)
            router.replace(resolvedRedirectIfForbidden)
          }
          return
        }

        const resolvedBranchId =
          typeof profile.branch_id === 'string' ? profile.branch_id : null

        if (mountedRef.current) {
          setUserRole(role)
          setBranchId(resolvedBranchId)
          setScopeType(resolveAuthScopeType(role, resolvedBranchId))
          setAllowed(true)
          setLoading(false)
        }
      } catch (error) {
        console.error('Page access error:', error)
        if (mountedRef.current) {
          setAllowed(false)
          setUserRole(null)
          setBranchId(null)
          setScopeType(null)
          setLoading(false)
          router.replace(resolvedRedirectIfForbidden)
        }
      }
    }

    checkAccess()

    return () => {
      mountedRef.current = false
    }
  }, [
    allowedRolesKey,
    pathname,
    redirectIfForbidden,
    redirectIfNoUser,
    resolvedRedirectIfForbidden,
    resolvedRedirectIfNoUser,
    router,
  ])

  return {
    loading,
    authLoading: loading,
    allowed,
    userRole,
    branchId,
    scopeType,
    roleLabel: getRoleLabel(userRole),
  }
}

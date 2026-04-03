'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getRoleLabel, type AppRole } from '@/lib/app-roles'
import { supabase } from '@/lib/supabase/client'

export type { AppRole }

type UsePageAccessOptions = {
  allowedRoles?: AppRole[]
  redirectIfNoUser?: string
  redirectIfForbidden?: string
}

type UsePageAccessResult = {
  loading: boolean
  authLoading: boolean
  allowed: boolean
  userRole: AppRole | null
  roleLabel: string
}

export function usePageAccess(
  allowedRolesOrOptions: AppRole[] | UsePageAccessOptions = [],
  redirectIfNoUser = '/login',
  redirectIfForbidden = '/'
): UsePageAccessResult {
  const router = useRouter()
  const pathname = usePathname()
  const mountedRef = useRef(true)
  const allowedRoles = Array.isArray(allowedRolesOrOptions)
    ? allowedRolesOrOptions
    : allowedRolesOrOptions.allowedRoles || []
  const resolvedRedirectIfNoUser = Array.isArray(allowedRolesOrOptions)
    ? redirectIfNoUser
    : allowedRolesOrOptions.redirectIfNoUser || redirectIfNoUser
  const resolvedRedirectIfForbidden = Array.isArray(allowedRolesOrOptions)
    ? redirectIfForbidden
    : allowedRolesOrOptions.redirectIfForbidden || redirectIfForbidden
  const allowedRolesKey = allowedRoles.join('|')

  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [userRole, setUserRole] = useState<AppRole | null>(null)

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
          .select('role, is_active')
          .eq('id', session.user.id)
          .single()

        if (profileError || !profile) {
          if (mountedRef.current) {
            setAllowed(false)
            setUserRole(null)
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
            setLoading(false)
            router.replace(resolvedRedirectIfForbidden)
          }
          return
        }

        if (mountedRef.current) {
          setUserRole(role)
          setAllowed(true)
          setLoading(false)
        }
      } catch (error) {
        console.error('Page access error:', error)
        if (mountedRef.current) {
          setAllowed(false)
          setUserRole(null)
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
    roleLabel: getRoleLabel(userRole),
  }
}

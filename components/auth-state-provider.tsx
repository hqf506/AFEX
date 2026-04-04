'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { getCurrentUserProfile, type CurrentUserProfile } from '@/lib/auth'
import { supabase } from '@/lib/supabase/client'

type SharedAuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

type SharedAuthState = {
  status: SharedAuthStatus
  loading: boolean
  profile: CurrentUserProfile | null
  refreshAuthState: () => Promise<void>
}

const AuthStateContext = createContext<SharedAuthState | null>(null)
const AUTH_STATE_CACHE_KEY = 'lf_shared_auth_profile'

function readCachedAuthProfile(): CurrentUserProfile | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawValue = window.sessionStorage.getItem(AUTH_STATE_CACHE_KEY)

    if (!rawValue) {
      return null
    }

    return JSON.parse(rawValue) as CurrentUserProfile
  } catch {
    return null
  }
}

function writeCachedAuthProfile(profile: CurrentUserProfile | null) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (!profile) {
      window.sessionStorage.removeItem(AUTH_STATE_CACHE_KEY)
      return
    }

    window.sessionStorage.setItem(AUTH_STATE_CACHE_KEY, JSON.stringify(profile))
  } catch {
    // Ignore session storage failures and keep auth flow working.
  }
}

async function resolveSharedAuthProfile(): Promise<CurrentUserProfile | null> {
  const profile = await getCurrentUserProfile()

  if (!profile) {
    return null
  }

  if (!profile.is_active) {
    await supabase.auth.signOut()
    return null
  }

  return profile
}

export function AuthStateProvider({ children }: { children: ReactNode }) {
  const mountedRef = useRef(true)
  const requestIdRef = useRef(0)
  const [status, setStatus] = useState<SharedAuthStatus>('loading')
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null)

  const refreshAuthState = useCallback(async () => {
    const requestId = ++requestIdRef.current

    if (mountedRef.current) {
      setStatus((current) => (current === 'authenticated' ? current : 'loading'))
    }

    try {
      const nextProfile = await resolveSharedAuthProfile()

      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return
      }

      setProfile(nextProfile)
      setStatus(nextProfile ? 'authenticated' : 'unauthenticated')
      writeCachedAuthProfile(nextProfile)
    } catch (error) {
      console.error('Shared auth state error:', error)

      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return
      }

      setProfile(null)
      setStatus('unauthenticated')
      writeCachedAuthProfile(null)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const cachedProfile = readCachedAuthProfile()
    let cachedProfileTimeout: number | null = null

    if (cachedProfile) {
      cachedProfileTimeout = window.setTimeout(() => {
        if (!mountedRef.current) {
          return
        }

        setProfile(cachedProfile)
        setStatus('authenticated')
      }, 0)
    }

    const initialRefreshTimeout = window.setTimeout(() => {
      void refreshAuthState()
    }, 0)

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (!mountedRef.current) {
          return
        }

        if (!session) {
          requestIdRef.current += 1
          setProfile(null)
          setStatus('unauthenticated')
          writeCachedAuthProfile(null)
          return
        }

        void refreshAuthState()
      }
    )

    return () => {
      mountedRef.current = false
      if (cachedProfileTimeout !== null) {
        window.clearTimeout(cachedProfileTimeout)
      }
      window.clearTimeout(initialRefreshTimeout)
      subscription.unsubscribe()
    }
  }, [refreshAuthState])

  const value = useMemo<SharedAuthState>(
    () => ({
      status,
      loading: status === 'loading',
      profile,
      refreshAuthState,
    }),
    [profile, refreshAuthState, status]
  )

  return (
    <AuthStateContext.Provider value={value}>
      {children}
    </AuthStateContext.Provider>
  )
}

export function useAuthState() {
  const context = useContext(AuthStateContext)

  if (!context) {
    throw new Error('useAuthState must be used within AuthStateProvider')
  }

  return context
}

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
import {
  getCurrentUserProfile,
  isSupabaseAuthLockError,
  type CurrentUserProfile,
} from '@/lib/auth'
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
  const refreshInFlightRef = useRef<Promise<void> | null>(null)
  const refreshAuthStateRef = useRef<(() => Promise<void>) | null>(null)
  const retryTimeoutRef = useRef<number | null>(null)
  const profileRef = useRef<CurrentUserProfile | null>(null)
  const statusRef = useRef<SharedAuthStatus>('loading')
  const [status, setStatus] = useState<SharedAuthStatus>('loading')
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null)

  const refreshAuthState = useCallback(() => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current
    }

    const requestId = ++requestIdRef.current

    if (mountedRef.current) {
      setStatus((current) => (current === 'authenticated' ? current : 'loading'))
    }

    const refreshPromise = (async () => {
      try {
        const nextProfile = await resolveSharedAuthProfile()

        if (!mountedRef.current || requestId !== requestIdRef.current) {
          return
        }

        profileRef.current = nextProfile
        statusRef.current = nextProfile ? 'authenticated' : 'unauthenticated'
        setProfile(nextProfile)
        setStatus(statusRef.current)
        writeCachedAuthProfile(nextProfile)
      } catch (error) {
        if (!mountedRef.current || requestId !== requestIdRef.current) {
          return
        }

        if (isSupabaseAuthLockError(error)) {
          if (profileRef.current) {
            setProfile(profileRef.current)
            setStatus('authenticated')
            statusRef.current = 'authenticated'
            return
          }

          if (retryTimeoutRef.current === null) {
            retryTimeoutRef.current = window.setTimeout(() => {
              retryTimeoutRef.current = null

              if (mountedRef.current) {
                void refreshAuthStateRef.current?.()
              }
            }, 75)
          }

          return
        }

        console.error('Shared auth state error:', error)
        profileRef.current = null
        statusRef.current = 'unauthenticated'
        setProfile(null)
        setStatus('unauthenticated')
        writeCachedAuthProfile(null)
      }
    })().finally(() => {
      if (refreshInFlightRef.current === refreshPromise) {
        refreshInFlightRef.current = null
      }
    })

    refreshInFlightRef.current = refreshPromise
    return refreshPromise
  }, [])

  useEffect(() => {
    refreshAuthStateRef.current = refreshAuthState
  }, [refreshAuthState])

  useEffect(() => {
    profileRef.current = profile
    statusRef.current = status
  }, [profile, status])

  useEffect(() => {
    mountedRef.current = true
    const cachedProfile = readCachedAuthProfile()
    let cachedProfileTimeout: number | null = null

    if (cachedProfile) {
      cachedProfileTimeout = window.setTimeout(() => {
        if (!mountedRef.current) {
          return
        }

        profileRef.current = cachedProfile
        statusRef.current = 'authenticated'
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
          profileRef.current = null
          statusRef.current = 'unauthenticated'
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

      if (retryTimeoutRef.current !== null) {
        window.clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
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

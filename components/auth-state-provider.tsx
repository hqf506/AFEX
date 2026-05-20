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
  clearCurrentUserProfileCache,
  getCurrentUserProfile,
  isSupabaseAuthLockError,
  primeCurrentUserProfileCache,
  type CurrentUserProfile,
} from '@/lib/auth'
import { resetProtectedResourceUnauthorized } from '@/lib/client-resource-cache'
import { supabase } from '@/lib/supabase/client'

type SharedAuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

type SharedAuthState = {
  status: SharedAuthStatus
  loading: boolean
  profile: CurrentUserProfile | null
  error: string | null
  refreshAuthState: () => Promise<void>
}

const AuthStateContext = createContext<SharedAuthState | null>(null)
const AUTH_STATE_CACHE_KEY = 'lf_shared_auth_profile'
const AUTH_BOOTSTRAP_TIMEOUT_MS = 7000
const AUTH_LOCK_RETRY_DELAY_MS = 75
const AUTH_LOCK_MAX_RETRIES = 6

type CachedAuthProfile = {
  profile: CurrentUserProfile
  userId: string
}

function logPosAuthDebug(message: string, details: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') {
    return
  }

  if (!window.location.pathname.startsWith('/pos')) {
    return
  }

  console.info('[POS AUTH DEBUG]', message, {
    pathname: window.location.pathname,
    origin: window.location.origin,
    userAgent: window.navigator.userAgent,
    ...details,
  })
}

function redirectToPosLoginIfNeeded() {
  if (typeof window === 'undefined') {
    return
  }

  const pathname = window.location.pathname

  if (pathname.startsWith('/pos') && !pathname.startsWith('/pos/login')) {
    window.location.href = '/pos/login'
  }
}

function createAuthTimeoutError() {
  const error = new Error('AUTH_BOOTSTRAP_TIMEOUT')
  error.name = 'AuthBootstrapTimeoutError'
  return error
}

function isAuthTimeoutError(error: unknown) {
  return error instanceof Error && error.name === 'AuthBootstrapTimeoutError'
}

function withAuthTimeout<T>(promise: Promise<T>, timeoutMs = AUTH_BOOTSTRAP_TIMEOUT_MS) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(createAuthTimeoutError())
    }, timeoutMs)

    promise
      .then((value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      })
      .catch((error) => {
        window.clearTimeout(timeoutId)
        reject(error)
      })
  })
}

function readCachedAuthProfile(): CachedAuthProfile | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawValue = window.sessionStorage.getItem(AUTH_STATE_CACHE_KEY)

    if (!rawValue) {
      return null
    }

    const parsedValue = JSON.parse(rawValue) as
      | CachedAuthProfile
      | CurrentUserProfile

    if (
      parsedValue &&
      typeof parsedValue === 'object' &&
      'profile' in parsedValue &&
      parsedValue.profile &&
      typeof parsedValue.userId === 'string'
    ) {
      return parsedValue
    }

    if (
      parsedValue &&
      typeof parsedValue === 'object' &&
      'id' in parsedValue &&
      typeof parsedValue.id === 'string'
    ) {
      return {
        profile: parsedValue as CurrentUserProfile,
        userId: parsedValue.id,
      }
    }

    return null
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

    const payload: CachedAuthProfile = {
      profile,
      userId: profile.id,
    }

    window.sessionStorage.setItem(AUTH_STATE_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore session storage failures and keep auth flow working.
  }
}

type SessionUserSnapshot = {
  id: string
  email?: string
}

function toSessionUserSnapshot(session: Session | null): SessionUserSnapshot | null {
  const user = session?.user ?? null

  if (!user) {
    return null
  }

  return {
    id: user.id,
    email: user.email ?? undefined,
  }
}

async function resolveSharedAuthProfile(
  sessionUser: SessionUserSnapshot | null = null
): Promise<CurrentUserProfile | null> {
  const profile = await getCurrentUserProfile({ user: sessionUser })

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
  const lockRetryCountRef = useRef(0)
  const latestSessionUserRef = useRef<SessionUserSnapshot | null>(null)
  const profileRef = useRef<CurrentUserProfile | null>(null)
  const statusRef = useRef<SharedAuthStatus>('loading')
  const [status, setStatus] = useState<SharedAuthStatus>('loading')
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null)
  const [error, setError] = useState<string | null>(null)

  const setUnauthenticatedState = useCallback((nextError: string | null = null) => {
    profileRef.current = null
    clearCurrentUserProfileCache()
    statusRef.current = 'unauthenticated'
    setProfile(null)
    setStatus('unauthenticated')
    setError(nextError)
    writeCachedAuthProfile(null)
  }, [])

  const refreshAuthState = useCallback((sessionUser: SessionUserSnapshot | null = null) => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current
    }

    const requestId = ++requestIdRef.current

    if (mountedRef.current) {
      setError(null)
      setStatus((current) => (current === 'authenticated' ? current : 'loading'))
    }

    const refreshPromise = (async () => {
      try {
        const nextProfile = await withAuthTimeout(
          resolveSharedAuthProfile(sessionUser ?? latestSessionUserRef.current)
        )

        if (!mountedRef.current || requestId !== requestIdRef.current) {
          return
        }

        profileRef.current = nextProfile
        lockRetryCountRef.current = 0
        primeCurrentUserProfileCache(nextProfile)
        statusRef.current = nextProfile ? 'authenticated' : 'unauthenticated'
        if (nextProfile) {
          resetProtectedResourceUnauthorized()
        }
        setProfile(nextProfile)
        setStatus(statusRef.current)
        setError(null)
        writeCachedAuthProfile(nextProfile)
      } catch (error) {
        if (!mountedRef.current || requestId !== requestIdRef.current) {
          return
        }

        if (isAuthTimeoutError(error)) {
          setUnauthenticatedState('timeout')
          redirectToPosLoginIfNeeded()
          return
        }

        if (isSupabaseAuthLockError(error)) {
          lockRetryCountRef.current += 1

          console.warn('[POS AUTH] Auth session refresh hit a temporary lock.', {
            requestId,
            retryCount: lockRetryCountRef.current,
            sessionUserId: sessionUser?.id ?? latestSessionUserRef.current?.id ?? null,
          })

          if (profileRef.current) {
            setProfile(profileRef.current)
            setStatus('authenticated')
            statusRef.current = 'authenticated'
            setError(null)
            return
          }

          if (lockRetryCountRef.current >= AUTH_LOCK_MAX_RETRIES) {
            console.error('[POS AUTH] Auth session refresh exceeded the retry limit.', {
              requestId,
              retryCount: lockRetryCountRef.current,
              sessionUserId: sessionUser?.id ?? latestSessionUserRef.current?.id ?? null,
            })
            setUnauthenticatedState('auth-lock')
            return
          }

          if (retryTimeoutRef.current === null) {
            retryTimeoutRef.current = window.setTimeout(() => {
              retryTimeoutRef.current = null

              if (mountedRef.current) {
                void refreshAuthStateRef.current?.()
              }
            }, AUTH_LOCK_RETRY_DELAY_MS)
          }

          return
        }

        console.error('[POS AUTH] Auth session refresh failed.', {
          requestId,
          sessionUserId: sessionUser?.id ?? latestSessionUserRef.current?.id ?? null,
          error,
        })
        setUnauthenticatedState('auth-error')
      }
    })().finally(() => {
      if (refreshInFlightRef.current === refreshPromise) {
        refreshInFlightRef.current = null
      }
    })

    refreshInFlightRef.current = refreshPromise
    return refreshPromise
  }, [setUnauthenticatedState])

  useEffect(() => {
    refreshAuthStateRef.current = refreshAuthState
  }, [refreshAuthState, setUnauthenticatedState])

  useEffect(() => {
    profileRef.current = profile
    statusRef.current = status
  }, [profile, status])

  useEffect(() => {
    mountedRef.current = true
    let cancelled = false

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (!mountedRef.current) {
          return
        }

        latestSessionUserRef.current = toSessionUserSnapshot(session)
        logPosAuthDebug('auth state changed', {
          event: _event,
          hasSession: Boolean(session),
          userId: session?.user?.id ?? null,
        })

        if (!session) {
          requestIdRef.current += 1
          lockRetryCountRef.current = 0
          setUnauthenticatedState(null)
          redirectToPosLoginIfNeeded()
          return
        }

        if (profileRef.current?.id === session.user.id) {
          primeCurrentUserProfileCache(profileRef.current)
          return
        }

        void refreshAuthState(latestSessionUserRef.current)
      }
    )

    void (async () => {
      const cachedProfileEntry = readCachedAuthProfile()

      try {
        const sessionResponse = await withAuthTimeout<
          Awaited<ReturnType<typeof supabase.auth.getSession>>
        >(supabase.auth.getSession())

        const {
          data: { session },
        } = sessionResponse
        latestSessionUserRef.current = toSessionUserSnapshot(session)
        logPosAuthDebug('bootstrap session resolved', {
          hasSession: Boolean(session),
          userId: session?.user?.id ?? null,
        })

        if (cancelled || !mountedRef.current) {
          return
        }

        if (!session) {
          requestIdRef.current += 1
          lockRetryCountRef.current = 0
          setUnauthenticatedState(null)
          redirectToPosLoginIfNeeded()
          return
        }

        if (
          cachedProfileEntry &&
          cachedProfileEntry.userId === session.user.id
        ) {
          profileRef.current = cachedProfileEntry.profile
          primeCurrentUserProfileCache(cachedProfileEntry.profile)
          statusRef.current = 'authenticated'
          setProfile(cachedProfileEntry.profile)
          setStatus('authenticated')
          setError(null)
          return
        }

        void refreshAuthState(latestSessionUserRef.current)
      } catch (error) {
        if (cancelled || !mountedRef.current) {
          return
        }

        if (isAuthTimeoutError(error)) {
          setUnauthenticatedState('timeout')
          redirectToPosLoginIfNeeded()
          return
        }

        console.error('[POS AUTH] Auth bootstrap failed before profile resolution.', error)
        void refreshAuthState(latestSessionUserRef.current)
      }
    })()

    return () => {
      mountedRef.current = false
      cancelled = true

      if (retryTimeoutRef.current !== null) {
        window.clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
      subscription.unsubscribe()
    }
  }, [refreshAuthState, setUnauthenticatedState])

  const value = useMemo<SharedAuthState>(
    () => ({
      status,
      loading: status === 'loading',
      profile,
      error,
      refreshAuthState,
    }),
    [error, profile, refreshAuthState, status]
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

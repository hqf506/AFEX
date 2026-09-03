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
import { useAuthState } from '@/components/auth-state-provider'
import type { ProfilePresentation } from '@/lib/account/profile-presentation'
import {
  clearProfilePresentationMemoryCache,
  requestProfilePresentation,
} from '@/lib/account/profile-presentation-client'
import { createProfilePresentationScopeKey } from '@/lib/account/profile-presentation-scope'
import { APP_COMPAT_CLIENT_FLAGS } from '@/lib/offline/application-compatibility'
import {
  readPosEmployeePresentationScope,
  subscribeToPosEmployeeSessionChanges,
  type PosEmployeePresentationScope,
} from '@/lib/pos-employee-session'

type ProfilePresentationStatus =
  | 'disabled'
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error'

type ProfilePresentationState = Readonly<{
  status: ProfilePresentationStatus
  data: ProfilePresentation | null
  error: string | null
  refresh: () => Promise<void>
}>

const ProfilePresentationContext =
  createContext<ProfilePresentationState | null>(null)

type HydratedPosEmployeeScope = PosEmployeePresentationScope & {
  hydrated: boolean
}

const EMPTY_POS_EMPLOYEE_SCOPE: HydratedPosEmployeeScope = Object.freeze({
  employeeId: null,
  branchId: null,
  generation: 0,
  hydrated: false,
})

export function ProfilePresentationProvider({ children }: { children: ReactNode }) {
  const authState = useAuthState()
  const requestSequenceRef = useRef(0)
  const [posEmployeeScope, setPosEmployeeScope] =
    useState<HydratedPosEmployeeScope>(EMPTY_POS_EMPLOYEE_SCOPE)
  const [status, setStatus] = useState<ProfilePresentationStatus>(
    APP_COMPAT_CLIENT_FLAGS.profileCallerMigration ? 'idle' : 'disabled'
  )
  const [data, setData] = useState<ProfilePresentation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resolvedScopeKey, setResolvedScopeKey] = useState<string | null>(null)

  const presentationScopeKey = useMemo(() => {
    const profile = authState.profile
    if (
      authState.status !== 'authenticated' ||
      !profile?.id ||
      !profile.tenant_id ||
      !posEmployeeScope.hydrated
    ) {
      return null
    }

    return createProfilePresentationScopeKey({
      primaryProfileId: profile.id,
      tenantId: profile.tenant_id,
      primaryBranchId: profile.branch_id,
      posEmployeeId: posEmployeeScope.employeeId,
      posEmployeeBranchId: posEmployeeScope.branchId,
      posSessionGeneration: posEmployeeScope.generation,
    })
  }, [authState.profile, authState.status, posEmployeeScope])

  useEffect(() => {
    let active = true
    const synchronizePosScope = () => {
      clearProfilePresentationMemoryCache()
      requestSequenceRef.current += 1
      setData(null)
      setError(null)
      setResolvedScopeKey(null)
      const nextScope = readPosEmployeePresentationScope()
      if (active) {
        setPosEmployeeScope({ ...nextScope, hydrated: true })
      }
    }
    const unsubscribe = subscribeToPosEmployeeSessionChanges(
      synchronizePosScope
    )
    const timeoutId = window.setTimeout(synchronizePosScope, 0)

    return () => {
      active = false
      window.clearTimeout(timeoutId)
      unsubscribe()
      clearProfilePresentationMemoryCache()
    }
  }, [])

  const load = useCallback(
    async (force = false) => {
      if (
        !APP_COMPAT_CLIENT_FLAGS.profileCallerMigration ||
        !presentationScopeKey
      ) {
        clearProfilePresentationMemoryCache()
        setData(null)
        setError(null)
        setResolvedScopeKey(null)
        setStatus(
          APP_COMPAT_CLIENT_FLAGS.profileCallerMigration ? 'idle' : 'disabled'
        )
        return
      }

      const sequence = ++requestSequenceRef.current
      setStatus('loading')
      setError(null)
      try {
        const nextData = await requestProfilePresentation(
          presentationScopeKey,
          { force }
        )
        if (sequence !== requestSequenceRef.current) return
        setData(nextData)
        setResolvedScopeKey(presentationScopeKey)
        setStatus('ready')
      } catch (loadError) {
        if (sequence !== requestSequenceRef.current) return
        if (loadError instanceof Error && loadError.name === 'AbortError') return
        setData(null)
        setError('تعذر تحميل بيانات العرض الآمنة.')
        setResolvedScopeKey(presentationScopeKey)
        setStatus('error')
      }
    },
    [presentationScopeKey]
  )

  useEffect(() => {
    requestSequenceRef.current += 1
    clearProfilePresentationMemoryCache()
    if (
      authState.status !== 'authenticated' ||
      !presentationScopeKey
    ) {
      const timeoutId = window.setTimeout(() => {
        setData(null)
        setError(null)
        setResolvedScopeKey(null)
        setStatus(
          APP_COMPAT_CLIENT_FLAGS.profileCallerMigration ? 'idle' : 'disabled'
        )
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }

    const timeoutId = window.setTimeout(() => void load(), 0)
    return () => {
      window.clearTimeout(timeoutId)
      requestSequenceRef.current += 1
      clearProfilePresentationMemoryCache()
    }
  }, [authState.status, load, presentationScopeKey])

  const value = useMemo<ProfilePresentationState>(
    () => {
      const resolutionMatchesCurrentScope =
        resolvedScopeKey === presentationScopeKey
      const scopedStatus =
        status === 'disabled' || !presentationScopeKey
          ? status
          : !resolutionMatchesCurrentScope &&
              (status === 'ready' || status === 'error')
            ? 'loading'
            : status
      return {
        status: scopedStatus,
        data: resolutionMatchesCurrentScope ? data : null,
        error: resolutionMatchesCurrentScope ? error : null,
        refresh: () => load(true),
      }
    },
    [data, error, load, presentationScopeKey, resolvedScopeKey, status]
  )

  return (
    <ProfilePresentationContext.Provider value={value}>
      {children}
    </ProfilePresentationContext.Provider>
  )
}

export function useProfilePresentation() {
  const context = useContext(ProfilePresentationContext)
  if (!context) {
    throw new Error(
      'useProfilePresentation must be used within ProfilePresentationProvider'
    )
  }
  return context
}

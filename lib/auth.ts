import { getRoleLabel, type AppRole } from '@/lib/app-roles'
import {
  resolveAuthScopeType,
  type AuthScopeType,
  type BranchAwareProfileFields,
} from '@/lib/auth-profile'
import { supabase } from '@/lib/supabase/client'

export type CurrentUserProfile = {
  id: string
  email: string
  role: AppRole
  full_name: string
  is_active: boolean
} & BranchAwareProfileFields

export type AuthenticatedUserProfile = CurrentUserProfile

let currentUserProfileRequest: Promise<CurrentUserProfile | null> | null = null

export function isSupabaseAuthLockError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()

  return (
    message.includes('lock:sb-') &&
    (message.includes('stole it') || message.includes('released because another request'))
  )
}

async function fetchCurrentUserProfile(): Promise<CurrentUserProfile | null> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) {
    throw userError
  }

  if (!user) {
    return null
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, role, is_active, branch_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.role) {
    return null
  }

  const branchId =
    typeof profile.branch_id === 'string' ? profile.branch_id : null

  return {
    id: user.id,
    email: user.email || '',
    role: profile.role as AppRole,
    full_name: profile.full_name || '',
    is_active: Boolean(profile.is_active),
    branch_id: branchId,
    scope_type: resolveAuthScopeType(profile.role as AppRole, branchId),
  }
}

export async function getCurrentUserProfile(): Promise<CurrentUserProfile | null> {
  if (currentUserProfileRequest) {
    return currentUserProfileRequest
  }

  currentUserProfileRequest = fetchCurrentUserProfile().finally(() => {
    currentUserProfileRequest = null
  })

  return currentUserProfileRequest
}

export { getRoleLabel }
export type { AuthScopeType, BranchAwareProfileFields }

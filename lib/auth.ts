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
} & BranchAwareProfileFields

export type AuthenticatedUserProfile = CurrentUserProfile

export async function getCurrentUserProfile(): Promise<CurrentUserProfile | null> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return null
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, role, branch_id')
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
    branch_id: branchId,
    scope_type: resolveAuthScopeType(profile.role as AppRole, branchId),
  }
}

export { getRoleLabel }
export type { AuthScopeType, BranchAwareProfileFields }

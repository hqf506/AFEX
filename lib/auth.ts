import { getRoleLabel, type AppRole } from '@/lib/app-roles'
import {
  resolveAuthScopeType,
  type AuthScopeType,
  type BranchAwareProfileFields,
} from '@/lib/auth-profile'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'

export type CurrentUserProfile = {
  id: string
  email: string
  role: AppRole
  full_name: string
  is_active: boolean
  tenant_id: string | null
  tenant_name: string | null
} & BranchAwareProfileFields

export type AuthenticatedUserProfile = CurrentUserProfile

let currentUserProfileRequest: Promise<CurrentUserProfile | null> | null = null
let currentUserProfileCache: CurrentUserProfile | null = null
let currentUserProfileCacheUserId: string | null = null

type ProfileLookupUser = Pick<User, 'id' | 'email'>

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
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError) {
    throw sessionError
  }

  return fetchCurrentUserProfileForUser(session?.user ?? null)
}

async function fetchCurrentUserProfileForUser(
  user: ProfileLookupUser | null
): Promise<CurrentUserProfile | null> {
  const normalizedUser = user ?? null

  if (!normalizedUser) {
    currentUserProfileCache = null
    currentUserProfileCacheUserId = null
    return null
  }

  if (
    currentUserProfileCache &&
    currentUserProfileCacheUserId &&
    currentUserProfileCacheUserId === normalizedUser.id
  ) {
    return currentUserProfileCache
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, role, is_active, branch_id, tenant_id, tenant_name')
    .eq('id', normalizedUser.id)
    .single()

  if (profileError || !profile?.role) {
    currentUserProfileCache = null
    currentUserProfileCacheUserId = normalizedUser.id
    return null
  }

  const branchId =
    typeof profile.branch_id === 'string' ? profile.branch_id : null
  const tenantId =
    typeof profile.tenant_id === 'string' ? profile.tenant_id : null
  let tenantName =
    typeof profile.tenant_name === 'string' && profile.tenant_name.trim()
      ? profile.tenant_name.trim()
      : null

  if (!tenantName && tenantId) {
    const { data: tenantProfile } = await supabase
      .from('profiles')
      .select('tenant_name')
      .eq('tenant_id', tenantId)
      .not('tenant_name', 'is', null)
      .limit(1)
      .maybeSingle()

    tenantName =
      typeof tenantProfile?.tenant_name === 'string' &&
      tenantProfile.tenant_name.trim()
        ? tenantProfile.tenant_name.trim()
        : null
  }

  if (!tenantName && tenantId) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .maybeSingle()

    const tenantRecord =
      tenant && typeof tenant === 'object'
        ? (tenant as Record<string, unknown>)
        : null
    const rawTenantName =
      typeof tenantRecord?.tenant_name === 'string'
        ? tenantRecord.tenant_name
        : typeof tenantRecord?.name === 'string'
          ? tenantRecord.name
          : null

    tenantName = rawTenantName?.trim() || null
  }

  if (process.env.NODE_ENV === 'development') {
    console.info('[POS AUTH] Tenant profile lookup.', {
      tenant_id: tenantId,
      tenant_name: tenantName,
      branch_id: branchId,
      source: profile.tenant_name ? 'profiles.tenant_name' : 'fallback',
    })
  }

  const nextProfile = {
    id: normalizedUser.id,
    email: normalizedUser.email || '',
    role: profile.role as AppRole,
    full_name: profile.full_name || '',
    is_active: Boolean(profile.is_active),
    tenant_id: tenantId,
    tenant_name: tenantName,
    branch_id: branchId,
    scope_type: resolveAuthScopeType(profile.role as AppRole, branchId),
  }

  currentUserProfileCache = nextProfile
  currentUserProfileCacheUserId = normalizedUser.id

  return nextProfile
}

export async function getCurrentUserProfile(
  options?: { user?: ProfileLookupUser | null }
): Promise<CurrentUserProfile | null> {
  if (options && 'user' in options) {
    return fetchCurrentUserProfileForUser(options.user ?? null)
  }

  if (currentUserProfileRequest) {
    return currentUserProfileRequest
  }

  currentUserProfileRequest = fetchCurrentUserProfile().finally(() => {
    currentUserProfileRequest = null
  })

  return currentUserProfileRequest
}

export function primeCurrentUserProfileCache(profile: CurrentUserProfile | null) {
  currentUserProfileCache = profile
  currentUserProfileCacheUserId = profile?.id || null
}

export function clearCurrentUserProfileCache() {
  currentUserProfileRequest = null
  currentUserProfileCache = null
  currentUserProfileCacheUserId = null
}

export { getRoleLabel }
export type { AuthScopeType, BranchAwareProfileFields }

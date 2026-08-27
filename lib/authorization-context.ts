import 'server-only'

import { randomUUID } from 'node:crypto'
import type { User } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { AppRole } from '@/lib/app-roles'
import {
  resolveAuthScopeType,
  type AuthScopeType,
  type BranchAwareProfileFields,
} from '@/lib/auth-profile'
import { isFullAdmin } from '@/lib/permissions'
import { safeErrorDetails } from '@/lib/security/redaction'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  requireVerifiedAuthContext,
  type VerifiedAuthContext,
} from '@/lib/verified-auth-context'
import {
  isPosActorRestrictionRequired,
  POS_ACTOR_COOKIE,
  resolvePosActorSession,
  type EffectivePosActor,
} from '@/lib/pos-actor-session-server'
import {
  createShadowTrustedSyncUploaderContext,
  type TrustedSyncUploaderContext,
} from '@/lib/server/offline/trusted-actor-provenance'

export type AuthorizationCapability =
  | 'admin:full'
  | 'orders:read'
  | 'orders:write'
  | 'pos:access'
  | 'reports:read'
  | 'support:access'

export type AuthorizationProfile = {
  id: string
  role: AppRole
  is_active: boolean
  username: string | null
  full_name: string | null
  contact_email: string | null
  phone: string | null
  tenant_id: string | null
} & BranchAwareProfileFields

export type AuthorizationBranchAccess =
  | {
      mode: 'tenant'
      branchIds: null
    }
  | {
      mode: 'assigned'
      branchIds: string[]
    }

export type VerifiedPosEmployee = {
  id: string
  role: string
  branchId: string | null
  tenantId: string
  source: 'profile' | 'pos_profile'
}

export type AuthorizationContext = {
  correlationId: string
  user: User
  authSessionId: string
  verifiedAuth: VerifiedAuthContext
  profile: AuthorizationProfile
  tenantId: string | null
  role: AppRole
  capabilities: ReadonlySet<AuthorizationCapability>
  branchAccess: AuthorizationBranchAccess
  activeBranchId: string | null
  posEmployee: VerifiedPosEmployee | null
  posActorSession: EffectivePosActor | null
  trustedOfflineSyncContext: TrustedSyncUploaderContext | null
  can: (capability: AuthorizationCapability) => boolean
  canAccessBranch: (branchId: string | null | undefined) => boolean
  verifyPosEmployee: (
    employeeId: string | null | undefined
  ) => Promise<VerifiedPosEmployee | null>
}

type AuthorizationSuccess = {
  ok: true
  response: NextResponse
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  context: AuthorizationContext
}

type AuthorizationFailure = {
  ok: false
  response: NextResponse
}

export type AuthorizationResult = AuthorizationSuccess | AuthorizationFailure

const PROFILE_SELECT =
  'id, role, is_active, username, full_name, contact_email, phone, branch_id, tenant_id'

function resolveCorrelationId(request: NextRequest) {
  const supplied = request.headers.get('x-request-id')?.trim()

  if (supplied && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied)) {
    return supplied
  }

  return randomUUID()
}

function resolveCapabilities(role: string) {
  const capabilities = new Set<AuthorizationCapability>()

  if (isFullAdmin(role)) {
    capabilities.add('admin:full')
    capabilities.add('orders:read')
    capabilities.add('orders:write')
    capabilities.add('pos:access')
    capabilities.add('reports:read')
    capabilities.add('support:access')
    return capabilities
  }

  if (role === 'employee') {
    capabilities.add('orders:read')
    capabilities.add('orders:write')
    capabilities.add('pos:access')
    capabilities.add('reports:read')
    capabilities.add('support:access')
    return capabilities
  }

  if (role === 'cashier') {
    capabilities.add('orders:read')
    capabilities.add('orders:write')
    capabilities.add('pos:access')
  }

  return capabilities
}

function resolveBranchAccess(
  scopeType: AuthScopeType,
  branchId: string | null
): AuthorizationBranchAccess {
  if (scopeType === 'system') {
    return { mode: 'tenant', branchIds: null }
  }

  return {
    mode: 'assigned',
    branchIds: branchId ? [branchId] : [],
  }
}

function roleIsAllowed(role: AppRole, allowedRoles: AppRole[]) {
  return (
    allowedRoles.length === 0 ||
    allowedRoles.includes(role) ||
    (allowedRoles.includes('admin') && isFullAdmin(role))
  )
}

export async function requireAuthorizationContext(
  request: NextRequest,
  allowedRoles: AppRole[] = []
): Promise<AuthorizationResult> {
  const response = NextResponse.next()

  try {
    const supabase = await createSupabaseServerClient()
    const verifiedAuth = await requireVerifiedAuthContext(supabase)
    if (!verifiedAuth) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: 'غير مصرح',
            details: 'يجب تسجيل الدخول أولاً',
          },
          { status: 401 }
        ),
      }
    }

    const user = verifiedAuth.user
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: 'غير مصرح',
            details: 'تعذر التحقق من ملف المستخدم',
          },
          { status: 401 }
        ),
      }
    }

    const underlyingBranchId =
      typeof profile.branch_id === 'string' ? profile.branch_id : null
    const underlyingTenantId =
      typeof profile.tenant_id === 'string' ? profile.tenant_id : null
    const underlyingProfile = {
      ...(profile as Omit<AuthorizationProfile, 'branch_id' | 'scope_type'>),
      branch_id: underlyingBranchId,
      tenant_id: underlyingTenantId,
      scope_type: resolveAuthScopeType(profile.role as AppRole),
    } as AuthorizationProfile

    if (!underlyingProfile.is_active) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: 'الحساب معطل',
            details: 'هذا الحساب غير نشط',
          },
          { status: 403 }
        ),
      }
    }

    const authSessionId = verifiedAuth.sessionId

    const suppliedPosToken = request.cookies.get(POS_ACTOR_COOKIE)?.value
    const effectivePosActor = suppliedPosToken
      ? await resolvePosActorSession(suppliedPosToken, verifiedAuth)
      : null

    const missingCookieRestriction = !suppliedPosToken
      ? await isPosActorRestrictionRequired(verifiedAuth)
      : false

    // A supplied-but-invalid POS token is an ambiguous/revoked authority state.
    // Never fall back to the more privileged organization profile.
    if ((suppliedPosToken && !effectivePosActor) || missingCookieRestriction) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'POS actor session is invalid or revoked' },
          { status: 401 }
        ),
      }
    }

    const typedProfile: AuthorizationProfile = effectivePosActor
      ? {
          id: effectivePosActor.actorId,
          role: effectivePosActor.role,
          is_active: true,
          username: null,
          full_name: null,
          contact_email: null,
          phone: null,
          tenant_id: effectivePosActor.tenantId,
          branch_id: effectivePosActor.branchId,
          scope_type: resolveAuthScopeType(effectivePosActor.role),
        }
      : underlyingProfile

    if (!roleIsAllowed(typedProfile.role, allowedRoles)) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: 'لا تملك صلاحية الوصول',
            details: 'صلاحية المستخدم لا تسمح بتنفيذ هذا الإجراء',
          },
          { status: 403 }
        ),
      }
    }

    const branchAccess = resolveBranchAccess(
      typedProfile.scope_type,
      typedProfile.branch_id
    )
    const tenantId = typedProfile.tenant_id
    const capabilities = resolveCapabilities(String(typedProfile.role))

    const canAccessBranch = (candidateBranchId: string | null | undefined) => {
      if (!candidateBranchId || !tenantId) {
        return false
      }

      return (
        branchAccess.mode === 'tenant' ||
        branchAccess.branchIds.includes(candidateBranchId)
      )
    }

    const verifyPosEmployee = async (
      employeeId: string | null | undefined
    ): Promise<VerifiedPosEmployee | null> => {
      if (!employeeId || !tenantId) {
        return null
      }

      const [profileResult, posProfileResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, role, branch_id, tenant_id, is_active')
          .eq('id', employeeId)
          .eq('tenant_id', tenantId)
          .maybeSingle(),
        supabase
          .from('pos_profiles')
          .select('id, role, branch_id, tenant_id, is_active')
          .eq('id', employeeId)
          .eq('tenant_id', tenantId)
          .maybeSingle(),
      ])

      const source = profileResult.data
        ? { row: profileResult.data, type: 'profile' as const }
        : posProfileResult.data
          ? { row: posProfileResult.data, type: 'pos_profile' as const }
          : null

      if (!source || source.row.is_active !== true) {
        return null
      }

      const employeeBranchId =
        typeof source.row.branch_id === 'string' ? source.row.branch_id : null

      if (
        branchAccess.mode === 'assigned' &&
        employeeBranchId !== typedProfile.branch_id
      ) {
        return null
      }

      return {
        id: source.row.id,
        role: source.row.role,
        branchId: employeeBranchId,
        tenantId,
        source: source.type,
      }
    }

    return {
      ok: true,
      response,
      supabase,
      context: {
        correlationId: resolveCorrelationId(request),
        user,
        authSessionId,
        verifiedAuth,
        profile: typedProfile,
        tenantId,
        role: typedProfile.role,
        capabilities,
        branchAccess,
        activeBranchId: typedProfile.branch_id,
        posEmployee: effectivePosActor
          ? {
              id: effectivePosActor.actorId,
              role: effectivePosActor.role,
              branchId: effectivePosActor.branchId,
              tenantId: effectivePosActor.tenantId,
              source: 'pos_profile',
            }
          : null,
        posActorSession: effectivePosActor,
        trustedOfflineSyncContext: effectivePosActor
          ? createShadowTrustedSyncUploaderContext({
              verifiedAuth,
              effectivePosActor,
            })
          : null,
        can: (capability) => capabilities.has(capability),
        canAccessBranch,
        verifyPosEmployee,
      },
    }
  } catch (error) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'فشل التحقق الأمني',
          ...safeErrorDetails(error, 'تعذر التحقق الأمني'),
        },
        { status: 500 }
      ),
    }
  }
}

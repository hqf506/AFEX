import { NextRequest, NextResponse } from 'next/server'
import type { AppRole } from '@/lib/app-roles'
import {
  type AuthScopeType,
  type BranchAwareProfileFields,
} from '@/lib/auth-profile'
import {
  requireAuthorizationContext,
  type AuthorizationContext,
  type AuthorizationProfile,
} from '@/lib/authorization-context'
import { isFullAdmin } from '@/lib/permissions'

export type ApiAuthProfile = AuthorizationProfile

type ApiAuthSuccess = {
  ok: true
  response: NextResponse
  supabase: Extract<
    Awaited<ReturnType<typeof requireAuthorizationContext>>,
    { ok: true }
  >['supabase']
  user: AuthorizationContext['user']
  profile: ApiAuthProfile
  context: AuthorizationContext
}

type ApiAuthFailure = {
  ok: false
  response: NextResponse
}

export type ApiAuthResult = ApiAuthSuccess | ApiAuthFailure

export async function requireApiAuth(
  request: NextRequest,
  allowedRoles: AppRole[] = []
): Promise<ApiAuthResult> {
  const result = await requireAuthorizationContext(request, allowedRoles)

  if (!result.ok) {
    return result
  }

  if (
    request.nextUrl.pathname.startsWith('/api/admin/') &&
    result.context.posEmployee &&
    !isFullAdmin(result.context.role)
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Effective POS actor is not authorized for this Admin API.' },
        { status: 403 }
      ),
    }
  }

  return {
    ok: true,
    response: result.response,
    supabase: result.supabase,
    user: result.context.user,
    profile: result.context.profile,
    context: result.context,
  }
}

export function withAuthCookies(
  authResponse: NextResponse,
  finalResponse: NextResponse
) {
  for (const cookie of authResponse.cookies.getAll()) {
    finalResponse.cookies.set(cookie)
  }

  return finalResponse
}

export type { AuthScopeType, BranchAwareProfileFields }

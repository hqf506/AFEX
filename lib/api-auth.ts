import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import type { AppRole } from '@/lib/app-roles'
import {
  resolveAuthScopeType,
  type AuthScopeType,
  type BranchAwareProfileFields,
} from '@/lib/auth-profile'
import { isFullAdmin } from '@/lib/permissions'
import { safeErrorDetails } from '@/lib/security/redaction'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type ApiAuthProfile = {
  id: string
  role: AppRole
  is_active: boolean
  username: string | null
  full_name: string | null
  tenant_id: string | null
} & BranchAwareProfileFields

type ApiAuthSuccess = {
  ok: true
  response: NextResponse
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  user: User
  profile: ApiAuthProfile
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
  const response = NextResponse.next()

  try {
    const supabase = await createSupabaseServerClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
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

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, is_active, username, full_name, branch_id, tenant_id')
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

    const branchId =
      typeof profile.branch_id === 'string' ? profile.branch_id : null
    const tenantId =
      typeof profile.tenant_id === 'string' ? profile.tenant_id : null

    const typedProfile = {
      ...(profile as Omit<ApiAuthProfile, 'branch_id' | 'scope_type'>),
      branch_id: branchId,
      tenant_id: tenantId,
      scope_type: resolveAuthScopeType(profile.role as AppRole, branchId),
    } as ApiAuthProfile
    const profileRole = String(typedProfile.role)
    const roleAllowed =
      allowedRoles.length === 0 ||
      allowedRoles.includes(typedProfile.role) ||
      (allowedRoles.includes('admin') && isFullAdmin(profileRole))

    if (!typedProfile.is_active) {
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

    if (
      allowedRoles.length > 0 &&
      !roleAllowed
    ) {
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

    return {
      ok: true,
      response,
      supabase,
      user,
      profile: typedProfile,
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

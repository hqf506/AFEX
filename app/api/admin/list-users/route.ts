import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { shouldFilterByBranch } from '@/lib/branch-access'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      const response = NextResponse.json({
        success: true,
        users: [],
      })

      return withAuthCookies(auth.response, response)
    }

    if (auth.profile.scope_type === 'branch' && !auth.profile.branch_id) {
      const response = NextResponse.json({
        success: true,
        users: [],
      })

      return withAuthCookies(auth.response, response)
    }

    let profilesQuery = supabaseAdmin
      .from('profiles')
      .select(
        'id, tenant_id, full_name, username, role, is_active, branch_id, created_at, updated_at'
      )
      .order('username', { ascending: true })

    profilesQuery = applyTenantFilter(profilesQuery, tenantId)

    if (
      shouldFilterByBranch(auth.profile.scope_type, auth.profile.branch_id)
    ) {
      profilesQuery = profilesQuery.eq('branch_id', auth.profile.branch_id as string)
    }

    const { data: profiles, error } = await profilesQuery

    if (error) {
      const response = NextResponse.json(
        {
          error: 'تعذر تحميل المستخدمين',
          details: error.message,
        },
        { status: 500 }
      )

      return withAuthCookies(auth.response, response)
    }

    let posProfilesQuery = supabaseAdmin
      .from('pos_profiles')
      .select(
        'id, tenant_id, branch_id, username, full_name, role, is_active, created_by, created_at, updated_at'
      )
      .eq('tenant_id', tenantId)
      .order('username', { ascending: true })

    if (
      shouldFilterByBranch(auth.profile.scope_type, auth.profile.branch_id)
    ) {
      posProfilesQuery = posProfilesQuery.eq(
        'branch_id',
        auth.profile.branch_id as string
      )
    }

    const { data: posProfiles, error: posProfilesError } =
      await posProfilesQuery

    if (posProfilesError) {
      const response = NextResponse.json(
        {
          error: 'تعذر تحميل مستخدمي POS',
          details: posProfilesError.message,
        },
        { status: 500 }
      )

      return withAuthCookies(auth.response, response)
    }

    const createdByIds = Array.from(
      new Set(
        (posProfiles || [])
          .map((profile) => profile.created_by)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    )
    let createdByMap = new Map<
      string,
      { full_name: string | null; username: string | null }
    >()

    if (createdByIds.length > 0) {
      const { data: creators, error: creatorsError } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, username')
        .eq('tenant_id', tenantId)
        .in('id', createdByIds)

      if (creatorsError) {
        const response = NextResponse.json(
          {
            error: 'تعذر تحميل منشئي مستخدمي POS',
            details: creatorsError.message,
          },
          { status: 500 }
        )

        return withAuthCookies(auth.response, response)
      }

      createdByMap = new Map(
        (creators || []).map((creator) => [
          creator.id,
          {
            full_name: creator.full_name,
            username: creator.username,
          },
        ])
      )
    }

    const response = NextResponse.json({
      success: true,
      users: [
        ...(profiles || []).map((profile) => ({
          ...profile,
          account_type: 'profile' as const,
        })),
        ...(posProfiles || []).map((profile) => ({
          id: profile.id,
          tenant_id: profile.tenant_id,
          branch_id: profile.branch_id,
          username: profile.username,
          full_name: profile.full_name,
          role: profile.role,
          is_active: profile.is_active,
          created_at: profile.created_at,
          updated_at: profile.updated_at,
          account_type: 'pos_profile' as const,
          created_by_name: createdByMap.get(profile.created_by || '')?.full_name || null,
          created_by_username:
            createdByMap.get(profile.created_by || '')?.username || null,
        })),
      ],
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = NextResponse.json(
      {
        error: 'حدث خطأ غير متوقع',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )

    return withAuthCookies(auth.response, response)
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { shouldFilterByBranch } from '@/lib/branch-access'
import { isFullAdmin } from '@/lib/permissions'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'

type ListUserRow = {
  id: string
  tenant_id: string | null
  branch_id: string | null
  username: string | null
  full_name: string | null
  role: string | null
  is_active: boolean | null
  contact_email?: string | null
  has_pos_pin: boolean
  pos_pin: string | null
  created_at: string | null
  updated_at: string | null
  account_type: 'profile' | 'pos_profile'
  created_by_name?: string | null
  created_by_username?: string | null
}

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

    const currentUserIsFullAdmin = isFullAdmin(auth.profile.role)

    if (
      !currentUserIsFullAdmin &&
      auth.profile.scope_type === 'branch' &&
      !auth.profile.branch_id
    ) {
      const response = NextResponse.json({
        success: true,
        users: [],
      })

      return withAuthCookies(auth.response, response)
    }

    let profilesQuery = supabaseAdmin
      .from('profiles')
      .select(
        'id, tenant_id, full_name, username, role, is_active, branch_id, contact_email, pos_pin_hash, created_at, updated_at'
      )
      .order('username', { ascending: true })

    profilesQuery = applyTenantFilter(profilesQuery, tenantId)

    if (
      !currentUserIsFullAdmin &&
      shouldFilterByBranch(auth.profile.scope_type, auth.profile.branch_id)
    ) {
      profilesQuery = profilesQuery.or(
        `branch_id.eq.${auth.profile.branch_id},branch_id.is.null`
      )
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
        'id, tenant_id, branch_id, username, full_name, role, is_active, pos_pin_hash, pos_pin_plain, created_by, created_at, updated_at'
      )
      .eq('tenant_id', tenantId)
      .order('username', { ascending: true })

    if (
      !currentUserIsFullAdmin &&
      shouldFilterByBranch(auth.profile.scope_type, auth.profile.branch_id)
    ) {
      posProfilesQuery = posProfilesQuery.or(
        `branch_id.eq.${auth.profile.branch_id},branch_id.is.null`
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

    const profileRows: ListUserRow[] = (profiles || []).map((profile) => ({
          ...profile,
          pos_pin_hash: undefined,
          has_pos_pin: Boolean(profile.pos_pin_hash),
          pos_pin: null,
          account_type: 'profile' as const,
        }))

    const posProfileRows: ListUserRow[] = (posProfiles || []).map((profile) => ({
          id: profile.id,
          tenant_id: profile.tenant_id,
          branch_id: profile.branch_id,
          username: profile.username,
          full_name: profile.full_name,
          role: profile.role,
          is_active: profile.is_active,
          has_pos_pin: Boolean(profile.pos_pin_hash || profile.pos_pin_plain),
          pos_pin:
            typeof profile.pos_pin_plain === 'string'
              ? profile.pos_pin_plain
              : null,
          created_at: profile.created_at,
          updated_at: profile.updated_at,
          account_type: 'pos_profile' as const,
          created_by_name: createdByMap.get(profile.created_by || '')?.full_name || null,
          created_by_username:
            createdByMap.get(profile.created_by || '')?.username || null,
        }))

    const consumedPosProfileIds = new Set<string>()

    const users = profileRows.map((profile) => {
      const matchingPosProfile = posProfileRows.find(
        (posProfile) => posProfile.id === profile.id
      )

      if (!matchingPosProfile) {
        return profile
      }

      consumedPosProfileIds.add(matchingPosProfile.id)

      return {
        ...profile,
        username: profile.username || matchingPosProfile.username,
        tenant_id: profile.tenant_id || matchingPosProfile.tenant_id,
        branch_id: profile.branch_id || matchingPosProfile.branch_id,
        full_name: profile.full_name || matchingPosProfile.full_name,
        is_active: profile.is_active ?? matchingPosProfile.is_active,
        created_by_name: matchingPosProfile.created_by_name || null,
        created_by_username: matchingPosProfile.created_by_username || null,
        created_at: profile.created_at || matchingPosProfile.created_at,
        updated_at: profile.updated_at || matchingPosProfile.updated_at,
        has_pos_pin: Boolean(profile.has_pos_pin || matchingPosProfile.has_pos_pin),
        pos_pin: profile.pos_pin || matchingPosProfile.pos_pin || null,
      }
    })

    for (const posProfile of posProfileRows) {
      if (!consumedPosProfileIds.has(posProfile.id)) {
        users.push(posProfile)
      }
    }

    const response = NextResponse.json({
      users,
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

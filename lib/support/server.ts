import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { resolveAuthScopeType } from '@/lib/auth-profile'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const SUPPORT_STATUSES = ['new', 'investigating', 'waiting_customer', 'resolved', 'closed'] as const
export const SUPPORT_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const
export const SUPPORT_CATEGORIES = ['technical_error', 'orders', 'inventory', 'invoices', 'whatsapp', 'printing', 'users_permissions', 'performance', 'feature_request', 'other'] as const

export async function requireSupportAuth(request: NextRequest) {
  void request
  const response = NextResponse.next()
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'غير مصرح' }, { status: 401 }),
    }
  }
  const { data } = await supabaseAdmin
    .from('platform_admins')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (data) {
    return {
      ok: true as const,
      response,
      supabase,
      user,
      profile: {
        id: user.id,
        tenant_id: null,
        branch_id: null,
        role: 'admin' as const,
        is_active: true,
        username: null,
        full_name: null,
        scope_type: 'system' as const,
      },
      isProvider: true,
      providerRole: data.role,
    }
  }
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, is_active, username, full_name, branch_id, tenant_id')
    .eq('id', user.id)
    .single()
  if (profileError || !profile || !profile.is_active) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'غير مصرح' }, { status: 401 }),
    }
  }
  return {
    ok: true as const,
    response,
    supabase,
    user,
    profile: {
      ...profile,
      scope_type: resolveAuthScopeType(profile.role),
    },
    isProvider: false,
    providerRole: null,
  }
}

export function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function positiveInteger(value: string | null, fallback: number, max: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback
}

export function isOneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === 'string' && allowed.includes(value)
}

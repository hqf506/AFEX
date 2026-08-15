import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
export { SUPPORT_CATEGORIES, SUPPORT_PRIORITIES, SUPPORT_STATUSES } from '@/lib/support/contracts'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { ServerTiming } from '@/lib/performance/server-timing'
import { requireAuthorizationContext } from '@/lib/authorization-context'

export async function requireSupportAuth(
  request: NextRequest,
  timing?: ServerTiming
) {
  const authorization = await (timing
    ? timing.measure('auth', () => requireAuthorizationContext(request))
    : requireAuthorizationContext(request))
  if (!authorization.ok) return authorization

  const { response, supabase, context } = authorization
  const { user, profile } = context
  if (context.posEmployee && !context.can('support:access')) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'POS actor is not authorized for support access' }, { status: 403 }),
    }
  }

  const providerResult = await (timing
    ? timing.measure('platform_admin', () =>
        supabaseAdmin
          .from('platform_admins')
          .select('role')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle()
      )
    : supabaseAdmin
        .from('platform_admins')
        .select('role')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle())

  if (!context.posEmployee && providerResult.data) {
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
      providerRole: providerResult.data.role,
    }
  }
  return {
    ok: true as const,
    response,
    supabase,
    user,
    profile,
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

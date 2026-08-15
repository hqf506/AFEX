import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { AdminShellLayout } from '@/components/admin-shell-layout'
import { isFullAdmin, LIMITED_ADMIN_ROLES } from '@/lib/permissions'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireVerifiedAuthContext } from '@/lib/verified-auth-context'
import {
  isPosActorRestrictionRequired,
  POS_ACTOR_COOKIE,
  resolvePosActorSession,
} from '@/lib/pos-actor-session-server'

function canEnterAdminShell(role: string) {
  return (
    isFullAdmin(role) ||
    LIMITED_ADMIN_ROLES.some((allowedRole) => allowedRole === role)
  )
}

function AdminAccessDenied() {
  return (
    <main dir="rtl" className="min-h-screen bg-[#020817] px-6 py-10 text-white">
      <section className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center">
        <div className="rounded-3xl border border-red-500/25 bg-red-500/10 p-8 text-center shadow-[0_0_35px_rgba(239,68,68,0.12)]">
          <p className="text-sm font-semibold text-red-200">غير مصرح لك بالدخول</p>
          <h1 className="mt-3 text-2xl font-bold">لوحة الإدارة مخصصة للمدير فقط</h1>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            جلسة نقطة البيع أو حساب الموظف لا يمنحان صلاحية الوصول إلى لوحة الإدارة.
          </p>
          <a
            href="/login"
            className="mt-6 inline-flex rounded-2xl border border-cyan-400/30 px-5 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/10"
          >
            العودة لتسجيل الدخول
          </a>
        </div>
      </section>
    </main>
  )
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const verifiedAuth = await requireVerifiedAuthContext(supabase)
  if (!verifiedAuth) {
    redirect('/')
  }
  const user = verifiedAuth.user
  const posToken = (await cookies()).get(POS_ACTOR_COOKIE)?.value
  const effectivePosActor = posToken
    ? await resolvePosActorSession(posToken, verifiedAuth)
    : null
  const missingCookieRestriction = !posToken
    ? await isPosActorRestrictionRequired(verifiedAuth)
    : false

  // A POS actor is always the effective authority while its cookie is present.
  // Invalid/revoked cookies also fail closed rather than restoring Owner access.
  if (missingCookieRestriction ||
      (posToken && (!effectivePosActor || !canEnterAdminShell(effectivePosActor.role)))) {
    return <AdminAccessDenied />
  }

  const [{ data: profile }, { data: provider }] = await Promise.all([
    supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('role', ['provider_owner', 'provider_support'])
      .maybeSingle(),
  ])

  const role = typeof profile?.role === 'string' ? profile.role : ''
  const isActive = profile?.is_active !== false

  if (!isActive || !canEnterAdminShell(role)) {
    return <AdminAccessDenied />
  }

  return <AdminShellLayout isProvider={Boolean(provider)}>{children}</AdminShellLayout>
}

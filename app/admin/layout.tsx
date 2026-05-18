import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { AdminShellLayout } from '@/components/admin-shell-layout'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const ADMIN_ROLES = new Set(['admin', 'manager'])

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
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  const role = typeof profile?.role === 'string' ? profile.role : ''
  const isActive = profile?.is_active !== false

  if (!isActive || !ADMIN_ROLES.has(role)) {
    return <AdminAccessDenied />
  }

  return <AdminShellLayout>{children}</AdminShellLayout>
}

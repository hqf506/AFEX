import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ProviderNotificationsShell } from '@/components/developer-support-notifications'

export default async function ProviderLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: provider } = await supabaseAdmin
    .from('platform_admins')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!provider) {
    return (
      <main dir="rtl" className="min-h-screen min-w-0 bg-[#020817] px-3 py-6 text-white sm:px-5 sm:py-8">
        <section className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center">
          <div className="rounded-[28px] border border-red-300/20 bg-red-500/10 p-7 text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            <p className="text-sm font-black text-red-200">غير مصرح لك بالدخول</p>
            <h1 className="mt-3 text-2xl font-black">لوحة دعم AFEX مخصصة للفريق الداخلي</h1>
            <p className="mt-3 text-sm leading-7 text-slate-300">حسابات العملاء لا تملك صلاحية الوصول إلى هذه اللوحة.</p>
          </div>
        </section>
      </main>
    )
  }

  return <div className="min-h-screen min-w-0 w-full bg-[#020817] px-3 py-4 text-white sm:px-5 xl:px-7"><ProviderNotificationsShell notificationsEnabled={provider.role === 'provider_owner'}>{children}</ProviderNotificationsShell></div>
}

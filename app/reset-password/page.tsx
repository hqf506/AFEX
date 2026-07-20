import Link from 'next/link'
import { hasValidRecoveryContext } from '@/lib/auth/recovery'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ResetPasswordForm } from './reset-password-form'

export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const recoveryAuthorized = Boolean(user && await hasValidRecoveryContext(user.id))

  return (
    <main dir="rtl" className="relative min-h-screen overflow-hidden bg-[#030714] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-[-12rem] top-[-12rem] h-[34rem] w-[34rem] rounded-full bg-cyan-400/20 blur-[120px]" />
        <div className="absolute bottom-[-10rem] left-[-10rem] h-[32rem] w-[32rem] rounded-full bg-emerald-400/16 blur-[120px]" />
      </div>
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl items-center justify-center">
        <section className="w-full rounded-[30px] border border-white/12 bg-white/[0.055] p-5 text-right shadow-[0_28px_100px_rgba(0,0,0,0.34)] backdrop-blur-xl md:p-8">
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">AFEX</div>
            <h1 className="text-3xl font-black tracking-tight text-white">إعادة تعيين كلمة المرور</h1>
            <p className="mt-2 text-sm leading-7 text-slate-400">
              {recoveryAuthorized
                ? 'أدخل كلمة مرور جديدة لحسابك.'
                : 'رابط إعادة تعيين كلمة المرور غير صالح أو انتهت صلاحيته.'}
            </p>
          </div>

          {recoveryAuthorized ? (
            <ResetPasswordForm />
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm font-bold leading-7 text-rose-100">
                اطلب رابطًا جديدًا لإعادة تعيين كلمة المرور، ثم افتحه من البريد الإلكتروني.
              </div>
              <Link href="/login?forgot=password" className="flex h-12 items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 text-sm font-black text-slate-950">
                طلب رابط جديد
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

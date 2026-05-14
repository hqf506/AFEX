'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUserProfile } from '@/lib/auth'
import { normalizeUsername } from '@/lib/usernames'

const highlights = ['آمن وموثوق', 'سريع وفعال', 'تقارير ذكية']
const miniBars = [42, 72, 54, 88, 62, 78]

export default function LoginPage() {
  const router = useRouter()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()

    try {
      setLoading(true)
      setError('')

      const normalizedUsername = normalizeUsername(username)

      if (!normalizedUsername) {
        throw new Error('يرجى كتابة اسم المستخدم')
      }

      if (!password.trim()) {
        throw new Error('يرجى كتابة الرقم السري')
      }

      const checkResponse = await fetch('/api/auth/check-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: normalizedUsername,
        }),
      })

      const checkResult = await checkResponse.json()

      if (!checkResponse.ok) {
        throw new Error(checkResult?.details || checkResult?.error || 'تعذر التحقق من المستخدم')
      }

      if (!checkResult?.exists) {
        throw new Error('اسم المستخدم غير صحيح')
      }

      if (checkResult?.user && checkResult.user.is_active === false) {
        throw new Error('هذا الحساب معطل، راجع الأدمن')
      }

      const profileEmail =
        typeof checkResult?.login_email === 'string'
          ? checkResult.login_email.trim()
          : ''

      if (!profileEmail) {
        throw new Error('هذا المستخدم لا يملك بريد مرتبط')
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: profileEmail,
        password,
      })

      if (error) {
        throw new Error('كلمة المرور غير صحيحة')
      }

      if (!data.user) {
        throw new Error('تعذر تسجيل الدخول')
      }

      const profile = await getCurrentUserProfile({ user: data.user })

      if (!profile?.role) {
        throw new Error('تعذر العثور على ملف المستخدم أو الصلاحية')
      }

      const redirectPath =
        profile.role === 'admin' ? '/admin/dashboard' : '/pos'

      router.replace(redirectPath)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء تسجيل الدخول')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main
      dir="rtl"
      className="relative min-h-screen overflow-hidden bg-[#030714] px-4 py-8 text-white sm:px-6 lg:px-8"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-[-12rem] top-[-12rem] h-[34rem] w-[34rem] rounded-full bg-cyan-400/20 blur-[120px]" />
        <div className="absolute left-[-10rem] bottom-[-10rem] h-[32rem] w-[32rem] rounded-full bg-emerald-400/16 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:76px_76px] opacity-25" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full gap-5 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="order-1 rounded-[30px] border border-white/12 bg-white/[0.055] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.34)] backdrop-blur-xl md:p-8 lg:order-none">
            <div className="mb-8 text-center">
              <div className="mb-4 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">
                تسجيل دخول آمن
              </div>
              <h1 className="text-4xl font-black tracking-tight text-white">
                تسجيل الدخول
              </h1>
              <p className="mt-2 text-sm text-slate-400">AFEX</p>
            </div>

            {error ? (
              <div className="mb-5 rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-100 shadow-[0_0_35px_rgba(251,113,133,0.08)]">
                {error}
              </div>
            ) : null}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-200">
                  اسم المستخدم
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="يرجى كتابة اسم المستخدم"
                  className="h-14 w-full rounded-2xl border border-white/12 bg-white/[0.07] px-4 text-right text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/55 focus:bg-white/[0.09] focus:ring-4 focus:ring-cyan-300/10"
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-200">
                  كلمة المرور
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="يرجى كتابة الرقم السري"
                  className="h-14 w-full rounded-2xl border border-white/12 bg-white/[0.07] px-4 text-right text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/55 focus:bg-white/[0.09] focus:ring-4 focus:ring-cyan-300/10"
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="h-14 w-full rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 text-lg font-black text-slate-950 shadow-[0_20px_60px_rgba(45,212,191,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(45,212,191,0.34)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'جاري تسجيل الدخول...' : 'دخول'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-400">
              ليس لديك حساب؟{' '}
              <Link
                href="/signup"
                className="font-black text-cyan-200 underline decoration-cyan-300/40 underline-offset-4 transition hover:text-cyan-100"
              >
                إنشاء حساب جديد
              </Link>
            </p>
          </section>

          <section className="relative overflow-hidden rounded-[30px] border border-white/12 bg-white/[0.045] p-6 shadow-[0_28px_100px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-8">
            <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-cyan-300/14 blur-3xl" />
            <div className="absolute -bottom-16 right-10 h-52 w-52 rounded-full bg-emerald-300/12 blur-3xl" />

            <div className="relative flex h-full flex-col justify-between gap-8">
              <div>
                <Image
                  src="/brand/afex-logo.png"
                  alt="AFEX"
                  width={720}
                  height={260}
                  priority
                  className="mb-7 h-20 w-auto object-contain drop-shadow-[0_0_24px_rgba(45,212,191,0.24)]"
                />

                <h2 className="text-3xl font-black leading-tight text-white md:text-4xl">
                  مرحبًا بك في نظام AFEX
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-8 text-slate-300 md:text-base">
                  ادخل إلى لوحة التحكم لإدارة الفروع والمبيعات والفواتير ونقاط
                  البيع بكفاءة.
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {highlights.map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-3 text-sm font-bold text-slate-200"
                    >
                      <span className="mb-2 block h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.9)]" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[26px] border border-cyan-300/25 bg-[#07111f]/85 p-4 shadow-[0_0_55px_rgba(34,211,238,0.12)]">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-cyan-200/70">AFEX CONTROL</p>
                    <p className="mt-1 text-sm font-black text-white">
                      لوحة تشغيل مصغرة
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-300/10 px-3 py-1 text-xs font-black text-emerald-200">
                    Live
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ['المبيعات', '48.6K'],
                    ['الفواتير', '126'],
                    ['الطلبات', '18'],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-white/8 bg-white/[0.045] p-3"
                    >
                      <p className="text-[11px] font-bold text-white/40">{label}</p>
                      <p className="mt-2 text-xl font-black text-cyan-200">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex h-28 items-end gap-2 rounded-2xl bg-white/[0.035] p-3">
                  {miniBars.map((height, index) => (
                    <div
                      key={`${height}-${index}`}
                      className="flex flex-1 items-end rounded-full bg-white/[0.05] p-1"
                    >
                      <div
                        className="w-full rounded-full bg-gradient-to-t from-cyan-400 to-emerald-300 shadow-[0_0_18px_rgba(45,212,191,0.24)]"
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

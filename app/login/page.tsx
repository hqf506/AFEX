'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { normalizeUsername, usernameToInternalEmail } from '@/lib/usernames'

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

      const internalEmail = usernameToInternalEmail(normalizedUsername)

      const { data, error } = await supabase.auth.signInWithPassword({
        email: internalEmail,
        password,
      })

      if (error) {
        throw new Error('كلمة المرور غير صحيحة')
      }

      if (!data.user) {
        throw new Error('تعذر تسجيل الدخول')
      }

      router.replace('/')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء تسجيل الدخول')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto flex min-h-[80vh] max-w-6xl items-center justify-center">
        <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-2">
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <div className="mb-8 text-center">
              <div className="mb-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                تسجيل دخول آمن
              </div>
              <h1 className="text-4xl font-black tracking-tight text-slate-900">
                تسجيل الدخول
              </h1>
              <p className="mt-2 text-sm text-slate-500">Leather Fix ERP</p>
            </div>

            {error ? (
              <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            ) : null}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  اسم المستخدم
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="يرجى كتابة اسم المستخدم"
                  className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-right text-slate-800 outline-none transition focus:border-slate-500"
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  كلمة المرور
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="يرجى كتابة الرقم السري"
                  className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-right text-slate-800 outline-none transition focus:border-slate-500"
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="h-14 w-full rounded-2xl bg-slate-950 text-lg font-bold text-white transition hover:opacity-95 disabled:opacity-60"
              >
                {loading ? 'جاري تسجيل الدخول...' : 'دخول'}
              </button>
            </form>
          </section>

          <section className="hidden rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm lg:block">
            <div className="flex h-full flex-col justify-center text-right">
              <div className="mb-4 inline-flex w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                Leather Fix ERP
              </div>
              <h2 className="text-4xl font-black leading-tight text-slate-900">
                مرحبًا بك في نظام Leather Fix ERP
              </h2>
              <p className="mt-4 max-w-xl text-base leading-8 text-slate-600">
                ادخل إلى لوحة التحكم وإدارة الطلبات والفواتير والتشغيل اليومي من خلال واجهة
                موحدة وسريعة ومناسبة للكمبيوتر والآيباد.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

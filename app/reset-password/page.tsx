'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [hasRecoverySession, setHasRecoverySession] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) {
        return
      }

      if (event === 'PASSWORD_RECOVERY') {
        setHasRecoverySession(Boolean(session))
        setSessionChecked(true)
      }
    })

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) {
        return
      }

      setHasRecoverySession(Boolean(session))
      setSessionChecked(true)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')

    if (password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف أو أكثر')
      return
    }

    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين')
      return
    }

    try {
      setLoading(true)

      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        throw error
      }

      setPassword('')
      setConfirmPassword('')
      setMessage('تم تحديث كلمة المرور بنجاح')
    } catch {
      setError('تعذر تحديث كلمة المرور. افتح رابط إعادة التعيين مرة أخرى أو حاول لاحقًا.')
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

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl items-center justify-center">
        <section className="w-full rounded-[30px] border border-white/12 bg-white/[0.055] p-5 text-right shadow-[0_28px_100px_rgba(0,0,0,0.34)] backdrop-blur-xl md:p-8">
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">
              AFEX
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white">
              إعادة تعيين كلمة المرور
            </h1>
            <p className="mt-2 text-sm leading-7 text-slate-400">
              أدخل كلمة مرور جديدة لحسابك.
            </p>
          </div>

          {message ? (
            <div className="mb-5 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-bold text-emerald-100">
              {message}
            </div>
          ) : null}

          {error ? (
            <div className="mb-5 rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-100 shadow-[0_0_35px_rgba(251,113,133,0.08)]">
              {error}
            </div>
          ) : null}

          {!sessionChecked ? (
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-bold text-cyan-100">
              جاري التحقق من رابط إعادة التعيين...
            </div>
          ) : hasRecoverySession ? (
            <form onSubmit={handleUpdatePassword} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-200">
                  كلمة المرور الجديدة
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="6 أحرف أو أكثر"
                  className="h-14 w-full rounded-2xl border border-white/12 bg-white/[0.07] px-4 text-right text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/55 focus:bg-white/[0.09] focus:ring-4 focus:ring-cyan-300/10"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-200">
                  تأكيد كلمة المرور
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="أعد كتابة كلمة المرور"
                  className="h-14 w-full rounded-2xl border border-white/12 bg-white/[0.07] px-4 text-right text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/55 focus:bg-white/[0.09] focus:ring-4 focus:ring-cyan-300/10"
                  autoComplete="new-password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="h-14 w-full rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 text-base font-black text-slate-950 shadow-[0_20px_60px_rgba(45,212,191,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(45,212,191,0.34)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'جاري التحديث...' : 'تحديث كلمة المرور'}
              </button>
            </form>
          ) : (
            <div className="rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm font-bold leading-7 text-rose-100 shadow-[0_0_35px_rgba(251,113,133,0.08)]">
              رابط إعادة التعيين غير صالح أو منتهي. اطلب رابطًا جديدًا.
            </div>
          )}

          <p className="mt-6 text-center text-sm text-slate-400">
            تذكرت كلمة المرور؟{' '}
            <Link
              href="/login"
              className="font-black text-cyan-200 underline decoration-cyan-300/40 underline-offset-4 transition hover:text-cyan-100"
            >
              العودة لتسجيل الدخول
            </Link>
          </p>
        </section>
      </div>
    </main>
  )
}

'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthState } from '@/components/auth-state-provider'
import { useMobileViewport } from '@/hooks/use-mobile-viewport'
import { getCurrentUserProfile } from '@/lib/auth'
import { canAccessPos } from '@/lib/permissions'
import {
  clearActivePosEmployee,
  clearPosLoggedOut,
  hasPosLoggedOut,
} from '@/lib/pos-employee-session'
import { supabase } from '@/lib/supabase/client'
import { normalizeUsername } from '@/lib/usernames'
import { getClientErrorMessage } from '@/lib/api/client-error'
import { POS_UX_MESSAGES } from '@/lib/pos-ux-messages'

function AfexMark({ className = 'h-14 w-14' }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
      <path
        d="M17 74 60 13 45 50h34L31 83l18-42H28L17 74Z"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ShieldIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3.5 19 6v5.2c0 4.4-2.8 8.4-7 9.8-4.2-1.4-7-5.4-7-9.8V6l7-2.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="m8.8 12 2.1 2.1 4.4-4.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function UserIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 20a7 7 0 0 1 14 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function LockIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8.5 10V7.8a3.5 3.5 0 0 1 7 0V10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function HeadsetIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 13v-1a7 7 0 0 1 14 0v1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M4 13h3v5H4zM17 13h3v5h-3z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M17 18c0 1.7-1.7 3-5 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function PosHardwareIllustration() {
  return (
    <div className="pos-login-hardware relative mx-auto mt-4 h-[170px] w-full max-w-[560px] md:mt-5 xl:h-[220px]">
      <div className="absolute inset-x-10 bottom-10 h-20 rounded-[50%] border border-cyan-300/50 shadow-[0_0_45px_rgba(34,211,238,0.35)]" />
      <div className="absolute left-[8%] bottom-8 h-24 w-28 rounded-[22px] border border-cyan-200/20 bg-slate-950/80 shadow-[0_18px_55px_rgba(0,0,0,0.5)]">
        <div className="mx-auto mt-4 h-8 w-16 rounded-md bg-slate-800" />
        <div className="absolute -top-5 right-5 h-8 w-16 rounded-t-xl border border-cyan-100/20 bg-cyan-100/75" />
      </div>
      <div className="absolute inset-x-0 bottom-4 mx-auto h-36 w-[250px] rotate-[-6deg] rounded-[28px] border border-cyan-300/40 bg-[#071527]/95 p-4 shadow-[0_0_55px_rgba(34,211,238,0.2),0_25px_80px_rgba(0,0,0,0.65)] xl:h-44 xl:w-[300px]">
        <div className="mb-4 flex items-center justify-between">
          <span className="h-2 w-16 rounded-full bg-cyan-300/80" />
          <span className="h-2 w-10 rounded-full bg-cyan-100/20" />
        </div>
        <div className="grid grid-cols-3 gap-2 xl:gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <span
              key={`pos-panel-${index}`}
              className="h-8 rounded-2xl border border-cyan-300/15 bg-cyan-300/10 xl:h-10"
            />
          ))}
        </div>
        <div className="mt-3 h-8 rounded-2xl border border-cyan-300/20 bg-slate-950/70 xl:mt-4 xl:h-10" />
      </div>
      <div className="absolute right-[10%] bottom-2 h-32 w-20 rotate-[5deg] rounded-[24px] border border-cyan-300/30 bg-slate-950/90 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.55)] xl:h-40 xl:w-24">
        <div className="mb-3 h-9 rounded-xl bg-cyan-300/20" />
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 12 }).map((_, index) => (
            <span
              key={`terminal-key-${index}`}
              className="h-4 rounded bg-cyan-100/15"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function PosLoginPage() {
  const router = useRouter()
  const authState = useAuthState()
  const isMobileViewport = useMobileViewport(true)
  const pinNavigationStartedRef = useRef(false)
  const usernameInputRef = useRef<HTMLInputElement | null>(null)
  const passwordInputRef = useRef<HTMLInputElement | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    clearActivePosEmployee()
  }, [])

  useEffect(() => {
    if (authState.loading) {
      return
    }

    if (!authState.profile) {
      return
    }

    if (canAccessPos(authState.profile.role)) {
      if (hasPosLoggedOut()) {
        return
      }

      if (!pinNavigationStartedRef.current) {
        pinNavigationStartedRef.current = true
        router.replace('/pos/offline-preparation')
      }
      return
    }

    const timer = window.setTimeout(() => {
      setError('غير مصرح لك بالدخول إلى POS')
    }, 0)
    return () => window.clearTimeout(timer)
  }, [authState.loading, authState.profile, router])

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    try {
      setLoading(true)
      setError('')

      const normalizedUsername = normalizeUsername(username)

      if (!normalizedUsername) {
        throw new Error('يرجى كتابة اسم المستخدم أو البريد')
      }

      if (!password.trim()) {
        throw new Error('يرجى كتابة كلمة المرور')
      }

      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: normalizedUsername,
          password,
        }),
      })

      const loginResult = await loginResponse.json().catch(() => null)

      if (!loginResponse.ok || !loginResult?.success) {
        throw new Error(
          getClientErrorMessage(loginResult, POS_UX_MESSAGES.invalidLogin)
        )
      }

      if (!loginResult.session?.access_token || !loginResult.session?.refresh_token) {
        throw new Error('تعذر تثبيت جلسة تسجيل الدخول')
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: loginResult.session.access_token,
        refresh_token: loginResult.session.refresh_token,
      })

      if (sessionError || !sessionData.user) {
        throw new Error('تعذر تثبيت جلسة تسجيل الدخول')
      }

      const profile = await getCurrentUserProfile({ user: sessionData.user })

      if (!profile || !profile.is_active) {
        clearActivePosEmployee()
        console.error('[POS LOGIN] profile validation failed.')
        throw new Error('بيانات الدخول غير صحيحة')
      }

      if (!canAccessPos(profile.role)) {
        clearActivePosEmployee()
        throw new Error('غير مصرح لك بالدخول إلى POS')
      }

      await authState.refreshAuthState()
      await new Promise((resolve) => window.setTimeout(resolve, 50))
      clearActivePosEmployee()
      clearPosLoggedOut()
      if (!pinNavigationStartedRef.current) {
        pinNavigationStartedRef.current = true
        router.replace('/pos/offline-preparation')
      }
    } catch (loginError) {
      setError(
        loginError instanceof TypeError
          ? POS_UX_MESSAGES.networkFailure
          : loginError instanceof Error
          ? loginError.message
          : POS_UX_MESSAGES.networkFailure
      )
    } finally {
      setLoading(false)
    }
  }

  if (isMobileViewport) {
    return (
      <main dir="rtl" className="pos-entry-login relative h-[100svh] overflow-y-auto bg-[#071521] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-white">
        <style jsx global>{`
          .pos-login-input:-webkit-autofill,
          .pos-login-input:-webkit-autofill:hover,
          .pos-login-input:-webkit-autofill:focus {
            -webkit-text-fill-color: rgb(255, 255, 255);
            caret-color: rgb(255, 255, 255);
            box-shadow: 0 0 0 1000px rgba(2, 8, 23, 0.84) inset;
            transition: background-color 9999s ease-in-out 0s;
          }
        `}</style>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(34,211,238,0.11),transparent_34%),linear-gradient(180deg,#020817_0%,#030b17_100%)]" />

        <div className="relative z-10 mx-auto flex min-h-full w-full max-w-md flex-col">
          <header className="flex items-center justify-between">
            <Link
              href="/"
              aria-label="العودة"
              className="grid h-12 w-12 place-items-center rounded-[17px] border border-cyan-300/20 bg-cyan-300/[0.04] text-slate-200 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.96]"
            >
              <span aria-hidden="true" className="text-2xl">←</span>
            </Link>
            <span className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-cyan-300/18 bg-cyan-300/[0.06] px-3 text-xs font-black text-cyan-100">
              <ShieldIcon className="h-4 w-4" />
              دخول آمن
            </span>
          </header>

          <section className="pb-7 pt-8 text-center">
            <div className="mx-auto flex items-center justify-center gap-3 text-white">
              <AfexMark className="h-16 w-16 text-cyan-300 drop-shadow-[0_0_18px_rgba(34,211,238,0.45)]" />
              <div className="text-right">
                <p className="text-3xl font-black tracking-[0.12em]">AFEX</p>
                <p className="mt-1 text-xs font-black tracking-[0.28em] text-cyan-300">POS</p>
              </div>
            </div>
            <h1 className="mt-7 text-[34px] font-black leading-tight">تسجيل الدخول</h1>
            <p className="mx-auto mt-3 max-w-xs text-sm font-bold leading-7 text-slate-400">
              الرجاء إدخال بياناتك للوصول إلى نقطة البيع
            </p>
          </section>

          <section className="rounded-[28px] border border-cyan-300/12 bg-[rgba(6,20,38,0.66)] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)] backdrop-blur-xl">
            {error ? (
              <div id="pos-mobile-login-error" role="alert" className="mb-5 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm font-bold leading-6 text-rose-100">
                {error}
              </div>
            ) : null}

            <form onSubmit={handleLogin} className="space-y-5">
              <label className="block" htmlFor="pos-mobile-login-username">
                <span className="mb-2 block text-sm font-black text-slate-200">اسم المستخدم</span>
                <span className="pos-login-field group flex min-h-[58px] w-full min-w-0 items-center gap-3 overflow-hidden rounded-[20px] bg-[#020817]/75 px-4 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.14)] transition focus-within:shadow-[0_0_20px_rgba(34,211,238,0.10),inset_0_0_0_1px_rgba(34,211,238,0.38)]">
                  <UserIcon className="h-5 w-5 shrink-0 text-slate-400 group-focus-within:text-cyan-300" />
                  <input
                    id="pos-mobile-login-username"
                    type="text"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="اسم المستخدم أو البريد الإلكتروني"
                    autoComplete="username"
                    enterKeyHint="next"
                    required
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'pos-mobile-login-error' : undefined}
                    className="pos-login-input h-14 min-w-0 flex-1 bg-transparent text-right text-base font-bold text-white outline-none placeholder:text-slate-600"
                  />
                </span>
              </label>

              <label className="block" htmlFor="pos-mobile-login-password">
                <span className="mb-2 block text-sm font-black text-slate-200">كلمة المرور</span>
                <span className="pos-login-field group flex min-h-[58px] w-full min-w-0 items-center gap-3 overflow-hidden rounded-[20px] bg-[#020817]/75 px-4 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.14)] transition focus-within:shadow-[0_0_20px_rgba(34,211,238,0.10),inset_0_0_0_1px_rgba(34,211,238,0.38)]">
                  <LockIcon className="h-5 w-5 shrink-0 text-slate-400 group-focus-within:text-cyan-300" />
                  <input
                    id="pos-mobile-login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="أدخل كلمة المرور"
                    autoComplete="current-password"
                    enterKeyHint="done"
                    required
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'pos-mobile-login-error' : undefined}
                    className="pos-login-input h-14 min-w-0 flex-1 bg-transparent text-right text-base font-bold text-white outline-none placeholder:text-slate-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xs font-black text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                  >
                    {showPassword ? 'إخفاء' : 'إظهار'}
                  </button>
                </span>
              </label>

              <div className="flex items-center justify-between gap-3 text-sm">
                <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 font-bold text-slate-300">
                  <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="h-5 w-5 accent-cyan-300" />
                  تذكرني
                </label>
                <Link href="/login?forgot=password" className="inline-flex min-h-[44px] items-center font-black text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70">
                  نسيت كلمة المرور؟
                </Link>
              </div>

              <button type="submit" disabled={loading} className="flex min-h-[58px] w-full items-center justify-center gap-3 rounded-[20px] bg-gradient-to-l from-cyan-300 to-sky-500 text-base font-black text-slate-950 shadow-[0_12px_28px_rgba(14,165,233,0.22)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60">
                {loading ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}
                <span aria-hidden="true">←</span>
              </button>
            </form>
          </section>

          <p className="mt-auto pt-7 text-center text-xs font-bold text-slate-600">© 2026 AFEX POS</p>
        </div>
      </main>
    )
  }

  return (
    <main
      dir="rtl"
      className="pos-entry-login relative flex h-[100svh] w-full items-center justify-center overflow-hidden bg-[#071521] text-white xl:h-full"
    >
      <style jsx global>{`
        .pos-login-input:-webkit-autofill,
        .pos-login-input:-webkit-autofill:hover,
        .pos-login-input:-webkit-autofill:focus {
          -webkit-text-fill-color: rgb(255, 255, 255);
          caret-color: rgb(255, 255, 255);
          box-shadow: 0 0 0 1000px rgba(2, 8, 23, 0.72) inset;
          transition: background-color 9999s ease-in-out 0s;
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(34,211,238,0.12),transparent_42%)]" />

      <div
        className="relative z-10 max-h-full max-w-full overflow-hidden rounded-[34px] border border-white/10 bg-[#02040a] p-[5px] shadow-[0_34px_120px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.04)] sm:rounded-[38px] sm:p-[6px]"
        style={{
          width: 'min(94vw, 1440px, 100%)',
          height: 'min(92svh, 900px, 100%)',
          aspectRatio: '16 / 9',
        }}
      >
        <span className="absolute left-1/2 top-4 z-20 hidden h-2 w-2 -translate-x-1/2 rounded-full bg-[#071426] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_12px_rgba(34,211,238,0.22)] sm:block" />
        <section
          dir="ltr"
          className="relative grid h-full min-h-0 w-full overflow-hidden rounded-[28px] border border-cyan-300/20 bg-[#020817] text-white shadow-[inset_0_0_70px_rgba(34,211,238,0.06)] lg:grid-cols-[40%_60%]"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_23%_34%,rgba(34,211,238,0.2),transparent_31%),radial-gradient(circle_at_76%_42%,rgba(14,165,233,0.2),transparent_34%),linear-gradient(135deg,#020817_0%,#061426_50%,#071b2d_100%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.11] [background-image:linear-gradient(rgba(34,211,238,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.14)_1px,transparent_1px)] [background-size:54px_54px]" />
          <div className="pointer-events-none absolute -bottom-24 left-1/2 h-64 w-[72%] -translate-x-1/2 rounded-[50%] border border-cyan-300/20 shadow-[0_0_85px_rgba(34,211,238,0.22)]" />

          <div className="absolute right-7 top-6 z-20 hidden items-center gap-3 text-white lg:flex">
            <span className="text-3xl font-black tracking-wide">AFEX</span>
            <AfexMark className="h-12 w-12 text-cyan-300 drop-shadow-[0_0_18px_rgba(34,211,238,0.85)]" />
          </div>

          <div
            dir="rtl"
            className="relative z-10 flex min-h-0 items-center justify-center p-4 sm:p-6 lg:p-8"
          >
            <div className="flex max-h-[calc(100%-64px)] w-[min(440px,100%)] flex-col overflow-hidden rounded-[28px] border border-cyan-300/30 bg-[rgba(8,20,36,0.72)] p-5 shadow-[0_0_55px_rgba(34,211,238,0.14),0_26px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl lg:p-6 xl:p-7">
              <div className="mb-4 flex min-h-[40px] items-center justify-start">
                <div className="inline-flex min-h-[42px] items-center gap-3 rounded-2xl border border-cyan-200/20 bg-[#081424]/72 px-4 text-sm font-bold text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
                  <span className="h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.9)]" />
                  العربية
                </div>
              </div>

              <div className="mb-5 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-300/10 text-cyan-200 shadow-[0_0_34px_rgba(34,211,238,0.24)]">
                  <ShieldIcon className="h-7 w-7" />
                </div>
                <h2 className="text-3xl font-black text-white">تسجيل الدخول</h2>
                <p className="mt-2 text-sm font-medium text-slate-400">
                  الرجاء إدخال بياناتك للوصول إلى النظام
                </p>
              </div>

              {error ? (
                <div
                  id="pos-login-error"
                  role="alert"
                  className="mb-5 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-100 shadow-[0_0_20px_rgba(244,63,94,0.12)]"
                >
                  {error}
                </div>
              ) : null}

              <form onSubmit={handleLogin} className="space-y-3">
                <div>
                  <label htmlFor="pos-login-username" className="mb-2 block text-sm font-bold text-slate-100">
                    البريد الإلكتروني أو اسم المستخدم
                  </label>
                  <div
                    onClick={() => usernameInputRef.current?.focus()}
                    className="group flex min-h-[54px] cursor-text items-center gap-3 rounded-2xl border border-cyan-200/25 bg-[rgba(2,8,23,0.72)] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition focus-within:border-cyan-300/75 focus-within:shadow-[0_0_28px_rgba(34,211,238,0.18)]"
                  >
                    <UserIcon className="h-5 w-5 shrink-0 text-slate-400 transition group-focus-within:text-cyan-300" />
                    <input
                      ref={usernameInputRef}
                      id="pos-login-username"
                      type="text"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="أدخل بريدك الإلكتروني أو اسم المستخدم"
                      className="pos-login-input h-12 min-w-0 flex-1 bg-transparent text-right text-base font-semibold text-white outline-none placeholder:text-slate-500"
                      autoComplete="username"
                      inputMode="text"
                      enterKeyHint="next"
                      dir="rtl"
                      required
                      aria-required="true"
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? 'pos-login-error' : undefined}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="pos-login-password" className="mb-2 block text-sm font-bold text-slate-100">
                    كلمة المرور
                  </label>
                  <div
                    onClick={() => passwordInputRef.current?.focus()}
                    className="group flex min-h-[54px] cursor-text items-center gap-3 rounded-2xl border border-cyan-200/25 bg-[rgba(2,8,23,0.72)] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition focus-within:border-cyan-300/75 focus-within:shadow-[0_0_28px_rgba(34,211,238,0.18)]"
                  >
                    <LockIcon className="h-5 w-5 shrink-0 text-slate-400 transition group-focus-within:text-cyan-300" />
                    <input
                      ref={passwordInputRef}
                      id="pos-login-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="أدخل كلمة المرور"
                      className="pos-login-input h-12 min-w-0 flex-1 bg-transparent text-right text-base font-semibold text-white outline-none placeholder:text-slate-500"
                      autoComplete="current-password"
                      enterKeyHint="done"
                      dir="rtl"
                      required
                      aria-required="true"
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? 'pos-login-error' : undefined}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 font-semibold text-slate-300">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(event) => setRememberMe(event.target.checked)}
                      className="h-5 w-5 rounded-md border-cyan-300/40 bg-slate-950 accent-cyan-300"
                    />
                    تذكرني
                  </label>

                  <Link
                    href="/login?forgot=password"
                    className="inline-flex min-h-[44px] items-center font-bold text-cyan-300 transition hover:text-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300/40"
                  >
                    نسيت كلمة المرور؟
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-cyan-300 text-lg font-black text-slate-950 shadow-[0_0_38px_rgba(34,211,238,0.48)] transition hover:bg-cyan-200 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}
                  <span className="text-2xl" aria-hidden="true">
                    ↗
                  </span>
                </button>

              </form>

              <div className="mt-auto flex items-center justify-center gap-2 pt-4 text-center text-sm font-semibold text-slate-400">
                <HeadsetIcon className="h-5 w-5 text-slate-500" />
                <span>للمساعدة، تواصل مع مدير النظام</span>
              </div>
            </div>
          </div>

          <div
            dir="rtl"
            className="relative z-10 hidden min-h-0 flex-col items-center justify-center overflow-hidden px-8 pb-7 pt-16 text-center lg:flex xl:px-12"
          >
            <div className="pointer-events-none absolute right-12 top-24 h-56 w-56 rounded-full bg-cyan-300/14 blur-3xl" />
            <div className="pointer-events-none absolute bottom-12 left-12 h-64 w-64 rounded-full bg-sky-500/12 blur-3xl" />

            <div className="relative flex items-center justify-center gap-6 text-white">
              <AfexMark className="h-24 w-24 text-cyan-300 drop-shadow-[0_0_34px_rgba(34,211,238,0.95)] xl:h-28 xl:w-28" />
              <span className="text-5xl font-black tracking-wide xl:text-6xl">AFEX</span>
            </div>

            <h1 className="relative mt-5 text-4xl font-black leading-tight text-white xl:text-5xl">
              مرحباً بك في{' '}
              <span className="text-cyan-300 drop-shadow-[0_0_18px_rgba(34,211,238,0.55)]">
                AFEX POS
              </span>
            </h1>
            <p className="relative mt-3 max-w-xl text-base font-medium leading-8 text-slate-300 xl:text-lg">
              نقطة بيع ذكية لإدارة أعمالك بسهولة، بسرعة، وتجربة تليق بواجهة المتجر الحديثة.
            </p>

            <PosHardwareIllustration />

            <div className="relative mt-auto grid w-full max-w-[560px] grid-cols-3 gap-3 border-t border-cyan-200/10 pt-3 text-center text-xs font-bold text-slate-300 xl:text-sm">
              <div className="rounded-2xl border border-cyan-200/10 bg-slate-950/25 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="mx-auto mb-2 h-7 w-7 rounded-xl border border-cyan-300/35 shadow-[0_0_18px_rgba(34,211,238,0.16)]" />
                آمن وموثوق
              </div>
              <div className="rounded-2xl border border-cyan-200/10 bg-slate-950/25 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="mx-auto mb-2 h-7 w-7 rounded-xl border border-cyan-300/35 shadow-[0_0_18px_rgba(34,211,238,0.16)]" />
                بياناتك في أمان
              </div>
              <div className="rounded-2xl border border-cyan-200/10 bg-slate-950/25 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="mx-auto mb-2 h-7 w-7 rounded-xl border border-cyan-300/35 shadow-[0_0_18px_rgba(34,211,238,0.16)]" />
                أداء سريع
              </div>
            </div>
          </div>

          <p className="absolute bottom-3 left-0 right-0 z-20 text-center text-xs font-semibold text-slate-500">
            © 2026 AFEX POS. جميع الحقوق محفوظة.
          </p>
        </section>
      </div>
    </main>
  )
}

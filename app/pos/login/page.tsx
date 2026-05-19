'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthState } from '@/components/auth-state-provider'
import { getCurrentUserProfile } from '@/lib/auth'
import { canAccessPos } from '@/lib/permissions'
import {
  clearActivePosEmployee,
  clearPosLoggedOut,
  hasPosLoggedOut,
} from '@/lib/pos-employee-session'
import { supabase } from '@/lib/supabase/client'
import { normalizeUsername, usernameToInternalEmail } from '@/lib/usernames'

async function waitForSessionPersistence(expectedUserId: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (session?.user?.id === expectedUserId) {
      return session
    }

    await new Promise((resolve) => window.setTimeout(resolve, 50))
  }

  return null
}

export default function PosLoginPage() {
  const router = useRouter()
  const authState = useAuthState()
  const usernameInputRef = useRef<HTMLInputElement | null>(null)
  const passwordInputRef = useRef<HTMLInputElement | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
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

      router.replace('/pos/employee-pin')
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

      const checkResponse = await fetch('/api/auth/check-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: normalizedUsername,
        }),
      })

      const checkResult = await checkResponse.json().catch(() => null)

      if (!checkResponse.ok) {
        throw new Error(
          checkResult?.details || checkResult?.error || 'تعذر التحقق من المستخدم'
        )
      }

      if (!checkResult?.exists) {
        throw new Error('بيانات الدخول غير صحيحة')
      }

      if (checkResult?.user && checkResult.user.is_active === false) {
        throw new Error('هذا الحساب معطل، راجع الإدارة')
      }

      const isEmailLogin = normalizedUsername.includes('@')
      const loginEmail = isEmailLogin
        ? normalizedUsername
        : usernameToInternalEmail(normalizedUsername)
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      })

      if (signInError || !data.user) {
        console.error('[POS LOGIN] auth sign-in failed', {
          authError: signInError
            ? {
                name: signInError.name,
                message: signInError.message,
                status: signInError.status,
              }
            : null,
          identifierType: isEmailLogin ? 'email' : 'username',
          profileLoaded: false,
          role: null,
          tenant_id: null,
          branch_id: null,
        })
        throw new Error('بيانات الدخول غير صحيحة')
      }

      await new Promise((resolve) => window.setTimeout(resolve, 200))

      const persistedSession =
        data.session ?? (await waitForSessionPersistence(data.user.id))

      if (!persistedSession) {
        throw new Error('تعذر تثبيت جلسة تسجيل الدخول')
      }

      const profile = await getCurrentUserProfile({ user: data.user })

      console.info('[POS LOGIN] profile resolved', {
        profileLoaded: Boolean(profile),
        role: profile?.role ?? null,
        tenant_id: profile?.tenant_id ?? null,
        branch_id: profile?.branch_id ?? null,
      })

      if (!profile || !profile.is_active) {
        clearActivePosEmployee()
        console.error('[POS LOGIN] profile validation failed', {
          profileLoaded: Boolean(profile),
          role: profile?.role ?? null,
          tenant_id: profile?.tenant_id ?? null,
          branch_id: profile?.branch_id ?? null,
          isActive: profile?.is_active ?? null,
        })
        throw new Error('بيانات الدخول غير صحيحة')
      }

      if (!canAccessPos(profile.role)) {
        clearActivePosEmployee()
        console.error('[POS LOGIN] role cannot access POS', {
          profileLoaded: true,
          role: profile.role,
          tenant_id: profile.tenant_id,
          branch_id: profile.branch_id,
        })
        throw new Error('غير مصرح لك بالدخول إلى POS')
      }

      await authState.refreshAuthState()
      await new Promise((resolve) => window.setTimeout(resolve, 50))
      clearActivePosEmployee()
      clearPosLoggedOut()
      window.location.href = '/pos/employee-pin'
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : 'حدث خطأ أثناء تسجيل الدخول'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto flex min-h-[80vh] max-w-6xl items-center justify-center">
        <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="mb-8 text-center">
            <div className="mb-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              AFEX POS
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">
              AFEX POS
            </h1>
            <p className="mt-2 text-sm text-slate-500">تسجيل دخول الموظف</p>
          </div>

          {error ? (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          ) : null}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                اسم المستخدم أو البريد
              </label>
              <div
                onClick={() => usernameInputRef.current?.focus()}
                className="cursor-text rounded-2xl"
              >
                <input
                  ref={usernameInputRef}
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="اكتب اسم المستخدم أو البريد"
                  className="h-14 min-h-[48px] w-full rounded-2xl border border-slate-300 bg-white px-4 text-base text-right text-slate-800 outline-none transition focus:border-slate-500 touch-manipulation cursor-text"
                  autoComplete="username"
                  inputMode="text"
                  enterKeyHint="next"
                  dir="rtl"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                كلمة المرور
              </label>
              <div
                onClick={() => passwordInputRef.current?.focus()}
                className="cursor-text rounded-2xl"
              >
                <input
                  ref={passwordInputRef}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="اكتب كلمة المرور"
                  className="h-14 min-h-[48px] w-full rounded-2xl border border-slate-300 bg-white px-4 text-base text-right text-slate-800 outline-none transition focus:border-slate-500 touch-manipulation cursor-text"
                  autoComplete="current-password"
                  enterKeyHint="done"
                  dir="rtl"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="h-14 w-full rounded-2xl bg-black text-lg font-bold text-white transition hover:opacity-95 disabled:opacity-60"
            >
              {loading ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}

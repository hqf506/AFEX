'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClientErrorMessage } from '@/lib/api/client-error'

export function ResetPasswordForm() {
  const router = useRouter()
  const submittingRef = useRef(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (submittingRef.current) return
    setError('')

    if (password.trim().length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف أو أكثر.')
      return
    }
    if (password.trim() !== confirmPassword.trim()) {
      setError('كلمتا المرور غير متطابقتين.')
      return
    }

    try {
      submittingRef.current = true
      setLoading(true)
      const response = await fetch('/api/auth/recovery/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: password.trim(),
          confirmation: confirmPassword.trim(),
        }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success) {
        throw new Error(getClientErrorMessage(result, 'تعذر تحديث كلمة المرور.'))
      }

      router.replace('/login?password_reset=success')
      router.refresh()
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'تعذر تحديث كلمة المرور. اطلب رابطًا جديدًا وحاول مرة أخرى.'
      )
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error ? (
        <div className="rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-100" role="alert">
          {error}
        </div>
      ) : null}
      <div>
        <label htmlFor="recovery-password" className="mb-2 block text-sm font-bold text-slate-200">
          كلمة المرور الجديدة
        </label>
        <input
          id="recovery-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-14 w-full rounded-2xl border border-white/12 bg-white/[0.07] px-4 text-right text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/55 focus:ring-4 focus:ring-cyan-300/10"
          autoComplete="new-password"
          minLength={6}
          required
          autoFocus
        />
      </div>
      <div>
        <label htmlFor="recovery-password-confirmation" className="mb-2 block text-sm font-bold text-slate-200">
          تأكيد كلمة المرور الجديدة
        </label>
        <input
          id="recovery-password-confirmation"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="h-14 w-full rounded-2xl border border-white/12 bg-white/[0.07] px-4 text-right text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/55 focus:ring-4 focus:ring-cyan-300/10"
          autoComplete="new-password"
          minLength={6}
          required
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="h-14 w-full rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 text-base font-black text-slate-950 shadow-[0_20px_60px_rgba(45,212,191,0.24)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'جارٍ الحفظ...' : 'تحديث كلمة المرور'}
      </button>
      <Link href="/login" className="block text-center text-sm font-black text-cyan-200 underline underline-offset-4">
        العودة لتسجيل الدخول
      </Link>
    </form>
  )
}

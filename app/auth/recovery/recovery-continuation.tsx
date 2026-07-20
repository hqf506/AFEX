'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export function RecoveryContinuation() {
  const [confirmationUrl, setConfirmationUrl] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const fragment = window.location.hash.slice(1)
    const prefix = 'confirmation='
    const timer = window.setTimeout(() => {
      if (fragment.startsWith(prefix)) {
        try {
          const encodedConfirmation = fragment.slice(prefix.length)
          setConfirmationUrl(
            encodedConfirmation.startsWith('https://')
              ? encodedConfirmation
              : decodeURIComponent(encodedConfirmation)
          )
        } catch {
          setConfirmationUrl(null)
        }
      }

      window.history.replaceState(null, '', window.location.pathname)
      setReady(true)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  return (
    <main dir="rtl" className="relative min-h-screen overflow-hidden bg-[#030714] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-[-12rem] top-[-12rem] h-[34rem] w-[34rem] rounded-full bg-cyan-400/20 blur-[120px]" />
        <div className="absolute bottom-[-10rem] left-[-10rem] h-[32rem] w-[32rem] rounded-full bg-emerald-400/16 blur-[120px]" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl items-center justify-center">
        <section className="w-full rounded-[30px] border border-white/12 bg-white/[0.055] p-5 text-right shadow-[0_28px_100px_rgba(0,0,0,0.34)] backdrop-blur-xl md:p-8">
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">
              AFEX
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white">
              متابعة إعادة تعيين كلمة المرور
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              لحماية رابط الاستعادة، لن يتم استخدامه حتى تضغط زر المتابعة بنفسك.
            </p>
          </div>

          {!ready ? (
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-4 text-center text-sm font-bold text-cyan-100">
              جارٍ تجهيز صفحة الاستعادة الآمنة...
            </div>
          ) : confirmationUrl ? (
            <form method="post" action="/auth/recovery/continue" className="space-y-5">
              <input type="hidden" name="confirmation" value={confirmationUrl} />
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-4 text-sm font-bold leading-7 text-emerald-100">
                اضغط «متابعة آمنة» لإكمال التحقق ومتابعة إعادة تعيين كلمة المرور.
              </div>
              <button
                type="submit"
                className="h-14 w-full rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 text-base font-black text-slate-950 shadow-[0_20px_60px_rgba(45,212,191,0.24)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-cyan-300/25"
              >
                متابعة آمنة
              </button>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-4 text-sm font-bold leading-7 text-rose-100">
                رابط إعادة تعيين كلمة المرور غير صالح أو انتهت صلاحيته.
              </div>
              <Link
                href="/login?forgot=password"
                prefetch={false}
                className="flex h-12 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-5 text-sm font-black text-cyan-100"
              >
                طلب رابط جديد
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

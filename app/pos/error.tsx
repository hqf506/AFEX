'use client'

import { useEffect } from 'react'

export default function PosError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[POS ERROR BOUNDARY]', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    })
  }, [error])

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-right text-slate-900">
      <div className="w-full max-w-sm rounded-[28px] border border-red-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-black text-slate-950">
          تعذر فتح نقطة البيع
        </h1>
        <p className="mt-2 text-sm font-bold text-slate-500">
          أعد المحاولة أو افتح شاشة تسجيل الدخول من جديد.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 h-11 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white"
        >
          إعادة المحاولة
        </button>
      </div>
    </main>
  )
}

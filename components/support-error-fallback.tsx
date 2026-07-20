'use client'

import { useRef, useState } from 'react'

type ErrorReportResponse = {
  success?: boolean
  error?: string
  error_reference?: string
  reused?: boolean
  ticket?: { id?: string; ticket_number?: string }
}

export function SupportErrorFallback({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  const lastAttemptAt = useRef(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState('')
  const [result, setResult] = useState<ErrorReportResponse | null>(null)

  async function reportError() {
    if (submitting || result?.success) return
    if (Date.now() - lastAttemptAt.current < 5000) {
      setFailure('يرجى الانتظار قليلًا قبل إعادة إرسال البلاغ.')
      return
    }
    lastAttemptAt.current = Date.now()
    setSubmitting(true)
    setFailure('')
    try {
      const response = await fetch('/api/support/error-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment: comment.trim().slice(0, 1000),
          feature: 'error-boundary',
          error_code: error.digest || '',
        }),
      })
      const data = await response.json().catch(() => null) as ErrorReportResponse | null
      if (!response.ok || !data?.success) {
        setFailure(data?.error || 'تعذر إرسال بلاغ الدعم.')
        return
      }
      setResult(data)
    } catch {
      setFailure('تعذر إرسال البلاغ الآن. يمكنك إعادة المحاولة لاحقًا.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center overflow-x-hidden bg-[#020617] px-4 py-8 text-slate-100 sm:px-6">
      <section className="w-full max-w-2xl rounded-[28px] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl sm:p-8">
        <div className="mb-6 h-1 w-20 rounded-full bg-gradient-to-l from-cyan-300 to-emerald-300" />
        <h1 className="text-xl font-black text-white sm:text-2xl">حدث خطأ غير متوقع.</h1>
        <p className="mt-3 text-sm leading-7 text-slate-400 sm:text-base">يمكنك إعادة المحاولة أو إرسال بلاغ للدعم.</p>

        {!result?.success && (
          <label className="mt-6 block">
            <span className="mb-2 block text-sm font-bold text-slate-300">وش كنت تسوي قبل ما يظهر الخطأ؟</span>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value.slice(0, 1000))}
              maxLength={1000}
              rows={4}
              className="w-full resize-y rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/10"
              placeholder="تعليق اختياري"
            />
            <span className="mt-1 block text-left text-xs text-slate-500">{comment.length}/1000</span>
          </label>
        )}

        {failure && <p role="alert" className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{failure}</p>}
        {result?.success && (
          <div role="status" className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-4 text-sm text-emerald-100">
            <p className="font-black">{result.reused ? 'تم العثور على بلاغ سابق لنفس الخطأ.' : 'تم إرسال البلاغ إلى فريق الدعم.'}</p>
            {result.ticket?.ticket_number && <p className="mt-1 text-emerald-200">رقم التذكرة: {result.ticket.ticket_number}</p>}
            {result.error_reference && <p className="mt-1 break-all text-xs text-emerald-300/80">مرجع الخطأ: {result.error_reference}</p>}
            {result.ticket?.id && <a href={`/admin/support/${encodeURIComponent(result.ticket.id)}`} className="mt-3 inline-flex h-10 items-center rounded-xl border border-emerald-300/25 px-4 text-xs font-black text-emerald-100 transition hover:bg-emerald-300/10">فتح التذكرة</a>}
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={retry} className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-5 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60">
            إعادة المحاولة
          </button>
          <button type="button" onClick={reportError} disabled={submitting || Boolean(result?.success)} className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 text-sm font-black text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">
            {submitting ? 'جارٍ إرسال البلاغ…' : result?.success ? 'تم إبلاغ الدعم' : 'إبلاغ الدعم'}
          </button>
        </div>
      </section>
    </main>
  )
}

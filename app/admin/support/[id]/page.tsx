'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { AdminAlert, AdminEmptyState, AdminGlassSection, AdminLoadingState } from '@/components/admin-ui'
import { usePageAccess } from '@/hooks/use-page-access'
import { getClientCaughtErrorMessage, getClientErrorMessage } from '@/lib/api/client-error'
import {
  formatSupportDate,
  supportCategoryLabels,
  supportEventLabels,
  supportPriorityClass,
  supportPriorityLabels,
  supportSourceLabels,
  supportStatusClass,
  supportStatusLabels,
  type SupportEvent,
  type SupportMessage,
  type SupportTicketDetail,
} from '@/lib/support/ui'

type DetailResponse = {
  success?: boolean
  ticket?: SupportTicketDetail
  messages?: SupportMessage[]
  events?: SupportEvent[]
}

export default function SupportTicketDetailsPage() {
  const params = useParams<{ id: string }>()
  const access = usePageAccess(['admin', 'manager', 'employee'])
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [events, setEvents] = useState<SupportEvent[]>([])
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const requestSequence = useRef(0)

  const loadTicket = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++requestSequence.current
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/support/tickets/${encodeURIComponent(params.id)}`, {
        signal,
        cache: 'no-store',
      })
      const result = (await response.json().catch(() => null)) as DetailResponse | null
      if (!response.ok || !result?.success || !result.ticket) {
        throw new Error(getClientErrorMessage(result, 'تعذر تحميل تفاصيل التذكرة حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
      }
      if (sequence !== requestSequence.current) return
      setTicket(result.ticket)
      setMessages((result.messages || []).filter((message) => message.is_internal !== true))
      setEvents(result.events || [])
    } catch (caughtError) {
      if (signal?.aborted || sequence !== requestSequence.current) return
      setError(getClientCaughtErrorMessage(caughtError, 'تعذر تحميل تفاصيل التذكرة حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
    } finally {
      if (sequence === requestSequence.current) setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    if (!access.allowed) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void loadTicket(controller.signal)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [access.allowed, loadTicket])

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ticket || ticket.status === 'closed' || sending || !reply.trim()) return
    setSending(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`/api/support/tickets/${encodeURIComponent(ticket.id)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply.trim() }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success) {
        throw new Error(getClientErrorMessage(result, 'تعذر إرسال الرد. لم يتم حفظ الرسالة.'))
      }
      setReply('')
      setNotice('تم إرسال ردك إلى فريق الدعم.')
      await loadTicket()
    } catch (caughtError) {
      setError(getClientCaughtErrorMessage(caughtError, 'تعذر إرسال الرد. لم يتم حفظ الرسالة.'))
    } finally {
      setSending(false)
    }
  }

  if (access.loading || !access.allowed || (loading && !ticket)) return <AdminLoadingState />

  if (!ticket) {
    return (
      <main dir="rtl" className="mx-auto w-full max-w-5xl space-y-4">
        {error ? <AdminAlert tone="error">{error}</AdminAlert> : null}
        <AdminEmptyState title="تعذر عرض التذكرة" description="ارجع إلى قائمة الدعم ثم حاول مرة أخرى." />
        <Link href="/admin/support" className="inline-flex h-11 items-center rounded-2xl border border-cyan-300/20 px-5 text-sm font-black text-cyan-100">العودة إلى الدعم الفني</Link>
      </main>
    )
  }

  const replyDisabled = ticket.status === 'closed'

  return (
    <main dir="rtl" className="mx-auto w-full max-w-7xl space-y-5">
      <Link href="/admin/support" className="inline-flex h-10 items-center rounded-xl border border-white/10 px-4 text-xs font-black text-slate-300 transition hover:border-cyan-300/30 hover:text-white">العودة إلى التذاكر</Link>
      <header className="rounded-[28px] border border-cyan-300/15 bg-gradient-to-l from-cyan-400/10 via-white/[0.055] to-transparent p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-black text-cyan-200">{ticket.ticket_number}</p>
            <h1 className="mt-2 text-2xl font-black text-white md:text-3xl">{ticket.title}</h1>
            <p className="mt-3 text-sm text-slate-400">أُنشئت في {formatSupportDate(ticket.created_at)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1.5 text-xs font-black ${supportPriorityClass(ticket.priority)}`}>{supportPriorityLabels[ticket.priority]}</span>
            <span className={`rounded-full border px-3 py-1.5 text-xs font-black ${supportStatusClass(ticket.status)}`}>{supportStatusLabels[ticket.status]}</span>
          </div>
        </div>
      </header>

      {notice ? <AdminAlert tone="success">{notice}</AdminAlert> : null}
      {error ? <AdminAlert tone="error">{error}</AdminAlert> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.75fr)]">
        <div className="space-y-5">
          <AdminGlassSection>
            <h2 className="text-lg font-black text-white">وصف المشكلة</h2>
            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-8 text-slate-300">{ticket.description}</p>
          </AdminGlassSection>

          <AdminGlassSection>
            <div className="flex items-center justify-between gap-4">
              <div><h2 className="text-lg font-black text-white">المحادثة</h2><p className="mt-1 text-xs text-slate-500">{messages.length.toLocaleString('ar-SA')} رسالة</p></div>
              {loading ? <span className="text-xs font-bold text-cyan-200">جارٍ التحديث...</span> : null}
            </div>
            <div className="mt-5 space-y-4">
              {messages.length === 0 ? <AdminEmptyState title="لا توجد رسائل بعد" /> : messages.map((message) => {
                const fromCustomer = message.sender_type === 'customer'
                const senderLabel = fromCustomer ? 'أنت' : message.sender_type === 'provider' ? 'فريق الدعم' : 'النظام'
                return (
                  <article key={message.id} className={`max-w-[92%] rounded-3xl border p-4 sm:max-w-[78%] ${fromCustomer ? 'mr-auto border-cyan-300/20 bg-cyan-300/10' : 'ml-auto border-white/10 bg-white/[0.045]'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className={`text-xs font-black ${fromCustomer ? 'text-cyan-200' : 'text-white'}`}>{senderLabel}</p>
                      <time className="text-[11px] text-slate-500">{formatSupportDate(message.created_at)}</time>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-200">{message.message}</p>
                  </article>
                )
              })}
            </div>
          </AdminGlassSection>

          <AdminGlassSection>
            <h2 className="text-lg font-black text-white">إضافة رد</h2>
            {replyDisabled ? <AdminAlert tone="info" className="mt-4">هذه التذكرة مغلقة ولا تقبل ردودًا جديدة.</AdminAlert> : null}
            <form onSubmit={submitReply} className="mt-4 space-y-3">
              <label className="sr-only" htmlFor="support-reply">نص الرد</label>
              <textarea id="support-reply" required maxLength={5000} rows={5} disabled={replyDisabled || sending} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="اكتب ردك لفريق الدعم..." className="w-full resize-y rounded-2xl border border-white/10 bg-[#040b14] px-4 py-3 text-sm leading-7 text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-50" />
              <button type="submit" disabled={replyDisabled || sending || !reply.trim()} className="h-11 rounded-2xl bg-cyan-300 px-6 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">{sending ? 'جارٍ الإرسال...' : 'إرسال الرد'}</button>
            </form>
          </AdminGlassSection>
        </div>

        <aside className="space-y-5">
          <AdminGlassSection>
            <h2 className="text-lg font-black text-white">بيانات التذكرة</h2>
            <dl className="mt-4 divide-y divide-white/[0.07] text-sm">
              {[
                ['التصنيف', supportCategoryLabels[ticket.category]],
                ['المصدر', supportSourceLabels[ticket.source]],
                ['الفرع', ticket.branch_id ? 'الفرع المرتبط بحسابك' : 'جميع الفروع'],
                ['آخر تحديث', formatSupportDate(ticket.updated_at)],
                ['آخر رسالة', formatSupportDate(ticket.last_message_at)],
              ].map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 py-3"><dt className="text-slate-500">{label}</dt><dd className="text-left font-bold text-slate-200">{value}</dd></div>)}
            </dl>
          </AdminGlassSection>

          <AdminGlassSection>
            <h2 className="text-lg font-black text-white">سجل التذكرة</h2>
            <div className="mt-5 space-y-4">
              {events.length === 0 ? <p className="text-sm text-slate-500">لا توجد أحداث مسجلة.</p> : events.map((event) => (
                <div key={event.id} className="relative border-r border-cyan-300/20 pr-5">
                  <span className="absolute -right-1.5 top-1 h-3 w-3 rounded-full border-2 border-[#07111d] bg-cyan-300" />
                  <p className="text-sm font-bold text-slate-200">{supportEventLabels[event.event_type] || 'تم تحديث التذكرة'}</p>
                  <time className="mt-1 block text-xs text-slate-500">{formatSupportDate(event.created_at)}</time>
                </div>
              ))}
            </div>
          </AdminGlassSection>
        </aside>
      </div>
    </main>
  )
}

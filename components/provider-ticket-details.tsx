'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdminDarkSelect } from '@/components/admin-dark-select'
import { AdminAlert, AdminEmptyState, AdminGlassSection, AdminLoadingState } from '@/components/admin-ui'
import { SupportAttachmentList, SupportAttachmentPicker, uploadSupportAttachments } from '@/components/support-attachments'
import { getClientCaughtErrorMessage, getClientErrorMessage } from '@/lib/api/client-error'
import { SUPPORT_CATEGORIES, SUPPORT_PRIORITIES, SUPPORT_STATUSES, type SupportCategory, type SupportPriority, type SupportStatus } from '@/lib/support/contracts'
import { formatSupportDate, supportCategoryLabels, supportEventLabels, supportPriorityClass, supportPriorityLabels, supportSourceLabels, supportStatusClass, supportStatusLabels, type SupportAttachment, type SupportSource } from '@/lib/support/ui'

type ProviderTicketDetail = {
  ticket_number: string
  tenant_name: string
  branch_name: string | null
  customer_name: string | null
  customer_username: string | null
  customer_email: string | null
  customer_phone: string | null
  category: SupportCategory
  priority: SupportPriority
  status: SupportStatus
  title: string
  description: string
  source: SupportSource
  created_at: string
  updated_at: string
  assignment_key: string
  assigned_name: string | null
  assigned_to_me: boolean
}

type ProviderMessage = {
  sender_type: 'customer' | 'provider' | 'system'
  message: string
  created_at: string
}

type ProviderEvent = { event_type: string; label: string | null; actor: string | null; created_at: string }
type InternalNote = { author: string; note: string; created_at: string }
type ProviderAgent = { key: string; name: string; is_me: boolean }
type DetailResponse = { success?: boolean; ticket?: ProviderTicketDetail; messages?: ProviderMessage[]; internal_notes?: InternalNote[]; events?: ProviderEvent[]; agents?: ProviderAgent[]; attachments?: SupportAttachment[] }

function TicketDetailRow({ label, value, href }: { label: string; value: string | null; href?: string }) {
  const displayValue = value?.trim() || 'غير متوفر'
  return <div className="flex min-w-0 items-start justify-between gap-4 py-3"><dt className="shrink-0 text-slate-500">{label}</dt><dd className="min-w-0 break-words text-left font-bold text-slate-200 [overflow-wrap:anywhere]">{href && value ? <a href={href} className="select-all transition hover:text-cyan-200">{displayValue}</a> : displayValue}</dd></div>
}

export function ProviderTicketDetails({ ticketId, mode = 'page', onMutated }: { ticketId: string; mode?: 'page' | 'drawer'; onMutated?: () => void }) {
  const [ticket, setTicket] = useState<ProviderTicketDetail | null>(null)
  const [messages, setMessages] = useState<ProviderMessage[]>([])
  const [events, setEvents] = useState<ProviderEvent[]>([])
  const [internalNotes, setInternalNotes] = useState<InternalNote[]>([])
  const [agents, setAgents] = useState<ProviderAgent[]>([])
  const [attachments, setAttachments] = useState<SupportAttachment[]>([])
  const [replyFiles, setReplyFiles] = useState<File[]>([])
  const [reply, setReply] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [updatingField, setUpdatingField] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const requestSequence = useRef(0)
  const replyFormRef = useRef<HTMLFormElement | null>(null)
  const noteFormRef = useRef<HTMLFormElement | null>(null)

  const loadTicket = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++requestSequence.current
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/provider/support/tickets/${encodeURIComponent(ticketId)}`, { signal, cache: 'no-store' })
      const result = (await response.json().catch(() => null)) as DetailResponse | null
      if (!response.ok || !result?.success || !result.ticket) {
        const fallback = response.status === 403 ? 'لا تملك صلاحية الوصول إلى هذه التذكرة.' : response.status === 404 ? 'التذكرة غير موجودة.' : 'تعذر تحميل تفاصيل تذكرة الدعم.'
        throw new Error(getClientErrorMessage(result, fallback))
      }
      if (sequence !== requestSequence.current) return
      setTicket(result.ticket)
      setMessages(result.messages || [])
      setInternalNotes(result.internal_notes || [])
      setEvents(result.events || [])
      setAgents(result.agents || [])
      setAttachments(result.attachments || [])
    } catch (caughtError) {
      if (signal?.aborted || sequence !== requestSequence.current) return
      setError(getClientCaughtErrorMessage(caughtError, 'تعذر تحميل تفاصيل تذكرة الدعم.'))
    } finally {
      if (sequence === requestSequence.current) setLoading(false)
    }
  }, [ticketId])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => { void loadTicket(controller.signal) }, 0)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [loadTicket])

  const timeline = useMemo(() => [
    ...events.filter((event) => event.event_type !== 'message_added').map((event) => ({
      label: event.label || supportEventLabels[event.event_type] || 'تم تحديث التذكرة',
      created_at: event.created_at,
      tone: 'cyan',
      actor: event.actor,
    })),
    ...messages.map((message) => ({
      label: message.sender_type === 'provider' ? 'رد فريق AFEX' : message.sender_type === 'customer' ? 'رد العميل' : 'رسالة من النظام',
      created_at: message.created_at,
      tone: message.sender_type === 'provider' ? 'emerald' : 'cyan',
      actor: null,
    })),
  ].sort((first, second) => new Date(first.created_at).getTime() - new Date(second.created_at).getTime()), [events, messages])

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ticket || ticket.status === 'closed' || sending || !reply.trim()) return
    setSending(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`/api/support/tickets/${encodeURIComponent(ticketId)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply.trim() }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success) throw new Error(getClientErrorMessage(result, 'تعذر إرسال الرد. لم يتم حفظ الرسالة.'))
      try {
        await uploadSupportAttachments(ticketId, replyFiles, { messageId: result.message_id })
      } catch {
        setError('تم إرسال الرد، لكن تعذر رفع بعض المرفقات.')
      }
      setReply('')
      setReplyFiles([])
      setNotice('تم إرسال الرد إلى العميل.')
      await loadTicket()
      onMutated?.()
    } catch (caughtError) {
      setError(getClientCaughtErrorMessage(caughtError, 'تعذر إرسال الرد. لم يتم حفظ الرسالة.'))
    } finally {
      setSending(false)
    }
  }

  async function updateTicket(field: 'status' | 'priority' | 'category', value: string) {
    if (!ticket || updatingField) return
    if (ticket[field] === value) return
    setUpdatingField(field)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`/api/provider/support/tickets/${encodeURIComponent(ticketId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success) throw new Error(getClientErrorMessage(result, 'تعذر تحديث التذكرة. لم يتم حفظ التغيير.'))
      setNotice('تم تحديث التذكرة بنجاح.')
      await loadTicket()
      onMutated?.()
    } catch (caughtError) {
      setError(getClientCaughtErrorMessage(caughtError, 'تعذر تحديث التذكرة. لم يتم حفظ التغيير.'))
    } finally {
      setUpdatingField(null)
    }
  }

  async function submitInternalNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingNote || !note.trim()) return
    setSavingNote(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`/api/provider/support/tickets/${encodeURIComponent(ticketId)}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success) throw new Error(getClientErrorMessage(result, 'تعذر إضافة الملاحظة الداخلية.'))
      setNote('')
      setNotice('تمت إضافة الملاحظة الداخلية.')
      await loadTicket()
      onMutated?.()
    } catch (caughtError) {
      setError(getClientCaughtErrorMessage(caughtError, 'تعذر إضافة الملاحظة الداخلية.'))
    } finally {
      setSavingNote(false)
    }
  }

  async function updateAssignment(value: string) {
    if (!ticket || updatingField) return
    if (ticket.assignment_key === value) return
    setUpdatingField('assignment')
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`/api/provider/support/tickets/${encodeURIComponent(ticketId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_key: value }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success) throw new Error(getClientErrorMessage(result, 'تعذر تحديث مسؤول التذكرة.'))
      setNotice('تم تحديث مسؤول التذكرة.')
      await loadTicket()
      onMutated?.()
    } catch (caughtError) {
      setError(getClientCaughtErrorMessage(caughtError, 'تعذر تحديث مسؤول التذكرة.'))
    } finally {
      setUpdatingField(null)
    }
  }

  if (loading && !ticket) return <AdminLoadingState className="mt-8" />
  if (!ticket) return <main dir="rtl" className="mx-auto max-w-4xl space-y-4"><AdminAlert tone="error">{error || 'تعذر تحميل تفاصيل تذكرة الدعم.'}</AdminAlert><button type="button" onClick={() => void loadTicket()} className="inline-flex h-11 items-center rounded-2xl border border-cyan-300/20 px-5 text-sm font-black text-cyan-100">إعادة المحاولة</button></main>

  const replyDisabled = ticket.status === 'closed'

  return (
    <main dir="rtl" className={`mx-auto w-full min-w-0 space-y-5 ${mode === 'drawer' ? 'max-w-none' : 'max-w-[1450px]'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">{mode === 'page' ? <Link href="/provider/support" className="inline-flex h-10 items-center rounded-xl border border-white/10 px-4 text-xs font-black text-slate-300 transition hover:border-cyan-300/30 hover:text-white">العودة إلى التذاكر</Link> : <span />}<Link href={`/provider/support/${encodeURIComponent(ticketId)}`} className="inline-flex h-10 items-center rounded-xl border border-cyan-300/20 px-4 text-xs font-black text-cyan-100">فتح في صفحة مستقلة</Link></div>
      <header className="rounded-[28px] border border-cyan-300/15 bg-gradient-to-l from-emerald-300/10 via-cyan-300/[0.07] to-transparent p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] md:p-7">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0"><p className="text-sm font-black text-cyan-200">{ticket.ticket_number}</p><h1 className="mt-2 break-words text-2xl font-black text-white md:text-3xl">{ticket.title}</h1><p className="mt-3 text-sm text-slate-400">{ticket.tenant_name} · أُنشئت في {formatSupportDate(ticket.created_at)}</p></div>
          <div className="flex flex-wrap gap-2"><span className={`rounded-full border px-3 py-1.5 text-xs font-black ${supportPriorityClass(ticket.priority)}`}>{supportPriorityLabels[ticket.priority]}</span><span className={`rounded-full border px-3 py-1.5 text-xs font-black ${supportStatusClass(ticket.status)}`}>{supportStatusLabels[ticket.status]}</span></div>
        </div>
      </header>
      {notice ? <AdminAlert tone="success">{notice}</AdminAlert> : null}
      {error ? <AdminAlert tone="error">{error}</AdminAlert> : null}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.8fr)]">
        <div className="min-w-0 space-y-5">
          <AdminGlassSection><h2 className="text-lg font-black text-white">وصف المشكلة</h2><p className="mt-4 min-w-0 whitespace-pre-wrap break-words text-sm leading-8 text-slate-300">{ticket.description}</p></AdminGlassSection>
          <AdminGlassSection>
            <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-black text-white">المحادثة</h2><p className="mt-1 text-xs text-slate-500">{messages.length.toLocaleString('ar-SA')} رسالة</p></div>{loading ? <span className="text-xs font-bold text-cyan-200">جارٍ التحديث...</span> : null}</div>
            <div className="mt-5 space-y-4">{messages.length === 0 ? <AdminEmptyState title="لا توجد رسائل بعد" description="ستظهر محادثة العميل وفريق AFEX هنا." /> : messages.map((message, index) => {
              const fromCustomer = message.sender_type === 'customer'
              const sender = fromCustomer ? 'العميل' : message.sender_type === 'provider' ? 'فريق AFEX' : 'النظام'
              return <article key={`${message.created_at}-${index}`} className={`min-w-0 max-w-[92%] rounded-3xl border p-4 sm:max-w-[78%] ${fromCustomer ? 'mr-0 border-cyan-300/20 bg-cyan-300/10' : 'mr-auto border-emerald-300/20 bg-emerald-300/[0.07]'}`}><div className="flex flex-wrap items-center justify-between gap-3"><p className={`text-xs font-black ${fromCustomer ? 'text-cyan-200' : 'text-emerald-200'}`}>{sender}</p><time className="text-[11px] text-slate-500">{formatSupportDate(message.created_at)}</time></div><p className="mt-3 min-w-0 whitespace-pre-wrap break-words text-sm leading-7 text-slate-200">{message.message}</p></article>
            })}</div>
          </AdminGlassSection>
          <AdminGlassSection>
            <h2 className="text-lg font-black text-white">الرد على العميل</h2>
            <div className="mt-4"><SupportAttachmentPicker files={replyFiles} onChange={setReplyFiles} disabled={replyDisabled || sending} /></div>
            {replyDisabled ? <AdminAlert tone="info" className="mt-4">التذكرة مغلقة. يمكنك عرض السجل، لكن لا يمكن إرسال رد جديد.</AdminAlert> : null}
            <form ref={replyFormRef} onSubmit={submitReply} className="mt-4 space-y-3"><label className="sr-only" htmlFor="provider-support-reply">نص الرد</label><textarea id="provider-support-reply" required maxLength={5000} rows={6} disabled={replyDisabled || sending} value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); if (!replyDisabled && !sending && reply.trim()) replyFormRef.current?.requestSubmit() } }} placeholder="اكتب رد فريق AFEX..." className="min-w-0 w-full resize-y rounded-2xl border border-white/10 bg-[#040b14] px-4 py-3 text-sm leading-7 text-white outline-none placeholder:text-slate-600 focus:border-emerald-300/50 disabled:cursor-not-allowed disabled:opacity-50" /><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500"><span aria-live="polite">{reply.length.toLocaleString('ar-SA')} / ٥٬٠٠٠</span> · Ctrl+Enter أو Cmd+Enter</p><button type="submit" disabled={replyDisabled || sending || !reply.trim()} className="h-11 w-full rounded-2xl bg-emerald-300 px-6 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{sending ? 'جارٍ الإرسال...' : 'إرسال الرد'}</button></div></form>
          </AdminGlassSection>
          <AdminGlassSection><h2 className="mb-4 text-lg font-black text-white">المرفقات</h2><SupportAttachmentList attachments={attachments} /></AdminGlassSection>
          <AdminGlassSection>
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black text-white">الملاحظات الداخلية</h2><p className="mt-1 text-xs text-amber-200">مرئية لفريق AFEX فقط ولا تظهر للعميل.</p></div><span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-black text-amber-100">داخلي</span></div>
            <form ref={noteFormRef} onSubmit={submitInternalNote} className="mt-4 space-y-3"><label className="sr-only" htmlFor="provider-internal-note">الملاحظة الداخلية</label><textarea id="provider-internal-note" required maxLength={5000} rows={5} disabled={savingNote} value={note} onChange={(event) => setNote(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); if (!savingNote && note.trim()) noteFormRef.current?.requestSubmit() } }} placeholder="اكتب ملاحظة داخلية لفريق AFEX..." className="min-w-0 w-full resize-y rounded-2xl border border-amber-300/15 bg-[#040b14] px-4 py-3 text-sm leading-7 text-white outline-none placeholder:text-slate-600 focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-50" /><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500"><span aria-live="polite">{note.length.toLocaleString('ar-SA')} / ٥٬٠٠٠</span> · Ctrl+Enter أو Cmd+Enter</p><button type="submit" disabled={savingNote || !note.trim()} className="h-11 w-full rounded-2xl bg-amber-300 px-6 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{savingNote ? 'جارٍ الحفظ...' : 'إضافة ملاحظة داخلية'}</button></div></form>
            <div className="mt-6 space-y-3">{internalNotes.length === 0 ? <AdminEmptyState title="لا توجد ملاحظات داخلية" description="أضف أول ملاحظة لتنسيق العمل داخل فريق AFEX." /> : internalNotes.map((item, index) => <article key={`${item.created_at}-${index}`} className="min-w-0 rounded-3xl border border-amber-300/15 bg-amber-300/[0.055] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-black text-amber-100">{item.author}</p><time className="text-[11px] text-slate-500">{formatSupportDate(item.created_at)}</time></div><p className="mt-3 min-w-0 whitespace-pre-wrap break-words text-sm leading-7 text-slate-200">{item.note}</p></article>)}</div>
          </AdminGlassSection>
        </div>

        <aside className="min-w-0 space-y-5">
          <AdminGlassSection><h2 className="text-lg font-black text-white">إجراءات التذكرة</h2><div className="mt-4 space-y-4"><label className="block space-y-2 text-xs font-bold text-slate-300"><span>الإسناد</span><AdminDarkSelect value={ticket.assignment_key} disabled={Boolean(updatingField)} onChange={(value) => void updateAssignment(value)} options={[{ value: 'unassigned', label: 'غير مسندة' }, { value: 'me', label: 'إسناد إليّ' }, ...agents.filter((agent) => !agent.is_me).map((agent) => ({ value: agent.key, label: agent.name }))]} ariaLabel="تحديث مسؤول التذكرة" /></label><div className="flex flex-wrap gap-2">{ticket.assigned_to_me ? <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-black text-emerald-100">مسندة إليّ</span> : <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-black text-slate-300">{ticket.assigned_name || 'غير مسندة'}</span>}</div><label className="block space-y-2 text-xs font-bold text-slate-300"><span>الحالة</span><AdminDarkSelect value={ticket.status} disabled={Boolean(updatingField)} onChange={(value) => void updateTicket('status', value)} options={SUPPORT_STATUSES.map((value) => ({ value, label: supportStatusLabels[value] }))} ariaLabel="تحديث حالة التذكرة" /></label><label className="block space-y-2 text-xs font-bold text-slate-300"><span>الأولوية</span><AdminDarkSelect value={ticket.priority} disabled={Boolean(updatingField)} onChange={(value) => void updateTicket('priority', value)} options={SUPPORT_PRIORITIES.map((value) => ({ value, label: supportPriorityLabels[value] }))} ariaLabel="تحديث أولوية التذكرة" /></label><label className="block space-y-2 text-xs font-bold text-slate-300"><span>التصنيف</span><AdminDarkSelect value={ticket.category} disabled={Boolean(updatingField)} onChange={(value) => void updateTicket('category', value)} options={SUPPORT_CATEGORIES.map((value) => ({ value, label: supportCategoryLabels[value] }))} ariaLabel="تحديث تصنيف التذكرة" /></label>{updatingField ? <p className="text-xs font-bold text-cyan-200">جارٍ حفظ التغيير...</p> : null}</div></AdminGlassSection>
          <AdminGlassSection><h2 className="text-lg font-black text-white">بيانات التذكرة</h2><dl className="mt-4 divide-y divide-white/[0.07] text-sm"><TicketDetailRow label="المنشأة" value={ticket.tenant_name} /><TicketDetailRow label="اسم العميل" value={ticket.customer_name} /><TicketDetailRow label="اسم المستخدم" value={ticket.customer_username} /><TicketDetailRow label="البريد الإلكتروني" value={ticket.customer_email} href={ticket.customer_email ? `mailto:${ticket.customer_email}` : undefined} /><TicketDetailRow label="رقم الجوال" value={ticket.customer_phone} href={ticket.customer_phone ? `tel:${ticket.customer_phone}` : undefined} /><TicketDetailRow label="التصنيف" value={supportCategoryLabels[ticket.category]} /><TicketDetailRow label="المصدر" value={supportSourceLabels[ticket.source]} /><TicketDetailRow label="تاريخ الإنشاء" value={formatSupportDate(ticket.created_at)} /><TicketDetailRow label="آخر تحديث" value={formatSupportDate(ticket.updated_at)} /></dl></AdminGlassSection>
          <AdminGlassSection><h2 className="text-lg font-black text-white">سجل التذكرة</h2>{timeline.length === 0 ? <p className="mt-4 text-sm text-slate-500">لا توجد أحداث مسجلة.</p> : <ol className="relative mt-5 border-r border-cyan-300/20">{timeline.map((item, index) => <li key={`${item.created_at}-${item.label}-${index}`} className="relative min-w-0 pb-6 pr-6 last:pb-0"><span className={`absolute -right-1.5 top-1 h-3 w-3 rounded-full border-2 border-[#07111d] ${item.tone === 'emerald' ? 'bg-emerald-300' : 'bg-cyan-300'}`} /><p className="break-words text-sm font-bold text-slate-200">{item.label}</p>{item.actor ? <p className="mt-1 text-xs font-bold text-cyan-200">{item.actor}</p> : null}<time className="mt-1 block text-xs text-slate-500">{formatSupportDate(item.created_at)}</time></li>)}</ol>}</AdminGlassSection>
        </aside>
      </div>
    </main>
  )
}

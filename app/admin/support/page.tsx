'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { AdminDarkSelect } from '@/components/admin-dark-select'
import { AdminAlert, AdminEmptyState, AdminGlassSection, AdminLoadingState } from '@/components/admin-ui'
import { SupportAttachmentPicker, uploadSupportAttachments } from '@/components/support-attachments'
import { MobileFilterSheet } from '@/components/mobile/mobile-overlays'
import { MobilePageHeader } from '@/components/mobile/mobile-primitives'
import { usePageAccess } from '@/hooks/use-page-access'
import { getClientCaughtErrorMessage, getClientErrorMessage } from '@/lib/api/client-error'
import { SUPPORT_CATEGORIES, SUPPORT_PRIORITIES } from '@/lib/support/contracts'
import {
  supportCategoryLabels,
  supportPriorityClass,
  supportPriorityLabels,
  supportStatusClass,
  supportStatusLabels,
  type SupportCategory,
  type SupportPriority,
  type SupportStatus,
  type SupportTicketListItem,
  formatSupportDate,
} from '@/lib/support/ui'

const PAGE_SIZE = 25
const allowedRoles = ['admin', 'manager', 'employee'] as const

type TicketsResponse = {
  success?: boolean
  tickets?: SupportTicketListItem[]
  total?: number
  error?: string
}

type CreateTicketResponse = {
  success?: boolean
  ticket?: { id?: string; ticket_number?: string }
  error?: string
}

const emptyForm = {
  category: 'technical_error' as SupportCategory,
  priority: 'normal' as SupportPriority,
  title: '',
  description: '',
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-3xl border p-4 ${tone}`}>
      <p className="text-xs font-bold opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-black">{value.toLocaleString('ar-SA')}</p>
    </div>
  )
}

export default function SupportTicketsPage() {
  const access = usePageAccess([...allowedRoles])
  const [tickets, setTickets] = useState<SupportTicketListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [category, setCategory] = useState('')
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [attachmentWarning, setAttachmentWarning] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [createFiles, setCreateFiles] = useState<File[]>([])
  const [createdTicketId, setCreatedTicketId] = useState<string | null>(null)
  const [refreshSequence, setRefreshSequence] = useState(0)
  const requestSequence = useRef(0)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1)
      setDebouncedSearch(search.trim())
    }, 350)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!access.allowed) return
    const controller = new AbortController()
    const sequence = ++requestSequence.current

    async function loadTickets() {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
        })
        if (debouncedSearch) params.set('search', debouncedSearch)
        if (status) params.set('status', status)
        if (priority) params.set('priority', priority)
        if (category) params.set('category', category)
        const response = await fetch(`/api/support/tickets?${params}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
        const result = (await response.json().catch(() => null)) as TicketsResponse | null
        if (!response.ok || !result?.success) {
          throw new Error(getClientErrorMessage(result, 'تعذر تحميل تذاكر الدعم حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
        }
        if (sequence !== requestSequence.current) return
        setTickets(result.tickets || [])
        setTotal(result.total || 0)
      } catch (caughtError) {
        if (controller.signal.aborted || sequence !== requestSequence.current) return
        setError(getClientCaughtErrorMessage(caughtError, 'تعذر تحميل تذاكر الدعم حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
      } finally {
        if (sequence === requestSequence.current) setLoading(false)
      }
    }

    void loadTickets()
    return () => controller.abort()
  }, [access.allowed, category, debouncedSearch, page, priority, refreshSequence, status])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const summary = useMemo(() => {
    const counts: Record<SupportStatus, number> = {
      new: 0,
      investigating: 0,
      waiting_customer: 0,
      resolved: 0,
      closed: 0,
    }
    tickets.forEach((ticket) => {
      counts[ticket.status] += 1
    })
    return counts
  }, [tickets])

  function clearFilters() {
    setSearch('')
    setDebouncedSearch('')
    setStatus('')
    setPriority('')
    setCategory('')
    setPage(1)
  }

  async function submitTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (creating) return
    setCreating(true)
    setCreateError(null)
    setAttachmentWarning(null)
    const createController = new AbortController()
    const createTimeout = window.setTimeout(() => createController.abort(), 30_000)
    try {
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: createController.signal,
        body: JSON.stringify({
          category: form.category,
          priority: form.priority,
          title: form.title.trim(),
          description: form.description.trim(),
          source: 'manual',
        }),
      })
      const result = (await response.json().catch(() => null)) as CreateTicketResponse | null
      if (!response.ok || !result?.success || !result?.ticket?.id) {
        throw new Error(getClientErrorMessage(result, 'تعذر إنشاء التذكرة. لم يتم حفظ الطلب.'))
      }
      window.clearTimeout(createTimeout)
      const ticketId = result.ticket.id
      const filesToUpload = createFiles
      setCreateOpen(false)
      setForm(emptyForm)
      setCreateFiles([])
      setCreatedTicketId(ticketId)
      setNotice('تم إنشاء التذكرة بنجاح.')
      setRefreshSequence((value) => value + 1)
      try {
        await uploadSupportAttachments(ticketId, filesToUpload, { creation: true, timeoutMs: 60_000 })
      } catch {
        setAttachmentWarning('تم إنشاء التذكرة بنجاح، لكن تعذر رفع بعض المرفقات. يمكنك إضافتها مع رد جديد.')
      }
    } catch (caughtError) {
      setCreateError(getClientCaughtErrorMessage(caughtError, 'تعذر إنشاء التذكرة. لم يتم حفظ الطلب.'))
    } finally {
      window.clearTimeout(createTimeout)
      setCreating(false)
    }
  }

  if (access.loading || !access.allowed) return <AdminLoadingState />

  return (
    <main dir="rtl" className="mx-auto w-full max-w-7xl space-y-5">
      <MobilePageHeader title="الدعم الفني" subtitle="تذاكر الدعم" action={<button type="button" onClick={() => { setCreateError(null); setCreateOpen(true) }} className="grid size-10 place-items-center rounded-xl bg-cyan-300 text-xl font-black text-slate-950" aria-label="إنشاء تذكرة">+</button>} />
      <header className="hidden flex-col gap-4 rounded-[28px] border border-cyan-300/15 bg-gradient-to-l from-cyan-400/10 via-white/[0.055] to-transparent p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] md:flex md:flex-row md:items-center md:justify-between md:p-7">
        <div>
          <p className="text-xs font-black tracking-[0.18em] text-cyan-300">AFEX SUPPORT</p>
          <h1 className="mt-2 text-2xl font-black text-white md:text-3xl">الدعم الفني</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">تابع طلبات الدعم وتواصل مع الفريق الفني من مكان واحد.</p>
        </div>
        <button type="button" onClick={() => { setCreateError(null); setCreateOpen(true) }} className="h-11 rounded-2xl bg-cyan-300 px-5 text-sm font-black text-slate-950 transition hover:bg-cyan-200">
          إنشاء تذكرة
        </button>
      </header>

      {notice ? (
        <div className="fixed left-4 top-4 z-[60] w-[min(24rem,calc(100vw-2rem))]">
          <AdminAlert tone="success">{notice}</AdminAlert>
        </div>
      ) : null}
      {attachmentWarning ? (
        <div className="fixed left-4 top-24 z-[60] w-[min(24rem,calc(100vw-2rem))]">
          <AdminAlert tone="warning">{attachmentWarning}</AdminAlert>
        </div>
      ) : null}
      {error ? <AdminAlert tone="error">{error}</AdminAlert> : null}

      <section aria-label="ملخص التذاكر في الصفحة الحالية" className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="إجمالي النتائج" value={total} tone="border-cyan-300/20 bg-cyan-400/10 text-cyan-100" />
        <SummaryCard label={supportStatusLabels.new} value={summary.new} tone="border-cyan-300/15 bg-white/[0.045] text-white" />
        <SummaryCard label={supportStatusLabels.investigating} value={summary.investigating} tone="border-violet-300/15 bg-white/[0.045] text-white" />
        <SummaryCard label={supportStatusLabels.waiting_customer} value={summary.waiting_customer} tone="border-amber-300/15 bg-white/[0.045] text-white" />
        <SummaryCard label={supportStatusLabels.resolved} value={summary.resolved} tone="border-emerald-300/15 bg-white/[0.045] text-white" />
        <SummaryCard label={supportStatusLabels.closed} value={summary.closed} tone="border-slate-500/20 bg-white/[0.045] text-white" />
      </section>

      <div data-mobile-admin-support-filters className="space-y-3 md:hidden">
        <label className="block space-y-2 text-xs font-bold text-slate-300"><span>البحث</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="رقم التذكرة أو العنوان" className="h-11 w-full rounded-2xl border border-white/10 bg-[#06111f] px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50" /></label>
        <div className="grid grid-cols-2 gap-2 min-[390px]:grid-cols-4">
          {(['', 'new', 'investigating'] as const).map((value) => <button key={value || 'all'} type="button" aria-pressed={status === value} onClick={() => { setStatus(value); setPage(1) }} className={`min-h-11 rounded-xl border px-2 text-xs font-black ${status === value ? 'border-cyan-300/40 bg-cyan-300/15 text-cyan-100' : 'border-white/10 text-slate-300'}`}>{value ? supportStatusLabels[value] : 'الكل'}</button>)}
          <button type="button" onClick={() => setMobileFiltersOpen(true)} className="min-h-11 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.07] px-2 text-xs font-black text-cyan-100">كل الفلاتر</button>
        </div>
      </div>

      <AdminGlassSection className="hidden md:block">
        <div data-responsive-filters className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.6fr)_repeat(3,minmax(150px,1fr))_auto]">
          <label className="space-y-2 text-xs font-bold text-slate-300">
            <span>البحث</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="رقم التذكرة أو العنوان" className="h-11 w-full rounded-2xl border border-white/10 bg-[#06111f] px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50" />
          </label>
          <label className="space-y-2 text-xs font-bold text-slate-300">
            <span>الحالة</span>
            <AdminDarkSelect
              value={status}
              onChange={(value) => { setStatus(value); setPage(1) }}
              options={[
                { value: '', label: 'كل الحالات' },
                ...Object.entries(supportStatusLabels).map(([value, label]) => ({ value, label })),
              ]}
              triggerClassName="h-11"
              ariaLabel="تصفية حسب الحالة"
            />
          </label>
          <label className="space-y-2 text-xs font-bold text-slate-300">
            <span>الأولوية</span>
            <AdminDarkSelect
              value={priority}
              onChange={(value) => { setPriority(value); setPage(1) }}
              options={[
                { value: '', label: 'كل الأولويات' },
                ...SUPPORT_PRIORITIES.map((value) => ({ value, label: supportPriorityLabels[value] })),
              ]}
              triggerClassName="h-11"
              ariaLabel="تصفية حسب الأولوية"
            />
          </label>
          <label className="space-y-2 text-xs font-bold text-slate-300">
            <span>التصنيف</span>
            <AdminDarkSelect
              value={category}
              onChange={(value) => { setCategory(value); setPage(1) }}
              options={[
                { value: '', label: 'كل التصنيفات' },
                ...SUPPORT_CATEGORIES.map((value) => ({ value, label: supportCategoryLabels[value] })),
              ]}
              triggerClassName="h-11"
              ariaLabel="تصفية حسب التصنيف"
            />
          </label>
          <button type="button" onClick={clearFilters} className="h-11 self-end rounded-2xl border border-white/10 px-4 text-sm font-bold text-slate-300 transition hover:border-cyan-300/30 hover:text-white">مسح</button>
        </div>
      </AdminGlassSection>

      <MobileFilterSheet open={mobileFiltersOpen} onClose={() => setMobileFiltersOpen(false)} title="فلاتر تذاكر الدعم" description="استخدم نفس فلاتر القائمة الحالية" footer={<div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => { clearFilters(); setMobileFiltersOpen(false) }} className="h-11 rounded-xl border border-white/10 text-xs font-black text-slate-200">مسح</button><button type="button" onClick={() => setMobileFiltersOpen(false)} className="h-11 rounded-xl bg-cyan-300 text-xs font-black text-slate-950">عرض النتائج</button></div>}>
        <div className="grid gap-4">
          <label className="space-y-2 text-xs font-bold text-slate-300"><span>الحالة</span><AdminDarkSelect value={status} onChange={(value) => { setStatus(value); setPage(1) }} options={[{ value: '', label: 'كل الحالات' }, ...Object.entries(supportStatusLabels).map(([value, label]) => ({ value, label }))]} ariaLabel="تصفية حسب الحالة" /></label>
          <label className="space-y-2 text-xs font-bold text-slate-300"><span>الأولوية</span><AdminDarkSelect value={priority} onChange={(value) => { setPriority(value); setPage(1) }} options={[{ value: '', label: 'كل الأولويات' }, ...SUPPORT_PRIORITIES.map((value) => ({ value, label: supportPriorityLabels[value] }))]} ariaLabel="تصفية حسب الأولوية" /></label>
          <label className="space-y-2 text-xs font-bold text-slate-300"><span>التصنيف</span><AdminDarkSelect value={category} onChange={(value) => { setCategory(value); setPage(1) }} options={[{ value: '', label: 'كل التصنيفات' }, ...SUPPORT_CATEGORIES.map((value) => ({ value, label: supportCategoryLabels[value] }))]} ariaLabel="تصفية حسب التصنيف" /></label>
        </div>
      </MobileFilterSheet>

      {loading ? <AdminLoadingState /> : tickets.length === 0 ? (
        <AdminEmptyState title="لا توجد تذاكر مطابقة" description="غيّر معايير البحث أو أنشئ تذكرة دعم جديدة." />
      ) : (
        <AdminGlassSection className="overflow-hidden p-0 md:p-0">
          <div data-responsive-support-cards="admin" className="grid gap-3 p-3 xl:hidden">
            {tickets.map((ticket) => (
              <article key={ticket.id} className={`min-w-0 rounded-2xl border p-4 ${ticket.id === createdTicketId ? 'border-cyan-300/35 bg-cyan-300/[0.08]' : 'border-white/10 bg-[#07111d]'}`}>
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0"><p className="text-xs font-black text-cyan-200">{ticket.ticket_number}</p><h2 className="mt-2 break-words text-base font-black text-white">{ticket.title}</h2></div>
                  {ticket.source === 'error_report' ? <span className="shrink-0 rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[11px] font-black text-amber-100">بلاغ عطل تلقائي</span> : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${supportPriorityClass(ticket.priority)}`}>{supportPriorityLabels[ticket.priority]}</span><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${supportStatusClass(ticket.status)}`}>{supportStatusLabels[ticket.status]}</span><span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold text-slate-300">{supportCategoryLabels[ticket.category]}</span></div>
                <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.07] pt-3 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between"><p className="text-xs text-slate-400">آخر نشاط: {formatSupportDate(ticket.updated_at)}</p><Link href={`/admin/support/${ticket.id}`} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-cyan-300/20 px-4 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/10 min-[390px]:w-auto">عرض</Link></div>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto xl:block">
            <table className="min-w-[980px] w-full text-right text-sm">
              <thead className="border-b border-white/10 bg-white/[0.035] text-xs text-slate-400">
                <tr>{['رقم التذكرة', 'العنوان', 'التصنيف', 'الأولوية', 'الحالة', 'آخر تحديث', ''].map((label) => <th key={label} className="px-4 py-4 font-black">{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {tickets.map((ticket) => (
                  <tr key={ticket.id} className={`transition hover:bg-cyan-300/[0.035] ${ticket.id === createdTicketId ? 'bg-cyan-300/[0.08]' : ''}`}>
                    <td className="px-4 py-4 font-black text-cyan-200">{ticket.ticket_number}</td>
                    <td className="max-w-[300px] px-4 py-4"><p className="min-w-0 whitespace-normal break-words font-bold text-white">{ticket.title}</p>{ticket.source === 'error_report' ? <span className="mt-2 inline-flex rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[11px] font-black text-amber-100">بلاغ عطل تلقائي</span> : null}</td>
                    <td className="px-4 py-4 text-slate-300">{supportCategoryLabels[ticket.category]}</td>
                    <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${supportPriorityClass(ticket.priority)}`}>{supportPriorityLabels[ticket.priority]}</span></td>
                    <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${supportStatusClass(ticket.status)}`}>{supportStatusLabels[ticket.status]}</span></td>
                    <td className="px-4 py-4 text-slate-400">{formatSupportDate(ticket.updated_at)}</td>
                    <td className="sticky left-0 bg-[#07111d] px-4 py-4">
                      <Link href={`/admin/support/${ticket.id}`} className="inline-flex h-10 items-center rounded-xl border border-cyan-300/20 px-4 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/10">عرض</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div data-responsive-pagination className="flex flex-col gap-3 border-t border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-400">الصفحة {page.toLocaleString('ar-SA')} من {pageCount.toLocaleString('ar-SA')}</p>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="h-10 rounded-xl border border-white/10 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">السابق</button>
              <button type="button" disabled={page >= pageCount || loading} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="h-10 rounded-xl border border-white/10 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">التالي</button>
            </div>
          </div>
        </AdminGlassSection>
      )}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="create-support-title">
          <form data-admin-dialog onSubmit={submitTicket} className="max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-cyan-300/20 bg-[#07111d] p-5 shadow-2xl md:p-7">
            <div className="flex items-start justify-between gap-4">
              <div><h2 id="create-support-title" className="text-xl font-black text-white">إنشاء تذكرة دعم</h2><p className="mt-2 text-sm text-slate-400">صف المشكلة بوضوح وسيتابعها فريق الدعم.</p></div>
              <button type="button" onClick={() => setCreateOpen(false)} className="h-10 rounded-xl border border-white/10 px-3 text-sm font-black text-slate-300">إغلاق</button>
            </div>
            {createError ? <AdminAlert tone="error" className="mt-5">{createError}</AdminAlert> : null}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-bold text-slate-300">
                <span>التصنيف</span>
                <AdminDarkSelect
                  value={form.category}
                  onChange={(value) => setForm((current) => ({ ...current, category: value as SupportCategory }))}
                  options={SUPPORT_CATEGORIES.map((value) => ({ value, label: supportCategoryLabels[value] }))}
                  triggerClassName="h-11"
                  ariaLabel="تصنيف التذكرة"
                />
              </label>
              <label className="space-y-2 text-sm font-bold text-slate-300">
                <span>الأولوية</span>
                <AdminDarkSelect
                  value={form.priority}
                  onChange={(value) => setForm((current) => ({ ...current, priority: value as SupportPriority }))}
                  options={SUPPORT_PRIORITIES.map((value) => ({ value, label: supportPriorityLabels[value] }))}
                  triggerClassName="h-11"
                  ariaLabel="أولوية التذكرة"
                />
              </label>
              <label className="space-y-2 text-sm font-bold text-slate-300 sm:col-span-2"><span>العنوان</span><input required minLength={3} maxLength={180} value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} className="h-11 w-full rounded-2xl border border-white/10 bg-[#040b14] px-4 text-white outline-none focus:border-cyan-300/50" /></label>
              <label className="space-y-2 text-sm font-bold text-slate-300 sm:col-span-2"><span>وصف المشكلة</span><textarea required minLength={5} maxLength={5000} rows={7} value={form.description} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} className="w-full resize-y rounded-2xl border border-white/10 bg-[#040b14] px-4 py-3 leading-7 text-white outline-none focus:border-cyan-300/50" /></label>
              <div className="sm:col-span-2"><SupportAttachmentPicker files={createFiles} onChange={setCreateFiles} disabled={creating} /></div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setCreateOpen(false)} className="h-11 rounded-2xl border border-white/10 px-5 text-sm font-black text-slate-300">إلغاء</button>
              <button type="submit" disabled={creating} className="h-11 rounded-2xl bg-cyan-300 px-6 text-sm font-black text-slate-950 disabled:cursor-wait disabled:opacity-60">{creating ? 'جارٍ الإنشاء...' : 'إرسال التذكرة'}</button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  )
}

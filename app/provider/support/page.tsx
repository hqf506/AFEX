'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { AdminDarkSelect } from '@/components/admin-dark-select'
import { AdminAlert, AdminEmptyState, AdminGlassSection, AdminLoadingState } from '@/components/admin-ui'
import { getClientCaughtErrorMessage, getClientErrorMessage } from '@/lib/api/client-error'
import {
  SUPPORT_CATEGORIES,
  SUPPORT_OPERATIONAL_FILTERS,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  type ProviderOperationalDashboard,
  type ProviderOperationalSummary,
  type ProviderOperationalTicket,
} from '@/lib/support/contracts'
import { formatSupportDate, formatSupportDuration, supportCategoryLabels, supportOperationalClass, supportOperationalLabels, supportPriorityClass, supportPriorityLabels, supportStatusClass, supportStatusLabels } from '@/lib/support/ui'

const PAGE_SIZE = 25

type ProviderResponse = Partial<ProviderOperationalDashboard> & {
  success?: boolean
  organizations?: string[]
}

const emptySummary: ProviderOperationalSummary = { total_active: 0, new: 0, investigating: 0, waiting_customer: 0, resolved: 0, closed: 0, critical: 0, assigned_to_me: 0, unassigned: 0, awaiting_first_response: 0, attention: 0, overdue: 0, operational_waiting_customer: 0 }

const operationalFilterLabels = {
  all: 'جميع الحالات التشغيلية',
  awaiting_first_response: 'بانتظار أول رد',
  needs_follow_up: 'تحتاج متابعة',
  attention: 'تحتاج انتباه',
  overdue: 'متأخرة',
  waiting_customer: 'بانتظار العميل',
} as const

function SummaryCard({ label, value, className }: { label: string; value: number; className: string }) {
  return <div className={`rounded-3xl border p-4 ${className}`}><p className="text-xs font-bold opacity-80">{label}</p><p className="mt-2 text-2xl font-black">{value.toLocaleString('ar-SA')}</p></div>
}

export default function ProviderSupportPage() {
  const [tickets, setTickets] = useState<ProviderOperationalTicket[]>([])
  const [summary, setSummary] = useState(emptySummary)
  const [organizations, setOrganizations] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [category, setCategory] = useState('')
  const [tenant, setTenant] = useState('')
  const [assignment, setAssignment] = useState('')
  const [operationalFilter, setOperationalFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestSequence = useRef(0)

  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setDebouncedSearch(search.trim()) }, 350)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const controller = new AbortController()
    const sequence = ++requestSequence.current
    async function loadTickets() {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
        if (debouncedSearch) params.set('search', debouncedSearch)
        if (status) params.set('status', status)
        if (priority) params.set('priority', priority)
        if (category) params.set('category', category)
        if (tenant) params.set('tenant', tenant)
        if (assignment) params.set('assignment', assignment)
        if (operationalFilter !== 'all') params.set('operational_filter', operationalFilter)
        const response = await fetch(`/api/provider/support/tickets?${params}`, { signal: controller.signal, cache: 'no-store' })
        const result = (await response.json().catch(() => null)) as ProviderResponse | null
        if (!response.ok || !result?.success) throw new Error(getClientErrorMessage(result, response.status === 403 ? 'لا تملك صلاحية الوصول إلى لوحة دعم AFEX.' : 'تعذر تحميل لوحة دعم AFEX حاليًا.'))
        if (sequence !== requestSequence.current) return
        setTickets(result.items || [])
        setTotal(result.pagination?.total || 0)
        setSummary(result.summary || emptySummary)
        setOrganizations(result.organizations || [])
      } catch (caughtError) {
        if (controller.signal.aborted || sequence !== requestSequence.current) return
        setError(getClientCaughtErrorMessage(caughtError, 'تعذر تحميل لوحة دعم AFEX حاليًا.'))
      } finally {
        if (sequence === requestSequence.current) setLoading(false)
      }
    }
    void loadTickets()
    return () => controller.abort()
  }, [assignment, category, debouncedSearch, operationalFilter, page, priority, status, tenant])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  function clearFilters() { setSearch(''); setDebouncedSearch(''); setStatus(''); setPriority(''); setCategory(''); setTenant(''); setAssignment(''); setOperationalFilter('all'); setPage(1) }

  return (
    <main dir="rtl" className="mx-auto w-full min-w-0 max-w-[1500px] space-y-5">
      <header className="rounded-[28px] border border-cyan-300/15 bg-gradient-to-l from-emerald-300/10 via-cyan-300/[0.07] to-transparent p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] md:p-7">
        <p className="text-xs font-black tracking-[0.18em] text-emerald-300">AFEX PROVIDER CONSOLE</p>
        <h1 className="mt-2 text-2xl font-black text-white md:text-3xl">مركز دعم عملاء AFEX</h1>
        <p className="mt-2 text-sm leading-7 text-slate-400">عرض مركزي وآمن لتذاكر منشآت العملاء.</p>
      </header>
      {error ? <AdminAlert tone="error">{error}</AdminAlert> : null}
      <section aria-label="ملخص تذاكر الدعم" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-9">
        <SummaryCard label="التذاكر النشطة" value={summary.total_active} className="border-cyan-300/20 bg-cyan-300/10 text-cyan-100" />
        <SummaryCard label="جديدة" value={summary.new} className="border-cyan-300/15 bg-white/[0.045] text-white" />
        <SummaryCard label="قيد المعالجة" value={summary.investigating} className="border-violet-300/15 bg-white/[0.045] text-white" />
        <SummaryCard label="بانتظار العميل" value={summary.waiting_customer} className="border-amber-300/15 bg-white/[0.045] text-white" />
        <SummaryCard label="تم الحل" value={summary.resolved} className="border-emerald-300/15 bg-white/[0.045] text-white" />
        <SummaryCard label="مغلقة" value={summary.closed} className="border-slate-400/15 bg-white/[0.045] text-white" />
        <SummaryCard label="حرجة" value={summary.critical} className="border-red-300/20 bg-red-400/[0.08] text-red-100" />
        <SummaryCard label="مسندة إليّ" value={summary.assigned_to_me} className="border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100" />
        <SummaryCard label="غير مسندة" value={summary.unassigned} className="border-amber-300/20 bg-amber-300/[0.08] text-amber-100" />
      </section>
      <section aria-label="ملخص مؤشرات التشغيل" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <SummaryCard label="بانتظار أول رد" value={summary.awaiting_first_response} className="border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-100" />
        <SummaryCard label="تحتاج انتباه" value={summary.attention} className="border-amber-300/20 bg-amber-300/[0.08] text-amber-100" />
        <SummaryCard label="متأخرة" value={summary.overdue} className="border-red-300/20 bg-red-400/[0.08] text-red-100" />
        <SummaryCard label="بانتظار العميل تشغيلياً" value={summary.operational_waiting_customer} className="border-violet-300/20 bg-violet-300/[0.08] text-violet-100" />
      </section>
      <AdminGlassSection>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(210px,1.5fr)_repeat(6,minmax(135px,1fr))_auto]">
          <label className="space-y-2 text-xs font-bold text-slate-300"><span>البحث</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="رقم التذكرة أو العنوان" className="h-11 w-full min-w-0 rounded-2xl border border-cyan-300/15 bg-[#06111f] px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50" /></label>
          <label className="space-y-2 text-xs font-bold text-slate-300"><span>الحالة</span><AdminDarkSelect value={status} onChange={(value) => { setStatus(value); setPage(1) }} options={[{ value: '', label: 'كل الحالات' }, ...SUPPORT_STATUSES.map((value) => ({ value, label: supportStatusLabels[value] }))]} triggerClassName="h-11" ariaLabel="تصفية حسب الحالة" /></label>
          <label className="space-y-2 text-xs font-bold text-slate-300"><span>الأولوية</span><AdminDarkSelect value={priority} onChange={(value) => { setPriority(value); setPage(1) }} options={[{ value: '', label: 'كل الأولويات' }, ...SUPPORT_PRIORITIES.map((value) => ({ value, label: supportPriorityLabels[value] }))]} triggerClassName="h-11" ariaLabel="تصفية حسب الأولوية" /></label>
          <label className="space-y-2 text-xs font-bold text-slate-300"><span>التصنيف</span><AdminDarkSelect value={category} onChange={(value) => { setCategory(value); setPage(1) }} options={[{ value: '', label: 'كل التصنيفات' }, ...SUPPORT_CATEGORIES.map((value) => ({ value, label: supportCategoryLabels[value] }))]} triggerClassName="h-11" ariaLabel="تصفية حسب التصنيف" /></label>
          <label className="space-y-2 text-xs font-bold text-slate-300"><span>المنشأة</span><AdminDarkSelect value={tenant} onChange={(value) => { setTenant(value); setPage(1) }} options={[{ value: '', label: 'كل المنشآت' }, ...organizations.map((value) => ({ value, label: value }))]} triggerClassName="h-11" ariaLabel="تصفية حسب المنشأة" /></label>
          <label className="space-y-2 text-xs font-bold text-slate-300"><span>الإسناد</span><AdminDarkSelect value={assignment} onChange={(value) => { setAssignment(value); setPage(1) }} options={[{ value: '', label: 'كل التذاكر' }, { value: 'me', label: 'مسندة إليّ' }, { value: 'unassigned', label: 'غير مسندة' }, { value: 'assigned', label: 'مسندة' }]} triggerClassName="h-11" ariaLabel="تصفية حسب الإسناد" /></label>
          <label className="space-y-2 text-xs font-bold text-slate-300"><span>مؤشر التشغيل</span><AdminDarkSelect value={operationalFilter} onChange={(value) => { setOperationalFilter(value); setPage(1) }} options={SUPPORT_OPERATIONAL_FILTERS.map((value) => ({ value, label: operationalFilterLabels[value] }))} triggerClassName="h-11" ariaLabel="تصفية حسب مؤشر التشغيل" /></label>
          <button type="button" onClick={clearFilters} className="h-11 self-end rounded-2xl border border-white/10 px-4 text-sm font-bold text-slate-300 transition hover:border-cyan-300/30 hover:text-white">مسح</button>
        </div>
      </AdminGlassSection>
      {loading ? <AdminLoadingState /> : tickets.length === 0 ? <AdminEmptyState title="لا توجد تذاكر مطابقة" description="غيّر معايير البحث أو الفلاتر." /> : (
        <AdminGlassSection className="overflow-hidden p-0 md:p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1380px] text-right text-sm">
              <thead className="border-b border-white/10 bg-white/[0.035] text-xs text-slate-400"><tr>{['رقم التذكرة', 'العنوان والمؤشر التشغيلي', 'المنشأة', 'المسؤول', 'التصنيف', 'الأولوية', 'الحالة', 'آخر نشاط عام', ''].map((label) => <th key={label} className="px-4 py-4 font-black">{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-white/[0.07]">{tickets.map((ticket) => <tr key={ticket.id} className="transition hover:bg-cyan-300/[0.035]">
                <td className="px-4 py-4 font-black text-cyan-200">{ticket.ticket_number}</td>
                <td className="max-w-[360px] px-4 py-4"><p className="min-w-0 whitespace-normal break-words font-bold text-white">{ticket.title}</p><div className="mt-2 flex min-w-0 flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${supportOperationalClass(ticket.operational_state)}`}>{supportOperationalLabels[ticket.operational_state]}</span>{ticket.is_overdue ? <span className="text-[11px] font-bold text-red-200">متأخرة</span> : ticket.is_attention_required ? <span className="text-[11px] font-bold text-amber-200">تحتاج انتباه</span> : null}</div><div className="mt-2 grid min-w-0 gap-1 text-[11px] leading-5 text-slate-400"><span>عمر التذكرة: {formatSupportDuration(ticket.age_minutes)}</span><span>مدة الانتظار: {formatSupportDuration(ticket.waiting_minutes)}</span><span title={ticket.operational_deadline_at ? formatSupportDate(ticket.operational_deadline_at) : undefined}>الموعد التشغيلي: {ticket.operational_deadline_at ? formatSupportDate(ticket.operational_deadline_at) : '—'}</span></div></td>
                <td className="max-w-[220px] break-words px-4 py-4 text-slate-300">{ticket.organization_name}</td>
                <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${ticket.assigned_to_me ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-white/[0.04] text-slate-300'}`}>{ticket.assigned_to_me ? 'مسندة إليّ' : ticket.is_assigned ? 'مسندة لفريق AFEX' : 'غير مسندة'}</span></td>
                <td className="px-4 py-4 text-slate-300">{supportCategoryLabels[ticket.category]}</td>
                <td className="px-4 py-4"><span className={`rounded-full border px-3 py-1 text-xs font-black ${supportPriorityClass(ticket.priority)}`}>{supportPriorityLabels[ticket.priority]}</span></td>
                <td className="px-4 py-4"><span className={`rounded-full border px-3 py-1 text-xs font-black ${supportStatusClass(ticket.status)}`}>{supportStatusLabels[ticket.status]}</span></td>
                <td className="px-4 py-4 text-slate-400">{formatSupportDate(ticket.last_public_message_at || ticket.created_at)}</td>
                <td className="sticky left-0 bg-[#07111d] px-4 py-4"><Link href={`/provider/support/${ticket.id}`} className="inline-flex h-10 items-center rounded-xl border border-emerald-300/20 px-4 text-xs font-black text-emerald-100 transition hover:bg-emerald-300/10">عرض</Link></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-400">الصفحة {page.toLocaleString('ar-SA')} من {pageCount.toLocaleString('ar-SA')}</p><div className="flex gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="h-10 rounded-xl border border-white/10 px-4 text-xs font-black disabled:opacity-40">السابق</button><button type="button" disabled={page >= pageCount || loading} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="h-10 rounded-xl border border-white/10 px-4 text-xs font-black disabled:opacity-40">التالي</button></div></div>
        </AdminGlassSection>
      )}
    </main>
  )
}

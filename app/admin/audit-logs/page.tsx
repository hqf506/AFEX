'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePageAccess } from '@/hooks/use-page-access'

type AuditActor = {
  username: string | null
  full_name: string | null
}

type AuditLogRow = {
  id: string
  created_at: string
  action: string
  entity_type: string
  entity_id: string | null
  branch_id: string | null
  actor_user_id: string | null
  metadata: unknown
  actor?: AuditActor | AuditActor[] | null
}

type AuditLogsResponse = {
  success?: boolean
  logs?: AuditLogRow[]
  total?: number
  page?: number
  pageSize?: number
  error?: string
  details?: string
}

const PAGE_SIZE = 25

function shortId(value: string | null | undefined) {
  if (!value) return '—'
  if (value.length <= 12) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function formatDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('ar-SA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function resolveActorName(log: AuditLogRow) {
  const actor = Array.isArray(log.actor) ? log.actor[0] : log.actor
  const fullName = actor?.full_name?.trim()
  const username = actor?.username?.trim()

  return fullName || username || shortId(log.actor_user_id)
}

function summarizeMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return '—'
  }

  const entries = Object.entries(metadata as Record<string, unknown>).slice(0, 3)

  if (entries.length === 0) {
    return '—'
  }

  return entries
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ')
}

function metadataText(metadata: unknown) {
  try {
    return JSON.stringify(metadata ?? {}, null, 2)
  } catch {
    return '{}'
  }
}

function buildAuditLogsUrl({
  page,
  action,
  entityType,
  dateFrom,
  dateTo,
}: {
  page: number
  action: string
  entityType: string
  dateFrom: string
  dateTo: string
}) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('pageSize', String(PAGE_SIZE))

  if (action.trim()) params.set('action', action.trim())
  if (entityType.trim()) params.set('entity_type', entityType.trim())
  if (dateFrom.trim()) params.set('date_from', dateFrom.trim())
  if (dateTo.trim()) params.set('date_to', dateTo.trim())

  return `/api/admin/audit-logs?${params.toString()}`
}

export default function AdminAuditLogsPage() {
  const access = usePageAccess(['admin'])
  const { loading: accessLoading, allowed } = access

  const [logs, setLogs] = useState<AuditLogRow[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedMetadata, setSelectedMetadata] = useState<unknown | null>(null)

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total]
  )

  async function loadLogs(nextPage = page) {
    try {
      setLoadingLogs(true)
      setErrorMessage('')

      const response = await fetch(
        buildAuditLogsUrl({
          page: nextPage,
          action,
          entityType,
          dateFrom,
          dateTo,
        }),
        {
          method: 'GET',
          cache: 'no-store',
        }
      )
      const result = (await response.json()) as AuditLogsResponse

      if (!response.ok) {
        throw new Error(result.details || result.error || 'تعذر تحميل سجل النشاط')
      }

      setLogs(result.logs || [])
      setTotal(result.total || 0)
      setPage(result.page || nextPage)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر تحميل سجل النشاط'
      )
    } finally {
      setLoadingLogs(false)
    }
  }

  useEffect(() => {
    if (!accessLoading && allowed) {
      const timeoutId = window.setTimeout(() => {
        void loadLogs(1)
      }, 0)

      return () => window.clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessLoading, allowed])

  function applyFilters() {
    setPage(1)
    void loadLogs(1)
  }

  function clearFilters() {
    setAction('')
    setEntityType('')
    setDateFrom('')
    setDateTo('')
    setPage(1)

    window.setTimeout(() => {
      void loadLogs(1)
    }, 0)
  }

  if (accessLoading || !allowed) {
    return (
      <div className="rounded-[28px] border border-cyan-300/15 bg-[#07111f]/90 p-6 text-right text-slate-300">
        جارٍ تحميل سجل النشاط...
      </div>
    )
  }

  return (
    <section dir="rtl" className="space-y-6 text-right">
      <div className="rounded-[30px] border border-cyan-300/15 bg-[#07111f]/88 p-6 shadow-[0_24px_90px_rgba(0,0,0,0.32)] backdrop-blur-xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
          AFEX Audit
        </p>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-black text-white">سجل النشاط</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
              عرض مختصر للأحداث الحساسة داخل لوحة التحكم ونقطة البيع.
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/10 px-4 py-3 text-sm font-bold text-cyan-100">
            الإجمالي: {total}
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-cyan-300/15 bg-[#07111f]/88 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.26)] backdrop-blur-xl">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="space-y-2">
            <span className="text-xs font-bold text-slate-400">الحدث</span>
            <input
              value={action}
              onChange={(event) => setAction(event.target.value)}
              placeholder="user.created"
              className="h-11 w-full rounded-2xl border border-cyan-300/15 bg-[#06111f] px-4 text-sm font-bold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/45 focus:ring-2 focus:ring-cyan-300/15"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-bold text-slate-400">النوع</span>
            <input
              value={entityType}
              onChange={(event) => setEntityType(event.target.value)}
              placeholder="profile"
              className="h-11 w-full rounded-2xl border border-cyan-300/15 bg-[#06111f] px-4 text-sm font-bold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/45 focus:ring-2 focus:ring-cyan-300/15"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-bold text-slate-400">من تاريخ</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-11 w-full rounded-2xl border border-cyan-300/15 bg-[#06111f] px-4 text-sm font-bold text-white outline-none transition focus:border-cyan-300/45 focus:ring-2 focus:ring-cyan-300/15"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-bold text-slate-400">إلى تاريخ</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="h-11 w-full rounded-2xl border border-cyan-300/15 bg-[#06111f] px-4 text-sm font-bold text-white outline-none transition focus:border-cyan-300/45 focus:ring-2 focus:ring-cyan-300/15"
            />
          </label>
          <button
            type="button"
            onClick={applyFilters}
            className="h-11 self-end rounded-2xl border border-cyan-300/25 bg-cyan-300/12 px-4 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/18"
          >
            تطبيق
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="h-11 self-end rounded-2xl border border-slate-500/20 bg-[#06111f] px-4 text-sm font-black text-slate-300 transition hover:border-cyan-300/25 hover:text-white"
          >
            مسح
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">
          {errorMessage}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[28px] border border-cyan-300/15 bg-[#07111f]/88 shadow-[0_22px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-right">
            <thead>
              <tr className="border-b border-cyan-300/10 bg-cyan-300/8 text-xs font-black text-cyan-100">
                <th className="px-4 py-4">التاريخ</th>
                <th className="px-4 py-4">الحدث</th>
                <th className="px-4 py-4">النوع</th>
                <th className="px-4 py-4">المنفذ</th>
                <th className="px-4 py-4">Entity ID</th>
                <th className="px-4 py-4">Metadata</th>
                <th className="px-4 py-4">تفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-300/10">
              {loadingLogs ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    جارٍ تحميل سجل النشاط...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    لا توجد سجلات مطابقة.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="text-sm text-slate-300 transition hover:bg-cyan-300/5"
                  >
                    <td className="whitespace-nowrap px-4 py-4 text-slate-400">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="px-4 py-4 font-black text-cyan-100">
                      {log.action}
                    </td>
                    <td className="px-4 py-4 text-slate-200">
                      {log.entity_type}
                    </td>
                    <td className="px-4 py-4">{resolveActorName(log)}</td>
                    <td className="px-4 py-4 font-mono text-xs text-slate-400">
                      {shortId(log.entity_id)}
                    </td>
                    <td className="max-w-[320px] truncate px-4 py-4 text-xs text-slate-400">
                      {summarizeMetadata(log.metadata)}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => setSelectedMetadata(log.metadata)}
                        className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/16"
                      >
                        عرض
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-cyan-300/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold text-slate-400">
            الصفحة {page} من {totalPages} · إجمالي السجلات {total}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loadingLogs}
              onClick={() => void loadLogs(Math.max(1, page - 1))}
              className="rounded-2xl border border-cyan-300/15 bg-[#06111f] px-4 py-2 text-sm font-black text-slate-300 transition hover:border-cyan-300/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              السابق
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loadingLogs}
              onClick={() => void loadLogs(page + 1)}
              className="rounded-2xl border border-cyan-300/25 bg-cyan-300/12 px-4 py-2 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/18 disabled:cursor-not-allowed disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        </div>
      </div>

      {selectedMetadata !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-[28px] border border-cyan-300/20 bg-[#07111f] p-5 shadow-[0_30px_110px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-black text-white">تفاصيل metadata</h2>
              <button
                type="button"
                onClick={() => setSelectedMetadata(null)}
                className="rounded-xl border border-slate-500/20 bg-[#06111f] px-3 py-2 text-sm font-black text-slate-300 transition hover:text-white"
              >
                إغلاق
              </button>
            </div>
            <pre className="mt-4 max-h-[60vh] overflow-auto rounded-2xl border border-cyan-300/12 bg-[#030714] p-4 text-left text-xs leading-6 text-cyan-50">
              {metadataText(selectedMetadata)}
            </pre>
          </div>
        </div>
      ) : null}
    </section>
  )
}

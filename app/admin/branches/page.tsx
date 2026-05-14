'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePageAccess } from '@/hooks/use-page-access'
import { notifyAdminBranchOptionsChanged } from '@/lib/admin/branch-filter'
import { type AdminBranchRecord } from '@/lib/admin/branches'

type BranchDisplayNameDraft = {
  display_store_name: string
  display_branch_name: string
}

function BranchIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-6h6v6" />
      <path d="M9 9h.01" />
      <path d="M15 9h.01" />
      <path d="M9 12h.01" />
      <path d="M15 12h.01" />
    </svg>
  )
}

export default function AdminBranchesPage() {
  const access = usePageAccess(['admin'])
  const { loading: accessLoading, allowed, scopeType } = access
  const isSystemAdmin = scopeType === 'system'

  const [branches, setBranches] = useState<AdminBranchRecord[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [updatingBranchId, setUpdatingBranchId] = useState<string | null>(null)
  const [savingMapUrlBranchId, setSavingMapUrlBranchId] = useState<string | null>(
    null
  )
  const [savingDisplayNamesBranchId, setSavingDisplayNamesBranchId] = useState<
    string | null
  >(null)
  const [branchMapUrlDrafts, setBranchMapUrlDrafts] = useState<
    Record<string, string>
  >({})
  const [branchDisplayNameDrafts, setBranchDisplayNameDrafts] = useState<
    Record<string, BranchDisplayNameDraft>
  >({})
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'inactive'
  >('all')

  async function loadBranches() {
    try {
      setLoadingBranches(true)
      setErrorMessage('')

      const response = await fetch('/api/admin/branches', {
        method: 'GET',
        cache: 'no-store',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result?.details || result?.error || 'تعذر تحميل الفروع')
      }

      const nextBranches = (result.branches || []) as AdminBranchRecord[]

      setBranches(nextBranches)
      setBranchMapUrlDrafts(
        Object.fromEntries(
          nextBranches.map((branch) => [branch.id, branch.map_url || ''])
        )
      )
      setBranchDisplayNameDrafts(
        Object.fromEntries(
          nextBranches.map((branch) => [
            branch.id,
            {
              display_store_name: branch.display_store_name || '',
              display_branch_name: branch.display_branch_name || '',
            },
          ])
        )
      )
    } catch (error) {
      console.error('Load branches error:', error)
      setErrorMessage(error instanceof Error ? error.message : 'تعذر تحميل الفروع')
    } finally {
      setLoadingBranches(false)
    }
  }

  useEffect(() => {
    if (!accessLoading && allowed) {
      const timeoutId = window.setTimeout(() => {
        void loadBranches()
      }, 0)

      return () => window.clearTimeout(timeoutId)
    }
  }, [accessLoading, allowed])

  const normalizedSearchTerm = searchTerm.trim().toLowerCase()
  const filteredBranches = branches.filter((branch) => {
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' ? branch.is_active : !branch.is_active)

    if (!normalizedSearchTerm) {
      return matchesStatus
    }

    const searchableValues = [
      branch.name,
      branch.code,
      branch.map_url,
      branch.display_store_name,
      branch.display_branch_name,
    ]

    return (
      matchesStatus &&
      searchableValues.some((value) =>
        (value || '').toLowerCase().includes(normalizedSearchTerm)
      )
    )
  })

  async function handleToggleBranch(branch: AdminBranchRecord) {
    try {
      setUpdatingBranchId(branch.id)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch('/api/admin/toggle-branch-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          branchId: branch.id,
          is_active: !branch.is_active,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result?.details || result?.error || 'فشل تحديث حالة الفرع')
      }

      setSuccessMessage(result.message || 'تم تحديث حالة الفرع بنجاح')
      await loadBranches()
      notifyAdminBranchOptionsChanged()
    } catch (error) {
      console.error('Toggle branch error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر تحديث حالة الفرع'
      )
    } finally {
      setUpdatingBranchId(null)
    }
  }

  async function handleSaveBranchMapUrl(branch: AdminBranchRecord) {
    try {
      setSavingMapUrlBranchId(branch.id)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch('/api/admin/branches', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          branchId: branch.id,
          map_url: branchMapUrlDrafts[branch.id] || '',
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result?.details || result?.error || 'فشل حفظ رابط موقع الفرع')
      }

      setSuccessMessage(result.message || 'تم حفظ رابط موقع الفرع بنجاح')
      await loadBranches()
      notifyAdminBranchOptionsChanged()
    } catch (error) {
      console.error('Save branch map URL error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر حفظ رابط موقع الفرع'
      )
    } finally {
      setSavingMapUrlBranchId(null)
    }
  }

  async function handleSaveBranchDisplayNames(branch: AdminBranchRecord) {
    const draft = branchDisplayNameDrafts[branch.id] || {
      display_store_name: '',
      display_branch_name: '',
    }

    try {
      setSavingDisplayNamesBranchId(branch.id)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch('/api/admin/branches', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          branchId: branch.id,
          display_store_name: draft.display_store_name,
          display_branch_name: draft.display_branch_name,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result?.details || result?.error || 'فشل حفظ أسماء العرض')
      }

      setSuccessMessage(result.message || 'تم حفظ أسماء العرض بنجاح')
      await loadBranches()
      notifyAdminBranchOptionsChanged()
    } catch (error) {
      console.error('Save branch display names error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر حفظ أسماء العرض'
      )
    } finally {
      setSavingDisplayNamesBranchId(null)
    }
  }

  if (accessLoading) {
    return (
      <div className="min-h-screen bg-[#030714] p-4 text-white md:p-6">
        <div className="mx-auto h-32 max-w-7xl animate-pulse rounded-[28px] border border-cyan-300/10 bg-white/[0.055] shadow-[0_24px_80px_rgba(0,0,0,0.28)]" />
      </div>
    )
  }

  if (!allowed || !isSystemAdmin) {
    return (
      <div className="min-h-screen bg-[#030714] p-4 text-white md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-[28px] border border-red-300/15 bg-red-500/10 p-6 text-right shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <h1 className="text-2xl font-black text-white">غير مصرح لك</h1>
            <p className="mt-2 text-slate-400">
              هذه الصفحة متاحة لمدير النظام فقط.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030714] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-24 top-10 h-72 w-72 rounded-full bg-cyan-400/15 blur-[110px]" />
        <div className="absolute -left-20 top-1/3 h-80 w-80 rounded-full bg-emerald-400/10 blur-[130px]" />
        <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-blue-500/10 blur-[130px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_32%),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:auto,48px_48px,48px_48px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl space-y-5 px-3 py-4 sm:px-4 lg:px-6">
        <header className="overflow-hidden rounded-[28px] border border-cyan-300/15 bg-white/[0.055] p-5 text-right shadow-[0_24px_90px_rgba(0,0,0,0.32)] backdrop-blur-xl md:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200 shadow-[0_0_35px_rgba(34,211,238,0.18)]">
                <BranchIcon className="h-7 w-7" />
              </div>
              <div>
                <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black tracking-[0.2em] text-cyan-200">
                  AFEX BRANCHES
                </span>
                <h1 className="mt-3 text-3xl font-black text-white md:text-4xl">
                  إدارة الفروع
                </h1>
                <p className="mt-2 text-sm font-medium text-slate-400">
                  إنشاء الفروع وتفعيلها أو تعطيلها على مستوى النظام
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-slate-200">
                <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.8)]" />
                {branches.length} فرع
              </div>
              <Link
                href="/admin/branches/new"
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 text-sm font-black text-slate-950 shadow-[0_0_35px_rgba(34,211,238,0.22)] transition hover:scale-[1.01] hover:shadow-[0_0_45px_rgba(34,211,238,0.3)] active:scale-[0.98]"
              >
                إضافة فرع
              </Link>
            </div>
          </div>
        </header>

        {successMessage ? (
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-200 shadow-[0_12px_40px_rgba(16,185,129,0.12)]">
            {successMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="whitespace-pre-wrap rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200 shadow-[0_12px_40px_rgba(239,68,68,0.12)]">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-[28px] border border-cyan-300/15 bg-white/[0.055] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-6">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-right">
              <span className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200/80">
                Branches List
              </span>
              <h2 className="mt-2 text-2xl font-black text-white">الفروع الحالية</h2>
              <p className="mt-1 text-sm text-slate-400">
                راقب الفروع وحالة تفعيل كل فرع داخل النظام.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadBranches()}
              className="inline-flex h-11 w-fit items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15"
            >
              تحديث
            </button>
          </div>

          <div className="mb-5 rounded-2xl border border-cyan-300/10 bg-[#07111d]/80 p-3 shadow-[0_0_40px_rgba(0,255,255,0.05)]">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
              <label className="relative block">
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-cyan-200/75">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="h-5 w-5"
                  >
                    <path d="m21 21-4.3-4.3" />
                    <circle cx="11" cy="11" r="7" />
                  </svg>
                </span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="ابحث عن فرع..."
                  className="h-12 w-full rounded-2xl border border-cyan-300/15 bg-white/[0.045] py-3 pl-4 pr-12 text-right text-sm font-bold text-white outline-none transition placeholder:text-slate-500 hover:border-cyan-300/30 focus:border-cyan-300/55 focus:bg-white/[0.07] focus:ring-2 focus:ring-cyan-300/15"
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                {[
                  { value: 'all', label: 'الكل', count: branches.length },
                  {
                    value: 'active',
                    label: 'نشط',
                    count: branches.filter((branch) => branch.is_active).length,
                  },
                  {
                    value: 'inactive',
                    label: 'غير نشط',
                    count: branches.filter((branch) => !branch.is_active).length,
                  },
                ].map((option) => {
                  const isActive = statusFilter === option.value

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setStatusFilter(
                          option.value as 'all' | 'active' | 'inactive'
                        )
                      }
                      className={`inline-flex h-11 items-center gap-2 rounded-2xl border px-4 text-xs font-black transition ${
                        isActive
                          ? 'border-cyan-300/45 bg-cyan-300/15 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.16)]'
                          : 'border-white/10 bg-black/20 text-slate-300 hover:border-cyan-300/30 hover:text-white'
                      }`}
                    >
                      <span>{option.label}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 ${
                          isActive
                            ? 'bg-cyan-300/20 text-cyan-100'
                            : 'bg-white/10 text-slate-300'
                        }`}
                      >
                        {option.count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {loadingBranches ? (
            <div className="rounded-2xl border border-dashed border-cyan-300/15 bg-black/20 px-4 py-10 text-center text-sm font-bold text-slate-400">
              جاري تحميل الفروع...
            </div>
          ) : branches.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-cyan-300/20 bg-black/20 px-4 py-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                <BranchIcon className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-lg font-black text-white">
                لا توجد فروع حالياً
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                أضف أول فرع لبدء تنظيم المستخدمين والمبيعات.
              </p>
            </div>
          ) : filteredBranches.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-cyan-300/20 bg-black/20 px-4 py-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                <BranchIcon className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-lg font-black text-white">
                لا توجد فروع مطابقة
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                جرّب تعديل البحث أو حالة الفرع لعرض نتائج أخرى.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#06111f]/65">
              <table className="min-w-[1180px] w-full text-right">
                <thead className="bg-white/[0.035]">
                  <tr className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    <th className="px-5 py-4">رابط الموقع</th>
                    <th className="px-5 py-4">أسماء الرسائل</th>
                    <th className="px-5 py-4">الاسم</th>
                    <th className="px-5 py-4">الكود</th>
                    <th className="px-5 py-4">الحالة</th>
                    <th className="px-5 py-4">الإجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBranches.map((branch) => {
                    const isBusy = updatingBranchId === branch.id
                    const isSavingMapUrl = savingMapUrlBranchId === branch.id
                    const isSavingDisplayNames =
                      savingDisplayNamesBranchId === branch.id
                    const displayNameDraft = branchDisplayNameDrafts[
                      branch.id
                    ] || {
                      display_store_name: branch.display_store_name || '',
                      display_branch_name: branch.display_branch_name || '',
                    }

                    return (
                      <tr
                        key={branch.id}
                        className="border-b border-white/[0.08] transition hover:bg-cyan-300/[0.035] last:border-b-0"
                      >
                        <td className="min-w-[320px] px-5 py-4">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={
                                branchMapUrlDrafts[branch.id] ??
                                branch.map_url ??
                                ''
                              }
                              onChange={(event) =>
                                setBranchMapUrlDrafts((prev) => ({
                                  ...prev,
                                  [branch.id]: event.target.value,
                                }))
                              }
                              placeholder="رابط موقع الفرع"
                              className="h-10 min-w-[210px] flex-1 rounded-xl border border-cyan-300/15 bg-white/[0.045] px-3 text-right text-xs font-bold text-white outline-none transition placeholder:text-slate-500 hover:border-cyan-300/30 focus:border-cyan-300/55 focus:bg-white/[0.07] focus:ring-2 focus:ring-cyan-300/15"
                            />
                            <button
                              type="button"
                              onClick={() => void handleSaveBranchMapUrl(branch)}
                              disabled={isSavingMapUrl}
                              className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isSavingMapUrl ? 'جاري الحفظ...' : 'حفظ الرابط'}
                            </button>
                          </div>
                        </td>
                        <td className="min-w-[360px] px-5 py-4">
                          <div className="grid gap-2">
                            <div className="grid gap-2 sm:grid-cols-2">
                              <input
                                type="text"
                                value={displayNameDraft.display_store_name}
                                onChange={(event) =>
                                  setBranchDisplayNameDrafts((prev) => ({
                                    ...prev,
                                    [branch.id]: {
                                      display_store_name: event.target.value,
                                      display_branch_name:
                                        prev[branch.id]?.display_branch_name ??
                                        branch.display_branch_name ??
                                        '',
                                    },
                                  }))
                                }
                                placeholder="اسم المحل في الرسائل"
                                className="h-10 rounded-xl border border-cyan-300/15 bg-white/[0.045] px-3 text-right text-xs font-bold text-white outline-none transition placeholder:text-slate-500 hover:border-cyan-300/30 focus:border-cyan-300/55 focus:bg-white/[0.07] focus:ring-2 focus:ring-cyan-300/15"
                              />
                              <input
                                type="text"
                                value={displayNameDraft.display_branch_name}
                                onChange={(event) =>
                                  setBranchDisplayNameDrafts((prev) => ({
                                    ...prev,
                                    [branch.id]: {
                                      display_store_name:
                                        prev[branch.id]?.display_store_name ??
                                        branch.display_store_name ??
                                        '',
                                      display_branch_name: event.target.value,
                                    },
                                  }))
                                }
                                placeholder="اسم الفرع في الرسائل"
                                className="h-10 rounded-xl border border-cyan-300/15 bg-white/[0.045] px-3 text-right text-xs font-bold text-white outline-none transition placeholder:text-slate-500 hover:border-cyan-300/30 focus:border-cyan-300/55 focus:bg-white/[0.07] focus:ring-2 focus:ring-cyan-300/15"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                void handleSaveBranchDisplayNames(branch)
                              }
                              disabled={isSavingDisplayNames}
                              className="inline-flex h-10 w-fit items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isSavingDisplayNames
                                ? 'جاري الحفظ...'
                                : 'حفظ الأسماء'}
                            </button>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
                              <BranchIcon className="h-5 w-5" />
                            </span>
                            <span className="text-sm font-black text-white">
                              {branch.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex rounded-full border border-white/10 bg-white/[0.055] px-3 py-1 text-xs font-black text-slate-200">
                            {branch.code}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${
                              branch.is_active
                                ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200'
                                : 'border-red-300/20 bg-red-500/10 text-red-200'
                            }`}
                          >
                            {branch.is_active ? 'نشط' : 'معطل'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/admin/branches/${branch.id}/edit`}
                              className="inline-flex h-10 min-w-[76px] items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/15"
                            >
                              تعديل
                            </Link>
                            <button
                              type="button"
                              onClick={() => void handleToggleBranch(branch)}
                              disabled={isBusy}
                              className={`inline-flex h-10 min-w-[92px] items-center justify-center rounded-xl border px-4 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                branch.is_active
                                  ? 'border-red-300/20 bg-red-500/10 text-red-200 hover:bg-red-500/15'
                                  : 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/15'
                              }`}
                            >
                              {branch.is_active ? 'تعطيل' : 'تفعيل'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

'use client'

import { type FormEvent, useEffect, useState } from 'react'
import { usePageAccess } from '@/hooks/use-page-access'
import { notifyAdminBranchOptionsChanged } from '@/lib/admin/branch-filter'
import { type AdminBranchRecord } from '@/lib/admin/branches'

type BranchRecordWithOrderPrefix = AdminBranchRecord & {
  order_number_prefix?: string | null
}

type CreateBranchFormState = {
  name: string
  map_url: string
  display_store_name: string
  display_branch_name: string
}

const emptyCreateBranchForm: CreateBranchFormState = {
  name: '',
  map_url: '',
  display_store_name: '',
  display_branch_name: '',
}

function getBranchOrderNumberPrefix(branch: AdminBranchRecord) {
  const prefix = (branch as BranchRecordWithOrderPrefix).order_number_prefix

  return prefix?.trim() || ''
}

function formatBranchDeletedAt(value: string | null) {
  if (!value) {
    return '--'
  }

  return new Intl.DateTimeFormat('ar-SA', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

function getBranchDeleteRemainingDays(value: string | null) {
  if (!value) {
    return 30
  }

  const dayMs = 24 * 60 * 60 * 1000
  const deleteAt = new Date(value).getTime() + 30 * dayMs

  return Math.max(0, Math.ceil((deleteAt - Date.now()) / dayMs))
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
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false)
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [createBranchForm, setCreateBranchForm] =
    useState<CreateBranchFormState>(emptyCreateBranchForm)
  const [editingBranch, setEditingBranch] = useState<AdminBranchRecord | null>(
    null
  )
  const [deletingBranchId, setDeletingBranchId] = useState<string | null>(null)
  const [restoringBranchId, setRestoringBranchId] = useState<string | null>(null)
  const [deleteModalBranch, setDeleteModalBranch] =
    useState<AdminBranchRecord | null>(null)
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
  const activeBranches = branches.filter((branch) => !branch.deleted_at)
  const deletedBranches = branches.filter((branch) => branch.deleted_at)
  const matchesBranchSearch = (branch: AdminBranchRecord) => {
    if (!normalizedSearchTerm) {
      return true
    }

    const searchableValues = [
      branch.name,
      getBranchOrderNumberPrefix(branch),
      branch.map_url,
      branch.display_store_name,
      branch.display_branch_name,
    ]

    return searchableValues.some((value) =>
      (value || '').toLowerCase().includes(normalizedSearchTerm)
    )
  }
  const filteredBranches = activeBranches.filter((branch) => {
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active'
        ? branch.is_active
        : !branch.is_active)

    return matchesStatus && matchesBranchSearch(branch)
  })
  const filteredDeletedBranches = deletedBranches.filter(matchesBranchSearch)

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

      setSuccessMessage('تم تحديث حالة الفرع بنجاح')
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

  function updateCreateBranchField(
    field: keyof CreateBranchFormState,
    value: string
  ) {
    setCreateBranchForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  function openCreateBranchDrawer() {
    setEditingBranch(null)
    setCreateBranchForm(emptyCreateBranchForm)
    setIsCreateDrawerOpen(true)
  }

  function openEditBranchDrawer(branch: AdminBranchRecord) {
    setEditingBranch(branch)
    setCreateBranchForm({
      name: branch.name || '',
      map_url: branch.map_url || '',
      display_store_name: branch.display_store_name || '',
      display_branch_name: branch.display_branch_name || '',
    })
    setSuccessMessage('')
    setErrorMessage('')
    setIsCreateDrawerOpen(true)
  }

  function closeBranchDrawer() {
    if (creatingBranch) {
      return
    }

    setIsCreateDrawerOpen(false)
    setEditingBranch(null)
    setCreateBranchForm(emptyCreateBranchForm)
  }

  async function handleSaveBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setCreatingBranch(true)
      setSuccessMessage('')
      setErrorMessage('')

      const isEditMode = Boolean(editingBranch)
      const response = await fetch('/api/admin/branches', {
        method: isEditMode ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...(editingBranch ? { branchId: editingBranch.id } : {}),
          name: createBranchForm.name,
          map_url: createBranchForm.map_url,
          display_store_name: createBranchForm.display_store_name,
          display_branch_name: createBranchForm.display_branch_name,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result?.details || result?.error || 'فشل إنشاء الفرع')
      }

      setSuccessMessage('تم إنشاء الفرع بنجاح')
      if (isEditMode) {
        setSuccessMessage('تم حفظ تعديلات الفرع بنجاح')
      }
      setCreateBranchForm(emptyCreateBranchForm)
      setIsCreateDrawerOpen(false)
      setEditingBranch(null)
      await loadBranches()
      notifyAdminBranchOptionsChanged()
    } catch (error) {
      console.error('Create branch error:', error)
      setErrorMessage(error instanceof Error ? error.message : 'تعذر إنشاء الفرع')
    } finally {
      setCreatingBranch(false)
    }
  }

  async function handleSoftDeleteBranch(branch: AdminBranchRecord) {
    try {
      setDeletingBranchId(branch.id)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch('/api/admin/branches', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          branchId: branch.id,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result?.details || result?.error || 'فشل حذف الفرع مؤقتًا')
      }

      setSuccessMessage('تم حذف الفرع مؤقتًا لمدة 30 يوم')
      setDeleteModalBranch(null)
      await loadBranches()
      notifyAdminBranchOptionsChanged()
    } catch (error) {
      console.error('Soft delete branch error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر حذف الفرع مؤقتًا'
      )
    } finally {
      setDeletingBranchId(null)
    }
  }

  async function handleRestoreBranch(branch: AdminBranchRecord) {
    try {
      setRestoringBranchId(branch.id)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch('/api/admin/branches', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          branchId: branch.id,
          action: 'restore',
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result?.details || result?.error || 'فشل استرجاع الفرع')
      }

      setSuccessMessage('تم استرجاع الفرع بنجاح')
      await loadBranches()
      notifyAdminBranchOptionsChanged()
    } catch (error) {
      console.error('Restore branch error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر استرجاع الفرع'
      )
    } finally {
      setRestoringBranchId(null)
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
              <button
                type="button"
                onClick={openCreateBranchDrawer}
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 text-sm font-black text-slate-950 shadow-[0_0_35px_rgba(34,211,238,0.22)] transition hover:scale-[1.01] hover:shadow-[0_0_45px_rgba(34,211,238,0.3)] active:scale-[0.98]"
              >
                إضافة فرع
              </button>
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
                  { value: 'all', label: 'الكل', count: activeBranches.length },
                  {
                    value: 'active',
                    label: 'نشط',
                    count: activeBranches.filter(
                      (branch) => branch.is_active
                    ).length,
                  },
                  {
                    value: 'inactive',
                    label: 'غير نشط',
                    count: activeBranches.filter((branch) => !branch.is_active).length,
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
          ) : activeBranches.length === 0 ? (
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
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#06111f]/65">
              <table className="w-full table-fixed text-right">
                <colgroup>
                  <col className="w-[16%]" />
                  <col className="w-[7%]" />
                  <col className="w-[8%]" />
                  <col className="w-[12%]" />
                  <col className="w-[17%]" />
                  <col className="w-[20%]" />
                  <col className="w-[20%]" />
                </colgroup>
                <thead className="bg-white/[0.035]">
                  <tr className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    <th className="px-3 py-4">الاسم</th>
                    <th className="px-3 py-4">الكود</th>
                    <th className="px-3 py-4">الحالة</th>
                    <th className="px-3 py-4">رابط الموقع</th>
                    <th className="px-3 py-4">اسم المحل في الرسائل</th>
                    <th className="px-3 py-4">اسم الفرع في الرسائل</th>
                    <th className="px-3 py-4">الإجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBranches.map((branch) => {
                    const isBusy = updatingBranchId === branch.id
                    const isDeleting = deletingBranchId === branch.id
                    const orderNumberPrefix =
                      getBranchOrderNumberPrefix(branch)

                    return (
                      <tr
                        key={branch.id}
                        className="border-b border-white/[0.08] transition hover:bg-cyan-300/[0.035] last:border-b-0"
                      >
                        <td className="px-3 py-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
                              <BranchIcon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-black text-white">
                                {branch.name}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          {orderNumberPrefix ? (
                            <span className="inline-flex min-w-12 justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black tracking-[0.16em] text-cyan-100">
                              {orderNumberPrefix}
                            </span>
                          ) : (
                            <span className="inline-flex min-w-[74px] justify-center whitespace-nowrap rounded-full border border-amber-300/20 bg-amber-400/10 px-4 py-1 text-[11px] font-black text-amber-100">
                              غير محدد
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${
                              branch.is_active
                                ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200'
                                : 'border-red-300/20 bg-red-500/10 text-red-200'
                            }`}
                          >
                            {branch.is_active ? 'نشط' : 'غير نشط'}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${
                              branch.map_url
                                ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200'
                                : 'border-white/10 bg-white/[0.045] text-slate-400'
                            }`}
                          >
                            {branch.map_url ? 'تم إضافة الرابط' : 'لا يوجد رابط'}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <span className="block truncate text-sm font-black text-slate-200">
                            {branch.display_store_name || '--'}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <span className="block truncate text-sm font-black text-slate-200">
                            {branch.display_branch_name || '--'}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditBranchDrawer(branch)}
                              className="inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/15"
                            >
                              تعديل
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleToggleBranch(branch)}
                              disabled={isBusy}
                              className={`inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-xl border px-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                branch.is_active
                                  ? 'border-red-300/20 bg-red-500/10 text-red-200 hover:bg-red-500/15'
                                  : 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/15'
                              }`}
                            >
                              {branch.is_active ? 'تعطيل' : 'تفعيل'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteModalBranch(branch)}
                              disabled={isDeleting}
                              className="inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-xl border border-slate-300/15 bg-slate-400/10 px-2 text-xs font-black text-slate-300 transition hover:bg-red-500/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              حذف
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

        {filteredDeletedBranches.length > 0 ? (
          <section className="rounded-[28px] border border-cyan-300/35 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-6">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="text-right">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                  <BranchIcon className="h-5 w-5" />
                </div>
                <h2 className="mt-3 text-2xl font-black text-white">
                  الفروع المحذوفة ({filteredDeletedBranches.length})
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  الفروع المحذوفة مؤقتًا ويمكن استرجاعها خلال 30 يوم.
                </p>
              </div>
              <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm font-black text-amber-100">
                بعد انتهاء مدة 30 يوم سيتم حذف الفرع نهائيًا مع كل البيانات المرتبطة به، وقد لا يمكن استرجاعها.
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#06111f]/65">
              <table className="w-full table-fixed text-right">
                <colgroup>
                  <col className="w-[22%]" />
                  <col className="w-[12%]" />
                  <col className="w-[18%]" />
                  <col className="w-[18%]" />
                  <col className="w-[15%]" />
                  <col className="w-[15%]" />
                </colgroup>
                <thead className="bg-white/[0.035]">
                  <tr className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    <th className="px-3 py-4">الاسم</th>
                    <th className="px-3 py-4">الكود</th>
                    <th className="px-3 py-4">تاريخ الحذف</th>
                    <th className="px-3 py-4">المتبقي للحذف النهائي</th>
                    <th className="px-3 py-4">الحالة</th>
                    <th className="px-3 py-4">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeletedBranches.map((branch) => {
                    const orderNumberPrefix =
                      getBranchOrderNumberPrefix(branch)
                    const remainingDays = getBranchDeleteRemainingDays(
                      branch.deleted_at
                    )
                    const isRestoring = restoringBranchId === branch.id

                    return (
                      <tr
                        key={branch.id}
                        className="border-b border-white/[0.08] bg-slate-500/[0.045] transition hover:bg-slate-500/[0.075] last:border-b-0"
                      >
                        <td className="px-3 py-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
                              <BranchIcon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 truncate text-sm font-black text-slate-200">
                              {branch.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          {orderNumberPrefix ? (
                            <span className="inline-flex min-w-12 justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black tracking-[0.16em] text-cyan-100">
                              {orderNumberPrefix}
                            </span>
                          ) : (
                            <span className="inline-flex min-w-[74px] justify-center whitespace-nowrap rounded-full border border-amber-300/20 bg-amber-400/10 px-4 py-1 text-[11px] font-black text-amber-100">
                              غير محدد
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-4">
                          <span className="block text-sm font-black text-slate-300">
                            {formatBranchDeletedAt(branch.deleted_at)}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <span className="inline-flex whitespace-nowrap rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-100">
                            {remainingDays} يوم
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <span className="inline-flex min-w-[102px] justify-center whitespace-nowrap rounded-full border border-slate-300/15 bg-slate-400/10 px-4 py-1 text-xs font-black text-slate-300">
                            محذوف مؤقتًا
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <button
                            type="button"
                            onClick={() => void handleRestoreBranch(branch)}
                            disabled={isRestoring}
                            className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-2 text-xs font-black text-emerald-200 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isRestoring ? 'جاري الاسترجاع...' : 'استرجاع'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>

      {deleteModalBranch ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[28px] border border-red-300/20 bg-[#07111d] p-5 text-right shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
            <div className="mb-4 inline-flex rounded-full border border-red-300/20 bg-red-500/10 px-3 py-1 text-xs font-black text-red-200">
              حذف مؤقت لمدة 30 يوم
            </div>
            <h2 className="text-2xl font-black text-white">تأكيد حذف الفرع</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-400">
              سيتم نقل هذا الفرع إلى المحذوفات لمدة 30 يومًا. بعد انتهاء المدة
              سيتم حذف الفرع نهائيًا، وسيتم حذف كل ما يتعلق به من بيانات
              مرتبطة، وقد لا يمكن استرجاعها.
            </p>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteModalBranch(null)}
                disabled={deletingBranchId === deleteModalBranch.id}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] px-5 text-sm font-black text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void handleSoftDeleteBranch(deleteModalBranch)}
                disabled={deletingBranchId === deleteModalBranch.id}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-red-300/20 bg-red-500/10 px-5 text-sm font-black text-red-200 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingBranchId === deleteModalBranch.id
                  ? 'جاري الحذف...'
                  : 'تأكيد الحذف'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateDrawerOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[2px]">
          <div className="absolute inset-y-0 right-0 flex w-full justify-end">
            <form
              onSubmit={handleSaveBranch}
              className="animate-[branch-drawer-in_420ms_cubic-bezier(0.16,1,0.3,1)] h-full w-full max-w-xl overflow-y-auto border-l border-cyan-300/15 bg-[#07111d] p-5 text-right shadow-[0_24px_90px_rgba(0,0,0,0.45)] sm:p-6"
            >
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black tracking-[0.18em] text-cyan-200">
                    {editingBranch ? 'EDIT BRANCH' : 'NEW BRANCH'}
                  </span>
                  <h2 className="mt-3 text-2xl font-black text-white">
                    {editingBranch ? 'تعديل الفرع' : 'إضافة فرع جديد'}
                  </h2>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-400">
                    {editingBranch
                      ? 'عدّل بيانات الفرع واحفظ التغييرات بدون مغادرة الصفحة.'
                      : 'سيتم توليد رقم الفرع تلقائيًا داخل نفس المنشأة بعد الحفظ.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeBranchDrawer}
                  disabled={creatingBranch}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] text-slate-300 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="إغلاق"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-black text-slate-300">
                    اسم الفرع
                  </span>
                  <input
                    type="text"
                    value={createBranchForm.name}
                    onChange={(event) =>
                      updateCreateBranchField('name', event.target.value)
                    }
                    className="h-12 w-full rounded-2xl border border-cyan-300/15 bg-white/[0.045] px-4 text-right text-sm font-bold text-white outline-none transition placeholder:text-slate-500 hover:border-cyan-300/30 focus:border-cyan-300/55 focus:bg-white/[0.07] focus:ring-2 focus:ring-cyan-300/15"
                    placeholder="مثال: الروضة"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-black text-slate-300">
                    رابط موقع الفرع
                  </span>
                  <input
                    type="url"
                    value={createBranchForm.map_url}
                    onChange={(event) =>
                      updateCreateBranchField('map_url', event.target.value)
                    }
                    className="h-12 w-full rounded-2xl border border-cyan-300/15 bg-white/[0.045] px-4 text-right text-sm font-bold text-white outline-none transition placeholder:text-slate-500 hover:border-cyan-300/30 focus:border-cyan-300/55 focus:bg-white/[0.07] focus:ring-2 focus:ring-cyan-300/15"
                    placeholder="https://maps.app.goo.gl/..."
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-black text-slate-300">
                    اسم المحل في الرسائل
                  </span>
                  <input
                    type="text"
                    value={createBranchForm.display_store_name}
                    onChange={(event) =>
                      updateCreateBranchField(
                        'display_store_name',
                        event.target.value
                      )
                    }
                    className="h-12 w-full rounded-2xl border border-cyan-300/15 bg-white/[0.045] px-4 text-right text-sm font-bold text-white outline-none transition placeholder:text-slate-500 hover:border-cyan-300/30 focus:border-cyan-300/55 focus:bg-white/[0.07] focus:ring-2 focus:ring-cyan-300/15"
                    placeholder="مثال: لذر فيكس"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-black text-slate-300">
                    اسم الفرع في الرسائل
                  </span>
                  <input
                    type="text"
                    value={createBranchForm.display_branch_name}
                    onChange={(event) =>
                      updateCreateBranchField(
                        'display_branch_name',
                        event.target.value
                      )
                    }
                    className="h-12 w-full rounded-2xl border border-cyan-300/15 bg-white/[0.045] px-4 text-right text-sm font-bold text-white outline-none transition placeholder:text-slate-500 hover:border-cyan-300/30 focus:border-cyan-300/55 focus:bg-white/[0.07] focus:ring-2 focus:ring-cyan-300/15"
                    placeholder="مثال: فرع الصحافة"
                  />
                </label>
              </div>

              <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeBranchDrawer}
                  disabled={creatingBranch}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] px-5 text-sm font-black text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={creatingBranch || !createBranchForm.name.trim()}
                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 text-sm font-black text-slate-950 shadow-[0_0_35px_rgba(34,211,238,0.22)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creatingBranch
                    ? 'جاري الحفظ...'
                    : editingBranch
                      ? 'حفظ التعديلات'
                      : 'حفظ الفرع'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        @keyframes branch-drawer-in {
          from {
            opacity: 0;
            transform: translate3d(100%, 0, 0);
          }

          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }
      `}</style>
    </div>
  )
}

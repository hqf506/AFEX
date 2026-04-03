'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AdminButton } from '@/components/admin-button'
import { AdminInput } from '@/components/admin-input'
import { PageHeader } from '@/components/page-header'
import { notifyAdminBranchOptionsChanged } from '@/lib/admin/branch-filter'
import { type AdminBranchRecord } from '@/lib/admin/branches'
import { usePageAccess } from '@/hooks/use-page-access'

type BranchFormState = {
  code: string
  name: string
}

const emptyBranchForm: BranchFormState = {
  code: '',
  name: '',
}

export default function AdminBranchesPage() {
  const access = usePageAccess(['admin'])
  const { loading: accessLoading, allowed, scopeType } = access
  const isSystemAdmin = scopeType === 'system'

  const [branches, setBranches] = useState<AdminBranchRecord[]>([])
  const [form, setForm] = useState<BranchFormState>(emptyBranchForm)
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [creating, setCreating] = useState(false)
  const [updatingBranchId, setUpdatingBranchId] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

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

      setBranches(result.branches || [])
    } catch (error) {
      console.error('Load branches error:', error)
      setErrorMessage(error instanceof Error ? error.message : 'تعذر تحميل الفروع')
    } finally {
      setLoadingBranches(false)
    }
  }

  useEffect(() => {
    if (!accessLoading && allowed) {
      void loadBranches()
    }
  }, [accessLoading, allowed])

  const canCreate = useMemo(() => {
    return form.code.trim().length > 0 && form.name.trim().length > 0
  }, [form.code, form.name])

  async function handleCreateBranch(e: React.FormEvent) {
    e.preventDefault()

    try {
      setCreating(true)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch('/api/admin/branches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: form.code,
          name: form.name,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result?.details || result?.error || 'فشل إنشاء الفرع')
      }

      setSuccessMessage(result.message || 'تم إنشاء الفرع بنجاح')
      setForm(emptyBranchForm)
      await loadBranches()
      notifyAdminBranchOptionsChanged()
    } catch (error) {
      console.error('Create branch error:', error)
      setErrorMessage(error instanceof Error ? error.message : 'تعذر إنشاء الفرع')
    } finally {
      setCreating(false)
    }
  }

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

  if (accessLoading) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 md:p-6">
        <div className="mx-auto max-w-7xl" />
      </main>
    )
  }

  if (!allowed || !isSystemAdmin) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm text-right">
            <h1 className="text-2xl font-black text-slate-900">غير مصرح لك</h1>
            <p className="mt-2 text-slate-600">
              هذه الصفحة متاحة لمدير النظام فقط.
            </p>

            <div className="mt-4 flex flex-wrap justify-end gap-3">
              <Link
                href="/admin/users"
                className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-slate-900"
              >
                العودة إلى المستخدمين
              </Link>
              <Link
                href="/"
                className="inline-flex items-center rounded-2xl bg-slate-950 px-4 py-2 text-white"
              >
                العودة إلى القائمة الرئيسية
              </Link>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          title="إدارة الفروع"
          subtitle="إنشاء الفروع وتفعيلها أو تعطيلها على مستوى النظام"
          actions={
            <>
              <Link
                href="/admin/users"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-900"
              >
                العودة إلى المستخدمين
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white"
              >
                العودة إلى القائمة الرئيسية
              </Link>
            </>
          }
        />

        {successMessage ? (
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            {successMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 whitespace-pre-wrap">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <div className="mb-6 text-right">
            <h2 className="text-2xl font-black text-slate-900">إضافة فرع جديد</h2>
          </div>

          <form onSubmit={handleCreateBranch} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                كود الفرع
              </label>
              <AdminInput
                type="text"
                value={form.code}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    code: e.target.value.toLowerCase(),
                  }))
                }
                placeholder="مثال: riyadh"
                className="h-14 border-slate-300 text-right focus:border-slate-500"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                اسم الفرع
              </label>
              <AdminInput
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                placeholder="مثال: فرع الرياض"
                className="h-14 border-slate-300 text-right focus:border-slate-500"
                autoComplete="off"
              />
            </div>

            <div className="md:col-span-2 flex justify-end">
              <AdminButton
                type="submit"
                disabled={!canCreate || creating}
                variant="primary"
                className="min-w-[160px] px-6"
              >
                {creating ? 'جاري إضافة الفرع...' : 'إضافة فرع'}
              </AdminButton>
            </div>
          </form>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-2xl font-black text-slate-900">الفروع الحالية</h2>
            <AdminButton
              onClick={() => void loadBranches()}
            >
              تحديث
            </AdminButton>
          </div>

          {loadingBranches ? (
            <p className="text-slate-500">جاري تحميل الفروع...</p>
          ) : branches.length === 0 ? (
            <p className="text-slate-500">لا توجد فروع حالياً.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 text-right">
                    <th className="px-3 py-3 text-sm font-bold text-slate-700">الاسم</th>
                    <th className="px-3 py-3 text-sm font-bold text-slate-700">الكود</th>
                    <th className="px-3 py-3 text-sm font-bold text-slate-700">الحالة</th>
                    <th className="px-3 py-3 text-sm font-bold text-slate-700">الإجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((branch) => {
                    const isBusy = updatingBranchId === branch.id

                    return (
                      <tr key={branch.id} className="border-b border-slate-100">
                        <td className="px-3 py-4 text-slate-700">{branch.name}</td>
                        <td className="px-3 py-4 text-slate-700">{branch.code}</td>
                        <td className="px-3 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                              branch.is_active
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {branch.is_active ? 'نشط' : 'معطل'}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <AdminButton
                            onClick={() => void handleToggleBranch(branch)}
                            disabled={isBusy}
                            variant={branch.is_active ? 'active' : 'inactive'}
                          >
                            {branch.is_active ? 'تعطيل' : 'تفعيل'}
                          </AdminButton>
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
    </main>
  )
}

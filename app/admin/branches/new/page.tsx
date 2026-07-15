'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useMemo, useState } from 'react'
import { usePageAccess } from '@/hooks/use-page-access'
import { getClientErrorMessage } from '@/lib/api/client-error'
import { notifyAdminBranchOptionsChanged } from '@/lib/admin/branch-filter'

type BranchFormState = {
  code: string
  name: string
  map_url: string
  display_store_name: string
  display_branch_name: string
}

const emptyForm: BranchFormState = {
  code: '',
  name: '',
  map_url: '',
  display_store_name: '',
  display_branch_name: '',
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

function FieldIcon({ type }: { type: 'code' | 'name' | 'map' | 'store' }) {
  const paths = {
    code: (
      <>
        <path d="M8 9l-3 3 3 3" />
        <path d="M16 9l3 3-3 3" />
        <path d="M14 5l-4 14" />
      </>
    ),
    name: (
      <>
        <path d="M4 21V7l8-4 8 4v14" />
        <path d="M9 21v-6h6v6" />
      </>
    ),
    map: (
      <>
        <path d="M12 21s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.3" />
      </>
    ),
    store: (
      <>
        <path d="M4 10h16" />
        <path d="M5 10l1-5h12l1 5" />
        <path d="M6 10v9h12v-9" />
        <path d="M9 19v-5h6v5" />
      </>
    ),
  }

  return (
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
      {paths[type]}
    </svg>
  )
}

export default function NewBranchPage() {
  const router = useRouter()
  const access = usePageAccess(['admin'])
  const { loading: accessLoading, allowed, scopeType } = access
  const isSystemAdmin = scopeType === 'system'

  const [form, setForm] = useState<BranchFormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const canSubmit = useMemo(() => {
    return form.code.trim().length > 0 && form.name.trim().length > 0
  }, [form.code, form.name])

  function updateField(field: keyof BranchFormState, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: field === 'code' ? value.toLowerCase() : value,
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setSaving(true)
      setErrorMessage('')

      const response = await fetch('/api/admin/branches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(getClientErrorMessage(result, 'تعذر إنشاء الفرع. لم يتم حفظ البيانات.'))
      }

      notifyAdminBranchOptionsChanged()
      router.push('/admin/branches')
      router.refresh()
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر إنشاء الفرع'
      )
    } finally {
      setSaving(false)
    }
  }

  if (accessLoading) {
    return (
      <div className="min-h-full w-full animate-pulse rounded-[28px] border border-cyan-300/10 bg-white/[0.055] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]" />
    )
  }

  if (!allowed || !isSystemAdmin) {
    return (
      <div className="min-h-full w-full max-w-full overflow-x-hidden text-white">
        <div className="rounded-[28px] border border-red-300/15 bg-red-500/10 p-6 text-right shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <h1 className="text-2xl font-black text-white">غير مصرح لك</h1>
          <p className="mt-2 text-slate-400">
            هذه الصفحة متاحة لمدير النظام فقط.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-h-full w-full max-w-full overflow-x-hidden">
      <div className="relative overflow-hidden rounded-[30px] border border-cyan-300/15 bg-[#07111d]/90 p-4 text-white shadow-[0_0_45px_rgba(34,211,238,0.08)] backdrop-blur-xl sm:p-6">
        <div className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-cyan-400/10 blur-[110px]" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-80 w-80 rounded-full bg-emerald-400/10 blur-[130px]" />

        <div className="relative z-10 space-y-6">
          <header className="flex flex-col gap-4 rounded-[26px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.24)] md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4 text-right">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.18)]">
                <BranchIcon className="h-7 w-7" />
              </div>
              <div>
                <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black tracking-[0.2em] text-cyan-200">
                  AFEX BRANCHES
                </span>
                <h1 className="mt-3 text-3xl font-black text-white">
                  إضافة فرع جديد
                </h1>
                <p className="mt-2 text-sm font-medium text-slate-400">
                  أنشئ فرعًا جديدًا مع رابط الموقع وأسماء العرض المستخدمة في الرسائل.
                </p>
              </div>
            </div>

            <Link
              href="/admin/branches"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] px-5 text-sm font-black text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100"
            >
              العودة إلى الفروع
            </Link>
          </header>

          {errorMessage ? (
            <div className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-right text-sm font-bold text-red-200 shadow-[0_12px_40px_rgba(239,68,68,0.12)]">
              {errorMessage}
            </div>
          ) : null}

          <form
            onSubmit={handleSubmit}
            className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.25)] md:p-6"
          >
            <div className="mb-6 text-right">
              <h2 className="text-2xl font-black text-white">بيانات الفرع</h2>
              <p className="mt-2 text-sm text-slate-400">
                أدخل البيانات الأساسية. يمكن تعديل الحالة لاحقًا من صفحة الفروع.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block text-right">
                <span className="mb-2 block text-sm font-bold text-slate-200">
                  كود الفرع
                </span>
                <div className="flex h-14 items-center gap-3 rounded-2xl border border-cyan-300/15 bg-white/[0.045] px-4 transition focus-within:border-cyan-300/55 focus-within:bg-white/[0.07] focus-within:ring-2 focus-within:ring-cyan-300/15">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
                    <FieldIcon type="code" />
                  </span>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(event) => updateField('code', event.target.value)}
                    placeholder="مثال: riyadh"
                    autoComplete="off"
                    className="h-full min-w-0 flex-1 bg-transparent text-right text-sm font-bold text-white outline-none placeholder:text-slate-500"
                  />
                </div>
              </label>

              <label className="block text-right">
                <span className="mb-2 block text-sm font-bold text-slate-200">
                  اسم الفرع
                </span>
                <div className="flex h-14 items-center gap-3 rounded-2xl border border-cyan-300/15 bg-white/[0.045] px-4 transition focus-within:border-cyan-300/55 focus-within:bg-white/[0.07] focus-within:ring-2 focus-within:ring-cyan-300/15">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
                    <FieldIcon type="name" />
                  </span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) => updateField('name', event.target.value)}
                    placeholder="مثال: فرع الرياض"
                    autoComplete="off"
                    className="h-full min-w-0 flex-1 bg-transparent text-right text-sm font-bold text-white outline-none placeholder:text-slate-500"
                  />
                </div>
              </label>

              <label className="block text-right md:col-span-2">
                <span className="mb-2 block text-sm font-bold text-slate-200">
                  رابط موقع الفرع
                </span>
                <div className="flex h-14 items-center gap-3 rounded-2xl border border-cyan-300/15 bg-white/[0.045] px-4 transition focus-within:border-cyan-300/55 focus-within:bg-white/[0.07] focus-within:ring-2 focus-within:ring-cyan-300/15">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
                    <FieldIcon type="map" />
                  </span>
                  <input
                    type="text"
                    value={form.map_url}
                    onChange={(event) =>
                      updateField('map_url', event.target.value)
                    }
                    placeholder="https://maps.google.com/..."
                    autoComplete="off"
                    dir="ltr"
                    className="h-full min-w-0 flex-1 bg-transparent text-left text-sm font-bold text-white outline-none placeholder:text-slate-500"
                  />
                </div>
              </label>

              <label className="block text-right">
                <span className="mb-2 block text-sm font-bold text-slate-200">
                  اسم المحل في الرسائل
                </span>
                <div className="flex h-14 items-center gap-3 rounded-2xl border border-cyan-300/15 bg-white/[0.045] px-4 transition focus-within:border-cyan-300/55 focus-within:bg-white/[0.07] focus-within:ring-2 focus-within:ring-cyan-300/15">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
                    <FieldIcon type="store" />
                  </span>
                  <input
                    type="text"
                    value={form.display_store_name}
                    onChange={(event) =>
                      updateField('display_store_name', event.target.value)
                    }
                    placeholder="مثال: AFEX"
                    autoComplete="off"
                    className="h-full min-w-0 flex-1 bg-transparent text-right text-sm font-bold text-white outline-none placeholder:text-slate-500"
                  />
                </div>
              </label>

              <label className="block text-right">
                <span className="mb-2 block text-sm font-bold text-slate-200">
                  اسم الفرع في الرسائل
                </span>
                <div className="flex h-14 items-center gap-3 rounded-2xl border border-cyan-300/15 bg-white/[0.045] px-4 transition focus-within:border-cyan-300/55 focus-within:bg-white/[0.07] focus-within:ring-2 focus-within:ring-cyan-300/15">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
                    <FieldIcon type="name" />
                  </span>
                  <input
                    type="text"
                    value={form.display_branch_name}
                    onChange={(event) =>
                      updateField('display_branch_name', event.target.value)
                    }
                    placeholder="مثال: فرع الروضة"
                    autoComplete="off"
                    className="h-full min-w-0 flex-1 bg-transparent text-right text-sm font-bold text-white outline-none placeholder:text-slate-500"
                  />
                </div>
              </label>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Link
                href="/admin/branches"
                className="inline-flex h-13 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] px-5 text-sm font-black text-slate-200 transition hover:border-cyan-300/25 hover:bg-white/[0.08]"
              >
                إلغاء
              </Link>
              <button
                type="submit"
                disabled={!canSubmit || saving}
                className="inline-flex h-13 items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 text-sm font-black text-slate-950 shadow-[0_0_35px_rgba(34,211,238,0.22)] transition hover:scale-[1.01] hover:shadow-[0_0_45px_rgba(34,211,238,0.3)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'جارٍ الحفظ...' : 'حفظ الفرع'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

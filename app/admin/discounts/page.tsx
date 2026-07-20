'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AdminDarkSelect } from '@/components/admin-dark-select'
import { AdminInput } from '@/components/admin-input'
import { usePageAccess } from '@/hooks/use-page-access'
import { getClientCaughtErrorMessage, getClientErrorMessage } from '@/lib/api/client-error'
import {
  peekClientResource,
  writeClientResource,
} from '@/lib/client-resource-cache'
import { formatCurrency } from '@/lib/orders/format'

type DiscountType = 'percentage' | 'fixed'

type DiscountRecord = {
  id: string
  name: string
  type: DiscountType
  value: number
  is_active: boolean
  branch_id: string | null
  created_at: string
  updated_at: string
}

type BranchRecord = {
  id: string
  code: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

const ADMIN_BRANCHES_CACHE_KEY = 'admin-branches'
const ADMIN_DISCOUNTS_INCLUDE_INACTIVE_CACHE_KEY =
  'admin-discounts:includeInactive'

function TrashIcon({ className = '' }: { className?: string }) {
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
      <path d="M3 6h18" />
      <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
      <path d="M19 6l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

function DiscountIcon({ className = '' }: { className?: string }) {
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
      <path d="M19 5 5 19" />
      <circle cx="7.5" cy="7.5" r="2.5" />
      <circle cx="16.5" cy="16.5" r="2.5" />
    </svg>
  )
}

function ToggleSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      aria-pressed={checked}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition ${
        checked
          ? 'bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.35)]'
          : 'bg-white/15'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${
          checked ? 'right-0.5' : 'right-[18px]'
        }`}
      />
    </button>
  )
}

function formatDiscountValue(discount: Pick<DiscountRecord, 'type' | 'value'>) {
  if (discount.type === 'percentage') {
    return `${discount.value}%`
  }

  return formatCurrency(discount.value)
}

export default function AdminDiscountsPage() {
  const access = usePageAccess(['admin'])
  const { loading: accessLoading, allowed, scopeType } = access
  const isSystemAdmin = scopeType === 'system'

  const [discounts, setDiscounts] = useState<DiscountRecord[]>(
    () =>
      peekClientResource<DiscountRecord[]>(
        ADMIN_DISCOUNTS_INCLUDE_INACTIVE_CACHE_KEY
      ) || []
  )
  const [branches, setBranches] = useState<BranchRecord[]>(
    () => peekClientResource<BranchRecord[]>(ADMIN_BRANCHES_CACHE_KEY) || []
  )
  const [name, setName] = useState('')
  const [type, setType] = useState<DiscountType>('percentage')
  const [value, setValue] = useState('')
  const [branchId, setBranchId] = useState('')
  const [loadingDiscounts, setLoadingDiscounts] = useState(
    !(peekClientResource<DiscountRecord[]>(
      ADMIN_DISCOUNTS_INCLUDE_INACTIVE_CACHE_KEY
    ) || []).length
  )
  const [loadingBranches, setLoadingBranches] = useState(
    !(peekClientResource<BranchRecord[]>(ADMIN_BRANCHES_CACHE_KEY) || []).length
  )
  const [creating, setCreating] = useState(false)
  const [togglingDiscountId, setTogglingDiscountId] = useState<string | null>(null)
  const [deletingDiscountId, setDeletingDiscountId] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const canCreate = useMemo(() => {
    return name.trim().length > 0 && value.trim().length > 0
  }, [name, value])

  const branchNameMap = useMemo(() => {
    return new Map(branches.map((branch) => [branch.id, branch.name] as const))
  }, [branches])
  const branchOptions = useMemo(
    () => [
      { value: '', label: 'كل الفروع' },
      ...branches.map((branch) => ({
        value: branch.id,
        label: branch.name,
      })),
    ],
    [branches]
  )

  async function loadDiscounts() {
    try {
      const cachedDiscounts =
        peekClientResource<DiscountRecord[]>(
          ADMIN_DISCOUNTS_INCLUDE_INACTIVE_CACHE_KEY
        ) || []

      if (cachedDiscounts.length > 0) {
        setDiscounts(cachedDiscounts)
        setLoadingDiscounts(false)
      } else {
        setLoadingDiscounts(true)
      }
      setErrorMessage('')

      const response = await fetch('/api/admin/discounts?includeInactive=true', {
        method: 'GET',
        cache: 'no-store',
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        throw new Error(getClientErrorMessage(result, 'تعذر تحميل الخصومات حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
      }

      const nextDiscounts = Array.isArray(result.discounts) ? result.discounts : []
      setDiscounts(nextDiscounts)
      writeClientResource(ADMIN_DISCOUNTS_INCLUDE_INACTIVE_CACHE_KEY, nextDiscounts)
    } catch (error) {
      console.error('Load discounts error:', error)
      setErrorMessage(getClientCaughtErrorMessage(error, 'تعذر تحميل الخصومات'))
    } finally {
      setLoadingDiscounts(false)
    }
  }

  async function loadBranches() {
    try {
      const cachedBranches =
        peekClientResource<BranchRecord[]>(ADMIN_BRANCHES_CACHE_KEY) || []

      if (cachedBranches.length > 0) {
        setBranches(cachedBranches)
        setLoadingBranches(false)
      } else {
        setLoadingBranches(true)
      }

      const response = await fetch('/api/admin/branches', {
        method: 'GET',
        cache: 'no-store',
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        throw new Error(getClientErrorMessage(result, 'تعذر تحميل الفروع حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
      }
      const nextBranches = Array.isArray(result.branches) ? result.branches : []
      setBranches(nextBranches)
      writeClientResource(ADMIN_BRANCHES_CACHE_KEY, nextBranches)
    } catch (error) {
      console.error('Load branches error:', error)
    } finally {
      setLoadingBranches(false)
    }
  }

  useEffect(() => {
    if (accessLoading || !allowed) return

    const timeoutId = window.setTimeout(() => {
      void loadDiscounts()
      void loadBranches()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [accessLoading, allowed])

  async function handleCreateDiscount(event: React.FormEvent) {
    event.preventDefault()

    try {
      setCreating(true)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch('/api/admin/discounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          type,
          value,
          branch_id: branchId || null,
        }),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        throw new Error(getClientErrorMessage(result, 'تعذر حفظ الخصم. لم يتم حفظ التغييرات.'))
      }

      setSuccessMessage('تمت إضافة خصم جديد بنجاح')
      setName('')
      setType('percentage')
      setValue('')
      setBranchId('')
      await loadDiscounts()
    } catch (error) {
      console.error('Create discount error:', error)
      setErrorMessage(getClientCaughtErrorMessage(error, 'تعذر إضافة الخصم'))
    } finally {
      setCreating(false)
    }
  }

  async function handleToggleDiscount(discount: DiscountRecord) {
    try {
      setTogglingDiscountId(discount.id)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch('/api/admin/discounts', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: discount.id,
          is_active: !discount.is_active,
        }),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        throw new Error(getClientErrorMessage(result, 'تعذر تحديث الخصم. لم يتم حفظ التغييرات.'))
      }

      setSuccessMessage(
        !discount.is_active ? 'تم تفعيل الخصم بنجاح' : 'تم تعطيل الخصم بنجاح'
      )
      setDiscounts((prev) =>
        prev.map((item) =>
          item.id === discount.id
            ? {
                ...item,
                is_active: !discount.is_active,
              }
            : item
        )
      )
    } catch (error) {
      console.error('Toggle discount error:', error)
      setErrorMessage(getClientCaughtErrorMessage(error, 'تعذر تحديث حالة الخصم'))
    } finally {
      setTogglingDiscountId(null)
    }
  }

  async function handleDeleteDiscount(discount: DiscountRecord) {
    try {
      setDeletingDiscountId(discount.id)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch('/api/admin/discounts', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: discount.id,
        }),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        throw new Error(getClientErrorMessage(result, 'تعذر حذف الخصم. لم يتم تنفيذ الحذف.'))
      }

      setSuccessMessage('تم حذف الخصم بنجاح')
      setDiscounts((prev) => prev.filter((item) => item.id !== discount.id))
    } catch (error) {
      console.error('Delete discount error:', error)
      setErrorMessage(getClientCaughtErrorMessage(error, 'تعذر حذف الخصم'))
    } finally {
      setDeletingDiscountId(null)
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

            <div className="mt-4 flex flex-wrap justify-end gap-3">
              <Link
                href="/"
                className="inline-flex items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-cyan-100"
              >
                العودة إلى القائمة الرئيسية
              </Link>
            </div>
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
                <DiscountIcon className="h-7 w-7" />
              </div>
              <div>
                <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black tracking-[0.2em] text-cyan-200">
                  AFEX CHECKOUT
                </span>
                <h1 className="mt-3 text-3xl font-black text-white md:text-4xl">
                  الخصومات
                </h1>
                <p className="mt-2 text-sm font-medium text-slate-400">
                  إدارة الخصومات المستخدمة في شاشة الدفع
                </p>
              </div>
            </div>

            <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-slate-200">
              <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.8)]" />
              {discounts.length} خصم
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
          <div className="mb-5 flex flex-col gap-2 text-right">
            <span className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200/80">
              Create Discount
            </span>
            <h2 className="text-2xl font-black text-white">إضافة خصم جديد</h2>
            <p className="text-sm text-slate-400">
              أنشئ خصومات ثابتة أو نسبية لاستخدامها سريعًا داخل شاشة الدفع.
            </p>
          </div>

          <form onSubmit={handleCreateDiscount} className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="text-right">
                <label className="mb-2 block text-sm font-bold text-slate-200">
                  اسم الخصم
                </label>
                <AdminInput
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="مثال: خصم نهاية الأسبوع"
                  className="h-14 rounded-2xl !border-white/10 !bg-[rgba(255,255,255,0.04)] px-5 text-right text-sm font-bold !text-white !shadow-none !outline-none !placeholder:text-slate-500 focus:!border-cyan-300/55 focus:!bg-white/[0.06] focus:!ring-2 focus:!ring-cyan-300/20"
                  autoComplete="off"
                />
              </div>

              <div className="text-right">
                <label className="mb-2 block text-sm font-bold text-slate-200">
                  القيمة
                </label>
                <AdminInput
                  type="number"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={type === 'percentage' ? '10' : '50'}
                  className="h-14 rounded-2xl !border-white/10 !bg-[rgba(255,255,255,0.04)] px-5 text-right text-sm font-bold !text-white !shadow-none !outline-none !placeholder:text-slate-500 focus:!border-cyan-300/55 focus:!bg-white/[0.06] focus:!ring-2 focus:!ring-cyan-300/20"
                />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="text-right">
                <label className="mb-2 block text-sm font-bold text-slate-200">
                  نوع الخصم
                </label>
                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/20 p-1">
                  <button
                    type="button"
                    onClick={() => setType('percentage')}
                    className={`h-12 rounded-xl px-4 text-sm font-black transition duration-150 ${
                      type === 'percentage'
                        ? 'bg-gradient-to-l from-cyan-300 to-emerald-300 text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.22)]'
                        : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'
                    }`}
                  >
                    نسبة مئوية
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('fixed')}
                    className={`h-12 rounded-xl px-4 text-sm font-black transition duration-150 ${
                      type === 'fixed'
                        ? 'bg-gradient-to-l from-cyan-300 to-emerald-300 text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.22)]'
                        : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'
                    }`}
                  >
                    مبلغ ثابت
                  </button>
                </div>
              </div>

              <div className="text-right">
                <label className="mb-2 block text-sm font-bold text-slate-200">
                  النطاق / الفرع
                </label>
                <AdminDarkSelect
                  value={branchId}
                  onChange={setBranchId}
                  disabled={loadingBranches}
                  options={branchOptions}
                  ariaLabel="النطاق أو الفرع"
                  placeholder="اختر الفرع"
                  triggerClassName="h-14 rounded-2xl !border-white/10 !bg-[rgba(255,255,255,0.04)] px-5"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!canCreate || creating}
                className="inline-flex h-14 min-w-[170px] items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-6 text-sm font-black text-slate-950 shadow-[0_0_35px_rgba(34,211,238,0.22)] transition duration-150 hover:scale-[1.01] hover:shadow-[0_0_45px_rgba(34,211,238,0.3)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? 'جارٍ الحفظ...' : 'إضافة خصم'}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-[28px] border border-cyan-300/15 bg-white/[0.055] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-6">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="text-right">
              <span className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200/80">
                Discounts List
              </span>
              <h2 className="mt-2 text-2xl font-black text-white">قائمة الخصومات</h2>
              <p className="mt-1 text-sm text-slate-400">
                راقب الخصومات، نطاق تطبيقها، وحالة تفعيلها.
              </p>
            </div>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-sm font-bold text-cyan-100">
              {discounts.length} خصم
            </span>
          </div>

          {loadingDiscounts ? (
            <div className="rounded-2xl border border-dashed border-cyan-300/15 bg-black/20 px-4 py-10 text-center text-sm font-bold text-slate-400">
              جارٍ تحميل الخصومات...
            </div>
          ) : discounts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-cyan-300/20 bg-black/20 px-4 py-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                <DiscountIcon className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-lg font-black text-white">
                لا توجد خصومات مضافة حالياً
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                أضف أول خصم ليظهر للكاشير داخل شاشة الدفع.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#06111f]/65">
              <table data-responsive-table="discounts" className="responsive-admin-table w-full min-w-[820px] text-right">
                <thead className="bg-white/[0.035]">
                  <tr className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    <th className="px-5 py-4">الخصم</th>
                    <th className="px-5 py-4 text-center">النوع</th>
                    <th className="px-5 py-4 text-center">القيمة</th>
                    <th className="px-5 py-4 text-center">النطاق</th>
                    <th className="px-5 py-4 text-center">الحالة</th>
                    <th className="px-5 py-4 text-center">الإجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {discounts.map((discount) => (
                    <tr
                      key={discount.id}
                      className="border-b border-white/[0.08] transition hover:bg-cyan-300/[0.035] last:border-b-0"
                    >
                      <td className="px-5 py-4 max-md:!block max-md:!border-0 max-md:!p-0 max-md:before:!hidden">
                        <div className="hidden items-center gap-3 md:flex">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
                            <DiscountIcon className="h-5 w-5" />
                          </span>
                          <span className="text-sm font-black text-white">
                            {discount.name}
                          </span>
                        </div>
                        <div data-mobile-discount-card className="min-w-0 p-4 md:hidden"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-white">{discount.name}</p><p className="mt-1 text-xs font-bold text-slate-400">{discount.type === 'percentage' ? 'نسبة مئوية' : 'مبلغ ثابت'} · {discount.branch_id ? branchNameMap.get(discount.branch_id) || 'فرع محدد' : 'كل الفروع'}</p></div><p className="shrink-0 text-lg font-black text-cyan-100">{formatDiscountValue(discount)}</p></div><div className="mt-4 flex items-center justify-between border-t border-white/[0.07] pt-3"><ToggleSwitch checked={discount.is_active} disabled={togglingDiscountId === discount.id} onChange={() => void handleToggleDiscount(discount)} /><button type="button" disabled={deletingDiscountId === discount.id} onClick={() => void handleDeleteDiscount(discount)} className="min-h-11 rounded-xl border border-red-300/20 bg-red-500/10 px-4 text-xs font-black text-red-200 disabled:opacity-40">حذف</button></div></div>
                      </td>
                      <td className="px-5 py-4 text-center max-md:!hidden">
                        <span className="inline-flex rounded-full border border-white/10 bg-white/[0.055] px-3 py-1 text-xs font-black text-slate-200">
                          {discount.type === 'percentage' ? 'نسبة مئوية' : 'مبلغ ثابت'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center text-sm font-black text-cyan-100 max-md:!hidden">
                        {formatDiscountValue(discount)}
                      </td>
                      <td className="px-5 py-4 text-center text-sm font-bold text-slate-300 max-md:!hidden">
                        {discount.branch_id
                          ? branchNameMap.get(discount.branch_id) || 'فرع محدد'
                          : 'كل الفروع'}
                      </td>
                      <td className="px-5 py-4 text-center max-md:!hidden">
                        <div className="flex items-center justify-center">
                          <ToggleSwitch
                            checked={discount.is_active}
                            disabled={togglingDiscountId === discount.id}
                            onChange={() => void handleToggleDiscount(discount)}
                          />
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center max-md:!hidden">
                        <button
                          type="button"
                          disabled={deletingDiscountId === discount.id}
                          onClick={() => void handleDeleteDiscount(discount)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-300/20 bg-red-500/10 text-red-200 transition hover:bg-red-500/15 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="حذف"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

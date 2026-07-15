'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AdminDarkSelect } from '@/components/admin-dark-select'
import { AdminInput } from '@/components/admin-input'
import { usePageAccess } from '@/hooks/use-page-access'
import { getClientErrorMessage } from '@/lib/api/client-error'
import {
  peekClientResource,
  writeClientResource,
} from '@/lib/client-resource-cache'

type BranchRecord = {
  id: string
  code: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

type VatSetting = {
  id: string
  name: string
  rate: number
  is_active: boolean
  branch_id: string | null
  created_at: string
  updated_at: string
}

const ADMIN_BRANCHES_CACHE_KEY = 'admin-branches'

function getVatCacheKey(branchId: string | null) {
  return `admin-vat:${branchId || 'all'}`
}

function VatIcon({ className = '' }: { className?: string }) {
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
      <path d="M12 3v3" />
      <path d="M12 18v3" />
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
      className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border transition ${
        checked
          ? 'border-cyan-300/40 bg-gradient-to-l from-cyan-300 to-emerald-300 shadow-[0_0_24px_rgba(34,211,238,0.28)]'
          : 'border-white/10 bg-white/10'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition ${
          checked ? 'right-0.5' : 'right-[22px]'
        }`}
      />
    </button>
  )
}

export default function AdminVatPage() {
  const access = usePageAccess(['admin'])
  const { loading: accessLoading, allowed, scopeType } = access
  const isSystemAdmin = scopeType === 'system'

  const [branches, setBranches] = useState<BranchRecord[]>(
    () => peekClientResource<BranchRecord[]>(ADMIN_BRANCHES_CACHE_KEY) || []
  )
  const [branchId, setBranchId] = useState('')
  const [rate, setRate] = useState('15')
  const [isActive, setIsActive] = useState(false)
  const [loadingBranches, setLoadingBranches] = useState(
    !(peekClientResource<BranchRecord[]>(ADMIN_BRANCHES_CACHE_KEY) || []).length
  )
  const [loadingSetting, setLoadingSetting] = useState(
    !peekClientResource<VatSetting | null>(getVatCacheKey(branchId))
  )
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

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

  const canSave = useMemo(() => {
    const numericRate = Number(rate)
    return rate.trim().length > 0 && Number.isFinite(numericRate) && numericRate >= 0
  }, [rate])

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

  async function loadVatSetting(nextBranchId: string) {
    try {
      const vatCacheKey = getVatCacheKey(nextBranchId || null)
      const cachedSetting =
        peekClientResource<VatSetting | null>(vatCacheKey) || null

      if (cachedSetting) {
        setRate(
          Number.isFinite(Number(cachedSetting.rate))
            ? String(Number(cachedSetting.rate))
            : '15'
        )
        setIsActive(Boolean(cachedSetting.is_active))
        setLoadingSetting(false)
      } else {
        setLoadingSetting(true)
      }
      setErrorMessage('')

      const searchParams = new URLSearchParams()
      if (nextBranchId) {
        searchParams.set('branchId', nextBranchId)
      }

      const response = await fetch(
        `/api/admin/vat${searchParams.toString() ? `?${searchParams.toString()}` : ''}`,
        {
          method: 'GET',
          cache: 'no-store',
        }
      )

      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        throw new Error(
          getClientErrorMessage(result, 'تعذر تحميل إعدادات الضريبة حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.')
        )
      }

      const setting = (result.setting as VatSetting | undefined) || null

      setRate(
        setting && Number.isFinite(Number(setting.rate))
          ? String(Number(setting.rate))
          : '15'
      )
      setIsActive(Boolean(setting?.is_active))
      writeClientResource(vatCacheKey, setting)
    } catch (error) {
      console.error('Load VAT setting error:', error)
      setRate('15')
      setIsActive(false)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر تحميل إعدادات الضريبة'
      )
    } finally {
      setLoadingSetting(false)
    }
  }

  useEffect(() => {
    if (accessLoading || !allowed || !isSystemAdmin) return

    const timeoutId = window.setTimeout(() => {
      void loadBranches()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [accessLoading, allowed, isSystemAdmin])

  useEffect(() => {
    if (accessLoading || !allowed || !isSystemAdmin) return

    const timeoutId = window.setTimeout(() => {
      void loadVatSetting(branchId)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [accessLoading, allowed, branchId, isSystemAdmin])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()

    try {
      setSaving(true)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch('/api/admin/vat', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'VAT',
          rate,
          is_active: isActive,
          branch_id: branchId || null,
        }),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        throw new Error(
          getClientErrorMessage(result, 'تعذر حفظ إعدادات الضريبة. لم يتم حفظ التغييرات.')
        )
      }

      setSuccessMessage('تم حفظ إعدادات الضريبة بنجاح')
      await loadVatSetting(branchId)
    } catch (error) {
      console.error('Save VAT setting error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر حفظ إعدادات الضريبة'
      )
    } finally {
      setSaving(false)
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
                <VatIcon className="h-7 w-7" />
              </div>
              <div>
                <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black tracking-[0.2em] text-cyan-200">
                  AFEX VAT
                </span>
                <h1 className="mt-3 text-3xl font-black text-white md:text-4xl">
                  الضريبة - VAT
                </h1>
                <p className="mt-2 text-sm font-medium text-slate-400">
                  إدارة ضريبة القيمة المضافة المستخدمة في شاشة الدفع
                </p>
              </div>
            </div>

            <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-slate-200">
              <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.8)]" />
              {isActive ? 'الضريبة مفعّلة' : 'الضريبة غير مفعّلة'}
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
              VAT Settings
            </span>
            <h2 className="text-2xl font-black text-white">إعدادات الضريبة</h2>
            <p className="text-sm text-slate-400">
              اضبط نسبة الضريبة ونطاق تطبيقها داخل نقطة البيع وشاشة الدفع.
            </p>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="text-right">
                <label className="mb-2 block text-sm font-bold text-slate-200">
                  نسبة الضريبة
                </label>
                <div className="relative">
                  <AdminInput
                    type="number"
                    value={rate}
                    onChange={(event) => setRate(event.target.value)}
                    placeholder="15"
                    className="h-14 rounded-2xl !border-white/10 !bg-[rgba(255,255,255,0.04)] px-5 pl-14 text-right text-sm font-bold !text-white !shadow-none !outline-none !placeholder:text-slate-500 focus:!border-cyan-300/55 focus:!bg-white/[0.06] focus:!ring-2 focus:!ring-cyan-300/20"
                  />
                  <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-sm font-black text-cyan-200">
                    %
                  </span>
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

            <div className="rounded-2xl border border-cyan-300/15 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-right">
                  <p className="text-sm font-black text-white">تفعيل الضريبة</p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    {isActive
                      ? 'سيتم تطبيق الضريبة تلقائيًا في شاشة الدفع'
                      : 'لن يتم تطبيق أي ضريبة في شاشة الدفع'}
                  </p>
                </div>

                <ToggleSwitch
                  checked={isActive}
                  disabled={loadingSetting || saving}
                  onChange={() => setIsActive((current) => !current)}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!canSave || saving || loadingSetting}
                className="inline-flex h-14 min-w-[180px] items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-6 text-sm font-black text-slate-950 shadow-[0_0_35px_rgba(34,211,238,0.22)] transition duration-150 hover:scale-[1.01] hover:shadow-[0_0_45px_rgba(34,211,238,0.3)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}

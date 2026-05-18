'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePageAccess } from '@/hooks/use-page-access'
import { type AdminBranchRecord } from '@/lib/admin/branches'
import { supabase } from '@/lib/supabase/client'

type MovementType =
  | 'purchase_receive'
  | 'manual_adjustment'
  | 'sale'
  | 'sale_void'
  | 'transfer_in'
  | 'transfer_out'

type MovementRow = {
  id: string
  branch_id: string
  catalog_item_id: string
  movement_type: MovementType | string
  quantity_delta: number
  source_type: string | null
  source_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  catalog_items?: {
    name?: string | null
  } | null
  branches?: {
    name?: string | null
  } | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  username: string | null
}

const MOVEMENT_TYPE_OPTIONS: Array<{ value: MovementType; label: string }> = [
  { value: 'purchase_receive', label: 'استلام بضاعة' },
  { value: 'manual_adjustment', label: 'تصحيح مخزون' },
  { value: 'sale', label: 'بيع' },
  { value: 'sale_void', label: 'إلغاء بيع' },
  { value: 'transfer_in', label: 'تحويل وارد' },
  { value: 'transfer_out', label: 'تحويل صادر' },
]

function MovementIcon({ className = '' }: { className?: string }) {
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
      <path d="M4 19V5" />
      <path d="M20 19V5" />
      <path d="M8 19v-6" />
      <path d="M12 19V9" />
      <path d="M16 19v-3" />
      <path d="M4 19h16" />
    </svg>
  )
}

function RefreshIcon({ className = '' }: { className?: string }) {
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
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v6h-6" />
    </svg>
  )
}

function normalizeNumber(value: unknown) {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : 0

  return Number.isFinite(numericValue) ? numericValue : 0
}

function normalizeMovementRow(row: Partial<MovementRow>) {
  return {
    id: String(row.id || ''),
    branch_id: String(row.branch_id || ''),
    catalog_item_id: String(row.catalog_item_id || ''),
    movement_type: row.movement_type || '',
    quantity_delta: normalizeNumber(row.quantity_delta),
    source_type: row.source_type || null,
    source_id: row.source_id || null,
    notes: row.notes || null,
    created_by: row.created_by || null,
    created_at: String(row.created_at || ''),
    catalog_items: row.catalog_items || null,
    branches: row.branches || null,
  } satisfies MovementRow
}

function getMovementTypeLabel(value: string) {
  return (
    MOVEMENT_TYPE_OPTIONS.find((option) => option.value === value)?.label ||
    value ||
    '—'
  )
}

function getMovementTone(value: string) {
  if (value === 'sale' || value === 'transfer_out') {
    return 'border-red-300/20 bg-red-500/10 text-red-100'
  }

  if (value === 'sale_void' || value === 'purchase_receive' || value === 'transfer_in') {
    return 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'
  }

  return 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100'
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ar-SA', {
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return new Intl.DateTimeFormat('ar-SA', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function getProfileLabel(profile: ProfileRow | undefined) {
  if (!profile) {
    return '—'
  }

  return profile.full_name?.trim() || profile.username?.trim() || '—'
}

export default function InventoryMovementsPage() {
  const access = usePageAccess(['admin'])
  const { loading: accessLoading, allowed, tenantId } = access

  const [branches, setBranches] = useState<AdminBranchRecord[]>([])
  const [movements, setMovements] = useState<MovementRow[]>([])
  const [profilesById, setProfilesById] = useState<Map<string, ProfileRow>>(
    () => new Map()
  )
  const [branchFilter, setBranchFilter] = useState('')
  const [movementTypeFilter, setMovementTypeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [loadingMovements, setLoadingMovements] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const filteredMovements = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    if (!normalizedSearch) {
      return movements
    }

    return movements.filter((movement) =>
      (movement.catalog_items?.name || '')
        .toLowerCase()
        .includes(normalizedSearch)
    )
  }, [movements, search])

  const loadBranches = useCallback(async () => {
    try {
      setLoadingBranches(true)

      const response = await fetch('/api/admin/branches', {
        method: 'GET',
        cache: 'no-store',
      })
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        throw new Error(result?.details || result?.error || 'تعذر تحميل الفروع')
      }

      const nextBranches = Array.isArray(result.branches)
        ? (result.branches as AdminBranchRecord[])
        : []

      setBranches(nextBranches.filter((branch) => !branch.deleted_at))
    } catch (error) {
      setBranches([])
      setErrorMessage(error instanceof Error ? error.message : 'تعذر تحميل الفروع')
    } finally {
      setLoadingBranches(false)
    }
  }, [])

  const loadMovements = useCallback(async () => {
    if (!tenantId) {
      setMovements([])
      return
    }

    try {
      setLoadingMovements(true)
      setErrorMessage('')

      let query = supabase
        .from('inventory_movements')
        .select(
          `
            id,
            branch_id,
            catalog_item_id,
            movement_type,
            quantity_delta,
            source_type,
            source_id,
            notes,
            created_by,
            created_at,
            catalog_items (
              name
            ),
            branches (
              name
            )
          `
        )
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(500)

      if (branchFilter) {
        query = query.eq('branch_id', branchFilter)
      }

      if (movementTypeFilter) {
        query = query.eq('movement_type', movementTypeFilter)
      }

      if (dateFrom) {
        query = query.gte('created_at', new Date(dateFrom).toISOString())
      }

      if (dateTo) {
        const inclusiveDateTo = new Date(dateTo)
        inclusiveDateTo.setHours(23, 59, 59, 999)
        query = query.lte('created_at', inclusiveDateTo.toISOString())
      }

      const { data, error } = await query

      if (error) {
        throw new Error(error.message || 'تعذر تحميل حركات المخزون')
      }

      const nextMovements = Array.isArray(data)
        ? data.map((row) => normalizeMovementRow(row as Partial<MovementRow>))
        : []
      const createdByIds = Array.from(
        new Set(
          nextMovements
            .map((movement) => movement.created_by)
            .filter((value): value is string => Boolean(value))
        )
      )

      let nextProfilesById = new Map<string, ProfileRow>()

      if (createdByIds.length > 0) {
        const { data: profileRows, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, username')
          .eq('tenant_id', tenantId)
          .in('id', createdByIds)

        if (!profilesError && Array.isArray(profileRows)) {
          nextProfilesById = new Map(
            (profileRows as ProfileRow[]).map((profile) => [profile.id, profile])
          )
        }
      }

      setProfilesById(nextProfilesById)
      setMovements(nextMovements)
    } catch (error) {
      setMovements([])
      setProfilesById(new Map())
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر تحميل حركات المخزون'
      )
    } finally {
      setLoadingMovements(false)
    }
  }, [branchFilter, dateFrom, dateTo, movementTypeFilter, tenantId])

  useEffect(() => {
    if (!accessLoading && allowed) {
      const timeoutId = window.setTimeout(() => {
        void loadBranches()
      }, 0)

      return () => window.clearTimeout(timeoutId)
    }
  }, [accessLoading, allowed, loadBranches])

  useEffect(() => {
    if (!accessLoading && allowed) {
      const timeoutId = window.setTimeout(() => {
        void loadMovements()
      }, 0)

      return () => window.clearTimeout(timeoutId)
    }
  }, [accessLoading, allowed, loadMovements])

  return (
    <div dir="rtl" className="space-y-6">
      <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#07111f]/90 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-5 border-b border-white/10 bg-gradient-to-l from-slate-900/90 via-slate-900/65 to-cyan-950/25 px-5 py-6 md:flex-row md:items-center md:justify-between md:px-7">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200 shadow-[0_0_35px_rgba(34,211,238,0.18)]">
              <MovementIcon className="h-7 w-7" />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.28em] text-cyan-300">
                INVENTORY MOVEMENTS
              </p>
              <h1 className="text-2xl font-black text-white md:text-3xl">
                حركات المخزون
              </h1>
              <p className="mt-2 text-sm font-bold text-slate-400">
                تتبع جميع عمليات المخزون داخل النظام
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadMovements()}
            disabled={loadingMovements}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-200 transition hover:border-cyan-300/25 hover:bg-cyan-300/10 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="تحديث الحركات"
            title="تحديث الحركات"
          >
            <RefreshIcon className="h-5 w-5" />
          </button>
        </div>
      </section>

      {errorMessage ? (
        <div className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100">
          {errorMessage}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#07111f]/90 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
        <div className="grid gap-3 border-b border-white/10 px-5 py-5 md:grid-cols-2 md:px-7 xl:grid-cols-5">
          <label className="block">
            <span className="mb-2 block text-xs font-black text-slate-400">
              الفرع
            </span>
            <select
              value={branchFilter}
              onChange={(event) => setBranchFilter(event.target.value)}
              disabled={loadingBranches}
              className="h-12 w-full rounded-2xl border border-white/10 bg-[#0a1424] px-4 text-sm font-bold text-white outline-none transition focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">كل الفروع</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-black text-slate-400">
              نوع الحركة
            </span>
            <select
              value={movementTypeFilter}
              onChange={(event) => setMovementTypeFilter(event.target.value)}
              className="h-12 w-full rounded-2xl border border-white/10 bg-[#0a1424] px-4 text-sm font-bold text-white outline-none transition focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/10"
            >
              <option value="">كل الحركات</option>
              {MOVEMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-black text-slate-400">
              من تاريخ
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-12 w-full rounded-2xl border border-white/10 bg-[#0a1424] px-4 text-sm font-bold text-white outline-none transition focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/10"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-black text-slate-400">
              إلى تاريخ
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="h-12 w-full rounded-2xl border border-white/10 bg-[#0a1424] px-4 text-sm font-bold text-white outline-none transition focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/10"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-black text-slate-400">
              بحث
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="اسم العنصر"
              className="h-12 w-full rounded-2xl border border-white/10 bg-[#0a1424] px-4 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/10"
            />
          </label>
        </div>

        <div className="overflow-x-auto px-5 py-5 md:px-7">
          <table className="w-full min-w-[900px] border-separate border-spacing-y-2 text-right">
            <thead>
              <tr className="text-xs font-black text-slate-500">
                <th className="px-3 py-2">التاريخ</th>
                <th className="px-3 py-2">العنصر</th>
                <th className="px-3 py-2">الفرع</th>
                <th className="px-3 py-2">نوع الحركة</th>
                <th className="px-3 py-2">الكمية</th>
                <th className="px-3 py-2">المستخدم</th>
                <th className="px-3 py-2">الملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {loadingMovements ? (
                <tr>
                  <td
                    colSpan={7}
                    className="rounded-2xl border border-white/10 bg-white/[0.035] px-5 py-10 text-center text-sm font-bold text-slate-400"
                  >
                    جارٍ تحميل الحركات...
                  </td>
                </tr>
              ) : filteredMovements.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="rounded-2xl border border-white/10 bg-white/[0.035] px-5 py-10 text-center text-sm font-bold text-slate-400"
                  >
                    لا توجد حركات مخزون
                  </td>
                </tr>
              ) : (
                filteredMovements.map((movement) => (
                  <tr
                    key={movement.id}
                    className="bg-slate-500/[0.045] transition hover:bg-cyan-300/[0.055]"
                  >
                    <td className="rounded-r-2xl border-y border-r border-white/[0.08] px-3 py-4 text-sm font-bold text-slate-300">
                      {formatDate(movement.created_at)}
                    </td>
                    <td className="border-y border-white/[0.08] px-3 py-4 text-sm font-black text-white">
                      {movement.catalog_items?.name || '—'}
                    </td>
                    <td className="border-y border-white/[0.08] px-3 py-4 text-sm font-bold text-slate-300">
                      {movement.branches?.name || '—'}
                    </td>
                    <td className="border-y border-white/[0.08] px-3 py-4">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getMovementTone(
                          movement.movement_type
                        )}`}
                      >
                        {getMovementTypeLabel(movement.movement_type)}
                      </span>
                    </td>
                    <td
                      className={`border-y border-white/[0.08] px-3 py-4 text-sm font-black ${
                        movement.quantity_delta < 0
                          ? 'text-red-100'
                          : 'text-emerald-100'
                      }`}
                    >
                      {movement.quantity_delta > 0 ? '+' : ''}
                      {formatNumber(movement.quantity_delta)}
                    </td>
                    <td className="border-y border-white/[0.08] px-3 py-4 text-sm font-bold text-slate-300">
                      {getProfileLabel(
                        movement.created_by
                          ? profilesById.get(movement.created_by)
                          : undefined
                      )}
                    </td>
                    <td className="rounded-l-2xl border-y border-l border-white/[0.08] px-3 py-4 text-sm font-bold text-slate-400">
                      {movement.notes || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

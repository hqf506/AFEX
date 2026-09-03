'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AdminDarkDateInput } from '@/components/admin-dark-date-input'
import { AdminDarkSelect } from '@/components/admin-dark-select'
import { AdminAlert } from '@/components/admin-ui'
import { MobileFilterSheet } from '@/components/mobile/mobile-overlays'
import { usePageAccess } from '@/hooks/use-page-access'
import { getClientErrorMessage } from '@/lib/api/client-error'
import { type AdminBranchRecord } from '@/lib/admin/branches'

type MovementType =
  | 'purchase_receive'
  | 'manual_adjustment'
  | 'sale'
  | 'sale_void'
  | 'transfer_in'
  | 'transfer_out'

type MovementRow = {
  id: string
  tenant_id: string
  branch_id: string
  catalog_item_id: string
  movement_type: MovementType | string
  quantity_delta: number
  source_type: string | null
  source_id: string | null
  notes: string | null
  created_by: string | null
  created_by_name: string
  actor_name: string
  actor_type: string
  actor_role_label: string
  actor_position_label: string
  resolved_invoice_id: string | null
  resolved_employee_id: string | null
  resolved_employee_name: string
  created_at: string
  item_name: string
  branch_name: string
}

const MOVEMENT_TYPE_OPTIONS: Array<{ value: MovementType; label: string }> = [
  { value: 'purchase_receive', label: 'استلام بضاعة' },
  { value: 'manual_adjustment', label: 'تصحيح مخزون' },
  { value: 'sale', label: 'بيع' },
  { value: 'sale_void', label: 'إلغاء بيع / إرجاع مخزون' },
  { value: 'transfer_in', label: 'تحويل وارد' },
  { value: 'transfer_out', label: 'تحويل صادر' },
]

const PAGE_SIZE = 10

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

function getTextField(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key]

    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }

  return ''
}

function getNullableTextField(row: Record<string, unknown>, keys: string[]) {
  const value = getTextField(row, keys)

  return value || null
}

function normalizeMovementRow(row: Record<string, unknown>) {
  return {
    id: getTextField(row, ['id', 'movement_id']),
    tenant_id: getTextField(row, ['tenant_id']),
    branch_id: getTextField(row, ['branch_id']),
    catalog_item_id: getTextField(row, ['catalog_item_id']),
    movement_type: getTextField(row, ['movement_type']),
    quantity_delta: normalizeNumber(row.quantity_delta),
    source_type: getNullableTextField(row, ['source_type']),
    source_id: getNullableTextField(row, ['source_id']),
    notes: getNullableTextField(row, ['notes']),
    created_by: getNullableTextField(row, ['created_by', 'created_by_id']),
    created_by_name: getTextField(row, [
      'created_by_name',
      'created_by_full_name',
      'created_by_username',
      'user_name',
      'username',
    ]),
    actor_name: getTextField(row, ['actor_name']),
    actor_type: getTextField(row, ['actor_type']),
    actor_role_label: getTextField(row, ['actor_role_label']),
    actor_position_label: getTextField(row, ['actor_position_label']),
    resolved_invoice_id: getNullableTextField(row, ['resolved_invoice_id']),
    resolved_employee_id: getNullableTextField(row, ['resolved_employee_id']),
    resolved_employee_name: getTextField(row, ['resolved_employee_name']),
    created_at: getTextField(row, ['created_at']),
    item_name: getTextField(row, [
      'item_name',
      'catalog_item_name',
      'catalog_name',
      'name',
    ]),
    branch_name: getTextField(row, ['branch_name']),
  } satisfies MovementRow
}

function getMovementTypeLabel(value: string) {
  return (
    MOVEMENT_TYPE_OPTIONS.find((option) => option.value === value)?.label ||
    'حركة مخزون'
  )
}

const SYSTEM_NOTE_LABELS: Record<string, string> = {
  'pos sale stock deduction': 'تم خصم الكمية بسبب عملية بيع',
  'خصم تلقائي من بيع pos': 'تم خصم الكمية بسبب عملية بيع',
  'manual stock increase': 'تمت زيادة الكمية يدويًا',
  'manual stock decrease': 'تم تخفيض الكمية يدويًا',
  'stock received': 'تمت إضافة الكمية إلى المخزون',
  'transfer in': 'تم استلام الكمية من فرع آخر',
  'transfer out': 'تم تحويل الكمية إلى فرع آخر',
  'order cancelled stock restore': 'تمت إعادة الكمية بعد إلغاء الطلب',
  'restore stock from cancelled invoice': 'تمت إعادة الكمية بعد إلغاء الطلب',
}

function getMovementNote(movement: MovementRow) {
  const note = movement.notes?.trim() || ''
  const translatedNote = SYSTEM_NOTE_LABELS[note.toLocaleLowerCase('en-US')]

  if (translatedNote) return translatedNote
  if (note) return note

  if (movement.movement_type === 'sale') return 'تم خصم الكمية بسبب عملية بيع'
  if (movement.movement_type === 'sale_void') return 'تمت إعادة الكمية بعد إلغاء الطلب'
  if (movement.movement_type === 'purchase_receive') return 'تمت إضافة الكمية إلى المخزون'
  if (movement.movement_type === 'transfer_in') return 'تم استلام الكمية من فرع آخر'
  if (movement.movement_type === 'transfer_out') return 'تم تحويل الكمية إلى فرع آخر'
  if (movement.movement_type === 'manual_adjustment') {
    return movement.quantity_delta >= 0
      ? 'تمت زيادة الكمية يدويًا'
      : 'تم تخفيض الكمية يدويًا'
  }

  return movement.quantity_delta >= 0
    ? 'تمت زيادة كمية المخزون'
    : 'تم تخفيض كمية المخزون'
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

function getActorTypeLabel(value: string) {
  if (value === 'pos_employee') {
    return 'موظف نقطة البيع'
  }

  if (value === 'owner') {
    return 'المالك'
  }

  if (value === 'admin') {
    return 'مدير النظام'
  }

  if (value === 'system' || value === 'unknown') {
    return 'النظام'
  }

  return 'النظام'
}

function getUserRoleDisplayLabel(value: string) {
  const normalizedValue = value.trim()

  if (normalizedValue === 'admin') {
    return 'مدير النظام'
  }

  if (normalizedValue === 'employee') {
    return 'موظف'
  }

  if (normalizedValue === 'cashier') {
    return 'أمين الصندوق'
  }

  if (normalizedValue === 'manager') {
    return 'مدير'
  }

  if (normalizedValue === 'owner') {
    return 'المالك'
  }

  return 'موظف'
}

function getActorTypeTone(value: string) {
  if (value === 'pos_employee') {
    return 'border-indigo-200/20 bg-indigo-300/10 text-indigo-100 shadow-[0_0_20px_rgba(129,140,248,0.12)]'
  }

  if (value === 'owner') {
    return 'border-amber-300/25 bg-amber-400/10 text-amber-100 shadow-[0_0_20px_rgba(251,191,36,0.12)]'
  }

  if (value === 'admin') {
    return 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100 shadow-[0_0_20px_rgba(52,211,153,0.12)]'
  }

  if (value === 'system') {
    return 'border-cyan-300/15 bg-cyan-300/10 text-cyan-100'
  }

  return 'border-slate-300/15 bg-white/[0.045] text-slate-300'
}

function getActorDisplay(movement: MovementRow) {
  const actorName =
    movement.created_by_name?.trim() || movement.actor_name?.trim() || ''
  const isSystemActor =
    movement.actor_type === 'system' ||
    movement.actor_type === 'unknown' ||
    !actorName

  if (isSystemActor) {
    return {
      name: 'تم تعديل من قبل النظام',
      actorType: 'system',
    }
  }

  return {
    name: actorName,
    actorType: movement.actor_type,
  }
}

function getActorRoleLabel(movement: MovementRow, actorType: string) {
  if (actorType === 'system' || actorType === 'unknown') {
    return getActorTypeLabel(actorType)
  }

  const roleLabel = movement.actor_role_label?.trim()

  if (roleLabel) {
    return getUserRoleDisplayLabel(roleLabel)
  }

  const positionLabel = movement.actor_position_label?.trim()

  if (positionLabel) {
    return getUserRoleDisplayLabel(positionLabel)
  }

  return getActorTypeLabel(actorType)
}

function getActorInitials(name: string) {
  const normalizedName = name.trim()

  if (!normalizedName || normalizedName === 'النظام') {
    return 'SYS'
  }

  const words = normalizedName
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)

  if (words.length === 0) {
    return 'SYS'
  }

  const initials = words
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join('')

  return initials.toUpperCase()
}

function getActorAvatarTone(name: string, actorType: string) {
  if (actorType === 'system' || name.trim() === 'النظام') {
    return 'border-cyan-200/10 bg-gradient-to-br from-slate-700 to-slate-950 text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.10)]'
  }

  if (actorType === 'owner') {
    return 'border-amber-200/20 bg-gradient-to-br from-amber-400 to-yellow-950 text-white shadow-[0_0_30px_rgba(245,158,11,0.20)]'
  }

  if (actorType === 'admin') {
    return 'border-emerald-200/20 bg-gradient-to-br from-emerald-400 to-teal-950 text-white shadow-[0_0_30px_rgba(16,185,129,0.20)]'
  }

  const toneIndex = Array.from(name).reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0
  ) % 4
  const tones = [
    'border-indigo-200/20 bg-gradient-to-br from-indigo-400 to-indigo-950 text-white shadow-[0_0_30px_rgba(99,102,241,0.22)]',
    'border-violet-200/20 bg-gradient-to-br from-violet-400 to-violet-950 text-white shadow-[0_0_30px_rgba(139,92,246,0.20)]',
    'border-emerald-200/20 bg-gradient-to-br from-emerald-400 to-emerald-950 text-white shadow-[0_0_30px_rgba(34,197,94,0.20)]',
    'border-cyan-200/20 bg-gradient-to-br from-cyan-400 to-slate-950 text-white shadow-[0_0_30px_rgba(34,211,238,0.18)]',
  ]

  return tones[toneIndex]
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('ar-SA', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function normalizeDateFilterValue(value: string) {
  const trimmedValue = value.trim()

  return /^\d{4}-\d{2}-\d{2}$/.test(trimmedValue) ? trimmedValue : ''
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-cyan-200 transition ${
        open ? 'rotate-180' : ''
      }`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function getPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const items: Array<number | string> = [1]
  const startPage = Math.max(2, currentPage - 1)
  const endPage = Math.min(totalPages - 1, currentPage + 1)

  if (startPage > 2) {
    items.push('start-ellipsis')
  }

  for (let page = startPage; page <= endPage; page += 1) {
    items.push(page)
  }

  if (endPage < totalPages - 1) {
    items.push('end-ellipsis')
  }

  items.push(totalPages)

  return items
}

export default function InventoryMovementsPage() {
  const access = usePageAccess(['admin'])
  const { loading: accessLoading, allowed, tenantId } = access

  const [branches, setBranches] = useState<AdminBranchRecord[]>([])
  const [movements, setMovements] = useState<MovementRow[]>([])
  const [branchFilter, setBranchFilter] = useState('')
  const [movementTypeFilter, setMovementTypeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [loadingMovements, setLoadingMovements] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalMovements, setTotalMovements] = useState(0)
  const [branchMenuOpen, setBranchMenuOpen] = useState(false)
  const [movementTypeMenuOpen, setMovementTypeMenuOpen] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const movementsRequestSeqRef = useRef(0)
  const movementsAbortRef = useRef<AbortController | null>(null)
  const totalPages = Math.max(1, Math.ceil(totalMovements / PAGE_SIZE))
  const paginationItems = getPaginationItems(currentPage, totalPages)
  const selectedBranchLabel =
    branchFilter === ''
      ? 'كل الفروع'
      : branches.find((branch) => branch.id === branchFilter)?.name ||
        'غير مرتبط بفرع'
  const selectedMovementTypeLabel =
    movementTypeFilter === ''
      ? 'كل الحركات'
      : getMovementTypeLabel(movementTypeFilter)

  const loadBranches = useCallback(async () => {
    try {
      setLoadingBranches(true)

      const response = await fetch('/api/admin/branches', {
        method: 'GET',
        cache: 'no-store',
      })
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        throw new Error(getClientErrorMessage(result, 'تعذر تحميل الفروع حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
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
      movementsAbortRef.current?.abort()
      setMovements([])
      setTotalMovements(0)
      return
    }

    const requestSeq = movementsRequestSeqRef.current + 1
    movementsRequestSeqRef.current = requestSeq
    movementsAbortRef.current?.abort()
    const controller = new AbortController()
    movementsAbortRef.current = controller

    try {
      setLoadingMovements(true)
      setErrorMessage('')

      const normalizedDateFrom = normalizeDateFilterValue(dateFrom)
      const normalizedDateTo = normalizeDateFilterValue(dateTo)
      const normalizedSearch = search.trim()
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(PAGE_SIZE),
      })
      if (branchFilter) params.set('branchId', branchFilter)
      if (movementTypeFilter) params.set('movementType', movementTypeFilter)
      if (normalizedDateFrom) params.set('dateFrom', normalizedDateFrom)
      if (normalizedDateTo) params.set('dateTo', normalizedDateTo)
      if (normalizedSearch) params.set('search', normalizedSearch)

      const response = await fetch(`/api/admin/inventory-movements?${params}`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      })
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'تعذر تحميل حركات المخزون')
      }

      if (movementsRequestSeqRef.current !== requestSeq) return

      const baseMovements = Array.isArray(result.rows)
        ? result.rows.map((row: Record<string, unknown>) => normalizeMovementRow(row))
        : []
      const nextTotalMovements = Number(result.total) || 0
      const nextTotalPages = Math.max(
        1,
        Math.ceil(nextTotalMovements / PAGE_SIZE)
      )

      if (currentPage > nextTotalPages) {
        setCurrentPage(nextTotalPages)
        return
      }

      setTotalMovements(nextTotalMovements)
      setMovements(baseMovements)
    } catch (error) {
      if (movementsRequestSeqRef.current !== requestSeq) return
      if (error instanceof Error && error.name === 'AbortError') return
      setMovements([])
      setTotalMovements(0)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر تحميل حركات المخزون'
      )
    } finally {
      if (movementsRequestSeqRef.current === requestSeq) {
        setLoadingMovements(false)
      }
      if (movementsAbortRef.current === controller) {
        movementsAbortRef.current = null
      }
    }
  }, [
    branchFilter,
    currentPage,
    dateFrom,
    dateTo,
    movementTypeFilter,
    search,
    tenantId,
  ])

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

      return () => {
        window.clearTimeout(timeoutId)
        movementsAbortRef.current?.abort()
      }
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
                حركات المخزون
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
        <AdminAlert tone="error">{errorMessage}</AdminAlert>
      ) : null}

      <section className="overflow-visible rounded-[1.75rem] border border-white/10 bg-[#07111f]/90 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
        <div data-mobile-movements-search className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-white/10 px-4 py-4 md:hidden">
          <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setCurrentPage(1) }} placeholder="اسم العنصر" className="h-12 min-w-0 rounded-2xl border border-white/10 bg-[#0a1424] px-4 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/40" />
          <button type="button" onClick={() => setMobileFiltersOpen(true)} className="h-12 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-xs font-black text-cyan-100" aria-haspopup="dialog">الفلاتر</button>
        </div>
        <div data-responsive-filters className="hidden gap-3 border-b border-white/10 px-5 py-5 md:grid md:grid-cols-2 md:px-7 xl:grid-cols-5">
          <label className="relative block">
            <span className="mb-2 block text-xs font-black text-slate-400">
              الفرع
            </span>
            <button
              type="button"
              onClick={() => {
                setBranchMenuOpen((open) => !open)
                setMovementTypeMenuOpen(false)
              }}
              disabled={loadingBranches}
              className="flex h-12 w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0a1424] px-4 text-right text-sm font-bold text-white outline-none transition hover:border-cyan-300/25 hover:bg-white/[0.04] focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="min-w-0 truncate">
                {loadingBranches ? 'جارٍ تحميل الفروع...' : selectedBranchLabel}
              </span>
              <ChevronIcon open={branchMenuOpen} />
            </button>

            {branchMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 max-h-72 w-full overflow-y-auto rounded-2xl border border-cyan-300/20 bg-[#07111d]/95 p-1 text-right shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                <button
                  type="button"
                  onClick={() => {
                    setBranchFilter('')
                    setCurrentPage(1)
                    setBranchMenuOpen(false)
                  }}
                  className={`flex h-11 w-full items-center rounded-xl px-3 text-sm font-bold transition ${
                    branchFilter === ''
                      ? 'bg-cyan-300/15 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.12)]'
                      : 'text-slate-300 hover:bg-cyan-300/10 hover:text-cyan-100'
                  }`}
                >
                  كل الفروع
                </button>
                {branches.map((branch) => (
                  <button
                    key={branch.id}
                    type="button"
                    onClick={() => {
                      setBranchFilter(branch.id)
                      setCurrentPage(1)
                      setBranchMenuOpen(false)
                    }}
                    className={`mt-1 flex h-11 w-full items-center rounded-xl px-3 text-sm font-bold transition ${
                      branchFilter === branch.id
                        ? 'bg-cyan-300/15 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.12)]'
                        : 'text-slate-300 hover:bg-cyan-300/10 hover:text-cyan-100'
                    }`}
                  >
                    <span className="min-w-0 truncate">{branch.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </label>

          <label className="relative block">
            <span className="mb-2 block text-xs font-black text-slate-400">
              نوع الحركة
            </span>
            <button
              type="button"
              onClick={() => {
                setMovementTypeMenuOpen((open) => !open)
                setBranchMenuOpen(false)
              }}
              className="flex h-12 w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0a1424] px-4 text-right text-sm font-bold text-white outline-none transition hover:border-cyan-300/25 hover:bg-white/[0.04] focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/10"
            >
              <span className="min-w-0 truncate">{selectedMovementTypeLabel}</span>
              <ChevronIcon open={movementTypeMenuOpen} />
            </button>

            {movementTypeMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 max-h-72 w-full overflow-y-auto rounded-2xl border border-cyan-300/20 bg-[#07111d]/95 p-1 text-right shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                <button
                  type="button"
                  onClick={() => {
                    setMovementTypeFilter('')
                    setCurrentPage(1)
                    setMovementTypeMenuOpen(false)
                  }}
                  className={`flex h-11 w-full items-center rounded-xl px-3 text-sm font-bold transition ${
                    movementTypeFilter === ''
                      ? 'bg-cyan-300/15 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.12)]'
                      : 'text-slate-300 hover:bg-cyan-300/10 hover:text-cyan-100'
                  }`}
                >
                  كل الحركات
                </button>
                {MOVEMENT_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setMovementTypeFilter(option.value)
                      setCurrentPage(1)
                      setMovementTypeMenuOpen(false)
                    }}
                    className={`mt-1 flex h-11 w-full items-center rounded-xl px-3 text-sm font-bold transition ${
                      movementTypeFilter === option.value
                        ? 'bg-cyan-300/15 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.12)]'
                        : 'text-slate-300 hover:bg-cyan-300/10 hover:text-cyan-100'
                    }`}
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-black text-slate-400">
              من تاريخ
            </span>
            <AdminDarkDateInput
              value={dateFrom}
              onChange={(value) => {
                setDateFrom(value)
                setCurrentPage(1)
              }}
              allowClear
              placeholder="YYYY-MM-DD"
              ariaLabel="من تاريخ"
              triggerClassName="!border-white/10 !bg-[#0a1424] !text-white hover:!border-cyan-300/25 hover:!bg-white/[0.04] focus:!border-cyan-300/40 focus:!ring-cyan-300/10"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-black text-slate-400">
              إلى تاريخ
            </span>
            <AdminDarkDateInput
              value={dateTo}
              onChange={(value) => {
                setDateTo(value)
                setCurrentPage(1)
              }}
              allowClear
              placeholder="YYYY-MM-DD"
              ariaLabel="إلى تاريخ"
              triggerClassName="!border-white/10 !bg-[#0a1424] !text-white hover:!border-cyan-300/25 hover:!bg-white/[0.04] focus:!border-cyan-300/40 focus:!ring-cyan-300/10"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-black text-slate-400">
              بحث
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setCurrentPage(1)
              }}
              placeholder="اسم العنصر"
              className="h-12 w-full rounded-2xl border border-white/10 bg-[#0a1424] px-4 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/10"
            />
          </label>
        </div>

        <MobileFilterSheet
          open={mobileFiltersOpen}
          onClose={() => setMobileFiltersOpen(false)}
          title="فلاتر حركات المخزون"
          footer={<div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => { setBranchFilter(''); setMovementTypeFilter(''); setDateFrom(''); setDateTo(''); setCurrentPage(1) }} className="min-h-11 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-black text-slate-200">مسح الفلاتر</button><button type="button" onClick={() => setMobileFiltersOpen(false)} className="min-h-11 rounded-xl bg-cyan-300 text-xs font-black text-slate-950">عرض النتائج</button></div>}
        >
          <div className="space-y-4">
            <AdminDarkSelect value={branchFilter} onChange={(value) => { setBranchFilter(value); setCurrentPage(1) }} options={[{ value: '', label: 'كل الفروع' }, ...branches.map((branch) => ({ value: branch.id, label: branch.name }))]} ariaLabel="فلتر الفرع" triggerClassName="h-12 w-full rounded-2xl border-white/10 bg-[#0a1424]" />
            <AdminDarkSelect value={movementTypeFilter} onChange={(value) => { setMovementTypeFilter(value); setCurrentPage(1) }} options={[{ value: '', label: 'كل الحركات' }, ...MOVEMENT_TYPE_OPTIONS]} ariaLabel="فلتر نوع الحركة" triggerClassName="h-12 w-full rounded-2xl border-white/10 bg-[#0a1424]" />
            <label className="block"><span className="mb-2 block text-xs font-black text-slate-400">من تاريخ</span><AdminDarkDateInput value={dateFrom} onChange={(value) => { setDateFrom(value); setCurrentPage(1) }} allowClear placeholder="YYYY-MM-DD" ariaLabel="من تاريخ" /></label>
            <label className="block"><span className="mb-2 block text-xs font-black text-slate-400">إلى تاريخ</span><AdminDarkDateInput value={dateTo} onChange={(value) => { setDateTo(value); setCurrentPage(1) }} allowClear placeholder="YYYY-MM-DD" ariaLabel="إلى تاريخ" /></label>
          </div>
        </MobileFilterSheet>

        <div className="overflow-x-auto px-5 py-5 md:px-7">
          <table data-responsive-table="movements" className="responsive-admin-table w-full min-w-[900px] border-separate border-spacing-y-2 text-right">
            <thead className="bg-[#091424]">
              <tr className="text-xs font-black text-slate-300">
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
              ) : movements.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="rounded-2xl border border-white/10 bg-white/[0.035] px-5 py-10 text-center text-sm font-bold text-slate-400"
                  >
                    لا توجد حركات مخزون مطابقة للفلاتر الحالية.
                  </td>
                </tr>
              ) : (
                movements.map((movement) => {
                  const actorDisplay = getActorDisplay(movement)
                  const actorRoleLabel = getActorRoleLabel(
                    movement,
                    actorDisplay.actorType
                  )

                  return (
                  <tr
                    key={movement.id}
                    className="bg-slate-500/[0.045] transition hover:bg-cyan-300/[0.055]"
                  >
                    <td className="rounded-r-2xl border-y border-r border-white/[0.08] px-3 py-4 text-sm font-bold text-slate-300 max-md:!block max-md:!border max-md:!border-white/[0.08] max-md:!p-0 max-md:before:!hidden">
                      <span className="hidden md:inline">{formatDate(movement.created_at)}</span>
                      <article data-mobile-movement-entry className="relative min-w-0 p-4 pr-8 md:hidden">
                        <span className="absolute right-3 top-5 size-3 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.55)]" />
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-black text-white">{movement.item_name || '-'}</h3>
                            <p className="mt-1 truncate text-xs font-bold text-slate-400">{movement.branch_name || '-'}</p>
                          </div>
                          <span dir="ltr" className={`shrink-0 font-mono text-base font-black tabular-nums ${movement.quantity_delta < 0 ? 'text-red-200' : 'text-emerald-200'}`}>{movement.quantity_delta > 0 ? '+' : ''}{formatNumber(movement.quantity_delta)}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black ${getMovementTone(movement.movement_type)}`}>{getMovementTypeLabel(movement.movement_type)}</span>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-black text-slate-300">{actorDisplay.name} · {actorRoleLabel}</span>
                        </div>
                        <p className="mt-3 break-words text-xs leading-5 text-slate-400">{getMovementNote(movement)}</p>
                        <time className="mt-3 block text-[11px] font-bold text-slate-500">{formatDate(movement.created_at)}</time>
                      </article>
                    </td>
                    <td className="border-y border-white/[0.08] px-3 py-4 text-sm font-black text-white max-md:!hidden">
                      {movement.item_name || '-'}
                    </td>
                    <td className="border-y border-white/[0.08] px-3 py-4 text-sm font-bold text-slate-300 max-md:!hidden">
                      {movement.branch_name || '-'}
                    </td>
                    <td className="border-y border-white/[0.08] px-3 py-4 max-md:!hidden">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getMovementTone(
                          movement.movement_type
                        )}`}
                      >
                        {getMovementTypeLabel(movement.movement_type)}
                      </span>
                    </td>
                    <td
                      className={`border-y border-white/[0.08] px-3 py-4 text-sm font-black max-md:!hidden ${
                        movement.quantity_delta < 0
                          ? 'text-red-100'
                          : 'text-emerald-100'
                      }`}
                    >
                      <span dir="ltr" className="font-mono tabular-nums">
                        {movement.quantity_delta > 0 ? '+' : ''}
                        {formatNumber(movement.quantity_delta)}
                      </span>
                    </td>
                    <td className="border-y border-white/[0.08] px-3 py-4 max-md:!hidden">
                      <div className="flex min-h-16 items-center gap-3">
                        <span
                          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-sm font-black leading-none tracking-normal ${getActorAvatarTone(
                            actorDisplay.name,
                            actorDisplay.actorType
                          )}`}
                          aria-hidden="true"
                        >
                          <span dir="ltr">{getActorInitials(actorDisplay.name)}</span>
                        </span>
                        <div className="flex min-w-0 flex-col justify-center gap-1.5">
                          <span className="max-w-[12rem] truncate text-base font-black leading-6 text-slate-50 drop-shadow-[0_0_12px_rgba(226,232,240,0.18)]">
                            {actorDisplay.name}
                          </span>
                          <span
                            className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-[11px] font-black leading-none ${getActorTypeTone(
                              actorDisplay.actorType
                            )}`}
                          >
                            {actorRoleLabel}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="rounded-l-2xl border-y border-l border-white/[0.08] px-3 py-4 text-sm font-bold text-slate-400 max-md:!hidden">
                      {getMovementNote(movement)}
                    </td>
                  </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div data-responsive-pagination className="flex flex-col gap-3 border-t border-white/10 px-5 py-4 text-sm font-black text-slate-300 md:flex-row md:items-center md:justify-between md:px-7">
          <div
            dir="ltr"
            className="flex flex-wrap items-center justify-center gap-2 md:justify-start"
          >
            <button
              type="button"
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              disabled={loadingMovements || currentPage >= totalPages}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-black text-slate-200 transition hover:border-cyan-300/25 hover:bg-cyan-300/10 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              التالي
            </button>
            <div className="flex flex-row-reverse items-center gap-1" dir="ltr">
              {paginationItems.map((item) =>
                typeof item === 'number' ? (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCurrentPage(item)}
                    disabled={loadingMovements || item === currentPage}
                    className={`flex h-9 min-w-9 items-center justify-center rounded-2xl border px-3 text-sm font-black transition ${
                      item === currentPage
                        ? 'border-cyan-300/35 bg-cyan-300/15 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.14)]'
                        : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-cyan-300/25 hover:bg-cyan-300/10 hover:text-cyan-100'
                    } disabled:cursor-not-allowed disabled:opacity-90`}
                    aria-current={item === currentPage ? 'page' : undefined}
                  >
                    {formatNumber(item)}
                  </button>
                ) : (
                  <span
                    key={item}
                    className="flex h-9 min-w-9 items-center justify-center rounded-2xl border border-white/5 bg-white/[0.025] px-3 text-sm font-black text-slate-500"
                  >
                    ...
                  </span>
                )
              )}
            </div>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={loadingMovements || currentPage <= 1}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-black text-slate-200 transition hover:border-cyan-300/25 hover:bg-cyan-300/10 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              السابق
            </button>
          </div>
          <div className="text-center text-xs font-black text-slate-400 md:text-left">
            الصفحة{' '}
            <span className="text-cyan-100">{formatNumber(currentPage)}</span>
            {' '}من{' '}
            <span className="text-cyan-100">{formatNumber(totalPages)}</span>
          </div>
        </div>
      </section>
    </div>
  )
}

'use client'

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useAuthState } from '@/components/auth-state-provider'
import { usePageAccess } from '@/hooks/use-page-access'
import { type AdminBranchRecord } from '@/lib/admin/branches'
import {
  ADMIN_BRANCH_FILTER_ALL,
  getStoredAdminBranchFilter,
  setStoredAdminBranchFilter,
} from '@/lib/admin/branch-filter'
import { clearBranchInvoiceCatalogCache } from '@/lib/invoices/catalog'
import { supabase } from '@/lib/supabase/client'

type InventoryRow = {
  branch_id: string
  branch_name: string
  catalog_item_id: string
  item_name: string
  item_type: 'product' | 'service' | string
  category_id: string | null
  quantity_on_hand: number
  low_stock_threshold: number
  is_low_stock: boolean
}

type DrawerMode = 'adjust' | 'threshold'

type AdjustFormState = {
  quantityDelta: string
  movementType: 'purchase_receive' | 'manual_adjustment'
  notes: string
}

type ThresholdFormState = {
  lowStockThreshold: string
}

const emptyAdjustForm: AdjustFormState = {
  quantityDelta: '',
  movementType: 'purchase_receive',
  notes: '',
}

const emptyThresholdForm: ThresholdFormState = {
  lowStockThreshold: '',
}

const movementTypeOptions: Array<{
  value: AdjustFormState['movementType']
  label: string
}> = [
  { value: 'purchase_receive', label: 'استلام بضاعة' },
  { value: 'manual_adjustment', label: 'تصحيح مخزون' },
]

function getInitialInventoryBranchId() {
  const storedBranchId = getStoredAdminBranchFilter()

  return storedBranchId || ADMIN_BRANCH_FILTER_ALL
}

function InventoryIcon({ className = '' }: { className?: string }) {
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
      <path d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z" />
      <path d="M4 12l8 4.5 8-4.5" />
      <path d="M4 16.5 12 21l8-4.5" />
    </svg>
  )
}

function InventoryEmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-dashed border-cyan-300/20 bg-black/20 px-4 py-12 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
        <InventoryIcon className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-lg font-black text-white">{title}</h3>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </div>
  )
}

function InventoryFieldLabel({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black text-slate-300">
        {label}
      </span>
      {children}
    </label>
  )
}

function DrawerActions({
  saving,
  onCancel,
}: {
  saving: boolean
  onCancel: () => void
}) {
  return (
    <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] px-5 text-sm font-black text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
      >
        إلغاء
      </button>
      <button
        type="submit"
        disabled={saving}
        className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 text-sm font-black text-slate-950 shadow-[0_0_35px_rgba(34,211,238,0.22)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
      </button>
    </div>
  )
}

function CloseIcon({ className = '' }: { className?: string }) {
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
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </svg>
  )
}

function StockNumber({
  value,
  className = '',
}: {
  value: number | null | undefined
  className?: string
}) {
  const numericValue = Number(value ?? 0)
  const formattedValue = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numericValue) ? numericValue : 0)

  return (
    <span
      dir="ltr"
      lang="en"
      className={`inline-block font-mono tabular-nums ${className}`}
    >
      {formattedValue}
    </span>
  )
}

function normalizeInventoryRow(
  row: Partial<InventoryRow>,
  branch: Pick<AdminBranchRecord, 'id' | 'name'>
) {
  return {
    branch_id: branch.id,
    branch_name: branch.name,
    catalog_item_id: String(row.catalog_item_id || ''),
    item_name: String(row.item_name || ''),
    item_type: row.item_type || 'product',
    category_id: row.category_id || null,
    quantity_on_hand: Number(row.quantity_on_hand) || 0,
    low_stock_threshold: Number(row.low_stock_threshold) || 0,
    is_low_stock: Boolean(row.is_low_stock),
  } satisfies InventoryRow
}

function getStockStatus(
  row: Pick<InventoryRow, 'quantity_on_hand' | 'low_stock_threshold'>
) {
  if (row.quantity_on_hand <= 0) {
    return {
      label: 'نفد',
      tone: 'border-rose-300/25 bg-rose-500/10 text-rose-100',
      cardTone: 'border-rose-300/18 bg-rose-500/[0.08]',
    }
  }

  if (
    row.low_stock_threshold > 0 &&
    row.quantity_on_hand <= row.low_stock_threshold
  ) {
    return {
      label: 'منخفض',
      tone: 'border-amber-300/25 bg-amber-400/10 text-amber-100',
      cardTone: 'border-amber-300/20 bg-amber-400/[0.08]',
    }
  }

  return {
    label: 'متوفر',
    tone: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100',
    cardTone: 'border-emerald-300/20 bg-emerald-400/[0.08]',
  }
}

function getItemTypeLabel(value: string) {
  return value === 'service' ? 'خدمة' : 'منتج'
}

export default function AdminInventoryPage() {
  const authState = useAuthState()
  const access = usePageAccess(['admin'])
  const { loading: accessLoading, allowed, tenantId } = access

  const [branches, setBranches] = useState<AdminBranchRecord[]>([])
  const [selectedBranchId, setSelectedBranchIdState] = useState(
    getInitialInventoryBranchId
  )
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [loadingInventory, setLoadingInventory] = useState(false)
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [drawerMode, setDrawerMode] = useState<DrawerMode | null>(null)
  const [selectedItem, setSelectedItem] = useState<InventoryRow | null>(null)
  const [branchMenuOpen, setBranchMenuOpen] = useState(false)
  const [movementMenuOpen, setMovementMenuOpen] = useState(false)
  const [adjustForm, setAdjustForm] = useState<AdjustFormState>(emptyAdjustForm)
  const [thresholdForm, setThresholdForm] =
    useState<ThresholdFormState>(emptyThresholdForm)

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) || null,
    [branches, selectedBranchId]
  )
  const isAllBranchesSelected = selectedBranchId === ADMIN_BRANCH_FILTER_ALL
  const selectedBranchLabel = isAllBranchesSelected
    ? 'كل الفروع'
    : selectedBranch?.name || 'اختر فرعًا لعرض المخزون'
  const lowStockRows = useMemo(
    () =>
      inventoryRows.filter(
        (row) =>
          row.quantity_on_hand <= 0 ||
          (row.low_stock_threshold > 0 &&
            row.quantity_on_hand <= row.low_stock_threshold)
      ),
    [inventoryRows]
  )
  const lowStockCount = lowStockRows.length
  const drawerOpen = Boolean(drawerMode && selectedItem)

  const setSelectedBranchId = useCallback((value: string) => {
    const nextValue = value || ADMIN_BRANCH_FILTER_ALL
    setSelectedBranchIdState(nextValue)
    setStoredAdminBranchFilter(nextValue)
    setBranchMenuOpen(false)
  }, [])

  const loadBranches = useCallback(async () => {
    try {
      setLoadingBranches(true)
      setErrorMessage('')

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
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر تحميل الفروع'
      )
      setBranches([])
    } finally {
      setLoadingBranches(false)
    }
  }, [])

  useEffect(() => {
    if (
      !selectedBranchId ||
      selectedBranchId === ADMIN_BRANCH_FILTER_ALL ||
      branches.length === 0
    ) {
      return
    }

    if (!branches.some((branch) => branch.id === selectedBranchId)) {
      queueMicrotask(() => setSelectedBranchId(ADMIN_BRANCH_FILTER_ALL))
    }
  }, [branches, selectedBranchId, setSelectedBranchId])

  const loadInventory = useCallback(async (branchId: string) => {
    if (!tenantId || !branchId) {
      setInventoryRows([])
      return
    }

    try {
      setLoadingInventory(true)
      setErrorMessage('')
      setInventoryRows([])

      const targetBranches =
        branchId === ADMIN_BRANCH_FILTER_ALL
          ? branches
          : branches.filter((branch) => branch.id === branchId)

      if (targetBranches.length === 0) {
        setInventoryRows([])
        return
      }

      const inventoryResponses = await Promise.all(
        targetBranches.map(async (branch) => {
          const { data, error } = await supabase.rpc('get_branch_inventory', {
            p_tenant_id: tenantId,
            p_branch_id: branch.id,
          })

          if (error) {
            throw new Error(error.message || 'تعذر تحميل المخزون')
          }

          return {
            branch,
            rows: Array.isArray(data)
              ? data.map((row) =>
                  normalizeInventoryRow(row as Partial<InventoryRow>, branch)
                )
              : [],
          }
        })
      )

      const nextRows = inventoryResponses.flatMap((response) => response.rows)

      setInventoryRows(nextRows)
    } catch (error) {
      setInventoryRows([])
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر تحميل المخزون'
      )
    } finally {
      setLoadingInventory(false)
    }
  }, [branches, tenantId])

  useEffect(() => {
    if (!accessLoading && allowed) {
      const timeoutId = window.setTimeout(() => {
        void loadBranches()
      }, 0)

      return () => window.clearTimeout(timeoutId)
    }
  }, [accessLoading, allowed, loadBranches])

  useEffect(() => {
    if (!allowed || !tenantId || !selectedBranchId) {
      const timeoutId = window.setTimeout(() => {
        setInventoryRows([])
      }, 0)

      return () => window.clearTimeout(timeoutId)
    }

    const timeoutId = window.setTimeout(() => {
      void loadInventory(selectedBranchId)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [allowed, loadInventory, selectedBranchId, tenantId])

  function openAdjustDrawer(item: InventoryRow) {
    setSelectedItem(item)
    setAdjustForm(emptyAdjustForm)
    setMovementMenuOpen(false)
    setSuccessMessage('')
    setErrorMessage('')
    setDrawerMode('adjust')
  }

  function openThresholdDrawer(item: InventoryRow) {
    setSelectedItem(item)
    setThresholdForm({
      lowStockThreshold: String(item.low_stock_threshold || 0),
    })
    setSuccessMessage('')
    setErrorMessage('')
    setDrawerMode('threshold')
  }

  function closeDrawer() {
    if (saving) return
    setDrawerMode(null)
    setSelectedItem(null)
    setAdjustForm(emptyAdjustForm)
    setThresholdForm(emptyThresholdForm)
    setMovementMenuOpen(false)
  }

  function changeQuantityDelta(delta: number) {
    setAdjustForm((prev) => {
      const currentValue = Number(prev.quantityDelta || 0)
      const nextValue = Number.isFinite(currentValue) ? currentValue + delta : delta

      return {
        ...prev,
        quantityDelta: String(nextValue),
      }
    })
  }

  async function handleAdjustSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!tenantId || !selectedItem || !selectedItem.branch_id) {
      setErrorMessage('اختر فرعًا وعنصرًا صالحين قبل التعديل')
      return
    }

    const createdBy = authState.profile?.id || null

    if (!createdBy) {
      setErrorMessage('تعذر تحديد المستخدم الحالي')
      return
    }

    const quantityDelta = Number(adjustForm.quantityDelta)

    if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
      setErrorMessage('اكتب كمية تعديل صالحة')
      return
    }

    try {
      setSaving(true)
      setErrorMessage('')
      setSuccessMessage('')

      const { error } = await supabase.rpc('adjust_inventory_stock', {
        p_tenant_id: tenantId,
        p_branch_id: selectedItem.branch_id,
        p_catalog_item_id: selectedItem.catalog_item_id,
        p_quantity_delta: quantityDelta,
        p_movement_type: adjustForm.movementType,
        p_notes: adjustForm.notes.trim() || null,
        p_created_by: createdBy,
      })

      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[Inventory] adjust_inventory_stock failed', {
            message: error?.message,
            code: error?.code,
            details: error?.details,
            hint: error?.hint,
            error,
          })
        }

        throw new Error('تعذر تعديل كمية المخزون')
      }

      setSuccessMessage('تم تحديث كمية المخزون بنجاح')
      clearBranchInvoiceCatalogCache(selectedItem.branch_id)
      closeDrawer()
      await loadInventory(selectedBranchId)
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Inventory] adjust submit failed', error)
      }

      setErrorMessage('تعذر تعديل كمية المخزون')
    } finally {
      setSaving(false)
    }
  }

  async function handleThresholdSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!tenantId || !selectedItem || !selectedItem.branch_id) {
      setErrorMessage('اختر فرعًا وعنصرًا صالحين قبل التعديل')
      return
    }

    const lowStockThreshold = Number(thresholdForm.lowStockThreshold)

    if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
      setErrorMessage('حد التنبيه يجب أن يكون رقمًا موجبًا أو صفرًا')
      return
    }

    try {
      setSaving(true)
      setErrorMessage('')
      setSuccessMessage('')

      const { error } = await supabase.rpc(
        'update_inventory_low_stock_threshold',
        {
          p_tenant_id: tenantId,
          p_branch_id: selectedItem.branch_id,
          p_catalog_item_id: selectedItem.catalog_item_id,
          p_low_stock_threshold: lowStockThreshold,
        }
      )

      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error(
            '[Inventory] update_inventory_low_stock_threshold failed',
            error
          )
        }

        throw new Error('تعذر تحديث حد التنبيه')
      }

      setSuccessMessage('تم تحديث حد التنبيه بنجاح')
      clearBranchInvoiceCatalogCache(selectedItem.branch_id)
      closeDrawer()
      await loadInventory(selectedBranchId)
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Inventory] threshold submit failed', error)
      }

      setErrorMessage('تعذر تحديث حد التنبيه')
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

  if (!allowed) {
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
                <InventoryIcon className="h-7 w-7" />
              </div>
              <div>
                <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black tracking-[0.2em] text-cyan-200">
                  AFEX INVENTORY
                </span>
                <h1 className="mt-3 text-3xl font-black text-white md:text-4xl">
                  إدارة المخزون
                </h1>
                <p className="mt-2 text-sm font-medium text-slate-400">
                  إدارة كميات العناصر حسب الفروع
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-slate-300">
              {selectedBranchLabel}
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
                Inventory List
              </span>
              <h2 className="mt-2 text-2xl font-black text-white">مخزون الفرع</h2>
              <p className="mt-1 text-sm text-slate-400">
                قائمة عناصر الكتالوج وكمياتها داخل الفرع المحدد.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadInventory(selectedBranchId)}
              disabled={
                !selectedBranchId ||
                loadingInventory ||
                (isAllBranchesSelected && branches.length === 0)
              }
              className="inline-flex h-11 w-fit items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              تحديث
            </button>
          </div>

          <div className="mb-5 rounded-2xl border border-cyan-300/10 bg-[#07111d]/80 p-3 shadow-[0_0_40px_rgba(0,255,255,0.05)]">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-center">
              <div className="relative">
                <span className="mb-2 block text-xs font-black text-slate-300">
                  الفرع
                </span>
                <button
                  type="button"
                  onClick={() => setBranchMenuOpen((open) => !open)}
                  disabled={loadingBranches}
                  className="flex h-12 w-full items-center justify-between gap-3 rounded-2xl border border-cyan-300/15 bg-white/[0.045] px-4 text-right text-sm font-bold text-white outline-none transition hover:border-cyan-300/30 hover:bg-white/[0.06] focus:border-cyan-300/55 focus:bg-white/[0.07] focus:ring-2 focus:ring-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="min-w-0 truncate">
                    {loadingBranches ? 'جارٍ تحميل الفروع...' : selectedBranchLabel}
                  </span>
                  <span
                    className={`text-cyan-200 transition ${
                      branchMenuOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  >
                    ˅
                  </span>
                </button>

                {branchMenuOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-full overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#07111d]/95 p-1 text-right shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                    <button
                      type="button"
                      onClick={() => setSelectedBranchId(ADMIN_BRANCH_FILTER_ALL)}
                      className={`flex h-11 w-full items-center justify-between rounded-xl px-3 text-sm font-bold transition ${
                        isAllBranchesSelected
                          ? 'bg-cyan-300/15 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.12)]'
                          : 'text-slate-300 hover:bg-cyan-300/10 hover:text-cyan-100'
                      }`}
                    >
                      كل الفروع
                    </button>
                    {branches.map((branch) => {
                      const active = selectedBranchId === branch.id

                      return (
                        <button
                          key={branch.id}
                          type="button"
                          onClick={() => setSelectedBranchId(branch.id)}
                          className={`mt-1 flex h-11 w-full items-center justify-between rounded-xl px-3 text-sm font-bold transition ${
                            active
                              ? 'bg-cyan-300/15 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.12)]'
                              : 'text-slate-300 hover:bg-cyan-300/10 hover:text-cyan-100'
                          }`}
                        >
                          <span className="min-w-0 truncate">{branch.name}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 self-end text-xs font-black">
                <span className="inline-flex h-11 items-center gap-2 rounded-2xl border border-cyan-300/45 bg-cyan-300/15 px-4 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.16)]">
                  <span>العناصر</span>
                  <span className="rounded-full bg-cyan-300/20 px-2 py-0.5 text-cyan-100">
                    {inventoryRows.length.toLocaleString('ar-SA')}
                  </span>
                </span>
                <span className="inline-flex h-11 items-center gap-2 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 text-red-100">
                  <span>منخفض</span>
                  <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-red-100">
                    {lowStockCount.toLocaleString('ar-SA')}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {!selectedBranchId ? (
            <InventoryEmptyState
              title="اختر فرعًا لعرض المخزون"
              description="يتم عرض كميات المخزون حسب الفرع المحدد فقط."
            />
          ) : loadingInventory ? (
            <div className="rounded-2xl border border-dashed border-cyan-300/15 bg-black/20 px-4 py-10 text-center text-sm font-bold text-slate-400">
              جارٍ تحميل المخزون...
            </div>
          ) : inventoryRows.length === 0 ? (
            <InventoryEmptyState
              title="لا توجد عناصر مخزون حتى الآن."
              description="لا توجد عناصر مفعلة لتتبع المخزون داخل هذا الفرع."
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#06111f]/65">
              <table className="w-full table-fixed text-right">
                <colgroup>
                  <col className="w-[24%]" />
                  <col className="w-[12%]" />
                  <col className="w-[15%]" />
                  <col className="w-[15%]" />
                  <col className="w-[12%]" />
                  <col className="w-[22%]" />
                </colgroup>
                <thead className="bg-[#091424]">
                  <tr className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    <th className="px-3 py-4">العنصر</th>
                    <th className="px-3 py-4">النوع</th>
                    <th className="px-3 py-4">الكمية الحالية</th>
                    <th className="px-3 py-4">حد التنبيه</th>
                    <th className="px-3 py-4">الحالة</th>
                    <th className="px-3 py-4">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryRows.map((row) => {
                    const stockStatus = getStockStatus(row)

                    return (
                      <tr
                        key={`${row.branch_id}-${row.catalog_item_id}`}
                        className="border-b border-white/[0.08] transition hover:bg-cyan-300/[0.035] last:border-b-0"
                      >
                        <td className="px-3 py-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
                              <InventoryIcon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-black text-white">
                                {row.item_name || 'بدون اسم'}
                              </span>
                              <span className="mt-1 inline-flex max-w-full rounded-full border border-cyan-300/15 bg-cyan-300/10 px-2 py-0.5 text-[11px] font-bold text-cyan-100">
                                <span className="truncate">{row.branch_name}</span>
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          <span className="text-sm font-black text-slate-200">
                            {getItemTypeLabel(row.item_type)}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <StockNumber
                            value={row.quantity_on_hand}
                            className="text-sm font-black text-slate-100"
                          />
                        </td>
                        <td className="px-3 py-4">
                          <StockNumber
                            value={row.low_stock_threshold}
                            className="text-sm font-black text-slate-200"
                          />
                        </td>
                        <td className="px-3 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${stockStatus.tone}`}
                          >
                            {stockStatus.label}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openAdjustDrawer(row)}
                              className="inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/15"
                            >
                              تعديل الكمية
                            </button>
                            <button
                              type="button"
                              onClick={() => openThresholdDrawer(row)}
                              className="inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] px-2 text-xs font-black text-slate-200 transition hover:border-cyan-300/25 hover:bg-cyan-300/10 hover:text-cyan-100"
                            >
                              حد التنبيه
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

        <section className="rounded-[28px] border border-cyan-300/15 bg-white/[0.055] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-6">
          <div className="mb-5 flex flex-col gap-2 text-right">
            <span className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200/80">
              Low Stock
            </span>
            <h2 className="text-2xl font-black text-white">
              العناصر منخفضة المخزون
            </h2>
            <p className="text-sm text-slate-400">
              العناصر التي وصلت إلى حد التنبيه داخل الفرع المحدد.
            </p>
          </div>

          {!selectedBranchId ? (
            <div className="rounded-2xl border border-dashed border-cyan-300/20 bg-black/20 px-4 py-8 text-center text-sm font-bold text-slate-400">
              اختر فرعًا لعرض العناصر منخفضة المخزون
            </div>
          ) : lowStockRows.length === 0 ? (
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-6 text-sm font-black text-emerald-200">
              لا توجد عناصر منخفضة المخزون لهذا الفرع
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {lowStockRows.map((row) => {
                const stockStatus = getStockStatus(row)

                return (
                  <div
                    key={`${row.branch_id}-${row.catalog_item_id}`}
                    className={`rounded-2xl border p-4 ${stockStatus.cardTone}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-black text-white">
                          {row.item_name || 'بدون اسم'}
                        </h3>
                        <p className="mt-1 text-xs font-bold text-slate-400">
                          {row.branch_name || selectedBranch?.name || 'الفرع المحدد'}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-black ${stockStatus.tone}`}
                      >
                        {stockStatus.label}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-black">
                      <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                        <p className="text-[11px] text-slate-500">الكمية</p>
                        <StockNumber
                          value={row.quantity_on_hand}
                          className="mt-1 text-white"
                        />
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                        <p className="text-[11px] text-slate-500">حد التنبيه</p>
                        <StockNumber
                          value={row.low_stock_threshold}
                          className="mt-1 text-white"
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {drawerOpen && selectedItem ? (
        <div className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[2px]">
          <div className="absolute inset-y-0 right-0 flex w-full justify-end">
            <aside className="animate-[branch-drawer-in_420ms_cubic-bezier(0.16,1,0.3,1)] h-full w-full max-w-xl overflow-y-auto border-l border-cyan-300/15 bg-[#07111d] p-5 text-right shadow-[0_24px_90px_rgba(0,0,0,0.45)] sm:p-6">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black tracking-[0.18em] text-cyan-200">
                    {drawerMode === 'adjust' ? 'ADJUST STOCK' : 'STOCK ALERT'}
                  </span>
                  <h2 className="mt-3 text-2xl font-black text-white">
                    {drawerMode === 'adjust' ? 'تعديل الكمية' : 'تعديل حد التنبيه'}
                  </h2>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-400">
                    {selectedItem.item_name}
                  </p>
                  <p className="mt-1 text-xs font-bold text-cyan-100/80">
                    {selectedItem.branch_name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeDrawer}
                  disabled={saving}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] text-slate-300 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="إغلاق"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>

              {drawerMode === 'adjust' ? (
                <form onSubmit={handleAdjustSubmit} className="space-y-4">
                  <div>
                    <span className="mb-2 block text-xs font-black text-slate-300">
                      كمية التعديل
                    </span>
                    <div className="rounded-2xl border border-cyan-300/15 bg-white/[0.045] px-4 py-3 shadow-[0_14px_44px_rgba(0,0,0,0.2),0_0_24px_rgba(34,211,238,0.05)] transition hover:border-cyan-300/25">
                      <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3">
                        <button
                          type="button"
                          onClick={() => changeQuantityDelta(-1)}
                          disabled={saving}
                          className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] text-xl font-black text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:border-cyan-300/25 hover:bg-cyan-300/10 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="إنقاص كمية التعديل"
                        >
                          -
                        </button>

                        <div className="text-center">
                          <input
                            type="number"
                            step="0.01"
                            value={adjustForm.quantityDelta}
                            onChange={(event) =>
                              setAdjustForm((prev) => ({
                                ...prev,
                                quantityDelta: event.target.value,
                              }))
                            }
                            className="mx-auto h-11 w-full max-w-32 rounded-xl border border-transparent bg-transparent text-center text-2xl font-black text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/35 focus:bg-white/[0.035] focus:ring-2 focus:ring-cyan-300/10"
                            placeholder="0"
                            required
                          />
                          <div className="text-xs font-black text-slate-400">
                            الكمية الحالية:{' '}
                            <StockNumber
                              value={selectedItem.quantity_on_hand}
                              className="text-slate-300"
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => changeQuantityDelta(1)}
                          disabled={saving}
                          className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] text-xl font-black text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:border-cyan-300/25 hover:bg-cyan-300/10 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="زيادة كمية التعديل"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  <InventoryFieldLabel label="نوع الحركة">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setMovementMenuOpen((open) => !open)}
                        disabled={saving}
                        className="flex h-12 w-full items-center justify-between gap-3 rounded-2xl border border-cyan-300/15 bg-white/[0.045] px-4 text-right text-sm font-bold text-white outline-none transition hover:border-cyan-300/30 hover:bg-white/[0.06] focus:border-cyan-300/55 focus:bg-white/[0.07] focus:ring-2 focus:ring-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="min-w-0 truncate">
                          {
                            movementTypeOptions.find(
                              (option) => option.value === adjustForm.movementType
                            )?.label
                          }
                        </span>
                        <span
                          className={`text-cyan-200 transition ${
                            movementMenuOpen ? 'rotate-180' : ''
                          }`}
                          aria-hidden="true"
                        >
                          ˅
                        </span>
                      </button>

                      {movementMenuOpen ? (
                        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-full overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#07111d]/95 p-1 text-right shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                          {movementTypeOptions.map((option) => {
                            const active = adjustForm.movementType === option.value

                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                  setAdjustForm((prev) => ({
                                    ...prev,
                                    movementType: option.value,
                                  }))
                                  setMovementMenuOpen(false)
                                }}
                                className={`flex h-11 w-full items-center justify-between rounded-xl px-3 text-sm font-bold transition ${
                                  active
                                    ? 'bg-cyan-300/15 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.12)]'
                                    : 'text-slate-300 hover:bg-cyan-300/10 hover:text-cyan-100'
                                }`}
                              >
                                {option.label}
                              </button>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  </InventoryFieldLabel>

                  <InventoryFieldLabel label="ملاحظات">
                    <textarea
                      value={adjustForm.notes}
                      onChange={(event) =>
                        setAdjustForm((prev) => ({
                          ...prev,
                          notes: event.target.value,
                        }))
                      }
                      className="min-h-28 w-full rounded-2xl border border-cyan-300/15 bg-white/[0.045] px-4 py-3 text-right text-sm font-bold text-white outline-none transition placeholder:text-slate-500 hover:border-cyan-300/30 focus:border-cyan-300/55 focus:bg-white/[0.07] focus:ring-2 focus:ring-cyan-300/15"
                      placeholder="اختياري"
                    />
                  </InventoryFieldLabel>

                  <DrawerActions saving={saving} onCancel={closeDrawer} />
                </form>
              ) : (
                <form onSubmit={handleThresholdSubmit} className="space-y-4">
                  <InventoryFieldLabel label="حد التنبيه">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={thresholdForm.lowStockThreshold}
                      onChange={(event) =>
                        setThresholdForm({
                          lowStockThreshold: event.target.value,
                        })
                      }
                      className="h-12 w-full rounded-2xl border border-cyan-300/15 bg-white/[0.045] px-4 text-right text-sm font-bold text-white outline-none transition placeholder:text-slate-500 hover:border-cyan-300/30 focus:border-cyan-300/55 focus:bg-white/[0.07] focus:ring-2 focus:ring-cyan-300/15"
                      required
                    />
                  </InventoryFieldLabel>

                  <DrawerActions saving={saving} onCancel={closeDrawer} />
                </form>
              )}
            </aside>
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

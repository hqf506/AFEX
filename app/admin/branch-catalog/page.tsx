'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AdminButton } from '@/components/admin-button'
import { AdminInput } from '@/components/admin-input'
import { AdminSelect } from '@/components/admin-select'
import {
  AdminAlert,
  AdminGlassSection,
  AdminLoadingState,
} from '@/components/admin-ui'
import { PageHeader } from '@/components/page-header'
import {
  canSubmitBranchCatalogDraft,
  createBranchCatalogDraft,
  isSystemScopedBranchCatalogAdmin,
  resolveSelectedBranch,
  type AdminBranchCatalogItemRecord,
  type BranchCatalogDraft,
} from '@/lib/admin/branch-catalog'
import type { AdminBranchRecord } from '@/lib/admin/branches'
import { formatCurrency } from '@/lib/orders/format'
import { usePageAccess } from '@/hooks/use-page-access'
import { getClientErrorMessage } from '@/lib/api/client-error'

function isArabicUserMessage(error: unknown): error is Error {
  return error instanceof Error && /[\u0600-\u06ff]/.test(error.message)
}

const BRANCH_CATALOG_PAGE_SIZE = 10

function AdminBranchCatalogPageContent() {
  const searchParams = useSearchParams()
  const access = usePageAccess(['admin'])
  const { loading: accessLoading, allowed, scopeType } = access
  const isSystemAdmin =
    scopeType !== null && isSystemScopedBranchCatalogAdmin(scopeType)
  const focusedItemId = searchParams.get('itemId')?.trim() || ''
  const requestedBranchId = searchParams.get('branchId')?.trim() || ''

  const [branches, setBranches] = useState<AdminBranchRecord[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [items, setItems] = useState<AdminBranchCatalogItemRecord[]>([])
  const [drafts, setDrafts] = useState<Record<string, BranchCatalogDraft>>({})
  const [loadingData, setLoadingData] = useState(false)
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const branchCatalogRequestIdRef = useRef(0)

  const loadBranchCatalog = useCallback(async (
    branchId?: string,
    page = currentPage
  ) => {
    try {
      const requestId = branchCatalogRequestIdRef.current + 1
      branchCatalogRequestIdRef.current = requestId
      setLoadingData(true)
      setErrorMessage('')

      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(BRANCH_CATALOG_PAGE_SIZE),
      })

      if (branchId) {
        params.set('branchId', branchId)
      }

      const query = `?${params.toString()}`
      const response = await fetch(`/api/admin/branch-catalog${query}`, {
        method: 'GET',
        cache: 'no-store',
      })

      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(getClientErrorMessage(result, 'تعذر تحميل إعدادات منتجات الفرع حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
      }

      const nextItems = (result.items || []) as AdminBranchCatalogItemRecord[]

      if (branchCatalogRequestIdRef.current !== requestId) {
        return
      }

      setBranches(result.branches || [])
      setSelectedBranchId(result.selectedBranchId || '')
      setItems(nextItems)
      setTotalItems(Number(result.total) || 0)
      setDrafts(
        nextItems.reduce<Record<string, BranchCatalogDraft>>((acc, item) => {
          acc[item.id] = createBranchCatalogDraft(item)
          return acc
        }, {})
      )
    } catch (error) {
      console.error('Load branch catalog failed.', {
        category: error instanceof Error ? error.name : 'UnknownError',
      })
      setErrorMessage(
        isArabicUserMessage(error)
          ? error.message
          : 'تعذر تحميل إعدادات كتالوج الفروع'
      )
    } finally {
      setLoadingData(false)
    }
  }, [currentPage])

  useEffect(() => {
    if (!accessLoading && allowed) {
      let isActive = true

      queueMicrotask(() => {
        if (isActive) {
          void loadBranchCatalog(requestedBranchId || undefined, currentPage)
        }
      })

      return () => {
        isActive = false
      }
    }
  }, [
    accessLoading,
    allowed,
    requestedBranchId,
    currentPage,
    loadBranchCatalog,
  ])

  const selectedBranch = useMemo(
    () => resolveSelectedBranch(branches, selectedBranchId),
    [branches, selectedBranchId]
  )

  const activeOverridesCount = useMemo(
    () => items.filter((item) => item.branch_is_active).length,
    [items]
  )

  const branchSpecificPriceCount = useMemo(
    () => items.filter((item) => item.branch_price !== item.default_price).length,
    [items]
  )

  const focusedItem = useMemo(
    () => items.find((item) => item.id === focusedItemId) || null,
    [items, focusedItemId]
  )

  const displayedItems = useMemo(() => {
    if (!focusedItemId) {
      return items
    }

    const matchingItem = items.find((item) => item.id === focusedItemId)

    if (!matchingItem) {
      return items
    }

    return [
      matchingItem,
      ...items.filter((item) => item.id !== focusedItemId),
    ]
  }, [items, focusedItemId])
  const totalPages = Math.max(
    1,
    Math.ceil(totalItems / BRANCH_CATALOG_PAGE_SIZE)
  )

  async function handleBranchChange(nextBranchId: string) {
    setSuccessMessage('')
    setErrorMessage('')
    setCurrentPage(1)
    await loadBranchCatalog(nextBranchId, 1)
  }

  function updateDraft(
    itemId: string,
    updater: (previous: BranchCatalogDraft) => BranchCatalogDraft
  ) {
    setDrafts((prev) => ({
      ...prev,
      [itemId]: updater(
        prev[itemId] || {
          price: '',
          isActive: 'true',
          displayOrder: '',
        }
      ),
    }))
  }

  async function handleSaveItem(item: AdminBranchCatalogItemRecord) {
    const draft = drafts[item.id]

    if (!draft || !selectedBranchId) {
      return
    }

    try {
      setSavingItemId(item.id)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch('/api/admin/branch-catalog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          branchId: selectedBranchId,
          catalogItemId: item.id,
          price: draft.price,
          isActive: draft.isActive,
          displayOrder: draft.displayOrder,
        }),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(getClientErrorMessage(result, 'تعذر حفظ إعدادات المنتج للفرع. لم يتم حفظ التغييرات.'))
      }

      setSuccessMessage(
        result?.message || 'تم حفظ إعدادات العنصر الخاصة بالفرع بنجاح'
      )
      await loadBranchCatalog(selectedBranchId, currentPage)
    } catch (error) {
      console.error('Save branch catalog item failed.', {
        category: error instanceof Error ? error.name : 'UnknownError',
      })
      setErrorMessage(
        isArabicUserMessage(error)
          ? error.message
          : 'تعذر حفظ إعدادات العنصر الخاصة بالفرع'
      )
    } finally {
      setSavingItemId(null)
    }
  }

  if (accessLoading) {
    return (
      <div className="min-h-full bg-[#030714] text-white">
        <div className="mx-auto max-w-7xl pt-6">
          <AdminLoadingState />
        </div>
      </div>
    )
  }

  if (!allowed || !isSystemAdmin) {
    return (
      <div className="min-h-full bg-[#030714] text-white">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-3xl border border-cyan-300/15 bg-[#07111f]/90 p-6 text-right shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl">
            <h1 className="text-2xl font-black text-white">غير مصرح لك</h1>
            <p className="mt-2 text-slate-400">
              هذه الصفحة متاحة لمدير النظام فقط.
            </p>

            <div className="mt-4 flex flex-wrap justify-end gap-3">
              <Link
                href="/admin/catalog"
                className="inline-flex items-center rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-2 text-slate-200 transition hover:bg-white/[0.08]"
              >
                العودة إلى الكتالوج
              </Link>
              <Link
                href="/"
                className="inline-flex items-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-4 py-2 font-black text-slate-950"
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
    <div className="min-h-full bg-[#030714] text-white [&_.border-slate-200]:border-white/10 [&_.border-slate-300]:border-white/15 [&_.bg-slate-50]:bg-white/[0.045] [&_.bg-white]:bg-[#07111f]/90 [&_.text-slate-900]:text-white [&_.text-slate-700]:text-slate-300 [&_.text-slate-600]:text-slate-400 [&_.text-slate-500]:text-slate-400">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          title="كتالوج الفروع"
          subtitle="إدارة الأسعار والتفعيل وترتيب العرض لكل فرع بشكل مستقل"
          actions={
            <>
              <Link
                href="/admin/catalog"
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/[0.08]"
              >
                العودة إلى الكتالوج
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 py-3 text-sm font-black text-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.18)]"
              >
                العودة إلى القائمة الرئيسية
              </Link>
            </>
          }
        />

        {successMessage ? (
          <AdminAlert tone="success">{successMessage}</AdminAlert>
        ) : null}

        {errorMessage ? (
          <AdminAlert tone="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={() =>
                  void loadBranchCatalog(selectedBranchId || undefined, currentPage)
                }
                disabled={loadingData || Boolean(savingItemId)}
                className="min-h-[44px] rounded-xl border border-rose-200/25 bg-rose-100/10 px-4 text-xs font-black text-rose-50 transition hover:bg-rose-100/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingData ? 'جارٍ إعادة التحميل...' : 'إعادة تحميل البيانات'}
              </button>
            </div>
          </AdminAlert>
        ) : null}

        {focusedItem ? (
          <div className="rounded-2xl border border-cyan-300/15 bg-white/[0.045] px-4 py-4 text-right">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-500">إدارة مركزة للصنف</p>
                <p className="mt-1 text-sm font-black text-slate-900">
                  {focusedItem.name}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  يمكنك الآن تغيير توفره وسعره وترتيبه في الفروع بشكل مباشر.
                </p>
              </div>

              <Link
                href="/admin/branch-catalog"
                className="inline-flex items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15"
              >
                عرض جميع العناصر
              </Link>
            </div>
          </div>
        ) : null}

        <AdminGlassSection className="bg-[#07111f]/90 md:p-7">
          <div data-responsive-admin-form className="grid min-w-0 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900">اختيار الفرع</h2>
                <p className="mt-1 text-sm text-slate-500">
                  اختر الفرع الذي تريد ضبط أسعار وتفعيل عناصر الكتالوج له.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  الفرع
                </label>
                <AdminSelect
                  value={selectedBranchId}
                  onChange={(e) => void handleBranchChange(e.target.value)}
                  className="h-14 w-full min-w-0"
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </AdminSelect>
              </div>

              <div className="rounded-[24px] border border-cyan-300/10 bg-[#06111f]/80 p-4">
                <div className="space-y-3">
                  <div className="rounded-2xl border border-cyan-300/10 bg-white/[0.045] px-4 py-3">
                    <p className="text-sm text-slate-500">الفرع الحالي</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">
                      {selectedBranch?.name || '—'}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-cyan-300/10 bg-white/[0.045] px-4 py-3">
                    <p className="text-sm text-slate-500">العناصر النشطة</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">
                      {activeOverridesCount}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-cyan-300/10 bg-white/[0.045] px-4 py-3">
                    <p className="text-sm text-slate-500">أسعار خاصة بالفرع</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">
                      {branchSpecificPriceCount}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="text-right">
                <h2 className="text-2xl font-black text-slate-900">
                  إعدادات عناصر الكتالوج للفرع
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  لكل عنصر يمكنك حفظ سعر خاص بالفرع، تفعيل/تعطيل العرض، وترتيب الظهور.
                </p>
              </div>

              {loadingData ? (
                <div className="rounded-2xl border border-dashed border-cyan-300/15 bg-black/20 px-4 py-8 text-center text-sm font-bold text-slate-400">
                  جارٍ تحميل إعدادات كتالوج الفروع...
                </div>
              ) : items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-cyan-300/15 bg-black/20 px-4 py-8 text-center text-sm font-bold text-slate-400">
                  لا توجد عناصر كتالوج متاحة.
                </div>
              ) : (
                <div className="space-y-4">
                  {displayedItems.map((item) => {
                    const draft = drafts[item.id]

                    return (
                      <article
                        key={item.id}
                        className={`rounded-[24px] border p-4 ${
                          item.id === focusedItemId
                            ? 'border-cyan-300/45 bg-cyan-300/10 shadow-[0_0_30px_rgba(34,211,238,0.12)]'
                            : 'border-white/10 bg-white/[0.045]'
                        }`}
                      >
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="space-y-2 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <span className="text-base font-black text-slate-900">
                                {item.name}
                              </span>
                              <span className="inline-flex rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">
                                {item.item_type === 'service' ? 'خدمة' : 'منتج'}
                              </span>
                              <span
                                className={
                                  item.branch_is_active
                                    ? 'inline-flex rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-100'
                                    : 'inline-flex rounded-full border border-rose-300/25 bg-rose-500/10 px-3 py-1 text-xs font-black text-rose-100'
                                }
                              >
                                {item.branch_is_active ? 'نشط' : 'غير نشط'}
                              </span>
                            </div>

                            <p className="text-sm text-slate-600">
                              {item.category} • السعر الافتراضي:{' '}
                              {formatCurrency(item.default_price)}
                            </p>

                            <div className="flex flex-wrap justify-end gap-2 text-xs">
                              <span
                                className="inline-flex rounded-full border border-slate-400/20 bg-slate-400/10 px-3 py-1 text-xs font-black text-slate-300"
                                dir="ltr"
                              >
                                {item.code}
                              </span>
                              {item.display_order !== null ? (
                                <span className="inline-flex rounded-full border border-slate-400/20 bg-slate-400/10 px-3 py-1 text-xs font-black text-slate-300">
                                  الترتيب الحالي: {item.display_order}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="grid w-full gap-3 xl:w-[420px] xl:grid-cols-2">
                            <div>
                              <label className="mb-2 block text-sm font-bold text-slate-700">
                                سعر الفرع
                              </label>
                              <AdminInput
                                type="number"
                                value={draft?.price || ''}
                                onChange={(e) =>
                                  updateDraft(item.id, (previous) => ({
                                    ...previous,
                                    price: e.target.value,
                                  }))
                                }
                                min="0"
                                step="0.01"
                              />
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-bold text-slate-700">
                                ترتيب العرض
                              </label>
                              <AdminInput
                                type="number"
                                value={draft?.displayOrder || ''}
                                onChange={(e) =>
                                  updateDraft(item.id, (previous) => ({
                                    ...previous,
                                    displayOrder: e.target.value,
                                  }))
                                }
                                min="0"
                                step="1"
                                placeholder="اختياري"
                              />
                            </div>

                            <div className="xl:col-span-2">
                              <label className="mb-2 block text-sm font-bold text-slate-700">
                                حالة العنصر في هذا الفرع
                              </label>
                              <AdminSelect
                                value={draft?.isActive || 'true'}
                                onChange={(e) =>
                                  updateDraft(item.id, (previous) => ({
                                    ...previous,
                                    isActive: e.target.value as 'true' | 'false',
                                  }))
                                }
                                className="w-full min-w-0"
                              >
                                <option value="true">مفعل</option>
                                <option value="false">معطل</option>
                              </AdminSelect>
                            </div>

                            <div className="xl:col-span-2 flex flex-wrap justify-end gap-2">
                              <AdminButton
                                onClick={() =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [item.id]: createBranchCatalogDraft(item),
                                  }))
                                }
                              >
                                استعادة القيم
                              </AdminButton>
                              <AdminButton
                                variant="primary"
                                disabled={
                                  savingItemId === item.id ||
                                  !canSubmitBranchCatalogDraft(draft)
                                }
                                onClick={() => void handleSaveItem(item)}
                              >
                                {savingItemId === item.id
                                  ? 'جارٍ الحفظ...'
                                  : 'حفظ إعدادات الفرع'}
                              </AdminButton>
                            </div>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                  {totalPages > 1 ? (
                    <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-cyan-300/10 bg-black/20 px-4 py-4 text-sm">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                        disabled={currentPage === 1 || loadingData}
                        className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/[0.045] px-4 font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        السابق
                      </button>
                      <span className="font-black text-slate-300">
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentPage((page) => Math.min(totalPages, page + 1))
                        }
                        disabled={currentPage === totalPages || loadingData}
                        className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/[0.045] px-4 font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        التالي
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </AdminGlassSection>
      </div>
    </div>
  )
}

export default function AdminBranchCatalogPage() {
  return (
    <Suspense
      fallback={
        <div>
          <div className="mx-auto max-w-7xl" />
        </div>
      }
    >
      <AdminBranchCatalogPageContent />
    </Suspense>
  )
}

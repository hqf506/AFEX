'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { AdminButton } from '@/components/admin-button'
import { AdminInput } from '@/components/admin-input'
import { AdminSelect } from '@/components/admin-select'
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

  async function loadBranchCatalog(branchId?: string) {
    try {
      setLoadingData(true)
      setErrorMessage('')

      const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
      const response = await fetch(`/api/admin/branch-catalog${query}`, {
        method: 'GET',
        cache: 'no-store',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result?.details ||
            result?.error ||
            'تعذر تحميل إعدادات كتالوج الفروع'
        )
      }

      const nextItems = (result.items || []) as AdminBranchCatalogItemRecord[]
      setBranches(result.branches || [])
      setSelectedBranchId(result.selectedBranchId || '')
      setItems(nextItems)
      setDrafts(
        nextItems.reduce<Record<string, BranchCatalogDraft>>((acc, item) => {
          acc[item.id] = createBranchCatalogDraft(item)
          return acc
        }, {})
      )
    } catch (error) {
      console.error('Load branch catalog error:', error)
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'تعذر تحميل إعدادات كتالوج الفروع'
      )
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => {
    if (!accessLoading && allowed) {
      void loadBranchCatalog(requestedBranchId || undefined)
    }
  }, [accessLoading, allowed, requestedBranchId])

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

  async function handleBranchChange(nextBranchId: string) {
    setSuccessMessage('')
    setErrorMessage('')
    await loadBranchCatalog(nextBranchId)
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

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result?.details ||
            result?.error ||
            'فشل حفظ إعدادات العنصر الخاصة بالفرع'
        )
      }

      setSuccessMessage(
        result?.message || 'تم حفظ إعدادات العنصر الخاصة بالفرع بنجاح'
      )
      await loadBranchCatalog(selectedBranchId)
    } catch (error) {
      console.error('Save branch catalog item error:', error)
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'تعذر حفظ إعدادات العنصر الخاصة بالفرع'
      )
    } finally {
      setSavingItemId(null)
    }
  }

  if (accessLoading) {
    return (
      <div>
        <div className="mx-auto max-w-7xl" />
      </div>
    )
  }

  if (!allowed || !isSystemAdmin) {
    return (
      <div>
        <div className="mx-auto max-w-7xl">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-right shadow-sm">
            <h1 className="text-2xl font-black text-slate-900">غير مصرح لك</h1>
            <p className="mt-2 text-slate-600">
              هذه الصفحة متاحة لمدير النظام فقط.
            </p>

            <div className="mt-4 flex flex-wrap justify-end gap-3">
              <Link
                href="/admin/catalog"
                className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-slate-900"
              >
                العودة إلى الكتالوج
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
      </div>
    )
  }

  return (
    <div>
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          title="كتالوج الفروع"
          subtitle="إدارة الأسعار والتفعيل وترتيب العرض لكل فرع بشكل مستقل"
          actions={
            <>
              <Link
                href="/admin/catalog"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-900"
              >
                العودة إلى الكتالوج
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

        {focusedItem ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-right">
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
                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900"
              >
                عرض جميع العناصر
              </Link>
            </div>
          </div>
        ) : null}

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
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

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-sm text-slate-500">الفرع الحالي</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">
                      {selectedBranch?.name || '—'}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-sm text-slate-500">العناصر النشطة</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">
                      {activeOverridesCount}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
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
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  جاري تحميل إعدادات كتالوج الفروع...
                </div>
              ) : items.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
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
                            ? 'border-slate-900 bg-white shadow-sm'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="space-y-2 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <span className="text-base font-black text-slate-900">
                                {item.name}
                              </span>
                              <span className="badge badge-slate">
                                {item.item_type === 'service' ? 'خدمة' : 'منتج'}
                              </span>
                              <span
                                className={
                                  item.branch_is_active
                                    ? 'badge badge-green'
                                    : 'badge badge-slate'
                                }
                              >
                                {item.branch_is_active ? 'مفعل في الفرع' : 'معطل في الفرع'}
                              </span>
                            </div>

                            <p className="text-sm text-slate-600">
                              {item.category} • السعر الافتراضي:{' '}
                              {formatCurrency(item.default_price)}
                            </p>

                            <div className="flex flex-wrap justify-end gap-2 text-xs">
                              <span className="badge badge-slate" dir="ltr">
                                {item.code}
                              </span>
                              {item.display_order !== null ? (
                                <span className="badge badge-slate">
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
                </div>
              )}
            </div>
          </div>
        </section>
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

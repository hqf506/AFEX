'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AdminButton } from '@/components/admin-button'
import { AdminInput } from '@/components/admin-input'
import { AdminSelect } from '@/components/admin-select'
import { PageHeader } from '@/components/page-header'
import {
  canSubmitCatalogForm,
  CATALOG_ITEM_TYPE_OPTIONS,
  createEmptyCatalogFormPayload,
  isSystemScopedCatalogAdmin,
  type AdminCatalogFormPayload,
  type AdminCatalogItemRecord,
} from '@/lib/admin/catalog'
import { formatCurrency } from '@/lib/orders/format'
import { usePageAccess } from '@/hooks/use-page-access'

export default function AdminCatalogPage() {
  const access = usePageAccess(['admin'])
  const { loading: accessLoading, allowed, scopeType } = access
  const isSystemAdmin =
    scopeType !== null && isSystemScopedCatalogAdmin(scopeType)

  const [items, setItems] = useState<AdminCatalogItemRecord[]>([])
  const [form, setForm] = useState<AdminCatalogFormPayload>(
    createEmptyCatalogFormPayload()
  )
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [loadingItems, setLoadingItems] = useState(false)
  const [saving, setSaving] = useState(false)
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null)
  const [uploadingImageItemId, setUploadingImageItemId] = useState<string | null>(
    null
  )
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  async function loadItems() {
    try {
      setLoadingItems(true)
      setErrorMessage('')

      const response = await fetch('/api/admin/catalog', {
        method: 'GET',
        cache: 'no-store',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result?.details || result?.error || 'تعذر تحميل عناصر الكتالوج'
        )
      }

      setItems(result.items || [])
    } catch (error) {
      console.error('Load catalog items error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر تحميل عناصر الكتالوج'
      )
    } finally {
      setLoadingItems(false)
    }
  }

  useEffect(() => {
    if (!accessLoading && allowed) {
      void loadItems()
    }
  }, [accessLoading, allowed])

  const canSubmit = useMemo(() => canSubmitCatalogForm(form), [form])

  const activeItemsCount = useMemo(
    () => items.filter((item) => item.is_active).length,
    [items]
  )

  const inactiveItemsCount = items.length - activeItemsCount

  function resetForm() {
    setForm(createEmptyCatalogFormPayload())
    setEditingItemId(null)
  }

  function startEdit(item: AdminCatalogItemRecord) {
    setEditingItemId(item.id)
    setForm({
      name: item.name,
      code: item.code,
      category: item.category,
      itemType: item.item_type,
      defaultPrice: item.default_price.toString(),
    })
    setSuccessMessage('')
    setErrorMessage('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    try {
      setSaving(true)
      setSuccessMessage('')
      setErrorMessage('')

      const payload = {
        name: form.name,
        code: form.code,
        category: form.category,
        item_type: form.itemType,
        default_price: form.defaultPrice,
        ...(editingItemId
          ? {
              is_active:
                items.find((item) => item.id === editingItemId)?.is_active ?? true,
            }
          : {}),
      }

      const response = await fetch(
        editingItemId ? `/api/admin/catalog/${editingItemId}` : '/api/admin/catalog',
        {
          method: editingItemId ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result?.details ||
            result?.error ||
            (editingItemId ? 'فشل تحديث العنصر' : 'فشل إنشاء العنصر')
        )
      }

      setSuccessMessage(
        result?.message ||
          (editingItemId
            ? 'تم تحديث عنصر الكتالوج بنجاح'
            : 'تم إنشاء عنصر الكتالوج بنجاح')
      )
      resetForm()
      await loadItems()
    } catch (error) {
      console.error('Save catalog item error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر حفظ عنصر الكتالوج'
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleItem(item: AdminCatalogItemRecord) {
    try {
      setUpdatingItemId(item.id)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch(`/api/admin/catalog/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: item.name,
          code: item.code,
          category: item.category,
          item_type: item.item_type,
          default_price: item.default_price,
          is_active: !item.is_active,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result?.details || result?.error || 'فشل تحديث حالة العنصر'
        )
      }

      setSuccessMessage(
        result?.message ||
          (!item.is_active
            ? 'تم تفعيل عنصر الكتالوج بنجاح'
            : 'تم تعطيل عنصر الكتالوج بنجاح')
      )
      await loadItems()
    } catch (error) {
      console.error('Toggle catalog item error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر تحديث حالة العنصر'
      )
    } finally {
      setUpdatingItemId(null)
    }
  }

  async function handleImageUpload(
    item: AdminCatalogItemRecord,
    file: File | null
  ) {
    if (!file) return

    try {
      setUploadingImageItemId(item.id)
      setSuccessMessage('')
      setErrorMessage('')

      const formData = new FormData()
      formData.append('itemId', item.id)
      formData.append('file', file)

      const response = await fetch('/api/admin/catalog/upload-image', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result?.details || result?.error || 'فشل رفع صورة العنصر'
        )
      }

      setSuccessMessage(result?.message || 'تم رفع صورة العنصر بنجاح')
      await loadItems()
    } catch (error) {
      console.error('Upload catalog image error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر رفع صورة العنصر'
      )
    } finally {
      setUploadingImageItemId(null)
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
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-right shadow-sm">
            <h1 className="text-2xl font-black text-slate-900">غير مصرح لك</h1>
            <p className="mt-2 text-slate-600">
              هذه الصفحة متاحة لمدير النظام فقط.
            </p>

            <div className="mt-4 flex flex-wrap justify-end gap-3">
              <Link
                href="/admin/settings"
                className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-slate-900"
              >
                العودة إلى الإعدادات
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
          title="إدارة الكتالوج"
          subtitle="إضافة عناصر المنتجات والخدمات وتعديلها وتفعيلها أو تعطيلها"
          actions={
            <>
              <Link
                href="/admin/branch-catalog"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-900"
              >
                كتالوج الفروع
              </Link>
              <Link
                href="/admin/settings"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-900"
              >
                العودة إلى الإعدادات
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

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div className="text-right">
                <h2 className="text-2xl font-black text-slate-900">
                  {editingItemId ? 'تعديل عنصر' : 'إضافة عنصر جديد'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  أدخل البيانات الأساسية فقط. ربط الفروع والأسعار الخاصة سيأتي لاحقًا.
                </p>
              </div>

              {editingItemId ? (
                <AdminButton onClick={resetForm}>إلغاء التعديل</AdminButton>
              ) : null}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  اسم العنصر
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
                  placeholder="مثال: تنظيف فاخر"
                  className="h-14 border-slate-300 text-right focus:border-slate-500"
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  الكود الداخلي
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
                  placeholder="مثال: premium-cleaning"
                  className="h-14 border-slate-300 text-left focus:border-slate-500"
                  autoComplete="off"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    التصنيف
                  </label>
                  <AdminInput
                    type="text"
                    value={form.category}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        category: e.target.value,
                      }))
                    }
                    placeholder="مثال: تنظيف"
                    className="h-14 border-slate-300 text-right focus:border-slate-500"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    نوع العنصر
                  </label>
                  <AdminSelect
                    value={form.itemType}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        itemType: e.target.value as 'product' | 'service',
                      }))
                    }
                    className="h-14 w-full min-w-0"
                  >
                    {CATALOG_ITEM_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </AdminSelect>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  السعر الافتراضي
                </label>
                <AdminInput
                  type="number"
                  value={form.defaultPrice}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      defaultPrice: e.target.value,
                    }))
                  }
                  placeholder="0"
                  className="h-14 border-slate-300 text-right focus:border-slate-500"
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <AdminButton
                  type="submit"
                  variant="primary"
                  disabled={!canSubmit || saving}
                >
                  {saving
                    ? editingItemId
                      ? 'جارٍ حفظ التعديل...'
                      : 'جارٍ إنشاء العنصر...'
                    : editingItemId
                      ? 'حفظ التعديل'
                      : 'إضافة العنصر'}
                </AdminButton>
              </div>
            </form>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="text-right">
                <h2 className="text-2xl font-black text-slate-900">
                  عناصر الكتالوج الحالية
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  راجع العناصر الحالية وعدّلها أو فعّلها/عطّلها حسب الحاجة.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-sm">
                <span className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 font-bold text-slate-700">
                  الإجمالي: {items.length}
                </span>
                <span className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 font-bold text-emerald-700">
                  النشط: {activeItemsCount}
                </span>
                <span className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 font-bold text-amber-700">
                  المعطل: {inactiveItemsCount}
                </span>
              </div>
            </div>

            {loadingItems ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                جاري تحميل عناصر الكتالوج...
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                لا توجد عناصر مضافة بعد.
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-[24px] border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex gap-4">
                        <div className="shrink-0">
                          {item.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="h-24 w-24 rounded-[20px] border border-slate-200 bg-white object-cover"
                            />
                          ) : (
                            <div className="flex h-24 w-24 items-center justify-center rounded-[20px] border border-dashed border-slate-300 bg-white text-center text-xs font-bold text-slate-400">
                              بدون صورة
                            </div>
                          )}
                        </div>

                        <div className="space-y-2 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <span className="text-base font-black text-slate-900">
                              {item.name}
                            </span>
                            <span
                              className={
                                item.is_active ? 'badge badge-green' : 'badge badge-slate'
                              }
                            >
                              {item.is_active ? 'نشط' : 'معطل'}
                            </span>
                          </div>

                          <p className="text-sm text-slate-600">
                            {item.item_type === 'service' ? 'خدمة' : 'منتج'} •{' '}
                            {item.category}
                          </p>

                          <div className="flex flex-wrap justify-end gap-2 text-xs">
                            <span className="badge badge-slate" dir="ltr">
                              {item.code}
                            </span>
                            <span className="badge badge-slate">
                              {formatCurrency(item.default_price)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/admin/branch-catalog?itemId=${encodeURIComponent(item.id)}`}
                          className="secondary-btn inline-flex items-center justify-center"
                        >
                          إدارة الفروع
                        </Link>
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null
                              void handleImageUpload(item, file)
                              e.currentTarget.value = ''
                            }}
                          />
                          <span className="secondary-btn inline-flex items-center justify-center">
                            {uploadingImageItemId === item.id
                              ? 'جارٍ رفع الصورة...'
                              : item.image_url
                                ? 'تغيير الصورة'
                                : 'رفع الصورة'}
                          </span>
                        </label>
                        <AdminButton onClick={() => startEdit(item)}>
                          تعديل
                        </AdminButton>
                        <AdminButton
                          variant={item.is_active ? 'active' : 'inactive'}
                          disabled={updatingItemId === item.id}
                          onClick={() => handleToggleItem(item)}
                        >
                          {item.is_active ? 'تعطيل' : 'تفعيل'}
                        </AdminButton>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}

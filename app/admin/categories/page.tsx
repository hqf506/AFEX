'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AdminInput } from '@/components/admin-input'
import { usePageAccess } from '@/hooks/use-page-access'
import {
  loadClientResource,
  peekClientResource,
  writeClientResource,
} from '@/lib/client-resource-cache'

type CategoryRecord = {
  id: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
  used_count: number
}

const UNCATEGORIZED_LABEL = 'دون فئة'
const ADMIN_CATEGORIES_CACHE_KEY = 'admin-categories'
const ADMIN_CATEGORIES_RESPONSE_CACHE_KEY = 'admin-categories:response'
const ADMIN_CATEGORIES_CACHE_TTL_MS = 60_000

type CategoriesResponse = {
  categories?: CategoryRecord[]
  uncategorized_count?: number
}

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

function CategoryIcon({ className = '' }: { className?: string }) {
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
      <path d="M20 10 10 20l-6-6L14 4h6v6Z" />
      <circle cx="17" cy="7" r="1" />
    </svg>
  )
}

export default function AdminCategoriesPage() {
  const access = usePageAccess(['admin'])
  const { loading: accessLoading, allowed, scopeType } = access
  const isSystemAdmin = scopeType === 'system'

  const [categories, setCategories] = useState<CategoryRecord[]>(() => {
    const cachedResponse =
      peekClientResource<CategoriesResponse>(ADMIN_CATEGORIES_RESPONSE_CACHE_KEY)
    return Array.isArray(cachedResponse?.categories)
      ? cachedResponse.categories
      : peekClientResource<CategoryRecord[]>(ADMIN_CATEGORIES_CACHE_KEY) || []
  })
  const [uncategorizedCount, setUncategorizedCount] = useState(() => {
    const cachedResponse =
      peekClientResource<CategoriesResponse>(ADMIN_CATEGORIES_RESPONSE_CACHE_KEY)
    return typeof cachedResponse?.uncategorized_count === 'number'
      ? cachedResponse.uncategorized_count
      : 0
  })
  const [name, setName] = useState('')
  const [loadingCategories, setLoadingCategories] = useState(
    !(peekClientResource<CategoryRecord[]>(ADMIN_CATEGORIES_CACHE_KEY) || []).length
  )
  const [creating, setCreating] = useState(false)
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<CategoryRecord | null>(null)

  const canCreate = useMemo(() => name.trim().length > 0, [name])
  const sortedCategories = useMemo(() => {
    const dynamicCategories = [...categories].sort((a, b) => {
      if (b.used_count !== a.used_count) {
        return b.used_count - a.used_count
      }

      return a.name.localeCompare(b.name, 'ar')
    })

    return [
      {
        id: 'uncategorized',
        name: UNCATEGORIZED_LABEL,
        is_active: true,
        created_at: '',
        updated_at: '',
        used_count: uncategorizedCount,
      },
      ...dynamicCategories,
    ]
  }, [categories, uncategorizedCount])

  async function loadCategories(force = false) {
    try {
      const cachedResponse =
        peekClientResource<CategoriesResponse>(ADMIN_CATEGORIES_RESPONSE_CACHE_KEY)
      const cachedCategories = Array.isArray(cachedResponse?.categories)
        ? cachedResponse.categories
        : peekClientResource<CategoryRecord[]>(ADMIN_CATEGORIES_CACHE_KEY) || []

      if (cachedCategories.length > 0) {
        setCategories(cachedCategories)
        setUncategorizedCount(
          typeof cachedResponse?.uncategorized_count === 'number'
            ? cachedResponse.uncategorized_count
            : 0
        )
        setLoadingCategories(false)
      } else {
        setLoadingCategories(true)
      }

      setErrorMessage('')

      const result = await loadClientResource(
        ADMIN_CATEGORIES_RESPONSE_CACHE_KEY,
        async () => {
          const response = await fetch('/api/admin/categories', {
            method: 'GET',
            cache: 'no-store',
          })

          const json = (await response.json()) as CategoriesResponse & {
            details?: string
            error?: string
          }

          if (!response.ok) {
            throw new Error(json?.details || json?.error || 'تعذر تحميل الفئات')
          }

          return {
            categories: Array.isArray(json.categories) ? json.categories : [],
            uncategorized_count:
              typeof json.uncategorized_count === 'number'
                ? json.uncategorized_count
                : 0,
          } satisfies CategoriesResponse
        },
        {
          ttlMs: ADMIN_CATEGORIES_CACHE_TTL_MS,
          force,
          logLabel: 'fetch categories',
        }
      )

      setCategories(Array.isArray(result.categories) ? result.categories : [])
      setUncategorizedCount(
        typeof result.uncategorized_count === 'number'
          ? result.uncategorized_count
          : 0
      )
      writeClientResource(
        ADMIN_CATEGORIES_CACHE_KEY,
        Array.isArray(result.categories) ? result.categories : []
      )
    } catch (error) {
      console.error('Load categories error:', error)
      setErrorMessage(error instanceof Error ? error.message : 'تعذر تحميل الفئات')
    } finally {
      setLoadingCategories(false)
    }
  }

  useEffect(() => {
    if (accessLoading || !allowed) return

    const timeoutId = window.setTimeout(() => {
      void loadCategories()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [accessLoading, allowed])

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault()

    try {
      setCreating(true)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result?.details || result?.error || 'فشل إنشاء الفئة')
      }

      setSuccessMessage('تمت إضافة فئة جديدة بنجاح')
      setName('')
      await loadCategories(true)
    } catch (error) {
      console.error('Create category error:', error)
      setErrorMessage(error instanceof Error ? error.message : 'تعذر إنشاء الفئة')
    } finally {
      setCreating(false)
    }
  }

  async function performDeleteCategory(category: CategoryRecord) {
    try {
      setDeletingCategoryId(category.id)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch('/api/admin/categories', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: category.id,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result?.details || result?.error || 'تعذر حذف الفئة')
      }

      setSuccessMessage(result.message || 'تم حذف الفئة بنجاح')
      await loadCategories(true)
    } catch (error) {
      console.error('Delete category error:', error)
      setErrorMessage(error instanceof Error ? error.message : 'تعذر حذف الفئة')
    } finally {
      setDeletingCategoryId(null)
    }
  }

  function handleDeleteCategory(category: CategoryRecord) {
    if (category.id === 'uncategorized') {
      return
    }

    setPendingDeleteCategory(category)
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
                <CategoryIcon className="h-7 w-7" />
              </div>
              <div>
                <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black tracking-[0.2em] text-cyan-200">
                  AFEX CATALOG
                </span>
                <h1 className="mt-3 text-3xl font-black text-white md:text-4xl">
                  الفئات
                </h1>
                <p className="mt-2 text-sm font-medium text-slate-400">
                  إدارة الفئات المستخدمة في صفحة العناصر
                </p>
              </div>
            </div>

            <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-slate-200">
              <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.8)]" />
              {categories.length} فئة نشطة
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

        <section
          id="new-category-form"
          className="rounded-[28px] border border-cyan-300/15 bg-white/[0.055] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-6"
        >
          <div className="mb-5 flex flex-col gap-2 text-right">
            <span className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200/80">
              Create Category
            </span>
            <h2 className="text-2xl font-black text-white">إضافة فئة جديدة</h2>
            <p className="text-sm text-slate-400">
              أضف فئة جديدة لتسهيل تنظيم العناصر والخدمات داخل الكتالوج.
            </p>
          </div>

          <form onSubmit={handleCreateCategory} className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="w-full text-right">
              <label className="mb-2 block text-sm font-bold text-slate-200">
                اسم الفئة
              </label>
              <AdminInput
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: تلميع"
                className="h-14 rounded-2xl !border-white/10 !bg-[rgba(255,255,255,0.04)] px-5 text-right text-sm font-bold !text-white !shadow-none !outline-none !placeholder:text-slate-500 focus:!border-cyan-300/55 focus:!bg-white/[0.06] focus:!ring-2 focus:!ring-cyan-300/20"
                autoComplete="off"
              />
            </div>

            <button
              type="submit"
              disabled={!canCreate || creating}
              className="inline-flex h-14 min-w-[170px] items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-6 text-sm font-black text-slate-950 shadow-[0_0_35px_rgba(34,211,238,0.22)] transition duration-150 hover:scale-[1.01] hover:shadow-[0_0_45px_rgba(34,211,238,0.3)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? 'جاري الإضافة...' : 'إضافة فئة'}
            </button>
          </form>
        </section>

        <section className="rounded-[28px] border border-cyan-300/15 bg-white/[0.055] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-6">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="text-right">
              <span className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200/80">
                Categories List
              </span>
              <h2 className="mt-2 text-2xl font-black text-white">قائمة الفئات</h2>
              <p className="mt-1 text-sm text-slate-400">
                راقب الفئات وعدد العناصر المرتبطة بكل فئة.
              </p>
            </div>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-sm font-bold text-cyan-100">
              {categories.length} فئة
            </span>
          </div>

          {loadingCategories ? (
            <div className="rounded-2xl border border-dashed border-cyan-300/15 bg-black/20 px-4 py-10 text-center text-sm font-bold text-slate-400">
              جاري تحميل الفئات...
            </div>
          ) : categories.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-cyan-300/20 bg-black/20 px-4 py-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                <CategoryIcon className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-lg font-black text-white">
                لا توجد فئات مضافة حاليًا
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                أضف أول فئة لتنظيم العناصر والخدمات في الكتالوج.
              </p>
              <a
                href="#new-category-form"
                className="mt-5 inline-flex items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15"
              >
                أضف أول فئة
              </a>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#06111f]/65">
              <table className="w-full min-w-[620px] text-right">
                <thead className="bg-white/[0.035]">
                  <tr className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    <th className="px-5 py-4">الفئة</th>
                    <th className="px-5 py-4 text-center">عدد العناصر</th>
                    <th className="px-5 py-4 text-center">الإجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCategories.map((category) => (
                    <tr
                      key={category.id}
                      className="group border-b border-white/[0.08] transition hover:bg-cyan-300/[0.035] last:border-b-0"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
                            <CategoryIcon className="h-5 w-5" />
                          </span>
                          <span className="text-sm font-black text-white">
                            {category.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex min-w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] px-3 py-1 text-sm font-black text-slate-200">
                          {category.used_count}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        {category.id === 'uncategorized' ? (
                          <span
                            className="inline-flex cursor-not-allowed items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-black text-cyan-100"
                          >
                            أساسي
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={deletingCategoryId === category.id}
                            onClick={() => void handleDeleteCategory(category)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-300/20 bg-red-500/10 text-red-200 transition hover:bg-red-500/15 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="حذف"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {pendingDeleteCategory ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-[28px] border border-cyan-300/15 bg-[#07111f] p-6 text-right text-white shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-red-300/20 bg-red-500/10 text-red-200">
                  <TrashIcon className="h-5 w-5" />
                </span>
                <h2 className="text-lg font-black text-white">حذف الفئة</h2>
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                {pendingDeleteCategory.used_count > 0
                  ? `هذه الفئة مستخدمة في ${pendingDeleteCategory.used_count} عنصر. عند حذفها سيتم نقل العناصر إلى دون فئة. هل تريد المتابعة؟`
                  : 'هل تريد تأكيد حذف هذه الفئة؟'}
              </p>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPendingDeleteCategory(null)}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] px-4 text-sm font-bold text-slate-200 transition hover:bg-white/10"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const category = pendingDeleteCategory
                    setPendingDeleteCategory(null)
                    if (category) {
                      void performDeleteCategory(category)
                    }
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-red-500 px-4 text-sm font-black text-white shadow-[0_0_25px_rgba(239,68,68,0.22)] transition hover:bg-red-400"
                >
                  تأكيد الحذف
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}


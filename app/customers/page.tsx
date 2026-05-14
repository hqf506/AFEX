'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AdminBranchFilter } from '@/components/admin-branch-filter'
import { useAdminBranchFilter } from '@/hooks/use-admin-branch-filter'
import { usePageAccess } from '@/hooks/use-page-access'
import type { CustomerListItem } from '@/lib/customers'

export default function CustomersPage() {
  const access = usePageAccess({
    allowedRoles: ['admin', 'employee', 'cashier'],
  })
  const { authLoading, allowed, roleLabel, branchId, scopeType } = access
  const {
    isSystemAdmin,
    branches,
    loadingBranches,
    selectedBranchId,
    effectiveBranchId,
    setSelectedBranchId,
  } = useAdminBranchFilter(scopeType, branchId, allowed)

  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<CustomerListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!allowed) return

    const timeoutId = window.setTimeout(async () => {
      setLoading(true)
      setErrorMessage('')

      try {
        const params = new URLSearchParams()
        params.set('q', search.trim())

        if (effectiveBranchId) {
          params.set('branch_id', effectiveBranchId)
        }

        const response = await fetch(`/api/customers?${params.toString()}`, {
          method: 'GET',
          credentials: 'include',
        })

        const result = await response.json().catch(() => null)

        if (!response.ok || !result?.success) {
          setCustomers([])
          setErrorMessage(result?.error || 'فشل تحميل العملاء')
          setLoading(false)
          return
        }

        setCustomers(
          Array.isArray(result.customers)
            ? (result.customers as CustomerListItem[])
            : []
        )
        setLoading(false)
      } catch (error) {
        setCustomers([])
        setErrorMessage(
          error instanceof Error ? error.message : 'فشل تحميل العملاء'
        )
        setLoading(false)
      }
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [allowed, search, effectiveBranchId])

  if (authLoading) {
    return (
      <div className="app-shell">
        <div className="page-wrap" />
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="app-shell">
        <div className="page-wrap">
          <div className="page-card">جارٍ التحويل...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="page-wrap">
        {errorMessage ? <div className="error-alert">{errorMessage}</div> : null}

        <div className="page-hero">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="page-title">العملاء</h1>
              <p className="page-subtitle">AFEX</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {isSystemAdmin ? (
                <AdminBranchFilter
                  branches={branches}
                  selectedBranchId={selectedBranchId}
                  loading={loadingBranches}
                  onChange={setSelectedBranchId}
                  className="min-w-[220px]"
                />
              ) : null}

              <Link href="/" className="secondary-btn">
                العودة إلى القائمة الرئيسية
              </Link>
              <span className="badge badge-blue">الصلاحية: {roleLabel}</span>
            </div>
          </div>
        </div>

        <div className="page-card">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="section-title">قائمة العملاء</h2>
            <span className="badge badge-slate">{customers.length} عميل</span>
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو رقم الجوال"
            className="field-input mb-4"
          />

          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              جاري تحميل العملاء...
            </div>
          ) : customers.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              لا يوجد عملاء مطابقون.
            </div>
          ) : (
            <div className="space-y-3">
              {customers.map((customer) => (
                <div
                  key={customer.id}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {customer.name || '—'}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {customer.phone || '—'}
                      </p>
                    </div>

                    <span className="badge badge-slate">{customer.id}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PosMobileBottomNavigation } from '@/components/pos-mobile-bottom-navigation'
import { INVOICE_CUSTOMER_STORAGE_KEY } from '@/lib/invoices/customer'
import { clearAllInvoiceCatalogCache } from '@/lib/invoices/catalog'
import { INVOICE_SALE_ITEMS_STORAGE_KEY } from '@/lib/invoices/sale-draft'
import { INVOICE_SUCCESS_STORAGE_KEY } from '@/lib/invoices/success'
import {
  clearActivePosEmployee,
  endPosActorSessionAndRequireReauthentication,
  markPosLoggedOut,
} from '@/lib/pos-employee-session'

export default function PosSettingsPage() {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    const hasActiveSale = Boolean(
      localStorage.getItem(INVOICE_CUSTOMER_STORAGE_KEY) ||
        localStorage.getItem(INVOICE_SALE_ITEMS_STORAGE_KEY)
    )
    const confirmationMessage = hasActiveSale
      ? 'لديك عملية بيع غير مكتملة. هل تريد تسجيل الخروج وتركها محفوظة؟'
      : 'هل تريد تسجيل الخروج من نقطة البيع؟'

    if (!window.confirm(confirmationMessage)) return

    try {
      setLoggingOut(true)
      clearAllInvoiceCatalogCache()
      await endPosActorSessionAndRequireReauthentication()
      sessionStorage.removeItem(INVOICE_SUCCESS_STORAGE_KEY)
      markPosLoggedOut()
      router.push('/pos/login')
    } finally {
      clearActivePosEmployee()
      setLoggingOut(false)
    }
  }

  return (
    <div className="flex min-h-full w-full flex-col bg-slate-50 p-3 text-right md:p-4">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="border-b border-slate-100 pb-4">
          <p className="text-xs font-bold tracking-[0.16em] text-slate-400">
            AFEX POS
          </p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">الإعدادات</h1>
          <p className="mt-1 text-sm text-slate-500">
            إدارة خيارات جلسة نقطة البيع.
          </p>
        </div>

        <div className="mt-4">
          <Link
            href="/pos/offline-drafts"
            className="flex min-h-[52px] items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-800 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
          >
            <span>مسودات الفواتير غير المتصلة</span>
            <span aria-hidden="true">←</span>
          </Link>
        </div>

        <div className="mt-auto border-t border-red-200/70 pt-4">
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="min-h-[44px] rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-black text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loggingOut ? 'جارٍ تسجيل الخروج...' : 'تسجيل الخروج'}
          </button>
        </div>
      </main>

      <div className="mx-auto mt-3 w-full max-w-4xl pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        <PosMobileBottomNavigation />
      </div>
    </div>
  )
}

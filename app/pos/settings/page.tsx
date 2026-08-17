'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PosThemeToggle } from '@/components/pos-theme-toggle'
import { INVOICE_CUSTOMER_STORAGE_KEY } from '@/lib/invoices/customer'
import { clearAllInvoiceCatalogCache } from '@/lib/invoices/catalog'
import { INVOICE_SALE_ITEMS_STORAGE_KEY } from '@/lib/invoices/sale-draft'
import { INVOICE_SUCCESS_STORAGE_KEY } from '@/lib/invoices/success'
import { clearActivePosEmployee, endPosActorSessionAndRequireReauthentication, markPosLoggedOut, readActivePosEmployee } from '@/lib/pos-employee-session'

function SettingsIcon({ name }: { name: 'sale' | 'orders' | 'invoice' | 'switch' | 'exit' }) {
  const paths = { sale: 'M4 5h16v14H4z M8 9h8 M8 13h5', orders: 'M6 4h12v16H6z M9 8h6 M9 12h6 M9 16h4', invoice: 'M7 3h10v18l-2-1.5L13 21l-2-1.5L9 21l-2-1.5z M10 8h4 M10 12h4', switch: 'M7 7h11l-3-3 M18 7l-3 3 M17 17H6l3 3 M6 17l3-3', exit: 'M10 5H5v14h5 M14 8l4 4-4 4 M18 12H9' } as const
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

export default function PosSettingsPage() {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)
  const [employee, setEmployee] = useState<ReturnType<typeof readActivePosEmployee>>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setEmployee(readActivePosEmployee()), 0)
    return () => window.clearTimeout(timer)
  }, [])

  const handleLogout = async () => {
    const hasActiveSale = Boolean(localStorage.getItem(INVOICE_CUSTOMER_STORAGE_KEY) || localStorage.getItem(INVOICE_SALE_ITEMS_STORAGE_KEY))
    const confirmationMessage = hasActiveSale ? 'لديك عملية بيع غير مكتملة. هل تريد تسجيل الخروج وتركها محفوظة؟' : 'هل تريد تسجيل الخروج من نقطة البيع؟'
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

  return <div className="pos-settings-page" dir="rtl"><main className="pos-settings-panel">
    <header className="pos-settings-header"><div><p>AFEX POS</p><h1>الإعدادات</h1><span>إدارة تجربة نقطة البيع والجلسة الحالية.</span></div><Link href="/pos" aria-label="العودة إلى نقطة البيع"><span aria-hidden="true">←</span><b>إغلاق</b></Link></header>
    <section className="pos-settings-session" aria-labelledby="pos-settings-session-title"><div><p id="pos-settings-session-title">جلسة الموظف</p><strong>{employee?.full_name || 'موظف نقطة البيع'}</strong><span>{employee?.role || 'جلسة POS نشطة'}</span></div><span className="pos-settings-live"><i aria-hidden="true" />نشطة</span></section>
    <section className="pos-settings-section" aria-labelledby="pos-settings-display-title"><div className="pos-settings-section-heading"><div><h2 id="pos-settings-display-title">المظهر</h2><p>بدّل بين الوضع الفاتح والداكن.</p></div><PosThemeToggle /></div></section>
    <section className="pos-settings-section" aria-labelledby="pos-settings-work-title"><div className="pos-settings-section-heading"><div><h2 id="pos-settings-work-title">العمل اليومي</h2><p>انتقل إلى مسارات نقطة البيع المصرّح بها.</p></div></div><nav className="pos-settings-links" aria-label="روابط نقطة البيع">
      <Link href="/pos/sale/customer"><SettingsIcon name="sale" /><span><b>عملية بيع جديدة</b><small>اختيار العميل وبدء البيع</small></span><i aria-hidden="true">←</i></Link>
      <Link href="/pos/order-status"><SettingsIcon name="orders" /><span><b>الطلبات والفواتير</b><small>عرض السجل والتفاصيل</small></span><i aria-hidden="true">←</i></Link>
      <Link href="/pos/offline-drafts"><SettingsIcon name="invoice" /><span><b>المسودات غير المتصلة</b><small>إدارة المسودات المحفوظة</small></span><i aria-hidden="true">←</i></Link>
    </nav></section>
    <section className="pos-settings-section is-danger" aria-labelledby="pos-settings-session-actions-title"><div className="pos-settings-section-heading"><div><h2 id="pos-settings-session-actions-title">إدارة الجلسة</h2><p>هذه الإجراءات تنهي صلاحية موظف POS الحالية.</p></div></div><div className="pos-settings-danger-actions">
      <button type="button" onClick={() => void handleLogout()} disabled={loggingOut}><SettingsIcon name="switch" /><span>{loggingOut ? 'جارٍ إنهاء الجلسة...' : 'تبديل الموظف'}</span></button>
      <button type="button" onClick={() => void handleLogout()} disabled={loggingOut}><SettingsIcon name="exit" /><span>{loggingOut ? 'جارٍ تسجيل الخروج...' : 'إنهاء وضع POS'}</span></button>
    </div></section>
  </main></div>
}

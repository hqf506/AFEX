'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSystemSettings } from '@/hooks/use-system-settings'
import {
  readActivePosEmployee,
  type ActivePosEmployee,
} from '@/lib/pos-employee-session'
import { PosLogoutRetentionDialog } from '@/components/pos-logout-retention-dialog'
import { PosNavigationItem } from './pos-shell-primitives'
import { PosSessionIdentityCard } from './pos-session-identity-card'
import { PosThemeToggle } from '@/components/pos-theme-toggle'
import { hasPersistedInvoiceSaleDraft } from '@/lib/invoices/sale-navigation'
import { PosSaleHomeConfirmationDialog } from './pos-sale-home-confirmation-dialog'
import { PosMobileBottomNavigation } from '@/components/pos-mobile-bottom-navigation'

type IconName = 'sale' | 'orders' | 'invoice' | 'more' | 'switch' | 'exit'

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    sale: 'M4 5h16v14H4z M8 9h8 M8 13h5',
    orders: 'M6 4h12v16H6z M9 8h6 M9 12h6 M9 16h4',
    invoice: 'M7 3h10v18l-2-1.5L13 21l-2-1.5L9 21l-2-1.5z M10 8h4 M10 12h4',
    more: 'M5 12h.01 M12 12h.01 M19 12h.01',
    switch: 'M7 7h11l-3-3 M18 7l-3 3 M17 17H6l3 3 M6 17l3-3',
    exit: 'M10 5H5v14h5 M14 8l4 4-4 4 M18 12H9',
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

const navigation = [
  { label: 'البيع', href: '/pos', icon: 'sale' as const },
  { label: 'حالة الطلبات', href: '/pos/order-status', icon: 'orders' as const },
  { label: 'سجل العمليات', href: '/pos/order-history', icon: 'orders' as const },
  { label: 'الفواتير', href: '/pos/invoices', icon: 'invoice' as const },
]

export function PosResponsiveShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [employee, setEmployee] = useState<ActivePosEmployee | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [logoutIntent, setLogoutIntent] = useState<'logout' | 'switch'>('logout')
  const [hasActiveSale, setHasActiveSale] = useState(false)
  const [saleHomeConfirmOpen, setSaleHomeConfirmOpen] = useState(false)
  const [mobileSubrouteNavigationEnabled, setMobileSubrouteNavigationEnabled] = useState(false)
  const { settings } = useSystemSettings(true)

  useEffect(() => {
    const timer = window.setTimeout(() => setEmployee(readActivePosEmployee()), 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const mobileNavigationQuery = window.matchMedia('(max-width: 767.98px)')
    const synchronizeMobileNavigation = () => setMobileSubrouteNavigationEnabled(mobileNavigationQuery.matches)
    synchronizeMobileNavigation()
    mobileNavigationQuery.addEventListener('change', synchronizeMobileNavigation)
    return () => mobileNavigationQuery.removeEventListener('change', synchronizeMobileNavigation)
  }, [])

  const branchName = settings?.branch_name?.trim() || 'الفرع الرئيسي'
  const isMore = pathname.startsWith('/pos/settings')
  const isPosHome = pathname === '/pos'
  const isSaleRoute = pathname.startsWith('/pos/sale/')
  const isCustomerRoute = pathname === '/pos/sale/customer'
  const isItemsRoute = pathname === '/pos/sale/items'
  const mobileNavigationOpen = drawerOpen && (isPosHome || mobileSubrouteNavigationEnabled)
  const saleHeader = pathname === '/pos/sale/customer'
    ? { title: 'اختيار العميل', back: '/pos' }
    : pathname === '/pos/sale/checkout'
      ? { title: 'الدفع وإتمام الطلب', back: '/pos/sale/items' }
      : pathname === '/pos/sale/success'
        ? { title: 'تم إنشاء الفاتورة', back: '/pos' }
        : { title: 'اختيار المنتجات', back: '/pos/sale/customer' }

  const openLogoutDialog = useCallback((intent: 'logout' | 'switch') => {
    setLogoutIntent(intent)
    setHasActiveSale(hasPersistedInvoiceSaleDraft(window.localStorage))
    setDrawerOpen(false)
    setConfirmOpen(true)
  }, [])

  const returnToPosHome = useCallback(() => {
    if (hasPersistedInvoiceSaleDraft(window.localStorage)) {
      setSaleHomeConfirmOpen(true)
      return
    }
    router.replace('/pos')
  }, [router])

  useEffect(() => {
    if (!mobileNavigationOpen) return
    const closeNavigationOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', closeNavigationOnEscape)
    return () => window.removeEventListener('keydown', closeNavigationOnEscape)
  }, [mobileNavigationOpen])

  if (!employee) return <>{children}</>

  const menu = (
    <>
      <div className="afex-pos-brand-row"><div className="afex-pos-brand">AFEX</div><PosThemeToggle /></div>
      <PosSessionIdentityCard employee={employee} branchName={branchName} />
      <p className="afex-pos-nav-label">نقطة البيع</p>
      <nav aria-label="تنقل نقطة البيع" className="afex-pos-navigation">
        {navigation.map((item) => (
          <PosNavigationItem
            key={item.label}
            href={item.href}
            label={item.label}
            icon={<Icon name={item.icon} />}
            disabled={false}
            active={item.href ? pathname === item.href : false}
            onClick={() => setDrawerOpen(false)}
          />
        ))}
      </nav>
      <p className="afex-pos-nav-label">الجلسة</p>
      <div className="afex-pos-session-actions">
        <button type="button" className="afex-pos-nav-item" onClick={() => openLogoutDialog('switch')}><span className="afex-pos-nav-icon"><Icon name="switch" /></span><span>تبديل الموظف</span></button>
        <button type="button" className="afex-pos-nav-item" onClick={() => openLogoutDialog('logout')}><span className="afex-pos-nav-icon"><Icon name="exit" /></span><span>إنهاء وضع POS</span></button>
      </div>
      <div className="afex-pos-permission-note"><strong>صلاحيات موظف POS</strong><span>روابط الإدارة مخفية</span></div>
    </>
  )

  return (
    <div className={`afex-pos-app-shell ${isPosHome ? 'is-pos-home' : 'is-pos-subroute'} ${isSaleRoute ? 'is-sale-route' : ''} ${isCustomerRoute ? 'is-customer-route' : ''} ${isItemsRoute ? 'is-items-route' : ''} ${isMore ? 'is-more-route' : ''}`} dir="rtl">
      {isSaleRoute && !isItemsRoute ? isCustomerRoute ? <header className="afex-pos-sale-header is-customer" data-testid="pos-sale-operational-header">
        <div className="afex-pos-sale-right-controls">
          <Link href={saleHeader.back} data-testid="pos-sale-step-back" aria-label={`الرجوع من ${saleHeader.title}`}>‹</Link>
          <button type="button" className="afex-pos-sale-home" data-testid="pos-sale-home" aria-label="العودة إلى نقطة البيع" onClick={returnToPosHome}><Icon name="sale" /><span>نقطة البيع</span></button>
        </div>
        <strong>{saleHeader.title}</strong>
        <div className="afex-pos-sale-left-controls">
          <PosThemeToggle />
          <section className="afex-pos-sale-employee" aria-label="هوية موظف نقطة البيع">
            <span aria-hidden="true">{(employee.full_name?.trim() || employee.username?.trim() || 'م').charAt(0)}</span>
            <div><b>{employee.full_name?.trim() || employee.username?.trim() || 'موظف نقطة البيع'}</b><small>نقطة البيع</small></div>
          </section>
        </div>
      </header> : <header className="afex-pos-sale-header" data-testid="pos-sale-operational-header">
        <Link href={saleHeader.back} data-testid="pos-sale-step-back" aria-label={`الرجوع من ${saleHeader.title}`}>‹</Link>
        <button type="button" className="afex-pos-sale-home" data-testid="pos-sale-home" aria-label="العودة إلى نقطة البيع" onClick={returnToPosHome}><Icon name="sale" /><span>نقطة البيع</span></button>
        <strong>{saleHeader.title}</strong>
        <PosThemeToggle />
      </header> : !isSaleRoute && !isMore ? <header className="afex-pos-responsive-header">
        <strong>نقطة البيع</strong>
        <div className="afex-pos-responsive-actions"><PosThemeToggle /><button type="button" data-pos-mobile-menu-trigger aria-label="فتح القائمة" aria-controls="afex-pos-mobile-navigation" aria-expanded={mobileNavigationOpen} onClick={() => { if (isPosHome || mobileSubrouteNavigationEnabled) setDrawerOpen(true) }}>☰</button></div>
      </header> : null}
      {isPosHome ? <aside className="afex-pos-sidebar">{menu}</aside> : null}
      {mobileNavigationOpen ? <div className="afex-pos-drawer-backdrop" data-pos-mobile-navigation-backdrop onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawerOpen(false) }}><aside id="afex-pos-mobile-navigation" className="afex-pos-drawer" aria-label="قائمة نقطة البيع" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="afex-pos-drawer-close" aria-label="إغلاق القائمة" onClick={() => setDrawerOpen(false)}>×</button>{menu}</aside></div> : null}
      <div className={`afex-pos-shell-content ${isMore ? 'is-more-route' : ''}`}>
        <div className="afex-pos-route-content">{children}</div>
      </div>
      {isPosHome ? <PosMobileBottomNavigation /> : null}
      <PosLogoutRetentionDialog
        open={confirmOpen}
        intent={logoutIntent}
        hasActiveSale={hasActiveSale}
        onCancel={() => setConfirmOpen(false)}
        onComplete={({ route }) => {
          setEmployee(null)
          setConfirmOpen(false)
          router.replace(route)
        }}
      />
      <PosSaleHomeConfirmationDialog open={saleHomeConfirmOpen} onCancel={() => setSaleHomeConfirmOpen(false)} onConfirm={() => router.replace('/pos')} />
    </div>
  )
}

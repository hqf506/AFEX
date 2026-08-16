'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSystemSettings } from '@/hooks/use-system-settings'
import {
  endPosActorSessionAndRequireReauthentication,
  readActivePosEmployee,
  type ActivePosEmployee,
} from '@/lib/pos-employee-session'
import { PosConfirmationDialog } from './pos-confirmation-dialog'
import { PosNavigationItem } from './pos-shell-primitives'
import { PosSessionIdentityCard } from './pos-session-identity-card'
import { PosThemeToggle } from '@/components/pos-theme-toggle'
import { hasPersistedInvoiceSaleDraft } from '@/lib/invoices/sale-navigation'
import { PosSaleHomeConfirmationDialog } from './pos-sale-home-confirmation-dialog'

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
  { label: 'الطلبات', href: '/pos/order-status', icon: 'orders' as const },
  { label: 'الفواتير', icon: 'invoice' as const, disabled: true },
]

export function PosResponsiveShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [employee, setEmployee] = useState<ActivePosEmployee | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [ending, setEnding] = useState(false)
  const [saleHomeConfirmOpen, setSaleHomeConfirmOpen] = useState(false)
  const { settings } = useSystemSettings(true)

  useEffect(() => {
    const timer = window.setTimeout(() => setEmployee(readActivePosEmployee()), 0)
    return () => window.clearTimeout(timer)
  }, [])

  const branchName = settings?.branch_name?.trim() || 'الفرع الرئيسي'
  const isMore = pathname.startsWith('/pos/settings')
  const isPosHome = pathname === '/pos'
  const isSaleRoute = pathname.startsWith('/pos/sale/')
  const saleHeader = pathname === '/pos/sale/customer'
    ? { title: 'اختيار العميل', back: '/pos/sale/items' }
    : pathname === '/pos/sale/checkout'
      ? { title: 'الدفع وإتمام الطلب', back: '/pos/sale/customer' }
      : pathname === '/pos/sale/success'
        ? { title: 'تم إنشاء الفاتورة', back: '/pos' }
        : { title: 'اختيار المنتجات', back: '/pos' }

  const endSession = useCallback(async () => {
    try {
      setEnding(true)
      await endPosActorSessionAndRequireReauthentication()
      setEmployee(null)
      router.replace('/pos/login')
    } finally {
      setEnding(false)
      setConfirmOpen(false)
    }
  }, [router])

  const returnToPosHome = useCallback(() => {
    if (hasPersistedInvoiceSaleDraft(window.localStorage)) {
      setSaleHomeConfirmOpen(true)
      return
    }
    router.replace('/pos')
  }, [router])

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
            disabled={item.disabled}
            active={item.href ? pathname === item.href : false}
            onClick={() => setDrawerOpen(false)}
          />
        ))}
      </nav>
      <p className="afex-pos-nav-label">الجلسة</p>
      <div className="afex-pos-session-actions">
        <button type="button" className="afex-pos-nav-item" onClick={() => setConfirmOpen(true)}><span className="afex-pos-nav-icon"><Icon name="switch" /></span><span>تبديل الموظف</span></button>
        <button type="button" className="afex-pos-nav-item" onClick={() => setConfirmOpen(true)}><span className="afex-pos-nav-icon"><Icon name="exit" /></span><span>إنهاء وضع POS</span></button>
      </div>
      <div className="afex-pos-permission-note"><strong>صلاحيات موظف POS</strong><span>روابط الإدارة مخفية</span></div>
    </>
  )

  return (
    <div className={`afex-pos-app-shell ${isPosHome ? 'is-pos-home' : 'is-pos-subroute'} ${isSaleRoute ? 'is-sale-route' : ''}`} dir="rtl">
      {isSaleRoute ? <header className="afex-pos-sale-header">
        <Link href={saleHeader.back} aria-label={`الرجوع من ${saleHeader.title}`}>‹</Link>
        <button type="button" className="afex-pos-sale-home" data-testid="pos-sale-home" aria-label="العودة إلى نقطة البيع" onClick={returnToPosHome}><Icon name="sale" /><span>نقطة البيع</span></button>
        <strong>{saleHeader.title}</strong>
        <PosThemeToggle />
      </header> : <header className="afex-pos-responsive-header">
        <strong>{isMore ? 'المزيد' : 'نقطة البيع'}</strong>
        <div className="afex-pos-responsive-actions"><PosThemeToggle /><button type="button" aria-label="فتح التنقل" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>☰</button></div>
      </header>}
      {isPosHome ? <aside className="afex-pos-sidebar">{menu}</aside> : null}
      {isPosHome && drawerOpen ? <div className="afex-pos-drawer-backdrop" onMouseDown={() => setDrawerOpen(false)}><aside className="afex-pos-drawer" onMouseDown={(event) => event.stopPropagation()}>{menu}</aside></div> : null}
      <div className={`afex-pos-shell-content ${isMore ? 'is-more-route' : ''}`}>
        {isMore ? <section className="afex-pos-mobile-more">{menu}</section> : null}
        <div className="afex-pos-route-content">{children}</div>
      </div>
      {isPosHome ? <nav className="afex-pos-bottom-nav" aria-label="تنقل نقطة البيع للهاتف">
        {navigation.map((item) => item.disabled ? <span key={item.label} aria-disabled="true"><Icon name={item.icon} /><b>{item.label}</b></span> : <Link key={item.label} href={item.href!} aria-current={pathname === item.href ? 'page' : undefined}><Icon name={item.icon} /><b>{item.label}</b></Link>)}
        <Link href="/pos/settings" aria-current={isMore ? 'page' : undefined}><Icon name="more" /><b>المزيد</b></Link>
      </nav> : null}
      <PosConfirmationDialog open={confirmOpen} loading={ending} onCancel={() => setConfirmOpen(false)} onConfirm={endSession} />
      <PosSaleHomeConfirmationDialog open={saleHomeConfirmOpen} onCancel={() => setSaleHomeConfirmOpen(false)} onConfirm={() => router.replace('/pos')} />
    </div>
  )
}

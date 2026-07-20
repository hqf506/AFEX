'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  DeveloperSupportNotifications,
  DeveloperSupportNotificationsProvider,
} from '@/components/developer-support-notifications'
import { MobileBottomNav } from '@/components/mobile/mobile-bottom-nav'
import { MobilePageHeader } from '@/components/mobile/mobile-primitives'
import { NavigationFeedback } from '@/components/navigation-feedback'

const DEVELOPER_PREFETCH_ROUTES = [
  '/developer',
  '/developer/support',
  '/developer/notifications',
] as const

const links = [
  ['نظرة عامة', '/developer'],
  ['المستخدمون', '/developer/users'],
  ['المنشآت', '/developer/tenants'],
  ['تذاكر العملاء', '/developer/support'],
  ['الإشعارات', '/developer/notifications'],
  ['سجل العمليات', '/developer/audit'],
  ['أدوات المطور', '/developer/tools'],
] as const

export function DeveloperShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [navigationOpen, setNavigationOpen] = useState(false)
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const navigationRef = useRef<HTMLElement | null>(null)
  const wide = pathname === '/developer/support' || pathname.startsWith('/developer/support/')
  const currentLabel = links.find(([, href]) => pathname === href || (href !== '/developer' && pathname.startsWith(`${href}/`)))?.[0] || 'مركز المطور'

  const openNavigation = (trigger: HTMLButtonElement) => {
    menuTriggerRef.current = trigger
    setNavigationOpen(true)
  }

  useEffect(() => {
    if (!navigationOpen) return

    const previousOverflow = document.body.style.overflow
    const menuTrigger = menuTriggerRef.current
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavigationOpen(false)
      if (event.key !== 'Tab') return
      const focusable = navigationRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
      menuTrigger?.focus()
    }
  }, [navigationOpen])

  const navigation = (onNavigate?: () => void) => (
    <>
      <div className="mb-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3">
        <p className="text-xs font-black text-emerald-200">AFEX DEVELOPER CENTER</p>
        <p className="mt-1 text-[11px] leading-5 text-slate-400">العمليات الحساسة مسجلة وآمنة</p>
      </div>
      <nav className="grid gap-1" aria-label="تنقل مركز المطور">
        {links.map(([label, href]) => {
          const active = pathname === href || (href !== '/developer' && pathname.startsWith(`${href}/`))
          return <Link key={href} href={href} onClick={onNavigate} className={`flex min-h-11 items-center rounded-xl border px-3 py-2.5 text-sm font-bold transition ${active ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100' : 'border-transparent text-slate-400 hover:bg-white/[0.05] hover:text-white'}`}>{label}</Link>
        })}
      </nav>
      <Link href="/" onClick={onNavigate} className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-3 py-2.5 text-center text-xs font-bold text-slate-300">العودة إلى AFEX</Link>
    </>
  )

  return (
    <DeveloperSupportNotificationsProvider>
      <div dir="rtl" className="min-h-screen bg-[#030714] text-white">
        <NavigationFeedback prefetchRoutes={DEVELOPER_PREFETCH_ROUTES} />
        <div className={`mx-auto grid w-full min-w-0 gap-4 p-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:p-4 md:pb-4 xl:grid-cols-[230px_minmax(0,1fr)] xl:px-5 xl:py-5 ${wide ? 'max-w-[1920px] 2xl:px-6' : 'max-w-[1700px]'}`}>
          <aside className="hidden min-w-0 xl:block">
            <div className="rounded-[24px] border border-cyan-300/15 bg-[#07111f]/90 p-3 backdrop-blur-xl xl:sticky xl:top-5">
              {navigation()}
            </div>
          </aside>

          <main className="min-w-0 w-full">
            <MobilePageHeader
              title={currentLabel}
              subtitle="AFEX Developer Center"
              leading={<button type="button" aria-label="فتح قائمة مركز المطور" aria-expanded={navigationOpen} aria-controls="developer-mobile-navigation" onClick={(event) => openNavigation(event.currentTarget)} className="grid size-11 shrink-0 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-100 outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40"><svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>}
              notification={<DeveloperSupportNotifications />}
              className="mb-3"
            />
            <header className="mb-4 hidden min-h-14 items-center justify-between gap-2 rounded-[20px] border border-white/10 bg-[#07111f]/80 px-3 py-2 backdrop-blur-xl md:flex">
              <button type="button" aria-label="فتح قائمة مركز المطور" aria-expanded={navigationOpen} aria-controls="developer-mobile-navigation" onClick={(event) => openNavigation(event.currentTarget)} className="grid size-11 shrink-0 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-100 outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40 xl:hidden"><svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
              <div className="mr-auto flex min-w-0 items-center gap-2"><span className="grid size-11 shrink-0 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-sm font-black text-emerald-200">AF</span><span className="min-w-0 leading-tight"><span className="block truncate text-xs font-black text-white">المطور</span><span className="mt-1 block text-[10px] font-bold text-slate-400">مالك المنصة</span></span></div>
              <DeveloperSupportNotifications />
            </header>
            {children}
          </main>
        </div>

        {navigationOpen ? <div className="fixed inset-0 z-[12000] xl:hidden"><button type="button" aria-label="إغلاق قائمة مركز المطور" className="absolute inset-0 h-full w-full bg-slate-950/75 backdrop-blur-sm" onClick={() => setNavigationOpen(false)} /><aside ref={navigationRef} id="developer-mobile-navigation" role="dialog" aria-modal="true" aria-label="قائمة مركز المطور" className="absolute inset-y-0 right-0 flex h-[100dvh] w-[min(88vw,360px)] flex-col border-l border-cyan-300/15 bg-[#07111f] p-3 shadow-[-24px_0_90px_rgba(0,0,0,0.5)]"><div className="mb-2 flex justify-end"><button type="button" autoFocus aria-label="إغلاق قائمة مركز المطور" onClick={() => setNavigationOpen(false)} className="grid size-11 place-items-center rounded-xl border border-white/10 bg-white/[0.045] text-2xl text-slate-200">×</button></div><div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-4">{navigation(() => setNavigationOpen(false))}</div></aside></div> : null}
        <MobileBottomNav
          ariaLabel="التنقل الرئيسي لمركز المطور"
          items={[
            { key: 'home', label: 'الرئيسية', href: '/developer', active: pathname === '/developer', icon: <span className="text-base">⌂</span> },
            { key: 'support', label: 'الدعم', href: '/developer/support', active: pathname.startsWith('/developer/support'), icon: <span className="text-base">◫</span> },
            { key: 'users', label: 'المستخدمون', href: '/developer/users', active: pathname.startsWith('/developer/users'), icon: <span className="text-base">♙</span> },
            { key: 'notifications', label: 'الإشعارات', href: '/developer/notifications', active: pathname.startsWith('/developer/notifications'), icon: <span className="text-base">♢</span> },
            { key: 'more', label: 'المزيد', active: navigationOpen, onSelect: openNavigation, icon: <span className="text-base">•••</span> },
          ]}
        />
      </div>
    </DeveloperSupportNotificationsProvider>
  )
}

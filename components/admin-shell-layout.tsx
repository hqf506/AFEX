'use client'

import Link from 'next/link'
import Image from 'next/image'
import {
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthState } from '@/components/auth-state-provider'
import { useAdminBranchFilter } from '@/hooks/use-admin-branch-filter'
import { usePageAccess } from '@/hooks/use-page-access'
import { canAccessAdminPath } from '@/lib/permissions'
import { supabase } from '@/lib/supabase/client'
import { MobileBottomNav } from '@/components/mobile/mobile-bottom-nav'
import { MobilePageHeader } from '@/components/mobile/mobile-primitives'

type AdminShellLayoutProps = {
  children: ReactNode
  isProvider: boolean
}

const LOGOUT_REDIRECT_SECONDS = 5

type NavChild = {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
}

type AdminNavItem = {
  label: string
  href: string
  roles: string[]
  exact?: boolean
  icon: ComponentType<{ className?: string }>
  providerOnly?: boolean
  children?: NavChild[]
}

function IconBase(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  )
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="11" width="7" height="10" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </IconBase>
  )
}

function ReportsIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M4 19h16" />
      <path d="M7 16V9" />
      <path d="M12 16V5" />
      <path d="M17 16v-3" />
    </IconBase>
  )
}

function ReceiptIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </IconBase>
  )
}

function OverviewIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </IconBase>
  )
}

function BoxIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M12 3 4 7l8 4 8-4-8-4Z" />
      <path d="M4 7v10l8 4 8-4V7" />
      <path d="M12 11v10" />
    </IconBase>
  )
}

function InventoryIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z" />
      <path d="M4 12l8 4.5 8-4.5" />
      <path d="M4 16.5 12 21l8-4.5" />
    </IconBase>
  )
}

function TagIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M20 10 10 20l-6-6L14 4h6v6Z" />
      <circle cx="17" cy="7" r="1" />
    </IconBase>
  )
}

function AnnouncementIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M4 13.5V9.8c0-.9.6-1.7 1.5-1.9L19 4v15L5.5 15.1A2 2 0 0 1 4 13.5Z" />
      <path d="M8 15.5 9.5 21h3L11 16.3" />
      <path d="M19 8.5a3.5 3.5 0 0 1 0 6.5" />
    </IconBase>
  )
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="3.5" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a3.5 3.5 0 0 1 0 6.74" />
    </IconBase>
  )
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M4 19V5" />
      <path d="M20 19V5" />
      <path d="M8 19v-6" />
      <path d="M12 19V9" />
      <path d="M16 19v-3" />
      <path d="M4 19h16" />
    </IconBase>
  )
}

function SupportIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M4 13v-2a8 8 0 0 1 16 0v2" />
      <path d="M4 13a2 2 0 0 1 2-2h1v6H6a2 2 0 0 1-2-2v-2Z" />
      <path d="M20 13a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2v-2Z" />
      <path d="M17 17c0 2-1.5 3-4 3h-1" />
    </IconBase>
  )
}

function CustomerTicketsIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M4 5h16v11H8l-4 4V5Z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </IconBase>
  )
}

function BranchesIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M4 20h16" />
      <path d="M6 20V8l6-4 6 4v12" />
      <path d="M10 20v-4h4v4" />
    </IconBase>
  )
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.64.27 1.06.9 1.06 1.6V11a2 2 0 1 1 0 4h-.09c-.7 0-1.33.42-1.6 1Z" />
    </IconBase>
  )
}

function PosIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 9h10" />
      <path d="M7 13h4" />
    </IconBase>
  )
}

function BackIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M15 18 9 12l6-6" />
      <path d="M9 12h10" />
    </IconBase>
  )
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </IconBase>
  )
}

const adminNavItems: AdminNavItem[] = [
  {
    label: 'لوحة التحكم',
    href: '/admin/dashboard',
    roles: ['admin', 'manager'],
    exact: true,
    icon: DashboardIcon,
  },
  {
    label: 'حالة الطلبات',
    href: '/admin/orders',
    roles: ['admin', 'manager', 'employee'],
    exact: true,
    icon: ReceiptIcon,
  },
  {
    label: 'الدعم الفني',
    href: '/admin/support',
    roles: ['admin', 'manager', 'employee'],
    icon: SupportIcon,
  },
  {
    label: 'تذاكر العملاء',
    href: '/provider/support',
    roles: ['admin', 'manager', 'employee'],
    icon: CustomerTicketsIcon,
    providerOnly: true,
  },
  {
    label: 'التقارير',
    href: '/admin/reports',
    roles: ['admin', 'manager', 'employee'],
    icon: ReportsIcon,
    children: [
      { label: 'نظرة عامة', href: '/admin/reports', icon: OverviewIcon },
      {
        label: 'المبيعات حسب العنصر',
        href: '/admin/reports/sales-by-item',
        icon: BoxIcon,
      },
      {
        label: 'المبيعات حسب الفئة',
        href: '/admin/reports/sales-by-category',
        icon: TagIcon,
      },
      {
        label: 'المبيعات حسب العميل',
        href: '/admin/reports/sales-by-customer',
        icon: UsersIcon,
      },
      {
        label: 'المبيعات حسب الموظف',
        href: '/admin/reports/sales-by-employee',
        icon: UsersIcon,
      },
      {
        label: 'الإيصالات',
        href: '/admin/receipts',
        icon: ReceiptIcon,
      },
      {
        label: 'اتجاه المبيعات',
        href: '/admin/reports/sales-trend',
        icon: ReportsIcon,
      },
    ],
  },
  {
    label: 'العناصر',
    href: '/admin/catalog',
    roles: ['admin', 'manager'],
    exact: true,
    icon: BoxIcon,
  },
  {
    label: 'الفئات',
    href: '/admin/categories',
    roles: ['admin', 'manager'],
    exact: true,
    icon: TagIcon,
  },
  {
    label: 'الخصومات',
    href: '/admin/discounts',
    roles: ['admin', 'manager'],
    exact: true,
    icon: TagIcon,
  },
  {
    label: 'الإعلانات',
    href: '/admin/announcements',
    roles: ['admin', 'manager', 'owner'],
    exact: true,
    icon: AnnouncementIcon,
  },
  {
    label: 'الضريبة - VAT',
    href: '/admin/vat',
    roles: ['admin', 'manager'],
    exact: true,
    icon: TagIcon,
  },
  {
    label: 'الفروع',
    href: '/admin/branches',
    roles: ['admin', 'manager'],
    exact: true,
    icon: BranchesIcon,
  },
  {
    label: 'المخزون',
    href: '/admin/inventory',
    roles: ['admin', 'manager'],
    icon: InventoryIcon,
    children: [
      {
        label: 'حركات المخزون',
        href: '/admin/inventory/movements',
        icon: ActivityIcon,
      },
    ],
  },
  {
    label: 'العملاء',
    href: '/admin/customers',
    roles: ['admin', 'manager'],
    exact: true,
    icon: UsersIcon,
  },
  {
    label: 'المستخدمون',
    href: '/admin/users',
    roles: ['admin', 'manager'],
    exact: true,
    icon: UsersIcon,
  },
  {
    label: 'سجل النشاط',
    href: '/admin/audit-logs',
    roles: ['admin', 'manager'],
    exact: true,
    icon: ActivityIcon,
  },
  {
    label: 'الإعدادات',
    href: '/admin/settings',
    roles: ['admin', 'manager'],
    exact: true,
    icon: SettingsIcon,
  },
]

function isPathActive(pathname: string, href: string, exact = false) {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavSectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 px-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
      {children}
    </p>
  )
}

type SidebarLinkProps = {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
  active: boolean
  compact?: boolean
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
  compact = false,
}: SidebarLinkProps) {
  return (
    <Link
      href={href}
      className={`group relative flex flex-row-reverse items-center justify-between gap-2.5 rounded-2xl px-3.5 py-3 text-sm font-bold transition-all duration-150 ${
        active
          ? 'border border-cyan-300/35 bg-cyan-300/10 text-cyan-50 shadow-[0_0_34px_rgba(34,211,238,0.18)]'
          : 'border border-transparent text-slate-400 hover:bg-white/[0.055] hover:text-white'
      } ${compact ? 'pe-5 text-sm' : ''}`}
    >
      {active ? (
        <span className="absolute right-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.9)]" />
      ) : null}
      <span className="flex-1 text-right">{label}</span>
      <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-cyan-200' : 'text-slate-500 group-hover:text-cyan-200'}`} />
    </Link>
  )
}

export function AdminShellLayout({ children, isProvider }: AdminShellLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [logoutOverlayVisible, setLogoutOverlayVisible] = useState(false)
  const [logoutSignedOut, setLogoutSignedOut] = useState(false)
  const [logoutCountdown, setLogoutCountdown] = useState(LOGOUT_REDIRECT_SECONDS)
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)
  const mobileMenuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const mobileNavigationRef = useRef<HTMLElement | null>(null)

  const authState = useAuthState()
  const access = usePageAccess([], logoutOverlayVisible ? pathname : '/')
  const {
    loading: authLoading,
    allowed,
    userRole,
    branchId,
    tenantId,
    scopeType,
  } = access

  useAdminBranchFilter(scopeType, branchId, !authLoading && allowed, tenantId)

  const visibleNavItems = useMemo(() => {
    if (!userRole) return []
    return adminNavItems
      .filter(
        (item) =>
          canAccessAdminPath(userRole, item.href) && (!item.providerOnly || isProvider)
      )
      .map((item) => ({
        ...item,
        children: item.children?.filter((child) =>
          canAccessAdminPath(userRole, child.href)
        ),
      }))
  }, [isProvider, userRole])

  useEffect(() => {
    if (authLoading || !allowed || !userRole || !pathname) {
      return
    }

    if (!canAccessAdminPath(userRole, pathname)) {
      router.replace('/')
    }
  }, [allowed, authLoading, pathname, router, userRole])

  useEffect(() => {
    if (!mobileNavigationOpen) return

    const previousOverflow = document.body.style.overflow
    const menuTrigger = mobileMenuTriggerRef.current
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavigationOpen(false)
      if (event.key !== 'Tab') return
      const focusable = mobileNavigationRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
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
  }, [mobileNavigationOpen])

  const reportsItem = useMemo(
    () => visibleNavItems.find((item) => item.href === '/admin/reports'),
    [visibleNavItems]
  )

  const mainNavItems = useMemo(
    () =>
      visibleNavItems.filter((item) =>
        ['/admin/dashboard', '/admin/orders'].includes(item.href)
      ),
    [visibleNavItems]
  )

  const managementNavItems = useMemo(
    () =>
      visibleNavItems.filter(
        (item) =>
          !['/admin/dashboard', '/admin/orders', '/admin/reports'].includes(
            item.href
          )
      ),
    [visibleNavItems]
  )

  const profile = authState.profile
  const profileFullName = profile?.full_name?.trim() || ''
  const profileUsername =
    profile && 'username' in profile && typeof profile.username === 'string'
      ? profile.username.trim()
      : ''
  const firstName = profileFullName
    ? profileFullName.split(/\s+/)[0]
    : profileUsername || 'مستخدم'

  const activeNavItem = visibleNavItems.find((item) =>
    isPathActive(pathname, item.href, item.exact)
  )
  const activeNavChild = visibleNavItems
    .flatMap((item) => item.children || [])
    .find((item) => pathname === item.href)
  const mobilePageTitle = activeNavChild?.label || activeNavItem?.label || 'AFEX'
  const preferredMobileNavPaths = [
    '/admin/dashboard',
    '/admin/orders',
    '/admin/customers',
    '/admin/inventory',
  ]
  const fallbackMobileNavPaths = ['/admin/support', '/admin/reports']
  const mobilePrimaryNavItems = [
    ...preferredMobileNavPaths,
    ...fallbackMobileNavPaths,
  ]
    .flatMap((href) => {
      const item = visibleNavItems.find((entry) => entry.href === href)
      return item ? [item] : []
    })
    .filter((item, index, items) => items.findIndex((entry) => entry.href === item.href) === index)
    .slice(0, 4)
  const mobileSettingsItem = visibleNavItems.find((item) => item.href === '/admin/settings')

  const openMobileNavigation = (trigger: HTMLButtonElement) => {
    mobileMenuTriggerRef.current = trigger
    setMobileNavigationOpen(true)
  }

  useEffect(() => {
    if (!logoutSignedOut) {
      return
    }

    const intervalId = window.setInterval(() => {
      setLogoutCountdown((current) => Math.max(1, current - 1))
    }, 1000)

    const redirectTimeoutId = window.setTimeout(() => {
      router.replace('/')
    }, LOGOUT_REDIRECT_SECONDS * 1000)

    return () => {
      window.clearInterval(intervalId)
      window.clearTimeout(redirectTimeoutId)
    }
  }, [logoutSignedOut, router])

  const handleLogout = async () => {
    if (logoutOverlayVisible) {
      return
    }

    setLogoutOverlayVisible(true)
    setLogoutCountdown(LOGOUT_REDIRECT_SECONDS)
    await supabase.auth.signOut()
    setLogoutSignedOut(true)
  }

  if (authLoading && !logoutOverlayVisible) {
    return (
      <div className="min-h-screen bg-[#030714] text-white">
        <div className="page-wrap">
          <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 text-slate-200">
            جارٍ التحقق من الصلاحية...
          </div>
        </div>
      </div>
    )
  }

  if (!allowed && !logoutOverlayVisible) {
    return (
      <div className="min-h-screen bg-[#030714] text-white">
        <div className="page-wrap">
          <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 text-slate-200">
            لا تملك صلاحية فتح هذه الصفحة. سيتم إعادتك إلى الصفحة الرئيسية.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#030714] text-white">
      <div className="pointer-events-none fixed inset-0 -z-0">
        <div className="absolute right-[-10rem] top-[-10rem] h-[32rem] w-[32rem] rounded-full bg-cyan-400/14 blur-[120px]" />
        <div className="absolute left-[-12rem] bottom-[-12rem] h-[34rem] w-[34rem] rounded-full bg-emerald-400/10 blur-[130px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />
      </div>
      <div className="relative z-10 w-full px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-3 sm:px-4 md:pb-5 xl:px-8 xl:py-6">
        <MobilePageHeader
          title={mobilePageTitle}
          subtitle={`مرحباً، ${firstName}`}
          leading={
            <button type="button" aria-label="فتح قائمة التنقل" aria-expanded={mobileNavigationOpen} aria-controls="admin-mobile-navigation" onClick={(event) => openMobileNavigation(event.currentTarget)} className="grid size-11 shrink-0 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-100 outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40"><svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
          }
          action={<Image src="/brand/afex-logo.png" alt="AFEX" width={720} height={260} priority className="h-8 w-auto object-contain" />}
          className="mb-3"
        />
        <header className="mb-4 hidden min-h-14 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#07111f]/90 px-3 py-2 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl md:flex xl:hidden">
          <Image src="/brand/afex-logo.png" alt="AFEX" width={720} height={260} priority className="h-9 w-auto object-contain" />
          <button type="button" aria-label="فتح قائمة التنقل" aria-expanded={mobileNavigationOpen} aria-controls="admin-mobile-navigation" onClick={(event) => openMobileNavigation(event.currentTarget)} className="grid size-11 shrink-0 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-100 outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40"><svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
        </header>
        {mobileNavigationOpen ? <button type="button" aria-label="إغلاق قائمة التنقل" className="fixed inset-0 z-[11999] h-full w-full bg-slate-950/75 backdrop-blur-sm xl:hidden" onClick={() => setMobileNavigationOpen(false)} /> : null}
        <div className="grid min-w-0 gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside ref={mobileNavigationRef} id="admin-mobile-navigation" role={mobileNavigationOpen ? 'dialog' : undefined} aria-modal={mobileNavigationOpen ? true : undefined} aria-label="قائمة التنقل" onClick={(event) => { if (mobileNavigationOpen && (event.target as HTMLElement).closest('a')) setMobileNavigationOpen(false) }} className={`${mobileNavigationOpen ? 'fixed inset-y-0 right-0 z-[12000] block h-[100dvh] w-[min(88vw,360px)] overflow-y-auto overscroll-contain border-l border-cyan-300/15 bg-[#07111f] p-3 shadow-[-24px_0_90px_rgba(0,0,0,0.5)]' : 'hidden'} min-w-0 xl:static xl:block xl:h-auto xl:w-[300px] xl:min-w-[300px] xl:overflow-visible xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none`}>
            <div className="rounded-[30px] border border-white/10 bg-[#07111f]/86 p-4 text-right shadow-[0_28px_110px_rgba(0,0,0,0.35)] backdrop-blur-xl xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto">
              {mobileNavigationOpen ? <div className="mb-2 flex justify-end xl:hidden"><button type="button" autoFocus onClick={() => setMobileNavigationOpen(false)} aria-label="إغلاق قائمة التنقل" className="grid size-11 place-items-center rounded-xl border border-white/10 bg-white/[0.045] text-2xl text-slate-200">×</button></div> : null}
              <div className="mb-7 space-y-4">
                <Image
                  src="/brand/afex-logo.png"
                  alt="AFEX"
                  width={720}
                  height={260}
                  priority
                  className="h-14 w-auto shrink-0 object-contain drop-shadow-[0_0_22px_rgba(45,212,191,0.22)]"
                />
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-3">
                  <div className="min-w-0 text-right">
                    <p className="text-xs font-bold text-slate-500">
                      مرحباً بك
                    </p>
                    <p className="mt-1 truncate text-base font-black text-white">
                      مرحباً،{' '}
                      <span className="bg-gradient-to-l from-cyan-200 to-emerald-200 bg-clip-text text-transparent">
                        {firstName}
                      </span>
                    </p>
                  </div>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cyan-300/25 bg-[#06111f] text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.15)]">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="8" r="4" />
                      <path d="M5 21a7 7 0 0 1 14 0" />
                    </svg>
                  </span>
                </div>
              </div>

              <nav className="space-y-5 text-right">
                <div className="space-y-1">
                  <NavSectionTitle>الرئيسية</NavSectionTitle>
                  <div className="space-y-1">
                    {mainNavItems.map((item) => (
                      <SidebarLink
                        key={item.href}
                        href={item.href}
                        label={item.label}
                        icon={item.icon}
                        active={isPathActive(pathname, item.href, item.exact)}
                      />
                    ))}
                  </div>
                </div>

                {reportsItem?.children?.length ? (
                  <div className="space-y-1">
                    <NavSectionTitle>التقارير</NavSectionTitle>
                    <div className="space-y-1">
                      {reportsItem.children.map((child) => (
                        <SidebarLink
                          key={child.href}
                          href={child.href}
                          label={child.label}
                          icon={child.icon}
                          active={pathname === child.href}
                          compact
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="space-y-1">
                  <NavSectionTitle>الإدارة</NavSectionTitle>
                  <div className="space-y-1">
                    {managementNavItems.map((item) => {
                      const itemActive = isPathActive(
                        pathname,
                        item.href,
                        item.exact
                      )

                      return (
                        <div key={item.href} className="space-y-1">
                          <SidebarLink
                            href={item.href}
                            label={item.label}
                            icon={item.icon}
                            active={itemActive}
                          />
                          {item.children?.length && itemActive ? (
                            <div className="space-y-1 pr-3">
                              {item.children.map((child) => (
                                <SidebarLink
                                  key={child.href}
                                  href={child.href}
                                  label={child.label}
                                  icon={child.icon}
                                  active={pathname === child.href}
                                  compact
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </nav>

              <div className="mt-5 space-y-1">
                <NavSectionTitle>اختصارات</NavSectionTitle>
                <Link
                  href="/pos"
                  className="flex flex-row-reverse items-center justify-between gap-2.5 rounded-2xl border border-transparent px-3.5 py-3 text-sm font-bold text-slate-400 transition-all duration-150 hover:bg-white/[0.055] hover:text-white"
                >
                  <span className="flex-1 text-right">نقطة البيع</span>
                  <PosIcon className="h-5 w-5 shrink-0 text-slate-500" />
                </Link>
                <Link
                  href="/"
                  className="flex flex-row-reverse items-center justify-between gap-2.5 rounded-2xl border border-transparent px-3.5 py-3 text-sm font-bold text-slate-400 transition-all duration-150 hover:bg-white/[0.055] hover:text-white"
                >
                  <span className="flex-1 text-right">العودة</span>
                  <BackIcon className="h-5 w-5 shrink-0 text-slate-500" />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavigationOpen(false)
                    void handleLogout()
                  }}
                  disabled={logoutOverlayVisible}
                  className="mt-4 flex w-full flex-row-reverse items-center justify-between gap-2.5 rounded-2xl border border-red-400/25 bg-red-500/10 px-3.5 py-3 text-sm font-black text-red-300 transition-all duration-150 hover:bg-red-500/15"
                >
                  <span className="flex-1 text-right">تسجيل الخروج</span>
                  <LogoutIcon className="h-5 w-5 shrink-0 text-red-300" />
                </button>
              </div>
            </div>
          </aside>

          <main className="min-w-0 w-full text-right">{children}</main>
        </div>
      </div>

      <MobileBottomNav
        ariaLabel="التنقل الرئيسي للوحة الإدارة"
        items={[
          ...mobilePrimaryNavItems.map((item) => ({
            key: item.href,
            label: item.href === '/admin/dashboard' ? 'الرئيسية' : item.label,
            href: item.href,
            icon: createElement(item.icon, { className: 'size-5' }),
            active: isPathActive(pathname, item.href, item.exact),
          })),
          ...(mobileSettingsItem ? [{
            key: mobileSettingsItem.href,
            label: mobileSettingsItem.label,
            href: mobileSettingsItem.href,
            icon: createElement(mobileSettingsItem.icon, { className: 'size-5' }),
            active: isPathActive(pathname, mobileSettingsItem.href, mobileSettingsItem.exact),
          }] : []),
        ]}
      />

      {logoutOverlayVisible ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 text-right backdrop-blur-md">
          <div className="animate-[logout-pop_320ms_ease-out] rounded-[30px] border border-cyan-300/20 bg-[#07111f] px-7 py-8 text-center shadow-[0_30px_110px_rgba(0,0,0,0.62),0_0_70px_rgba(34,211,238,0.16)]">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-300/10 text-emerald-200 shadow-[0_0_34px_rgba(52,211,153,0.2)]">
              <LogoutIcon className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-black text-white">تم تسجيل خروجك</h2>
            <p className="mt-3 text-sm font-bold text-slate-400">
              سيتم توجيهك إلى الصفحة الرئيسية خلال {logoutCountdown} ثوانٍ
            </p>
            <div className="mx-auto mt-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-3xl font-black text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_35px_rgba(34,211,238,0.16)]">
              {logoutCountdown}s
            </div>
            <style jsx>{`
              @keyframes logout-pop {
                from {
                  opacity: 0;
                  transform: translateY(10px) scale(0.96);
                }
                to {
                  opacity: 1;
                  transform: translateY(0) scale(1);
                }
              }
            `}</style>
          </div>
        </div>
      ) : null}
    </div>
  )
}



'use client'

import Link from 'next/link'
import Image from 'next/image'
import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthState } from '@/components/auth-state-provider'
import { useAdminBranchFilter } from '@/hooks/use-admin-branch-filter'
import { usePageAccess, type AppRole } from '@/hooks/use-page-access'
import { supabase } from '@/lib/supabase/client'

type AdminShellLayoutProps = {
  children: ReactNode
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
  roles: AppRole[]
  exact?: boolean
  icon: ComponentType<{ className?: string }>
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

function TagIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M20 10 10 20l-6-6L14 4h6v6Z" />
      <circle cx="17" cy="7" r="1" />
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
    roles: ['admin'],
    exact: true,
    icon: DashboardIcon,
  },
  {
    label: 'حالة الطلبات',
    href: '/admin/orders',
    roles: ['admin', 'employee'],
    exact: true,
    icon: ReceiptIcon,
  },
  {
    label: 'التقارير',
    href: '/admin/reports',
    roles: ['admin'],
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
    roles: ['admin'],
    exact: true,
    icon: BoxIcon,
  },
  {
    label: 'الفئات',
    href: '/admin/categories',
    roles: ['admin'],
    exact: true,
    icon: TagIcon,
  },
  {
    label: 'الخصومات',
    href: '/admin/discounts',
    roles: ['admin'],
    exact: true,
    icon: TagIcon,
  },
  {
    label: 'الضريبة - VAT',
    href: '/admin/vat',
    roles: ['admin'],
    exact: true,
    icon: TagIcon,
  },
  {
    label: 'الفروع',
    href: '/admin/branches',
    roles: ['admin'],
    exact: true,
    icon: BranchesIcon,
  },
  {
    label: 'المستخدمون',
    href: '/admin/users',
    roles: ['admin'],
    exact: true,
    icon: UsersIcon,
  },
  {
    label: 'سجل النشاط',
    href: '/admin/audit-logs',
    roles: ['admin'],
    exact: true,
    icon: ActivityIcon,
  },
  {
    label: 'الإعدادات',
    href: '/admin/settings',
    roles: ['admin'],
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

export function AdminShellLayout({ children }: AdminShellLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [logoutOverlayVisible, setLogoutOverlayVisible] = useState(false)
  const [logoutSignedOut, setLogoutSignedOut] = useState(false)
  const [logoutCountdown, setLogoutCountdown] = useState(LOGOUT_REDIRECT_SECONDS)

  const authState = useAuthState()
  const access = usePageAccess([], logoutOverlayVisible ? pathname : '/')
  const {
    loading: authLoading,
    allowed,
    userRole,
    branchId,
    scopeType,
  } = access

  useAdminBranchFilter(scopeType, branchId, !authLoading && allowed)

  const visibleNavItems = useMemo(() => {
    if (!userRole) return []
    return adminNavItems.filter((item) => item.roles.includes(userRole))
  }, [userRole])

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
            جارٍ التحويل...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#030714] text-white">
      <div className="pointer-events-none fixed inset-0 -z-0">
        <div className="absolute right-[-10rem] top-[-10rem] h-[32rem] w-[32rem] rounded-full bg-cyan-400/14 blur-[120px]" />
        <div className="absolute left-[-12rem] bottom-[-12rem] h-[34rem] w-[34rem] rounded-full bg-emerald-400/10 blur-[130px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />
      </div>
      <div className="relative z-10 w-full px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6 xl:px-8">
        <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="w-full xl:w-[300px] xl:min-w-[300px]">
            <div className="sticky top-4 rounded-[30px] border border-white/10 bg-[#07111f]/86 p-4 text-right shadow-[0_28px_110px_rgba(0,0,0,0.35)] backdrop-blur-xl">
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
                  <NavSectionTitle>MAIN</NavSectionTitle>
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
                    {managementNavItems.map((item) => (
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
              </nav>

              <div className="mt-5 space-y-1">
                <NavSectionTitle>ACTIONS</NavSectionTitle>
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
                  onClick={handleLogout}
                  disabled={logoutOverlayVisible}
                  className="mt-4 flex w-full flex-row-reverse items-center justify-between gap-2.5 rounded-2xl border border-red-400/25 bg-red-500/10 px-3.5 py-3 text-sm font-black text-red-300 transition-all duration-150 hover:bg-red-500/15"
                >
                  <span className="flex-1 text-right">تسجيل الخروج</span>
                  <LogoutIcon className="h-5 w-5 shrink-0 text-red-300" />
                </button>
              </div>
            </div>
          </aside>

          <main className="min-w-0 text-right">{children}</main>
        </div>
      </div>

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



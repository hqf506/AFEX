'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AdminBranchFilter } from '@/components/admin-branch-filter'
import { useAdminBranchFilter } from '@/hooks/use-admin-branch-filter'
import { usePageAccess } from '@/hooks/use-page-access'
import { SummaryRow } from '@/components/summary-row'
import { supabase } from '@/lib/supabase/client'
import { useSystemSettings } from '@/hooks/use-system-settings'

type Role = 'admin' | 'employee' | 'cashier'
type WorkspaceKey =
  | 'home'
  | 'dashboard'
  | 'dashboard-system-summary'
  | 'customers'
  | 'orders'
  | 'orders-latest'
  | 'orders-status'
  | 'orders-summary'
  | 'orders-activity'
  | 'orders-cash'
  | 'reports'
  | 'reports-summary'
  | 'reports-daily'
  | 'reports-monthly'
  | 'users'
  | 'branches'
  | 'invoice'
  | 'settings'

type SidebarItem = {
  key: WorkspaceKey
  label: string
  path?: string
  roles: Role[]
  enabled?: boolean
}

const highlights = [
  'واتساب تلقائي للعملاء',
  'طباعة حرارية مباشرة',
  'تتبع حالات الطلبات',
  'دفع كاش / شبكة / تحويل',
]

export default function HomePage() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const access = usePageAccess(['admin', 'employee', 'cashier'])

  const authLoading = access.loading
  const allowed = access.allowed
  const role = access.userRole as Role | null
  const branchId = access.branchId
  const scopeType = access.scopeType
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceKey>('home')
  const [iframeLoading, setIframeLoading] = useState(false)

  const [dashboardMenuOpen, setDashboardMenuOpen] = useState(false)
  const [ordersMenuOpen, setOrdersMenuOpen] = useState(false)
  const [reportsMenuOpen, setReportsMenuOpen] = useState(false)

  const { settings, loading: settingsLoading } = useSystemSettings(!authLoading)
  const {
    isSystemAdmin,
    branches,
    loadingBranches,
    selectedBranchId,
    selectedBranchName,
    setSelectedBranchId,
  } = useAdminBranchFilter(scopeType, branchId, !authLoading && allowed)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const roleLabel = access.roleLabel

  const storeName = settings?.store_name?.trim() || 'Leather Fix ERP'
  const branchName = settings?.branch_name?.trim() || 'الفرع الرئيسي'
  const displayedBranchName = isSystemAdmin ? selectedBranchName : branchName

  const systemStatus = useMemo<Record<string, boolean>>(
    () => ({
      'لوحة التحكم': true,
      'الطلبات': settings?.enable_orders ?? true,
      'الفواتير': settings?.enable_invoices ?? true,
      POS: settings?.enable_pos ?? true,
      'التقارير': settings?.enable_reports ?? true,
      'المستخدمون': settings?.enable_users ?? true,
      'الواتساب': settings?.enable_whatsapp ?? true,
      'الطباعة': settings?.enable_printing ?? true,
    }),
    [settings]
  )

  const allSidebarItems = useMemo<SidebarItem[]>(() => {
    return [
      {
        key: 'home',
        label: 'الرئيسية',
        roles: ['admin', 'employee', 'cashier'],
        enabled: true,
      },
      {
        key: 'dashboard',
        label: 'لوحة التحكم',
        roles: ['admin'],
        enabled: true,
      },
      {
        key: 'dashboard-system-summary',
        label: 'ملخص النظام',
        roles: ['admin'],
        enabled: true,
      },
      {
        key: 'invoice',
        label: 'الفواتير',
        path: '/invoice/new',
        roles: ['admin', 'employee', 'cashier'],
        enabled: settings?.enable_invoices ?? true,
      },
      {
        key: 'customers',
        label: 'العملاء',
        path: '/customers',
        roles: ['admin', 'employee', 'cashier'],
        enabled: true,
      },
      {
        key: 'orders',
        label: 'إدارة الطلبات',
        path: '/orders',
        roles: ['admin'],
        enabled: settings?.enable_orders ?? true,
      },
      {
        key: 'orders-latest',
        label: 'آخر الطلبات',
        path: '/admin/dashboard?section=latest',
        roles: ['admin'],
        enabled: settings?.enable_orders ?? true,
      },
      {
        key: 'orders-status',
        label: 'حالة الطلبات',
        path: '/admin/dashboard?section=status',
        roles: ['admin'],
        enabled: settings?.enable_orders ?? true,
      },
      {
        key: 'orders-summary',
        label: 'ملخص سريع',
        path: '/admin/dashboard?section=summary',
        roles: ['admin'],
        enabled: settings?.enable_orders ?? true,
      },
      {
        key: 'orders-activity',
        label: 'النشاط الأخير',
        path: '/admin/dashboard?section=activity',
        roles: ['admin'],
        enabled: settings?.enable_orders ?? true,
      },
      {
        key: 'orders-cash',
        label: 'النقدية',
        path: '/admin/dashboard?section=cash',
        roles: ['admin', 'employee'],
        enabled: settings?.enable_orders ?? true,
      },
      {
        key: 'reports',
        label: 'التقارير',
        roles: ['admin'],
        enabled: settings?.enable_reports ?? true,
      },
      {
        key: 'reports-summary',
        label: 'ملخص التقارير',
        path: '/admin/reports',
        roles: ['admin'],
        enabled: settings?.enable_reports ?? true,
      },
      {
        key: 'reports-daily',
        label: 'التقرير اليومي',
        path: '/admin/reports',
        roles: ['admin'],
        enabled: settings?.enable_reports ?? true,
      },
      {
        key: 'reports-monthly',
        label: 'التقرير الشهري',
        path: '/admin/reports',
        roles: ['admin'],
        enabled: settings?.enable_reports ?? true,
      },
      {
        key: 'users',
        label: 'المستخدمون',
        path: '/admin/users',
        roles: ['admin'],
        enabled: settings?.enable_users ?? true,
      },
      {
        key: 'branches',
        label: 'إدارة الفروع',
        path: '/admin/branches',
        roles: ['admin'],
        enabled: true,
      },
      {
        key: 'settings',
        label: 'إعدادات النظام',
        path: '/admin/settings',
        roles: ['admin'],
        enabled: true,
      },
    ]
  }, [settings])

  const canAccess = (
    roles: Role[],
    currentRole: Role | null,
    enabled = true
  ) => {
    if (!currentRole) return false
    if (!enabled) return false
    return roles.includes(currentRole)
  }

  const activeWorkspacePath = useMemo(() => {
    return allSidebarItems.find((item) => item.key === activeWorkspace)?.path
  }, [allSidebarItems, activeWorkspace])

  const activeWorkspaceTitle = useMemo(() => {
    return (
      allSidebarItems.find((item) => item.key === activeWorkspace)?.label ||
      'الرئيسية'
    )
  }, [allSidebarItems, activeWorkspace])

  const getEmbeddedDashboardSectionTitle = (
    key: WorkspaceKey
  ): string | null => {
    if (key === 'orders-latest') return 'آخر الطلبات'
    if (key === 'orders-status') return 'حالة الطلبات'
    if (key === 'orders-summary') return 'ملخص سريع'
    if (key === 'orders-activity') return 'النشاط الأخير'
    if (key === 'orders-cash') return 'النقدية'
    return null
  }

  const isolateIframeDashboardSection = () => {
    const iframe = iframeRef.current
    if (!iframe) return
    if (!activeWorkspacePath?.startsWith('/admin/dashboard')) return

    const targetTitle = getEmbeddedDashboardSectionTitle(activeWorkspace)
    if (!targetTitle) return

    const doc =
      iframe.contentDocument || iframe.contentWindow?.document || null
    if (!doc) return

    try {
      const headings = Array.from(
        doc.querySelectorAll('h1, h2, h3, h4')
      ) as HTMLElement[]

      let targetCard: HTMLElement | null = null

      for (const heading of headings) {
        const text = heading.textContent?.trim() || ''
        if (!text.includes(targetTitle)) continue

        const card = heading.closest('.page-card') as HTMLElement | null
        if (card) {
          targetCard = card
          break
        }
      }

      if (!targetCard) return

      const clonedCard = targetCard.cloneNode(true) as HTMLElement

      const body = doc.body
      if (!body) return

      body.innerHTML = ''
      body.style.margin = '0'
      body.style.padding = '0'
      body.style.background = 'transparent'
      body.style.overflow = 'hidden'

      const wrapper = doc.createElement('div')
      wrapper.style.padding = '0'
      wrapper.style.margin = '0'
      wrapper.style.width = '100%'
      wrapper.style.background = 'transparent'

      clonedCard.style.margin = '0'
      clonedCard.style.width = '100%'
      clonedCard.style.boxShadow = 'none'
      clonedCard.style.border = '0'
      clonedCard.style.background = 'transparent'
      clonedCard.style.padding = '0'

      wrapper.appendChild(clonedCard)
      body.appendChild(wrapper)
    } catch (error) {
      console.error('Isolate iframe dashboard section error:', error)
    }
  }

  useEffect(() => {
    if (activeWorkspace === 'home') {
      const timeoutId = window.setTimeout(() => {
        setIframeLoading(false)
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }

    if (activeWorkspacePath) {
      const timeoutId = window.setTimeout(() => {
        setIframeLoading(true)
      }, 0)
      return () => window.clearTimeout(timeoutId)
    } else {
      const timeoutId = window.setTimeout(() => {
        setIframeLoading(false)
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }
  }, [activeWorkspace, activeWorkspacePath])

  useEffect(() => {
    if (!role) return

    const allowedKeys = allSidebarItems
      .filter((item) => item.roles.includes(role) && (item.enabled ?? true))
      .map((item) => item.key)

    if (!allowedKeys.includes(activeWorkspace)) {
      const timeoutId = window.setTimeout(() => {
        setActiveWorkspace('home')
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }
  }, [role, allSidebarItems, activeWorkspace])

  useEffect(() => {
    const dashboardKeys: WorkspaceKey[] = [
      'dashboard',
      'dashboard-system-summary',
    ]

    const ordersKeys: WorkspaceKey[] = [
      'orders',
      'orders-latest',
      'orders-status',
      'orders-summary',
      'orders-activity',
      'orders-cash',
    ]

    const reportsKeys: WorkspaceKey[] = [
      'reports',
      'reports-summary',
      'reports-daily',
      'reports-monthly',
    ]

    if (dashboardKeys.includes(activeWorkspace)) {
      const timeoutId = window.setTimeout(() => {
        setDashboardMenuOpen(true)
        setOrdersMenuOpen(false)
        setReportsMenuOpen(false)
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }

    if (ordersKeys.includes(activeWorkspace)) {
      const timeoutId = window.setTimeout(() => {
        setOrdersMenuOpen(true)
        setDashboardMenuOpen(false)
        setReportsMenuOpen(false)
      }, 0)
      return () => window.clearTimeout(timeoutId)
      return
    }

    if (reportsKeys.includes(activeWorkspace)) {
      const timeoutId = window.setTimeout(() => {
        setReportsMenuOpen(true)
        setDashboardMenuOpen(false)
        setOrdersMenuOpen(false)
      }, 0)
      return () => window.clearTimeout(timeoutId)
      return
    }

    const timeoutId = window.setTimeout(() => {
      setDashboardMenuOpen(false)
      setOrdersMenuOpen(false)
      setReportsMenuOpen(false)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [activeWorkspace])

  const openWorkspace = (key: WorkspaceKey) => {
    const target = allSidebarItems.find((item) => item.key === key)
    if (!target || !(target.enabled ?? true)) return
    setActiveWorkspace(key)
  }

  const openDashboardMenu = () => {
    const dashboardWorkspaceKeys: WorkspaceKey[] = [
      'dashboard',
      'dashboard-system-summary',
    ]

    if (dashboardMenuOpen && dashboardWorkspaceKeys.includes(activeWorkspace)) {
      setDashboardMenuOpen(false)
      setActiveWorkspace('home')
      return
    }

    setDashboardMenuOpen(true)
    setOrdersMenuOpen(false)
    setReportsMenuOpen(false)
    setActiveWorkspace('dashboard-system-summary')
  }

  const openOrdersMenu = () => {
    if (!(settings?.enable_orders ?? true)) return

    const orderWorkspaceKeys: WorkspaceKey[] = [
      'orders',
      'orders-latest',
      'orders-status',
      'orders-summary',
      'orders-activity',
      'orders-cash',
    ]

    if (ordersMenuOpen && orderWorkspaceKeys.includes(activeWorkspace)) {
      setOrdersMenuOpen(false)
      setActiveWorkspace('home')
      return
    }

    setOrdersMenuOpen(true)
    setDashboardMenuOpen(false)
    setReportsMenuOpen(false)
    setActiveWorkspace('orders')
  }

  const openReportsMenu = () => {
    if (!(settings?.enable_reports ?? true)) return

    const reportWorkspaceKeys: WorkspaceKey[] = [
      'reports',
      'reports-summary',
      'reports-daily',
      'reports-monthly',
    ]

    if (reportsMenuOpen && reportWorkspaceKeys.includes(activeWorkspace)) {
      setReportsMenuOpen(false)
      setActiveWorkspace('home')
      return
    }

    setReportsMenuOpen(true)
    setDashboardMenuOpen(false)
    setOrdersMenuOpen(false)
    setActiveWorkspace('reports-summary')
  }

  const renderSystemSummaryContent = () => {
    return (
      <div className="page-card !p-6 text-right">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-slate-900">
            ملخص النظام
          </h2>
          <span className="badge badge-blue">ERP</span>
        </div>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="grid gap-3 md:grid-cols-2">
            <SummaryRow label="اسم المحل" value={storeName} />
            <SummaryRow label="اسم الفرع" value={branchName} />
          </div>
        </div>

        <div className="space-y-3">
          {Object.entries(systemStatus).map(([label, enabled]) => (
            <div
              key={label}
              className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl border px-4 py-4 text-right ${
                enabled
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              <span
                className={`text-sm font-extrabold ${
                  enabled ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {enabled ? 'مفعلة' : 'متوقفة'}
              </span>

              <span className="text-sm font-semibold text-slate-700">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderHomeContent = () => {
    return (
      <div className="space-y-5 text-right">
        <div className="page-hero overflow-hidden text-right">
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="text-right">
              <h1 className="page-title text-right text-3xl md:text-4xl">
                نظام موحد لإدارة الطلبات والفواتير والتشغيل اليومي
              </h1>

              <p className="mt-4 max-w-[760px] text-right text-base leading-8 text-slate-600 md:text-lg">
                واجهة سريعة وواضحة للمحل تجمع بين لوحة التحكم، إدارة الطلبات،
                الفواتير، الطباعة الحرارية، وإرسال الواتساب في مكان واحد.
              </p>

              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <span className="badge badge-blue">{storeName}</span>
                <span className="badge badge-slate">{displayedBranchName}</span>
                <button
                  onClick={() => openWorkspace('customers')}
                  className="secondary-btn"
                  type="button"
                >
                  العملاء
                </button>
              </div>

              {isSystemAdmin ? (
                <div className="mt-4 flex justify-end">
                  <AdminBranchFilter
                    branches={branches}
                    selectedBranchId={selectedBranchId}
                    loading={loadingBranches}
                    onChange={setSelectedBranchId}
                    className="min-w-[240px]"
                  />
                </div>
              ) : null}

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                {role === 'admin' && (
                  <>
                    <button
                      onClick={openDashboardMenu}
                      className="primary-btn"
                      type="button"
                    >
                      دخول لوحة التحكم
                    </button>

                    {(settings?.enable_reports ?? true) && (
                      <button
                        onClick={openReportsMenu}
                        className="secondary-btn"
                        type="button"
                      >
                        فتح التقارير
                      </button>
                    )}

                    {(settings?.enable_users ?? true) && (
                      <button
                        onClick={() => openWorkspace('users')}
                        className="secondary-btn"
                        type="button"
                      >
                        إدارة المستخدمين
                      </button>
                    )}

                    <button
                      onClick={() => openWorkspace('branches')}
                      className="secondary-btn"
                      type="button"
                    >
                      إدارة الفروع
                    </button>

                    <button
                      onClick={() => openWorkspace('settings')}
                      className="secondary-btn"
                      type="button"
                    >
                      إعدادات النظام
                    </button>
                  </>
                )}

                {(role === 'admin' || role === 'employee') &&
                  (settings?.enable_orders ?? true) && (
                    <button
                      onClick={openOrdersMenu}
                      className="secondary-btn"
                      type="button"
                    >
                      فتح الطلبات
                    </button>
                  )}

                {(settings?.enable_invoices ?? true) && (
                  <button
                    onClick={() => openWorkspace('invoice')}
                    className="secondary-btn"
                    type="button"
                  >
                    بدء فاتورة جديدة
                  </button>
                )}
                <button
                  onClick={() => openWorkspace('customers')}
                  className="secondary-btn"
                  type="button"
                >
                  العملاء
                </button>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {highlights.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-right text-sm font-bold text-slate-700 md:text-base"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 text-right">
              <div className="page-card bg-slate-900 text-right text-white ring-0 shadow-none">
                <p className="text-sm font-bold text-slate-300">المشروع</p>
                <h2 className="mt-2 text-2xl font-extrabold">{storeName}</h2>
                <p className="mt-2 text-sm font-semibold text-slate-300">
                  {displayedBranchName}
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-300 md:text-base">
                  تصميم موحد وسريع للآيباد والكمبيوتر مع سهولة الوصول لكل أقسام
                  النظام من الصفحة الرئيسية.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="stat-card !p-5 text-right">
                  <p className="stat-label text-right">الصلاحية</p>
                  <p className="stat-value text-right">{roleLabel || '—'}</p>
                </div>

                <div className="stat-card !p-5 text-right">
                  <p className="stat-label text-right">التشغيل</p>
                  <p className="stat-value text-right">
                    {settingsLoading ? '...' : 'سريع'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="page-card !p-6 text-right">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-extrabold text-slate-900">
              ملخص النظام
            </h2>
            <span className="badge badge-blue">ERP</span>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <SummaryRow label="اسم المحل" value={storeName} />
            <SummaryRow label="اسم الفرع" value={displayedBranchName} />
          </div>

          <div className="space-y-3">
            {Object.entries(systemStatus).map(([label, enabled]) => (
              <div
                key={label}
                className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl border px-4 py-4 text-right ${
                  enabled
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-red-200 bg-red-50'
                }`}
              >
                <span
                  className={`text-sm font-extrabold ${
                    enabled ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {enabled ? 'مفعلة' : 'متوقفة'}
                </span>

                <span className="text-sm font-semibold text-slate-700">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const visibleSidebarItems = useMemo(() => {
    return allSidebarItems.filter((item) =>
      canAccess(item.roles, role, item.enabled ?? true)
    )
  }, [allSidebarItems, role])

  if (authLoading) {
    return (
      <div className="app-shell" dir="rtl">
        <div className="page-wrap">
          <div className="page-card text-right">جاري التحقق من الصلاحية...</div>
        </div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="app-shell" dir="rtl">
        <div className="page-wrap">
          <div className="page-card text-right">جارٍ التحويل...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell" dir="rtl">
      <div className="page-wrap text-right">
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2 text-right">
          <span className="badge badge-slate">{storeName}</span>
          <span className="badge badge-green">{displayedBranchName}</span>

          {isSystemAdmin ? (
            <AdminBranchFilter
              branches={branches}
              selectedBranchId={selectedBranchId}
              loading={loadingBranches}
              onChange={setSelectedBranchId}
            />
          ) : null}

          {roleLabel ? (
            <span className="badge badge-blue">الصلاحية: {roleLabel}</span>
          ) : (
            <span className="badge badge-slate">الصلاحية: غير معروفة</span>
          )}

          <button
            onClick={() => openWorkspace('home')}
            className="secondary-btn"
            type="button"
          >
            الصفحة الرئيسية
          </button>

          <button onClick={handleLogout} className="secondary-btn" type="button">
            تسجيل الخروج
          </button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="w-full xl:w-[280px] xl:min-w-[280px]">
            <div className="page-card !p-4 text-right" dir="rtl">
              <div className="mb-4 text-right">
                <p className="text-xs font-bold text-slate-400">Admin Panel</p>
                <h3 className="mt-1 text-2xl font-black text-slate-900">
                  {storeName}
                </h3>
                <p className="mt-2 text-sm leading-7 text-slate-500">
                  {displayedBranchName}
                </p>
              </div>

              <div className="space-y-2 text-right">
                <button
                  type="button"
                  onClick={() => openWorkspace('home')}
                  className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                    activeWorkspace === 'home'
                      ? 'bg-slate-950 text-white'
                      : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  <span className="shrink-0">•</span>
                  <span className="flex-1 text-right">الرئيسية</span>
                </button>

                {visibleSidebarItems.some((item) => item.key === 'dashboard') ? (
                  <>
                    <button
                      type="button"
                      onClick={openDashboardMenu}
                      className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                        activeWorkspace === 'dashboard' ||
                        activeWorkspace === 'dashboard-system-summary'
                          ? 'bg-slate-950 text-white'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      <span className="shrink-0">{dashboardMenuOpen ? '−' : '+'}</span>
                      <span className="flex-1 text-right">لوحة التحكم</span>
                    </button>

                    {dashboardMenuOpen ? (
                      <div className="space-y-2 pr-3 text-right">
                        <button
                          type="button"
                          onClick={() => openWorkspace('dashboard-system-summary')}
                          className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                            activeWorkspace === 'dashboard-system-summary'
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span className="shrink-0">•</span>
                          <span className="flex-1 text-right">ملخص النظام</span>
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {visibleSidebarItems.some((item) => item.key === 'invoice') ? (
                  <button
                    type="button"
                    onClick={() => openWorkspace('invoice')}
                    className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                      activeWorkspace === 'invoice'
                        ? 'bg-slate-950 text-white'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    <span className="shrink-0">•</span>
                    <span className="flex-1 text-right">الفواتير</span>
                  </button>
                ) : null}

                {visibleSidebarItems.some((item) => item.key === 'customers') ? (
                  <button
                    type="button"
                    onClick={() => openWorkspace('customers')}
                    className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                      activeWorkspace === 'customers'
                        ? 'bg-slate-950 text-white'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    <span className="shrink-0">•</span>
                    <span className="flex-1 text-right">العملاء</span>
                  </button>
                ) : null}

                {visibleSidebarItems.some((item) => item.key === 'orders') ? (
                  <>
                    <button
                      type="button"
                      onClick={openOrdersMenu}
                      className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                        activeWorkspace === 'orders' ||
                        activeWorkspace === 'orders-latest' ||
                        activeWorkspace === 'orders-status' ||
                        activeWorkspace === 'orders-summary' ||
                        activeWorkspace === 'orders-activity' ||
                        activeWorkspace === 'orders-cash'
                          ? 'bg-slate-950 text-white'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      <span className="shrink-0">{ordersMenuOpen ? '−' : '+'}</span>
                      <span className="flex-1 text-right">الطلبات</span>
                    </button>

                    {ordersMenuOpen ? (
                      <div className="space-y-2 pr-3 text-right">
                        <button
                          type="button"
                          onClick={() => openWorkspace('orders')}
                          className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                            activeWorkspace === 'orders'
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span className="shrink-0">•</span>
                          <span className="flex-1 text-right">إدارة الطلبات</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openWorkspace('orders-latest')}
                          className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                            activeWorkspace === 'orders-latest'
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span className="shrink-0">•</span>
                          <span className="flex-1 text-right">آخر الطلبات</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openWorkspace('orders-status')}
                          className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                            activeWorkspace === 'orders-status'
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span className="shrink-0">•</span>
                          <span className="flex-1 text-right">حالة الطلبات</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openWorkspace('orders-summary')}
                          className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                            activeWorkspace === 'orders-summary'
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span className="shrink-0">•</span>
                          <span className="flex-1 text-right">ملخص سريع</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openWorkspace('orders-activity')}
                          className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                            activeWorkspace === 'orders-activity'
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span className="shrink-0">•</span>
                          <span className="flex-1 text-right">النشاط الأخير</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openWorkspace('orders-cash')}
                          className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                            activeWorkspace === 'orders-cash'
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span className="shrink-0">•</span>
                          <span className="flex-1 text-right">النقدية</span>
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {visibleSidebarItems.some((item) => item.key === 'reports') ? (
                  <>
                    <button
                      type="button"
                      onClick={openReportsMenu}
                      className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                        activeWorkspace === 'reports' ||
                        activeWorkspace === 'reports-summary' ||
                        activeWorkspace === 'reports-daily' ||
                        activeWorkspace === 'reports-monthly'
                          ? 'bg-slate-950 text-white'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      <span className="shrink-0">{reportsMenuOpen ? '−' : '+'}</span>
                      <span className="flex-1 text-right">التقارير</span>
                    </button>

                    {reportsMenuOpen ? (
                      <div className="space-y-2 pr-3 text-right">
                        <button
                          type="button"
                          onClick={() => openWorkspace('reports-summary')}
                          className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                            activeWorkspace === 'reports-summary'
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span className="shrink-0">•</span>
                          <span className="flex-1 text-right">ملخص التقارير</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openWorkspace('reports-daily')}
                          className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                            activeWorkspace === 'reports-daily'
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span className="shrink-0">•</span>
                          <span className="flex-1 text-right">التقرير اليومي</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openWorkspace('reports-monthly')}
                          className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                            activeWorkspace === 'reports-monthly'
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span className="shrink-0">•</span>
                          <span className="flex-1 text-right">التقرير الشهري</span>
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {visibleSidebarItems.some((item) => item.key === 'users') ? (
                  <button
                    type="button"
                    onClick={() => openWorkspace('users')}
                    className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                      activeWorkspace === 'users'
                        ? 'bg-slate-950 text-white'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    <span className="shrink-0">•</span>
                    <span className="flex-1 text-right">المستخدمون</span>
                  </button>
                ) : null}

                {visibleSidebarItems.some((item) => item.key === 'branches') ? (
                  <button
                    type="button"
                    onClick={() => openWorkspace('branches')}
                    className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                      activeWorkspace === 'branches'
                        ? 'bg-slate-950 text-white'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    <span className="flex-1 text-right">إدارة الفروع</span>
                  </button>
                ) : null}

                {visibleSidebarItems.some((item) => item.key === 'settings') ? (
                  <button
                    type="button"
                    onClick={() => openWorkspace('settings')}
                    className={`flex w-full flex-row-reverse items-center justify-between rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                      activeWorkspace === 'settings'
                        ? 'bg-slate-950 text-white'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    <span className="shrink-0">•</span>
                    <span className="flex-1 text-right">إعدادات النظام</span>
                  </button>
                ) : null}
              </div>
            </div>
          </aside>

          <div className="min-w-0 space-y-5 text-right">
            <div className="page-card !p-5 md:!p-6 text-right">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-right">
                  <h2 className="text-right text-2xl font-extrabold text-slate-900">
                    {activeWorkspaceTitle}
                  </h2>
                  <p className="mt-1 text-right text-sm text-slate-500">
                    {activeWorkspace === 'home'
                      ? 'الواجهة الرئيسية للنظام'
                      : 'المحتوى يفتح هنا داخل نفس الصفحة'}
                  </p>
                </div>

                {activeWorkspace !== 'home' ? (
                  <button
                    type="button"
                    onClick={() => openWorkspace('home')}
                    className="secondary-btn"
                  >
                    الرجوع للرئيسية
                  </button>
                ) : null}
              </div>

              {activeWorkspace === 'home' ? (
                renderHomeContent()
              ) : activeWorkspace === 'dashboard-system-summary' ? (
                renderSystemSummaryContent()
              ) : activeWorkspacePath ? (
                <div className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                  {iframeLoading ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm">
                      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm">
                        جاري فتح {activeWorkspaceTitle}...
                      </div>
                    </div>
                  ) : null}

                  <iframe
                    ref={iframeRef}
                    key={`${activeWorkspace}-${activeWorkspacePath}`}
                    src={activeWorkspacePath}
                    title={activeWorkspaceTitle}
                    className="h-[1150px] w-full bg-white"
                    onLoad={() => {
                      setIframeLoading(false)
                      isolateIframeDashboardSection()
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


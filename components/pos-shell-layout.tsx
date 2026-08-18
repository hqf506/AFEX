'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthState } from '@/components/auth-state-provider'
import { FeatureDisabledState } from '@/components/feature-disabled-state'
import { PosTabletFrame } from '@/components/pos-tablet-frame'
import { PosResponsiveShell } from '@/components/pos-shell/pos-responsive-shell'
import { PosPreparingScreen } from '@/components/pos-preparing-screen'
import { useSystemSettings } from '@/hooks/use-system-settings'
import { canAccessPos } from '@/lib/permissions'
import {
  readActivePosEmployee,
  type ActivePosEmployee,
} from '@/lib/pos-employee-session'
import { syncPosOfflineDrafts } from '@/lib/pos-offline-draft'

type PosShellLayoutProps = {
  children: React.ReactNode
}

type CapacitorBridge = {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
}

function isCapacitorWebView() {
  if (typeof window === 'undefined') {
    return false
  }

  const capacitor = (window as typeof window & { Capacitor?: CapacitorBridge })
    .Capacitor

  if (capacitor?.isNativePlatform?.()) {
    return true
  }

  const platform = capacitor?.getPlatform?.()
  if (platform && platform !== 'web') {
    return true
  }

  return /Capacitor/i.test(window.navigator.userAgent)
}

function PosShellViewport({
  children,
  isLoginPage = false,
}: {
  children: React.ReactNode
  isLoginPage?: boolean
}) {
  useEffect(() => {
    if (!isCapacitorWebView()) {
      return
    }

    document.documentElement.classList.add('is-capacitor')
    document.body.classList.add('is-capacitor')

    return () => {
      document.documentElement.classList.remove('is-capacitor')
      document.body.classList.remove('is-capacitor')
    }
  }, [])

  return (
    <div className="pos-shell-viewport h-[100dvh] min-h-[100dvh] w-full max-w-full overflow-hidden">
      <div className="pos-shell-inner h-full min-h-0 w-full overflow-hidden px-0 py-0">
        {isLoginPage ? <PosTabletFrame isLoginPage>{children}</PosTabletFrame> : children}
      </div>
    </div>
  )
}

export function PosShellLayout({ children }: PosShellLayoutProps) {
  const pathname = usePathname()
  const isPosLoginPage = pathname?.startsWith('/pos/login') ?? false
  const isPosEmployeePinPage =
    pathname?.startsWith('/pos/employee-pin') ?? false

  if (isPosLoginPage) {
    return <PosShellViewport isLoginPage>{children}</PosShellViewport>
  }

  if (isPosEmployeePinPage) {
    return (
      <ProtectedPosShellLayout
        key="pin-entry"
        requireEmployee={false}
      >
        {children}
      </ProtectedPosShellLayout>
    )
  }

  return (
    <ProtectedPosShellLayout
      key="employee-required"
      requireEmployee
    >
      {children}
    </ProtectedPosShellLayout>
  )
}

function ProtectedPosShellLayout({
  children,
  requireEmployee = true,
}: PosShellLayoutProps & { requireEmployee?: boolean }) {
  const router = useRouter()
  const authState = useAuthState()
  const [retrying, setRetrying] = useState(false)
  const [employeeCheckReady, setEmployeeCheckReady] = useState(false)
  const [activeEmployee, setActiveEmployee] =
    useState<ActivePosEmployee | null>(null)
  const allowed = Boolean(
    authState.profile && canAccessPos(authState.profile.role)
  )
  const { settings, loading: settingsLoading } = useSystemSettings(
    !authState.loading && allowed
  )
  const hasAuthError = Boolean(authState.error)
  const isTimeoutError = authState.error === 'timeout'
  const isLockError = authState.error === 'auth-lock'

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!requireEmployee) {
        setActiveEmployee(null)
        setEmployeeCheckReady(true)
        return
      }

      setActiveEmployee(readActivePosEmployee())
      setEmployeeCheckReady(true)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [requireEmployee])

  useEffect(() => {
    if (authState.loading || authState.error) {
      return
    }

    if (!authState.profile || !allowed) {
      router.replace('/pos/login')
    }
  }, [allowed, authState.error, authState.loading, authState.profile, router])

  useEffect(() => {
    if (
      !requireEmployee ||
      authState.loading ||
      authState.error ||
      !allowed ||
      !employeeCheckReady
    ) {
      return
    }

    if (!activeEmployee) {
      router.replace('/pos/employee-pin')
    }
  }, [
    activeEmployee,
    allowed,
    authState.error,
    authState.loading,
    employeeCheckReady,
    requireEmployee,
    router,
  ])

  useEffect(() => {
    if (!authState.loading) {
      const timer = window.setTimeout(() => {
        setRetrying(false)
      }, 0)
      return () => window.clearTimeout(timer)
    }
  }, [authState.loading])

  useEffect(() => {
    if (
      !requireEmployee ||
      authState.loading ||
      authState.error ||
      !allowed ||
      !employeeCheckReady ||
      !activeEmployee
    ) {
      return
    }

    const handleOnline = () => {
      void syncPosOfflineDrafts()
    }

    window.addEventListener('online', handleOnline)

    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      void syncPosOfflineDrafts()
    }

    return () => {
      window.removeEventListener('online', handleOnline)
    }
  }, [
    activeEmployee,
    allowed,
    authState.error,
    authState.loading,
    employeeCheckReady,
    requireEmployee,
  ])

  const handleRetry = async () => {
    try {
      setRetrying(true)
      await authState.refreshAuthState()
    } finally {
      setRetrying(false)
    }
  }

  if (authState.loading || (requireEmployee && allowed && !employeeCheckReady)) {
    return (
      <PosShellViewport>
        <PosPreparingScreen />
      </PosShellViewport>
    )
  }

  if (hasAuthError) {
    return (
      <PosShellViewport>
        <div className="page-wrap">
          <div className="page-card mx-auto max-w-md space-y-4 text-right">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-900">
                تعذر تجهيز نقطة البيع
              </h2>
              <p className="text-sm text-slate-600">
                {isTimeoutError
                  ? 'استغرق التحقق من الجلسة وقتًا أطول من المتوقع. أعد المحاولة أو سجّل الدخول من جديد.'
                  : isLockError
                    ? 'حصل تعارض مؤقت أثناء تجهيز الجلسة. أعد المحاولة لاستكمال الدخول إلى نقطة البيع.'
                    : 'حدث خطأ أثناء تجهيز الجلسة. أعد المحاولة أو انتقل إلى تسجيل الدخول.'}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {retrying ? 'جار إعادة المحاولة...' : 'إعادة المحاولة'}
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/pos/login'
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                تسجيل الدخول
              </button>
            </div>
          </div>
        </div>
      </PosShellViewport>
    )
  }

  if (!allowed) {
    return (
      <PosShellViewport>
        <div className="page-wrap">
          <div className="page-card">جار التحويل...</div>
        </div>
      </PosShellViewport>
    )
  }

  if (requireEmployee && allowed && employeeCheckReady && !activeEmployee) {
    return (
      <PosShellViewport>
        <div className="page-wrap">
          <div className="page-card">جارٍ فتح شاشة رمز الموظف...</div>
        </div>
      </PosShellViewport>
    )
  }

  if (!settingsLoading && settings?.enable_pos === false) {
    return (
      <PosShellViewport>
        <div className="page-wrap">
          <FeatureDisabledState
            title="ميزة نقطة البيع غير مفعلة"
            message="تم تعطيل نقطة البيع من إعدادات النظام."
          />
        </div>
      </PosShellViewport>
    )
  }

  if (!requireEmployee) {
    return <PosShellViewport>{children}</PosShellViewport>
  }

  return (
    <PosShellViewport>
      <PosResponsiveShell>{children}</PosResponsiveShell>
    </PosShellViewport>
  )
}

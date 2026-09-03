'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useAuthState } from '@/components/auth-state-provider'
import { useSystemSettings } from '@/hooks/use-system-settings'
import { getClientErrorMessage } from '@/lib/api/client-error'
import { getRoleLabel } from '@/lib/app-roles'
import { canAccessPos } from '@/lib/permissions'
import { formatPosGregorianDate, formatPosTime } from '@/lib/pos/date-format'
import {
  hasPosLoggedOut,
  clearActivePosEmployee,
  readActivePosEmployee,
  writeActivePosEmployee,
  clearPosLoggedOut,
  type ActivePosEmployee,
} from '@/lib/pos-employee-session'
import { getCurrentPosDeviceLabel } from '@/lib/pos/device-label'
import { getPinIndicatorState } from '@/lib/pos/pin-indicators'
import { clearAllInvoiceCatalogCache } from '@/lib/invoices/catalog'
import { POS_UX_MESSAGES } from '@/lib/pos-ux-messages'
import { hasPersistedInvoiceSaleDraft } from '@/lib/invoices/sale-navigation'
import { PosLogoutRetentionDialog } from '@/components/pos-logout-retention-dialog'
import { completePosPinOfflineRecoveryGate } from '@/lib/offline/phase1'
import {
  enrollOnlineEmployeeForOffline,
  restorePreparedOfflineRuntime,
  verifyOfflineEmployeePin,
  type PreparedOfflineRuntime,
} from '@/lib/offline/complete-runtime'
import { buildScopedOnlinePinIdentification } from '@/lib/offline/employee-pin-selection'

const PIN_LENGTH = 4
const PIN_LOCK_ATTEMPTS = 3
const PIN_LOCK_MS = 5000
const PIN_CLEAR_AFTER_ERROR_MS = 500
const INVALID_PIN_MESSAGE = POS_UX_MESSAGES.wrongPin
const OFFLINE_PREPARATION_ERROR_MESSAGE =
  'تم التحقق من الرمز، لكن تعذر تجهيز وضع العمل دون اتصال. حاول مرة أخرى.'
const OFFLINE_RECOVERY_ERROR_MESSAGE =
  'تم التحقق من الرمز، لكن تعذر استعادة بيانات نقطة البيع المحلية بأمان. حاول مرة أخرى.'
const keypadDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

function EmployeeAvatarIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" className="h-10 w-10" aria-hidden="true">
      <circle cx="32" cy="22" r="11" fill="currentColor" />
      <path
        d="M15 52c2.8-10.3 9.4-15.4 17-15.4S46.2 41.7 49 52"
        fill="currentColor"
      />
    </svg>
  )
}

function SessionIcon({ type }: { type: 'branch' | 'date' | 'time' | 'device' }) {
  if (type === 'branch') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
        <path d="M4 9h16l-1.4-4H5.4L4 9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M5 9v10h14V9M8 19v-6h4v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 9c0 1.2 1 2.2 2.2 2.2S8.4 10.2 8.4 9c0 1.2 1 2.2 2.2 2.2s2.2-1 2.2-2.2c0 1.2 1 2.2 2.2 2.2s2.2-1 2.2-2.2c0 1.2 1 2.2 2.2 2.2S21.6 10.2 21.6 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }

  if (type === 'date') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
        <rect x="4" y="5" width="16" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M8 14h2M12 14h2M16 14h1M8 17h2M12 17h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (type === 'time') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
      <rect x="7" y="3" width="10" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 6h4M11 18h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function SessionInfoRow({
  icon,
  label,
  value,
}: {
  icon: 'branch' | 'date' | 'time' | 'device'
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 border-b border-cyan-200/10 py-2.5 last:border-b-0">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-cyan-300">
        <SessionIcon type={icon} />
      </div>
      <div className="min-w-0 text-right">
        <p className="text-[11px] font-bold text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-[13px] font-bold text-slate-100">{value}</p>
      </div>
    </div>
  )
}

export default function PosEmployeePinPage() {
  const router = useRouter()
  const redirectTargetRef =
    useRef<'/pos/login' | '/pos/offline-preparation' | '/pos' | null>(null)
  const authState = useAuthState()
  const verifyingPinRef = useRef('')
  const clearPinTimeoutRef = useRef<number | null>(null)
  const shakeTimeoutRef = useRef<number | null>(null)
  const lockTimeoutRef = useRef<number | null>(null)
  const verificationPausedRef = useRef(false)
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [locked, setLocked] = useState(false)
  const [shakeCard, setShakeCard] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [hasActiveSale, setHasActiveSale] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [offlineRuntime, setOfflineRuntime] =
    useState<PreparedOfflineRuntime | null>(null)
  const [offlineRuntimeChecked, setOfflineRuntimeChecked] = useState(false)

  const onlineAllowed = Boolean(
    authState.profile && canAccessPos(authState.profile.role)
  )
  const allowed = onlineAllowed || Boolean(offlineRuntime)
  const { settings: systemSettings } = useSystemSettings(false)
  const currentBranchId =
    authState.profile?.branch_id ?? offlineRuntime?.context.branchId ?? null
  const employeeName = authState.profile?.full_name || 'موظف AFEX'
  const employeeRole = getRoleLabel(authState.profile?.role) || 'موظف POS'
  const employeeId = authState.profile?.id
    ? authState.profile.id.slice(0, 8).toUpperCase()
    : 'AFEX-POS'
  const branchLabel = currentBranchId
    ? `فرع ${currentBranchId.slice(0, 8)}`
    : 'فرع نقطة البيع'
  const organizationLabel =
    authState.profile?.tenant_name?.trim() || branchLabel || 'لم يُحدد اسم المنشأة'
  const activityName = systemSettings?.store_name?.trim() || organizationLabel
  const formattedTime = formatPosTime(now)
  const formattedDate = formatPosGregorianDate(now)

  const dots = getPinIndicatorState(pin.length, PIN_LENGTH)
  const [deviceLabel, setDeviceLabel] = useState('جهاز غير معروف')

  useEffect(() => {
    let cancelled = false
    void restorePreparedOfflineRuntime()
      .then((runtime) => {
        if (!cancelled) setOfflineRuntime(runtime)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setOfflineRuntimeChecked(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setDeviceLabel(getCurrentPosDeviceLabel()), 0)
    return () => window.clearTimeout(timer)
  }, [])
  const inputDisabled = loading || locked

  useEffect(() => {
    return () => {
      if (clearPinTimeoutRef.current !== null) {
        window.clearTimeout(clearPinTimeoutRef.current)
      }

      if (shakeTimeoutRef.current !== null) {
        window.clearTimeout(shakeTimeoutRef.current)
      }

      if (lockTimeoutRef.current !== null) {
        window.clearTimeout(lockTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date())
    }, 30000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (authState.loading && !offlineRuntimeChecked) {
      return
    }

    if (hasPosLoggedOut()) {
      if (!redirectTargetRef.current) {
        redirectTargetRef.current = '/pos/login'
        router.replace('/pos/login')
      }
      return
    }

    if (!authState.profile) {
      // The protected shell owns unauthenticated-route navigation. Keeping one
      // redirect authority prevents duplicate replaces during auth hydration.
      return
    }

    if (!allowed) {
      const timer = window.setTimeout(() => {
        setError('غير مصرح لهذا الحساب باستخدام نقطة البيع')
      }, 0)
      return () => window.clearTimeout(timer)
    }

    const activeEmployee = readActivePosEmployee()

    if (activeEmployee) {
      if (activeEmployee.branch_id === currentBranchId) {
        if (!redirectTargetRef.current) {
          redirectTargetRef.current = '/pos'
          router.replace('/pos')
        }
        return
      }

      if (process.env.NODE_ENV === 'development') {
        console.warn('[POS PIN] Ignoring stale POS employee session.', {
          branchMismatch: true,
        })
      }
      clearActivePosEmployee()
    }
  }, [
    allowed,
    authState.loading,
    authState.profile,
    currentBranchId,
    offlineRuntimeChecked,
    router,
  ])

  useEffect(() => {
    if (!allowed || !currentBranchId) {
      return
    }

    if (process.env.NODE_ENV === 'development') {
      console.info('[POS PIN] Client POS context.', {
        branchAvailable: true,
        authRole: authState.profile?.role ?? null,
      })
    }
  }, [allowed, authState.profile?.role, currentBranchId])

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') {
      return
    }

    console.info('[POS PIN] Session organization context.', {
      tenantAvailable: Boolean(authState.profile?.tenant_id),
      branchAvailable: Boolean(currentBranchId),
    })
  }, [authState.profile?.tenant_id, authState.profile?.tenant_name, currentBranchId])

  useEffect(() => {
    if (
      pin.length !== PIN_LENGTH ||
      inputDisabled ||
      !allowed ||
      !currentBranchId ||
      verificationPausedRef.current
    ) {
      return
    }

    const pinToVerify = pin

    if (verifyingPinRef.current === pinToVerify) {
      return
    }

    verifyingPinRef.current = pinToVerify

    async function verifyPin() {
      let failureStage: 'pin-verification' | 'offline-preparation' | 'offline-recovery' =
        'pin-verification'
      try {
        setLoading(true)
        setError('')

        let selectedEmployee: ActivePosEmployee | null = null
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          selectedEmployee = await verifyOfflineEmployeePin(pinToVerify)
        } else {
          let response: Response | null = null
          try {
            response = await fetch('/api/pos/identify-employee-by-pin', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(
                buildScopedOnlinePinIdentification(pinToVerify, currentBranchId)
              ),
            })
          } catch (onlineError) {
            if (!(onlineError instanceof TypeError)) throw onlineError
            selectedEmployee = await verifyOfflineEmployeePin(pinToVerify)
          }
          if (response) {
            const result = await response.json().catch(() => null)
            const resultBody =
              result && typeof result === 'object'
                ? (result as Record<string, unknown>)
                : null
            if (!response.ok || !result?.employee) {
              if (process.env.NODE_ENV === 'development') {
                console.warn('[POS PIN] Employee identification failed.', {
                  status: response.status,
                  ok: response.ok,
                  classified: typeof resultBody?.error === 'string',
                })
              }
              throw new Error(getClientErrorMessage(result, INVALID_PIN_MESSAGE))
            }
            selectedEmployee = result.employee as ActivePosEmployee
            failureStage = 'offline-preparation'
            const enrollment = await enrollOnlineEmployeeForOffline(
              pinToVerify,
              selectedEmployee
            )
            if (enrollment.preparationResumeRequired) {
              if (!redirectTargetRef.current) {
                redirectTargetRef.current = '/pos/offline-preparation'
                router.replace('/pos/offline-preparation')
              }
              return
            }
          }
        }

        if (!selectedEmployee) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[POS PIN] Employee identification returned no actor.')
          }
          throw new Error(INVALID_PIN_MESSAGE)
        }
        const verifiedEmployee = selectedEmployee

        failureStage = 'offline-recovery'
        await completePosPinOfflineRecoveryGate(() => {
          clearAllInvoiceCatalogCache()
          writeActivePosEmployee(verifiedEmployee)
          clearPosLoggedOut()
        })
        setFailedAttempts(0)
        if (!redirectTargetRef.current) {
          redirectTargetRef.current = '/pos'
          router.replace('/pos')
        }
      } catch (verificationError) {
        const postVerificationFailure = failureStage !== 'pin-verification'
        const nextFailedAttempts = postVerificationFailure
          ? failedAttempts
          : failedAttempts + 1
        const shouldLock = !postVerificationFailure && nextFailedAttempts >= PIN_LOCK_ATTEMPTS
        if (!postVerificationFailure) {
          setFailedAttempts(shouldLock ? 0 : nextFailedAttempts)
        }
        setError(
          failureStage === 'offline-preparation'
            ? OFFLINE_PREPARATION_ERROR_MESSAGE
            : failureStage === 'offline-recovery'
              ? OFFLINE_RECOVERY_ERROR_MESSAGE
              : shouldLock
            ? POS_UX_MESSAGES.pinRateLimit
            : verificationError instanceof TypeError
              ? POS_UX_MESSAGES.networkFailure
            : verificationError instanceof Error
              ? verificationError.message
              : INVALID_PIN_MESSAGE
        )
        setShakeCard(true)
        verifyingPinRef.current = ''
        verificationPausedRef.current = true

        if (shakeTimeoutRef.current !== null) {
          window.clearTimeout(shakeTimeoutRef.current)
        }

        shakeTimeoutRef.current = window.setTimeout(() => {
          setShakeCard(false)
          shakeTimeoutRef.current = null
        }, 380)

        if (clearPinTimeoutRef.current !== null) {
          window.clearTimeout(clearPinTimeoutRef.current)
        }

        clearPinTimeoutRef.current = window.setTimeout(() => {
          setPin('')
          verificationPausedRef.current = false
          clearPinTimeoutRef.current = null
        }, PIN_CLEAR_AFTER_ERROR_MS)

        if (shouldLock) {
          setLocked(true)

          if (lockTimeoutRef.current !== null) {
            window.clearTimeout(lockTimeoutRef.current)
          }

          lockTimeoutRef.current = window.setTimeout(() => {
            setLocked(false)
            setError('')
            lockTimeoutRef.current = null
          }, PIN_LOCK_MS)
        }
      } finally {
        setLoading(false)
      }
    }

    void verifyPin()
  }, [
    allowed,
    currentBranchId,
    failedAttempts,
    inputDisabled,
    pin,
    router,
  ])

  const appendDigit = (digit: string) => {
    if (inputDisabled) {
      return
    }

    setError('')
    verificationPausedRef.current = false
    setPin((currentPin) =>
      currentPin.length >= PIN_LENGTH ? currentPin : `${currentPin}${digit}`
    )
  }

  const deleteDigit = () => {
    if (inputDisabled) {
      return
    }

    setError('')
    verifyingPinRef.current = ''
    verificationPausedRef.current = false
    setPin((currentPin) => currentPin.slice(0, -1))
  }

  const clearPin = () => {
    if (inputDisabled) {
      return
    }

    setError('')
    verifyingPinRef.current = ''
    verificationPausedRef.current = false
    setPin('')
  }

  const handleLogout = () => {
    setHasActiveSale(hasPersistedInvoiceSaleDraft(window.sessionStorage))
    setLogoutOpen(true)
  }

  if (authState.loading && !offlineRuntimeChecked) {
    return (
      <div className="flex h-[100svh] w-full items-center justify-center overflow-hidden bg-[#020817] p-4 text-white">
        <div className="rounded-2xl border border-cyan-300/25 bg-[rgba(2,8,23,0.72)] px-5 py-4 text-sm font-bold text-slate-200 shadow-[0_0_40px_rgba(34,211,238,0.14)]">
          جار تجهيز التحقق...
        </div>
      </div>
    )
  }

  return (
    <main
      dir="rtl"
      className="pos-entry-pin relative flex h-[100svh] w-full items-center justify-center overflow-hidden bg-[#071521] text-white xl:h-full"
    >
      <style jsx global>{`
        @keyframes pos-pin-shake {
          0%,
          100% {
            transform: translateX(0);
          }
          20% {
            transform: translateX(-10px);
          }
          40% {
            transform: translateX(10px);
          }
          60% {
            transform: translateX(-6px);
          }
          80% {
            transform: translateX(6px);
          }
        }

        .pos-pin-shake {
          animation: pos-pin-shake 380ms ease-out;
        }

        @media (max-width: 639px) {
          .pos-pin-frame {
            width: 100% !important;
            height: 100svh !important;
            aspect-ratio: auto !important;
          }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(34,211,238,0.12),transparent_42%)] max-sm:hidden" />

      <div
        className="pos-pin-frame relative z-10 max-h-full max-w-full overflow-hidden bg-[#020817] sm:rounded-[38px] sm:border sm:border-white/10 sm:bg-[#02040a] sm:p-[6px] sm:shadow-[0_34px_120px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.04)]"
        style={{
          width: 'min(90vw, 1240px, calc(100% - 48px))',
          height: 'min(88svh, 780px, calc(100% - 48px))',
          aspectRatio: '16 / 9',
        }}
      >
        <span className="absolute left-1/2 top-4 z-20 hidden h-2 w-2 -translate-x-1/2 rounded-full bg-[#071426] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_12px_rgba(34,211,238,0.22)] sm:block" />
        <section
          dir="ltr"
          className="relative grid h-full min-h-0 w-full overflow-hidden bg-[#020817] text-white sm:rounded-[28px] sm:border sm:border-cyan-300/20 sm:shadow-[inset_0_0_70px_rgba(34,211,238,0.06)] lg:grid-cols-[38%_62%]"
        >
          <div title={activityName} className="absolute right-5 top-[max(1rem,env(safe-area-inset-top))] z-30 hidden min-h-10 max-w-[calc(100%-2.5rem)] items-center gap-2 rounded-full border border-cyan-200/25 bg-[#07111f]/88 px-3.5 text-xs font-black text-slate-200 shadow-[0_10px_28px_rgba(0,0,0,0.24)] backdrop-blur-xl max-sm:flex" dir="rtl">
            <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.85)]" />
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-cyan-100" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z" strokeLinejoin="round"/><path d="m9 12 2 2 4-5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span className="truncate">{activityName}</span>
          </div>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_36%,rgba(34,211,238,0.2),transparent_30%),radial-gradient(circle_at_74%_36%,rgba(14,165,233,0.18),transparent_34%),linear-gradient(135deg,#020817_0%,#061426_52%,#071b2d_100%)] max-sm:hidden" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.11] [background-image:linear-gradient(rgba(34,211,238,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.14)_1px,transparent_1px)] [background-size:54px_54px] max-sm:hidden" />
          <div className="pointer-events-none absolute -bottom-24 left-1/2 h-64 w-[72%] -translate-x-1/2 rounded-[50%] border border-cyan-300/20 shadow-[0_0_85px_rgba(34,211,238,0.22)] max-sm:hidden" />

          <div className="absolute right-7 top-6 z-20 hidden items-center gap-3 text-white lg:flex">
            <span className="text-3xl font-black tracking-wide">AFEX</span>
            <span className="h-11 w-11 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 shadow-[0_0_24px_rgba(34,211,238,0.24)]" />
          </div>

          <aside dir="rtl" className="relative z-10 hidden min-h-0 p-4 lg:flex lg:items-center lg:justify-center xl:p-6">
            <div className="flex max-h-[calc(100%-48px)] w-full max-w-[360px] flex-col overflow-hidden rounded-[24px] border border-cyan-300/30 bg-[rgba(8,20,36,0.72)] p-5 shadow-[0_0_55px_rgba(34,211,238,0.14),0_26px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl">
              <div className="text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-cyan-300/45 bg-cyan-300/10 text-cyan-300 shadow-[0_0_36px_rgba(34,211,238,0.24),inset_0_0_24px_rgba(34,211,238,0.07)]">
                  <EmployeeAvatarIcon />
                </div>
                <h2 className="mt-3 text-2xl font-black text-white">
                  {employeeName}
                </h2>
                <p className="mt-1.5 text-xs font-bold text-cyan-300">
                  {employeeRole}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">
                  ID: {employeeId}
                </p>
              </div>

              <div className="mt-5 border-t border-cyan-200/10 pt-4">
                <h3 className="mb-2 text-center text-sm font-black text-cyan-300">
                  معلومات الجلسة
                </h3>
                <div className="rounded-2xl bg-[rgba(2,8,23,0.22)] px-2.5">
                  <SessionInfoRow icon="branch" label="المنشأة" value={organizationLabel} />
                  <SessionInfoRow icon="date" label="التاريخ" value={formattedDate} />
                  <SessionInfoRow icon="time" label="الوقت" value={formattedTime} />
                  <SessionInfoRow icon="device" label="الجهاز" value={deviceLabel} />
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="mt-auto min-h-[46px] rounded-2xl border border-rose-300/30 bg-rose-500/10 text-sm font-black text-rose-100 transition hover:bg-rose-500/15 active:scale-[0.99]"
              >
                تسجيل الخروج
              </button>
            </div>
          </aside>

          <section
            className={`relative z-10 flex min-h-0 items-center justify-center px-5 py-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-5 lg:p-6 ${
              shakeCard ? 'pos-pin-shake' : ''
            }`}
            dir="rtl"
          >
            <div className="w-full max-w-[480px] text-center max-sm:pb-16 max-sm:pt-10">
              <Image src="/brand/afex-logo.png" alt="AFEX POS" width={720} height={260} priority className="mx-auto mb-7 h-auto w-64 object-contain drop-shadow-[0_0_26px_rgba(34,211,238,0.20)] sm:hidden" />
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-300/10 text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.22)] max-sm:hidden">
                <span className="text-xl font-black">#</span>
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-cyan-300 max-sm:hidden">
                AFEX POS
              </p>
              <h1 className="mt-2.5 text-[30px] font-black leading-tight text-white xl:text-4xl">
                إدخال الرقم السري
              </h1>
              <p className="mt-2.5 text-sm font-semibold text-slate-400 sm:text-xs">
                أدخل رمز الموظف لفتح جلسة نقطة البيع.
              </p>

              <div className={`pos-pin-indicators mt-6 flex justify-center gap-7 ${pin.length === PIN_LENGTH ? 'is-complete' : ''}`} dir="ltr" aria-label={`${pin.length} من ${PIN_LENGTH} أرقام مدخلة`}>
                {dots.map((filled, index) => (
                  <span
                    key={`pin-dot-${index}`}
                    className={`pos-pin-indicator h-4 w-4 rounded-full border transition ${
                      filled
                        ? 'border-cyan-300 bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.65)]'
                        : 'border-cyan-300/70 bg-transparent shadow-[0_0_10px_rgba(34,211,238,0.10)] sm:border-cyan-200/25 sm:bg-[rgba(2,8,23,0.72)]'
                    }`}
                  />
                ))}
              </div>

              <div className="mt-4 min-h-7">
                {loading ? (
                  <p className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-bold text-cyan-100">
                    جار التحقق...
                  </p>
                ) : error ? (
                  <p className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-100">
                    {error}
                  </p>
                ) : (
                  <p className="text-xs font-bold text-slate-500">
                    PIN مكون من 4 أرقام
                  </p>
                )}
              </div>

              <div className="mx-auto mt-6 grid max-w-[390px] grid-cols-3 gap-3.5" dir="ltr">
                {keypadDigits.slice(0, 9).map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => appendDigit(digit)}
                    disabled={inputDisabled}
                    className="min-h-[68px] rounded-[20px] border border-slate-500/45 bg-[#07111f] text-3xl font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_10px_28px_rgba(0,0,0,0.18)] transition duration-150 hover:border-cyan-300/55 hover:shadow-[0_0_22px_rgba(34,211,238,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/65 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[60px] sm:rounded-2xl sm:border-cyan-300/25"
                  >
                    {digit}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={clearPin}
                  disabled={inputDisabled || pin.length === 0}
                  className="min-h-[68px] rounded-[20px] border border-slate-500/45 bg-[#07111f] text-base font-black text-cyan-300 transition duration-150 hover:border-cyan-300/60 hover:shadow-[0_0_22px_rgba(34,211,238,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/65 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-[60px] sm:rounded-2xl sm:border-cyan-300/25 sm:bg-[rgba(2,8,23,0.62)]"
                >
                  مسح
                </button>

                <button
                  type="button"
                  onClick={() => appendDigit('0')}
                  disabled={inputDisabled}
                  className="min-h-[68px] rounded-[20px] border border-slate-500/45 bg-[#07111f] text-3xl font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_10px_28px_rgba(0,0,0,0.18)] transition duration-150 hover:border-cyan-300/60 hover:shadow-[0_0_22px_rgba(34,211,238,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/65 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[60px] sm:rounded-2xl sm:border-cyan-300/25 sm:bg-[rgba(2,8,23,0.72)]"
                >
                  0
                </button>

                <button
                  type="button"
                  onClick={deleteDigit}
                  disabled={inputDisabled || pin.length === 0}
                  className="min-h-[68px] rounded-[20px] border border-slate-500/45 bg-[#07111f] text-base font-black text-cyan-300 transition duration-150 hover:border-cyan-300/60 hover:shadow-[0_0_22px_rgba(34,211,238,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/65 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-[60px] sm:rounded-2xl sm:border-cyan-300/25 sm:bg-[rgba(2,8,23,0.62)]"
                >
                  حذف
                </button>
              </div>

            </div>
          </section>

          <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-0 right-0 z-20 text-center text-xs font-semibold text-slate-500">
            <Image src="/brand/afex-logo.png" alt="AFEX" width={720} height={260} className="mx-auto mb-1.5 hidden h-auto w-20 object-contain max-sm:block" />
            <p>© 2026 AFEX POS</p>
          </div>
        </section>
      </div>
      <PosLogoutRetentionDialog
        open={logoutOpen}
        hasActiveSale={hasActiveSale}
        onCancel={() => setLogoutOpen(false)}
        onComplete={({ route }) => {
          clearAllInvoiceCatalogCache()
          setLogoutOpen(false)
          router.replace(route)
        }}
      />
    </main>
  )
}

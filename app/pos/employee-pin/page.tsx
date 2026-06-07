'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthState } from '@/components/auth-state-provider'
import { getRoleLabel } from '@/lib/app-roles'
import { canAccessPos } from '@/lib/permissions'
import {
  hasPosLoggedOut,
  clearActivePosEmployee,
  readActivePosEmployee,
  writeActivePosEmployee,
  markPosLoggedOut,
  clearPosLoggedOut,
  type ActivePosEmployee,
} from '@/lib/pos-employee-session'

const PIN_LENGTH = 4
const PIN_LOCK_ATTEMPTS = 3
const PIN_LOCK_MS = 5000
const PIN_CLEAR_AFTER_ERROR_MS = 500
const INVALID_PIN_MESSAGE = 'رمز PIN غير صحيح'
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
  const [now, setNow] = useState(() => new Date())

  const allowed = Boolean(
    authState.profile && canAccessPos(authState.profile.role)
  )
  const currentBranchId = authState.profile?.branch_id ?? null
  const employeeName = authState.profile?.full_name || 'موظف AFEX'
  const employeeRole = getRoleLabel(authState.profile?.role) || 'موظف POS'
  const employeeId = authState.profile?.id
    ? authState.profile.id.slice(0, 8).toUpperCase()
    : 'AFEX-POS'
  const branchLabel = currentBranchId
    ? `فرع ${currentBranchId.slice(0, 8)}`
    : 'فرع نقطة البيع'
  const organizationLabel =
    authState.profile?.tenant_name?.trim() || branchLabel || 'غير محدد'
  const formattedTime = now.toLocaleTimeString('ar-SA', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const formattedDate = now.toLocaleDateString('ar-SA', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  })

  const dots = useMemo(
    () => Array.from({ length: PIN_LENGTH }, (_, index) => index < pin.length),
    [pin.length]
  )
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
    if (authState.loading) {
      return
    }

    if (hasPosLoggedOut()) {
      router.replace('/pos/login')
      return
    }

    if (!authState.profile) {
      router.replace('/pos/login')
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
        router.replace('/pos')
        return
      }

      if (process.env.NODE_ENV === 'development') {
        console.warn('[POS PIN] Ignoring stale POS employee session.', {
          currentBranchId,
          employeeBranchId: activeEmployee.branch_id,
        })
      }
      clearActivePosEmployee()
    }
  }, [allowed, authState.loading, authState.profile, currentBranchId, router])

  useEffect(() => {
    if (!allowed || !currentBranchId) {
      return
    }

    if (process.env.NODE_ENV === 'development') {
      console.info('[POS PIN] Client POS context.', {
        branchId: currentBranchId,
        authRole: authState.profile?.role ?? null,
      })
    }
  }, [allowed, authState.profile?.role, currentBranchId])

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') {
      return
    }

    console.info('[POS PIN] Session organization context.', {
      tenant_id: authState.profile?.tenant_id ?? null,
      tenant_name: authState.profile?.tenant_name ?? null,
      branch_id: currentBranchId,
    })
  }, [authState.profile?.tenant_id, authState.profile?.tenant_name, currentBranchId])

  useEffect(() => {
    if (
      pin.length !== PIN_LENGTH ||
      inputDisabled ||
      !allowed ||
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
      try {
        setLoading(true)
        setError('')

        const response = await fetch('/api/pos/identify-employee-by-pin', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pin: pinToVerify,
          }),
        })

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
              statusText: response.statusText,
              error:
                typeof resultBody?.error === 'string' ? resultBody.error : null,
            })
          }

          throw new Error(INVALID_PIN_MESSAGE)
        }

        writeActivePosEmployee(result.employee as ActivePosEmployee)
        clearPosLoggedOut()
        setFailedAttempts(0)
        router.replace('/pos')
      } catch {
        const nextFailedAttempts = failedAttempts + 1
        const shouldLock = nextFailedAttempts >= PIN_LOCK_ATTEMPTS
        setFailedAttempts(shouldLock ? 0 : nextFailedAttempts)
        setError(
          shouldLock
            ? 'تمت محاولات كثيرة، حاول بعد قليل'
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
  }, [allowed, failedAttempts, inputDisabled, pin, router])

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
    clearActivePosEmployee()
    markPosLoggedOut()
    router.replace('/pos/login')
  }

  if (authState.loading) {
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
      className="relative flex h-[100svh] w-full items-center justify-center overflow-hidden bg-black text-white xl:h-full"
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
      `}</style>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(34,211,238,0.12),transparent_42%)]" />

      <div
        className="relative z-10 max-h-full max-w-full overflow-hidden rounded-[34px] border border-white/10 bg-[#02040a] p-[5px] shadow-[0_34px_120px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.04)] sm:rounded-[38px] sm:p-[6px]"
        style={{
          width: 'min(90vw, 1240px, calc(100% - 48px))',
          height: 'min(88svh, 780px, calc(100% - 48px))',
          aspectRatio: '16 / 9',
        }}
      >
        <span className="absolute left-1/2 top-4 z-20 hidden h-2 w-2 -translate-x-1/2 rounded-full bg-[#071426] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_12px_rgba(34,211,238,0.22)] sm:block" />
        <section
          dir="ltr"
          className="relative grid h-full min-h-0 w-full overflow-hidden rounded-[28px] border border-cyan-300/20 bg-[#020817] text-white shadow-[inset_0_0_70px_rgba(34,211,238,0.06)] lg:grid-cols-[38%_62%]"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_36%,rgba(34,211,238,0.2),transparent_30%),radial-gradient(circle_at_74%_36%,rgba(14,165,233,0.18),transparent_34%),linear-gradient(135deg,#020817_0%,#061426_52%,#071b2d_100%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.11] [background-image:linear-gradient(rgba(34,211,238,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.14)_1px,transparent_1px)] [background-size:54px_54px]" />
          <div className="pointer-events-none absolute -bottom-24 left-1/2 h-64 w-[72%] -translate-x-1/2 rounded-[50%] border border-cyan-300/20 shadow-[0_0_85px_rgba(34,211,238,0.22)]" />

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
                  <SessionInfoRow icon="device" label="الجهاز" value="AFEX Tablet POS" />
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
            className={`relative z-10 flex min-h-0 items-center justify-center p-4 sm:p-5 lg:p-6 ${
              shakeCard ? 'pos-pin-shake' : ''
            }`}
            dir="rtl"
          >
            <div className="w-full max-w-[480px] text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-300/10 text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.22)]">
                <span className="text-xl font-black">#</span>
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-cyan-300">
                AFEX POS
              </p>
              <h1 className="mt-2.5 text-3xl font-black text-white xl:text-4xl">
                إدخال الرقم السري
              </h1>
              <p className="mt-2.5 text-xs font-semibold text-slate-400">
                أدخل رمز الموظف لفتح جلسة نقطة البيع.
              </p>

              <div className="mt-5 flex justify-center gap-6" dir="ltr">
                {dots.map((filled, index) => (
                  <span
                    key={`pin-dot-${index}`}
                    className={`h-4 w-4 rounded-full border transition ${
                      filled
                        ? 'border-cyan-300 bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.65)]'
                        : 'border-cyan-200/25 bg-[rgba(2,8,23,0.72)]'
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

              <div className="mx-auto mt-4 grid max-w-[390px] grid-cols-3 gap-3" dir="ltr">
                {keypadDigits.slice(0, 9).map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => appendDigit(digit)}
                    disabled={inputDisabled}
                    className="min-h-[60px] rounded-2xl border border-cyan-300/25 bg-[rgba(2,8,23,0.72)] text-3xl font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-cyan-300/60 hover:shadow-[0_0_26px_rgba(34,211,238,0.18)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {digit}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={clearPin}
                  disabled={inputDisabled || pin.length === 0}
                  className="min-h-[60px] rounded-2xl border border-cyan-300/25 bg-[rgba(2,8,23,0.62)] text-base font-black text-cyan-300 transition hover:border-cyan-300/60 hover:text-cyan-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  مسح
                </button>

                <button
                  type="button"
                  onClick={() => appendDigit('0')}
                  disabled={inputDisabled}
                  className="min-h-[60px] rounded-2xl border border-cyan-300/25 bg-[rgba(2,8,23,0.72)] text-3xl font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-cyan-300/60 hover:shadow-[0_0_26px_rgba(34,211,238,0.18)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  0
                </button>

                <button
                  type="button"
                  onClick={deleteDigit}
                  disabled={inputDisabled || pin.length === 0}
                  className="min-h-[60px] rounded-2xl border border-cyan-300/25 bg-[rgba(2,8,23,0.62)] text-base font-black text-cyan-300 transition hover:border-cyan-300/60 hover:text-cyan-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  حذف
                </button>
              </div>

            </div>
          </section>

          <p className="absolute bottom-3 left-0 right-0 z-20 text-center text-xs font-semibold text-slate-500">
            للمساعدة، تواصل مع مدير النظام · © 2026 AFEX POS
          </p>
        </section>
      </div>
    </main>
  )
}

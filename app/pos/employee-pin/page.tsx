'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthState } from '@/components/auth-state-provider'
import { canAccessPos } from '@/lib/permissions'
import {
  hasPosLoggedOut,
  clearActivePosEmployee,
  readActivePosEmployee,
  writeActivePosEmployee,
  clearPosLoggedOut,
  type ActivePosEmployee,
} from '@/lib/pos-employee-session'

const PIN_LENGTH = 4
const PIN_LOCK_ATTEMPTS = 3
const PIN_LOCK_MS = 5000
const PIN_CLEAR_AFTER_ERROR_MS = 500
const INVALID_PIN_MESSAGE = 'رمز PIN غير صحيح'
const keypadDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

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

  const allowed = Boolean(
    authState.profile && canAccessPos(authState.profile.role)
  )
  const currentBranchId = authState.profile?.branch_id ?? null

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

  if (authState.loading) {
    return (
      <div className="flex h-full min-h-[70vh] items-center justify-center p-4">
        <div className="rounded-2xl bg-white px-5 py-4 text-sm font-bold text-slate-600 shadow-sm">
          جار تجهيز التحقق...
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[70vh] items-center justify-center bg-slate-50 px-4 py-6">
      <style jsx>{`
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

      <section
        className={`w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-5 text-center shadow-sm ${
          shakeCard ? 'pos-pin-shake' : ''
        }`}
      >
        <div className="mb-5">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-xl font-black text-white">
            LF
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
            AFEX POS
          </p>
          <h1 className="mt-2 text-2xl font-black text-slate-950">
            أدخل رمز الموظف
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            اختر موظف نقطة البيع قبل بدء العمل.
          </p>
        </div>

        <div className="mb-4 flex justify-center gap-3" dir="ltr">
          {dots.map((filled, index) => (
            <span
              key={`pin-dot-${index}`}
              className={`h-4 w-4 rounded-full border transition ${
                filled
                  ? 'border-slate-950 bg-slate-950'
                  : 'border-slate-300 bg-white'
              }`}
            />
          ))}
        </div>

        <div className="min-h-10">
          {loading ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600">
              جار التحقق...
            </p>
          ) : error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
              {error}
            </p>
          ) : (
            <p className="text-xs text-slate-400">PIN مكون من 4 أرقام</p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3" dir="ltr">
          {keypadDigits.slice(0, 9).map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => appendDigit(digit)}
              disabled={inputDisabled}
              className="min-h-[58px] rounded-2xl bg-slate-100 text-2xl font-black text-slate-950 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            onClick={clearPin}
            disabled={inputDisabled || pin.length === 0}
            className="min-h-[58px] rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-600 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            مسح
          </button>

          <button
            type="button"
            onClick={() => appendDigit('0')}
            disabled={inputDisabled}
            className="min-h-[58px] rounded-2xl bg-slate-100 text-2xl font-black text-slate-950 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            0
          </button>

          <button
            type="button"
            onClick={deleteDigit}
            disabled={inputDisabled || pin.length === 0}
            className="min-h-[58px] rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-600 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            حذف
          </button>
        </div>
      </section>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
  clearActivePosEmployee,
  markPosLoggedOut,
} from '@/lib/pos-employee-session'
import {
  clearOfflineBootstrapReady,
  lockOfflineRuntime,
  markOfflineRuntimeAccessLoggedOut,
} from '@/lib/offline/phase1'
import {
  OFFLINE_PREPARATION_STAGES,
  prepareCompleteOfflineRuntime,
  type OfflinePreparationProgress,
} from '@/lib/offline/complete-runtime'

const INITIAL_PROGRESS: OfflinePreparationProgress = Object.freeze({
  percentage: 0,
  stage: 'بدء التحقق من جلسة المنشأة',
})

function publicPreparationError(error: unknown) {
  const classification = error instanceof Error ? error.message : ''
  if (classification === 'OFFLINE_PRE_PIN_SQL_CONTRACT_NOT_INSTALLED') {
    return 'لم تكتمل تهيئة خدمة العمل دون اتصال لهذه البيئة بعد.'
  }
  if (classification.includes('NETWORK') || error instanceof TypeError) {
    return 'انقطع الاتصال قبل اكتمال التجهيز. يجب إكمال التجهيز الأول عبر الإنترنت.'
  }
  return 'تعذر إكمال تجهيز نقطة البيع. تحقق من الاتصال ثم أعد المحاولة.'
}

export default function PosOfflinePreparationPage() {
  const router = useRouter()
  const mountedRef = useRef(true)
  const runIdRef = useRef(0)
  const [progress, setProgress] = useState(INITIAL_PROGRESS)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(true)

  const runPreparation = useCallback(async () => {
    const runId = ++runIdRef.current
    setRunning(true)
    setError('')
    setProgress(INITIAL_PROGRESS)
    try {
      await prepareCompleteOfflineRuntime((next) => {
        if (!mountedRef.current || runId !== runIdRef.current) return
        setProgress((current) =>
          next.percentage >= current.percentage ? next : current
        )
      })
      if (!mountedRef.current || runId !== runIdRef.current) return
      setProgress({
        percentage: 100,
        stage: 'اكتمل تجهيز نقطة البيع للعمل دون اتصال',
      })
      router.replace('/pos/employee-pin')
    } catch (preparationError) {
      if (!mountedRef.current || runId !== runIdRef.current) return
      if (
        preparationError instanceof Error &&
        preparationError.message === 'OFFLINE_PILOT_DISABLED'
      ) {
        lockOfflineRuntime('offline-pilot-disabled')
        clearOfflineBootstrapReady()
        await markOfflineRuntimeAccessLoggedOut().catch(() => undefined)
        router.replace('/pos/employee-pin')
        return
      }
      setRunning(false)
      setError(publicPreparationError(preparationError))
    }
  }, [router])

  useEffect(() => {
    mountedRef.current = true
    const preparationTimer = window.setTimeout(() => {
      void runPreparation()
    }, 0)
    return () => {
      window.clearTimeout(preparationTimer)
      mountedRef.current = false
      runIdRef.current += 1
    }
  }, [runPreparation])

  const returnToLogin = async () => {
    if (running) return
    setRunning(true)
    runIdRef.current += 1
    lockOfflineRuntime('preparation-return-to-login')
    clearOfflineBootstrapReady()
    clearActivePosEmployee()
    markPosLoggedOut()
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    router.replace('/pos/login')
  }

  const stageIndex = OFFLINE_PREPARATION_STAGES.indexOf(progress.percentage)

  return (
    <main
      dir="rtl"
      className="relative flex h-[100dvh] min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#020817] px-5 py-[max(1.25rem,env(safe-area-inset-top))] text-white"
      data-offline-preparation
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(34,211,238,0.15),transparent_42%),linear-gradient(180deg,#071521_0%,#020817_100%)]" />
      <section className="relative z-10 w-full max-w-2xl rounded-[30px] border border-cyan-300/15 bg-[#071521]/90 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-9">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] border border-cyan-300/25 bg-cyan-300/10 text-3xl text-cyan-200" aria-hidden="true">
          ◈
        </div>
        <h1 className="mt-6 text-center text-2xl font-black sm:text-3xl">
          جاري تجهيز نقطة البيع للعمل دون اتصال
        </h1>
        <p className="mt-3 text-center text-sm font-bold leading-7 text-slate-300" aria-live="polite">
          {progress.stage}
        </p>

        <div className="mt-8" aria-label="تقدم تجهيز نقطة البيع">
          <div className="mb-3 flex items-center justify-between gap-4">
            <span className="text-xs font-bold text-slate-400">
              المرحلة {Math.max(1, stageIndex)} من 7
            </span>
            <strong className="text-2xl font-black tabular-nums text-cyan-200" dir="ltr">
              {progress.percentage}%
            </strong>
          </div>
          <div
            className="h-3 overflow-hidden rounded-full bg-slate-900 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percentage}
            aria-valuetext={`${progress.percentage} بالمئة — ${progress.stage}`}
          >
            <div
              className="h-full rounded-full bg-gradient-to-l from-cyan-200 to-cyan-500 transition-[width] duration-300 ease-out"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>

        {error ? (
          <div className="mt-7 rounded-[20px] border border-rose-300/20 bg-rose-400/10 p-4 text-sm font-bold leading-7 text-rose-100" role="alert">
            {error}
          </div>
        ) : (
          <p className="mt-7 text-center text-xs font-semibold leading-6 text-slate-500">
            لا تغلق الصفحة حتى يصل التجهيز إلى 100٪.
          </p>
        )}

        {error ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void runPreparation()}
              className="min-h-12 rounded-[16px] bg-cyan-300 px-5 text-sm font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100"
            >
              إعادة المحاولة
            </button>
            <button
              type="button"
              onClick={() => void returnToLogin()}
              className="min-h-12 rounded-[16px] border border-slate-500/35 bg-slate-950/55 px-5 text-sm font-black text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              العودة إلى تسجيل الدخول
            </button>
          </div>
        ) : null}
      </section>
    </main>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  endFullPosSessionAndRequireLogin,
  switchPosEmployeeAndRequirePin,
} from '@/lib/pos-employee-session'
import {
  assessLogoutPurgeRecords,
  authorizeCurrentOfflineNamespaceForPurge,
  clearActiveOfflineNamespace,
  deleteExplicitlyConfirmedLegacySensitiveRecords,
  EXPLICIT_UNSCOPED_LEGACY_CLEANUP_CONFIRMATION,
  finalizeOfflineSessionIntent,
  lockOfflineRuntime,
  offlineRepository,
  prepareVerifiedOfflineNamespace,
  toOfflineSafeClassification,
  type VerifiedPurgeAuthorization,
} from '@/lib/offline/phase1'
import { PosButton } from '@/components/pos-shell/pos-shell-primitives'

type PosLogoutRetentionDialogProps = {
  open: boolean
  intent?: 'logout' | 'switch'
  hasActiveSale?: boolean
  onCancel: () => void
  onComplete: (result: {
    intent: 'logout' | 'switch'
    route: '/pos/login' | '/pos/employee-pin'
  }) => void | Promise<void>
}

export function PosLogoutRetentionDialog({
  open,
  ...props
}: PosLogoutRetentionDialogProps) {
  if (!open) return null
  return <OpenPosLogoutRetentionDialog {...props} />
}

function OpenPosLogoutRetentionDialog({
  intent = 'logout',
  hasActiveSale = false,
  onCancel,
  onComplete,
}: Omit<PosLogoutRetentionDialogProps, 'open'>) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [deleteCachedData, setDeleteCachedData] = useState(false)
  const [purgeAuthorization, setPurgeAuthorization] =
    useState<VerifiedPurgeAuthorization | null>(null)
  const [assessment, setAssessment] = useState<Awaited<
    ReturnType<typeof assessLogoutPurgeRecords>
  > | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [secondConfirmation, setSecondConfirmation] = useState(false)
  const [purgeRetryRequired, setPurgeRetryRequired] = useState(false)
  const [legacyCleanupConfirmed, setLegacyCleanupConfirmed] = useState(false)
  const [safeError, setSafeError] = useState('')

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loggingOut && !preparing) onCancel()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [loggingOut, onCancel, preparing])

  const preparePurgeScope = useCallback(async () => {
    const prepared = await prepareVerifiedOfflineNamespace()
    const authorization = await authorizeCurrentOfflineNamespaceForPurge(
      prepared.descriptor
    )
    const nextAssessment = await assessLogoutPurgeRecords({
      repository: offlineRepository,
      namespaceId: authorization.descriptor.namespaceId,
      storage: window.localStorage,
    })
    setPurgeAuthorization(authorization)
    setAssessment(nextAssessment)
    return { authorization, assessment: nextAssessment }
  }, [])

  const handleDeleteChoice = async (checked: boolean) => {
    setDeleteCachedData(checked)
    setSecondConfirmation(false)
    setLegacyCleanupConfirmed(false)
    setSafeError('')
    if (!checked) {
      setPurgeAuthorization(null)
      setAssessment(null)
      return
    }
    try {
      setPreparing(true)
      await preparePurgeScope()
    } catch (error) {
      lockOfflineRuntime('purge-scope-unavailable')
      setSafeError(
        toOfflineSafeClassification(error) === 'OFFLINE_AUTHORITY_UNAVAILABLE'
          ? 'تعذر التحقق من نطاق الجهاز بأمان. ألغِ خيار الحذف أوأعد المحاولة.'
          : 'تعذر تجهيز حذف البيانات بأمان. لم تُحذف أي بيانات.'
      )
    } finally {
      setPreparing(false)
    }
  }

  const completeLogout = async () => {
    await onComplete(finalizeOfflineSessionIntent(intent))
  }

  const executeLogout = async (includeUnscopedLegacyCleanup = false) => {
    let exactAuthorization = purgeAuthorization
    let exactAssessment = assessment
    if (deleteCachedData) {
      try {
        setPreparing(true)
        if (!exactAuthorization || !exactAssessment) {
          const prepared = await preparePurgeScope()
          exactAuthorization = prepared.authorization
          exactAssessment = prepared.assessment
        }
        exactAuthorization = await authorizeCurrentOfflineNamespaceForPurge(
          exactAuthorization.descriptor
        )
        exactAssessment = await assessLogoutPurgeRecords({
          repository: offlineRepository,
          namespaceId: exactAuthorization.descriptor.namespaceId,
          storage: window.localStorage,
        })
        setPurgeAuthorization(exactAuthorization)
        setAssessment(exactAssessment)
        if (
          exactAssessment.blocksScopedCompleteClaim &&
          !includeUnscopedLegacyCleanup
        ) {
          setSecondConfirmation(true)
          setSafeError(
            'توجد مسودات AFEX تاريخية غير منسوبة إلى حساب أوفرع موثوق. يلزم تأكيد حذفها بشكل مستقل.'
          )
          return
        }
      } catch {
        lockOfflineRuntime('purge-scope-unavailable')
        setSafeError(
          'تغيّر نطاق الحساب أوالفرع، أوتعذر التحقق منه بأمان. لم يبدأ تسجيل الخروج أوالحذف.'
        )
        return
      } finally {
        setPreparing(false)
      }
    }

    try {
      setLoggingOut(true)
      setSafeError('')
      lockOfflineRuntime(
        intent === 'switch' ? 'employee-switch' : 'logout-start',
        exactAuthorization?.descriptor.namespaceId ?? null
      )
      if (intent === 'switch') {
        await switchPosEmployeeAndRequirePin()
      } else {
        await endFullPosSessionAndRequireLogin()
      }
    } catch {
      lockOfflineRuntime(
        'logout-authority-failed',
        exactAuthorization?.descriptor.namespaceId ?? null
      )
      setSafeError(
        'تعذر إكمال تسجيل الخروج الموثوق. بقيت البيانات مقفلة، ويمكنك إعادة المحاولة.'
      )
      setLoggingOut(false)
      return
    }

    if (!deleteCachedData || !exactAuthorization) {
      await completeLogout()
      return
    }

    try {
      await offlineRepository.purgeExactNamespace(exactAuthorization)
      if (includeUnscopedLegacyCleanup) {
        await deleteExplicitlyConfirmedLegacySensitiveRecords({
          storage: window.localStorage,
          confirmation: EXPLICIT_UNSCOPED_LEGACY_CLEANUP_CONFIRMATION,
        })
      }
      await completeLogout()
    } catch {
      clearActiveOfflineNamespace()
      setPurgeRetryRequired(true)
      setSafeError(
        'تم تسجيل الخروج، لكن تعذر إكمال حذف البيانات المحلية. بقي النطاق مقفلاً وسيُستأنف الحذف بأمان.'
      )
      setLoggingOut(false)
    }
  }

  const retryPurge = async () => {
    if (!purgeAuthorization) return
    try {
      setLoggingOut(true)
      setSafeError('')
      await offlineRepository.purgeExactNamespace(purgeAuthorization)
      if (legacyCleanupConfirmed) {
        await deleteExplicitlyConfirmedLegacySensitiveRecords({
          storage: window.localStorage,
          confirmation: EXPLICIT_UNSCOPED_LEGACY_CLEANUP_CONFIRMATION,
        })
      }
      await completeLogout()
    } catch {
      setSafeError(
        'ما زال حذف البيانات المحلية متعذرًا. بقيت البيانات مقفلة دون كشف محتواها.'
      )
      setLoggingOut(false)
    }
  }

  const handlePrimaryConfirm = () => {
    if (deleteCachedData && assessment?.requiresSecondConfirmation) {
      setSecondConfirmation(true)
      return
    }
    void executeLogout()
  }

  const busy = loggingOut || preparing
  const title = intent === 'switch' ? 'تبديل الموظف؟' : 'إنهاء وضع POS؟'
  const actionLabel = intent === 'switch' ? 'تبديل الموظف' : 'إنهاء وضع POS'

  return (
    <div
      className="afex-pos-dialog-backdrop"
      role="presentation"
      onMouseDown={() => !busy && onCancel()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="afex-pos-logout-retention-title"
        tabIndex={-1}
        className="afex-pos-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="afex-pos-dialog-handle" aria-hidden="true" />
        <h2 id="afex-pos-logout-retention-title">
          {secondConfirmation ? 'تأكيد حذف البيانات غير المتزامنة' : title}
        </h2>

        {secondConfirmation ? (
          <>
            <p>
              {assessment?.blocksScopedCompleteClaim
                ? 'توجد بيانات AFEX تاريخية غير منسوبة إلى حساب أوفرع موثوق. حذف النطاق الحالي وحده لا يثبت خلو الجهاز منها.'
                : 'توجد بيانات محلية غير متزامنة في النطاق الموثوق. حذفها محلي فقط ولا يلغي أي بيانات مؤكدة على الخادم.'}
            </p>
            <ul>
              <li>
                مسودات مشفرة ضمن النطاق:{' '}
                {assessment?.encryptedDraftCount ?? 0}
              </li>
              <li>
                سجلات حجر مشفرة: {assessment?.encryptedQuarantineCount ?? 0}
              </li>
              <li>
                أوامر محلية مشفرة غير محسومة:{' '}
                {assessment?.encryptedUnresolvedCommandCount ?? 0}
              </li>
              <li>
                مسودة بيع تاريخية نشطة:{' '}
                {assessment?.activeLegacySaleDraftPresence ? 'نعم' : 'لا'}
              </li>
              <li>
                سجلات الطابور التاريخي:{' '}
                {assessment?.legacyOfflineDraftQueueRecordCount ?? 0}
              </li>
              <li>
                سجلات تاريخية ملتبسة:{' '}
                {assessment?.ambiguousLegacyRecordCount ?? 0}
              </li>
            </ul>
            <PosButton
              tone="danger"
              loading={loggingOut}
              onClick={() => {
                const includeLegacy = Boolean(
                  assessment?.blocksScopedCompleteClaim
                )
                setLegacyCleanupConfirmed(includeLegacy)
                void executeLogout(includeLegacy)
              }}
            >
              {assessment?.blocksScopedCompleteClaim
                ? 'حذف مسودات AFEX التاريخية غير المنسوبة من هذا الجهاز'
                : 'حذف البيانات المحلية ضمن النطاق'}
            </PosButton>
            <PosButton
              disabled={busy}
              onClick={() => {
                setSecondConfirmation(false)
                setDeleteCachedData(false)
              }}
            >
              العودة دون حذف
            </PosButton>
          </>
        ) : purgeRetryRequired ? (
          <>
            <p role="alert">{safeError}</p>
            <PosButton
              tone="danger"
              loading={loggingOut}
              onClick={() => void retryPurge()}
            >
              إعادة محاولة الحذف الآمن
            </PosButton>
            <PosButton disabled={busy} onClick={() => void completeLogout()}>
              {intent === 'switch'
                ? 'المتابعة إلى إدخال PIN مع إبقاء البيانات مقفلة'
                : 'المتابعة إلى تسجيل الدخول مع إبقاء البيانات مقفلة'}
            </PosButton>
          </>
        ) : (
          <>
            <p>
              {hasActiveSale
                ? 'لديك عملية بيع غير مكتملة. ستبقى البيانات المحلية ضمن نطاقها المقفل.'
                : 'سيتم إبطال جلسة موظف نقطة البيع الحالية.'}
            </p>
            <section>
              <strong>ما الذي سيحدث؟</strong>
              <ul>
                <li>قفل أي بيانات محلية فور بدء تسجيل الخروج</li>
                <li>
                  {intent === 'switch'
                    ? 'إبطال جلسة الموظف فقط مع الاحتفاظ بتسجيل دخول الحساب'
                    : 'إبطال جلسة الموظف ثم تسجيل خروج الحساب محليًا'}
                </li>
                <li>لن تُرسل أي عملية محلية أثناء تسجيل الخروج</li>
              </ul>
            </section>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-current/15 px-3 py-2 text-right">
              <input
                type="checkbox"
                checked={deleteCachedData}
                disabled={busy}
                onChange={(event) =>
                  void handleDeleteChoice(event.currentTarget.checked)
                }
                className="h-5 w-5 shrink-0"
              />
              <span>حذف البيانات المحفوظة من هذا الجهاز</span>
            </label>
            {preparing ? (
              <p role="status">جارٍ التحقق من نطاق الحذف الآمن...</p>
            ) : null}
            {safeError ? <p role="alert">{safeError}</p> : null}
            <PosButton
              tone="danger"
              loading={loggingOut}
              disabled={
                preparing || (deleteCachedData && !purgeAuthorization)
              }
              onClick={handlePrimaryConfirm}
            >
              {actionLabel}
            </PosButton>
            <PosButton disabled={busy} onClick={onCancel}>
              إلغاء
            </PosButton>
            <small>
              الحذف لا يمس أي طلب أوفاتورة مؤكدة على الخادم. حذف البيانات
              التاريخية غير المنسوبة لا يحدث إلا بعد التأكيد المنفصل أعلاه.
            </small>
          </>
        )}
      </div>
    </div>
  )
}

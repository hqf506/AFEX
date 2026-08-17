'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/orders/format'
import {
  deletePosOfflineInvoiceDraft,
  readPosOfflineInvoiceDrafts,
  type PosOfflineInvoiceDraft,
} from '@/lib/pos-offline-draft'
import { getPaymentMethodLabel } from '@/lib/invoices/payment-method'
import { POS_UX_MESSAGES } from '@/lib/pos-ux-messages'
import { formatPosGregorianDateTime } from '@/lib/pos/date-format'

type CreateOrderResponse = {
  success?: boolean
  data?: {
    invoice_id?: string
    invoiceId?: string
  }
  error?: string
  message?: string
  duplicate?: boolean
}

function formatDraftDate(value: string) {
  const formatted = formatPosGregorianDateTime(value)
  return formatted === '—' ? 'وقت غير معروف' : formatted
}

function getDraftPaymentStatus(draft: PosOfflineInvoiceDraft) {
  if (draft.totalsSnapshot.remainingFromCustomer > 0) {
    return `متبقي ${formatCurrency(draft.totalsSnapshot.remainingFromCustomer)}`
  }

  if (draft.totalsSnapshot.cashChange > 0) {
    return `باقي للعميل ${formatCurrency(draft.totalsSnapshot.cashChange)}`
  }

  return 'مدفوع'
}

export default function PosOfflineDraftsPage() {
  const [drafts, setDrafts] = useState<PosOfflineInvoiceDraft[]>([])
  const [draftsLoaded, setDraftsLoaded] = useState(false)
  const [syncingDraftId, setSyncingDraftId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const draftsCount = drafts.length
  const totalDraftValue = useMemo(
    () =>
      drafts.reduce(
        (sum, draft) => sum + draft.totalsSnapshot.finalTotal,
        0
      ),
    [drafts]
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDrafts(readPosOfflineInvoiceDrafts())
      setDraftsLoaded(true)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  const handleDeleteDraft = (localDraftId: string) => {
    if (!window.confirm('هل تريد حذف هذه المسودة؟ لا يمكن استعادتها بعد الحذف.')) return

    try {
      setDrafts(deletePosOfflineInvoiceDraft(localDraftId))
      setMessage('تم حذف المسودة من هذا الجهاز.')
      setErrorMessage('')
    } catch {
      setErrorMessage(POS_UX_MESSAGES.draftRetained)
    }
  }

  const handleRetryDraft = async (draft: PosOfflineInvoiceDraft) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setErrorMessage('لا يوجد اتصال')
      setMessage('')
      return
    }

    const validItems = draft.items.filter(
      (item) =>
        typeof item.item_id === 'string' && item.item_id.trim().length > 0
    )

    if (validItems.length === 0) {
      setErrorMessage('لا توجد عناصر صالحة لإرسال هذه المسودة')
      setMessage('')
      return
    }

    setSyncingDraftId(draft.localDraftId)
    setErrorMessage('')
    setMessage('')

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientIdempotencyKey: draft.clientIdempotencyKey,
          employee_id: draft.employee?.id ?? null,
          customerId: draft.customerId,
          customerName: draft.customerName,
          customerPhone: draft.customerPhone,
          paymentMethod: draft.paymentMethod,
          cashReceived: draft.totalsSnapshot.numericCashReceived,
          remainingFromCustomer: draft.totalsSnapshot.remainingFromCustomer,
          cashChange: draft.totalsSnapshot.cashChange,
          discountAmount: draft.totalsSnapshot.discountAmount,
          taxAmount: draft.totalsSnapshot.taxAmount,
          note: draft.note,
          items: validItems,
        }),
      })

      const result = (await response.json().catch(() => null)) as
        | CreateOrderResponse
        | null

      if (!response.ok || !result?.success || !result.data) {
        throw new Error('safe-sync-failure')
      }

      const invoiceId = result.data.invoice_id || result.data.invoiceId || ''

      if (invoiceId) {
        await fetch('/api/invoices/cost-snapshot', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invoice_id: invoiceId,
            items: validItems,
          }),
        }).catch(() => {
          console.warn('[POS OFFLINE] Cost snapshot update failed.')
        })
      }

      setDrafts(deletePosOfflineInvoiceDraft(draft.localDraftId))
      setMessage(
        result.duplicate
          ? POS_UX_MESSAGES.duplicateSubmission
          : POS_UX_MESSAGES.draftSyncSuccess
      )
    } catch (error) {
      setErrorMessage(
        error instanceof TypeError
          ? POS_UX_MESSAGES.draftSyncUncertain
          : 'تعذر إرسال المسودة. لم يتم حذف المسودة، ويمكنك المحاولة مرة أخرى لاحقًا.'
      )
    } finally {
      setSyncingDraftId(null)
    }
  }

  return (
    <div className="pos-drafts-page">
      <main className="pos-drafts-panel">
        <header className="pos-drafts-header">
          <div>
            <p className="pos-drafts-eyebrow">
              Offline POS
            </p>
            <h1>
              مسودات الفواتير
            </h1>
            <p className="pos-drafts-description">
              أرسل المسودات يدويًا بعد عودة الاتصال.
            </p>
          </div>

          <Link
            href="/pos"
            className="pos-drafts-back"
          >
            العودة إلى POS
          </Link>
        </header>

        <section className="pos-drafts-summary">
          <div>
            <p>عدد المسودات</p>
            <strong>
              {draftsCount}
            </strong>
          </div>
          <div>
            <p>إجمالي المسودات</p>
            <strong>
              {formatCurrency(totalDraftValue)}
            </strong>
          </div>
        </section>

        {message ? (
          <div
            role="status"
            aria-live="polite"
            className="pos-drafts-notice is-success"
          >
            {message}
          </div>
        ) : null}

        {errorMessage ? (
          <div
            role="alert"
            className="pos-drafts-notice is-error"
          >
            {errorMessage}
          </div>
        ) : null}

        <section className="pos-drafts-content">
          {!draftsLoaded ? (
            <div
              role="status"
              aria-live="polite"
              className="pos-drafts-state"
            >
              جارٍ تحميل المسودات...
            </div>
          ) : drafts.length === 0 ? (
            <div className="pos-drafts-state is-empty">
              <div className="pos-drafts-empty-icon">
                <span className="text-xl" aria-hidden="true">
                  □
                </span>
              </div>
              <p className="pos-drafts-empty-title">
                لا توجد مسودات
              </p>
              <p className="pos-drafts-empty-copy">
                عند انقطاع الاتصال أثناء الدفع ستظهر الفواتير المحفوظة هنا.
              </p>
            </div>
          ) : (
            <div className="pos-drafts-list">
              {drafts.map((draft) => {
                const syncing = syncingDraftId === draft.localDraftId

                return (
                  <article
                    key={draft.localDraftId}
                    className="pos-draft-card"
                  >
                    <div className="pos-draft-card-head">
                      <div className="min-w-0">
                        <p className="pos-draft-customer">
                          {draft.customerName || 'عميل بدون اسم'}
                        </p>
                        <p className="pos-draft-date">
                          {formatDraftDate(draft.createdAt)}
                        </p>
                      </div>

                      <span className="pos-draft-method">
                        {getPaymentMethodLabel(draft.paymentMethod)}
                      </span>
                    </div>

                    <dl className="pos-draft-facts">
                      <div>
                        <dt>
                          العناصر
                        </dt>
                        <dd>
                          {draft.items.length} عنصر
                        </dd>
                      </div>
                      <div>
                        <dt>
                          الإجمالي
                        </dt>
                        <dd>
                          {formatCurrency(draft.totalsSnapshot.finalTotal)}
                        </dd>
                      </div>
                      <div>
                        <dt>
                          حالة الدفع
                        </dt>
                        <dd>
                          {getDraftPaymentStatus(draft)}
                        </dd>
                      </div>
                    </dl>

                    <div className="pos-draft-actions">
                      <button
                        type="button"
                        onClick={() => handleDeleteDraft(draft.localDraftId)}
                        disabled={syncing}
                        className="pos-draft-delete"
                      >
                        حذف
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRetryDraft(draft)}
                        disabled={syncing || Boolean(syncingDraftId)}
                        className="pos-draft-send"
                      >
                        {syncing ? 'جارٍ إرسال المسودة...' : 'إرسال الآن'}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

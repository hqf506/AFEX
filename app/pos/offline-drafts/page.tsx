'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/orders/format'
import {
  deletePosOfflineInvoiceDraft,
  readPosOfflineInvoiceDrafts,
  type PosOfflineInvoiceDraft,
} from '@/lib/pos-offline-draft'
import {
  getPaymentMethodLabel,
  toApiPaymentMethod,
} from '@/lib/invoices/payment-method'
import { supabase } from '@/lib/supabase/client'
import { useAuthState } from '@/components/auth-state-provider'

type CreateOrderResponse = {
  success?: boolean
  data?: {
    invoice_id?: string
    invoiceId?: string
  }
  error?: string
  message?: string
}

function formatDraftDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'وقت غير معروف'
  }

  return new Intl.DateTimeFormat('ar-SA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
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
  const authState = useAuthState()
  const tenantId = authState.profile?.tenant_id || null
  const [drafts, setDrafts] = useState<PosOfflineInvoiceDraft[]>([])
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
    setDrafts(readPosOfflineInvoiceDrafts())
  }, [])

  const handleDeleteDraft = (localDraftId: string) => {
    setDrafts(deletePosOfflineInvoiceDraft(localDraftId))
    setMessage('تم حذف المسودة محليًا')
    setErrorMessage('')
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
          customerName: draft.customerName,
          customerPhone: draft.customerPhone,
          paymentMethod: toApiPaymentMethod(draft.paymentMethod),
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
        throw new Error(
          result?.error || result?.message || 'تعذر إرسال المسودة'
        )
      }

      const invoiceId = result.data.invoice_id || result.data.invoiceId || ''

      if (invoiceId) {
        if (!tenantId) {
          throw new Error('ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ¯ Ù†Ø·Ø§Ù‚ Ø§Ù„Ù…Ù†Ø´Ø£Ø© Ù„Ø­ÙØ¸ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø¯ÙØ¹')
        }

        const { error } = await supabase
          .from('invoices')
          .update({
            cash_received:
              draft.paymentMethod === 'cash'
                ? draft.totalsSnapshot.numericCashReceived
                : 0,
            remaining_from_customer:
              draft.paymentMethod === 'cash'
                ? draft.totalsSnapshot.remainingFromCustomer
                : 0,
            cash_change:
              draft.paymentMethod === 'cash'
                ? draft.totalsSnapshot.cashChange
                : 0,
          })
          .eq('id', invoiceId)
          .eq('tenant_id', tenantId)

        if (error) {
          console.warn('[POS OFFLINE] Cash snapshot update failed.', error)
        }

        await fetch('/api/invoices/cost-snapshot', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invoice_id: invoiceId,
            items: validItems,
          }),
        }).catch((error) => {
          console.warn('[POS OFFLINE] Cost snapshot update failed.', error)
        })
      }

      setDrafts(deletePosOfflineInvoiceDraft(draft.localDraftId))
      setMessage('تم إرسال المسودة وحذفها محليًا')
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر إرسال المسودة'
      )
    } finally {
      setSyncingDraftId(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-slate-50 p-3 md:p-4">
      <div className="flex min-h-0 flex-1 flex-col rounded-[24px] border border-slate-200 bg-white p-3 text-right shadow-sm md:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-slate-400">
              Offline POS
            </p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">
              مسودات الفواتير
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              أرسل المسودات يدويًا بعد عودة الاتصال.
            </p>
          </div>

          <Link
            href="/pos"
            className="flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            العودة إلى POS
          </Link>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-400">عدد المسودات</p>
            <p className="mt-1 text-xl font-black text-slate-950">
              {draftsCount}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-400">إجمالي المسودات</p>
            <p className="mt-1 text-xl font-black text-slate-950">
              {formatCurrency(totalDraftValue)}
            </p>
          </div>
        </div>

        {message ? (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
            {message}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          {drafts.length === 0 ? (
            <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 ring-1 ring-slate-100">
                <span className="text-xl" aria-hidden="true">
                  □
                </span>
              </div>
              <p className="mt-3 text-sm font-black text-slate-700">
                لا توجد مسودات
              </p>
              <p className="mt-1 text-xs text-slate-400">
                عند انقطاع الاتصال أثناء الدفع ستظهر الفواتير المحفوظة هنا.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {drafts.map((draft) => {
                const syncing = syncingDraftId === draft.localDraftId

                return (
                  <article
                    key={draft.localDraftId}
                    className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-950">
                          {draft.customerName || 'عميل بدون اسم'}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {formatDraftDate(draft.createdAt)}
                        </p>
                      </div>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                        {getPaymentMethodLabel(draft.paymentMethod)}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                      <div className="rounded-xl bg-slate-50 p-2.5">
                        <p className="text-xs font-bold text-slate-400">
                          العناصر
                        </p>
                        <p className="mt-1 font-black text-slate-900">
                          {draft.items.length} عنصر
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-2.5">
                        <p className="text-xs font-bold text-slate-400">
                          الإجمالي
                        </p>
                        <p className="mt-1 font-black text-slate-900">
                          {formatCurrency(draft.totalsSnapshot.finalTotal)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-2.5">
                        <p className="text-xs font-bold text-slate-400">
                          حالة الدفع
                        </p>
                        <p className="mt-1 font-black text-slate-900">
                          {getDraftPaymentStatus(draft)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleDeleteDraft(draft.localDraftId)}
                        disabled={syncing}
                        className="min-h-[40px] rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        حذف
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRetryDraft(draft)}
                        disabled={syncing || Boolean(syncingDraftId)}
                        className="min-h-[40px] rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                      >
                        {syncing ? 'جارٍ الإرسال...' : 'إرسال الآن'}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

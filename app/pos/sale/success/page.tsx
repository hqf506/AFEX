'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminButton } from '@/components/admin-button'
import { ReceiptView } from '@/components/receipt-view'
import { SummaryRow } from '@/components/summary-row'
import { createInvoicePrintHtml } from '@/lib/invoices/items'
import {
  renderThermalInvoiceHtml,
  renderThermalShopCopyHtml,
} from '@/lib/invoices/thermal-template'
import {
  INVOICE_SUCCESS_STORAGE_KEY,
  parseStoredInvoiceSuccessSnapshot,
  type InvoiceSuccessSnapshot,
} from '@/lib/invoices/success'
import { formatCurrency } from '@/lib/orders/format'
import type {
  DigitalInvoiceTemplateSettings,
} from '@/lib/admin/settings'

const THERMAL_RECEIPT_SETTINGS_KEY = 'THERMAL_RECEIPT_SETTINGS_KEY'
const SUCCESS_SOUND_ENABLED = true
let successAudioContext: AudioContext | null = null

function getSuccessAudioContext() {
  if (typeof window === 'undefined') {
    return null
  }

  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext

  if (!AudioContextClass) {
    return null
  }

  if (!successAudioContext) {
    successAudioContext = new AudioContextClass()
  }

  return successAudioContext
}

async function playSuccessSound() {
  if (typeof window === 'undefined' || !SUCCESS_SOUND_ENABLED) {
    return
  }

  const audioContext = getSuccessAudioContext()
  if (!audioContext) {
    return
  }

  if (audioContext.state === 'suspended') {
    await audioContext.resume().catch(() => undefined)
  }

  const startAt = audioContext.currentTime
  const notes = [
    { frequency: 740, duration: 0.08, gain: 0.06 },
    { frequency: 988, duration: 0.11, gain: 0.075, delay: 0.07 },
    { frequency: 1318, duration: 0.18, gain: 0.08, delay: 0.15 },
  ]

  for (const note of notes) {
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    const noteStart = startAt + (note.delay ?? 0)

    oscillator.type = 'triangle'
    oscillator.frequency.value = note.frequency
    gainNode.gain.setValueAtTime(0.0001, noteStart)
    gainNode.gain.exponentialRampToValueAtTime(note.gain, noteStart + 0.012)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, noteStart + note.duration)

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    oscillator.start(noteStart)
    oscillator.stop(noteStart + note.duration)
  }
}

function triggerSuccessHaptic() {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate([90, 40, 130])
  }
}

type LocalThermalReceiptSettings = {
  brandName?: string
  branchName?: string
  paperWidth?: '80mm' | '58mm'
  footerText?: string
}

function SuccessCheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.2 2.2 4.8-4.8" />
    </svg>
  )
}

function extractHtmlTagContent(html: string, tagName: string) {
  const match = html.match(
    new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i')
  )

  return match?.[1]?.trim() ?? ''
}

function extractPrintableBodyContent(html: string) {
  const bodyContent = extractHtmlTagContent(html, 'body')

  if (bodyContent) {
    return bodyContent
  }

  return html
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<html[^>]*>/gi, '')
    .replace(/<\/html>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<body[^>]*>/gi, '')
    .replace(/<\/body>/gi, '')
    .trim()
}

function extractStyleTags(html: string) {
  return html.match(/<style[^>]*>[\s\S]*?<\/style>/gi)?.join('\n') ?? ''
}

function buildCombinedThermalPrintHtml(
  customerReceiptHtml: string,
  shopCopyHtml: string
) {
  const styles = extractStyleTags(customerReceiptHtml)
  const customerBody = extractPrintableBodyContent(customerReceiptHtml)
  const shopBody = extractPrintableBodyContent(shopCopyHtml)

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Thermal Print Bundle</title>
  ${styles}
  <style>
    .print-page-break {
      page-break-after: always;
      break-after: page;
      height: 0;
    }
  </style>
</head>
<body style="background: #ffffff; margin: 0;">
  ${customerBody}
  <div class="print-page-break"></div>
  ${shopBody}
</body>
</html>`
}

export default function PosSaleSuccessPage() {
  const router = useRouter()
  const successFeedbackPlayedRef = useRef(false)
  const [snapshot] = useState<InvoiceSuccessSnapshot | null>(() => {
    if (typeof window === 'undefined') return null

    return parseStoredInvoiceSuccessSnapshot(
      sessionStorage.getItem(INVOICE_SUCCESS_STORAGE_KEY)
    )
  })
  const [redirectCountdown, setRedirectCountdown] = useState(10)

  const issuedAtLabel = useMemo(() => {
    if (!snapshot || !snapshot.createdAt) return '—'

    return new Intl.DateTimeFormat('ar-SA', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(snapshot.createdAt))
  }, [snapshot])

  const loadDigitalInvoiceSettings = async () => {
    const response = await fetch('/api/invoices/digital-settings', {
      method: 'GET',
      credentials: 'include',
    })

    const result = await response.json().catch(() => null)

    return (response.ok && result?.success
      ? result.settings
      : null) as DigitalInvoiceTemplateSettings | null
  }

  const loadThermalInvoiceSettings = () => {
    if (typeof window === 'undefined') return null

    const local = window.localStorage.getItem(THERMAL_RECEIPT_SETTINGS_KEY)

    if (!local) {
      return null
    }

    try {
      return JSON.parse(local) as LocalThermalReceiptSettings
    } catch {
      return null
    }
  }

  const handlePrint = () => {
    void (async () => {
      if (!snapshot) return

      const digitalInvoiceSettings = await loadDigitalInvoiceSettings()
      const printWindow = window.open('', '_blank', 'width=900,height=700')

      if (!printWindow) return

      printWindow.document.write(
        createInvoicePrintHtml({
          invoiceItems: snapshot.invoiceItems,
          invoiceNumber: snapshot.invoiceNumber,
          orderNumber: snapshot.orderNumber,
          customerName: snapshot.customerName,
          customerPhone: snapshot.customerPhone,
          paymentMethod: snapshot.paymentMethod,
          paymentMethodLabel:
            snapshot.paymentMethod === 'cod' ? 'عند الاستلام' : undefined,
          cashReceived: snapshot.cashReceived,
          numericCashReceived: snapshot.numericCashReceived,
          remainingFromCustomer: snapshot.remainingFromCustomer,
          cashChange: snapshot.cashChange,
          subtotal: snapshot.subtotal,
          discount: snapshot.discount,
          tax: snapshot.tax,
          finalTotal: snapshot.finalTotal,
          note: snapshot.note,
          now: new Date(snapshot.createdAt || new Date().toISOString()),
          digitalInvoiceSettings: digitalInvoiceSettings || undefined,
        })
      )

      printWindow.document.close()
    })()
  }

  const runThermalPrint = useCallback(async () => {
    if (!snapshot) return

    const thermalInvoiceSettings = loadThermalInvoiceSettings()
    const printWindow = window.open('', '_blank', 'width=420,height=800')

    if (!printWindow) return

    const thermalPayload = {
      thermalBrandName: thermalInvoiceSettings?.brandName,
      thermalBranchName: thermalInvoiceSettings?.branchName,
      thermalPaperWidth:
        thermalInvoiceSettings?.paperWidth === '58mm' ? '58mm' : '80mm',
      thermalShowCustomerPhone: true,
      thermalShowPaymentMethod: true,
      thermalShowNote: true,
      thermalNote: snapshot.note,
      thermalFooterMessage: thermalInvoiceSettings?.footerText,
      customerName: snapshot.customerName,
      customerPhone: snapshot.customerPhone,
      invoiceNumber: snapshot.invoiceNumber,
      orderNumber: snapshot.orderNumber,
      issuedAt: snapshot.createdAt || new Date().toISOString(),
      paymentMethod: snapshot.paymentMethod,
      cashReceived: snapshot.cashReceived,
      numericCashReceived: snapshot.numericCashReceived,
      remainingFromCustomer: snapshot.remainingFromCustomer,
      cashChange: snapshot.cashChange,
      invoiceItems: snapshot.invoiceItems,
      subtotal: snapshot.subtotal,
      taxAmount: snapshot.tax,
      finalTotal: snapshot.finalTotal,
    } as const

    const customerReceiptHtml = renderThermalInvoiceHtml(thermalPayload)
    const shopCopyHtml = renderThermalShopCopyHtml(thermalPayload)

    printWindow.document.write(
      buildCombinedThermalPrintHtml(customerReceiptHtml, shopCopyHtml)
    )

    printWindow.document.close()
    printWindow.focus()

    window.setTimeout(() => {
      printWindow.print()

      window.setTimeout(() => {
        printWindow.close()
      }, 300)
    }, 300)
  }, [snapshot])

  const handleThermalPrint = () => {
    void runThermalPrint()
  }

  useEffect(() => {
    if (!snapshot?.shouldAutoPrintThermal) return

    const nextSnapshot = {
      ...snapshot,
      shouldAutoPrintThermal: false,
    }

    sessionStorage.setItem(
      INVOICE_SUCCESS_STORAGE_KEY,
      JSON.stringify(nextSnapshot)
    )

    void runThermalPrint()
  }, [runThermalPrint, snapshot])

  useEffect(() => {
    if (!snapshot || successFeedbackPlayedRef.current) {
      return
    }

    successFeedbackPlayedRef.current = true
    triggerSuccessHaptic()
    void playSuccessSound()
  }, [snapshot])

  useEffect(() => {
    if (!snapshot) {
      return
    }

    const redirectTimer = window.setTimeout(() => {
      router.push('/pos')
    }, 10000)

    const countdownTimer = window.setInterval(() => {
      setRedirectCountdown((current) => Math.max(0, current - 1))
    }, 1000)

    return () => {
      window.clearTimeout(redirectTimer)
      window.clearInterval(countdownTimer)
    }
  }, [router, snapshot])

  if (!snapshot) {
    return (
      <div className="pos-success-page">
        <style jsx global>{`
          body:has(.pos-success-page) .app-shell .page-wrap main.text-right {
            margin-top: 0 !important;
          }

          body:has(.pos-success-page) .app-shell .page-wrap main > .space-y-5,
          body:has(.pos-success-page) .app-shell .page-wrap main > .md\\:space-y-6 {
            margin-top: 0 !important;
          }
        `}</style>

        <div className="mt-4 w-full min-w-0 rounded-[28px] border border-slate-100 bg-white p-3 shadow-sm md:p-4 lg:p-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-right shadow-sm">
            <p className="text-sm font-medium text-slate-600">
              لا توجد فاتورة مكتملة
            </p>
            <button
              type="button"
              onClick={() => router.push('/pos')}
              className="mt-4 flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-5 text-sm font-medium text-slate-700 transition-all duration-150 hover:bg-slate-100"
            >
              العودة إلى POS
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pos-success-page">
      <style jsx global>{`
        body:has(.pos-success-page) .app-shell .page-wrap main.text-right {
          margin-top: 0 !important;
        }

        body:has(.pos-success-page) .app-shell .page-wrap main > .space-y-5,
        body:has(.pos-success-page) .app-shell .page-wrap main > .md\\:space-y-6 {
          margin-top: 0 !important;
        }

        @media print {
          body {
            background: #ffffff !important;
          }

          .receipt-print-hide {
            display: none !important;
          }

          body * {
            visibility: hidden;
          }

          .receipt-print-root,
          .receipt-print-root * {
            visibility: visible;
          }

          .receipt-print-root {
            position: absolute;
            top: 24px;
            left: 50%;
            width: min(100%, 480px);
            transform: translateX(-50%);
            margin: 0 auto;
            box-shadow: none !important;
            border: 0 !important;
          }
        }

        @keyframes success-pop {
          0% {
            transform: scale(0.86);
            opacity: 0.75;
          }

          60% {
            transform: scale(1.08);
            opacity: 1;
          }

          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>

      <div className="mt-2 flex h-full w-full min-h-0 min-w-0 flex-col space-y-3 rounded-[28px] border border-slate-100 bg-white p-3 shadow-sm md:p-4 lg:overflow-hidden">
        <div className="receipt-print-hide flex flex-col items-center justify-center space-y-2 py-1 text-center">
          <div className="flex h-[72px] w-[72px] animate-[success-pop_420ms_ease-out] items-center justify-center rounded-full bg-emerald-100 text-emerald-700 shadow-sm ring-8 ring-emerald-50">
            <SuccessCheckIcon />
          </div>
          <h1 className="text-xl font-bold text-slate-900 md:text-2xl">
            تم إنشاء الفاتورة بنجاح
          </h1>
          <p className="max-w-xl text-sm text-slate-500">
            يمكنك الآن متابعة الطباعة أو فتح نسخة PDF أو البدء بعملية بيع جديدة
          </p>
          <p className="text-sm font-bold text-emerald-700">جاهز للعميل التالي</p>
          <p className="text-xs font-bold text-slate-400">
            عودة تلقائية إلى POS خلال {redirectCountdown} ثوانٍ
          </p>
        </div>

        <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:[direction:ltr] lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-4">
          <section className="receipt-print-hide min-w-0 space-y-3 self-start rounded-2xl border border-slate-200 p-3 text-right md:p-4 lg:h-full lg:overflow-y-auto">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">القائمة</h2>
              <p className="mt-1 text-sm text-slate-500">
                اختر الإجراء المناسب للكاشير بعد إتمام الفاتورة.
              </p>
            </div>

            <AdminButton
              onClick={() => router.push('/pos')}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = '#000000'
                event.currentTarget.style.color = '#ffffff'
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = '#ffffff'
                event.currentTarget.style.color = '#0B1B34'
              }}
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 font-semibold text-[#0B1B34] transition-colors duration-200"
              type="button"
            >
              القائمة الرئيسية
            </AdminButton>

            <AdminButton
              onClick={() => router.push('/pos/sale/customer')}
              className="w-full rounded-xl bg-slate-900 py-3 font-bold text-white shadow-sm transition-all duration-200 hover:bg-slate-800"
              type="button"
            >
              إنشاء فاتورة جديدة
            </AdminButton>

            <AdminButton
              onClick={() => window.print()}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = '#000000'
                event.currentTarget.style.color = '#ffffff'
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = '#ffffff'
                event.currentTarget.style.color = '#0B1B34'
              }}
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 font-semibold text-[#0B1B34] transition-colors duration-200"
              type="button"
            >
              طباعة الفاتورة
            </AdminButton>

            <AdminButton
              onClick={handlePrint}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = '#000000'
                event.currentTarget.style.color = '#ffffff'
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = '#ffffff'
                event.currentTarget.style.color = '#0B1B34'
              }}
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 font-semibold text-[#0B1B34] transition-colors duration-200"
              type="button"
            >
              طباعة فاتورة إلكترونية
            </AdminButton>

            <AdminButton
              onClick={handleThermalPrint}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = '#000000'
                event.currentTarget.style.color = '#ffffff'
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = '#ffffff'
                event.currentTarget.style.color = '#0B1B34'
              }}
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 font-semibold text-[#0B1B34] transition-colors duration-200"
              type="button"
            >
              طباعة فاتورة حرارية
            </AdminButton>
          </section>

          <section className="min-w-0 space-y-3 self-start text-right lg:flex lg:min-h-0 lg:flex-col">
            <div className="receipt-print-hide rounded-2xl border border-slate-200 p-4">
              <h2 className="text-lg font-semibold text-slate-900">ملخص الفاتورة</h2>
              <p className="mt-1 text-sm text-slate-500">
                معلومات الفاتورة النهائية كما تم إنشاؤها في النظام.
              </p>
            </div>

            <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <SummaryRow
                label="رقم الفاتورة"
                value={snapshot.invoiceNumber || '—'}
              />
              <SummaryRow label="رقم الطلب" value={snapshot.orderNumber || '—'} />
              <SummaryRow
                label="اسم العميل"
                value={snapshot.customerName || '—'}
              />
              <SummaryRow label="الجوال" value={snapshot.customerPhone || '—'} />
              <SummaryRow label="التاريخ" value={issuedAtLabel} />
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 shadow-sm">
              <p className="mb-2 text-xs font-bold text-emerald-600">الإجمالي النهائي</p>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold">الإجمالي</span>
                <span className="text-2xl font-black">{formatCurrency(snapshot.finalTotal)}</span>
              </div>
            </div>

            <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              <ReceiptView snapshot={snapshot} />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

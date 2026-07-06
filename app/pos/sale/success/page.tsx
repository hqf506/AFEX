'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ReceiptView } from '@/components/receipt-view'
import { useSystemSettings } from '@/hooks/use-system-settings'
import {
  renderThermalInvoiceHtml,
  renderThermalShopCopyHtml,
} from '@/lib/invoices/thermal-template'
import {
  INVOICE_SUCCESS_STORAGE_KEY,
  parseStoredInvoiceSuccessSnapshot,
  type InvoiceSuccessSnapshot,
} from '@/lib/invoices/success'
import { getPaymentMethodLabel } from '@/lib/invoices/payment-method'
import { formatCurrency } from '@/lib/orders/format'

const THERMAL_RECEIPT_SETTINGS_KEY = 'THERMAL_RECEIPT_SETTINGS_KEY'
const SUCCESS_SOUND_ENABLED = true
let successAudioContext: AudioContext | null = null

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
  thermalReceiptLogoUrl?: string
  footerText?: string
}

type ServerThermalReceiptSettings = {
  logoUrl?: string | null
  brandName?: string | null
  branchName?: string | null
  paperWidth?: '80mm' | '58mm' | string | null
  showCustomerPhone?: boolean | null
  showPaymentMethod?: boolean | null
  showNote?: boolean | null
  note?: string | null
  footerMessage?: string | null
  showWhatsapp?: boolean | null
  showInstagram?: boolean | null
  showTiktok?: boolean | null
  showGoogleReview?: boolean | null
  showMap?: boolean | null
  whatsappNumber?: string | null
  instagramLink?: string | null
  tiktokLink?: string | null
  googleReviewLink?: string | null
  mapLink?: string | null
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
      className="h-12 w-12"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.2 2.2 4.8-4.8" />
    </svg>
  )
}

function ReceiptLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="truncate text-left font-black text-slate-100">{value}</span>
    </div>
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
  const runningInCapacitor = useMemo(() => isCapacitorWebView(), [])
  const [snapshot] = useState<InvoiceSuccessSnapshot | null>(() => {
    if (typeof window === 'undefined') return null

    return parseStoredInvoiceSuccessSnapshot(
      sessionStorage.getItem(INVOICE_SUCCESS_STORAGE_KEY)
    )
  })
  const [redirectCountdown, setRedirectCountdown] = useState(10)
  const { settings: systemSettings } = useSystemSettings(Boolean(snapshot))
  const printingEnabled = systemSettings?.enable_printing !== false
  const whatsappEnabled = systemSettings?.enable_whatsapp !== false

  const issuedAtLabel = useMemo(() => {
    if (!snapshot || !snapshot.createdAt) return '—'

    return new Intl.DateTimeFormat('ar-SA', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(snapshot.createdAt))
  }, [snapshot])

  const loadThermalInvoiceSettings = useCallback(() => {
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
  }, [])

  const fetchThermalInvoiceSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/invoices/thermal-settings', {
        method: 'GET',
        credentials: 'include',
      })
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        return null
      }

      return result.settings as ServerThermalReceiptSettings
    } catch (error) {
      console.error('Failed to load thermal invoice settings:', error)
      return null
    }
  }, [])

  const runThermalPrint = useCallback(async () => {
    if (!snapshot) return
    // TODO(iOS native): add Bluetooth printer integration for thermal receipts.
    if (runningInCapacitor) return
    if (!printingEnabled) return

    const thermalInvoiceSettings = loadThermalInvoiceSettings()
    const serverThermalInvoiceSettings = await fetchThermalInvoiceSettings()
    const printWindow = window.open('', '_blank', 'width=420,height=800')

    if (!printWindow) return

    const thermalPayload = {
      thermalBrandName:
        serverThermalInvoiceSettings?.brandName ||
        thermalInvoiceSettings?.brandName,
      thermalLogoUrl:
        serverThermalInvoiceSettings?.logoUrl ||
        thermalInvoiceSettings?.thermalReceiptLogoUrl,
      thermalBranchName:
        serverThermalInvoiceSettings?.branchName ||
        thermalInvoiceSettings?.branchName,
      thermalPaperWidth:
        serverThermalInvoiceSettings?.paperWidth === '58mm' ||
        thermalInvoiceSettings?.paperWidth === '58mm'
          ? '58mm'
          : '80mm',
      thermalShowCustomerPhone:
        serverThermalInvoiceSettings?.showCustomerPhone ?? true,
      thermalShowPaymentMethod:
        serverThermalInvoiceSettings?.showPaymentMethod ?? true,
      thermalShowNote: serverThermalInvoiceSettings?.showNote ?? true,
      thermalNote: serverThermalInvoiceSettings?.note || snapshot.note,
      thermalFooterMessage:
        serverThermalInvoiceSettings?.footerMessage ||
        thermalInvoiceSettings?.footerText,
      thermalShowWhatsapp: serverThermalInvoiceSettings?.showWhatsapp ?? true,
      thermalShowInstagram: serverThermalInvoiceSettings?.showInstagram ?? false,
      thermalShowTiktok: serverThermalInvoiceSettings?.showTiktok ?? false,
      thermalShowGoogleReview:
        serverThermalInvoiceSettings?.showGoogleReview ?? true,
      thermalShowMap: serverThermalInvoiceSettings?.showMap ?? true,
      whatsappNumber: serverThermalInvoiceSettings?.whatsappNumber || undefined,
      instagramLink: serverThermalInvoiceSettings?.instagramLink || undefined,
      tiktokLink: serverThermalInvoiceSettings?.tiktokLink || undefined,
      googleReviewLink:
        serverThermalInvoiceSettings?.googleReviewLink || undefined,
      mapLink: serverThermalInvoiceSettings?.mapLink || undefined,
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
  }, [
    fetchThermalInvoiceSettings,
    loadThermalInvoiceSettings,
    printingEnabled,
    runningInCapacitor,
    snapshot,
  ])

  const handlePagePrint = () => {
    if (runningInCapacitor) return
    if (!printingEnabled) return

    window.print()
  }

  const handleWhatsApp = () => {
    if (!whatsappEnabled) return
    if (!snapshot?.customerPhone) return

    const phone = snapshot.customerPhone.replace(/[^\d]/g, '')
    if (!phone) return

    const message = [
      'تم إنشاء فاتورتك بنجاح من AFEX POS',
      `رقم الفاتورة: ${snapshot.invoiceNumber || '—'}`,
      `رقم الطلب: ${snapshot.orderNumber || '—'}`,
      `الإجمالي: ${formatCurrency(snapshot.finalTotal)}`,
    ].join('\n')

    window.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
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

        <div className="fixed inset-0 h-[100svh] w-screen overflow-hidden bg-[#020817] text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_80%_82%,rgba(20,184,166,0.12),transparent_36%),linear-gradient(135deg,#020817_0%,#061426_54%,#020817_100%)]" />
          <div className="relative flex h-full items-center justify-center p-5 text-right">
            <div className="w-full max-w-md rounded-[30px] border border-cyan-300/12 bg-[#020817]/72 p-6 shadow-[0_24px_70px_rgba(0,0,0,0.36)] backdrop-blur-2xl">
              <p className="text-sm font-bold text-slate-300">
              لا توجد فاتورة مكتملة
              </p>
              <button
                type="button"
                onClick={() => router.push('/pos')}
                className="mt-5 flex h-12 w-full items-center justify-center rounded-[20px] border border-cyan-300/18 bg-cyan-400/10 px-5 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/15"
              >
                العودة إلى POS
              </button>
            </div>
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

        .receipt-print-root {
          max-width: min(100%, 100mm) !important;
          width: min(100%, 100mm) !important;
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
            width: min(100%, 100mm) !important;
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

      <div className="receipt-print-root pointer-events-none fixed left-[-9999px] top-0">
        <ReceiptView snapshot={snapshot} />
      </div>

      <div className="receipt-print-hide fixed inset-0 h-[100svh] w-screen overflow-hidden bg-[#020817] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_80%_82%,rgba(20,184,166,0.12),transparent_36%),linear-gradient(135deg,#020817_0%,#061426_54%,#020817_100%)]" />
        <div className="relative grid h-full w-full grid-cols-[minmax(0,1fr)_360px] gap-5 overflow-hidden p-5 [direction:ltr]">
          <main className="flex min-w-0 flex-col justify-between gap-5 overflow-hidden rounded-[34px] border border-cyan-300/10 bg-[#020817]/62 p-6 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_70px_rgba(2,8,23,0.36)] backdrop-blur-2xl [direction:rtl]">
            <section className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
              <div className="relative flex h-28 w-28 animate-[success-pop_420ms_ease-out] items-center justify-center rounded-full border border-[#14B8A6]/35 bg-[#14B8A6]/14 text-teal-50 shadow-[0_0_46px_rgba(20,184,166,0.28)]">
                <div className="absolute inset-3 rounded-full border border-cyan-300/12" />
                <SuccessCheckIcon />
              </div>
              <p className="mt-7 text-xs font-black tracking-[0.22em] text-cyan-300">
                AFEX POS
              </p>
              <h1 className="mt-2 text-4xl font-black text-white">
                تم إنشاء الفاتورة بنجاح
              </h1>
              <p className="mt-3 max-w-xl text-base font-bold text-slate-400">
                تم حفظ العملية وإصدار الفاتورة بنجاح
              </p>

              <div className="mt-7 grid w-full max-w-3xl grid-cols-2 gap-3">
                <div className="rounded-[24px] border border-cyan-300/10 bg-[#061426]/62 p-4">
                  <p className="text-xs font-black text-slate-400">رقم الفاتورة</p>
                  <p className="mt-2 text-2xl font-black text-white">
                    {snapshot.invoiceNumber || '—'}
                  </p>
                </div>
                <div className="rounded-[24px] border border-cyan-300/10 bg-[#061426]/62 p-4">
                  <p className="text-xs font-black text-slate-400">رقم الطلب</p>
                  <p className="mt-2 text-2xl font-black text-white">
                    {snapshot.orderNumber || '—'}
                  </p>
                </div>
                <div className="col-span-2 rounded-[24px] border border-cyan-300/10 bg-[#061426]/62 p-4">
                  <p className="text-xs font-black text-slate-400">العميل</p>
                  <p className="mt-2 text-2xl font-black text-white">
                    {snapshot.customerName || '—'}{' '}
                    <span className="text-lg text-cyan-100">
                      {snapshot.customerPhone || ''}
                    </span>
                  </p>
                </div>
              </div>

              <p className="mt-5 text-xs font-black text-slate-500">
                عودة تلقائية إلى نقطة البيع خلال {redirectCountdown} ثوانٍ
              </p>
            </section>

            <section className="grid shrink-0 grid-cols-4 gap-3">
              <button
                type="button"
                onClick={handlePagePrint}
                disabled={!printingEnabled}
                title={
                  printingEnabled
                    ? undefined
                    : 'ميزة الطباعة غير مفعلة من إعدادات النظام.'
                }
                className="flex h-16 items-center justify-center rounded-[24px] border border-cyan-300/18 bg-cyan-400/10 px-4 text-base font-black text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.12)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:border-slate-600/30 disabled:bg-slate-700/20 disabled:text-slate-500 disabled:shadow-none"
              >
                🖨 طباعة الفاتورة
              </button>
              <button
                type="button"
                onClick={handleWhatsApp}
                disabled={!snapshot.customerPhone || !whatsappEnabled}
                title={
                  whatsappEnabled
                    ? undefined
                    : 'ميزة الواتساب غير مفعلة من إعدادات النظام.'
                }
                className="flex h-16 items-center justify-center rounded-[24px] border border-cyan-300/14 bg-[#061426]/70 px-4 text-base font-black text-cyan-100 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:text-slate-600"
              >
                📱 إرسال واتساب
              </button>
              <button
                type="button"
                onClick={() => router.push('/pos/sale/customer')}
                className="flex h-16 items-center justify-center rounded-[24px] bg-[linear-gradient(135deg,#14B8A6,#06B6D4)] px-4 text-base font-black text-[#020817] shadow-[0_0_34px_rgba(20,184,166,0.28)] transition active:scale-[0.98]"
              >
                ➕ بيع جديد
              </button>
              <button
                type="button"
                onClick={() => router.push('/pos')}
                className="flex h-16 items-center justify-center rounded-[24px] border border-cyan-300/14 bg-[#061426]/70 px-4 text-base font-black text-slate-200 transition active:scale-[0.98]"
              >
                🏠 العودة للرئيسية
              </button>
            </section>
          </main>

          <aside className="flex min-h-0 flex-col overflow-hidden rounded-[34px] border border-cyan-300/10 bg-[#020817]/72 p-4 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_22px_60px_rgba(0,0,0,0.34)] backdrop-blur-2xl [direction:rtl]">
            <div className="shrink-0 rounded-[26px] border border-cyan-300/10 bg-[#061426]/68 p-4">
              <p className="text-xs font-black tracking-[0.18em] text-cyan-300">
                RECEIPT
              </p>
              <h2 className="mt-1 text-xl font-black text-white">معاينة الإيصال</h2>
            </div>

            <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-[28px] border border-cyan-300/12 bg-[#061426]/58 p-4">
              <div className="border-b border-cyan-300/10 pb-4 text-center">
                <p className="text-3xl font-black tracking-[0.18em] text-white">
                  AFEX
                </p>
                <p className="mt-1 text-xs font-black tracking-[0.25em] text-cyan-300">
                  POS
                </p>
              </div>

              <div className="mt-4 space-y-2 text-sm font-bold text-slate-300">
                <ReceiptLine label="الفاتورة" value={snapshot.invoiceNumber || '—'} />
                <ReceiptLine label="الطلب" value={snapshot.orderNumber || '—'} />
                <ReceiptLine label="العميل" value={snapshot.customerName || '—'} />
                <ReceiptLine label="الجوال" value={snapshot.customerPhone || '—'} />
                <ReceiptLine label="الدفع" value={getPaymentMethodLabel(snapshot.paymentMethod)} />
                <ReceiptLine label="التاريخ" value={issuedAtLabel} />
              </div>

              <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto border-y border-cyan-300/10 py-4">
                {snapshot.invoiceItems.map((item) => (
                  <div
                    key={`${item.item_name}-${item.quantity}-${item.unit_price}`}
                    className="rounded-[18px] border border-cyan-300/10 bg-[#020817]/56 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-white">
                          {item.item_name}
                        </p>
                        <p className="mt-1 text-xs font-bold text-slate-500">
                          الكمية: {item.quantity}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-black text-cyan-100">
                        {formatCurrency(item.unit_price * item.quantity)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-2">
                <ReceiptLine label="الإجمالي" value={formatCurrency(snapshot.subtotal)} />
                <ReceiptLine label="VAT" value={formatCurrency(snapshot.tax)} />
                <ReceiptLine label="الخصم" value={formatCurrency(snapshot.discount)} />
                <div className="mt-3 rounded-[22px] border border-[#14B8A6]/25 bg-[#0D9488]/12 p-4 shadow-[0_0_24px_rgba(20,184,166,0.14)]">
                  <p className="text-xs font-black text-cyan-100">الإجمالي النهائي</p>
                  <p className="mt-1 text-3xl font-black text-white">
                    {formatCurrency(snapshot.finalTotal)}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

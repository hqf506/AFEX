'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ReceiptView } from '@/components/receipt-view'
import { useSystemSettings } from '@/hooks/use-system-settings'
import { useMobileViewport } from '@/hooks/use-mobile-viewport'
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
import { clearCompletedInvoiceSaleState } from '@/lib/invoices/sale-reset'
import { POS_UX_MESSAGES } from '@/lib/pos-ux-messages'
import { INVOICE_UX_MESSAGES } from '@/lib/invoice-ux-messages'
import { formatPosGregorianDateTime } from '@/lib/pos/date-format'

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
  if (typeof window === 'undefined') return

  const vibrateFallback = () => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([90, 40, 130])
    }
  }
  const capacitorHaptics = (
    window as typeof window & {
      Capacitor?: {
        Plugins?: {
          Haptics?: {
            notification?: (options: { type: 'SUCCESS' }) => Promise<void> | void
          }
        }
      }
    }
  ).Capacitor?.Plugins?.Haptics

  if (!capacitorHaptics?.notification) {
    vibrateFallback()
    return
  }

  try {
    const notificationResult = capacitorHaptics.notification({ type: 'SUCCESS' })
    void Promise.resolve(notificationResult).catch(vibrateFallback)
  } catch {
    vibrateFallback()
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
  addressLine1?: string | null
  addressLine2?: string | null
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

function PrintIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M7 9V4h10v5M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 14h10v6H7z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M20 11.6a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 8.5c.4 2.8 2.2 4.6 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ReceiptLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-left font-black text-slate-100 [overflow-wrap:anywhere]">{value}</span>
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
  const isMobileViewport = useMobileViewport()
  const successFeedbackPlayedRef = useRef(false)
  const runningInCapacitor = useMemo(() => isCapacitorWebView(), [])
  const [snapshot] = useState<InvoiceSuccessSnapshot | null>(() => {
    if (typeof window === 'undefined') return null

    return parseStoredInvoiceSuccessSnapshot(
      sessionStorage.getItem(INVOICE_SUCCESS_STORAGE_KEY)
    )
  })
  const [redirectCountdown, setRedirectCountdown] = useState(30)
  const [printing, setPrinting] = useState(false)
  const [whatsappOpening, setWhatsappOpening] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const { settings: systemSettings } = useSystemSettings(Boolean(snapshot))
  const printingEnabled = systemSettings?.enable_printing !== false
  const whatsappEnabled = systemSettings?.enable_whatsapp !== false

  const issuedAtLabel = useMemo(() => {
    if (!snapshot || !snapshot.createdAt) return '—'

    return formatPosGregorianDateTime(snapshot.createdAt)
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
      addressLine1: serverThermalInvoiceSettings?.addressLine1 || undefined,
      addressLine2: serverThermalInvoiceSettings?.addressLine2 || undefined,
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
      thermalNote: serverThermalInvoiceSettings?.note ?? undefined,
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
      note: snapshot.note,
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
    if (printing) return

    setPrinting(true)
    setActionMessage('')
    try {
      window.print()
      setActionMessage(INVOICE_UX_MESSAGES.printDialogOpened)
    } catch {
      setActionMessage(INVOICE_UX_MESSAGES.printFailureAfterSavedOrder)
    } finally {
      window.setTimeout(() => setPrinting(false), 1000)
    }
  }

  const handleNewSale = () => {
    clearCompletedInvoiceSaleState()
    window.location.replace('/pos/sale/customer')
  }

  const handleWhatsApp = () => {
    if (whatsappOpening) return
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

    setWhatsappOpening(true)
    setActionMessage('')
    try {
      window.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    } catch {
      setActionMessage(POS_UX_MESSAGES.whatsappFailure)
      setWhatsappOpening(false)
    }
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
    }, 30000)

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

        @keyframes pos-success-enter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 639px) {
          .pos-success-enter { animation: pos-success-enter 220ms ease-out both; }
        }

        @media (prefers-reduced-motion: reduce) {
          .pos-success-page *,
          .pos-success-page *::before,
          .pos-success-page *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <div className="receipt-print-root pointer-events-none fixed left-[-9999px] top-0">
        <ReceiptView snapshot={snapshot} />
      </div>

      <div className="receipt-print-hide fixed inset-0 h-[100svh] w-screen overflow-x-hidden overflow-y-auto overscroll-y-contain bg-[#020817] text-white md:overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_80%_82%,rgba(20,184,166,0.12),transparent_36%),linear-gradient(135deg,#020817_0%,#061426_54%,#020817_100%)]" />
        {isMobileViewport ? (
          <main className="pos-success-enter relative min-h-full w-full overflow-x-hidden px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-right [direction:rtl]">
            <section className="flex flex-col items-center text-center">
              <div className="relative grid h-20 w-20 animate-[success-pop_240ms_ease-out] place-items-center rounded-full bg-cyan-300/10 text-cyan-100 shadow-[0_0_34px_rgba(34,211,238,0.18),inset_0_0_0_1px_rgba(34,211,238,0.32)]">
                <div className="absolute inset-3 rounded-full border border-cyan-300/14" />
                <SuccessCheckIcon />
              </div>
              <p className="mt-4 text-[11px] font-black tracking-[0.22em] text-cyan-300">AFEX POS</p>
              <h1 className="mt-2 text-[26px] font-black leading-tight text-white">تم إنشاء الفاتورة بنجاح</h1>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-400">تم حفظ العملية وإصدار الفاتورة بنجاح</p>
              {actionMessage ? (
                <p role="alert" className="mt-4 w-full rounded-[18px] bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-100 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.18)]">{actionMessage}</p>
              ) : null}
            </section>

            <section className="mt-6 rounded-[24px] bg-white/[0.035] p-5 text-center shadow-[0_18px_50px_rgba(0,0,0,0.16),inset_0_0_0_1px_rgba(34,211,238,0.18)]">
              <p className="text-xs font-black text-cyan-100">الإجمالي النهائي</p>
              <p className="mt-2 break-words text-[36px] font-black leading-none text-white">{formatCurrency(snapshot.finalTotal)}</p>
            </section>

            <section className="mt-4 divide-y divide-cyan-300/10 overflow-hidden rounded-[24px] bg-white/[0.035] px-4 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.11)]">
              <div className="flex items-center justify-between gap-4 py-3.5"><span className="text-sm font-bold text-slate-400">رقم الفاتورة</span><span className="min-w-0 break-words text-left text-sm font-black text-white [overflow-wrap:anywhere]">{snapshot.invoiceNumber || '—'}</span></div>
              <div className="flex items-center justify-between gap-4 py-3.5"><span className="text-sm font-bold text-slate-400">رقم الطلب</span><span className="min-w-0 break-words text-left text-sm font-black text-white [overflow-wrap:anywhere]">{snapshot.orderNumber || '—'}</span></div>
              <div className="flex items-center justify-between gap-4 py-3.5"><span className="text-sm font-bold text-slate-400">العميل</span><span className="min-w-0 truncate text-left text-sm font-black text-white">{snapshot.customerName || '—'}</span></div>
              {snapshot.customerPhone ? <div className="flex items-center justify-between gap-4 py-3.5"><span className="text-sm font-bold text-slate-400">رقم الجوال</span><span dir="ltr" className="text-left text-sm font-black text-cyan-100">{snapshot.customerPhone}</span></div> : null}
              <div className="flex items-center justify-between gap-4 py-3.5"><span className="text-sm font-bold text-slate-400">التاريخ والوقت</span><span className="text-left text-xs font-black text-white">{issuedAtLabel}</span></div>
            </section>

            <button type="button" onClick={handleNewSale} className="mt-6 flex min-h-[62px] w-full items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#14B8A6,#22D3EE)] px-5 text-lg font-black text-[#020817] shadow-[0_0_28px_rgba(34,211,238,0.22)] transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100/80">
              بيع جديد
            </button>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <button type="button" onClick={handlePagePrint} disabled={!printingEnabled || printing} title={printingEnabled ? undefined : 'ميزة الطباعة غير مفعلة من إعدادات النظام.'} className="flex min-h-[54px] items-center justify-center gap-2 rounded-[19px] bg-cyan-300/[0.07] px-3 text-sm font-black text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 disabled:cursor-not-allowed disabled:text-slate-600">
                <PrintIcon />
                {printing ? 'جارٍ التجهيز...' : 'طباعة الفاتورة'}
              </button>
              <button type="button" onClick={handleWhatsApp} disabled={!snapshot.customerPhone || !whatsappEnabled || whatsappOpening} title={whatsappEnabled ? undefined : 'ميزة الواتساب غير مفعلة من إعدادات النظام.'} className="flex min-h-[54px] items-center justify-center gap-2 rounded-[19px] bg-cyan-300/[0.07] px-3 text-sm font-black text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 disabled:cursor-not-allowed disabled:text-slate-600">
                <WhatsAppIcon />
                {whatsappOpening ? 'جارٍ الفتح...' : 'إرسال واتساب'}
              </button>
            </div>

            <details className="mt-4 rounded-[20px] bg-white/[0.025] shadow-[inset_0_0_0_1px_rgba(34,211,238,0.10)]">
              <summary className="flex min-h-[50px] cursor-pointer list-none items-center justify-between px-4 text-sm font-black text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70">معاينة الإيصال<span aria-hidden="true" className="text-lg">↓</span></summary>
              <div className="space-y-2 border-t border-cyan-300/10 px-4 py-4">
                <ReceiptLine label="الدفع" value={getPaymentMethodLabel(snapshot.paymentMethod)} />
                {snapshot.invoiceItems.map((item) => <ReceiptLine key={`${item.item_name}-${item.quantity}-${item.unit_price}`} label={`${item.quantity} × ${item.item_name}`} value={formatCurrency(item.unit_price * item.quantity)} />)}
              </div>
            </details>

            <section className="mt-4 rounded-[20px] bg-cyan-300/[0.035] p-4 text-center shadow-[inset_0_0_0_1px_rgba(34,211,238,0.12)]">
              <p className="text-xs font-bold leading-6 text-slate-400">عودة تلقائية إلى نقطة البيع خلال</p>
              <p dir="ltr" className="mt-1 text-xl font-black tabular-nums text-cyan-100">00:{String(redirectCountdown).padStart(2, '0')}</p>
              <button type="button" onClick={() => router.push('/pos')} className="mt-2 min-h-11 px-4 text-sm font-black text-cyan-200 underline decoration-cyan-300/25 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70">العودة الآن</button>
            </section>
          </main>
        ) : (
        <div className="pos-success-enter relative grid min-h-full w-full gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] [direction:ltr] md:h-full md:grid-cols-[minmax(0,1fr)_300px] md:overflow-hidden md:p-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5 lg:p-5">
          <main className="flex min-w-0 flex-col justify-between gap-4 rounded-[28px] border border-cyan-300/10 bg-[#020817]/62 p-4 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_70px_rgba(2,8,23,0.36)] backdrop-blur-2xl [direction:rtl] md:overflow-hidden md:rounded-[34px] lg:p-6">
            <section className="flex min-h-0 flex-1 flex-col items-center justify-center py-3 text-center sm:py-5 md:py-0">
              <div className="relative flex h-20 w-20 animate-[success-pop_240ms_ease-out] items-center justify-center rounded-full border border-[#14B8A6]/35 bg-[#14B8A6]/14 text-teal-50 shadow-[0_0_46px_rgba(20,184,166,0.28)] sm:h-24 sm:w-24 sm:animate-[success-pop_420ms_ease-out] lg:h-28 lg:w-28">
                <div className="absolute inset-3 rounded-full border border-cyan-300/12" />
                <SuccessCheckIcon />
              </div>
              <p className="mt-4 text-xs font-black tracking-[0.22em] text-cyan-300 sm:mt-6">
                AFEX POS
              </p>
              <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl lg:text-4xl">
                تم إنشاء الفاتورة بنجاح
              </h1>
              <p className="mt-3 max-w-xl text-base font-bold text-slate-400">
                تم حفظ العملية وإصدار الفاتورة بنجاح
              </p>
              {actionMessage ? (
                <p role="alert" className="mt-4 max-w-xl rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-100">
                  {actionMessage}
                </p>
              ) : null}

              <div className="mt-5 grid w-full grid-cols-[minmax(0,1fr)_auto] items-end gap-3 rounded-[26px] border border-emerald-300/20 bg-emerald-400/10 p-4 text-right shadow-[0_0_30px_rgba(52,211,153,0.12)] sm:hidden">
                <div className="min-w-0">
                  <p className="text-xs font-black text-emerald-200">الإجمالي النهائي</p>
                  <p className="mt-1 break-words text-3xl font-black text-white">
                    {formatCurrency(snapshot.finalTotal)}
                  </p>
                </div>
                <div className="text-left">
                  <p className="text-[11px] font-black text-slate-400">التاريخ والوقت</p>
                  <p className="mt-1 text-xs font-bold text-cyan-100">{issuedAtLabel}</p>
                </div>
              </div>

              <div className="mt-3 grid w-full max-w-3xl grid-cols-1 gap-3 min-[390px]:grid-cols-2 sm:mt-7">
                <div className="rounded-[24px] border border-cyan-300/10 bg-[#061426]/62 p-4">
                  <p className="text-xs font-black text-slate-400">رقم الفاتورة</p>
                  <p className="mt-2 break-words text-xl font-black text-white [overflow-wrap:anywhere] sm:text-2xl">
                    {snapshot.invoiceNumber || '—'}
                  </p>
                </div>
                <div className="rounded-[24px] border border-cyan-300/10 bg-[#061426]/62 p-4">
                  <p className="text-xs font-black text-slate-400">رقم الطلب</p>
                  <p className="mt-2 break-words text-xl font-black text-white [overflow-wrap:anywhere] sm:text-2xl">
                    {snapshot.orderNumber || '—'}
                  </p>
                </div>
                <div className="rounded-[24px] border border-cyan-300/10 bg-[#061426]/62 p-4 min-[390px]:col-span-2">
                  <p className="text-xs font-black text-slate-400">العميل</p>
                  <p className="mt-2 break-words text-xl font-black text-white [overflow-wrap:anywhere] sm:text-2xl">
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

            <section className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-5">
              <button
                type="button"
                onClick={handleNewSale}
                className="col-span-2 flex min-h-14 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#14B8A6,#06B6D4)] px-4 py-3 text-base font-black text-[#020817] shadow-[0_0_34px_rgba(20,184,166,0.28)] transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100/70 lg:col-span-1"
              >
                ➕ بيع جديد
              </button>
              <button
                type="button"
                onClick={handlePagePrint}
                disabled={!printingEnabled || printing}
                title={
                  printingEnabled
                    ? undefined
                    : 'ميزة الطباعة غير مفعلة من إعدادات النظام.'
                }
                className="flex min-h-14 items-center justify-center rounded-[22px] border border-cyan-300/18 bg-cyan-400/10 px-3 py-3 text-sm font-black text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.12)] transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/60 disabled:cursor-not-allowed disabled:border-slate-600/30 disabled:bg-slate-700/20 disabled:text-slate-500 disabled:shadow-none sm:text-base"
              >
                {printing ? 'جارٍ تجهيز الطباعة...' : '🖨 طباعة الفاتورة'}
              </button>
              <button
                type="button"
                onClick={handleWhatsApp}
                disabled={!snapshot.customerPhone || !whatsappEnabled || whatsappOpening}
                title={
                  whatsappEnabled
                    ? undefined
                    : 'ميزة الواتساب غير مفعلة من إعدادات النظام.'
                }
                className="flex min-h-14 items-center justify-center rounded-[22px] border border-cyan-300/14 bg-[#061426]/70 px-3 py-3 text-sm font-black text-cyan-100 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/60 disabled:cursor-not-allowed disabled:text-slate-600 sm:text-base"
              >
                {whatsappOpening ? 'جارٍ فتح واتساب...' : '📱 إرسال واتساب'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/admin/orders')}
                className="flex min-h-14 items-center justify-center rounded-[22px] border border-cyan-300/14 bg-[#061426]/70 px-3 py-3 text-sm font-black text-slate-200 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/60 sm:text-base"
              >
                📋 الطلبات
              </button>
              <button
                type="button"
                onClick={() => router.push('/pos')}
                className="flex min-h-14 items-center justify-center rounded-[22px] border border-cyan-300/14 bg-[#061426]/70 px-3 py-3 text-sm font-black text-slate-200 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/60 sm:text-base"
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

            <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-[28px] border border-cyan-300/12 bg-[#061426]/58 p-3 sm:p-4">
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
                {snapshot.paymentMethod === 'cod' ? (
                  <>
                    <ReceiptLine
                      label="المبلغ المدفوع"
                      value={formatCurrency(snapshot.numericCashReceived)}
                    />
                    <ReceiptLine
                      label="المتبقي"
                      value={formatCurrency(snapshot.remainingFromCustomer)}
                    />
                  </>
                ) : null}
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
                        <p className="break-words text-sm font-black text-white [overflow-wrap:anywhere]">
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
        )}
      </div>
    </div>
  )
}

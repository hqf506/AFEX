'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ReceiptView } from '@/components/receipt-view'
import { useSystemSettings } from '@/hooks/use-system-settings'
import {
  buildCombinedThermalPrintHtml,
  renderThermalInvoiceHtml,
  renderThermalShopCopyHtml,
} from '@/lib/invoices/thermal-template'
import {
  INVOICE_SUCCESS_STORAGE_KEY,
  parseStoredInvoiceSuccessSnapshot,
  type InvoiceSuccessSnapshot,
} from '@/lib/invoices/success'
import { formatCurrency } from '@/lib/orders/format'
import { beginNewInvoiceSaleCycle } from '@/lib/invoices/sale-reset'
import { POS_UX_MESSAGES } from '@/lib/pos-ux-messages'
import { INVOICE_UX_MESSAGES } from '@/lib/invoice-ux-messages'
import { formatPosGregorianDateTime } from '@/lib/pos/date-format'
import { normalizeWhatsAppDestination } from '@/lib/whatsapp/messages'
import { PosInvoiceSuccessWorkspace } from '@/components/pos-invoice-success-workspace'
import successStyles from '@/components/pos-invoice-success-workspace.module.css'
import { loadOfficialInvoicePdf } from '@/lib/invoices/official-pdf-client'

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

  const handlePagePrint = async () => {
    if (runningInCapacitor) return
    if (!printingEnabled) return
    if (printing) return

    setPrinting(true)
    setActionMessage('')
    const pdfWindow = window.open('', '_blank')
    try {
      const pdf = await loadOfficialInvoicePdf(snapshot!)
      const pdfUrl = URL.createObjectURL(pdf)
      if (pdfWindow) {
        pdfWindow.location.replace(pdfUrl)
      } else {
        window.location.assign(pdfUrl)
      }
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000)
      setActionMessage('تم فتح الفاتورة PDF الرسمية للطباعة')
    } catch {
      pdfWindow?.close()
      setActionMessage(INVOICE_UX_MESSAGES.printFailureAfterSavedOrder)
    } finally {
      setPrinting(false)
    }
  }

  const handleNewSale = () => {
    beginNewInvoiceSaleCycle()
    router.replace('/pos/sale/customer')
  }

  const handleWhatsApp = () => {
    if (whatsappOpening) return
    if (!whatsappEnabled) return
    if (!snapshot?.customerPhone) return

    const destination = normalizeWhatsAppDestination(snapshot.customerPhone)
    if (!destination) {
      setActionMessage('SKIPPED_INVALID_PHONE')
      return
    }

    const message = [
      'تم إنشاء فاتورتك بنجاح من AFEX POS',
      `رقم الفاتورة: ${snapshot.invoiceNumber || '—'}`,
      `رقم الطلب: ${snapshot.orderNumber || '—'}`,
      `الإجمالي: ${formatCurrency(snapshot.finalTotal)}`,
    ].join('\n')

    setWhatsappOpening(true)
    setActionMessage('')
    try {
      const phone = destination.replace(/^\+/, '')
      setActionMessage('HANDOFF_OPENED')
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

    performance.mark('afex-checkout-success-mounted')

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
      <div className={`pos-success-page ${successStyles.invalidPage}`}>
        <style jsx global>{`
          body:has(.pos-success-page) .app-shell .page-wrap main.text-right {
            margin-top: 0 !important;
          }

          body:has(.pos-success-page) .app-shell .page-wrap main > .space-y-5,
          body:has(.pos-success-page) .app-shell .page-wrap main > .md\\:space-y-6 {
            margin-top: 0 !important;
          }
        `}</style>

        <div className={successStyles.invalidState}>
              <p>
              لا توجد فاتورة مكتملة
              </p>
              <button
                type="button"
                onClick={() => router.push('/pos')}
              >
                العودة إلى POS
              </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`pos-success-page ${successStyles.page}`}>
      <style jsx global>{`
        body:has(.pos-success-page) .app-shell .page-wrap main.text-right { margin-top: 0 !important; }
        body:has(.pos-success-page) .app-shell .page-wrap main > .space-y-5,
        body:has(.pos-success-page) .app-shell .page-wrap main > .md\\:space-y-6 { margin-top: 0 !important; }
        .receipt-print-root { max-width: min(100%, 100mm) !important; width: min(100%, 100mm) !important; }
        @media print {
          body { background: #fff !important; }
          .receipt-print-hide { display: none !important; }
          body * { visibility: hidden; }
          .receipt-print-root, .receipt-print-root * { visibility: visible; }
          .receipt-print-root { position: absolute; top: 24px; left: 50%; width: min(100%, 100mm) !important; transform: translateX(-50%); margin: 0 auto; box-shadow: none !important; border: 0 !important; }
        }
      `}</style>
      <div className="receipt-print-root pointer-events-none fixed left-[-9999px] top-0"><ReceiptView snapshot={snapshot} /></div>
      <PosInvoiceSuccessWorkspace
        snapshot={snapshot}
        issuedAtLabel={issuedAtLabel}
        printing={printing}
        printingEnabled={printingEnabled && !runningInCapacitor}
        whatsappOpening={whatsappOpening}
        whatsappEnabled={whatsappEnabled}
        actionMessage={actionMessage}
        redirectCountdown={redirectCountdown}
        onPrint={handlePagePrint}
        onWhatsApp={handleWhatsApp}
        onNewSale={handleNewSale}
        onBackToPos={() => router.push('/pos')}
      />
    </div>
  )

}

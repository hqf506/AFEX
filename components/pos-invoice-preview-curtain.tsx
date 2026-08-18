'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { OrderRecord } from '@/lib/orders/orders-page'
import type { ThermalInvoiceTemplateSettings } from '@/lib/admin/settings'
import {
  buildCombinedThermalPrintHtml,
  renderThermalInvoiceHtml,
  renderThermalShopCopyHtml,
} from '@/lib/invoices/thermal-template'
import {
  fitThermalPreviewIframe,
  getThermalPreviewWidth,
  prepareThermalInvoicePreviewHtml,
} from '@/lib/invoices/thermal-preview'
import { loadOfficialInvoicePdfPayload } from '@/lib/invoices/official-pdf-client'
import { normalizeUiPaymentMethod } from '@/lib/invoices/payment-method'

export type InvoicePreviewMode = 'thermal' | 'digital'

type Props = {
  invoice: OrderRecord
  mode: InvoicePreviewMode
  onClose: () => void
}

function buildInvoiceItems(invoice: OrderRecord) {
  return invoice.items.map((item) => ({
    item_id: null,
    item_name: item.item_name,
    item_type: item.item_type === 'product' ? 'product' as const : 'service' as const,
    quantity: item.quantity,
    unit_price: item.unit_price,
  }))
}

function buildThermalPayload(invoice: OrderRecord, settings: ThermalInvoiceTemplateSettings) {
  return {
    thermalBrandName: settings.brandName,
    thermalLogoUrl: settings.logoUrl,
    thermalBranchName: settings.branchName,
    addressLine1: settings.addressLine1,
    addressLine2: settings.addressLine2,
    thermalPaperWidth: settings.paperWidth === '58mm' ? '58mm' as const : '80mm' as const,
    thermalShowCustomerPhone: settings.showCustomerPhone,
    thermalShowPaymentMethod: settings.showPaymentMethod,
    thermalShowNote: settings.showNote,
    thermalNote: settings.note,
    thermalFooterMessage: settings.footerMessage,
    thermalShowWhatsapp: settings.showWhatsapp,
    thermalShowInstagram: settings.showInstagram,
    thermalShowTiktok: settings.showTiktok,
    thermalShowGoogleReview: settings.showGoogleReview,
    thermalShowMap: settings.showMap,
    whatsappNumber: settings.whatsappNumber,
    instagramLink: settings.instagramLink,
    tiktokLink: settings.tiktokLink,
    googleReviewLink: settings.googleReviewLink,
    mapLink: settings.mapLink,
    customerName: invoice.customer_name,
    customerPhone: invoice.customer_phone,
    invoiceNumber: invoice.invoice_number,
    orderNumber: invoice.order_number,
    issuedAt: invoice.created_at,
    paymentMethod: normalizeUiPaymentMethod(invoice.payment_method_raw || invoice.payment_method_key),
    cashReceived: invoice.cash_received,
    numericCashReceived: invoice.cash_received,
    remainingFromCustomer: invoice.remaining_from_customer,
    cashChange: invoice.cash_change,
    invoiceItems: buildInvoiceItems(invoice),
    subtotal: invoice.subtotal,
    discountAmount: invoice.discount,
    taxAmount: invoice.tax,
    finalTotal: invoice.total,
    note: invoice.note,
  }
}

function buildDigitalPayload(invoice: OrderRecord) {
  return {
    invoiceId: invoice.invoice_number,
    orderId: invoice.id,
    customerName: invoice.customer_name,
    customerPhone: invoice.customer_phone,
    invoiceNumber: invoice.invoice_number,
    orderNumber: invoice.order_number,
    issuedAt: invoice.created_at,
    paymentMethod: normalizeUiPaymentMethod(invoice.payment_method_raw || invoice.payment_method_key),
    cashReceived: invoice.cash_received,
    numericCashReceived: invoice.cash_received,
    remainingFromCustomer: invoice.remaining_from_customer,
    cashChange: invoice.cash_change,
    invoiceItems: buildInvoiceItems(invoice),
    subtotal: invoice.subtotal,
    discount: invoice.discount,
    tax: invoice.tax,
    finalTotal: invoice.total,
    note: invoice.note,
  }
}

export function PosInvoicePreviewCurtain({ invoice, mode, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const thermalFrameRef = useRef<HTMLIFrameElement>(null)
  const printFrameRef = useRef<HTMLIFrameElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const requestRef = useRef(0)
  const closeTimerRef = useRef<number | null>(null)
  const closingRef = useRef(false)
  const [closing, setClosing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [thermalHtml, setThermalHtml] = useState('')
  const [thermalPrintHtml, setThermalPrintHtml] = useState('')
  const [thermalWidth, setThermalWidth] = useState(302)
  const [thermalHeight, setThermalHeight] = useState(560)
  const [digitalUrl, setDigitalUrl] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const title = mode === 'thermal' ? 'الفاتورة الحرارية' : 'الفاتورة الرقمية'

  const releaseObjectUrl = useCallback(() => {
    if (!objectUrlRef.current) return
    URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = null
    setDigitalUrl('')
  }, [])

  useEffect(() => {
    const requestId = ++requestRef.current
    const controller = new AbortController()
    releaseObjectUrl()

    void (async () => {
      try {
        if (mode === 'thermal') {
          const response = await fetch('/api/invoices/thermal-settings', {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          })
          const result = await response.json().catch(() => null)
          if (!response.ok || !result?.success || !result.settings) throw new Error('THERMAL_PREVIEW_UNAVAILABLE')
          const settings = result.settings as ThermalInvoiceTemplateSettings
          const payload = buildThermalPayload(invoice, settings)
          const customerHtml = renderThermalInvoiceHtml(payload)
          const printHtml = buildCombinedThermalPrintHtml(customerHtml, renderThermalShopCopyHtml(payload))
          if (requestRef.current !== requestId) return
          setThermalWidth(getThermalPreviewWidth(settings.paperWidth))
          setThermalHtml(prepareThermalInvoicePreviewHtml(customerHtml, settings.paperWidth))
          setThermalPrintHtml(printHtml)
        } else {
          const blob = await loadOfficialInvoicePdfPayload(buildDigitalPayload(invoice), controller.signal)
          if (requestRef.current !== requestId) return
          const url = URL.createObjectURL(blob)
          objectUrlRef.current = url
          setDigitalUrl(url)
        }
      } catch (previewError) {
        if (controller.signal.aborted || requestRef.current !== requestId) return
        setError(previewError instanceof Error && previewError.message === 'OFFICIAL_INVOICE_PDF_UNAVAILABLE'
          ? 'تعذر تحميل الفاتورة الرقمية الرسمية.'
          : 'تعذر تحميل معاينة الفاتورة.')
      } finally {
        if (!controller.signal.aborted && requestRef.current === requestId) setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [invoice, mode, reloadKey, releaseObjectUrl])

  useEffect(() => releaseObjectUrl, [releaseObjectUrl])

  const finishClose = useCallback(() => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    releaseObjectUrl()
    onClose()
  }, [onClose, releaseObjectUrl])

  const requestClose = useCallback(() => {
    if (closingRef.current) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) { finishClose(); return }
    closingRef.current = true
    setClosing(true)
    closeTimerRef.current = window.setTimeout(finishClose, 240)
  }, [finishClose])

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const pageMain = document.querySelector<HTMLElement>('.pos-invoices-page > main')
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (pageMain) pageMain.inert = true
    closeRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); requestClose(); return }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, a[href], iframe, [tabindex]:not([tabindex="-1"])'))
        .filter((element) => !element.hasAttribute('disabled'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
      document.body.style.overflow = previousOverflow
      if (pageMain) pageMain.inert = false
      window.removeEventListener('keydown', handleKeyDown)
      returnFocusRef.current?.focus()
    }
  }, [requestClose])

  const downloadName = useMemo(() => `${invoice.invoice_number || 'invoice'}.pdf`, [invoice.invoice_number])
  const retry = () => {
    setLoading(true)
    setError('')
    setThermalHtml('')
    setThermalPrintHtml('')
    setReloadKey((value) => value + 1)
  }

  return <div className="pos-invoice-preview-layer" data-closing={closing} data-mode={mode}>
    <button type="button" className="pos-invoice-preview-backdrop" aria-label="إغلاق المعاينة" onClick={requestClose} />
    <div ref={dialogRef} className="pos-invoice-preview-curtain" role="dialog" aria-modal="true" aria-labelledby="pos-invoice-preview-title">
      <header className="pos-invoice-preview-header">
        <div><small>{title}</small><h2 id="pos-invoice-preview-title" dir="ltr">{invoice.invoice_number}</h2></div>
        <div className="pos-invoice-preview-actions">
          {mode === 'thermal' && thermalPrintHtml && !loading && !error ? <button type="button" onClick={() => { printFrameRef.current?.contentWindow?.focus(); printFrameRef.current?.contentWindow?.print() }}>طباعة</button> : null}
          {mode === 'digital' && digitalUrl && !loading && !error ? <a href={digitalUrl} download={downloadName}>تنزيل</a> : null}
          <button ref={closeRef} type="button" className="is-close" onClick={requestClose}>إغلاق</button>
        </div>
      </header>
      <div className="pos-invoice-preview-content" data-testid="invoice-preview-scroll-owner">
        {loading ? <section className="pos-invoice-preview-state" aria-live="polite"><span aria-hidden="true" /><h3>جارٍ تجهيز {title}...</h3><p>يتم تحميل النسخة الرسمية بأمان.</p></section> : null}
        {error ? <section className="pos-invoice-preview-state is-error" role="alert"><h3>{error}</h3><button type="button" onClick={retry}>إعادة المحاولة</button></section> : null}
        {!loading && !error && mode === 'thermal' && thermalHtml ? <div className="pos-invoice-thermal-canvas"><div className="pos-invoice-thermal-paper" style={{ width: thermalWidth }}><iframe ref={thermalFrameRef} title={`الفاتورة الحرارية ${invoice.invoice_number}`} srcDoc={thermalHtml} style={{ height: thermalHeight }} onLoad={() => { if (thermalFrameRef.current) fitThermalPreviewIframe(thermalFrameRef.current, setThermalHeight) }} /></div></div> : null}
        {!loading && !error && mode === 'digital' && digitalUrl ? <iframe className="pos-invoice-digital-frame" title={`الفاتورة الرقمية ${invoice.invoice_number}`} src={digitalUrl} /> : null}
      </div>
      {thermalPrintHtml ? <iframe ref={printFrameRef} className="pos-invoice-print-frame" title="نسخة الطباعة الحرارية" srcDoc={thermalPrintHtml} /> : null}
    </div>
  </div>
}

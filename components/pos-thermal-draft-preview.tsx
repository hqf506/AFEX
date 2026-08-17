'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { InvoiceLineItem } from '@/lib/invoices/items'
import type { PosPaymentMethod } from '@/lib/invoices/payment-method'
import { renderThermalInvoiceHtml } from '@/lib/invoices/thermal-template'
import {
  fitThermalPreviewIframe,
  getThermalPreviewWidth,
  prepareThermalInvoicePreviewHtml,
} from '@/lib/invoices/thermal-preview'

type Props = {
  open: boolean
  onClose: () => void
  customerName: string
  customerPhone: string
  items: InvoiceLineItem[]
  subtotal: number
  taxAmount: number
  discountAmount: number
  finalTotal: number
  paymentMethod: PosPaymentMethod
  cashReceived: string
  cashChange: number
  remainingFromCustomer: number
  note: string
}

export function PosThermalDraftPreview(props: Props) {
  const { open, onClose } = props
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [previewHeight, setPreviewHeight] = useState(520)

  const previewHtml = useMemo(() => {
    const html = renderThermalInvoiceHtml({
      thermalBrandName: 'AFEX — معاينة قبل الإنشاء',
      thermalPaperWidth: '80mm',
      thermalShowCustomerPhone: true,
      thermalShowPaymentMethod: true,
      thermalShowNote: true,
      customerName: props.customerName,
      customerPhone: props.customerPhone,
      invoiceNumber: 'مسودة',
      orderNumber: 'مسودة',
      issuedAt: new Date().toISOString(),
      paymentMethod: props.paymentMethod,
      cashReceived: Number(props.cashReceived || 0),
      remainingFromCustomer: props.remainingFromCustomer,
      cashChange: props.cashChange,
      invoiceItems: props.items,
      subtotal: props.subtotal,
      taxAmount: props.taxAmount,
      discountAmount: props.discountAmount,
      finalTotal: props.finalTotal,
      note: props.note,
    })

    return prepareThermalInvoicePreviewHtml(html, '80mm')
  }, [
    props.cashChange,
    props.cashReceived,
    props.customerName,
    props.customerPhone,
    props.discountAmount,
    props.finalTotal,
    props.items,
    props.note,
    props.paymentMethod,
    props.remainingFromCustomer,
    props.subtotal,
    props.taxAmount,
  ])

  useEffect(() => {
    if (!open) return

    const activeElement = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null
    const visibleTrigger = Array.from(document.querySelectorAll<HTMLElement>('[data-thermal-preview-trigger]'))
      .find((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden'
      })
    returnFocusRef.current = activeElement ?? visibleTrigger ?? null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button, iframe, [tabindex]:not([tabindex="-1"])')
      ).filter((element) => !element.hasAttribute('disabled'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      returnFocusRef.current?.focus()
    }
  }, [onClose, open])

  if (!open) return null

  return (
    <div ref={dialogRef} className="afex-thermal-curtain" role="dialog" aria-modal="true" aria-labelledby="thermal-draft-preview-title">
      <header className="afex-thermal-curtain-header">
        <div>
          <p>إيصال حراري</p>
          <h2 id="thermal-draft-preview-title">معاينة قبل الإنشاء</h2>
        </div>
        <button ref={closeRef} type="button" className="afex-thermal-curtain-close" aria-label="إغلاق معاينة الإيصال" onClick={onClose}>×</button>
      </header>
      <div className="afex-thermal-curtain-sheet" style={{ width: getThermalPreviewWidth('80mm') }}>
        <iframe
          ref={iframeRef}
          title="معاينة الإيصال الحراري قبل الإنشاء"
          srcDoc={previewHtml}
          style={{ height: previewHeight }}
          onLoad={() => {
            if (iframeRef.current) fitThermalPreviewIframe(iframeRef.current, setPreviewHeight)
          }}
        />
      </div>
    </div>
  )
}

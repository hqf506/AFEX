'use client'

import { useEffect, useRef, useState } from 'react'
import type { InvoiceSuccessSnapshot } from '@/lib/invoices/success'
import { getPaymentMethodLabel } from '@/lib/invoices/payment-method'
import { formatCurrency } from '@/lib/orders/format'
import styles from './pos-invoice-success-workspace.module.css'

type Props = {
  snapshot: InvoiceSuccessSnapshot
  issuedAtLabel: string
  printing: boolean
  printingEnabled: boolean
  whatsappOpening: boolean
  whatsappEnabled: boolean
  actionMessage: string
  redirectCountdown: number
  onPrint: () => void
  onWhatsApp: () => void
  onNewSale: () => void
  onBackToPos: () => void
}

function paymentStatus(snapshot: InvoiceSuccessSnapshot) {
  if (snapshot.paymentMethod === 'cod') return 'مستحق عند الاستلام'
  if (snapshot.remainingFromCustomer > 0) {
    return `متبقٍ ${formatCurrency(snapshot.remainingFromCustomer)}`
  }
  return 'مدفوع'
}

function actionStatus(message: string) {
  if (message === 'HANDOFF_OPENED') {
    return 'تم فتح نافذة المشاركة — لم يُثبت التسليم'
  }
  if (message === 'SKIPPED_INVALID_PHONE') {
    return 'تعذر تجهيز رقم العميل للمشاركة'
  }
  return message
}

function SuccessIcon() {
  return (
    <svg viewBox="0 0 112 112" aria-hidden="true">
      <circle cx="56" cy="56" r="52" />
      <path d="m33 57 15 16 31-36" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.5L3 20.5l1.3-4.7A8.5 8.5 0 1 1 20.5 11.7Z" />
      <path d="M8.1 7.7c.3-.6.6-.6.9-.6h.5c.2 0 .4 0 .5.4l.8 1.9c.1.3.1.5-.1.7l-.7.8c-.2.2-.3.4-.1.7.7 1.4 1.8 2.5 3.2 3.1.3.1.5.1.7-.1l.9-1.1c.2-.2.4-.3.7-.2l1.9.9c.3.1.4.3.4.5 0 .5-.2 1.6-1.1 2.2-.6.4-1.4.6-2.3.4-1.3-.3-3-1-4.8-2.7-1.5-1.4-2.5-3.1-2.8-4.4-.3-1.1.1-2 .4-2.5Z" />
    </svg>
  )
}

function PrintIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M7 13h10v8H7zM17.5 11h.5" />
    </svg>
  )
}

function InvoiceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 2h8l4 4v16H6zM14 2v5h5M9 12h6M9 16h6" />
    </svg>
  )
}

export function PosInvoiceSuccessWorkspace(props: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [navigationPending, setNavigationPending] = useState(false)
  const detailsTriggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const { snapshot } = props
  const whatsappAvailable = Boolean(snapshot.customerPhone && props.whatsappEnabled)

  useEffect(() => {
    if (!detailsOpen) return

    const previousOverflow = document.body.style.overflow
    const returnFocus = detailsTriggerRef.current
    const dialog = dialogRef.current
    document.body.style.overflow = 'hidden'
    dialog?.querySelector<HTMLElement>('button')?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setDetailsOpen(false)
        return
      }

      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
      )
      if (!focusable.length) return
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

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      returnFocus?.focus()
    }
  }, [detailsOpen])

  const startNewSale = () => {
    if (navigationPending) return
    setNavigationPending(true)
    props.onNewSale()
  }

  return (
    <main className={`${styles.workspace} receipt-print-hide`} dir="rtl" data-success-model="model-4">
      <section className={styles.primaryScreen} data-success-primary-screen>
        <div className={styles.successIcon} data-success-icon>
          <SuccessIcon />
        </div>

        <div className={styles.identity}>
          <h1>تم إنشاء الفاتورة</h1>
          <p className={styles.invoiceNumber} dir="ltr">{snapshot.invoiceNumber || '—'}</p>
          <p className={styles.total} dir="ltr">{formatCurrency(snapshot.finalTotal)}</p>
        </div>

        <button
          type="button"
          className={styles.newSale}
          onClick={startNewSale}
          disabled={navigationPending}
          data-success-primary-action
        >
          {navigationPending ? 'جارٍ بدء عملية بيع جديدة…' : 'بدء عملية بيع جديدة'}
        </button>

        <div className={styles.secondaryActions} aria-label="إجراءات الفاتورة" data-success-secondary-actions>
          <button
            type="button"
            disabled={!whatsappAvailable || props.whatsappOpening}
            onClick={props.onWhatsApp}
            data-success-secondary-action="whatsapp"
            aria-label={whatsappAvailable ? 'واتساب' : 'واتساب غير متاح'}
          >
            <WhatsAppIcon />
            <span>واتساب</span>
            {!whatsappAvailable ? <small>غير متاح</small> : null}
          </button>
          <span className={styles.separator} aria-hidden="true" />
          <button
            type="button"
            disabled={!props.printingEnabled || props.printing}
            onClick={props.onPrint}
            data-success-secondary-action="print"
          >
            <PrintIcon />
            <span>{props.printing ? 'جارٍ التجهيز…' : 'طباعة'}</span>
          </button>
          <span className={styles.separator} aria-hidden="true" />
          <button
            ref={detailsTriggerRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen(true)}
            data-success-secondary-action="invoice"
          >
            <InvoiceIcon />
            <span>عرض الفاتورة</span>
          </button>
        </div>

        {props.actionMessage ? (
          <p className={styles.actionMessage} role="status">{actionStatus(props.actionMessage)}</p>
        ) : null}

        <p className={styles.countdown}>
          عودة تلقائية خلال <b dir="ltr">{props.redirectCountdown}</b> ثانية
        </p>
        <button type="button" className={styles.returnNow} onClick={props.onBackToPos}>
          العودة الآن
        </button>
      </section>

      {detailsOpen ? (
        <div className={styles.dialogBackdrop} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setDetailsOpen(false)
        }}>
          <div
            ref={dialogRef}
            className={styles.invoiceDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="success-invoice-dialog-title"
            data-success-invoice-dialog
          >
            <header>
              <div>
                <p>الفاتورة المحفوظة</p>
                <h2 id="success-invoice-dialog-title" dir="ltr">{snapshot.invoiceNumber || '—'}</h2>
              </div>
              <button type="button" onClick={() => setDetailsOpen(false)}>إغلاق</button>
            </header>
            <div className={styles.dialogScroll} data-success-dialog-scroll>
              <dl className={styles.meta}>
                <div><dt>رقم الطلب</dt><dd dir="ltr">{snapshot.orderNumber || '—'}</dd></div>
                <div><dt>طريقة الدفع</dt><dd>{getPaymentMethodLabel(snapshot.paymentMethod)}</dd></div>
                <div><dt>الحالة</dt><dd>{paymentStatus(snapshot)}</dd></div>
                <div><dt>العميل</dt><dd>{snapshot.customerName || '—'}</dd></div>
                <div><dt>التاريخ</dt><dd>{props.issuedAtLabel}</dd></div>
              </dl>
              <div className={styles.invoiceItems}>
                {snapshot.invoiceItems.map((item, index) => (
                  <div key={item.item_id ?? `${item.item_name}-${index}`}>
                    <span>
                      <strong>{item.item_name}</strong>
                      <small>{item.item_type === 'service' ? 'خدمة' : 'منتج'} · {item.quantity} × {formatCurrency(item.unit_price)}</small>
                    </span>
                    <b>{formatCurrency(item.quantity * item.unit_price)}</b>
                  </div>
                ))}
              </div>
              <dl className={styles.totals}>
                <div><dt>المجموع الفرعي</dt><dd>{formatCurrency(snapshot.subtotal)}</dd></div>
                <div><dt>الضريبة</dt><dd>{formatCurrency(snapshot.tax)}</dd></div>
                <div><dt>الخصم</dt><dd>{formatCurrency(snapshot.discount)}</dd></div>
                {snapshot.paymentMethod === 'cash' && snapshot.cashChange > 0 ? (
                  <div><dt>الباقي للعميل</dt><dd>{formatCurrency(snapshot.cashChange)}</dd></div>
                ) : null}
                <div className={styles.dialogTotal}><dt>الإجمالي</dt><dd>{formatCurrency(snapshot.finalTotal)}</dd></div>
              </dl>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

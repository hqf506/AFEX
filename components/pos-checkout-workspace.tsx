'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { InvoiceLineItem } from '@/lib/invoices/items'
import type { CheckoutDiscountOption } from '@/hooks/use-invoice-checkout'
import { formatCurrency } from '@/lib/orders/format'
import type {
  PosPaymentMethod,
  PosPaymentMethodOption,
} from '@/lib/invoices/payment-method'
import styles from './pos-checkout-workspace.module.css'

type Props = {
  customerName: string
  customerPhone: string
  customerId: string | null
  items: InvoiceLineItem[]
  subtotal: number
  taxAmount: number
  discountAmount: number
  finalTotal: number
  paymentMethod: PosPaymentMethod
  paymentMethods: readonly PosPaymentMethodOption[]
  cashReceived: string
  cashChange: number
  remainingFromCustomer: number
  note: string
  discounts: CheckoutDiscountOption[]
  selectedDiscount: CheckoutDiscountOption | null
  loadingDiscounts: boolean
  loading: boolean
  canSubmit: boolean
  errorMessage: string
  offlineMessage: string
  cashWarning: string
  onPreview: () => void
  onPaymentChange: (method: PosPaymentMethod) => void
  onCashReceivedChange: (value: string) => void
  onDiscountChange: (discount: CheckoutDiscountOption | null) => void
  onNoteChange: (value: string) => void
  onSubmit: () => void
}

function paymentHint(method: PosPaymentMethod) {
  if (method === 'mada') return 'مدى - شبكة الدفع المحلية'
  if (method === 'cash') return 'أدخل المبلغ المستلم'
  if (method === 'visa') return 'بطاقة ائتمانية'
  if (method === 'card') return 'بطاقة دفع'
  if (method === 'bank_transfer') return 'تحويل بنكي مؤكد من الموظف'
  if (method === 'transfer') return 'تحويل مؤكد من الموظف'
  return 'تحصيل عند الاستلام'
}

function selectedPaymentCopy(method: PosPaymentMethod) {
  if (method === 'mada') return 'سيتم الدفع عبر شبكة مدى'
  if (method === 'visa') return 'سيتم الدفع عبر بطاقة فيزا'
  if (method === 'cash') return 'أدخل المبلغ المستلم لحساب الباقي للعميل'
  if (method === 'card') return 'سيتم تسجيل الدفع بالبطاقة'
  if (method === 'bank_transfer') return 'سيتم تسجيل التحويل البنكي بإقرار الموظف'
  if (method === 'transfer') return 'سيتم تسجيل التحويل بإقرار الموظف'
  return 'سيتم تسجيل المبلغ للتحصيل عند الاستلام'
}

type IconName = 'bag' | 'card' | 'cash' | 'delivery' | 'receipt' | 'close' | 'check' | 'note'

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    bag: <><path d="M7 8V6a5 5 0 0 1 10 0v2" /><path d="M4 8h16l-1 13H5L4 8Z" /></>,
    card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h5" /></>,
    cash: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M17 14h.01M12 9v6" /></>,
    delivery: <><path d="M3 7h11v10H3zM14 11h4l3 3v3h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
    receipt: <><path d="M6 3h9l3 3v15H6zM15 3v4h4" /><path d="M9 12h6M9 16h6" /></>,
    close: <path d="m7 7 10 10M17 7 7 17" />,
    check: <path d="m6 12 4 4 8-9" />,
    note: <><path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m13 7 4 4" /></>,
  }

  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function PaymentIcon({ method }: { method: PosPaymentMethod }) {
  return <Icon name={method === 'cash' ? 'cash' : method === 'cod' || method === 'on_delivery' ? 'delivery' : 'card'} />
}

function SummaryContents(props: Props) {
  return (
    <>
      <div className={styles.summaryHeading}>
        <div><span className={styles.summaryIcon}><Icon name="bag" /></span><h2>ملخص الطلب</h2></div>
        <span>{props.items.length} عناصر</span>
      </div>

      <div className={styles.customerCard} data-checkout-customer-summary>
        <span className={styles.customerAvatar} aria-hidden="true">{(props.customerName.trim().charAt(0) || 'ع').toUpperCase()}</span>
        <div>
          <strong>{props.customerName || 'لم يُحدد عميل'}</strong>
          <small dir="ltr">{props.customerPhone || 'غير متوفر'}</small>
          <em>{props.customerId ? 'معرف العميل مرتبط' : 'بيانات العميل غير مكتملة'}</em>
        </div>
      </div>

      <div className={styles.items} data-checkout-items-scroll>
        {props.items.map((item, index) => (
          <div className={styles.item} key={item.item_id ?? `${item.item_name}-${index}`}>
            <span><strong>{item.item_name}</strong><small>{item.quantity} × {formatCurrency(item.unit_price)}</small></span>
            <b>{formatCurrency(item.quantity * item.unit_price)}</b>
          </div>
        ))}
      </div>

      {props.note.trim() ? <div className={styles.summaryNote}><strong>ملاحظة</strong><p>{props.note}</p></div> : null}

      <div className={styles.totals} data-checkout-summary-totals>
        <div><span>المجموع الفرعي</span><b>{formatCurrency(props.subtotal)}</b></div>
        <div><span>الضريبة</span><b>{formatCurrency(props.taxAmount)}</b></div>
        <div><span>الخصم</span><b>{formatCurrency(props.discountAmount)}</b></div>
        <div className={styles.total}><span>الإجمالي</span><b>{formatCurrency(props.finalTotal)}</b></div>
      </div>
    </>
  )
}

export function PosCheckoutWorkspace(props: Props) {
  const [summaryOpen, setSummaryOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const summaryTriggerRef = useRef<HTMLButtonElement | null>(null)
  const selectedPayment = props.paymentMethods.find(
    (method) => method.id === props.paymentMethod
  )
  const isCash = props.paymentMethod === 'cash'
  const selectedDiscountLabel = props.selectedDiscount
    ? props.selectedDiscount.type === 'percentage'
      ? `${props.selectedDiscount.name} (${props.selectedDiscount.value}%)`
      : `${props.selectedDiscount.name} (${formatCurrency(props.selectedDiscount.value)})`
    : 'بدون خصم'

  useEffect(() => {
    if (!summaryOpen) return
    const previousOverflow = document.body.style.overflow
    const summaryTrigger = summaryTriggerRef.current
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSummaryOpen(false)
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, [href], input, textarea, [tabindex]:not([tabindex="-1"])')).filter((element) => !element.hasAttribute('disabled'))
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
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    closeButtonRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      summaryTrigger?.focus()
    }
  }, [summaryOpen])

  return (
    <main className={styles.workspace} dir="rtl" data-checkout-model="model-1">
      <div className={styles.layout}>
        <aside className={styles.summary} data-checkout-summary><SummaryContents {...props} /></aside>

        <section className={styles.payment} data-checkout-payment-surface>
          <div className={styles.paymentScroll}>
            <div className={styles.mobileSummaryBar}>
              <button ref={summaryTriggerRef} type="button" onClick={() => setSummaryOpen(true)} aria-haspopup="dialog"><Icon name="bag" /><span>ملخص الطلب</span><b>{props.items.length}</b></button>
              <button type="button" onClick={props.onPreview} data-thermal-preview-trigger><Icon name="receipt" /><span>معاينة الإيصال</span></button>
            </div>

            <div className={styles.due} data-checkout-due><span>المبلغ المستحق</span><strong>{formatCurrency(props.finalTotal)}</strong></div>

            <section className={styles.methodSection}>
              <h2>طريقة الدفع</h2>
              <div className={styles.methods} data-checkout-payment-grid>
                {props.paymentMethods.map((method) => {
                  const selected = props.paymentMethod === method.id
                  return (
                    <button key={method.id} type="button" aria-pressed={selected} className={selected ? styles.selectedMethod : undefined} disabled={props.loading} onClick={() => props.onPaymentChange(method.id)}>
                      <span className={styles.methodIcon}><PaymentIcon method={method.id} /></span>
                      <span className={styles.methodCopy}><strong>{method.label}</strong><small>{paymentHint(method.id)}</small></span>
                      {selected ? <span className={styles.selectedCheck}><Icon name="check" /></span> : null}
                    </button>
                  )
                })}
              </div>
            </section>

            <section className={styles.paymentContext} data-checkout-payment-context>
              <span className={styles.contextIcon}><PaymentIcon method={props.paymentMethod} /></span>
              <div className={styles.contextCopy}><h3>{isCash ? 'الدفع النقدي' : `تم الاختيار: ${selectedPayment?.label || 'الدفع'}`}</h3><p>{selectedPaymentCopy(props.paymentMethod)}</p></div>
              {isCash ? (
                <div className={styles.cashFields}>
                  <label><span>المبلغ المستلم</span><input type="number" min="0" step="0.01" value={props.cashReceived} onChange={(event) => props.onCashReceivedChange(event.target.value)} inputMode="decimal" placeholder="0.00" disabled={props.loading} /></label>
                  <div><span>الباقي للعميل</span><b>{formatCurrency(props.cashChange)}</b></div>
                  <div className={props.remainingFromCustomer > 0 ? styles.warningField : undefined}><span>المتبقي</span><b>{formatCurrency(props.remainingFromCustomer)}</b></div>
                </div>
              ) : <div className={styles.contextStatus}><b>{formatCurrency(props.finalTotal)}</b><span className={styles.paymentReady}>جاهز للتحصيل</span></div>}
              {props.cashWarning ? <p className={styles.warning}>{props.cashWarning}</p> : null}
            </section>

            <section className={styles.options}>
              <div className={styles.discountOptions}>
                <span>الخصم</span>
                <div>
                  <button type="button" className={!props.selectedDiscount ? styles.selectedOption : undefined} disabled={props.loading || props.loadingDiscounts} onClick={() => props.onDiscountChange(null)}>بدون خصم</button>
                  {props.discounts.map((discount) => (
                    <button type="button" className={props.selectedDiscount?.id === discount.id ? styles.selectedOption : undefined} disabled={props.loading || props.loadingDiscounts} key={discount.id} onClick={() => props.onDiscountChange(discount)}>
                      {discount.type === 'percentage' ? `${discount.name} (${discount.value}%)` : `${discount.name} (${formatCurrency(discount.value)})`}
                    </button>
                  ))}
                </div>
                <small>{props.loadingDiscounts ? 'جارٍ تحميل الخصومات…' : selectedDiscountLabel}</small>
              </div>

              <label className={styles.noteField}>
                <span><Icon name="note" /> ملاحظة (اختيارية)</span>
                <textarea value={props.note} onChange={(event) => props.onNoteChange(event.target.value)} placeholder="يمكنك إضافة أي ملاحظة تتعلق بالطلب" disabled={props.loading} />
              </label>
            </section>

            {props.errorMessage ? <div className={`${styles.message} ${styles.error}`} role="alert">{props.errorMessage}</div> : null}
            {props.offlineMessage ? <div className={styles.message}>{props.offlineMessage}</div> : null}
          </div>
        </section>
      </div>

      <div className={styles.actionDock} data-checkout-action-dock>
        <button type="button" className={styles.submit} disabled={!props.canSubmit || props.loading} onClick={props.onSubmit}>
          <Icon name="receipt" /><span>{props.loading ? 'جارٍ إنشاء الفاتورة…' : `إنشاء الفاتورة — ${formatCurrency(props.finalTotal)}`}</span>
        </button>
      </div>

      {summaryOpen ? (
        <div className={styles.drawerBackdrop} onMouseDown={() => setSummaryOpen(false)}>
          <div ref={dialogRef} className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="checkout-summary-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <h2 id="checkout-summary-title">ملخص الطلب</h2>
              <button ref={closeButtonRef} type="button" onClick={() => setSummaryOpen(false)} aria-label="إغلاق ملخص الطلب"><Icon name="close" /><span>إغلاق</span></button>
            </div>
            <div className={styles.drawerBody}><SummaryContents {...props} /></div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

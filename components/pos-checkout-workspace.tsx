'use client'

import type { InvoiceLineItem } from '@/lib/invoices/items'
import type { CheckoutDiscountOption } from '@/hooks/use-invoice-checkout'
import { formatCurrency } from '@/lib/orders/format'
import { PAYMENT_METHODS, type PosPaymentMethod } from '@/lib/invoices/payment-method'

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
  onBack: () => void
  onPaymentChange: (method: PosPaymentMethod) => void
  onCashReceivedChange: (value: string) => void
  onDiscountChange: (discount: CheckoutDiscountOption | null) => void
  onNoteChange: (value: string) => void
  onSubmit: () => void
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 4 ? `••• ••• ${digits.slice(-4)}` : 'غير متوفر'
}

function paymentHint(method: PosPaymentMethod) {
  if (method === 'mada') return 'شبكة الدفع المحلية'
  if (method === 'cash') return 'أدخل المبلغ المستلم'
  if (method === 'visa') return 'بطاقة ائتمانية'
  return 'تحصيل عند الاستلام'
}

function paymentMark(method: PosPaymentMethod) {
  if (method === 'mada') return 'M'
  if (method === 'cash') return 'ر.س'
  if (method === 'visa') return 'V'
  return '↗'
}

export function PosCheckoutWorkspace(props: Props) {
  const selectedPayment = PAYMENT_METHODS.find((method) => method.id === props.paymentMethod)
  const isCash = props.paymentMethod === 'cash'
  const selectedDiscountLabel = props.selectedDiscount
    ? props.selectedDiscount.type === 'percentage'
      ? `${props.selectedDiscount.name} (${props.selectedDiscount.value}%)`
      : `${props.selectedDiscount.name} (${formatCurrency(props.selectedDiscount.value)})`
    : 'بدون خصم'

  return (
    <main className="afex-checkout-workspace" dir="rtl">
      <header className="afex-checkout-header">
        <div><p>فاتورة جديدة</p><h1>الدفع وإنهاء الفاتورة</h1></div>
        <button type="button" onClick={props.onBack}>العودة إلى السلة</button>
      </header>

      <div className="afex-checkout-layout">
        <aside className="afex-checkout-summary">
          <div className="afex-checkout-section-heading"><h2>ملخص الطلب</h2><span>{props.items.length} عناصر</span></div>
          <div className="afex-checkout-customer"><span>{props.customerName.slice(0, 1) || 'ع'}</span><div><strong>{props.customerName || 'لم يُحدد عميل'}</strong><small dir="ltr">{maskPhone(props.customerPhone)}</small><em>{props.customerId ? 'معرّف العميل مرتبط' : 'العميل غير مكتمل'}</em></div></div>
          <div className="afex-checkout-items">
            {props.items.map((item, index) => <div key={item.item_id ?? `${item.item_name}-${index}`}><span><strong>{item.item_name}</strong><small>{item.quantity} × {formatCurrency(item.unit_price)}</small></span><b>{formatCurrency(item.quantity * item.unit_price)}</b></div>)}
          </div>
          <div className="afex-checkout-totals">
            <div><span>المجموع الفرعي</span><b>{formatCurrency(props.subtotal)}</b></div>
            <div><span>الضريبة</span><b>{formatCurrency(props.taxAmount)}</b></div>
            <div><span>الخصم</span><b>{formatCurrency(props.discountAmount)}</b></div>
            <div className="is-total"><span>الإجمالي</span><b>{formatCurrency(props.finalTotal)}</b></div>
          </div>
        </aside>

        <section className="afex-checkout-payment">
          <div className="afex-checkout-due"><span>الإجمالي المستحق</span><strong>{formatCurrency(props.finalTotal)}</strong></div>
          <div className="afex-checkout-mobile-summary"><span>{props.items.length} عناصر</span><b>شامل ضريبة {formatCurrency(props.taxAmount)}</b><button type="button" onClick={props.onBack}>عرض تفاصيل الطلب</button></div>

          <h2>طريقة الدفع</h2>
          <div className="afex-payment-methods">
            {PAYMENT_METHODS.map((method) => {
              const selected = props.paymentMethod === method.id
              return <button key={method.id} type="button" aria-pressed={selected} className={selected ? 'is-selected' : ''} disabled={props.loading} onClick={() => props.onPaymentChange(method.id)}><span>{paymentMark(method.id)}</span><div><strong>{method.label}</strong><small>{selected ? 'محدد • ' : ''}{paymentHint(method.id)}</small></div><i aria-hidden="true" /></button>
            })}
          </div>

          <div className="afex-payment-detail">
            <div className="afex-payment-detail-heading"><div><h3>{isCash ? 'الدفع النقدي' : `تحصيل عبر ${selectedPayment?.label || 'الدفع'}`}</h3><p>{isCash ? 'أدخل المبلغ المستلم لحساب المتبقي أو الباقي.' : paymentHint(props.paymentMethod)}</p></div><strong>{formatCurrency(props.finalTotal)}</strong></div>
            {isCash ? <div className="afex-cash-fields"><label><span>المبلغ المستلم</span><input value={props.cashReceived} onChange={(event) => props.onCashReceivedChange(event.target.value)} inputMode="decimal" placeholder="0.00" disabled={props.loading} /></label><div><span>الباقي للعميل</span><b>{formatCurrency(props.cashChange)}</b></div><div className={props.remainingFromCustomer > 0 ? 'is-warning' : ''}><span>المتبقي</span><b>{formatCurrency(props.remainingFromCustomer)}</b></div></div> : <span className="afex-payment-ready">جاهز للتحصيل</span>}
            {props.cashWarning ? <p className="afex-checkout-warning">{props.cashWarning}</p> : null}
          </div>

          <div className="afex-checkout-options">
            <div className="afex-discount-options"><span>الخصم</span><div><button type="button" className={!props.selectedDiscount ? 'is-selected' : ''} disabled={props.loading || props.loadingDiscounts} onClick={() => props.onDiscountChange(null)}>بدون خصم</button>{props.discounts.map((discount) => <button type="button" className={props.selectedDiscount?.id === discount.id ? 'is-selected' : ''} disabled={props.loading || props.loadingDiscounts} key={discount.id} onClick={() => props.onDiscountChange(discount)}>{discount.type === 'percentage' ? `${discount.name} (${discount.value}%)` : `${discount.name} (${formatCurrency(discount.value)})`}</button>)}</div><small>{selectedDiscountLabel}</small></div>
            <label><span>ملاحظة</span><textarea value={props.note} onChange={(event) => props.onNoteChange(event.target.value)} placeholder="ملاحظة اختيارية" disabled={props.loading} /></label>
          </div>

          {props.errorMessage ? <div className="afex-checkout-message is-error" role="alert">{props.errorMessage}</div> : null}
          {props.offlineMessage ? <div className="afex-checkout-message">{props.offlineMessage}</div> : null}
          <div className="afex-checkout-once">يُنشأ الطلب مرة واحدة فقط — لا تغلق الشاشة أثناء المعالجة</div>
          <button type="button" className="afex-checkout-submit" disabled={!props.canSubmit || props.loading} onClick={props.onSubmit}>{props.loading ? 'جارٍ إنشاء الفاتورة…' : `إنشاء الفاتورة — ${formatCurrency(props.finalTotal)}`}</button>
          <p className="afex-checkout-submit-note">لن يُعتبر الطلب ناجحًا قبل استجابة الخادم.</p>
        </section>
      </div>
    </main>
  )
}

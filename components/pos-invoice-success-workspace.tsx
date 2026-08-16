'use client'

import { useState } from 'react'
import type { InvoiceSuccessSnapshot } from '@/lib/invoices/success'
import { getPaymentMethodLabel } from '@/lib/invoices/payment-method'
import { formatCurrency } from '@/lib/orders/format'

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

function whatsappStatus(props: Props) {
  if (!props.snapshot.customerPhone) return 'لا يوجد رقم صالح للمشاركة'
  if (!props.whatsappEnabled) return 'المشاركة غير متاحة من إعدادات النظام'
  if (props.whatsappOpening) return 'جارٍ تجهيز رابط المشاركة…'
  if (props.actionMessage === 'HANDOFF_OPENED') return 'تم فتح نافذة المشاركة — لم يُثبت التسليم'
  if (props.actionMessage === 'SKIPPED_INVALID_PHONE') return 'تعذر تجهيز الرقم للمشاركة'
  if (props.actionMessage) return props.actionMessage
  return 'جاهز للمشاركة — لا يُثبت التسليم إلا بدليل المزود'
}

function paymentStatus(snapshot: InvoiceSuccessSnapshot) {
  if (snapshot.paymentMethod === 'cod') return 'مستحق عند الاستلام'
  if (snapshot.remainingFromCustomer > 0) return `متبقٍ ${formatCurrency(snapshot.remainingFromCustomer)}`
  return 'مدفوع'
}

export function PosInvoiceSuccessWorkspace(props: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const { snapshot } = props

  return (
    <main className="afex-success-workspace receipt-print-hide" dir="rtl">
      <header className="afex-success-header"><h1>اكتملت العملية</h1><span>نقطة البيع • الفاتورة محفوظة</span></header>

      <div className="afex-success-layout">
        <aside className={`afex-success-receipt ${detailsOpen ? 'is-open' : ''}`}>
          <div className="afex-success-receipt-heading"><h2>فاتورة ضريبية مبسطة</h2><p>AFEX — نقطة البيع</p></div>
          <dl className="afex-success-meta">
            <div><dt>رقم الفاتورة</dt><dd dir="ltr">{snapshot.invoiceNumber || '—'}</dd></div>
            <div><dt>رقم الطلب</dt><dd dir="ltr">{snapshot.orderNumber || '—'}</dd></div>
            <div><dt>طريقة الدفع</dt><dd>{getPaymentMethodLabel(snapshot.paymentMethod)}</dd></div>
            <div><dt>الحالة</dt><dd className="is-success">{paymentStatus(snapshot)}</dd></div>
            <div><dt>العميل</dt><dd>{snapshot.customerName || '—'}</dd></div>
            <div><dt>التاريخ</dt><dd>{props.issuedAtLabel}</dd></div>
          </dl>
          <div className="afex-success-items">
            {snapshot.invoiceItems.map((item, index) => (
              <div key={item.item_id ?? `${item.item_name}-${index}`}><span><strong>{item.item_name}</strong><small>{item.item_type === 'service' ? 'خدمة' : 'منتج'} • {item.quantity} × {formatCurrency(item.unit_price)}</small></span><b>{formatCurrency(item.quantity * item.unit_price)}</b></div>
            ))}
          </div>
          <dl className="afex-success-totals">
            <div><dt>المجموع الفرعي</dt><dd>{formatCurrency(snapshot.subtotal)}</dd></div>
            <div><dt>الضريبة</dt><dd>{formatCurrency(snapshot.tax)}</dd></div>
            <div><dt>الخصم</dt><dd>{formatCurrency(snapshot.discount)}</dd></div>
            {snapshot.paymentMethod === 'cash' && snapshot.cashChange > 0 ? <div><dt>الباقي للعميل</dt><dd>{formatCurrency(snapshot.cashChange)}</dd></div> : null}
            <div className="is-total"><dt>الإجمالي</dt><dd>{formatCurrency(snapshot.finalTotal)}</dd></div>
          </dl>
        </aside>

        <section className="afex-success-actions">
          <div className="afex-success-title"><span aria-hidden="true">✓</span><h2>تم إنشاء الفاتورة</h2><strong dir="ltr">{snapshot.invoiceNumber || snapshot.orderNumber || '—'}</strong><p>تم تنفيذ الطلب مرة واحدة وحفظ نتيجته بنجاح.</p></div>

          <div className="afex-success-mobile-card">
            <div><span>الإجمالي</span><b>{formatCurrency(snapshot.finalTotal)}</b></div>
            <div><span>الدفع</span><b>{getPaymentMethodLabel(snapshot.paymentMethod)} — {paymentStatus(snapshot)}</b></div>
            <p>{snapshot.invoiceItems.length === 1 ? 'عنصر واحد' : `${snapshot.invoiceItems.length} عناصر`} • رقم الطلب <span dir="ltr">{snapshot.orderNumber || '—'}</span></p>
          </div>

          <h3>الخطوة التالية</h3>
          <div className="afex-success-action-grid">
            <button type="button" className="is-whatsapp" disabled={!snapshot.customerPhone || !props.whatsappEnabled || props.whatsappOpening} onClick={props.onWhatsApp}><span>و</span><div><strong>إرسال عبر WhatsApp</strong><small>{whatsappStatus(props)}</small></div></button>
            <button type="button" disabled={!props.printingEnabled || props.printing} onClick={props.onPrint}><span>ط</span><div><strong>{props.printing ? 'جارٍ التجهيز…' : 'طباعة الإيصال'}</strong><small>{props.printingEnabled ? 'نسخة حرارية / حوار الطباعة' : 'الطابعة غير متاحة'}</small></div></button>
            <button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((current) => !current)}><span>←</span><div><strong>{detailsOpen ? 'إخفاء التفاصيل' : 'عرض الفاتورة'}</strong><small>تفاصيل الفاتورة المحفوظة</small></div></button>
          </div>

          {props.actionMessage ? <p className="afex-success-action-message" role="status">{whatsappStatus(props)}</p> : null}
          <button type="button" className="afex-success-new-sale" onClick={props.onNewSale}><span aria-hidden="true">＋</span>بدء عملية بيع جديدة</button>
          <p className="afex-success-new-sale-note">يمسح مسودة البيع المكتملة فقط، ولا يعيد الطلب السابق.</p>
          <div className="afex-success-footer-status"><span>عودة تلقائية إلى POS خلال <b dir="ltr">00:{String(props.redirectCountdown).padStart(2, '0')}</b></span><button type="button" onClick={props.onBackToPos}>العودة الآن</button></div>
        </section>
      </div>
    </main>
  )
}

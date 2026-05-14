'use client'

import type { InvoiceSuccessSnapshot } from '@/lib/invoices/success'
import { getPaymentMethodLabel } from '@/lib/invoices/payment-method'
import { formatCurrency } from '@/lib/orders/format'

type ReceiptViewProps = {
  snapshot: InvoiceSuccessSnapshot
  storeName?: string
}

export function ReceiptView({
  snapshot,
  storeName = 'AFEX',
}: ReceiptViewProps) {
  const issuedAtLabel = new Intl.DateTimeFormat('ar-SA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(snapshot.createdAt || new Date().toISOString()))

  return (
    <section
      id="receipt-print-area"
      className="receipt-print-root mx-auto w-full max-w-none rounded-2xl border border-slate-200 bg-white p-4 text-right shadow-sm md:p-4"
    >
      <div className="mb-4 text-center">
        <h2 className="text-xl font-black text-slate-950 md:text-2xl">{storeName}</h2>
        <p className="mt-1 text-sm text-slate-500">{issuedAtLabel}</p>
      </div>

      <div className="space-y-2 border-b border-slate-200 pb-3 text-sm">
        {snapshot.invoiceItems.map((item, index) => (
          <div
            key={`${item.item_name}-${index}`}
            className="grid grid-cols-[minmax(0,1fr)_56px_84px] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_64px_96px]"
          >
            <span className="min-w-0 break-words font-medium text-slate-900">
              {item.item_name}
            </span>
            <span className="text-center text-slate-600">x{item.quantity}</span>
            <span className="text-left font-semibold text-slate-900">
              {formatCurrency(item.unit_price)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-2 text-sm">
        <ReceiptRow label="إجمالي العناصر" value={formatCurrency(snapshot.subtotal)} />
        <ReceiptRow label="الخصم" value={formatCurrency(snapshot.discount)} />
        <ReceiptRow label="الضريبة" value={formatCurrency(snapshot.tax)} />
        <ReceiptRow
          label="طريقة الدفع"
          value={getPaymentMethodLabel(snapshot.paymentMethod)}
        />
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <div className="flex items-center justify-between gap-4 text-lg font-black text-slate-950">
          <span>الإجمالي</span>
          <span>{formatCurrency(snapshot.finalTotal)}</span>
        </div>
      </div>
    </section>
  )
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  )
}

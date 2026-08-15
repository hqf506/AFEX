'use client'

import { InvoiceItemsStep } from '@/components/invoice-items-step'

export default function PosSaleItemsPage() {
  return (
    <div className="pos-items-page">
      <style jsx global>{`
        .afex-pos-shell-content:has(.pos-items-page),
        .afex-pos-shell-content:has(.pos-items-page) .afex-pos-route-content,
        .pos-items-page {
          height: 100%;
          min-height: 0;
          overflow: hidden;
        }
      `}</style>

      <InvoiceItemsStep
        heroTitle="اختيار العناصر وإتمام البيع"
        heroSubtitle="نقطة البيع"
        heroDescription="أضف العناصر ثم تابع إلى الدفع."
        primaryBackHref="/pos/sale/customer"
        primaryBackLabel="العودة إلى بيانات العميل"
        secondaryBackHref="/pos"
        secondaryBackLabel="العودة إلى نقطة البيع"
        customerStepHref="/pos/sale/customer"
        originBadgeLabel="POS"
        checkoutMode="separate"
        checkoutHref="/pos/sale/checkout"
        showPosStepIndicator
        variant="pos"
      />
    </div>
  )
}

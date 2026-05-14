'use client'

import { InvoiceItemsStep } from '@/components/invoice-items-step'

export default function PosSaleItemsPage() {
  return (
    <div className="pos-items-page">
      <style jsx global>{`
        body:has(.pos-items-page) .app-shell .page-wrap > .mx-auto {
          max-width: 90rem !important;
        }

        body:has(.pos-items-page) .app-shell .page-wrap main.text-right {
          margin-top: 0 !important;
        }

        body:has(.pos-items-page) .app-shell .page-wrap main > .space-y-5,
        body:has(.pos-items-page) .app-shell .page-wrap main > .md\\:space-y-6 {
          margin-top: 0 !important;
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

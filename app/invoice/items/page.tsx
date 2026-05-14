'use client'

import { InvoiceItemsStep } from '@/components/invoice-items-step'

export default function InvoiceItemsPage() {
  return (
    <div className="app-shell">
      <div className="page-wrap">
        <InvoiceItemsStep
          heroTitle="شاشة البيع السريع POS"
          heroSubtitle="AFEX"
          heroDescription="أنشئ الفاتورة للعميل الحالي ثم راجع العناصر والدفع من نفس الشاشة."
          primaryBackHref="/invoice/new"
          primaryBackLabel="العودة إلى القائمة السابقة"
          secondaryBackHref="/"
          secondaryBackLabel="العودة إلى القائمة الرئيسية"
          customerStepHref="/invoice/new"
          originBadgeLabel="مسار الفواتير"
        />
      </div>
    </div>
  )
}

'use client'

import { InvoiceItemsStep } from '@/components/invoice-items-step'
import styles from './items-page.module.css'

export default function PosSaleItemsPage() {
  return (
    <div className={`pos-items-page ${styles.page}`}>
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

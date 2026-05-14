'use client'

import { InvoiceCustomerStep } from '@/components/invoice-customer-step'

export default function PosSaleCustomerPage() {
  return (
    <InvoiceCustomerStep
      heroTitle="بدء عملية بيع"
      heroSubtitle="نقطة البيع"
      sectionTitle="بيانات العميل"
      sectionSubtitle="أدخل بيانات العميل أو اختر عميلًا موجودًا."
      backHref="/pos"
      backLabel="العودة إلى نقطة البيع"
      nextHref="/pos/sale/items"
      originBadgeLabel="POS"
      showPosStepIndicator
      variant="pos"
    />
  )
}

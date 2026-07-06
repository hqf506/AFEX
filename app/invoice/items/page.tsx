'use client'

import { FeatureDisabledState } from '@/components/feature-disabled-state'
import { InvoiceItemsStep } from '@/components/invoice-items-step'
import { useSystemSettings } from '@/hooks/use-system-settings'

export default function InvoiceItemsPage() {
  const { settings, loading } = useSystemSettings()

  if (!loading && settings?.enable_invoices === false) {
    return (
      <FeatureDisabledState
        title="ميزة الفواتير غير مفعلة"
        message="تم تعطيل الفواتير من إعدادات النظام."
      />
    )
  }

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

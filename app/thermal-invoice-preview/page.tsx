'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createThermalInvoiceSettingsPayload,
  type SystemSettings,
  type ThermalInvoiceSettingsPayload,
} from '@/lib/admin/settings'
import { usePageAccess } from '@/hooks/use-page-access'
import { renderThermalInvoiceHtml } from '@/lib/invoices/thermal-template'
import {
  fitThermalPreviewIframe,
  getThermalPreviewWidth,
  prepareThermalInvoicePreviewHtml,
} from '@/lib/invoices/thermal-preview'

function displayAfexText(value?: string | null) {
  return value?.replace(/leather\s*[- ]?\s*fix/gi, 'AFEX') ?? ''
}

function buildSampleThermalPreviewHtml(
  form: ThermalInvoiceSettingsPayload,
  settings: SystemSettings | null
) {
  const html = renderThermalInvoiceHtml({
    thermalLogoUrl: form.logo_url,
    thermalBrandName: displayAfexText(form.thermal_invoice_brand_name),
    thermalBranchName: displayAfexText(form.thermal_invoice_branch_name),
    addressLine1: form.digital_invoice_address_line_1,
    addressLine2: form.digital_invoice_address_line_2,
    thermalPaperWidth:
      form.thermal_invoice_paper_width === '58mm' ? '58mm' : '80mm',
    thermalShowCustomerPhone: form.thermal_invoice_show_customer_phone,
    thermalShowPaymentMethod: form.thermal_invoice_show_payment_method,
    thermalShowNote: form.thermal_invoice_show_note,
    thermalNote: form.thermal_invoice_note,
    thermalFooterMessage: form.thermal_invoice_footer_message,
    thermalShowWhatsapp: form.thermal_invoice_show_whatsapp,
    thermalShowInstagram: form.thermal_invoice_show_instagram,
    thermalShowTiktok: form.thermal_invoice_show_tiktok,
    thermalShowGoogleReview: form.thermal_invoice_show_google_review,
    thermalShowMap: form.thermal_invoice_show_map,
    whatsappNumber: form.digital_invoice_whatsapp_number,
    instagramLink: settings?.digital_invoice_instagram_link ?? '',
    tiktokLink: settings?.digital_invoice_tiktok_link ?? '',
    googleReviewLink: settings?.digital_invoice_google_review_link ?? '',
    mapLink: form.digital_invoice_map_link,
    customerName: 'عميل تجريبي',
    customerPhone: '0500000000',
    invoiceNumber: 'PREVIEW-001',
    issuedAt: new Date().toISOString(),
    paymentMethod: 'شبكة',
    invoiceItems: [
      { name: 'تنظيف جلد', quantity: 1, price: 120 },
      { name: 'إصلاح شنطة جلد', quantity: 1, price: 240 },
    ],
    subtotal: 360,
    taxAmount: 54,
    finalTotal: 414,
  })

  return prepareThermalInvoicePreviewHtml(
    html,
    form.thermal_invoice_paper_width
  )
}

export default function ThermalInvoicePreviewPage() {
  const access = usePageAccess(['admin'])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [form, setForm] = useState<ThermalInvoiceSettingsPayload>(() =>
    createThermalInvoiceSettingsPayload(null)
  )
  const [thermalPreviewHeight, setThermalPreviewHeight] = useState(360)

  const fetchSettings = useCallback(async () => {
    setLoading(true)

    try {
      const response = await fetch('/api/admin/system-settings', {
        method: 'GET',
        credentials: 'include',
      })
      const result = await response.json().catch(() => null)
      const settingsData =
        response.ok && result?.success ? (result.settings as SystemSettings | null) : null

      setSettings(settingsData)
      setForm(createThermalInvoiceSettingsPayload(settingsData))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!access.allowed) return

    const timeoutId = window.setTimeout(() => {
      void fetchSettings()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [access.allowed, fetchSettings])

  const previewHtml = useMemo(
    () => buildSampleThermalPreviewHtml(form, settings),
    [form, settings]
  )
  const thermalPreviewWidthPx = getThermalPreviewWidth(
    form.thermal_invoice_paper_width
  )

  if (access.loading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020817] text-sm font-black text-cyan-100">
        جاري تحميل المعاينة...
      </div>
    )
  }

  if (!access.allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020817] text-sm font-black text-cyan-100">
        جارٍ التحقق من الصلاحية...
      </div>
    )
  }

  return (
    <main className="flex min-h-screen items-start justify-center overflow-auto bg-[#020817] p-4">
      <iframe
        title="معاينة الفاتورة الحرارية"
        srcDoc={previewHtml}
        onLoad={(event) => {
          fitThermalPreviewIframe(
            event.currentTarget,
            setThermalPreviewHeight
          )
        }}
        scrolling="no"
        className="border-0 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
        style={{
          width: thermalPreviewWidthPx,
          height: thermalPreviewHeight,
        }}
      />
    </main>
  )
}

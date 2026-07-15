'use client'

import Link from 'next/link'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  createDigitalInvoiceSettingsPayload,
  createDigitalInvoiceSettingsSavePayload,
  type DigitalInvoiceSettingsPayload,
  type SystemSettings,
} from '@/lib/admin/settings'
import { usePageAccess } from '@/hooks/use-page-access'
import {
  DEFAULT_DIGITAL_INVOICE_SETTINGS,
  renderInvoiceHtmlFromPayload,
} from '@/lib/invoices/receipt-template'

const DIGITAL_INVOICE_TABS = [
  { id: 'identity', label: 'الهوية' },
  { id: 'contact', label: 'التواصل' },
  { id: 'colors', label: 'الألوان' },
  { id: 'note', label: 'الملاحظة' },
  { id: 'preview', label: 'المعاينة' },
] as const

const darkPanelClassName =
  'rounded-[28px] border border-cyan-300/15 bg-[#07111d]/90 p-5 shadow-[0_0_45px_rgba(34,211,238,0.08)] backdrop-blur-xl sm:p-6'

const darkCardClassName =
  'rounded-3xl border border-cyan-300/15 bg-[#0a1624]/85 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl'

const darkInputClassName =
  'h-12 w-full rounded-2xl border border-cyan-300/15 bg-[#091522]/90 px-4 text-right text-sm font-bold text-white outline-none transition placeholder:text-slate-500 hover:border-cyan-300/30 focus:border-cyan-300/55 focus:bg-[#0d1c2d] focus:ring-2 focus:ring-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-60'

const darkTextareaClassName =
  'min-h-[160px] w-full rounded-2xl border border-cyan-300/15 bg-[#091522]/90 px-4 py-3 text-right text-sm font-bold leading-7 text-white outline-none transition placeholder:text-slate-500 hover:border-cyan-300/30 focus:border-cyan-300/55 focus:bg-[#0d1c2d] focus:ring-2 focus:ring-cyan-300/15'

const darkSecondaryButtonClassName =
  'inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-cyan-300/15 bg-[#0b1725]/90 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:border-cyan-300/35 hover:bg-cyan-300/10 hover:text-white disabled:opacity-60'

const darkPrimaryButtonClassName =
  'inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 py-2.5 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.22)] transition hover:shadow-[0_0_42px_rgba(34,211,238,0.34)] disabled:opacity-60'

function displayAfexText(value?: string | null) {
  return value?.replace(/leather\s*[- ]?\s*fix/gi, 'AFEX') ?? ''
}

type DigitalInvoiceTabId = (typeof DIGITAL_INVOICE_TABS)[number]['id']

type LinkCardProps = {
  icon: ReactNode
  label: string
  enabled: boolean
  onToggle: (checked: boolean) => void
  value: string
  onChange: (value: string) => void
  placeholder: string
}

function resolveColorInputValue(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback
}

function sanitizeInvoicePreviewHtml(html: string) {
  return html
    .replace(
      /<link[^>]+href=["']https:\/\/fonts\.googleapis\.com[^>]*>/gi,
      ''
    )
    .replace(
      '</head>',
      `
  <style>
    html, body {
      background: #020617 !important;
      overflow: auto;
      padding: 16px 0;
      min-height: 100%;
    }

    .page {
      transform: scale(0.72);
      transform-origin: top center;
      margin: 0 auto -84mm !important;
      box-shadow: 0 22px 70px rgba(34, 211, 238, 0.16);
    }

    @media print {
      html, body {
        padding: 0;
        background: #fff !important;
      }

      .page {
        transform: none;
        margin: 0 auto !important;
        box-shadow: none;
      }
    }
  </style>
</head>`
    )
}

function InvoiceLinkCard({
  icon,
  label,
  enabled,
  onToggle,
  value,
  onChange,
  placeholder,
}: LinkCardProps) {
  return (
    <div className="rounded-2xl border border-cyan-300/15 bg-[#081522]/90 p-4 shadow-[0_18px_55px_rgba(0,0,0,0.22)] transition-all duration-200 ease-out hover:border-cyan-300/30 hover:bg-[#0b1b2c]">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.08)]">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">{label}</div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onToggle(!enabled)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
            enabled ? 'bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.22)]' : 'bg-slate-700'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-slate-950 shadow transition-all duration-200 ${
              enabled ? 'right-0.5' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!enabled}
        placeholder={placeholder}
        className={`${darkInputClassName} transition-all duration-200 ease-out ${
          !enabled ? 'cursor-not-allowed opacity-60' : 'opacity-100'
        }`}
      />
    </div>
  )
}

function buildSampleInvoicePreviewHtml(form: DigitalInvoiceSettingsPayload) {
  const html = renderInvoiceHtmlFromPayload({
    brandName: form.digital_invoice_brand_name,
    brandBackgroundColor: form.digital_invoice_brand_background_color,
    brandTextColor: form.digital_invoice_brand_text_color,
    branchName: form.digital_invoice_branch_name,
    addressLine1: form.digital_invoice_address_line_1,
    addressLine2: form.digital_invoice_address_line_2,
    whatsappNumber: form.digital_invoice_whatsapp_number,
    whatsappEnabled: form.digital_invoice_whatsapp_enabled,
    googleReviewLink: form.digital_invoice_google_review_link,
    googleReviewEnabled: form.digital_invoice_google_review_enabled,
    mapLink: form.digital_invoice_map_link,
    mapEnabled: form.digital_invoice_map_enabled,
    instagramEnabled: form.digital_invoice_instagram_enabled,
    instagramLink: form.digital_invoice_instagram_link,
    tiktokEnabled: form.digital_invoice_tiktok_enabled,
    tiktokLink: form.digital_invoice_tiktok_link,
    globalNote: form.digital_invoice_note,
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

  return sanitizeInvoicePreviewHtml(html)
}

export default function AdminDigitalInvoiceSettingsPage() {
  const access = usePageAccess(['admin'])
  const authLoading = access.loading
  const allowed = access.allowed

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [form, setForm] = useState<DigitalInvoiceSettingsPayload>(() =>
    createDigitalInvoiceSettingsPayload(null)
  )
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [activeTab, setActiveTab] = useState<DigitalInvoiceTabId>('identity')
  const [previewOpen, setPreviewOpen] = useState(false)

  const liveInvoicePreviewHtml = useMemo(
    () => buildSampleInvoicePreviewHtml(form),
    [form]
  )

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')

    try {
      const response = await fetch('/api/admin/system-settings', {
        method: 'GET',
        credentials: 'include',
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        setErrorMessage(result?.error || 'فشل تحميل إعدادات الفاتورة الرقمية')
        setLoading(false)
        return
      }

      const settingsData = result.settings as SystemSettings | null
      setSettings(settingsData)
      setForm(createDigitalInvoiceSettingsPayload(settingsData))
      setLoading(false)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'فشل تحميل إعدادات الفاتورة الرقمية'
      )
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!allowed) return

    const timeoutId = window.setTimeout(() => {
      void fetchSettings()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [allowed, fetchSettings])

  const updateField = <K extends keyof DigitalInvoiceSettingsPayload>(
    key: K,
    value: DigitalInvoiceSettingsPayload[K]
  ) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const resetForm = () => {
    setForm(createDigitalInvoiceSettingsPayload(settings))
  }

  const previewInvoice = () => {
    setPreviewOpen(true)
  }

  const saveSettings = async () => {
    if (saving) return

    setSaving(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const payload = createDigitalInvoiceSettingsSavePayload(form)
      const response = await fetch('/api/admin/system-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        setErrorMessage(result?.error || 'فشل حفظ إعدادات الفاتورة الرقمية')
        setSaving(false)
        return
      }

      const savedSettings = result.settings as SystemSettings
      setSettings(savedSettings)
      setForm(createDigitalInvoiceSettingsPayload(savedSettings))
      setSuccessMessage(result.message || 'تم حفظ إعدادات الفاتورة الرقمية بنجاح')
      setSaving(false)
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'فشل حفظ إعدادات الفاتورة الرقمية'
      )
      setSaving(false)
    }
  }

  if (authLoading) {
    return <div className={darkPanelClassName}>جارٍ التحقق من الصلاحية...</div>
  }

  if (!allowed) {
    return <div className={darkPanelClassName}>جارٍ التحويل...</div>
  }

  if (loading) {
    return <div className={darkPanelClassName}>جارٍ تحميل إعدادات الفاتورة الرقمية...</div>
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020617] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_30%)]" />
      <div className="relative space-y-5 py-6">
      {successMessage ? (
        <div className="mx-auto max-w-[1200px] rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-200 shadow-[0_0_28px_rgba(16,185,129,0.12)]">
          {successMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mx-auto max-w-[1200px] rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-200 shadow-[0_0_28px_rgba(244,63,94,0.12)]">
          {errorMessage}
        </div>
      ) : null}

      <div className="mx-auto max-w-[1200px] px-6">
        <div className={darkPanelClassName}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-200">
                AFEX Digital Invoice
              </div>
              <h1 className="text-2xl font-black text-white sm:text-3xl">تعديل الفاتورة الرقمية</h1>
              <p className="mt-2 text-sm font-medium text-slate-400">
                إعدادات قالب PDF / A4 المستخدم للطباعة والإرسال
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/admin/settings" className={darkSecondaryButtonClassName}>
                العودة إلى الإعدادات
              </Link>
              <button
                onClick={() => void fetchSettings()}
                className={darkSecondaryButtonClassName}
                type="button"
              >
                تحديث
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-6">
        <div className={`${darkPanelClassName} space-y-6`}>
          <div className="border-b border-cyan-300/10 pb-4">
            <div className="flex flex-wrap gap-2">
              {DIGITAL_INVOICE_TABS.map((tab) => {
                const isActive = activeTab === tab.id

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
                      isActive
                        ? 'border-cyan-300/50 bg-gradient-to-l from-cyan-300 to-emerald-300 text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.22)]'
                        : 'border-cyan-300/10 bg-[#091522]/80 text-slate-300 hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>

          {activeTab === 'identity' ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black text-white">هوية الفاتورة</h2>
                <span className="rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-200">
                  PDF / A4
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-200">اسم النشاط / العلامة التجارية</label>
                  <input
                    type="text"
                    value={displayAfexText(form.digital_invoice_brand_name)}
                    onChange={(e) =>
                      updateField('digital_invoice_brand_name', e.target.value)
                    }
                    className={darkInputClassName}
                    placeholder="اكتب اسم النشاط"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-200">اسم الفرع الظاهر</label>
                  <input
                    type="text"
                    value={displayAfexText(form.digital_invoice_branch_name)}
                    onChange={(e) =>
                      updateField('digital_invoice_branch_name', e.target.value)
                    }
                    className={darkInputClassName}
                    placeholder="اكتب اسم الفرع"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-200">سطر العنوان الأول</label>
                  <input
                    type="text"
                    value={form.digital_invoice_address_line_1}
                    onChange={(e) =>
                      updateField('digital_invoice_address_line_1', e.target.value)
                    }
                    className={darkInputClassName}
                    placeholder="اكتب العنوان"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-200">سطر العنوان الثاني</label>
                  <input
                    type="text"
                    value={form.digital_invoice_address_line_2}
                    onChange={(e) =>
                      updateField('digital_invoice_address_line_2', e.target.value)
                    }
                    className={darkInputClassName}
                    placeholder="اكتب العنوان"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'contact' ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-black text-white">التواصل</h2>
              </div>

              <div className={darkCardClassName}>
                <div className="mb-5">
                  <h3 className="text-base font-black text-emerald-200">
                    روابط أساسية
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    تظهر في الفاتورة
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <InvoiceLinkCard
                    icon={
                      <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
                        <path
                          fill="currentColor"
                          d="M16 .396C7.164.396 0 7.56 0 16.396c0 2.885.756 5.596 2.064 7.946L.104 32l7.83-2.046a15.95 15.95 0 007.999 2.16c8.836 0 16-7.164 16-16S24.836.396 16 .396zm0 29.09a13.03 13.03 0 01-6.63-1.82l-.475-.28-4.646 1.214 1.24-4.53-.308-.467A13.03 13.03 0 013.06 16.4c0-7.17 5.77-12.94 12.94-12.94 7.17 0 12.94 5.77 12.94 12.94 0 7.17-5.77 12.94-12.94 12.94zm7.49-9.68c-.41-.205-2.42-1.194-2.79-1.33-.37-.136-.64-.205-.91.205-.27.41-1.05 1.33-1.29 1.6-.24.27-.47.3-.88.1-.41-.205-1.74-.64-3.31-2.04-1.22-1.09-2.04-2.43-2.28-2.84-.24-.41-.026-.63.18-.83.185-.185.41-.47.615-.705.205-.235.27-.41.41-.68.136-.27.068-.51-.034-.705-.102-.205-.91-2.19-1.25-3-.33-.8-.66-.69-.91-.7h-.78c-.27 0-.705.1-1.07.51-.37.41-1.4 1.37-1.4 3.34 0 1.97 1.44 3.88 1.64 4.15.205.27 2.84 4.34 6.88 6.08.96.41 1.71.65 2.3.83.97.31 1.85.27 2.55.165.78-.116 2.42-.99 2.76-1.95.34-.96.34-1.78.24-1.95-.1-.17-.37-.27-.78-.47z"
                        />
                      </svg>
                    }
                    label="واتساب"
                    enabled={form.digital_invoice_whatsapp_enabled}
                    onToggle={(checked) =>
                      updateField('digital_invoice_whatsapp_enabled', checked)
                    }
                    value={form.digital_invoice_whatsapp_number}
                    onChange={(value) =>
                      updateField('digital_invoice_whatsapp_number', value)
                    }
                    placeholder="اكتب رقم الواتساب"
                  />

                  <InvoiceLinkCard
                    icon={
                      <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
                        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 3l5.7-5.7C33.6 6.1 29.1 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
                        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16.1 18.9 12 24 12c3 0 5.7 1.1 7.8 3l5.7-5.7C33.6 6.1 29.1 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.1C29.2 35.1 26.7 36 24 36c-5.3 0-9.8-3.4-11.4-8.1l-6.5 5C9.5 39.5 16.2 44 24 44z" />
                        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.1-3.3 5.6-6 7.3l6.2 5.1C39.9 36.7 44 30.9 44 24c0-1.3-.1-2.3-.4-3.5z" />
                      </svg>
                    }
                    label="Google تقييم"
                    enabled={form.digital_invoice_google_review_enabled}
                    onToggle={(checked) =>
                      updateField('digital_invoice_google_review_enabled', checked)
                    }
                    value={form.digital_invoice_google_review_link}
                    onChange={(value) =>
                      updateField('digital_invoice_google_review_link', value)
                    }
                    placeholder="اكتب الرابط"
                  />

                  <InvoiceLinkCard
                    icon={
                      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                        <path fill="#EA4335" d="M12 2C8.13 2 5 5.13 5 9c0 4.25 7 13 7 13s7-8.75 7-13c0-3.87-3.13-7-7-7z" />
                        <circle cx="12" cy="9" r="2.5" fill="#fff" />
                      </svg>
                    }
                    label="الموقع / الخريطة"
                    enabled={form.digital_invoice_map_enabled}
                    onToggle={(checked) =>
                      updateField('digital_invoice_map_enabled', checked)
                    }
                    value={form.digital_invoice_map_link}
                    onChange={(value) =>
                      updateField('digital_invoice_map_link', value)
                    }
                    placeholder="اكتب الرابط"
                  />
                </div>
              </div>

              <div className={darkCardClassName}>
                <div className="mb-5">
                  <h3 className="text-base font-black text-cyan-200">
                    روابط التواصل الاجتماعي
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    تظهر في الفوتر
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <InvoiceLinkCard
                    icon={
                      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                        <defs>
                          <linearGradient
                            id="contact-ig-gradient"
                            x1="0%"
                            y1="100%"
                            x2="100%"
                            y2="0%"
                          >
                            <stop offset="0%" stopColor="#feda75" />
                            <stop offset="35%" stopColor="#fa7e1e" />
                            <stop offset="65%" stopColor="#d62976" />
                            <stop offset="100%" stopColor="#4f5bd5" />
                          </linearGradient>
                        </defs>
                        <rect
                          x="2"
                          y="2"
                          width="20"
                          height="20"
                          rx="6"
                          fill="url(#contact-ig-gradient)"
                        />
                        <circle
                          cx="12"
                          cy="12"
                          r="4.2"
                          fill="none"
                          stroke="#fff"
                          strokeWidth="1.8"
                        />
                        <circle cx="17.3" cy="6.8" r="1.2" fill="#fff" />
                      </svg>
                    }
                    label="Instagram"
                    enabled={form.digital_invoice_instagram_enabled}
                    onToggle={(checked) =>
                      updateField('digital_invoice_instagram_enabled', checked)
                    }
                    value={form.digital_invoice_instagram_link}
                    onChange={(value) =>
                      updateField('digital_invoice_instagram_link', value)
                    }
                    placeholder="اكتب الرابط"
                  />

                  <InvoiceLinkCard
                    icon={
                      <svg
                        viewBox="0 0 24 24"
                        width="22"
                        height="22"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M12.75 2h2.5c.2 1.6 1.3 3 3 3.4v2.6c-1.3-.1-2.6-.5-3.8-1.2v6.5c0 3.4-2.8 6.2-6.2 6.2S2 16.7 2 13.3s2.8-6.2 6.2-6.2c.4 0 .8 0 1.2.1v2.7c-.4-.2-.8-.2-1.2-.2-2 0-3.7 1.7-3.7 3.7s1.7 3.7 3.7 3.7 3.7-1.7 3.7-3.7V2z" />
                      </svg>
                    }
                    label="TikTok"
                    enabled={form.digital_invoice_tiktok_enabled}
                    onToggle={(checked) =>
                      updateField('digital_invoice_tiktok_enabled', checked)
                    }
                    value={form.digital_invoice_tiktok_link}
                    onChange={(value) =>
                      updateField('digital_invoice_tiktok_link', value)
                    }
                    placeholder="اكتب الرابط"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'colors' ? (
            <div className="space-y-6">
              <h2 className="text-lg font-black text-white">ألوان الشعار</h2>

              <div className="grid gap-4 md:grid-cols-2">
                <div className={darkCardClassName}>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="mb-2 block text-sm font-bold text-slate-200">لون خلفية اسم النشاط</label>
                    <span
                      className="h-6 w-6 rounded-md border border-cyan-300/20 shadow-[0_0_18px_rgba(34,211,238,0.12)]"
                      style={{
                        backgroundColor: resolveColorInputValue(
                          form.digital_invoice_brand_background_color,
                          DEFAULT_DIGITAL_INVOICE_SETTINGS.brandBackgroundColor
                        ),
                      }}
                    />
                  </div>

                  <input
                    type="color"
                    value={resolveColorInputValue(
                      form.digital_invoice_brand_background_color,
                      DEFAULT_DIGITAL_INVOICE_SETTINGS.brandBackgroundColor
                    )}
                    onChange={(e) =>
                      updateField(
                        'digital_invoice_brand_background_color',
                        e.target.value
                      )
                    }
                    className="h-11 w-16 cursor-pointer rounded-xl border border-cyan-300/20 bg-[#07111d] p-1"
                    aria-label="لون خلفية اسم النشاط"
                  />
                </div>

                <div className={darkCardClassName}>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="mb-2 block text-sm font-bold text-slate-200">لون نص اسم النشاط</label>
                    <span
                      className="h-6 w-6 rounded-md border border-cyan-300/20 shadow-[0_0_18px_rgba(34,211,238,0.12)]"
                      style={{
                        backgroundColor: resolveColorInputValue(
                          form.digital_invoice_brand_text_color,
                          DEFAULT_DIGITAL_INVOICE_SETTINGS.brandTextColor
                        ),
                      }}
                    />
                  </div>

                  <input
                    type="color"
                    value={resolveColorInputValue(
                      form.digital_invoice_brand_text_color,
                      DEFAULT_DIGITAL_INVOICE_SETTINGS.brandTextColor
                    )}
                    onChange={(e) =>
                      updateField('digital_invoice_brand_text_color', e.target.value)
                    }
                    className="h-11 w-16 cursor-pointer rounded-xl border border-cyan-300/20 bg-[#07111d] p-1"
                    aria-label="لون نص اسم النشاط"
                  />
                </div>

                <div className={`${darkCardClassName} md:col-span-2`}>
                  <div className="mb-3 text-sm font-bold text-slate-300">
                    معاينة الشعار
                  </div>

                  <div
                    style={{
                      backgroundColor: resolveColorInputValue(
                        form.digital_invoice_brand_background_color,
                        DEFAULT_DIGITAL_INVOICE_SETTINGS.brandBackgroundColor
                      ),
                      color: resolveColorInputValue(
                        form.digital_invoice_brand_text_color,
                        DEFAULT_DIGITAL_INVOICE_SETTINGS.brandTextColor
                      ),
                      width: '180px',
                      height: '80px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '700',
                      fontSize: '20px',
                      borderRadius: '8px',
                      textAlign: 'center',
                      padding: '8px',
                    }}
                  >
                    {displayAfexText(form.digital_invoice_brand_name).trim() || 'اسم النشاط'}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'note' ? (
            <div className="space-y-6">
              <h2 className="text-lg font-black text-white">ملاحظة الفاتورة</h2>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-200">ملاحظة الفاتورة</label>
                <textarea
                  value={form.digital_invoice_note}
                  onChange={(e) =>
                    updateField('digital_invoice_note', e.target.value)
                  }
                  className={darkTextareaClassName}
                  placeholder="اكتب ملاحظة الفاتورة"
                />
              </div>
            </div>
          ) : null}

          {activeTab === 'preview' ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black text-white">معاينة الفاتورة</h2>
                <span className="rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-200">
                  Live
                </span>
              </div>

              <div className="overflow-hidden rounded-3xl border border-cyan-300/15 bg-[#020617] shadow-[0_0_35px_rgba(34,211,238,0.08)]">
                <iframe
                  title="معاينة الفاتورة الرقمية"
                  srcDoc={liveInvoicePreviewHtml}
                  className="h-[820px] w-full rounded-3xl bg-[#020617]"
                  sandbox="allow-same-origin"
                  style={{ border: 0 }}
                />
              </div>
            </div>
          ) : null}

          <div className="border-t border-cyan-300/10 pt-5">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={saveSettings}
                disabled={saving}
                className={darkPrimaryButtonClassName}
                type="button"
              >
                {saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
              </button>

              <button
                onClick={resetForm}
                disabled={saving}
                className={darkSecondaryButtonClassName}
                type="button"
              >
                استرجاع القيم الحالية
              </button>

              <button
                onClick={previewInvoice}
                disabled={saving}
                className={darkSecondaryButtonClassName}
                type="button"
              >
                معاينة الفاتورة
              </button>

              <Link href="/admin/settings" className={darkSecondaryButtonClassName}>
                العودة إلى الإعدادات
              </Link>
            </div>
          </div>
        </div>
      </div>

      {previewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020817]/80 p-3 backdrop-blur-md sm:p-5">
          <div className="flex h-[88vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-[28px] border border-cyan-300/25 bg-[#07111d]/95 shadow-[0_0_80px_rgba(34,211,238,0.18)]">
            <div className="flex items-center justify-between gap-4 border-b border-cyan-300/15 px-4 py-3 sm:px-5">
              <div className="text-right">
                <h3 className="text-lg font-black text-white">معاينة الفاتورة</h3>
                <p className="mt-1 text-xs font-bold text-cyan-100/70">
                  معاينة داخل إعدادات النظام
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/30 bg-[#091522]/80 text-cyan-100 transition hover:border-cyan-200/70 hover:bg-cyan-300/10 hover:text-white hover:shadow-[0_0_24px_rgba(34,211,238,0.22)] focus:outline-none focus:ring-2 focus:ring-cyan-300/25"
                aria-label="إغلاق المعاينة"
                title="إغلاق"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 bg-[#020817] p-2 sm:p-3">
              <iframe
                title="معاينة الفاتورة"
                srcDoc={liveInvoicePreviewHtml}
                className="h-full w-full rounded-[20px] border border-cyan-300/10 bg-white"
              />
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  )
}

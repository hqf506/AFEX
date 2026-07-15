'use client'

import Image from 'next/image'
import Link from 'next/link'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  createThermalInvoiceSettingsPayload,
  createThermalInvoiceSettingsSavePayload,
  type SystemSettings,
  type ThermalInvoiceSettingsPayload,
} from '@/lib/admin/settings'
import { AdminDarkSelect } from '@/components/admin-dark-select'
import { usePageAccess } from '@/hooks/use-page-access'
import { getClientErrorMessage } from '@/lib/api/client-error'
import {
  renderThermalInvoiceHtml,
} from '@/lib/invoices/thermal-template'
import {
  fitThermalPreviewIframe,
  getThermalPreviewWidth,
  prepareThermalInvoicePreviewHtml,
} from '@/lib/invoices/thermal-preview'
import { INVOICE_UX_MESSAGES } from '@/lib/invoice-ux-messages'
import { ADMIN_UX_MESSAGES } from '@/lib/admin-ux-messages'

const THERMAL_INVOICE_TABS = [
  { id: 'identity', label: 'الهوية' },
  { id: 'printing', label: 'الطباعة' },
  { id: 'content', label: 'المحتوى' },
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
  'min-h-[150px] w-full rounded-2xl border border-cyan-300/15 bg-[#091522]/90 px-4 py-3 text-right text-sm font-bold leading-7 text-white outline-none transition placeholder:text-slate-500 hover:border-cyan-300/30 focus:border-cyan-300/55 focus:bg-[#0d1c2d] focus:ring-2 focus:ring-cyan-300/15'

const darkSecondaryButtonClassName =
  'inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-cyan-300/15 bg-[#0b1725]/90 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:border-cyan-300/35 hover:bg-cyan-300/10 hover:text-white disabled:opacity-60'

const darkPrimaryButtonClassName =
  'inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 py-2.5 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.22)] transition hover:shadow-[0_0_42px_rgba(34,211,238,0.34)] disabled:opacity-60'

function displayAfexText(value?: string | null) {
  return value?.replace(/leather\s*[- ]?\s*fix/gi, 'AFEX') ?? ''
}

type ThermalInvoiceTabId = (typeof THERMAL_INVOICE_TABS)[number]['id']

type ToggleCardProps = {
  icon: ReactNode
  label: string
  description?: string
  enabled: boolean
  onToggle: (checked: boolean) => void
}

function ThermalToggleCard({
  icon,
  label,
  description,
  enabled,
  onToggle,
}: ToggleCardProps) {
  return (
    <div className="rounded-2xl border border-cyan-300/15 bg-[#081522]/90 p-4 shadow-[0_18px_55px_rgba(0,0,0,0.22)] transition-all duration-200 ease-out hover:border-cyan-300/30 hover:bg-[#0b1b2c]">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.08)]">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">{label}</div>
          {description ? (
            <div className="mt-1 text-xs text-slate-400">{description}</div>
          ) : null}
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
    </div>
  )
}

function ThermalLogoUploadCard({
  logoUrl,
  uploading,
  inputRef,
  onUpload,
  onRemove,
}: {
  logoUrl: string
  uploading: boolean
  inputRef: RefObject<HTMLInputElement | null>
  onUpload: (file?: File) => void
  onRemove: () => void
}) {
  const hasLogo = Boolean(logoUrl.trim())
  const [failedLogoUrl, setFailedLogoUrl] = useState('')
  const logoLoadFailed = Boolean(logoUrl && failedLogoUrl === logoUrl)

  return (
    <div className={`${darkCardClassName} md:col-span-2`}>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => onUpload(event.target.files?.[0])}
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#050d18]">
            {hasLogo && !logoLoadFailed ? (
              <Image
                src={logoUrl}
                alt="شعار الفاتورة الحرارية"
                width={80}
                height={80}
                unoptimized
                className="max-h-20 max-w-20 object-contain"
                onError={() => setFailedLogoUrl(logoUrl)}
              />
            ) : (
              <span className="px-3 text-center text-xs font-black text-slate-500">
                شعار
              </span>
            )}
          </div>
          {logoLoadFailed ? (
            <p role="alert" className="text-xs font-bold text-amber-200">
              {INVOICE_UX_MESSAGES.logoFailure}
            </p>
          ) : null}
          <div className="text-right">
            <h4 className="text-sm font-black text-white">شعار الفاتورة الحرارية</h4>
            <p className="mt-1 text-xs font-bold leading-6 text-slate-400">
              يفضل استخدام صورة بخلفية شفافة أو بيضاء
              <br />
              المقاس المقترح: 500 × 500 بكسل
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 sm:justify-end">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="h-10 rounded-2xl border border-cyan-300/35 bg-cyan-300/10 px-4 text-xs font-black text-cyan-100 transition hover:border-cyan-200/70 hover:bg-cyan-300/20 hover:text-white hover:shadow-[0_0_22px_rgba(34,211,238,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? 'جارٍ الرفع...' : hasLogo ? 'تغيير الصورة' : 'رفع الشعار'}
          </button>
          {hasLogo ? (
            <button
              type="button"
              onClick={onRemove}
              disabled={uploading}
              className="h-10 rounded-2xl border border-red-300/25 bg-red-400/10 px-4 text-xs font-black text-red-100 transition hover:border-red-200/60 hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              حذف الصورة
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
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

export default function AdminThermalInvoiceSettingsPage() {
  const access = usePageAccess(['admin'])
  const authLoading = access.loading
  const allowed = access.allowed

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [form, setForm] = useState<ThermalInvoiceSettingsPayload>(() =>
    createThermalInvoiceSettingsPayload(null)
  )
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const [activeTab, setActiveTab] = useState<ThermalInvoiceTabId>(() =>
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('tab') === 'preview'
      ? 'preview'
      : 'identity'
  )
  const [previewOpen, setPreviewOpen] = useState(false)
  const [thermalPreviewHeight, setThermalPreviewHeight] = useState(360)

  const livePreviewHtml = useMemo(
    () => buildSampleThermalPreviewHtml(form, settings),
    [form, settings]
  )
  const isNarrowPaper = form.thermal_invoice_paper_width === '58mm'
  const thermalPreviewWidthPx = getThermalPreviewWidth(
    form.thermal_invoice_paper_width
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
        setErrorMessage(result?.error || 'فشل تحميل إعدادات الفاتورة الحرارية')
        setLoading(false)
        return
      }

      const settingsData = result.settings as SystemSettings | null
      setSettings(settingsData)
      setForm(createThermalInvoiceSettingsPayload(settingsData))
      setLoading(false)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'فشل تحميل إعدادات الفاتورة الحرارية'
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

  const updateField = <K extends keyof ThermalInvoiceSettingsPayload>(
    key: K,
    value: ThermalInvoiceSettingsPayload[K]
  ) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const resetForm = () => {
    setForm(createThermalInvoiceSettingsPayload(settings))
  }

  const uploadLogo = async (file?: File) => {
    if (!file || uploadingLogo) return

    setUploadingLogo(true)
    setErrorMessage('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/admin/system-settings/upload-logo', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success || !result?.logoUrl) {
        setErrorMessage(getClientErrorMessage(result, 'تعذر رفع الشعار. تحقق من الاتصال وحجم الملف ثم حاول مرة أخرى.'))
        return
      }

      updateField('logo_url', result.logoUrl)
    } catch {
      setErrorMessage(INVOICE_UX_MESSAGES.logoFailure)
    } finally {
      setUploadingLogo(false)
      if (logoInputRef.current) {
        logoInputRef.current.value = ''
      }
    }
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
      const payload = createThermalInvoiceSettingsSavePayload(form)
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
        setErrorMessage(ADMIN_UX_MESSAGES.saveFailure)
        setSaving(false)
        return
      }

      const savedSettings = result.settings as SystemSettings
      setSettings(savedSettings)
      setForm(createThermalInvoiceSettingsPayload(savedSettings))
      setSuccessMessage(ADMIN_UX_MESSAGES.settingsSuccess)
      setSaving(false)
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch {
      setErrorMessage(ADMIN_UX_MESSAGES.saveFailure)
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
    return <div className={darkPanelClassName}>جارٍ تحميل إعدادات الفاتورة الحرارية...</div>
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
                AFEX Thermal Invoice
              </div>
              <h1 className="text-2xl font-black text-white sm:text-3xl">تعديل الفاتورة الحرارية</h1>
              <p className="mt-2 text-sm font-medium text-slate-400">
                إعدادات قالب الإيصال الحراري للطابعات الصغيرة
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
              {THERMAL_INVOICE_TABS.map((tab) => {
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
                <h2 className="text-lg font-black text-white">هوية الإيصال</h2>
                <span className="rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-200">الفاتورة الحرارية</span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ThermalLogoUploadCard
                  logoUrl={form.logo_url}
                  uploading={uploadingLogo}
                  inputRef={logoInputRef}
                  onUpload={(file) => void uploadLogo(file)}
                  onRemove={() => updateField('logo_url', '')}
                />

                <div className={darkCardClassName}>
                  <label className="mb-2 block text-sm font-bold text-slate-200">اسم العلامة في الفاتورة الحرارية</label>
                  <input
                    type="text"
                    value={displayAfexText(form.thermal_invoice_brand_name)}
                    onChange={(e) =>
                      updateField('thermal_invoice_brand_name', e.target.value)
                    }
                    className={darkInputClassName}
                    placeholder="يرجى إدخال اسم العلامة."
                  />
                </div>

                <div className={darkCardClassName}>
                  <label className="mb-2 block text-sm font-bold text-slate-200">اسم الفرع في الفاتورة الحرارية</label>
                  <input
                    type="text"
                    value={displayAfexText(form.thermal_invoice_branch_name)}
                    onChange={(e) =>
                      updateField('thermal_invoice_branch_name', e.target.value)
                    }
                    className={darkInputClassName}
                    placeholder="يرجى إدخال اسم الفرع."
                  />
                </div>

                <div className={darkCardClassName}>
                  <label className="mb-2 block text-sm font-bold text-slate-200">العنوان الأول في الفاتورة الحرارية</label>
                  <input
                    type="text"
                    value={form.digital_invoice_address_line_1}
                    onChange={(e) =>
                      updateField('digital_invoice_address_line_1', e.target.value)
                    }
                    className={darkInputClassName}
                    placeholder="يرجى إدخال العنوان الأول"
                  />
                </div>

                <div className={darkCardClassName}>
                  <label className="mb-2 block text-sm font-bold text-slate-200">العنوان الثاني في الفاتورة الحرارية</label>
                  <input
                    type="text"
                    value={form.digital_invoice_address_line_2}
                    onChange={(e) =>
                      updateField('digital_invoice_address_line_2', e.target.value)
                    }
                    className={darkInputClassName}
                    placeholder="يرجى إدخال العنوان الثاني"
                  />
                </div>

              </div>
            </div>
          ) : null}

          {activeTab === 'printing' ? (
            <div className="space-y-6">
              <h2 className="text-lg font-black text-white">الطباعة</h2>

              <div className={`${darkCardClassName} max-w-sm`}>
                <label className="mb-2 block text-sm font-bold text-slate-200">عرض الورق</label>
                <AdminDarkSelect
                  value={form.thermal_invoice_paper_width}
                  onChange={(value) =>
                    updateField('thermal_invoice_paper_width', value)
                  }
                  options={[
                    { value: '80mm', label: '80mm' },
                    { value: '58mm', label: '58mm' },
                  ]}
                  ariaLabel="عرض الورق"
                  triggerClassName="bg-[#0b1422]/90 hover:bg-cyan-300/10"
                />
              </div>
            </div>
          ) : null}

          {activeTab === 'content' ? (
            <div className="space-y-6">
              <h2 className="text-lg font-black text-white">المحتوى</h2>

              <div className="grid gap-4 md:grid-cols-2">
                <ThermalToggleCard
                  icon={
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-4.33 0-8 2.17-8 4.5V21h16v-2.5C20 16.17 16.33 14 12 14z"
                      />
                    </svg>
                  }
                  label="إظهار رقم العميل"
                  enabled={form.thermal_invoice_show_customer_phone}
                  onToggle={(checked) =>
                    updateField('thermal_invoice_show_customer_phone', checked)
                  }
                />

                <ThermalToggleCard
                  icon={
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M3 6h18v12H3zm2 2v8h14V8zm3 6h2v-2H8zm3 0h5v-2h-5z"
                      />
                    </svg>
                  }
                  label="إظهار طريقة الدفع"
                  enabled={form.thermal_invoice_show_payment_method}
                  onToggle={(checked) =>
                    updateField('thermal_invoice_show_payment_method', checked)
                  }
                />
              </div>
            </div>
          ) : null}

          {activeTab === 'note' ? (
            <div className="space-y-6">
              <h2 className="text-lg font-black text-white">الملاحظة</h2>

              <div className="max-w-md">
                <ThermalToggleCard
                  icon={
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M5 4h14v16l-7-3-7 3zm2 2v10.76l5-2.14 5 2.14V6z"
                      />
                    </svg>
                  }
                  label="إظهار الملاحظة"
                  enabled={form.thermal_invoice_show_note}
                  onToggle={(checked) =>
                    updateField('thermal_invoice_show_note', checked)
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className={darkCardClassName}>
                  <label className="mb-2 block text-sm font-bold text-slate-200">ملاحظة الفاتورة</label>
                  <textarea
                    value={form.thermal_invoice_note}
                    onChange={(e) =>
                      updateField('thermal_invoice_note', e.target.value)
                    }
                    className={darkTextareaClassName}
                    placeholder="يرجى إدخال ملاحظة الفاتورة."
                  />
                </div>

                <div className={darkCardClassName}>
                  <label className="mb-2 block text-sm font-bold text-slate-200">رسالة ختام الفاتورة</label>
                  <textarea
                    value={form.thermal_invoice_footer_message}
                    onChange={(e) =>
                      updateField('thermal_invoice_footer_message', e.target.value)
                    }
                    className={darkTextareaClassName}
                    placeholder="يرجى إدخال رسالة ختام الفاتورة."
                  />
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'preview' ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-white">معاينة الفاتورة الحرارية</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    تتحدث المعاينة مباشرة حسب الإعدادات الحالية قبل الحفظ.
                  </p>
                </div>
                <span className="rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-200">معاينة مباشرة</span>
              </div>

              <div className="rounded-3xl border border-cyan-300/15 bg-[#07111d]/90 p-5 shadow-[0_0_35px_rgba(34,211,238,0.08)]">
                <div className="mb-4 flex items-center justify-between text-sm text-slate-400">
                  <span>عرض الورق الحالي</span>
                  <span className="rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 font-bold text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.08)]">
                    {isNarrowPaper ? '58mm' : '80mm'}
                  </span>
                </div>

                <div className="flex justify-center overflow-auto rounded-3xl border border-cyan-500/15 bg-[#020817]/80 p-6 shadow-inner shadow-cyan-950/20 sm:p-8">
                  <div
                    className="overflow-hidden rounded-[3px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
                    style={{ width: thermalPreviewWidthPx }}
                  >
                    <iframe
                      title="معاينة الفاتورة الحرارية"
                      srcDoc={livePreviewHtml}
                      onLoad={(event) => {
                        fitThermalPreviewIframe(
                          event.currentTarget,
                          setThermalPreviewHeight
                        )
                      }}
                      scrolling="no"
                      className="block w-full bg-white"
                      sandbox="allow-same-origin"
                      style={{
                        border: 0,
                        height: thermalPreviewHeight,
                      }}
                    />
                  </div>
                </div>
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
          <div className="flex h-[88vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[28px] border border-cyan-300/25 bg-[#07111d]/95 shadow-[0_0_80px_rgba(34,211,238,0.18)]">
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
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#020817] p-4 sm:p-6">
              <iframe
                title="معاينة الفاتورة"
                srcDoc={livePreviewHtml}
                onLoad={(event) => {
                  fitThermalPreviewIframe(
                    event.currentTarget,
                    setThermalPreviewHeight
                  )
                }}
                scrolling="no"
                className="mx-auto block rounded-sm border-0 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
                style={{
                  width: thermalPreviewWidthPx,
                  height: thermalPreviewHeight,
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  )
}

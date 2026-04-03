'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createDefaultSystemSettingsForm,
  createSystemSettingsForm,
  createSystemSettingsSavePayload,
  resolveSystemSettingsSaveNames,
  type SystemSettings,
  type SystemSettingsForm,
} from '@/lib/admin/settings'
import { usePageAccess } from '@/hooks/use-page-access'

function maskSecret(value: string) {
  if (!value) return 'غير موجود'
  if (value.length <= 6) return '••••••'
  return `${value.slice(0, 3)}••••••${value.slice(-3)}`
}

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('ar-SA')
}

export default function AdminSettingsPage() {
  const access = usePageAccess(['admin'])
  const authLoading = access.loading
  const allowed = access.allowed
  const roleLabel =
    access.userRole === 'admin'
      ? 'أدمن'
      : access.userRole === 'employee'
      ? 'موظف'
      : access.userRole === 'cashier'
      ? 'كاشير'
      : ''

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [form, setForm] = useState<SystemSettingsForm>(() =>
    createDefaultSystemSettingsForm()
  )
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

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
        setErrorMessage(result?.error || 'فشل تحميل إعدادات النظام')
        setSettings(null)
        setLoading(false)
        return
      }

      const settingsData = result.settings as SystemSettings | null

      setSettings(settingsData)
      setForm(createSystemSettingsForm(settingsData))

      setLoading(false)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'فشل تحميل إعدادات النظام'
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

  const updateField = <K extends keyof SystemSettingsForm>(
    key: K,
    value: SystemSettingsForm[K]
  ) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const resetForm = () => {
    setForm(createSystemSettingsForm(settings))
  }

  const saveSettings = async () => {
    if (saving) return
    if (!settings) {
      setErrorMessage('تعذر قراءة الإعدادات الحالية')
      return
    }

    const { storeName: finalStoreName, branchName: finalBranchName } =
      resolveSystemSettingsSaveNames(form, settings)

    if (!finalStoreName) {
      setErrorMessage('اسم المحل مطلوب')
      return
    }

    if (!finalBranchName) {
      setErrorMessage('اسم الفرع مطلوب')
      return
    }

    setSaving(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const payload = createSystemSettingsSavePayload(form, settings)

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
        setErrorMessage(result?.error || 'فشل حفظ إعدادات النظام')
        setSaving(false)
        return
      }

      const savedSettings = result.settings as SystemSettings

      setSettings(savedSettings)
      setForm(createSystemSettingsForm(savedSettings))

      setSuccessMessage(result.message || 'تم حفظ إعدادات النظام بنجاح')
      setTimeout(() => setSuccessMessage(''), 3000)
      setSaving(false)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'فشل حفظ إعدادات النظام'
      )
      setSaving(false)
    }
  }

  const featureItems = useMemo(
    () => [
      {
        key: 'enable_whatsapp' as const,
        title: 'الواتساب',
        description: 'تشغيل أو إيقاف إرسال الواتساب من النظام',
      },
      {
        key: 'enable_printing' as const,
        title: 'الطباعة',
        description: 'تشغيل أو إيقاف الطباعة الحرارية والفواتير',
      },
      {
        key: 'enable_pos' as const,
        title: 'POS',
        description: 'تشغيل أو إيقاف شاشة البيع السريع',
      },
      {
        key: 'enable_invoices' as const,
        title: 'الفواتير',
        description: 'تشغيل أو إيقاف إنشاء الفواتير',
      },
      {
        key: 'enable_orders' as const,
        title: 'الطلبات',
        description: 'تشغيل أو إيقاف إدارة الطلبات',
      },
      {
        key: 'enable_reports' as const,
        title: 'التقارير',
        description: 'تشغيل أو إيقاف صفحة التقارير',
      },
      {
        key: 'enable_users' as const,
        title: 'المستخدمون',
        description: 'تشغيل أو إيقاف إدارة المستخدمين',
      },
    ],
    []
  )

  const providerMeta = useMemo(() => {
    if (form.whatsapp_provider === 'official') {
      return {
        title: 'WhatsApp Official',
        description:
          'هذا الوضع مناسب إذا كنت تستخدم واتساب الرسمي أو مزود رسمي مرتبط به.',
        firstFieldLabel: 'Phone Number ID / Sender ID',
        firstFieldPlaceholder: 'مثال: phone-number-id',
        secondFieldLabel: 'Access Token',
        secondFieldPlaceholder: 'مثال: official-access-token',
        thirdFieldLabel: 'API / Graph URL',
        thirdFieldPlaceholder: 'مثال: https://graph.facebook.com/...',
      }
    }

    if (form.whatsapp_provider === 'custom') {
      return {
        title: 'Custom',
        description:
          'هذا الوضع مناسب لو عندك API خاص أو مزود مختلف وتبي تربطه بالنظام.',
        firstFieldLabel: 'Reference / Instance Name',
        firstFieldPlaceholder: 'مثال: custom-instance',
        secondFieldLabel: 'Secret / Token',
        secondFieldPlaceholder: 'مثال: custom-secret-token',
        thirdFieldLabel: 'Webhook / API URL',
        thirdFieldPlaceholder: 'مثال: https://your-api.com/send',
      }
    }

    return {
      title: 'UltraMsg',
      description:
        'هذا الوضع مخصص لربط النظام مباشرة مع UltraMsg باستخدام بيانات الحساب الحالية.',
      firstFieldLabel: 'UltraMsg Instance ID',
      firstFieldPlaceholder: 'مثال: instance123456',
      secondFieldLabel: 'UltraMsg Token',
      secondFieldPlaceholder: 'مثال: token...',
      thirdFieldLabel: 'UltraMsg API URL',
      thirdFieldPlaceholder: 'مثال: https://api.ultramsg.com/instance...',
    }
  }, [form.whatsapp_provider])

  if (authLoading) {
    return (
      <div className="app-shell">
        <div className="page-wrap">
          <div className="page-card">جاري التحقق من الصلاحية...</div>
        </div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="app-shell">
        <div className="page-wrap">
          <div className="page-card">جارٍ التحويل...</div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="app-shell">
        <div className="page-wrap">
          <div className="page-card">جاري تحميل إعدادات النظام...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="page-wrap">
        {successMessage && <div className="success-alert">{successMessage}</div>}
        {errorMessage && <div className="error-alert">{errorMessage}</div>}

        <div className="page-hero">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="page-title">إعدادات النظام</h1>
              <p className="page-subtitle">
                تحكم باسم المحل والفرع والواتساب وتفعيل الميزات
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/" className="secondary-btn">
                العودة إلى القائمة الرئيسية
              </Link>
              <span className="badge badge-blue">الصلاحية: {roleLabel}</span>
              <button
                onClick={fetchSettings}
                className="secondary-btn"
                type="button"
              >
                تحديث
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <div className="page-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="section-title">معلومات المحل</h2>
                <span className="badge badge-slate">أساسي</span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="field-label">اسم المحل</label>
                  <input
                    type="text"
                    value={form.store_name}
                    onChange={(e) => updateField('store_name', e.target.value)}
                    className="field-input"
                    placeholder={settings?.store_name || 'اكتب اسم المحل'}
                  />
                </div>

                <div>
                  <label className="field-label">اسم الفرع</label>
                  <input
                    type="text"
                    value={form.branch_name}
                    onChange={(e) => updateField('branch_name', e.target.value)}
                    className="field-input"
                    placeholder={settings?.branch_name || 'اكتب اسم الفرع'}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="field-label">رابط الشعار</label>
                  <input
                    type="text"
                    value={form.logo_url}
                    onChange={(e) => updateField('logo_url', e.target.value)}
                    className="field-input"
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>

            <div className="page-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="section-title">إعدادات الواتساب</h2>
                <span
                  className={form.enable_whatsapp ? 'badge badge-green' : 'badge badge-rose'}
                >
                  {form.enable_whatsapp ? 'مفعل' : 'متوقف'}
                </span>
              </div>

              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="mb-4">
                  <p className="text-sm font-bold text-slate-900">
                    اختر مزود الواتساب
                  </p>
                  <p className="mt-1 text-sm leading-7 text-slate-500">
                    اختر الطريقة المناسبة لربط الواتساب مع النظام
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <ProviderSelectorCard
                    title="UltraMsg"
                    active={form.whatsapp_provider === 'ultramsg'}
                    onClick={() => updateField('whatsapp_provider', 'ultramsg')}
                  />
                  <ProviderSelectorCard
                    title="WhatsApp Official"
                    active={form.whatsapp_provider === 'official'}
                    onClick={() => updateField('whatsapp_provider', 'official')}
                  />
                  <ProviderSelectorCard
                    title="Custom"
                    active={form.whatsapp_provider === 'custom'}
                    onClick={() => updateField('whatsapp_provider', 'custom')}
                  />
                </div>
              </div>

              <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {providerMeta.title}
                    </p>
                    <p className="mt-1 text-sm leading-7 text-slate-500">
                      {providerMeta.description}
                    </p>
                  </div>
                  <span className="badge badge-blue">{providerMeta.title}</span>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="field-label">رقم الواتساب</label>
                  <input
                    type="text"
                    value={form.whatsapp_phone}
                    onChange={(e) =>
                      updateField('whatsapp_phone', e.target.value)
                    }
                    className="field-input"
                    placeholder="9665xxxxxxxx"
                  />
                </div>

                <div>
                  <label className="field-label">
                    {providerMeta.firstFieldLabel}
                  </label>
                  <input
                    type="text"
                    value={form.ultramsg_instance_id}
                    onChange={(e) =>
                      updateField('ultramsg_instance_id', e.target.value)
                    }
                    className="field-input"
                    placeholder={providerMeta.firstFieldPlaceholder}
                  />
                </div>

                <div>
                  <label className="field-label">
                    {providerMeta.secondFieldLabel}
                  </label>
                  <input
                    type="text"
                    value={form.ultramsg_token}
                    onChange={(e) =>
                      updateField('ultramsg_token', e.target.value)
                    }
                    className="field-input"
                    placeholder={providerMeta.secondFieldPlaceholder}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="field-label">
                    {providerMeta.thirdFieldLabel}
                  </label>
                  <input
                    type="text"
                    value={form.ultramsg_api_url}
                    onChange={(e) =>
                      updateField('ultramsg_api_url', e.target.value)
                    }
                    className="field-input"
                    placeholder={providerMeta.thirdFieldPlaceholder}
                  />
                </div>
              </div>
            </div>

            <div className="page-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="section-title">الميزات</h2>
                <span className="badge badge-blue">Feature Flags</span>
              </div>

              <div className="grid gap-3">
                {featureItems.map((item) => {
                  const enabled = form[item.key]

                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => updateField(item.key, !enabled)}
                      className={`flex flex-row-reverse items-center justify-between rounded-2xl border px-4 py-4 text-right transition ${
                        enabled
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-red-200 bg-red-50'
                      }`}
                    >
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-900">
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.description}
                        </p>
                      </div>

                      <span
                        className={`text-sm font-extrabold ${
                          enabled ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {enabled ? 'مفعلة' : 'متوقفة'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="page-card">
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={saveSettings}
                  disabled={saving}
                  className="primary-btn"
                  type="button"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
                </button>

                <button
                  onClick={resetForm}
                  disabled={saving}
                  className="secondary-btn"
                  type="button"
                >
                  استرجاع القيم الحالية
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="page-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="section-title">ملخص النظام الحالي</h2>
                <span className="badge badge-slate">Snapshot</span>
              </div>

              <div className="space-y-3">
                <SummaryRow label="اسم المحل" value={settings?.store_name || '—'} />
                <SummaryRow label="اسم الفرع" value={settings?.branch_name || '—'} />
                <SummaryRow
                  label="مزود الواتساب"
                  value={providerMeta.title}
                />
                <SummaryRow
                  label="رقم الواتساب"
                  value={form.whatsapp_phone || settings?.whatsapp_phone || '—'}
                />
                <SummaryRow
                  label={providerMeta.firstFieldLabel}
                  value={form.ultramsg_instance_id || settings?.ultramsg_instance_id || '—'}
                />
                <SummaryRow
                  label={providerMeta.secondFieldLabel}
                  value={maskSecret(form.ultramsg_token || settings?.ultramsg_token || '')}
                />
                <SummaryRow
                  label="آخر تحديث"
                  value={formatDateTime(settings?.updated_at)}
                />
              </div>
            </div>

            <div className="page-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="section-title">الحالة العامة</h2>
                <span className="badge badge-blue">Live</span>
              </div>

              <div className="space-y-3">
                <MiniStatus title="واتساب" enabled={form.enable_whatsapp} />
                <MiniStatus title="طباعة" enabled={form.enable_printing} />
                <MiniStatus title="POS" enabled={form.enable_pos} />
                <MiniStatus title="فواتير" enabled={form.enable_invoices} />
                <MiniStatus title="طلبات" enabled={form.enable_orders} />
                <MiniStatus title="تقارير" enabled={form.enable_reports} />
                <MiniStatus title="مستخدمون" enabled={form.enable_users} />
              </div>
            </div>

            <div className="page-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="section-title">ملاحظات مهمة</h2>
                <span className="badge badge-amber">تنبيه</span>
              </div>

              <div className="space-y-3 text-sm leading-7 text-slate-600">
                <p>
                  حقول اسم المحل واسم الفرع صارت الآن تظهر فارغة دائمًا داخل
                  الإدخال، والقيمة الحالية تظهر فقط كمرجع داخل الحقل.
                </p>
                <p>
                  إذا تركت الحقول فارغة وقت الحفظ، النظام يحافظ على القيم
                  الحالية المحفوظة بدون حذفها.
                </p>
                <p>
                  الخطوة التالية نربط إعدادات النظام مع الصفحة الرئيسية والمزايا،
                  وبعدها نبدأ نظام الفروع.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-bold text-slate-900">{value}</span>
    </div>
  )
}

function MiniStatus({
  title,
  enabled,
}: {
  title: string
  enabled: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-sm font-semibold text-slate-700">{title}</span>
      <span
        className={`text-sm font-bold ${
          enabled ? 'text-emerald-700' : 'text-red-700'
        }`}
      >
        {enabled ? 'مفعل' : 'متوقف'}
      </span>
    </div>
  )
}

function ProviderSelectorCard({
  title,
  active,
  onClick,
}: {
  title: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-5 text-right transition ${
        active
          ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex h-3 w-3 rounded-full ${
            active ? 'bg-white' : 'bg-slate-300'
          }`}
        />
        <span className="text-sm font-extrabold">{title}</span>
      </div>
    </button>
  )
}

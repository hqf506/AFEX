'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  createDefaultSystemSettingsPayload,
  createSystemSettingsPayload,
  createSystemSettingsSavePayload,
  resolveSystemSettingsSaveNames,
  type SystemSettings,
  type SystemSettingsPayload,
} from '@/lib/admin/settings'
import { usePageAccess } from '@/hooks/use-page-access'

type SettingsTab =
  | 'status'
  | 'organization'
  | 'invoice'
  | 'communication'
  | 'features'
  | 'notes'

const tabs: Array<{ key: SettingsTab; label: string }> = [
  { key: 'status', label: 'حالة النظام' },
  { key: 'organization', label: 'معلومات المنشأة' },
  { key: 'invoice', label: 'إعدادات الفاتورة' },
  { key: 'communication', label: 'إعدادات التواصل' },
  { key: 'features', label: 'المميزات' },
  { key: 'notes', label: 'ملاحظات' },
]

const cardClassName =
  'rounded-[28px] border border-cyan-300/15 bg-[#07111d]/90 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl'

const inputClassName =
  'h-12 w-full rounded-2xl border border-cyan-300/15 bg-[#091522]/90 px-4 text-right text-sm font-bold text-white outline-none transition placeholder:text-slate-500 hover:border-cyan-300/30 focus:border-cyan-300/55 focus:bg-[#0d1c2d] focus:ring-2 focus:ring-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-60'

const textareaClassName =
  'min-h-[118px] w-full resize-none rounded-2xl border border-cyan-300/15 bg-[#091522]/90 px-4 py-3 text-right text-sm font-medium leading-7 text-white outline-none transition placeholder:text-slate-500 hover:border-cyan-300/30 focus:border-cyan-300/55 focus:bg-[#0d1c2d] focus:ring-2 focus:ring-cyan-300/15'

const WHATSAPP_TEST_MESSAGE = `مرحبًا 👋
هذه رسالة اختبار من نظام AFEX للتأكد من نجاح ربط الواتساب وإرسال الرسائل بشكل صحيح.

إذا وصلتك هذه الرسالة فهذا يعني أن الاتصال يعمل بنجاح ✅

AFEX System`

function formatDateTime(value?: string | null) {
  if (!value) return 'غير محدد'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'غير محدد'
  return date.toLocaleString('ar-SA')
}

function safeValue(value?: string | null) {
  const normalized = value?.trim()
  if (!normalized || /^(test|demo|sample)$/i.test(normalized)) return 'غير محدد'
  return normalized
}

export default function AdminSettingsPage() {
  const access = usePageAccess(['admin'])
  const [activeTab, setActiveTab] = useState<SettingsTab>('status')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [form, setForm] = useState<SystemSettingsPayload>(() =>
    createDefaultSystemSettingsPayload()
  )
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [testPhone, setTestPhone] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [testSuccessMessage, setTestSuccessMessage] = useState('')
  const [testErrorMessage, setTestErrorMessage] = useState('')

  const allowed = access.allowed
  const roleLabel =
    access.userRole === 'admin'
      ? 'مدير'
      : access.userRole === 'employee'
        ? 'إداري'
        : access.userRole === 'cashier'
          ? 'أمين صندوق'
          : 'غير محدد'

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
        setErrorMessage(result?.details || result?.error || 'فشل تحميل إعدادات النظام')
        setSettings(null)
        setLoading(false)
        return
      }

      const settingsData = result.settings as SystemSettings | null

      setSettings(settingsData)
      setForm(createSystemSettingsPayload(settingsData))
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

  const updateField = <K extends keyof SystemSettingsPayload>(
    key: K,
    value: SystemSettingsPayload[K]
  ) => {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }))
  }

  const resetForm = () => {
    setForm(createSystemSettingsPayload(settings))
    setSuccessMessage('')
    setErrorMessage('')
  }

  const sendWhatsAppTestMessage = async () => {
    if (testSending) return

    const finalPhone = testPhone.trim() || form.whatsapp_phone.trim()

    if (!finalPhone) {
      setTestErrorMessage('اكتب رقم جوال لإرسال رسالة الاختبار')
      setTestSuccessMessage('')
      return
    }

    setTestSending(true)
    setTestErrorMessage('')
    setTestSuccessMessage('')

    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: finalPhone,
          mode: 'test',
          text: WHATSAPP_TEST_MESSAGE,
        }),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        setTestErrorMessage(result?.error || 'فشل إرسال رسالة الاختبار')
        setTestSending(false)
        return
      }

      setTestSuccessMessage('تم إرسال رسالة الاختبار بنجاح')
      setTimeout(() => setTestSuccessMessage(''), 3000)
      setTestSending(false)
    } catch (error) {
      setTestErrorMessage(
        error instanceof Error ? error.message : 'فشل إرسال رسالة الاختبار'
      )
      setTestSending(false)
    }
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
      setErrorMessage('اسم النشاط مطلوب')
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
      const payload = createSystemSettingsSavePayload(form)

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
        const errorDetails =
          result?.details || result?.error || 'فشل حفظ إعدادات النظام'
        console.error('System settings save failed:', errorDetails, result)
        setErrorMessage(errorDetails)
        setSaving(false)
        return
      }

      const savedSettings = result.settings as SystemSettings

      setSettings(savedSettings)
      setForm(createSystemSettingsPayload(savedSettings))
      setSuccessMessage(result.message || 'تم حفظ إعدادات النظام بنجاح')
      setTimeout(() => setSuccessMessage(''), 3000)
      setSaving(false)
    } catch (error) {
      const errorDetails =
        error instanceof Error ? error.message : 'فشل حفظ إعدادات النظام'
      console.error('System settings save failed:', errorDetails)
      setErrorMessage(errorDetails)
      setSaving(false)
    }
  }

  const providerMeta = useMemo(() => {
    if (form.whatsapp_provider === 'official') {
      return {
        title: 'WhatsApp Official',
        description: 'ربط رسمي مناسب للحسابات المعتمدة من واتساب.',
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
        description: 'مناسب إذا كان لديك API خاص أو مزود مختلف.',
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
      description: 'الربط الحالي المباشر باستخدام بيانات UltraMsg.',
      firstFieldLabel: 'UltraMsg Instance ID',
      firstFieldPlaceholder: 'مثال: instance123456',
      secondFieldLabel: 'UltraMsg Token',
      secondFieldPlaceholder: 'مثال: token...',
      thirdFieldLabel: 'UltraMsg API URL',
      thirdFieldPlaceholder: 'مثال: https://api.ultramsg.com/instance...',
    }
  }, [form.whatsapp_provider])

  const featureItems = useMemo(
    () => [
      { key: 'enable_whatsapp' as const, title: 'الواتساب', description: 'إرسال الرسائل والتنبيهات' },
      { key: 'enable_printing' as const, title: 'الطباعة', description: 'الفواتير والحرارية' },
      { key: 'enable_pos' as const, title: 'POS', description: 'نقطة البيع' },
      { key: 'enable_invoices' as const, title: 'الفواتير', description: 'إنشاء وإدارة الفواتير' },
      { key: 'enable_orders' as const, title: 'الطلبات', description: 'متابعة حالة الطلبات' },
      { key: 'enable_reports' as const, title: 'التقارير', description: 'لوحات وتحليلات المبيعات' },
      { key: 'enable_users' as const, title: 'المستخدمون', description: 'إدارة الحسابات والصلاحيات' },
    ],
    []
  )

  if (access.loading) {
    return <PageState>جارٍ التحقق من الصلاحية...</PageState>
  }

  if (!allowed) {
    return <PageState>جارٍ التحويل...</PageState>
  }

  if (loading) {
    return <PageState>جاري تحميل إعدادات النظام...</PageState>
  }

  return (
    <div
      dir="rtl"
      className="relative min-h-screen overflow-hidden bg-[#030714] px-4 py-5 text-white sm:px-6 lg:px-8"
    >
      <div className="pointer-events-none absolute -right-24 top-0 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 bottom-10 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative mx-auto max-w-[1440px] space-y-5">
        <section className="rounded-[30px] border border-cyan-300/15 bg-[#07111d]/95 p-5 shadow-[0_28px_100px_rgba(0,0,0,0.34)] backdrop-blur-xl md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4 text-right">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200">
                <SettingsIcon />
              </div>
              <div>
                <div className="mb-2 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-200">
                  AFEX Settings
                </div>
                <h1 className="text-3xl font-black tracking-tight md:text-4xl">
                  إعدادات النظام
                </h1>
                <p className="mt-2 max-w-2xl text-sm font-semibold leading-7 text-slate-300">
                  تخصيص إعدادات النظام الرئيسية ومعلومات المنشأة والتواصل.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => void fetchSettings()}
                disabled={saving}
                className="h-12 rounded-2xl border border-cyan-300/20 bg-[#0b1725]/90 px-5 text-sm font-black text-slate-100 transition hover:border-cyan-300/45 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                تحديث
              </button>
              <button
                type="button"
                onClick={saveSettings}
                disabled={saving}
                className="h-12 rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-6 text-sm font-black text-[#04131d] shadow-[0_0_30px_rgba(34,211,238,0.18)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <MiniBadge label={`الصلاحية: ${roleLabel}`} />
            <MiniBadge label={`آخر تحديث: ${formatDateTime(settings?.updated_at)}`} />
          </div>
        </section>

        {successMessage ? <Alert tone="success">{successMessage}</Alert> : null}
        {errorMessage ? <Alert tone="error">{errorMessage}</Alert> : null}

        <nav className="flex gap-2 overflow-x-auto rounded-[24px] border border-cyan-300/15 bg-[#07111d]/90 p-2 backdrop-blur-xl">
          {tabs.map((tab) => {
            const active = activeTab === tab.key

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`shrink-0 rounded-2xl px-4 py-3 text-sm font-black transition ${
                  active
                    ? 'bg-gradient-to-l from-cyan-300 to-emerald-300 text-[#04131d] shadow-[0_0_24px_rgba(34,211,238,0.16)]'
                    : 'text-slate-300 hover:bg-cyan-300/10 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>

        {activeTab === 'status' ? (
          <Panel
            icon={<ShieldIcon />}
            title="الحالة العامة"
            description="تشغيل وتعطيل أهم وحدات النظام من مكان واحد."
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {featureItems.map((item) => (
                <StatusRow
                  key={item.key}
                  title={item.title}
                  description={item.description}
                  enabled={form[item.key]}
                  onClick={() => updateField(item.key, !form[item.key])}
                />
              ))}
            </div>
          </Panel>
        ) : null}

        {activeTab === 'organization' ? (
          <Panel
            icon={<StoreIcon />}
            title="معلومات المنشأة"
            description="البيانات التي تظهر في الفواتير والتقارير العامة."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <InfoCard label="اسم النشاط" value={safeValue(settings?.store_name)} icon={<StoreIcon />} />
              <InfoCard label="اسم الفرع" value={safeValue(settings?.branch_name)} icon={<BuildingIcon />} />
              <InfoCard label="رقم واتساب" value={safeValue(form.whatsapp_phone)} icon={<PhoneIcon />} />
              <InfoCard label="مزود واتساب" value={providerMeta.title} icon={<MessageIcon />} />
              <InfoCard label="رابط الشعار" value={safeValue(form.logo_url)} icon={<LinkIcon />} wide />
            </div>
          </Panel>
        ) : null}

        {activeTab === 'invoice' ? (
          <Panel
            icon={<ReceiptIcon />}
            title="إعدادات الفاتورة"
            description="إعدادات الفاتورة الرقمية والحرارية كما تحفظها API الحالية."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="اسم العلامة في الفاتورة الرقمية">
                <input
                  value={form.digital_invoice_brand_name}
                  onChange={(event) =>
                    updateField('digital_invoice_brand_name', event.target.value)
                  }
                  className={inputClassName}
                  placeholder={settings?.store_name || 'AFEX'}
                />
              </Field>

              <Field label="اسم الفرع في الفاتورة الرقمية">
                <input
                  value={form.digital_invoice_branch_name}
                  onChange={(event) =>
                    updateField('digital_invoice_branch_name', event.target.value)
                  }
                  className={inputClassName}
                  placeholder={settings?.branch_name || 'الفرع الرئيسي'}
                />
              </Field>

              <Field label="اسم العلامة في الفاتورة الحرارية">
                <input
                  value={form.thermal_invoice_brand_name}
                  onChange={(event) =>
                    updateField('thermal_invoice_brand_name', event.target.value)
                  }
                  className={inputClassName}
                  placeholder={settings?.store_name || 'AFEX'}
                />
              </Field>

              <Field label="اسم الفرع في الفاتورة الحرارية">
                <input
                  value={form.thermal_invoice_branch_name}
                  onChange={(event) =>
                    updateField('thermal_invoice_branch_name', event.target.value)
                  }
                  className={inputClassName}
                  placeholder={settings?.branch_name || 'الفرع الرئيسي'}
                />
              </Field>

              <Field label="عرض ورق الفاتورة الحرارية">
                <div className="grid grid-cols-2 gap-2">
                  {(['80mm', '58mm'] as const).map((paperWidth) => (
                    <ChoiceButton
                      key={paperWidth}
                      active={form.thermal_invoice_paper_width === paperWidth}
                      onClick={() => updateField('thermal_invoice_paper_width', paperWidth)}
                    >
                      {paperWidth}
                    </ChoiceButton>
                  ))}
                </div>
              </Field>

              <Field label="ملاحظة الفاتورة الرقمية">
                <textarea
                  value={form.digital_invoice_note}
                  onChange={(event) =>
                    updateField('digital_invoice_note', event.target.value)
                  }
                  className={textareaClassName}
                  placeholder="ملاحظة تظهر أسفل الفاتورة الرقمية"
                />
              </Field>

              <Field label="ملاحظة الفاتورة الحرارية">
                <textarea
                  value={form.thermal_invoice_note}
                  onChange={(event) =>
                    updateField('thermal_invoice_note', event.target.value)
                  }
                  className={textareaClassName}
                  placeholder="ملاحظة تظهر داخل الإيصال الحراري"
                />
              </Field>

              <Field label="رسالة ختام الفاتورة الحرارية">
                <textarea
                  value={form.thermal_invoice_footer_message}
                  onChange={(event) =>
                    updateField('thermal_invoice_footer_message', event.target.value)
                  }
                  className={textareaClassName}
                  placeholder="شكراً لتعاملكم معنا"
                />
              </Field>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatusRow
                title="إظهار جوال العميل"
                description="في الفاتورة الحرارية"
                enabled={form.thermal_invoice_show_customer_phone}
                onClick={() =>
                  updateField(
                    'thermal_invoice_show_customer_phone',
                    !form.thermal_invoice_show_customer_phone
                  )
                }
              />
              <StatusRow
                title="إظهار طريقة الدفع"
                description="في الفاتورة الحرارية"
                enabled={form.thermal_invoice_show_payment_method}
                onClick={() =>
                  updateField(
                    'thermal_invoice_show_payment_method',
                    !form.thermal_invoice_show_payment_method
                  )
                }
              />
              <StatusRow
                title="إظهار ملاحظة"
                description="داخل الإيصال"
                enabled={form.thermal_invoice_show_note}
                onClick={() =>
                  updateField('thermal_invoice_show_note', !form.thermal_invoice_show_note)
                }
              />
              <StatusRow
                title="خرائط في الإيصال"
                description="رابط الموقع"
                enabled={form.thermal_invoice_show_map}
                onClick={() =>
                  updateField('thermal_invoice_show_map', !form.thermal_invoice_show_map)
                }
              />
            </div>
          </Panel>
        ) : null}

        {activeTab === 'communication' ? (
          <Panel
            icon={<MessageIcon />}
            title="إعدادات التواصل"
            description="ربط واتساب ومعلومات مزود الرسائل الحالي."
          >
            <div className="mb-5 grid gap-3 md:grid-cols-3">
              {[
                { value: 'ultramsg', label: 'UltraMsg' },
                { value: 'official', label: 'WhatsApp Official' },
                { value: 'custom', label: 'Custom' },
              ].map((provider) => (
                <ChoiceButton
                  key={provider.value}
                  active={form.whatsapp_provider === provider.value}
                  onClick={() => updateField('whatsapp_provider', provider.value)}
                >
                  {provider.label}
                </ChoiceButton>
              ))}
            </div>

            <div className="mb-5 rounded-3xl border border-cyan-300/15 bg-[#091522]/80 p-5">
              <h3 className="text-lg font-black text-white">{providerMeta.title}</h3>
              <p className="mt-2 text-sm font-semibold leading-7 text-slate-300">
                {providerMeta.description}
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="رقم واتساب">
                <input
                  value={form.whatsapp_phone}
                  onChange={(event) => updateField('whatsapp_phone', event.target.value)}
                  className={inputClassName}
                  placeholder="966xxxxxx"
                />
              </Field>

              <Field label={providerMeta.firstFieldLabel}>
                <input
                  value={form.ultramsg_instance_id}
                  onChange={(event) =>
                    updateField('ultramsg_instance_id', event.target.value)
                  }
                  className={inputClassName}
                  placeholder={providerMeta.firstFieldPlaceholder}
                />
              </Field>

              <Field label={providerMeta.secondFieldLabel}>
                <input
                  value={form.ultramsg_token}
                  onChange={(event) => updateField('ultramsg_token', event.target.value)}
                  className={inputClassName}
                  placeholder={providerMeta.secondFieldPlaceholder}
                />
              </Field>

              <Field label={providerMeta.thirdFieldLabel}>
                <input
                  value={form.ultramsg_api_url}
                  onChange={(event) =>
                    updateField('ultramsg_api_url', event.target.value)
                  }
                  className={inputClassName}
                  placeholder={providerMeta.thirdFieldPlaceholder}
                />
              </Field>
            </div>

            <div className="mt-6 rounded-3xl border border-cyan-300/15 bg-[#091522]/80 p-5">
              <div className="mb-4 text-right">
                <h3 className="text-lg font-black text-white">اختبار إرسال واتساب</h3>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  يستخدم رسالة اختبار ثابتة من AFEX. اترك الرقم فارغًا لاستخدام رقم واتساب الحالي.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <input
                  value={testPhone}
                  onChange={(event) => setTestPhone(event.target.value)}
                  className={inputClassName}
                  placeholder="966xxxxxx"
                />
                <button
                  type="button"
                  onClick={sendWhatsAppTestMessage}
                  disabled={testSending}
                  className="h-12 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {testSending ? 'جاري الإرسال...' : 'إرسال رسالة اختبار'}
                </button>
              </div>
              {testSuccessMessage ? (
                <p className="mt-3 text-sm font-bold text-emerald-300">{testSuccessMessage}</p>
              ) : null}
              {testErrorMessage ? (
                <p className="mt-3 text-sm font-bold text-red-300">{testErrorMessage}</p>
              ) : null}
            </div>
          </Panel>
        ) : null}

        {activeTab === 'features' ? (
          <Panel
            icon={<SparkIcon />}
            title="المميزات"
            description="إظهار أو إخفاء وحدات النظام الأساسية."
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {featureItems.map((item) => (
                <StatusRow
                  key={item.key}
                  title={item.title}
                  description={item.description}
                  enabled={form[item.key]}
                  onClick={() => updateField(item.key, !form[item.key])}
                />
              ))}
            </div>
          </Panel>
        ) : null}

        {activeTab === 'notes' ? (
          <Panel
            icon={<WarningIcon />}
            title="ملاحظات مهمة"
            description="تنبيهات تساعدك على فهم ما يتم حفظه في هذه الصفحة."
            tone="warning"
          >
            <div className="space-y-3 text-sm font-semibold leading-8 text-amber-100">
              <p>معلومات المنشأة المعروضة هنا للعرض فقط عندما تكون مشتقة من بيانات الفرع أو المنشأة.</p>
              <p>حقول اسم النشاط واسم الفرع لا تُرسل ضمن payload حفظ system_settings الحالي.</p>
              <p>لا توجد أي إعدادات لرسائل حالة الطلبات في هذه الصفحة؛ الرسائل ثابتة من منطق الطلبات.</p>
            </div>
          </Panel>
        ) : null}

        <section className="rounded-[28px] border border-cyan-300/15 bg-[#07111d]/90 p-4 backdrop-blur-xl">
          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={saveSettings}
              disabled={saving}
              className="h-14 rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 text-sm font-black text-[#04131d] shadow-[0_0_32px_rgba(34,211,238,0.18)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={saving}
              className="h-14 rounded-2xl border border-cyan-300/20 bg-[#0b1725]/80 text-sm font-black text-slate-100 transition hover:border-cyan-300/45 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              استعادة القيم الحالية
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

function PageState({ children }: { children: ReactNode }) {
  return (
    <div
      dir="rtl"
      className="relative min-h-screen overflow-hidden bg-[#030714] px-4 py-8 text-white"
    >
      <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center">
        <div className={cardClassName}>
          <p className="text-center text-sm font-black text-slate-100">{children}</p>
        </div>
      </div>
    </div>
  )
}

function Alert({ children, tone }: { children: ReactNode; tone: 'success' | 'error' }) {
  const className =
    tone === 'success'
      ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200'
      : 'border-red-300/20 bg-red-400/10 text-red-200'

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm font-black ${className}`}>
      {children}
    </div>
  )
}

function MiniBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">
      {label}
    </span>
  )
}

function Panel({
  icon,
  title,
  description,
  children,
  tone = 'default',
}: {
  icon: ReactNode
  title: string
  description: string
  children: ReactNode
  tone?: 'default' | 'warning'
}) {
  const panelClassName =
    tone === 'warning'
      ? 'rounded-[28px] border border-amber-300/20 bg-amber-300/10 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.24)] backdrop-blur-xl md:p-6'
      : cardClassName

  return (
    <section className={panelClassName}>
      <div className="mb-5 flex items-start gap-4 text-right">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
          {icon}
        </div>
        <div>
          <h2 className="text-2xl font-black text-white">{title}</h2>
          <p className="mt-1 text-sm font-semibold leading-7 text-slate-400">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-right">
      <span className="mb-2 block text-sm font-black text-slate-200">{label}</span>
      {children}
    </label>
  )
}

function ChoiceButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${
        active
          ? 'border-cyan-300/60 bg-cyan-300/15 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.14)]'
          : 'border-cyan-300/15 bg-[#091522]/90 text-slate-300 hover:border-cyan-300/35 hover:bg-cyan-300/10 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function InfoCard({
  label,
  value,
  icon,
  wide = false,
}: {
  label: string
  value: string
  icon: ReactNode
  wide?: boolean
}) {
  return (
    <div
      className={`rounded-3xl border border-cyan-300/15 bg-[#091522]/80 p-4 transition hover:border-cyan-300/30 hover:bg-cyan-300/5 ${
        wide ? 'md:col-span-2' : ''
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
          {icon}
        </div>
        <div className="min-w-0 text-right">
          <p className="text-xs font-black text-slate-400">{label}</p>
          <p className="mt-1 truncate text-base font-black text-white">{value}</p>
        </div>
      </div>
    </div>
  )
}

function StatusRow({
  title,
  description,
  enabled,
  onClick,
}: {
  title: string
  description: string
  enabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={enabled}
      className={`flex items-center justify-between gap-4 rounded-3xl border p-4 text-right transition ${
        enabled
          ? 'border-emerald-300/20 bg-emerald-300/10 hover:border-emerald-300/35'
          : 'border-red-300/15 bg-red-300/10 hover:border-red-300/30'
      }`}
    >
      <div>
        <p className="text-sm font-black text-white">{title}</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">
          {description}
        </p>
      </div>
      <span
        className={`rounded-full px-3 py-1 text-xs font-black ${
          enabled
            ? 'bg-emerald-300/15 text-emerald-200'
            : 'bg-red-300/15 text-red-200'
        }`}
      >
        {enabled ? 'مفعل' : 'متوقف'}
      </span>
    </button>
  )
}

function SettingsIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.05.05a2 2 0 0 1-2.83 2.83l-.05-.05A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.39 1.1V21a2 2 0 0 1-4 0v-.08A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.05.05a2 2 0 0 1-2.83-2.83l.05-.05A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.39H3a2 2 0 0 1 0-4h.08A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.05-.05a2 2 0 0 1 2.83-2.83l.05.05A1.7 1.7 0 0 0 9 4.6c.2-.5.39-.8.6-1A1.7 1.7 0 0 0 10 2.5V2a2 2 0 0 1 4 0v.08A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.05-.05a2 2 0 0 1 2.83 2.83l-.05.05A1.7 1.7 0 0 0 19.4 9c.5.2.8.39 1 .6a1.7 1.7 0 0 0 1.1.39H22a2 2 0 0 1 0 4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3 5 6v5c0 4.6 2.9 8.7 7 10 4.1-1.3 7-5.4 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function StoreIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10h16l-1.2-5.2A1 1 0 0 0 17.83 4H6.17a1 1 0 0 0-.97.8L4 10Z" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </svg>
  )
}

function BuildingIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
      <path d="M16 8h2a2 2 0 0 1 2 2v11" />
      <path d="M8 7h4M8 11h4M8 15h4" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 3.1 5.18 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.72c.12.9.32 1.77.58 2.6a2 2 0 0 1-.45 2.11L9 10.7a16 16 0 0 0 4.3 4.3l1.27-1.23a2 2 0 0 1 2.11-.45c.83.26 1.7.46 2.6.58A2 2 0 0 1 22 16.92Z" />
    </svg>
  )
}

function MessageIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M10 13a5 5 0 0 0 7.07 0l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-2 2A5 5 0 0 0 12 20.07l1.15-1.15" />
    </svg>
  )
}

function ReceiptIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  )
}

function SparkIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z" />
    </svg>
  )
}

function WarningIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}

'use client'

import Image from 'next/image'
import { AdminAlert } from '@/components/admin-ui'
import { MobilePageHeader } from '@/components/mobile/mobile-primitives'
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
  createDefaultSystemSettingsPayload,
  createSystemSettingsPayload,
  createSystemSettingsSavePayload,
  resolveSystemSettingsSaveNames,
  SYSTEM_SETTINGS_DEFAULT_VALUES,
  type SystemSettings,
  type SystemSettingsPayload,
} from '@/lib/admin/settings'
import { usePageAccess } from '@/hooks/use-page-access'
import { getClientErrorMessage } from '@/lib/api/client-error'

function getArabicErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && /[\u0600-\u06ff]/.test(error.message)
    ? error.message
    : fallback
}

type SettingsTab =
  | 'status'
  | 'account'
  | 'organization'
  | 'invoice'
  | 'communication'
  | 'features'
  | 'notes'

type InvoiceSettingsSection = 'digital' | 'thermal'

type InvoicePreviewFrame = {
  src: string
  title: string
}

const tabs: Array<{ key: SettingsTab; label: string }> = [
  { key: 'status', label: 'حالة النظام' },
  { key: 'account', label: 'بيانات الحساب' },
  { key: 'organization', label: 'معلومات المنشأة' },
  { key: 'invoice', label: 'إعدادات الفاتورة' },
  { key: 'communication', label: 'إعدادات التواصل' },
  { key: 'features', label: 'المميزات' },
  { key: 'notes', label: 'ملاحظات' },
]

type CurrentAccountInfo = {
  username: string | null
  fullName: string | null
  email: string | null
  phone: string | null
  branchName: string | null
  role: string
  isActive: boolean
}

type AccountEditForm = {
  firstName: string
  lastName: string
  email: string
  phone: string
}

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

function splitFullName(fullName?: string | null) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  }
}

export default function AdminSettingsPage() {
  const access = usePageAccess(['admin'])
  const [activeTab, setActiveTab] = useState<SettingsTab>('status')
  const [activeInvoiceSection, setActiveInvoiceSection] =
    useState<InvoiceSettingsSection>('digital')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [currentAccount, setCurrentAccount] = useState<CurrentAccountInfo | null>(null)
  const [accountEditing, setAccountEditing] = useState(false)
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountVerifying, setAccountVerifying] = useState(false)
  const [accountEditForm, setAccountEditForm] = useState<AccountEditForm>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  })
  const [pendingAccountEmail, setPendingAccountEmail] = useState('')
  const [emailChangeRequiresCurrentConfirmation, setEmailChangeRequiresCurrentConfirmation] = useState(false)
  const [emailChangeOtp, setEmailChangeOtp] = useState('')
  const [accountSuccessMessage, setAccountSuccessMessage] = useState('')
  const [accountErrorMessage, setAccountErrorMessage] = useState('')
  const [form, setForm] = useState<SystemSettingsPayload>(() =>
    createDefaultSystemSettingsPayload()
  )
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [testPhone, setTestPhone] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [testSuccessMessage, setTestSuccessMessage] = useState('')
  const [testErrorMessage, setTestErrorMessage] = useState('')
  const [invoicePreviewFrame, setInvoicePreviewFrame] =
    useState<InvoicePreviewFrame | null>(null)
  const [uploadingThermalLogo, setUploadingThermalLogo] = useState(false)
  const thermalLogoInputRef = useRef<HTMLInputElement | null>(null)

  const allowed = access.allowed
  const roleLabel =
    access.userRole === 'admin'
      ? 'مدير النظام'
      : access.userRole === 'employee'
        ? 'موظف'
      : access.userRole === 'cashier'
          ? 'أمين الصندوق'
          : access.userRole === 'manager'
            ? 'مدير'
            : 'لم يُحدد'

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
        setErrorMessage(getClientErrorMessage(result, 'تعذر تحميل إعدادات النظام حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
        setSettings(null)
        setLoading(false)
        return
      }

      const settingsData = result.settings as SystemSettings | null

      setSettings(settingsData)
      setCurrentAccount((result.currentAccount as CurrentAccountInfo | null) || null)
      setForm(createSystemSettingsPayload(settingsData))
      setLoading(false)
    } catch (error) {
      setErrorMessage(
        getArabicErrorMessage(error, 'فشل تحميل إعدادات النظام')
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

  const uploadThermalLogo = async (file?: File) => {
    if (!file || uploadingThermalLogo) return

    setUploadingThermalLogo(true)
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
    } catch (error) {
      setErrorMessage(getArabicErrorMessage(error, 'فشل رفع شعار الفاتورة'))
    } finally {
      setUploadingThermalLogo(false)
      if (thermalLogoInputRef.current) {
        thermalLogoInputRef.current.value = ''
      }
    }
  }

  const resetForm = () => {
    setForm(createSystemSettingsPayload(settings))
    setSuccessMessage('')
    setErrorMessage('')
  }

  const startAccountEditing = () => {
    if (!currentAccount || accountSaving || accountVerifying) return
    const name = splitFullName(currentAccount.fullName)
    setAccountEditForm({
      firstName: name.firstName,
      lastName: name.lastName,
      email: currentAccount.email || '',
      phone: currentAccount.phone || '',
    })
    setAccountSuccessMessage('')
    setAccountErrorMessage('')
    setAccountEditing(true)
  }

  const cancelAccountEditing = () => {
    if (accountSaving || accountVerifying) return
    setAccountEditing(false)
    setAccountSuccessMessage('')
    setAccountErrorMessage('')
  }

  const saveAccountDetails = async () => {
    if (!currentAccount || accountSaving || accountVerifying) return

    const firstName = accountEditForm.firstName.trim()
    const lastName = accountEditForm.lastName.trim()
    const fullName = [firstName, lastName].filter(Boolean).join(' ')
    const phone = accountEditForm.phone.trim()
    const email = accountEditForm.email.trim().toLowerCase()
    const currentEmail = currentAccount.email?.trim().toLowerCase() || ''

    setAccountSuccessMessage('')
    setAccountErrorMessage('')

    if (!firstName || !phone || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAccountErrorMessage('تحقق من الاسم ورقم الجوال والبريد الإلكتروني ثم حاول مرة أخرى.')
      return
    }

    setAccountSaving(true)
    try {
      const profileResponse = await fetch('/api/account', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, phone }),
      })
      const profileResult = await profileResponse.json().catch(() => null)

      if (!profileResponse.ok || !profileResult?.success) {
        setAccountErrorMessage(
          getClientErrorMessage(profileResult, 'تعذر حفظ بيانات الحساب حاليًا.')
        )
        return
      }

      setCurrentAccount((previous) => previous ? {
        ...previous,
        fullName: profileResult.account?.full_name || fullName,
        phone: profileResult.account?.phone || phone,
      } : previous)

      if (email === currentEmail) {
        setAccountEditing(false)
        setAccountSuccessMessage('تم تحديث بيانات الحساب بنجاح.')
        return
      }

      const emailResponse = await fetch('/api/account/email-change', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const emailResult = await emailResponse.json().catch(() => null)

      if (!emailResponse.ok || !emailResult?.success) {
        setAccountErrorMessage(
          `تم حفظ الاسم والجوال، ولكن ${getClientErrorMessage(emailResult, 'تعذر بدء تغيير البريد الإلكتروني.')}`
        )
        return
      }

      setPendingAccountEmail(email)
      setEmailChangeRequiresCurrentConfirmation(false)
      setEmailChangeOtp('')
      setAccountEditing(false)
      setAccountSuccessMessage('تم إرسال رمز التحقق إلى البريد الإلكتروني الجديد')
    } catch (error) {
      setAccountErrorMessage(
        getArabicErrorMessage(error, 'تعذر تحديث بيانات الحساب حاليًا.')
      )
    } finally {
      setAccountSaving(false)
    }
  }

  const verifyAccountEmail = async () => {
    if (
      !pendingAccountEmail ||
      accountVerifying ||
      accountSaving ||
      !/^\d{6}$/.test(emailChangeOtp)
    ) {
      if (!/^\d{6}$/.test(emailChangeOtp)) {
        setAccountErrorMessage('أدخل رمز التحقق المكون من 6 أرقام.')
      }
      return
    }

    setAccountVerifying(true)
    setAccountErrorMessage('')
    setAccountSuccessMessage('')
    try {
      const response = await fetch('/api/account/email-change', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pendingAccountEmail,
          token: emailChangeOtp,
        }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        setAccountErrorMessage(
          getClientErrorMessage(result, 'تعذر التحقق من الرمز حاليًا.')
        )
        return
      }

      if (!result.verified) {
        setEmailChangeRequiresCurrentConfirmation(true)
        setAccountSuccessMessage(
          result.message || 'أكمل التأكيد المطلوب من بريدك الحالي.'
        )
        return
      }

      setCurrentAccount((previous) => previous ? {
        ...previous,
        email: result.email || pendingAccountEmail,
      } : previous)
      setPendingAccountEmail('')
      setEmailChangeRequiresCurrentConfirmation(false)
      setEmailChangeOtp('')
      setAccountSuccessMessage('تم تأكيد البريد الإلكتروني وتحديث بيانات الحساب بنجاح.')
    } catch (error) {
      setAccountErrorMessage(
        getArabicErrorMessage(error, 'تعذر التحقق من الرمز حاليًا.')
      )
    } finally {
      setAccountVerifying(false)
    }
  }

  const completeSecureEmailChange = async () => {
    if (!pendingAccountEmail || accountVerifying || accountSaving) return

    setAccountVerifying(true)
    setAccountErrorMessage('')
    setAccountSuccessMessage('')
    try {
      const response = await fetch('/api/account/email-change', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingAccountEmail }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        setAccountErrorMessage(
          getClientErrorMessage(result, 'لم يكتمل تأكيد البريد الحالي بعد.')
        )
        return
      }

      setCurrentAccount((previous) => previous ? {
        ...previous,
        email: result.email || pendingAccountEmail,
      } : previous)
      setPendingAccountEmail('')
      setEmailChangeOtp('')
      setEmailChangeRequiresCurrentConfirmation(false)
      setAccountSuccessMessage('تم تأكيد البريد الإلكتروني وتحديث بيانات الحساب بنجاح.')
    } catch (error) {
      setAccountErrorMessage(
        getArabicErrorMessage(error, 'تعذر التحقق من اكتمال تغيير البريد حاليًا.')
      )
    } finally {
      setAccountVerifying(false)
    }
  }

  const encodeInvoicePreviewPayload = (payload: unknown) => {
    const json = JSON.stringify(payload)
    const bytes = new TextEncoder().encode(json)
    let binary = ''

    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }

    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  }

  const previewDigitalInvoiceSettings = () => {
    const payload = encodeInvoicePreviewPayload({
      invoiceItems: [
        {
          item_id: null,
          item_name: 'تنظيف جلد',
          item_type: 'service',
          quantity: 1,
          unit_price: 120,
        },
        {
          item_id: null,
          item_name: 'إصلاح شنطة جلد',
          item_type: 'service',
          quantity: 1,
          unit_price: 240,
        },
      ],
      invoiceNumber: '02-0007',
      orderNumber: '02-0007',
      customerName: 'عميل تجريبي',
      customerPhone: '0500000000',
      branchName: settings?.branch_name || 'الفرع الرئيسي',
      paymentMethod: 'mada',
      paymentMethodLabel: 'مدى',
      numericCashReceived: 414,
      remainingFromCustomer: 0,
      cashChange: 0,
      subtotal: 360,
      discount: 0,
      tax: 54,
      finalTotal: 414,
      note: '',
      issuedAt: new Date().toISOString(),
    })

    setInvoicePreviewFrame({
      title: 'معاينة الفاتورة',
      src: `/api/invoices/pdf?format=html&payload=${payload}`,
    })
  }

  const previewThermalInvoiceSettings = () => {
    setInvoicePreviewFrame({
      title: 'معاينة الفاتورة',
      src: '/thermal-invoice-preview',
    })
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
        getArabicErrorMessage(error, 'فشل إرسال رسالة الاختبار')
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
          getClientErrorMessage(result, 'تعذر حفظ إعدادات النظام. لم يتم حفظ التغييرات.')
        console.error('System settings save failed.')
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
        getArabicErrorMessage(error, 'فشل حفظ إعدادات النظام')
      console.error('System settings save failed.', {
        category: error instanceof Error ? error.name : 'UnknownError',
      })
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
    return <PageState>جارٍ تحميل إعدادات النظام...</PageState>
  }

  return (
    <div
      dir="rtl"
      className="relative min-h-screen overflow-hidden bg-[#030714] px-4 py-5 text-white sm:px-6 lg:px-8"
    >
      <div className="pointer-events-none absolute -right-24 top-0 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 bottom-10 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative mx-auto max-w-[1440px] space-y-5">
        <MobilePageHeader
          title="إعدادات النظام"
          subtitle={tabs.find((tab) => tab.key === activeTab)?.label}
        />
        <section className="hidden rounded-[30px] border border-cyan-300/15 bg-[#07111d]/95 p-5 shadow-[0_28px_100px_rgba(0,0,0,0.34)] backdrop-blur-xl md:block md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4 text-right">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200">
                <SettingsIcon />
              </div>
              <div>
                <div className="mb-2 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-200">
                  إعدادات AFEX
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
                {saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <MiniBadge label={`الصلاحية: ${roleLabel}`} />
            <MiniBadge label={`آخر تحديث: ${formatDateTime(settings?.updated_at)}`} />
          </div>
        </section>

        {successMessage ? <AdminAlert tone="success">{successMessage}</AdminAlert> : null}
        {errorMessage ? <AdminAlert tone="error">{errorMessage}</AdminAlert> : null}

        <nav aria-label="أقسام الإعدادات" data-mobile-settings-navigation className="grid grid-cols-2 gap-2 rounded-[22px] border border-cyan-300/15 bg-[#07111d]/90 p-2 backdrop-blur-xl md:hidden">
          {tabs.map((tab) => {
            const active = activeTab === tab.key

            return (
              <button
                key={tab.key}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => setActiveTab(tab.key)}
                className={`min-h-12 rounded-2xl px-3 py-2 text-sm font-black transition ${
                  active
                    ? 'bg-gradient-to-l from-cyan-300 to-emerald-300 text-[#04131d] shadow-[0_0_24px_rgba(34,211,238,0.16)]'
                    : 'border border-white/10 bg-white/[0.035] text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>

        <nav data-responsive-settings-tabs className="hidden snap-x snap-mandatory gap-2 overflow-x-auto rounded-[24px] border border-cyan-300/15 bg-[#07111d]/90 p-2 backdrop-blur-xl md:flex">
          {tabs.map((tab) => {
            const active = activeTab === tab.key

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`min-h-11 shrink-0 snap-start rounded-2xl px-4 py-3 text-sm font-black transition ${
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

        {activeTab === 'account' ? (
          <Panel
            icon={<AccountIcon />}
            title="بيانات الحساب"
            description="راجع بيانات حسابك وحدّث الحقول المسموح بها دون مغادرة صفحة الإعدادات."
          >
            {accountSuccessMessage ? (
              <AdminAlert tone="success">{accountSuccessMessage}</AdminAlert>
            ) : null}
            {accountErrorMessage ? (
              <AdminAlert tone="error">{accountErrorMessage}</AdminAlert>
            ) : null}

            {accountEditing ? (
              <div className="grid min-w-0 gap-4 md:grid-cols-2">
                <Field label="الاسم الأول">
                  <input
                    value={accountEditForm.firstName}
                    onChange={(event) => setAccountEditForm((previous) => ({
                      ...previous,
                      firstName: event.target.value,
                    }))}
                    className={inputClassName}
                    autoComplete="given-name"
                    disabled={accountSaving}
                  />
                </Field>
                <Field label="الاسم الأخير">
                  <input
                    value={accountEditForm.lastName}
                    onChange={(event) => setAccountEditForm((previous) => ({
                      ...previous,
                      lastName: event.target.value,
                    }))}
                    className={inputClassName}
                    autoComplete="family-name"
                    disabled={accountSaving}
                  />
                </Field>
                <Field label="البريد الإلكتروني">
                  <input
                    type="email"
                    value={accountEditForm.email}
                    onChange={(event) => setAccountEditForm((previous) => ({
                      ...previous,
                      email: event.target.value,
                    }))}
                    className={`${inputClassName} text-left`}
                    autoComplete="email"
                    dir="ltr"
                    disabled={accountSaving}
                  />
                </Field>
                <Field label="رقم الجوال">
                  <input
                    type="tel"
                    value={accountEditForm.phone}
                    onChange={(event) => setAccountEditForm((previous) => ({
                      ...previous,
                      phone: event.target.value,
                    }))}
                    className={`${inputClassName} text-left`}
                    autoComplete="tel"
                    dir="ltr"
                    disabled={accountSaving}
                  />
                </Field>
                <InfoCard label="اسم المستخدم" value={safeValue(currentAccount?.username)} icon={<AccountIcon />} />
                <InfoCard label="اسم الفرع" value={safeValue(currentAccount?.branchName)} icon={<BuildingIcon />} />
                <InfoCard label="الدور" value={roleLabel} icon={<ShieldIcon />} />
                <InfoCard
                  label="حالة الحساب"
                  value={currentAccount ? (currentAccount.isActive ? 'نشط' : 'غير نشط') : 'غير محدد'}
                  icon={<ShieldIcon />}
                />
              </div>
            ) : (
              <div className="grid min-w-0 gap-4 md:grid-cols-2">
                <InfoCard label="اسم المستخدم" value={safeValue(currentAccount?.username)} icon={<AccountIcon />} />
                <InfoCard label="الاسم الكامل" value={safeValue(currentAccount?.fullName)} icon={<AccountIcon />} />
                <InfoCard label="البريد الإلكتروني" value={safeValue(currentAccount?.email)} icon={<MessageIcon />} />
                <InfoCard label="رقم الجوال" value={safeValue(currentAccount?.phone)} icon={<PhoneIcon />} />
                <InfoCard label="اسم الفرع" value={safeValue(currentAccount?.branchName)} icon={<BuildingIcon />} />
                <InfoCard label="الدور" value={roleLabel} icon={<ShieldIcon />} />
                <InfoCard
                  label="حالة الحساب"
                  value={currentAccount ? (currentAccount.isActive ? 'نشط' : 'غير نشط') : 'غير محدد'}
                  icon={<ShieldIcon />}
                />
              </div>
            )}

            {pendingAccountEmail ? (
              <div className="mt-5 min-w-0 rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4 sm:p-5">
                <h3 className="text-base font-black text-cyan-100">تأكيد البريد الإلكتروني الجديد</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                  {emailChangeRequiresCurrentConfirmation
                    ? 'تم تأكيد البريد الجديد. أكمل رسالة التأكيد في بريدك الحالي، ثم تحقق من اكتمال العملية.'
                    : 'أدخل رمز التحقق المرسل إلى البريد الجديد. سيبقى البريد الحالي كما هو حتى اكتمال التأكيد.'}
                </p>
                {emailChangeRequiresCurrentConfirmation ? (
                  <button
                    type="button"
                    data-account-email-complete
                    onClick={() => void completeSecureEmailChange()}
                    disabled={accountVerifying || accountSaving}
                    className="mt-4 min-h-11 w-full rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 py-3 text-sm font-black text-[#04131d] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {accountVerifying ? 'جارٍ التحقق...' : 'تحقق من اكتمال التأكيد'}
                  </button>
                ) : (
                  <div className="mt-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <Field label="رمز التحقق">
                        <input
                          value={emailChangeOtp}
                          onChange={(event) => setEmailChangeOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                          className={`${inputClassName} text-center tracking-[0.35em]`}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          dir="ltr"
                          maxLength={6}
                          disabled={accountVerifying}
                        />
                      </Field>
                    </div>
                    <button
                      type="button"
                      data-account-email-verify
                      onClick={() => void verifyAccountEmail()}
                      disabled={accountVerifying || accountSaving || emailChangeOtp.length !== 6}
                      className="min-h-11 w-full shrink-0 rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 py-3 text-sm font-black text-[#04131d] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                      {accountVerifying ? 'جارٍ التحقق...' : 'تأكيد الرمز'}
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              {accountEditing ? (
                <>
                  <button
                    type="button"
                    data-account-edit-cancel
                    onClick={cancelAccountEditing}
                    disabled={accountSaving}
                    className="min-h-11 w-full rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-3 text-sm font-black text-slate-200 transition hover:border-cyan-300/35 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    data-account-edit-save
                    onClick={() => void saveAccountDetails()}
                    disabled={accountSaving || accountVerifying}
                    className="min-h-11 w-full rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 py-3 text-sm font-black text-[#04131d] shadow-[0_0_30px_rgba(34,211,238,0.18)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {accountSaving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  data-account-edit-trigger
                  onClick={startAccountEditing}
                  disabled={!currentAccount || accountSaving || accountVerifying}
                  className="min-h-11 w-full rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 py-3 text-sm font-black text-[#04131d] shadow-[0_0_30px_rgba(34,211,238,0.18)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  تعديل بيانات الحساب
                </button>
              )}
            </div>
          </Panel>
        ) : null}

        {activeTab === 'organization' ? (
          <Panel
            icon={<StoreIcon />}
            title="معلومات المنشأة"
            description="البيانات التي تظهر في الفواتير والتقارير العامة."
          >
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <InfoCard label="اسم النشاط" value={safeValue(settings?.store_name)} icon={<StoreIcon />} />
              <InfoCard label="اسم الفرع" value={safeValue(settings?.branch_name)} icon={<BuildingIcon />} />
              <InfoCard label="رقم واتساب" value={safeValue(form.whatsapp_phone)} icon={<PhoneIcon />} />
              <InfoCard label="مزود واتساب" value={providerMeta.title} icon={<MessageIcon />} />
            </div>
          </Panel>
        ) : null}

        {activeTab === 'invoice' ? (
          <Panel
            icon={<ReceiptIcon />}
            title="إعدادات الفاتورة"
            description="إعدادات الفاتورة الرقمية والحرارية كما تحفظها API الحالية."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <InvoiceSectionButton
                active={activeInvoiceSection === 'digital'}
                title="الفاتورة الرقمية"
                description="ألوان وروابط ومحتوى PDF"
                onClick={() => setActiveInvoiceSection('digital')}
              />
              <InvoiceSectionButton
                active={activeInvoiceSection === 'thermal'}
                title="الفاتورة الحرارية"
                description="إعدادات الإيصال والطباعة"
                onClick={() => setActiveInvoiceSection('thermal')}
              />
            </div>

            <div
              key={activeInvoiceSection}
              className="mt-5 rounded-[28px] border border-cyan-300/15 bg-[#091522]/80 p-4 shadow-[inset_18px_0_36px_rgba(34,211,238,0.05),0_22px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl motion-safe:animate-[invoiceSettingsSlideIn_260ms_ease-out_both] md:p-5"
            >
              {activeInvoiceSection === 'digital' ? (
                <>
                  <div className="mb-5 flex items-center justify-between gap-4 border-b border-cyan-300/10 pb-4">
                    <div className="flex items-start gap-3 text-right">
                      <button
                        type="button"
                        onClick={previewDigitalInvoiceSettings}
                        title="معاينة الفاتورة"
                        aria-label="معاينة الفاتورة"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/35 bg-transparent text-cyan-100 transition hover:border-cyan-200/70 hover:bg-cyan-300/10 hover:text-white hover:shadow-[0_0_24px_rgba(34,211,238,0.24)] focus:outline-none focus:ring-2 focus:ring-cyan-300/25"
                      >
                        <EyeIcon />
                      </button>
                      <div>
                        <h3 className="text-xl font-black text-white">الفاتورة الرقمية</h3>
                        <p className="mt-1 text-sm font-semibold text-slate-400">
                          إعدادات تصميم وروابط فاتورة PDF الرقمية.
                        </p>
                      </div>
                    </div>
                  </div>

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

                    <Field label="سطر العنوان الأول في الفاتورة الرقمية">
                      <input
                        value={form.digital_invoice_address_line_1}
                        onChange={(event) =>
                          updateField('digital_invoice_address_line_1', event.target.value)
                        }
                        className={inputClassName}
                        placeholder="اكتب العنوان"
                      />
                    </Field>

                    <Field label="سطر العنوان الثاني في الفاتورة الرقمية">
                      <input
                        value={form.digital_invoice_address_line_2}
                        onChange={(event) =>
                          updateField('digital_invoice_address_line_2', event.target.value)
                        }
                        className={inputClassName}
                        placeholder="اكتب تفاصيل إضافية للعنوان"
                      />
                    </Field>

                    <Field label="رقم واتساب في الفاتورة الرقمية">
                      <input
                        value={form.digital_invoice_whatsapp_number}
                        onChange={(event) =>
                          updateField('digital_invoice_whatsapp_number', event.target.value)
                        }
                        className={inputClassName}
                        placeholder="966xxxxxx"
                      />
                    </Field>

                    <Field label="رابط تقييم Google">
                      <input
                        value={form.digital_invoice_google_review_link}
                        onChange={(event) =>
                          updateField(
                            'digital_invoice_google_review_link',
                            event.target.value
                          )
                        }
                        className={inputClassName}
                        placeholder="https://..."
                      />
                    </Field>

                    <Field label="رابط الموقع / الخريطة">
                      <input
                        value={form.digital_invoice_map_link}
                        onChange={(event) =>
                          updateField('digital_invoice_map_link', event.target.value)
                        }
                        className={inputClassName}
                        placeholder="https://maps.google.com/..."
                      />
                    </Field>

                    <Field label="رابط Instagram">
                      <input
                        value={form.digital_invoice_instagram_link}
                        onChange={(event) =>
                          updateField('digital_invoice_instagram_link', event.target.value)
                        }
                        className={inputClassName}
                        placeholder="https://instagram.com/..."
                      />
                    </Field>

                    <Field label="رابط TikTok">
                      <input
                        value={form.digital_invoice_tiktok_link}
                        onChange={(event) =>
                          updateField('digital_invoice_tiktok_link', event.target.value)
                        }
                        className={inputClassName}
                        placeholder="https://tiktok.com/@..."
                      />
                    </Field>

                    <Field label="لون خلفية اسم النشاط">
                      <div className="flex items-center gap-3 rounded-2xl border border-cyan-300/15 bg-[#091522]/90 px-4 py-3">
                        <input
                          type="color"
                          value={
                            form.digital_invoice_brand_background_color ||
                            SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_brand_background_color
                          }
                          onChange={(event) =>
                            updateField(
                              'digital_invoice_brand_background_color',
                              event.target.value
                            )
                          }
                          className="h-9 w-14 cursor-pointer rounded-xl border border-cyan-300/20 bg-[#07111d] p-1"
                          aria-label="لون خلفية اسم النشاط"
                        />
                        <input
                          value={form.digital_invoice_brand_background_color}
                          onChange={(event) =>
                            updateField(
                              'digital_invoice_brand_background_color',
                              event.target.value
                            )
                          }
                          className="min-w-0 flex-1 bg-transparent text-left text-sm font-bold text-white outline-none"
                          placeholder={
                            SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_brand_background_color
                          }
                        />
                      </div>
                    </Field>

                    <Field label="لون نص اسم النشاط">
                      <div className="flex items-center gap-3 rounded-2xl border border-cyan-300/15 bg-[#091522]/90 px-4 py-3">
                        <input
                          type="color"
                          value={
                            form.digital_invoice_brand_text_color ||
                            SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_brand_text_color
                          }
                          onChange={(event) =>
                            updateField('digital_invoice_brand_text_color', event.target.value)
                          }
                          className="h-9 w-14 cursor-pointer rounded-xl border border-cyan-300/20 bg-[#07111d] p-1"
                          aria-label="لون نص اسم النشاط"
                        />
                        <input
                          value={form.digital_invoice_brand_text_color}
                          onChange={(event) =>
                            updateField('digital_invoice_brand_text_color', event.target.value)
                          }
                          className="min-w-0 flex-1 bg-transparent text-left text-sm font-bold text-white outline-none"
                          placeholder={
                            SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_brand_text_color
                          }
                        />
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
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <StatusRow
                      title="واتساب في PDF"
                      description="إظهار زر التواصل"
                      enabled={form.digital_invoice_whatsapp_enabled}
                      onClick={() =>
                        updateField(
                          'digital_invoice_whatsapp_enabled',
                          !form.digital_invoice_whatsapp_enabled
                        )
                      }
                    />
                    <StatusRow
                      title="تقييم Google في PDF"
                      description="إظهار رابط التقييم"
                      enabled={form.digital_invoice_google_review_enabled}
                      onClick={() =>
                        updateField(
                          'digital_invoice_google_review_enabled',
                          !form.digital_invoice_google_review_enabled
                        )
                      }
                    />
                    <StatusRow
                      title="الخريطة في PDF"
                      description="إظهار رابط الموقع"
                      enabled={form.digital_invoice_map_enabled}
                      onClick={() =>
                        updateField(
                          'digital_invoice_map_enabled',
                          !form.digital_invoice_map_enabled
                        )
                      }
                    />
                    <StatusRow
                      title="Instagram في PDF"
                      description="إظهار رابط Instagram"
                      enabled={form.digital_invoice_instagram_enabled}
                      onClick={() =>
                        updateField(
                          'digital_invoice_instagram_enabled',
                          !form.digital_invoice_instagram_enabled
                        )
                      }
                    />
                    <StatusRow
                      title="TikTok في PDF"
                      description="إظهار رابط TikTok"
                      enabled={form.digital_invoice_tiktok_enabled}
                      onClick={() =>
                        updateField(
                          'digital_invoice_tiktok_enabled',
                          !form.digital_invoice_tiktok_enabled
                        )
                      }
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-5 flex items-center justify-between gap-4 border-b border-cyan-300/10 pb-4">
                    <div className="flex items-start gap-3 text-right">
                      <button
                        type="button"
                        onClick={previewThermalInvoiceSettings}
                        title="معاينة الفاتورة"
                        aria-label="معاينة الفاتورة"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/35 bg-transparent text-cyan-100 transition hover:border-cyan-200/70 hover:bg-cyan-300/10 hover:text-white hover:shadow-[0_0_24px_rgba(34,211,238,0.24)] focus:outline-none focus:ring-2 focus:ring-cyan-300/25"
                      >
                        <EyeIcon />
                      </button>
                      <div>
                        <h3 className="text-xl font-black text-white">الفاتورة الحرارية</h3>
                        <p className="mt-1 text-sm font-semibold text-slate-400">
                          إعدادات محتوى الإيصال الحراري وروابطه.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <ThermalLogoUploadCard
                      logoUrl={form.logo_url}
                      uploading={uploadingThermalLogo}
                      inputRef={thermalLogoInputRef}
                      onUpload={(file) => void uploadThermalLogo(file)}
                      onRemove={() => updateField('logo_url', '')}
                    />

                    <Field label="اسم العلامة في الفاتورة الحرارية">
                      <input
                        value={form.thermal_invoice_brand_name}
                        onChange={(event) =>
                          updateField('thermal_invoice_brand_name', event.target.value)
                        }
                        className={inputClassName}
                        placeholder="يرجى إدخال اسم العلامة."
                      />
                    </Field>

                    <Field label="اسم الفرع في الفاتورة الحرارية">
                      <input
                        value={form.thermal_invoice_branch_name}
                        onChange={(event) =>
                          updateField('thermal_invoice_branch_name', event.target.value)
                        }
                        className={inputClassName}
                        placeholder="يرجى إدخال اسم الفرع."
                      />
                    </Field>

                    <Field label="العنوان الأول في الفاتورة الحرارية">
                      <input
                        value={form.digital_invoice_address_line_1}
                        onChange={(event) =>
                          updateField('digital_invoice_address_line_1', event.target.value)
                        }
                        className={inputClassName}
                        placeholder="يرجى إدخال العنوان الأول"
                      />
                    </Field>

                    <Field label="العنوان الثاني في الفاتورة الحرارية">
                      <input
                        value={form.digital_invoice_address_line_2}
                        onChange={(event) =>
                          updateField('digital_invoice_address_line_2', event.target.value)
                        }
                        className={inputClassName}
                        placeholder="يرجى إدخال العنوان الثاني"
                      />
                    </Field>

                    <Field label="عرض ورق الفاتورة الحرارية">
                      <div className="grid grid-cols-2 gap-2">
                        {(['80mm', '58mm'] as const).map((paperWidth) => (
                          <ChoiceButton
                            key={paperWidth}
                            active={form.thermal_invoice_paper_width === paperWidth}
                            onClick={() =>
                              updateField('thermal_invoice_paper_width', paperWidth)
                            }
                          >
                            {paperWidth}
                          </ChoiceButton>
                        ))}
                      </div>
                    </Field>

                    <Field label="ملاحظة الفاتورة الحرارية">
                      <textarea
                        value={form.thermal_invoice_note}
                        onChange={(event) =>
                          updateField('thermal_invoice_note', event.target.value)
                        }
                        className={textareaClassName}
                        placeholder="يرجى إدخال ملاحظة الفاتورة."
                      />
                    </Field>

                    <Field label="رسالة ختام الفاتورة الحرارية">
                      <textarea
                        value={form.thermal_invoice_footer_message}
                        onChange={(event) =>
                          updateField('thermal_invoice_footer_message', event.target.value)
                        }
                        className={textareaClassName}
                        placeholder="يرجى إدخال رسالة ختام الفاتورة."
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
                        updateField(
                          'thermal_invoice_show_note',
                          !form.thermal_invoice_show_note
                        )
                      }
                    />
                    <StatusRow
                      title="Instagram في الإيصال"
                      description="إظهار رابط Instagram"
                      enabled={form.thermal_invoice_show_instagram}
                      onClick={() =>
                        updateField(
                          'thermal_invoice_show_instagram',
                          !form.thermal_invoice_show_instagram
                        )
                      }
                    />
                    <StatusRow
                      title="TikTok في الإيصال"
                      description="إظهار رابط TikTok"
                      enabled={form.thermal_invoice_show_tiktok}
                      onClick={() =>
                        updateField(
                          'thermal_invoice_show_tiktok',
                          !form.thermal_invoice_show_tiktok
                        )
                      }
                    />
                    <StatusRow
                      title="تقييم Google في الإيصال"
                      description="إظهار رابط التقييم"
                      enabled={form.thermal_invoice_show_google_review}
                      onClick={() =>
                        updateField(
                          'thermal_invoice_show_google_review',
                          !form.thermal_invoice_show_google_review
                        )
                      }
                    />
                  </div>
                </>
              )}
            </div>

            <style>{`
              @keyframes invoiceSettingsSlideIn {
                from {
                  opacity: 0;
                  transform: translateX(-24px);
                }

                to {
                  opacity: 1;
                  transform: translateX(0);
                }
              }
            `}</style>
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
                  {testSending ? 'جارٍ الإرسال...' : 'إرسال رسالة اختبار'}
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
              <p>حقلا اسم النشاط واسم الفرع للعرض فقط، ولا تُحفظ التغييرات عليهما من هذه الصفحة.</p>
              <p>رسائل حالات الطلبات ثابتة حاليًا، ولا يمكن تعديلها من هذه الصفحة.</p>
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
              {saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
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

      {invoicePreviewFrame ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020817]/80 p-0 backdrop-blur-md sm:p-5">
          <div data-admin-preview
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-invoice-preview-title"
            className="flex h-[100dvh] w-full max-w-[1180px] flex-col overflow-hidden border border-cyan-300/25 bg-[#07111d]/95 shadow-[0_0_80px_rgba(34,211,238,0.18)] sm:h-[88vh] sm:rounded-[28px]"
          >
            <div className="flex items-center justify-between gap-4 border-b border-cyan-300/15 px-4 py-3 sm:px-5">
              <div className="text-right">
                <h3 id="settings-invoice-preview-title" className="text-lg font-black text-white">{invoicePreviewFrame.title}</h3>
                <p className="mt-1 text-xs font-bold text-cyan-100/70">
                  معاينة داخل إعدادات النظام
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInvoicePreviewFrame(null)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-300/30 bg-[#091522]/80 text-cyan-100 transition hover:border-cyan-200/70 hover:bg-cyan-300/10 hover:text-white hover:shadow-[0_0_24px_rgba(34,211,238,0.22)] focus:outline-none focus:ring-2 focus:ring-cyan-300/25"
                aria-label="إغلاق المعاينة"
                title="إغلاق"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 bg-[#020817] p-2 sm:p-3">
              <iframe
                key={invoicePreviewFrame.src}
                title={invoicePreviewFrame.title}
                src={invoicePreviewFrame.src}
                className="h-full w-full rounded-[20px] border border-cyan-300/10 bg-white"
              />
            </div>
          </div>
        </div>
      ) : null}
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

  return (
    <div className="rounded-3xl border border-cyan-300/25 bg-[#091522]/80 p-4 shadow-[0_0_34px_rgba(34,211,238,0.08)] backdrop-blur-xl lg:col-span-2">
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
            {hasLogo ? (
              <Image
                src={logoUrl}
                alt="شعار الفاتورة الحرارية"
                width={80}
                height={80}
                unoptimized
                className="max-h-20 max-w-20 object-contain"
              />
            ) : (
              <span className="px-3 text-center text-xs font-black text-slate-500">
                شعار
              </span>
            )}
          </div>
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

function InvoiceSectionButton({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-28 rounded-[26px] border p-5 text-right transition ${
        active
          ? 'border-cyan-200/60 bg-gradient-to-l from-cyan-300 to-emerald-300 text-[#04131d] shadow-[0_0_34px_rgba(34,211,238,0.18)]'
          : 'border-cyan-300/15 bg-[#091522]/80 text-slate-200 hover:border-cyan-300/35 hover:bg-cyan-300/10'
      }`}
    >
      <span className="block text-xl font-black">{title}</span>
      <span
        className={`mt-2 block text-sm font-bold leading-6 ${
          active ? 'text-[#12303a]' : 'text-slate-400'
        }`}
      >
        {description}
      </span>
    </button>
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
}: {
  label: string
  value: string
  icon: ReactNode
}) {
  return (
    <div className="min-w-0 rounded-3xl border border-cyan-300/15 bg-[#091522]/80 p-4 transition hover:border-cyan-300/30 hover:bg-cyan-300/5">
      <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
          {icon}
        </div>
        <div className="min-w-0 text-right">
          <p className="text-xs font-black text-slate-400">{label}</p>
          <p className="mt-1 break-words text-sm font-black leading-6 text-white sm:text-base">{value}</p>
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

function EyeIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
      <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
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

function AccountIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
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

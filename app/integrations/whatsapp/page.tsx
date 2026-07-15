'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AdminButton } from '@/components/admin-button'
import { AdminInput } from '@/components/admin-input'
import { AdminSelect } from '@/components/admin-select'
import { PageHeader } from '@/components/page-header'
import { usePageAccess } from '@/hooks/use-page-access'
import { getClientCaughtErrorMessage, getClientErrorMessage } from '@/lib/api/client-error'
import type { AdminBranchRecord } from '@/lib/admin/branches'
import {
  BRANCH_WHATSAPP_PROVIDER_OPTIONS,
  canSubmitBranchWhatsAppConfig,
  createEmptyBranchWhatsAppConfigPayload,
  isSystemScopedBranchWhatsAppAdmin,
  type BranchWhatsAppConfigPayload,
  type BranchWhatsAppConfigRecord,
} from '@/lib/admin/branch-whatsapp-config'

export default function IntegrationsWhatsAppPage() {
  const access = usePageAccess(['admin'])
  const { loading: accessLoading, allowed, scopeType, branchId } = access

  const [branches, setBranches] = useState<AdminBranchRecord[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [config, setConfig] = useState<BranchWhatsAppConfigRecord | null>(null)
  const [form, setForm] = useState<BranchWhatsAppConfigPayload>(
    createEmptyBranchWhatsAppConfigPayload()
  )
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [testRecipientPhone, setTestRecipientPhone] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const isSystemAdmin =
    scopeType !== null && isSystemScopedBranchWhatsAppAdmin(scopeType)

  useEffect(() => {
    if (!allowed) return

    let cancelled = false

    async function loadBranches() {
      try {
        setLoadingBranches(true)
        setErrorMessage('')

        const response = await fetch('/api/admin/branches', {
          method: 'GET',
          cache: 'no-store',
        })

        const result = await response.json().catch(() => null)

        if (!response.ok || !result?.success) {
          throw new Error(getClientErrorMessage(result, 'تعذر تحميل الفروع حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
        }

        const nextBranches = Array.isArray(result.branches)
          ? (result.branches as AdminBranchRecord[])
          : []

        if (cancelled) return

        setBranches(nextBranches)

        const nextSelectedBranchId =
          (isSystemAdmin
            ? nextBranches[0]?.id || ''
            : branchId || nextBranches[0]?.id || '') || ''

        setSelectedBranchId(nextSelectedBranchId)
        setForm((prev) => ({
          ...prev,
          branchId: nextSelectedBranchId,
        }))
      } catch (error) {
        if (cancelled) return
        setErrorMessage(getClientCaughtErrorMessage(error, 'تعذر تحميل الفروع'))
      } finally {
        if (!cancelled) {
          setLoadingBranches(false)
        }
      }
    }

    void loadBranches()

    return () => {
      cancelled = true
    }
  }, [allowed, branchId, isSystemAdmin])

  useEffect(() => {
    if (!allowed || !selectedBranchId) return

    let cancelled = false

    async function loadConfig() {
      try {
        setLoadingConfig(true)
        setErrorMessage('')

        const response = await fetch(
          `/api/admin/branch-whatsapp-config?branchId=${encodeURIComponent(selectedBranchId)}`,
          {
            method: 'GET',
            cache: 'no-store',
          }
        )

        const result = await response.json().catch(() => null)

        if (!response.ok || !result?.success) {
          throw new Error(
            getClientErrorMessage(result, 'تعذر تحميل إعدادات واتساب حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.')
          )
        }

        const nextConfig = (result.config as BranchWhatsAppConfigRecord | null) || null

        if (cancelled) return

        setConfig(nextConfig)
        setForm({
          branchId: selectedBranchId,
          provider: nextConfig?.provider || 'ultramsg',
          phoneNumber: nextConfig?.phone_number || '',
          instanceId: nextConfig?.instance_id || '',
          token: '',
          apiUrl: nextConfig?.api_url || '',
          isActive: nextConfig?.is_active || false,
        })
      } catch (error) {
        if (cancelled) return
        setConfig(null)
        setForm((prev) => ({
          ...prev,
          branchId: selectedBranchId,
          token: '',
        }))
        setErrorMessage(
          getClientCaughtErrorMessage(error, 'تعذر تحميل إعدادات واتساب')
        )
      } finally {
        if (!cancelled) {
          setLoadingConfig(false)
        }
      }
    }

    void loadConfig()

    return () => {
      cancelled = true
    }
  }, [allowed, selectedBranchId])

  const canSubmit = useMemo(() => {
    return canSubmitBranchWhatsAppConfig(form, config?.has_token ?? false)
  }, [config?.has_token, form])

  const canSendTestMessage = useMemo(() => {
    return (
      selectedBranchId.length > 0 &&
      Boolean(config) &&
      Boolean(config?.is_active) &&
      Boolean(config?.has_token) &&
      testRecipientPhone.trim().length > 0
    )
  }, [config, selectedBranchId, testRecipientPhone])

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !selectedBranchId) return

    try {
      setSaving(true)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch('/api/admin/branch-whatsapp-config', {
        method: config ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          branchId: selectedBranchId,
          provider: form.provider,
          phone_number: form.phoneNumber,
          instance_id: form.instanceId,
          token: form.token,
          api_url: form.apiUrl,
          is_active: form.isActive,
        }),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        throw new Error(
          getClientErrorMessage(result, 'تعذر حفظ إعدادات واتساب. لم يتم حفظ التغييرات.')
        )
      }

      const nextConfig = (result.config as BranchWhatsAppConfigRecord | null) || null

      setConfig(nextConfig)
      setForm((prev) => ({
        ...prev,
        token: '',
      }))
      setSuccessMessage(result.message || 'تم حفظ إعدادات واتساب بنجاح')
    } catch (error) {
      setErrorMessage(
        getClientCaughtErrorMessage(error, 'فشل حفظ إعدادات واتساب')
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleSendTestMessage() {
    if (testSending) return

    if (!selectedBranchId) {
      setErrorMessage('اختر الفرع أولًا')
      setSuccessMessage('')
      return
    }

    if (!config || !config.has_token) {
      setErrorMessage('احفظ إعدادات واتساب لهذا الفرع أولًا')
      setSuccessMessage('')
      return
    }

    if (!config.is_active) {
      setErrorMessage('يجب تفعيل إعدادات واتساب قبل إرسال رسالة اختبار')
      setSuccessMessage('')
      return
    }

    if (!testRecipientPhone.trim()) {
      setErrorMessage('اكتب رقم المستلم لرسالة الاختبار')
      setSuccessMessage('')
      return
    }

    try {
      setTestSending(true)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: testRecipientPhone.trim(),
          mode: 'test',
          branchId: selectedBranchId,
          text: 'هاذي الرساله من نظام لاختبار الربط',
        }),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        throw new Error(
          getClientErrorMessage(result, 'تعذر إرسال رسالة واتساب حاليًا. لم يتم تأكيد الإرسال.')
        )
      }

      setSuccessMessage('تم إرسال رسالة الاختبار بنجاح')
      setErrorMessage('')
    } catch (error) {
      setErrorMessage(
        getClientCaughtErrorMessage(error, 'فشل إرسال رسالة الاختبار')
      )
      setSuccessMessage('')
    } finally {
      setTestSending(false)
    }
  }

  if (accessLoading) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 md:p-6">
        <div className="mx-auto max-w-5xl" />
      </main>
    )
  }

  if (!allowed) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 md:p-6">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-right shadow-sm">
            <h1 className="text-2xl font-black text-slate-900">غير مصرح لك</h1>
            <p className="mt-2 text-slate-600">
              هذه الصفحة متاحة للإدارة فقط.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-3">
              <Link
                href="/"
                className="inline-flex items-center rounded-2xl bg-slate-950 px-4 py-2 text-white"
              >
                العودة إلى القائمة الرئيسية
              </Link>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          title="WhatsApp"
          subtitle="إدارة إعدادات واتساب لكل فرع بشكل مستقل"
          actions={
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white"
            >
              العودة إلى القائمة الرئيسية
            </Link>
          }
        />

        {successMessage ? (
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            {successMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 whitespace-pre-wrap">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-right">
              <h2 className="text-2xl font-black text-slate-900">
                إعدادات الواتساب
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                احفظ إعدادات واتساب لكل فرع بدون كشف التوكن بعد الحفظ.
              </p>
            </div>

            <span
              className={form.isActive ? 'badge badge-green' : 'badge badge-rose'}
            >
              {form.isActive ? 'نشط' : 'غير نشط'}
            </span>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                الفرع
              </label>
              <AdminSelect
                value={selectedBranchId}
                onChange={(event) => setSelectedBranchId(event.target.value)}
                disabled={loadingBranches || (!isSystemAdmin && Boolean(branchId))}
                className="h-12 w-full min-w-0"
              >
                <option value="">اختر الفرع</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </AdminSelect>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  المزود
                </label>
                <AdminSelect
                  value={form.provider}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      provider: event.target.value as BranchWhatsAppConfigPayload['provider'],
                    }))
                  }
                  className="h-12 w-full min-w-0"
                >
                  {BRANCH_WHATSAPP_PROVIDER_OPTIONS.map((providerOption) => (
                    <option key={providerOption.value} value={providerOption.value}>
                      {providerOption.label}
                    </option>
                  ))}
                </AdminSelect>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  رقم الهاتف
                </label>
                <AdminInput
                  type="text"
                  value={form.phoneNumber}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      phoneNumber: event.target.value,
                    }))
                  }
                  placeholder="9665XXXXXXXX"
                  className="h-12 border-slate-300 text-left focus:border-slate-500"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Instance ID
                </label>
                <AdminInput
                  type="text"
                  value={form.instanceId}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      instanceId: event.target.value,
                    }))
                  }
                  placeholder="instance123456"
                  className="h-12 border-slate-300 text-left focus:border-slate-500"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  API URL
                </label>
                <AdminInput
                  type="text"
                  value={form.apiUrl}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      apiUrl: event.target.value,
                    }))
                  }
                  placeholder="https://api.example.com/instance"
                  className="h-12 border-slate-300 text-left focus:border-slate-500"
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                التوكن
              </label>
              <AdminInput
                type="password"
                value={form.token}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    token: event.target.value,
                  }))
                }
                placeholder={
                  config?.has_token
                    ? 'اتركه فارغًا للإبقاء على التوكن الحالي'
                    : 'أدخل التوكن'
                }
                className="h-12 border-slate-300 text-left focus:border-slate-500"
                dir="ltr"
                autoComplete="new-password"
              />
              {config?.has_token ? (
                <p className="mt-2 text-xs font-medium text-slate-500">
                  التوكن الحالي: {config.token_masked}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-right">
                <p className="text-sm font-bold text-slate-900">حالة التكامل</p>
                <p className="text-xs text-slate-500">
                  {form.isActive ? 'سيتم استخدام الإعدادات في الإرسال' : 'الإعدادات محفوظة ولكن غير مفعلة'}
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      isActive: event.target.checked,
                    }))
                  }
                />
                <span>{form.isActive ? 'نشط' : 'غير نشط'}</span>
              </label>
            </div>

            <div className="flex justify-end">
              <AdminButton
                type="submit"
                variant="primary"
                disabled={
                  saving ||
                  loadingBranches ||
                  loadingConfig ||
                  !selectedBranchId ||
                  !canSubmit
                }
              >
                {saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
              </AdminButton>
            </div>
          </form>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <div className="mb-5 text-right">
            <h2 className="text-2xl font-black text-slate-900">
              رسالة اختبار
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              أرسل رسالة اختبار باستخدام إعدادات الفرع المحدد الحالية.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                رقم المستلم
              </label>
              <AdminInput
                type="text"
                value={testRecipientPhone}
                onChange={(event) => setTestRecipientPhone(event.target.value)}
                placeholder="9665XXXXXXXX"
                className="h-12 border-slate-300 text-left focus:border-slate-500"
                dir="ltr"
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
              <p className="text-sm font-bold text-slate-900">نص الرسالة</p>
              <p className="mt-1 text-sm text-slate-600">
                هاذي الرساله من نظام لاختبار الربط
              </p>
            </div>

            <div className="flex justify-end">
              <AdminButton
                onClick={handleSendTestMessage}
                variant="primary"
                disabled={
                  testSending ||
                  loadingBranches ||
                  loadingConfig ||
                  !canSendTestMessage
                }
              >
                {testSending ? 'جارٍ الإرسال...' : 'إرسال رسالة اختبار'}
              </AdminButton>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

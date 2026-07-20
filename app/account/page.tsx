'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { getClientErrorMessage } from '@/lib/api/client-error'

type AccountData = {
  id: string
  username: string | null
  full_name: string | null
  phone: string | null
  contact_email: string | null
  tenant_name: string | null
  branch_name: string | null
}

function splitFullName(fullName: string | null) {
  const nameParts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  const firstName = nameParts[0] || ''
  const lastName = nameParts.slice(1).join(' ')

  return { firstName, lastName }
}

function getArabicErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && /[\u0600-\u06ff]/.test(error.message)
    ? error.message
    : fallback
}

export default function AccountPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [account, setAccount] = useState<AccountData | null>(null)
  const [accessToken, setAccessToken] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [username, setUsername] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [branchName, setBranchName] = useState('')

  const labelClass = 'mb-2 block text-sm font-black text-slate-200'
  const fieldClass =
    'h-[52px] w-full rounded-2xl border border-white/12 bg-white/[0.07] px-4 text-right text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/55 focus:bg-white/[0.09] focus:ring-4 focus:ring-cyan-300/10'
  const readonlyFieldClass =
    'h-[52px] w-full rounded-2xl border border-cyan-300/15 bg-cyan-300/10 px-4 text-right font-black text-cyan-100 outline-none'

  useEffect(() => {
    let mounted = true

    async function loadAccount() {
      try {
        setLoading(true)
        setErrorMessage('')

        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.access_token) {
          throw new Error('يجب تسجيل الدخول أولاً')
        }

        setAccessToken(session.access_token)

        const response = await fetch('/api/account', {
          method: 'GET',
          credentials: 'include',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        })
        const result = await response.json().catch(() => null)

        if (!response.ok || !result?.success) {
          throw new Error(
            getClientErrorMessage(result, 'تعذر تحميل بيانات الحساب حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.')
          )
        }

        const nextAccount = result.account as AccountData

        if (!mounted) {
          return
        }

        const safeFullName =
          nextAccount.full_name?.trim() === nextAccount.username?.trim()
            ? ''
            : nextAccount.full_name
        const nextName = splitFullName(safeFullName)

        setAccount(nextAccount)
        setTenantName(nextAccount.tenant_name || '')
        setUsername(nextAccount.username || '')
        setContactEmail(nextAccount.contact_email || '')
        setPhone(nextAccount.phone || '')
        setFirstName(nextName.firstName)
        setLastName(nextName.lastName)
        setBranchName(nextAccount.branch_name || '')
      } catch (error) {
        if (!mounted) {
          return
        }

        setErrorMessage(
          getArabicErrorMessage(error, 'تعذر تحميل بيانات الحساب')
        )
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadAccount()

    return () => {
      mounted = false
    }
  }, [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSuccessMessage('')
    setErrorMessage('')

    try {
      setSaving(true)

      const trimmedTenantName = tenantName.trim()
      const trimmedContactEmail = contactEmail.trim()
      const trimmedPhone = phone.trim()
      const trimmedFirstName = firstName.trim()
      const trimmedBranchName = branchName.trim()

      if (
        !trimmedTenantName ||
        !trimmedContactEmail ||
        !trimmedPhone ||
        !trimmedFirstName
      ) {
        setErrorMessage('يرجى تعبئة جميع الحقول المطلوبة')
        return
      }

      const fullName = [firstName, lastName]
        .map((name) => name.trim())
        .filter(Boolean)
        .join(' ')
      const token =
        accessToken ||
        (await supabase.auth.getSession()).data.session?.access_token ||
        ''

      const response = await fetch('/api/account', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          tenant_name: trimmedTenantName,
          full_name: fullName,
          phone: trimmedPhone,
          contact_email: trimmedContactEmail,
          branch_name: trimmedBranchName,
        }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        if (response.status === 409) {
          throw new Error('البريد الإلكتروني مسجل بالفعل')
        }

        throw new Error(
          getClientErrorMessage(result, 'تعذر تحديث بيانات الحساب. لم يتم حفظ التغييرات.')
        )
      }

      const updatedAccount = result.account as AccountData
      const updatedName = splitFullName(updatedAccount.full_name)

      setAccount(updatedAccount)
      setTenantName(updatedAccount.tenant_name || tenantName)
      setUsername(updatedAccount.username || username)
      setContactEmail(updatedAccount.contact_email || '')
      setPhone(updatedAccount.phone || '')
      setFirstName(updatedName.firstName)
      setLastName(updatedName.lastName)
      setBranchName(updatedAccount.branch_name || branchName)
      setSuccessMessage('تم تحديث بيانات الحساب بنجاح')
    } catch (error) {
      setErrorMessage(
        getArabicErrorMessage(error, 'تعذر تحديث بيانات الحساب')
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <main
      dir="rtl"
      className="relative min-h-screen overflow-hidden bg-[#030714] px-4 py-8 text-white sm:px-6 lg:px-8"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-[-12rem] top-[-12rem] h-[34rem] w-[34rem] rounded-full bg-cyan-400/20 blur-[120px]" />
        <div className="absolute left-[-10rem] bottom-[-10rem] h-[32rem] w-[32rem] rounded-full bg-emerald-400/16 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:76px_76px] opacity-25" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <section className="relative w-full overflow-hidden rounded-[30px] border border-white/12 bg-white/[0.045] p-6 text-right shadow-[0_28px_100px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-8">
          <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-cyan-300/14 blur-3xl" />
          <div className="absolute -bottom-16 right-10 h-52 w-52 rounded-full bg-emerald-300/12 blur-3xl" />

          <div className="relative mx-auto max-w-2xl">
            <div className="mb-7 text-center">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200/60">
                AFEX
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-4xl">
                تعديل الحساب
              </h1>
            </div>

            {successMessage ? (
              <div className="mb-5 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-bold text-emerald-100 shadow-[0_0_35px_rgba(52,211,153,0.08)]">
                {successMessage}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="mb-5 rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-100 shadow-[0_0_35px_rgba(251,113,133,0.08)]">
                {errorMessage}
              </div>
            ) : null}

            {loading ? (
              <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-4 text-sm font-bold text-cyan-100">
                جارٍ تحميل بيانات الحساب...
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className={labelClass}>اسم المؤسسة / الشركة *</span>
                    <input
                      type="text"
                      value={tenantName}
                      onChange={(event) => setTenantName(event.target.value)}
                      className={fieldClass}
                      placeholder="مثال: AFEX"
                      autoComplete="organization"
                    />
                  </label>

                  <label className="block">
                    <span className={labelClass}>اسم المستخدم</span>
                    <input
                      type="text"
                      value={username || account?.username || ''}
                      className={`${readonlyFieldClass} text-left`}
                      readOnly
                      dir="ltr"
                    />
                  </label>

                  <label className="block">
                    <span className={labelClass}>البريد الإلكتروني *</span>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(event) => setContactEmail(event.target.value)}
                      className={`${fieldClass} text-left`}
                      placeholder="owner@example.com"
                      autoComplete="email"
                      dir="ltr"
                    />
                  </label>

                  <label className="block">
                    <span className={labelClass}>رقم الجوال *</span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className={`${fieldClass} text-left`}
                      placeholder="05xxxxxxxx"
                      autoComplete="tel"
                      dir="ltr"
                    />
                  </label>

                  <label className="block">
                    <span className={labelClass}>الاسم الأول *</span>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      className={fieldClass}
                      placeholder="مثال: فيصل"
                      autoComplete="given-name"
                    />
                  </label>

                  <label className="block">
                    <span className={labelClass}>الاسم الأخير</span>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      className={fieldClass}
                      placeholder="مثال: أحمد"
                      autoComplete="family-name"
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <span className={labelClass}>اسم الفرع</span>
                    <input
                      type="text"
                      value={branchName}
                      onChange={(event) => setBranchName(event.target.value)}
                      className={fieldClass}
                      placeholder="مثال: الفرع الرئيسي"
                      autoComplete="organization-title"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="h-[52px] w-full rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 text-base font-black text-slate-950 shadow-[0_20px_60px_rgba(45,212,191,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(45,212,191,0.34)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
                </button>

                <Link
                  href="/"
                  className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-sm font-black text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-300/15"
                >
                  العودة للرئيسية
                </Link>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

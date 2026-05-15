'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type AccountData = {
  id: string
  username: string | null
  full_name: string | null
  phone: string | null
  contact_email: string | null
  role: string
  is_active: boolean
}

function getRoleLabel(role: string) {
  if (role === 'admin' || role === 'manager') {
    return 'مدير'
  }

  if (role === 'employee') {
    return 'موظف'
  }

  if (role === 'cashier') {
    return 'كاشير'
  }

  return role || '-'
}

function splitFullName(fullName: string | null) {
  const nameParts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  const firstName = nameParts[0] || ''
  const lastName = nameParts.slice(1).join(' ')

  return { firstName, lastName }
}

function UserIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

export default function AccountPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [account, setAccount] = useState<AccountData | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')

  useEffect(() => {
    let mounted = true

    async function loadAccount() {
      try {
        setLoading(true)
        setErrorMessage('')

        const response = await fetch('/api/account', {
          method: 'GET',
        })
        const result = await response.json()

        if (!response.ok) {
          throw new Error(result?.details || result?.error || 'تعذر تحميل بيانات الحساب')
        }

        const nextAccount = result.account as AccountData

        if (!mounted) {
          return
        }

        setAccount(nextAccount)
        const safeFullName =
          nextAccount.full_name?.trim() === nextAccount.username?.trim()
            ? ''
            : nextAccount.full_name
        const nextName = splitFullName(safeFullName)
        setFirstName(nextName.firstName)
        setLastName(nextName.lastName)
        setPhone(nextAccount.phone || '')
        setContactEmail(nextAccount.contact_email || '')
      } catch (error) {
        if (!mounted) {
          return
        }

        setErrorMessage(
          error instanceof Error ? error.message : 'تعذر تحميل بيانات الحساب'
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
      const fullName = [firstName, lastName]
        .map((name) => name.trim())
        .filter(Boolean)
        .join(' ')
      const payload: {
        full_name?: string
        phone: string
        contact_email: string
      } = {
        phone,
        contact_email: contactEmail,
      }

      if (fullName) {
        payload.full_name = fullName
      }

      const response = await fetch('/api/account', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      const result = await response.json()

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('البريد الإلكتروني مسجل بالفعل')
        }

        throw new Error(result?.details || result?.error || 'تعذر تحديث بيانات الحساب')
      }

      const updatedAccount = result.account as AccountData
      const safeUpdatedFullName =
        updatedAccount.full_name?.trim() === updatedAccount.username?.trim()
          ? ''
          : updatedAccount.full_name
      const updatedName = splitFullName(safeUpdatedFullName)

      setAccount(updatedAccount)
      setFirstName(updatedName.firstName)
      setLastName(updatedName.lastName)
      setSuccessMessage('تم تحديث بيانات الحساب بنجاح')
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر تحديث بيانات الحساب'
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

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <section className="w-full rounded-[30px] border border-white/12 bg-white/[0.055] p-5 text-right shadow-[0_28px_100px_rgba(0,0,0,0.34)] backdrop-blur-xl md:p-8">
          <div className="mb-8 flex flex-col gap-4 text-center md:flex-row md:items-center md:justify-between md:text-right">
            <div>
              <div className="mb-4 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">
                AFEX ACCOUNT
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white">
                تعديل الحساب
              </h1>
              <p className="mt-2 text-sm leading-7 text-slate-400">
                حدّث بياناتك الأساسية وبيانات التواصل.
              </p>
            </div>

            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] px-5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.075]"
            >
              العودة للرئيسية
            </Link>
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
              جاري تحميل بيانات الحساب...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="flex items-center gap-3 rounded-2xl border border-cyan-300/18 bg-cyan-300/10 px-4 py-3 text-cyan-100 shadow-[0_0_35px_rgba(34,211,238,0.08)]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-[#06111f]/80">
                  <UserIcon />
                </span>
                <div>
                  <p className="text-xs font-bold text-cyan-100/65">
                    اسم المستخدم
                  </p>
                  <p className="mt-1 text-sm font-black text-white" dir="ltr">
                    {account?.username || '-'}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-200">
                    الاسم الأول
                  </span>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    placeholder="اكتب الاسم الأول"
                    className="h-14 w-full rounded-2xl border border-white/12 bg-white/[0.07] px-4 text-right text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/55 focus:bg-white/[0.09] focus:ring-4 focus:ring-cyan-300/10"
                    autoComplete="given-name"
                  />
                  <span className="mt-1.5 block text-xs font-bold text-slate-500">
                    اختياري
                  </span>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-200">
                    الاسم الأخير
                  </span>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    placeholder="اكتب الاسم الأخير"
                    className="h-14 w-full rounded-2xl border border-white/12 bg-white/[0.07] px-4 text-right text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/55 focus:bg-white/[0.09] focus:ring-4 focus:ring-cyan-300/10"
                    autoComplete="family-name"
                  />
                  <span className="mt-1.5 block text-xs font-bold text-slate-500">
                    اختياري
                  </span>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-200">
                    رقم الجوال
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="05xxxxxxxx"
                    className="h-14 w-full rounded-2xl border border-white/12 bg-white/[0.07] px-4 text-right text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/55 focus:bg-white/[0.09] focus:ring-4 focus:ring-cyan-300/10"
                    autoComplete="tel"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-200">
                    بريد التواصل
                  </span>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(event) => setContactEmail(event.target.value)}
                    placeholder="name@example.com"
                    className="h-14 w-full rounded-2xl border border-white/12 bg-white/[0.07] px-4 text-right text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/55 focus:bg-white/[0.09] focus:ring-4 focus:ring-cyan-300/10"
                    autoComplete="email"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3">
                  <p className="text-xs font-bold text-slate-500">الدور</p>
                  <p className="mt-2 text-sm font-black text-cyan-100">
                    {getRoleLabel(account?.role || '')}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3">
                  <p className="text-xs font-bold text-slate-500">حالة الحساب</p>
                  <p className="mt-2 text-sm font-black text-emerald-100">
                    {account?.is_active ? 'نشط' : 'غير نشط'}
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="h-14 w-full rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 text-base font-black text-slate-950 shadow-[0_20px_60px_rgba(45,212,191,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(45,212,191,0.34)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  )
}

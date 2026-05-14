'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type SignupFormState = {
  tenantName: string
  username: string
  password: string
  firstName: string
  lastName: string
  phone: string
  email: string
  branchName: string
}

const initialFormState: SignupFormState = {
  tenantName: '',
  username: '',
  password: '',
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  branchName: '',
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const benefits = ['إنشاء فوري', 'متعدد الفروع', 'جاهز لنقطة البيع']
const steps = ['إنشاء المنشأة', 'إضافة الفرع', 'الدخول للنظام']

function getApiErrorMessage(value: unknown) {
  if (!value || typeof value !== 'object') {
    return 'تعذر إنشاء المنشأة. حاول مرة أخرى.'
  }

  const response = value as { error?: unknown; details?: unknown }
  const details =
    typeof response.details === 'string' ? response.details.trim() : ''
  const error = typeof response.error === 'string' ? response.error.trim() : ''

  return details || error || 'تعذر إنشاء المنشأة. حاول مرة أخرى.'
}

export default function SignupPage() {
  const router = useRouter()
  const [form, setForm] = useState<SignupFormState>(initialFormState)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function updateField(field: keyof SignupFormState, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function validateForm() {
    const tenantName = form.tenantName.trim()
    const username = form.username.trim().toLowerCase()
    const password = form.password
    const firstName = form.firstName.trim()
    const lastName = form.lastName.trim()
    const fullName = lastName ? `${firstName} ${lastName}` : firstName
    const phone = form.phone.trim()
    const email = form.email.trim().toLowerCase()
    const branchName = form.branchName.trim()

    if (!tenantName) {
      throw new Error('اسم المنشأة مطلوب')
    }

    if (!username) {
      throw new Error('اسم المستخدم مطلوب')
    }

    if (password.length < 8) {
      throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    }

    if (!firstName) {
      throw new Error('الاسم الأول مطلوب')
    }

    if (!email || !emailPattern.test(email)) {
      throw new Error('البريد الإلكتروني مطلوب ويجب أن يكون صحيحًا')
    }

    return {
      tenantName,
      username,
      password,
      fullName,
      phone,
      email,
      branchName,
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setLoading(true)
      setError('')
      setSuccess('')

      const payload = validateForm()
      const response = await fetch('/api/onboarding/create-tenant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        throw new Error(getApiErrorMessage(result))
      }

      setSuccess('تم إنشاء المنشأة بنجاح. سيتم تحويلك إلى تسجيل الدخول خلال ثانيتين.')

      window.setTimeout(() => {
        router.replace('/login')
      }, 2000)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'تعذر إنشاء المنشأة. حاول مرة أخرى.'
      )
    } finally {
      setLoading(false)
    }
  }

  const fieldClass =
    'h-12 w-full rounded-2xl border border-white/12 bg-white/[0.07] px-4 text-right text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/55 focus:bg-white/[0.09] focus:ring-4 focus:ring-cyan-300/10'
  const labelClass = 'mb-2 block text-sm font-bold text-slate-200'

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

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full gap-5 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="order-1 rounded-[30px] border border-white/12 bg-white/[0.055] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.34)] backdrop-blur-xl md:p-8 lg:order-none">
            <div className="mb-6 text-center">
              <div className="mb-4 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">
                ابدأ منشأتك الآن
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">
                إنشاء حساب جديد
              </h1>
              <p className="mt-2 text-sm text-slate-400">AFEX</p>
            </div>

            {error ? (
              <div className="mb-4 rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-100 shadow-[0_0_35px_rgba(251,113,133,0.08)]">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="mb-4 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100 shadow-[0_0_35px_rgba(52,211,153,0.08)]">
                {success}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>اسم المنشأة</span>
                  <input
                    type="text"
                    value={form.tenantName}
                    onChange={(event) =>
                      updateField('tenantName', event.target.value)
                    }
                    className={fieldClass}
                    placeholder="مثال: AFEX"
                    autoComplete="organization"
                  />
                </label>

                <label className="block">
                  <span className={labelClass}>اسم المستخدم</span>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(event) =>
                      updateField('username', event.target.value)
                    }
                    className={`${fieldClass} text-left`}
                    placeholder="owner"
                    autoComplete="username"
                    dir="ltr"
                  />
                </label>

                <label className="block">
                  <span className={labelClass}>البريد الإلكتروني</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => updateField('email', event.target.value)}
                    className={`${fieldClass} text-left`}
                    placeholder="owner@example.com"
                    autoComplete="email"
                    dir="ltr"
                  />
                </label>

                <label className="block">
                  <span className={labelClass}>كلمة المرور</span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) =>
                      updateField('password', event.target.value)
                    }
                    className={fieldClass}
                    placeholder="8 أحرف على الأقل"
                    autoComplete="new-password"
                  />
                </label>

                <label className="block">
                  <span className={labelClass}>الاسم الأول *</span>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(event) =>
                      updateField('firstName', event.target.value)
                    }
                    className={fieldClass}
                    placeholder="مثال: فيصل"
                    autoComplete="given-name"
                  />
                </label>

                <label className="block">
                  <span className={labelClass}>اسم العائلة</span>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(event) =>
                      updateField('lastName', event.target.value)
                    }
                    className={fieldClass}
                    placeholder="مثال: أحمد"
                    autoComplete="family-name"
                  />
                </label>

                <label className="block">
                  <span className={labelClass}>رقم الجوال</span>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(event) => updateField('phone', event.target.value)}
                    className={`${fieldClass} text-left`}
                    placeholder="اختياري"
                    autoComplete="tel"
                    dir="ltr"
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className={labelClass}>اسم الفرع</span>
                  <input
                    type="text"
                    value={form.branchName}
                    onChange={(event) =>
                      updateField('branchName', event.target.value)
                    }
                    className={fieldClass}
                    placeholder="اختياري، مثال: الفرع الرئيسي"
                    autoComplete="organization-title"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="h-[52px] w-full rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 text-base font-black text-slate-950 shadow-[0_20px_60px_rgba(45,212,191,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(45,212,191,0.34)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'جارٍ إنشاء المنشأة...' : 'إنشاء المنشأة'}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-slate-400">
              لديك حساب بالفعل؟{' '}
              <Link
                href="/login"
                className="font-black text-cyan-200 underline decoration-cyan-300/40 underline-offset-4 transition hover:text-cyan-100"
              >
                تسجيل الدخول
              </Link>
            </p>
          </section>

          <section className="relative overflow-hidden rounded-[30px] border border-white/12 bg-white/[0.045] p-6 shadow-[0_28px_100px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-8">
            <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-cyan-300/14 blur-3xl" />
            <div className="absolute -bottom-16 right-10 h-52 w-52 rounded-full bg-emerald-300/12 blur-3xl" />

            <div className="relative flex h-full flex-col justify-between gap-8">
              <div>
                <Image
                  src="/brand/afex-logo.png"
                  alt="AFEX"
                  width={720}
                  height={260}
                  priority
                  className="mb-7 h-20 w-auto object-contain drop-shadow-[0_0_24px_rgba(45,212,191,0.24)]"
                />

                <h2 className="text-3xl font-black leading-tight text-white md:text-4xl">
                  ابدأ منشأتك على النظام خلال دقائق.
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-8 text-slate-300 md:text-base">
                  أنشئ حساب المنشأة والمستخدم الرئيسي والفرع الأول تلقائيًا، ثم
                  ابدأ بإدارة المبيعات والفواتير من مكان واحد.
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {benefits.map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-3 text-sm font-bold text-slate-200"
                    >
                      <span className="mb-2 block h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.9)]" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[26px] border border-cyan-300/25 bg-[#07111f]/85 p-4 shadow-[0_0_55px_rgba(34,211,238,0.12)]">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-cyan-200/70">ONBOARDING</p>
                    <p className="mt-1 text-sm font-black text-white">
                      خطوات الانطلاق
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-300/10 px-3 py-1 text-xs font-black text-emerald-200">
                    سريع
                  </span>
                </div>

                <div className="space-y-3">
                  {steps.map((step, index) => (
                    <div
                      key={step}
                      className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.045] p-3"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-l from-cyan-300 to-emerald-300 text-sm font-black text-slate-950">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-black text-white">{step}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          يتم تجهيزها تلقائيًا ضمن تدفق الإنشاء.
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

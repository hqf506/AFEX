'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthState } from '@/components/auth-state-provider'
import { useProfilePresentation } from '@/components/profile-presentation-provider'
import { isFullAdmin } from '@/lib/permissions'
import { supabase } from '@/lib/supabase/client'
import { normalizeUsername } from '@/lib/usernames'
import { getClientErrorMessage } from '@/lib/api/client-error'

const navLinks = [
  { href: '/', label: 'الرئيسية' },
  { href: '#features', label: 'المزايا' },
  { href: '#pricing', label: 'الأسعار' },
  { href: '#about', label: 'عن النظام' },
]

const quickLinks = [
  { href: '/pos', label: 'نقطة البيع POS' },
  { href: '/admin/dashboard', label: 'لوحة التحكم' },
  { href: '/admin/orders', label: 'Orders' },
]

const metrics = [
  { label: 'مبيعات اليوم', value: '48,600', hint: '+18.2%', accent: 'text-cyan-300' },
  { label: 'الفواتير', value: '126', hint: '+8.1%', accent: 'text-emerald-300' },
  { label: 'الطلبات النشطة', value: '18', hint: '+6.9%', accent: 'text-amber-300' },
  { label: 'العملاء', value: '1,250', hint: '+15.3%', accent: 'text-cyan-200' },
]

const orders = [
  { id: '#1025', amount: '1,250 ر.س', status: 'مكتمل', color: 'bg-emerald-300' },
  { id: '#1024', amount: '950 ر.س', status: 'قيد التنفيذ', color: 'bg-amber-300' },
  { id: '#1023', amount: '620 ر.س', status: 'جديد', color: 'bg-cyan-300' },
  { id: '#1022', amount: '1,800 ر.س', status: 'مكتمل', color: 'bg-emerald-300' },
]

const features = [
  {
    title: 'نقطة البيع POS',
    description: 'واجهة بيع سريعة وسهلة تدعم الفوترة المختلفة لنقاط أفضل.',
    icon: 'cart',
  },
  {
    title: 'إدارة الفواتير',
    description: 'إنشاء فواتير احترافية وإدارة المدفوعات والمستحقات بكفاءة عالية.',
    icon: 'invoice',
  },
  {
    title: 'الفروع والمستخدمون',
    description: 'إدارة الفروع والصلاحيات والمستخدمين بكل سهولة ومرونة.',
    icon: 'users',
  },
  {
    title: 'التقارير والمبيعات',
    description: 'تقارير تفصيلية ومؤشرات أداء لمساعدتك في اتخاذ قرارات أكثر ذكاءً.',
    icon: 'chart',
  },
  {
    title: 'تعدد المنشآت',
    description: 'دعم كامل لتعدد المنشآت والفروع مع عزل البيانات بأعلى معايير الأمان.',
    icon: 'building',
  },
  {
    title: 'العمل دون اتصال',
    description: 'إنشاء مسودات الفواتير والطلبات والعمل دون إنترنت ومزامنتها لاحقًا.',
    icon: 'cloud',
  },
]

const bars = [34, 64, 48, 78, 55, 88, 70]
const linePoints = '0,96 66,58 132,68 198,32 264,54 330,44 396,18'

function FeatureIcon({ type }: { type: string }) {
  if (type === 'cart') {
    return (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" aria-hidden="true">
        <path d="M5 5h2l1.4 9.2a2 2 0 0 0 2 1.8h6.8a2 2 0 0 0 1.9-1.4L21 8H8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 20h.01M18 20h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    )
  }

  if (type === 'invoice') {
    return (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" aria-hidden="true">
        <path d="M7 3h10a2 2 0 0 1 2 2v16l-3-2-2 2-2-2-2 2-2-2-3 2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (type === 'users') {
    return (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" aria-hidden="true">
        <path d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4 21a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M18 7a3 3 0 0 1 3 3M3 10a3 3 0 0 1 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }

  if (type === 'chart') {
    return (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" aria-hidden="true">
        <path d="M4 20V4M4 20h17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M8 17v-5M13 17V7M18 17v-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (type === 'building') {
    return (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" aria-hidden="true">
        <path d="M5 21V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v15M16 10h2a2 2 0 0 1 2 2v9M3 21h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 8h3M9 12h3M9 16h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" aria-hidden="true">
      <path d="M7 18h10a4 4 0 0 0 .7-7.94A6 6 0 0 0 6.2 8.4 4.8 4.8 0 0 0 7 18Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 14h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function Logo({ className = '' }: { className?: string }) {
  return (
    <Image
      src="/brand/afex-logo.png"
      alt="AFEX"
      width={720}
      height={260}
      className={className}
      draggable={false}
      priority
    />
  )
}

function UserIcon() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-cyan-100">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
        <path
          d="M16 9a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M5 20a7 7 0 0 1 14 0"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
    </span>
  )
}

function getFirstName(value: string) {
  return value.trim().split(/\s+/)[0] || value.trim()
}

function getAdminEntryPath(role: string | null | undefined) {
  if (isFullAdmin(role)) {
    return '/admin/dashboard'
  }

  if (role === 'employee') {
    return '/admin/orders'
  }

  return null
}

export default function LandingPage() {
  const router = useRouter()
  const authState = useAuthState()
  const presentationState = useProfilePresentation()
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [localFirstName, setLocalFirstName] = useState('')
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [protectedNavLoading, setProtectedNavLoading] = useState(false)
  const [protectedNavMessage, setProtectedNavMessage] = useState('')
  const [developerAllowed, setDeveloperAllowed] = useState(false)

  useEffect(() => {
    if (authState.status !== 'authenticated') {
      return
    }
    const controller = new AbortController()
    void fetch('/api/developer/access', { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => setDeveloperAllowed(result?.allowed === true))
      .catch(() => setDeveloperAllowed(false))
    return () => controller.abort()
  }, [authState.status])

  const profileName =
    presentationState.data?.full_name?.trim() ||
    authState.profile?.full_name?.trim() ||
    ''
  const profileRole = authState.profile?.role || ''
  const adminEntryPath = getAdminEntryPath(profileRole)
  const displayFirstName = localFirstName || (profileName ? getFirstName(profileName) : '')
  const isSignedInForUi = Boolean(authState.profile || localFirstName)
  const isAuthReadyForProtectedNav =
    authState.status === 'authenticated' && Boolean(authState.profile)
  const visibleQuickLinks = isSignedInForUi
    ? [
        ...(adminEntryPath
          ? [{ href: '/admin/dashboard', label: 'لوحة التحكم' }]
          : []),
        { href: '/pos', label: 'نقطة البيع POS' },
        ...(developerAllowed
          ? [{ href: '/developer', label: 'مركز المطور' }]
          : []),
      ]
    : quickLinks

  function openLoginModal() {
    if (isSignedInForUi) {
      return
    }

    setLoginError('')
    setLoginModalOpen(true)
  }

  function closeLoginModal() {
    setLoginModalOpen(false)
    setLoginError('')
  }

  async function handleLandingLogout() {
    await supabase.auth.signOut()
    setAccountMenuOpen(false)
    setLocalFirstName('')
    setProtectedNavMessage('')
    router.replace('/')
  }

  async function handleDashboardClick() {
    if (!isSignedInForUi) {
      openLoginModal()
      return
    }

    if (isAuthReadyForProtectedNav) {
      const nextAdminPath = getAdminEntryPath(authState.profile?.role)

      if (nextAdminPath) {
        router.push(nextAdminPath)
      }

      return
    }

    try {
      setProtectedNavLoading(true)
      setProtectedNavMessage('جارٍ تجهيز الجلسة...')

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        setProtectedNavMessage('جارٍ تجهيز الجلسة، حاول مرة أخرى بعد لحظة.')
        return
      }

      await authState.refreshAuthState()
      const { data: refreshedProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle()
      const nextAdminPath = getAdminEntryPath(refreshedProfile?.role)

      if (nextAdminPath) {
        router.push(nextAdminPath)
      }
    } finally {
      setProtectedNavLoading(false)
    }
  }

  async function handleLandingLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')

    try {
      setLoginLoading(true)

      const normalizedUsername = normalizeUsername(loginUsername)

      if (!normalizedUsername) {
        throw new Error('يرجى كتابة اسم المستخدم')
      }

      if (!loginPassword.trim()) {
        throw new Error('يرجى كتابة كلمة المرور')
      }

      const checkResponse = await fetch('/api/auth/check-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: normalizedUsername,
        }),
      })

      const checkResult = await checkResponse.json()

      if (!checkResponse.ok) {
        throw new Error(getClientErrorMessage(checkResult, 'تعذر التحقق من المستخدم'))
      }

      if (!checkResult?.exists) {
        throw new Error('اسم المستخدم غير صحيح')
      }

      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: normalizedUsername,
          password: loginPassword,
        }),
      })
      const loginResult = await loginResponse.json().catch(() => null)

      if (!loginResponse.ok || !loginResult?.success) {
        throw new Error(loginResult?.error || 'كلمة المرور غير صحيحة')
      }

      if (
        loginResult.session?.access_token &&
        loginResult.session?.refresh_token
      ) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: loginResult.session.access_token,
          refresh_token: loginResult.session.refresh_token,
        })

        if (sessionError) {
          throw sessionError
        }
      }

      const nextFirstName =
        typeof loginResult.firstName === 'string' && loginResult.firstName.trim()
          ? loginResult.firstName.trim()
          : normalizedUsername

      setLoginModalOpen(false)
      setLocalFirstName(nextFirstName)
      setAccountMenuOpen(false)
      setLoginPassword('')
      setProtectedNavMessage('')
      router.refresh()
      void authState.refreshAuthState()
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'حدث خطأ أثناء تسجيل الدخول')
    } finally {
      setLoginLoading(false)
    }
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen overflow-x-hidden bg-[#030714] text-white"
    >
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_17%_20%,rgba(34,211,238,0.2),transparent_22%),radial-gradient(circle_at_88%_12%,rgba(45,212,191,0.16),transparent_24%),radial-gradient(circle_at_48%_88%,rgba(30,64,175,0.24),transparent_30%),linear-gradient(180deg,#030714_0%,#050b18_48%,#030714_100%)]" />
        <div className="absolute bottom-[55%] h-px w-full bg-gradient-to-l from-transparent via-cyan-300/20 to-transparent" />
        <div className="absolute bottom-0 h-[260px] w-full bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.18),transparent_55%)]" />
        <div className="absolute bottom-0 h-[220px] w-full opacity-30 [background-image:linear-gradient(rgba(45,212,191,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(45,212,191,0.16)_1px,transparent_1px)] [background-size:58px_58px] [mask-image:linear-gradient(to_top,black,transparent)]" />
      </div>

      <header className="relative z-[80] px-4 pt-5 sm:px-6 lg:px-8">
        <div className="relative z-[80] mx-auto flex max-w-7xl items-center justify-between overflow-visible rounded-3xl border border-white/12 bg-[#07101f]/75 px-4 py-3 shadow-[0_22px_80px_rgba(0,0,0,0.38)] backdrop-blur-xl">
          <Link href="/" className="flex items-center">
            <Logo className="h-12 w-auto object-contain md:h-14" />
          </Link>

          <nav className="hidden items-center gap-7 text-xs font-bold text-white/58 lg:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="transition hover:text-cyan-200"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 text-xs font-bold">
            {displayFirstName ? (
              <div className="relative z-[90]">
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((current) => !current)}
                  className="flex items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.035] px-3 py-2 text-white/85 transition hover:border-cyan-200/30 hover:bg-white/[0.07]"
                  aria-expanded={accountMenuOpen}
                >
                  <UserIcon />
                  <span>مرحباً، {displayFirstName}</span>
                </button>

                {isSignedInForUi && accountMenuOpen ? (
                  <div className="absolute left-0 top-[calc(100%+0.65rem)] z-[999] w-56 rounded-2xl border border-cyan-300/25 bg-[#06111f]/95 p-2 text-right shadow-[0_28px_90px_rgba(0,0,0,0.58),0_0_45px_rgba(34,211,238,0.16)] backdrop-blur-xl">
                    <Link
                      href="/account"
                      onClick={() => setAccountMenuOpen(false)}
                      className="block rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-cyan-300/10 hover:text-cyan-100"
                    >
                      تعديل الحساب
                    </Link>
                    <button
                      type="button"
                      onClick={handleLandingLogout}
                      className="mt-1 block w-full rounded-xl px-3.5 py-2.5 text-right text-sm font-bold text-rose-200 transition hover:bg-rose-400/10 hover:text-rose-100"
                    >
                      تسجيل الخروج
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                onClick={openLoginModal}
                className="rounded-2xl border border-white/14 px-4 py-3 text-white/85 transition hover:border-white/30 hover:bg-white/8"
              >
                تسجيل الدخول
              </button>
            )}
            {!isSignedInForUi ? (
              <Link
                href="/signup"
                className="rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-4 py-3 text-slate-950 shadow-[0_0_28px_rgba(45,212,191,0.35)] transition hover:brightness-110"
              >
                إنشاء حساب جديد
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mx-auto mt-5 flex max-w-7xl flex-wrap justify-center gap-2 lg:justify-end">
          {visibleQuickLinks.map((link) => (
            link.href === '/admin/dashboard' ? (
              <button
                key={link.href}
                type="button"
                onClick={handleDashboardClick}
                disabled={protectedNavLoading}
                className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-xs font-bold text-white/70 backdrop-blur transition hover:border-cyan-200/30 hover:text-cyan-100 disabled:cursor-wait disabled:opacity-70"
              >
                {protectedNavLoading ? 'جارٍ تجهيز الجلسة...' : link.label}
              </button>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                target={link.href === '/pos' ? '_blank' : undefined}
                rel={link.href === '/pos' ? 'noopener noreferrer' : undefined}
                className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-xs font-bold text-white/70 backdrop-blur transition hover:border-cyan-200/30 hover:text-cyan-100"
              >
                {link.label}
              </Link>
            )
          ))}
        </div>
        {protectedNavMessage ? (
          <p className="mx-auto mt-2 max-w-7xl text-center text-xs font-bold text-cyan-100/80 lg:text-left">
            {protectedNavMessage}
          </p>
        ) : null}
      </header>

      <section className="relative z-10 px-4 pb-12 pt-10 sm:px-6 lg:px-8 lg:pb-14 lg:pt-16">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.86fr_1.14fr]">
          <div className="text-center lg:text-right">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/8 px-4 py-2 text-xs font-black text-cyan-100 shadow-[0_0_30px_rgba(34,211,238,0.12)]">
              <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.9)]" />
              منصة متكاملة لإدارة أعمالك
            </div>

            <Logo className="mx-auto mb-8 h-24 w-auto object-contain drop-shadow-[0_0_28px_rgba(45,212,191,0.26)] lg:mx-0 lg:h-28" />

            <h1 className="text-4xl font-black leading-tight tracking-tight md:text-6xl">
              إدارة أسهل..
              <span className="block bg-gradient-to-l from-cyan-200 via-emerald-200 to-cyan-400 bg-clip-text text-transparent">
                نمو أسرع
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-base leading-9 text-slate-300 md:text-lg lg:mx-0">
              منصة ذكية لإدارة الفروع والمبيعات والفواتير ونقاط البيع في تجربة
              واحدة متكاملة وآمنة.
            </p>

            {!isSignedInForUi ? (
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
                <Link
                  href="/signup"
                  className="inline-flex min-h-[56px] items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-8 text-sm font-black text-slate-950 shadow-[0_22px_60px_rgba(45,212,191,0.28)] transition hover:-translate-y-1 hover:shadow-[0_26px_70px_rgba(45,212,191,0.38)] active:scale-[0.98]"
                >
                  ابدأ الآن مجانًا
                </Link>
                <button
                  type="button"
                  onClick={openLoginModal}
                  className="inline-flex min-h-[56px] items-center justify-center rounded-2xl border border-white/16 bg-white/[0.035] px-8 text-sm font-black text-white backdrop-blur transition hover:-translate-y-1 hover:bg-white/[0.07] active:scale-[0.98]"
                >
                  تسجيل الدخول
                </button>
              </div>
            ) : null}

            <div className="mt-7 flex flex-wrap justify-center gap-5 text-sm font-semibold text-slate-300 lg:justify-start">
              {['بدون بطاقة ائتمان', 'إعداد سريع', 'دعم فني مباشر'].map((label) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-emerald-300/35 text-emerald-300">
                    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
                      <path d="M2.5 6.2 5 8.6l4.5-5.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-[36px] bg-cyan-400/18 blur-3xl" />
            <div className="relative overflow-hidden rounded-[30px] border border-cyan-300/40 bg-[#07111f]/90 p-3 shadow-[0_0_0_1px_rgba(34,211,238,0.14),0_0_70px_rgba(34,211,238,0.22)] backdrop-blur-xl">
              <div className="absolute inset-y-0 right-0 w-16 border-l border-white/8 bg-white/[0.035]">
                <div className="flex h-full flex-col items-center gap-5 py-7 text-cyan-200/80">
                  {['grid', 'cart', 'file', 'user', 'chart', 'gear'].map((item) => (
                    <span
                      key={item}
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.04]"
                    >
                      <span className="h-3 w-3 rounded-[5px] border border-current" />
                    </span>
                  ))}
                </div>
              </div>

              <div className="mr-16 rounded-[24px] border border-white/10 bg-[#0a1324] p-4 md:p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-cyan-200/70">AFEX</p>
                    <h2 className="mt-1 text-lg font-black">مرحبًا بك في لوحة التحكم</h2>
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-white/80">أحمد محمد</p>
                    <p className="text-[11px] text-white/35">مدير النظام</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {metrics.map((metric) => (
                    <div
                      key={metric.label}
                      className="rounded-2xl border border-white/8 bg-white/[0.045] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    >
                      <p className="text-[11px] font-bold text-white/45">{metric.label}</p>
                      <p className={`mt-2 text-2xl font-black ${metric.accent}`}>
                        {metric.value}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-emerald-300">
                        {metric.hint} عن أمس
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1.22fr_0.78fr]">
                  <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <p className="text-sm font-black">المبيعات خلال آخر 7 أيام</p>
                      <span className="rounded-full bg-cyan-300/10 px-3 py-1 text-[11px] font-black text-cyan-200">
                        مباشر
                      </span>
                    </div>
                    <div className="relative h-52 overflow-hidden rounded-2xl bg-[#07101f] p-4">
                      <div className="absolute inset-x-4 top-6 h-px bg-white/8" />
                      <div className="absolute inset-x-4 top-20 h-px bg-white/8" />
                      <div className="absolute inset-x-4 bottom-12 h-px bg-white/8" />
                      <svg viewBox="0 0 396 116" className="absolute inset-x-4 top-12 h-32 w-[calc(100%-2rem)]" preserveAspectRatio="none" aria-hidden="true">
                        <polyline points={linePoints} fill="none" stroke="rgba(45,212,191,0.95)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                        <polyline points={`${linePoints} 396,116 0,116`} fill="rgba(45,212,191,0.12)" stroke="none" />
                      </svg>
                      <div className="absolute inset-x-5 bottom-4 flex justify-between text-[10px] font-semibold text-white/35">
                        {['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'].map((day) => (
                          <span key={day}>{day}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                    <p className="mb-4 text-sm font-black">آخر الطلبات</p>
                    <div className="space-y-3">
                      {orders.map((order) => (
                        <div key={order.id} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${order.color}`} />
                            <span className="font-bold text-white/85">{order.status}</span>
                          </div>
                          <span className="text-white/55">{order.amount}</span>
                          <span className="font-black text-white/80">{order.id}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 grid h-28 grid-cols-7 items-end gap-2 rounded-2xl bg-[#07101f] p-3">
                      {bars.map((height, index) => (
                        <div
                          key={`${height}-${index}`}
                          className="rounded-full bg-gradient-to-t from-cyan-400 to-emerald-300 shadow-[0_0_18px_rgba(45,212,191,0.25)]"
                          style={{ height: `${height}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="relative z-10 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 text-center">
            <p className="text-sm font-black text-cyan-300/80">لماذا AFEX؟</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">
              كل ما تحتاجه لإدارة عملك في مكان واحد
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="group rounded-3xl border border-white/12 bg-white/[0.045] p-5 text-center shadow-[0_24px_90px_rgba(0,0,0,0.18)] backdrop-blur transition hover:-translate-y-1 hover:border-cyan-300/35 hover:bg-white/[0.065]"
              >
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-200 shadow-[0_0_34px_rgba(34,211,238,0.14)]">
                  <FeatureIcon type={feature.icon} />
                </div>
                <h3 className="text-base font-black">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[32px] border border-white/12 bg-[#07111f]/86 p-7 shadow-[0_28px_110px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-10">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_36%,rgba(45,212,191,0.22),transparent_34%),radial-gradient(circle_at_82%_74%,rgba(59,130,246,0.22),transparent_32%)]" />
          <div className="grid items-center gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="hidden min-h-44 rounded-3xl border border-cyan-300/12 bg-cyan-300/8 p-6 md:block">
              <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-[2rem] border border-cyan-200/20 bg-cyan-300/10 text-cyan-200 shadow-[0_0_45px_rgba(34,211,238,0.18)]">
                <svg viewBox="0 0 24 24" className="h-16 w-16" fill="none" aria-hidden="true">
                  <path d="M12 3 20 6.5v5.2c0 4.7-3.3 7.7-8 9.3-4.7-1.6-8-4.6-8-9.3V6.5L12 3Z" stroke="currentColor" strokeWidth="1.6" />
                  <path d="m8.5 12.2 2.4 2.4 4.8-5.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            <div>
              <h2 className="text-3xl font-black tracking-tight md:text-5xl">
                ابدأ تشغيل منشأتك مع AFEX الآن
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
                انضم إلى منصة مصممة لمساعدة فرق البيع والإدارة على تشغيل الفروع
                والفواتير ونقاط البيع بثقة وكفاءة.
              </p>

              {!isSignedInForUi ? (
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/signup"
                    className="inline-flex min-h-[54px] items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-8 text-sm font-black text-slate-950 shadow-[0_18px_60px_rgba(45,212,191,0.25)] transition hover:-translate-y-1 active:scale-[0.98]"
                  >
                    إنشاء حساب جديد
                  </Link>
                  <button
                    type="button"
                    onClick={openLoginModal}
                    className="inline-flex min-h-[54px] items-center justify-center rounded-2xl border border-white/15 bg-white/[0.035] px-8 text-sm font-black text-white transition hover:-translate-y-1 hover:bg-white/[0.07] active:scale-[0.98]"
                  >
                    تسجيل الدخول
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {loginModalOpen && !isSignedInForUi ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="landing-login-title"
            className="w-full max-w-md rounded-[28px] border border-cyan-300/15 bg-[#07111f] p-6 text-right shadow-[0_30px_110px_rgba(0,0,0,0.55)]"
          >
            <div className="mb-5">
              <h3 id="landing-login-title" className="text-2xl font-black text-white">
                تسجيل الدخول
              </h3>
              <p className="mt-1 text-sm leading-7 text-slate-400">
                أدخل بياناتك للمتابعة داخل AFEX.
              </p>
            </div>

            {loginError ? (
              <div className="mb-4 rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-100">
                {loginError}
              </div>
            ) : null}

            <form onSubmit={handleLandingLogin} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-200">
                  اسم المستخدم
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="يرجى كتابة اسم المستخدم"
                  className="h-14 w-full rounded-2xl border border-white/12 bg-white/[0.07] px-4 text-right text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/55 focus:bg-white/[0.09] focus:ring-4 focus:ring-cyan-300/10"
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-200">
                  كلمة المرور
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="يرجى كتابة كلمة المرور"
                  className="h-14 w-full rounded-2xl border border-white/12 bg-white/[0.07] px-4 text-right text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/55 focus:bg-white/[0.09] focus:ring-4 focus:ring-cyan-300/10"
                  autoComplete="current-password"
                />
              </div>

              <div className="text-center">
                <Link
                  href="/login?forgot=password"
                  className="text-sm font-black text-cyan-200/85 underline decoration-cyan-300/30 underline-offset-4 transition hover:text-cyan-100 hover:decoration-cyan-200/60"
                >
                  نسيت كلمة المرور؟
                </Link>
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeLoginModal}
                  className="h-12 rounded-2xl border border-white/10 bg-white/[0.045] px-5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.075]"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={loginLoading}
                  className="h-12 rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-6 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_0_34px_rgba(34,211,238,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loginLoading ? 'جارٍ تسجيل الدخول...' : 'دخول'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  )
}

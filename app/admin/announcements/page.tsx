'use client'

import {
  useCallback,
  type ChangeEvent,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { AdminDarkSelect } from '@/components/admin-dark-select'
import { AdminInput, AdminTextarea } from '@/components/admin-input'
import { usePageAccess } from '@/hooks/use-page-access'
import { getClientErrorMessage } from '@/lib/api/client-error'

type AnnouncementType =
  | 'discount'
  | 'seasonal_offer'
  | 'discount_code'
  | 'general_alert'
  | 'marketing_campaign'

type AudienceType = 'all_customers' | 'branch_customers' | 'manual_customers'

type AnnouncementRecord = {
  id: string
  branch_id: string | null
  title: string
  message: string
  announcement_type: AnnouncementType
  discount_code: string | null
  cta_label: string | null
  cta_url: string | null
  image_url: string | null
  audience_type: AudienceType
  status: 'draft' | 'ready' | 'sent' | 'archived'
  created_at: string
  updated_at: string
}

type BranchRecord = {
  id: string
  name: string
  is_active?: boolean
}

type CustomerRecord = {
  id: string
  name: string | null
  phone: string | null
}

type SendSummary = {
  sent_count: number
  failed_count: number
  skipped_count: number
}

type AnnouncementRecipientDetail = {
  id: string
  customer_id: string
  customer_name: string | null
  phone: string | null
  send_status: 'pending' | 'link_generated' | 'sent' | 'failed' | 'skipped'
  sent_at: string | null
  error_message: string | null
}

type AnnouncementDetail = {
  announcement: AnnouncementRecord
  recipients: AnnouncementRecipientDetail[]
  summary: SendSummary
}

const announcementTypeOptions = [
  { value: 'discount', label: 'إعلان خصم' },
  { value: 'seasonal_offer', label: 'عرض موسمي' },
  { value: 'discount_code', label: 'كود خصم' },
  { value: 'general_alert', label: 'تنبيه عام' },
  { value: 'marketing_campaign', label: 'حملة تسويقية' },
]

const audienceOptions = [
  { value: 'all_customers', label: 'كل العملاء' },
  { value: 'branch_customers', label: 'عملاء فرع معين' },
  { value: 'manual_customers', label: 'اختيار من قائمة العملاء' },
]

const DEFAULT_CTA_LABEL = 'اضغط هنا للوصول للموقع'
const MAX_ANNOUNCEMENT_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_ANNOUNCEMENT_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
]

function AnnouncementIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 13.5V9.8c0-.9.6-1.7 1.5-1.9L19 4v15L5.5 15.1A2 2 0 0 1 4 13.5Z" />
      <path d="M8 15.5 9.5 21h3L11 16.3" />
      <path d="M19 8.5a3.5 3.5 0 0 1 0 6.5" />
    </svg>
  )
}

function LinkIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
      <path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" />
    </svg>
  )
}

function CloseIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

function getAnnouncementTypeLabel(type: AnnouncementType) {
  return (
    announcementTypeOptions.find((option) => option.value === type)?.label ||
    'إعلان'
  )
}

function getAudienceLabel(
  announcement: AnnouncementRecord,
  branches: BranchRecord[]
) {
  if (announcement.audience_type === 'all_customers') {
    return 'كل العملاء'
  }

  if (announcement.audience_type === 'manual_customers') {
    return 'اختيار يدوي'
  }

  return (
    branches.find((branch) => branch.id === announcement.branch_id)?.name ||
    'عملاء فرع محدد'
  )
}

function getStatusLabel(status: AnnouncementRecord['status']) {
  if (status === 'ready') return 'جاهز للإرسال'
  if (status === 'sent') return 'مرسل'
  if (status === 'archived') return 'مؤرشف'
  return 'مسودة'
}

function getRecipientStatusLabel(
  status: AnnouncementRecipientDetail['send_status']
) {
  if (status === 'sent') return 'تم الإرسال'
  if (status === 'failed') return 'فشل'
  if (status === 'skipped') return 'تم تخطيه'
  if (status === 'link_generated') return 'رابط جاهز'
  return 'قيد الانتظار'
}

function getRecipientStatusClass(
  status: AnnouncementRecipientDetail['send_status']
) {
  if (status === 'sent') {
    return 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
  }

  if (status === 'failed') {
    return 'border-red-300/20 bg-red-400/10 text-red-100'
  }

  if (status === 'skipped') {
    return 'border-amber-300/20 bg-amber-300/10 text-amber-100'
  }

  return 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100'
}

function getAnnouncementMessage(announcement: AnnouncementRecord) {
  return typeof announcement.message === 'string'
    ? announcement.message.trim()
    : ''
}

function isValidOptionalCtaUrl(value: string) {
  const normalizedUrl = value.trim()
  return (
    !normalizedUrl ||
    normalizedUrl.startsWith('http://') ||
    normalizedUrl.startsWith('https://')
  )
}

function buildAnnouncementPreviewMessage(
  messageText: string,
  code: string,
  ctaLabel: string,
  ctaUrl: string
) {
  const normalizedMessage = messageText.trim()
  const normalizedCode = code.trim()
  const normalizedCtaUrl = ctaUrl.trim()
  const normalizedCtaLabel = ctaLabel.trim() || DEFAULT_CTA_LABEL

  if (!normalizedMessage && !normalizedCode && !normalizedCtaUrl) {
    return 'ستظهر رسالتك هنا كما يراها العميل'
  }

  return [
    normalizedMessage || 'ستظهر رسالتك هنا كما يراها العميل',
    ...(normalizedCode ? ['', `كود الخصم: ${normalizedCode}`] : []),
    ...(normalizedCtaUrl
      ? ['', `${normalizedCtaLabel}:`, normalizedCtaUrl]
      : []),
  ].join('\n')
}

function formatDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('ar-SA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default function AdminAnnouncementsPage() {
  const access = usePageAccess(['admin'])
  const { loading: accessLoading, allowed } = access

  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([])
  const [branches, setBranches] = useState<BranchRecord[]>([])
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [announcementType, setAnnouncementType] =
    useState<AnnouncementType>('discount')
  const [message, setMessage] = useState('')
  const [discountCode, setDiscountCode] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [audienceType, setAudienceType] = useState<AudienceType>('all_customers')
  const [branchId, setBranchId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([])
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true)
  const [loadingBranches, setLoadingBranches] = useState(true)
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [creating, setCreating] = useState(false)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [announcementsCollapsed, setAnnouncementsCollapsed] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [sendSummary, setSendSummary] = useState<SendSummary | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [loadingDetailsId, setLoadingDetailsId] = useState<string | null>(null)
  const [announcementDetail, setAnnouncementDetail] =
    useState<AnnouncementDetail | null>(null)

  const branchOptions = useMemo(
    () => branches.map((branch) => ({ value: branch.id, label: branch.name })),
    [branches]
  )

  const selectedCustomerCount = selectedCustomerIds.length
  const canSave = useMemo(() => {
    return (
      title.trim().length > 0 &&
      message.trim().length > 0 &&
      isValidOptionalCtaUrl(ctaUrl) &&
      (audienceType === 'all_customers' ||
        (audienceType === 'branch_customers' && branchId.trim().length > 0) ||
        (audienceType === 'manual_customers' && selectedCustomerCount > 0))
    )
  }, [audienceType, branchId, ctaUrl, message, selectedCustomerCount, title])
  const previewMessage = useMemo(
    () => buildAnnouncementPreviewMessage(message, discountCode, ctaLabel, ctaUrl),
    [ctaLabel, ctaUrl, discountCode, message]
  )
  const imagePreviewUrl = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : ''),
    [imageFile]
  )

  function resetForm() {
    setTitle('')
    setAnnouncementType('discount')
    setMessage('')
    setDiscountCode('')
    setCtaLabel('')
    setCtaUrl('')
    setImageFile(null)
    setAudienceType('all_customers')
    setBranchId('')
    setCustomerSearch('')
    setSelectedCustomerIds([])
  }

  function handleImageFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null

    if (!file) {
      setImageFile(null)
      return
    }

    if (!ALLOWED_ANNOUNCEMENT_IMAGE_TYPES.includes(file.type)) {
      setErrorMessage('يجب رفع صورة بصيغة png أو jpg أو jpeg أو webp')
      event.target.value = ''
      return
    }

    if (file.size > MAX_ANNOUNCEMENT_IMAGE_SIZE_BYTES) {
      setErrorMessage('حجم صورة الإعلان يجب ألا يتجاوز 5 ميجابايت')
      event.target.value = ''
      return
    }

    setErrorMessage('')
    setImageFile(file)
  }

  function toggleSelectedCustomer(customerId: string) {
    setSelectedCustomerIds((current) =>
      current.includes(customerId)
        ? current.filter((id) => id !== customerId)
        : [...current, customerId]
    )
  }

  async function loadAnnouncements() {
    try {
      setLoadingAnnouncements(true)
      setErrorMessage('')

      const response = await fetch('/api/admin/announcements', {
        method: 'GET',
        cache: 'no-store',
      })
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        throw new Error(getClientErrorMessage(result, 'تعذر تحميل الإعلانات حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
      }

      setAnnouncements(
        Array.isArray(result.announcements) ? result.announcements : []
      )
    } catch (error) {
      console.error('Load announcements error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر تحميل الإعلانات'
      )
    } finally {
      setLoadingAnnouncements(false)
    }
  }

  async function loadBranches() {
    try {
      setLoadingBranches(true)

      const response = await fetch('/api/admin/branches', {
        method: 'GET',
        cache: 'no-store',
      })
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        throw new Error(getClientErrorMessage(result, 'تعذر تحميل الفروع حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
      }

      setBranches(Array.isArray(result.branches) ? result.branches : [])
    } catch (error) {
      console.error('Load branches error:', error)
    } finally {
      setLoadingBranches(false)
    }
  }

  const loadCustomers = useCallback(async (searchValue = '') => {
    try {
      setLoadingCustomers(true)

      const params = new URLSearchParams()
      const normalizedSearch = searchValue.trim()

      if (normalizedSearch) {
        params.set('q', normalizedSearch)
      }

      const response = await fetch(`/api/customers?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      })
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        throw new Error(getClientErrorMessage(result, 'تعذر تحميل العملاء حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
      }

      setCustomers(Array.isArray(result.customers) ? result.customers : [])
    } catch (error) {
      console.error('Load customers error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر تحميل العملاء'
      )
    } finally {
      setLoadingCustomers(false)
    }
  }, [])

  useEffect(() => {
    if (!accessLoading && allowed) {
      void Promise.resolve().then(() => {
        void loadAnnouncements()
        void loadBranches()
      })
    }
  }, [accessLoading, allowed])

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl)
      }
    }
  }, [imagePreviewUrl])

  useEffect(() => {
    if (drawerOpen && audienceType === 'manual_customers') {
      void Promise.resolve().then(() => {
        void loadCustomers(customerSearch)
      })
    }
  }, [audienceType, customerSearch, drawerOpen, loadCustomers])

  async function handleCreateAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (audienceType === 'manual_customers' && selectedCustomerCount === 0) {
      setErrorMessage('اختر عميلًا واحدًا على الأقل قبل حفظ الإعلان')
      return
    }

    if (!isValidOptionalCtaUrl(ctaUrl)) {
      setErrorMessage('رابط الزر يجب أن يبدأ بـ http:// أو https://')
      return
    }

    try {
      setCreating(true)
      setSuccessMessage('')
      setErrorMessage('')

      const formData = new FormData()
      formData.append('title', title)
      formData.append('announcement_type', announcementType)
      formData.append('message', message)
      formData.append('discount_code', discountCode)
      formData.append('cta_label', ctaLabel)
      formData.append('cta_url', ctaUrl)
      formData.append('audience_type', audienceType)
      formData.append(
        'branch_id',
        audienceType === 'branch_customers' ? branchId : ''
      )
      formData.append(
        'selected_customer_ids',
        JSON.stringify(
          audienceType === 'manual_customers' ? selectedCustomerIds : []
        )
      )

      if (imageFile) {
        formData.append('image', imageFile)
      }

      const response = await fetch('/api/admin/announcements', {
        method: 'POST',
        body: formData,
      })
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        throw new Error(getClientErrorMessage(result, 'تعذر إنشاء الإعلان. لم يتم حفظ التغييرات.'))
      }

      setSuccessMessage('تم إنشاء الإعلان بنجاح')
      setDrawerOpen(false)
      resetForm()
      await loadAnnouncements()
    } catch (error) {
      console.error('Create announcement error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر إنشاء الإعلان'
      )
    } finally {
      setCreating(false)
    }
  }

  async function handleSendAnnouncement(announcementId: string) {
    try {
      setGeneratingId(announcementId)
      setSuccessMessage('')
      setErrorMessage('')
      setSendSummary(null)

      const response = await fetch(
        `/api/admin/announcements/${announcementId}/send`,
        {
          method: 'POST',
          cache: 'no-store',
        }
      )
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        throw new Error(getClientErrorMessage(result, 'تعذر إرسال رسالة واتساب حاليًا. لم يتم تأكيد الإرسال.'))
      }

      const summary = {
        sent_count: Number(result.sent_count) || 0,
        failed_count: Number(result.failed_count) || 0,
        skipped_count: Number(result.skipped_count) || 0,
      }
      setSendSummary(summary)
      setSuccessMessage(
        `تم الإرسال: ${summary.sent_count} | فشل: ${summary.failed_count} | تم تخطيه: ${summary.skipped_count}`
      )
      setAnnouncements((current) =>
        current.map((announcement) =>
          announcement.id === announcementId
            ? { ...announcement, status: 'sent' }
            : announcement
        )
      )
    } catch (error) {
      console.error('Send announcement WhatsApp error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر إرسال واتساب'
      )
    } finally {
      setGeneratingId(null)
    }
  }

  async function handleOpenDetails(announcementId: string) {
    try {
      setLoadingDetailsId(announcementId)
      setErrorMessage('')

      const response = await fetch(`/api/admin/announcements/${announcementId}`, {
        method: 'GET',
        cache: 'no-store',
      })
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        throw new Error(
          getClientErrorMessage(result, 'تعذر تحميل تفاصيل الإعلان حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.')
        )
      }

      setAnnouncementDetail({
        announcement: result.announcement as AnnouncementRecord,
        recipients: Array.isArray(result.recipients) ? result.recipients : [],
        summary: {
          sent_count: Number(result.summary?.sent_count) || 0,
          failed_count: Number(result.summary?.failed_count) || 0,
          skipped_count: Number(result.summary?.skipped_count) || 0,
        },
      })
      setDetailsOpen(true)
    } catch (error) {
      console.error('Load announcement details error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر تحميل تفاصيل الإعلان'
      )
    } finally {
      setLoadingDetailsId(null)
    }
  }

  async function handleCopyAnnouncementMessage() {
    const messageText = announcementDetail
      ? getAnnouncementMessage(announcementDetail.announcement)
      : ''

    if (!messageText) {
      setErrorMessage('لا يوجد محتوى للرسالة')
      return
    }

    try {
      await navigator.clipboard.writeText(messageText)
      setSuccessMessage('تم نسخ الرسالة')
      setErrorMessage('')
    } catch (error) {
      console.error('Copy announcement message error:', error)
      setErrorMessage('تعذر نسخ الرسالة')
    }
  }

  if (accessLoading) {
    return (
      <div className="min-h-screen bg-[#030714] p-4 text-white md:p-6">
        <div className="mx-auto h-32 max-w-7xl animate-pulse rounded-[28px] border border-cyan-300/10 bg-white/[0.055] shadow-[0_24px_80px_rgba(0,0,0,0.28)]" />
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-[#030714] p-4 text-white md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-[28px] border border-red-300/15 bg-red-500/10 p-6 text-right shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <h1 className="text-2xl font-black text-white">غير مصرح لك</h1>
            <p className="mt-2 text-slate-400">
              صفحة الإعلانات متاحة للمدير فقط.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-[#030714] text-white"
      dir="rtl"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-24 top-10 h-72 w-72 rounded-full bg-cyan-400/15 blur-[110px]" />
        <div className="absolute -left-20 top-1/3 h-80 w-80 rounded-full bg-emerald-400/10 blur-[130px]" />
        <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-blue-500/10 blur-[130px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_32%),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:auto,48px_48px,48px_48px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl space-y-5 px-3 py-4 sm:px-4 lg:px-6">
        <header className="overflow-hidden rounded-[28px] border border-cyan-300/15 bg-white/[0.055] p-5 text-right shadow-[0_24px_90px_rgba(0,0,0,0.32)] backdrop-blur-xl md:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200 shadow-[0_0_35px_rgba(34,211,238,0.18)]">
                <AnnouncementIcon className="h-7 w-7" />
              </div>
              <div>
                <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black tracking-[0.2em] text-cyan-200">
                  AFEX MARKETING
                </span>
                <h1 className="mt-3 text-3xl font-black text-white md:text-4xl">
                  الإعلانات
                </h1>
                <p className="mt-2 text-sm font-medium text-slate-400">
                  جهز رسائل واتساب للعملاء للعروض والتنبيهات والحملات التسويقية.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                resetForm()
                setDrawerOpen(true)
              }}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 text-sm font-black text-slate-950 shadow-[0_0_35px_rgba(34,211,238,0.22)] transition hover:scale-[1.01] active:scale-[0.98]"
            >
              إنشاء إعلان
            </button>
          </div>
        </header>

        {successMessage ? (
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-200 shadow-[0_12px_40px_rgba(16,185,129,0.12)]">
            {successMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="whitespace-pre-wrap rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200 shadow-[0_12px_40px_rgba(239,68,68,0.12)]">
            {errorMessage}
          </div>
        ) : null}

        {sendSummary ? (
          <section className="rounded-[28px] border border-emerald-300/15 bg-emerald-400/[0.07] p-5 text-right shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-6">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <span className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200/80">
                  WhatsApp Summary
                </span>
                <h2 className="mt-2 text-xl font-black text-white">
                  ملخص إرسال واتساب
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSendSummary(null)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] px-4 text-xs font-black text-slate-200 transition hover:bg-white/[0.08]"
              >
                إخفاء الملخص
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-emerald-300/15 bg-black/20 px-4 py-4">
                <p className="text-xs font-black text-emerald-200">تم الإرسال</p>
                <p className="mt-2 text-2xl font-black text-white">
                  {sendSummary.sent_count}
                </p>
              </div>
              <div className="rounded-2xl border border-red-300/15 bg-black/20 px-4 py-4">
                <p className="text-xs font-black text-red-200">فشل</p>
                <p className="mt-2 text-2xl font-black text-white">
                  {sendSummary.failed_count}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-300/15 bg-black/20 px-4 py-4">
                <p className="text-xs font-black text-amber-200">تم تخطيه</p>
                <p className="mt-2 text-2xl font-black text-white">
                  {sendSummary.skipped_count}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-[28px] border border-cyan-300/15 bg-white/[0.055] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-6">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="text-right">
              <span className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200/80">
                Announcements
              </span>
              <h2 className="mt-2 text-2xl font-black text-white">
                قائمة الإعلانات
              </h2>
              {!announcementsCollapsed ? (
                <p className="mt-1 text-sm text-slate-400">
                  راقب الإعلانات السابقة وأرسل رسائل واتساب للمستلمين.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setAnnouncementsCollapsed((isCollapsed) => !isCollapsed)
                }
                className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] px-4 text-xs font-black text-slate-200 transition hover:bg-white/[0.08]"
              >
                {announcementsCollapsed
                  ? 'إظهار الإعلانات القديمة'
                  : 'إخفاء الإعلانات القديمة'}
              </button>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-sm font-bold text-cyan-100">
                {announcements.length} إعلان
              </span>
            </div>
          </div>

          {announcementsCollapsed ? null : loadingAnnouncements ? (
            <div className="rounded-2xl border border-dashed border-cyan-300/15 bg-black/20 px-4 py-10 text-center text-sm font-bold text-slate-400">
              جارٍ تحميل الإعلانات...
            </div>
          ) : announcements.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-cyan-300/20 bg-black/20 px-4 py-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                <AnnouncementIcon className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-lg font-black text-white">
                لا توجد إعلانات حتى الآن.
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                أنشئ إعلانك الأول ثم أرسل رسالة واتساب للعملاء.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#06111f]/65">
              <table className="w-full min-w-[920px] text-right">
                <thead className="bg-white/[0.035]">
                  <tr className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    <th className="px-5 py-4">الإعلان</th>
                    <th className="px-5 py-4 text-center">النوع</th>
                    <th className="px-5 py-4 text-center">الجمهور</th>
                    <th className="px-5 py-4 text-center">الحالة</th>
                    <th className="px-5 py-4 text-center">تاريخ الإنشاء</th>
                    <th className="px-5 py-4 text-center">الإجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {announcements.map((announcement) => (
                    <tr
                      key={announcement.id}
                      className="border-b border-white/[0.08] transition hover:bg-cyan-300/[0.035] last:border-b-0"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
                            <AnnouncementIcon className="h-5 w-5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-black text-white">
                              {announcement.title}
                            </span>
                            <span className="mt-1 block max-w-[360px] truncate text-xs font-bold text-slate-400">
                              {announcement.message}
                            </span>
                            {announcement.image_url ? (
                              <span className="mt-2 inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[11px] font-black text-emerald-100">
                                صورة
                              </span>
                            ) : null}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex rounded-full border border-white/10 bg-white/[0.055] px-3 py-1 text-xs font-black text-slate-200">
                          {getAnnouncementTypeLabel(announcement.announcement_type)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center text-sm font-bold text-slate-300">
                        {getAudienceLabel(announcement, branches)}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">
                          {getStatusLabel(announcement.status)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center text-xs font-bold text-slate-400">
                        {formatDate(announcement.created_at)}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            disabled={loadingDetailsId === announcement.id}
                            onClick={() => void handleOpenDetails(announcement.id)}
                            className="inline-flex h-10 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {loadingDetailsId === announcement.id
                              ? 'جارٍ تحميل البيانات...'
                              : 'تفاصيل الرسالة'}
                          </button>
                          <button
                            type="button"
                            disabled={generatingId === announcement.id}
                            onClick={() => void handleSendAnnouncement(announcement.id)}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-4 text-xs font-black text-emerald-100 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <LinkIcon className="h-4 w-4" />
                            {generatingId === announcement.id
                              ? 'جارٍ الإرسال...'
                              : 'إرسال واتساب'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {detailsOpen && announcementDetail ? (
        <div className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[2px]">
          <div className="flex min-h-full justify-end">
            <aside className="animate-[announcement-drawer-in_420ms_cubic-bezier(0.16,1,0.3,1)] h-screen w-full max-w-2xl overflow-y-auto border-l border-cyan-300/15 bg-[radial-gradient(circle_at_50%_8%,rgba(34,211,238,0.12),transparent_34%),linear-gradient(180deg,#07111d_0%,#050b16_100%)] p-7 text-right shadow-[0_24px_90px_rgba(0,0,0,0.45)] sm:p-8">
              <div className="mb-6 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setDetailsOpen(false)
                    setAnnouncementDetail(null)
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] text-slate-300 transition hover:bg-white/[0.09] hover:text-white"
                  aria-label="إغلاق"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
                <div>
                  <span className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200/80">
                    Message Details
                  </span>
                  <h2 className="mt-2 text-2xl font-black text-white">
                    تفاصيل الرسالة
                  </h2>
                </div>
              </div>

              <div className="space-y-4">
                <section className="rounded-[24px] border border-cyan-300/15 bg-black/20 p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="text-right">
                      <h3 className="text-2xl font-black text-white">
                        {announcementDetail.announcement.title}
                      </h3>
                    </div>
                    <span className="inline-flex w-fit shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">
                      {getStatusLabel(announcementDetail.announcement.status)}
                    </span>
                  </div>
                </section>

                <section className="rounded-[24px] border border-cyan-300/15 bg-white/[0.045] p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() => void handleCopyAnnouncementMessage()}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/15"
                    >
                      نسخ الرسالة
                    </button>
                    <h3 className="text-lg font-black text-white">
                      محتوى الرسالة
                    </h3>
                  </div>
                  <div className="mt-4 rounded-[22px] border border-cyan-300/15 bg-[#081522] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <p className="whitespace-pre-wrap text-[15px] font-bold leading-8 text-slate-50">
                      {getAnnouncementMessage(announcementDetail.announcement) ||
                        'لا يوجد محتوى للرسالة'}
                    </p>
                  </div>
                </section>

                {announcementDetail.announcement.image_url ? (
                  <section className="rounded-[24px] border border-cyan-300/15 bg-white/[0.045] p-5">
                    <h3 className="text-lg font-black text-white">
                      صورة الإعلان
                    </h3>
                    <div className="mt-4 overflow-hidden rounded-[22px] border border-cyan-300/15 bg-black/20">
                      <img
                        src={announcementDetail.announcement.image_url}
                        alt="صورة الإعلان"
                        className="max-h-[420px] w-full object-contain"
                      />
                    </div>
                  </section>
                ) : null}

                <section className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                    <p className="text-xs font-black text-slate-500">نوع الإعلان</p>
                    <p className="mt-2 text-sm font-black text-white">
                      {getAnnouncementTypeLabel(
                        announcementDetail.announcement.announcement_type
                      )}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                    <p className="text-xs font-black text-slate-500">الجمهور</p>
                    <p className="mt-2 text-sm font-black text-white">
                      {getAudienceLabel(announcementDetail.announcement, branches)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                    <p className="text-xs font-black text-slate-500">كود الخصم</p>
                    <p className="mt-2 text-sm font-black text-white">
                      {announcementDetail.announcement.discount_code || 'غير محدد'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                    <p className="text-xs font-black text-slate-500">نص الرابط</p>
                    <p className="mt-2 text-sm font-black text-white">
                      {announcementDetail.announcement.cta_url
                        ? announcementDetail.announcement.cta_label ||
                          DEFAULT_CTA_LABEL
                        : 'غير محدد'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                    <p className="text-xs font-black text-slate-500">رابط CTA</p>
                    {announcementDetail.announcement.cta_url ? (
                      <a
                        href={announcementDetail.announcement.cta_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block break-all text-sm font-black text-cyan-100 transition hover:text-cyan-50"
                      >
                        {announcementDetail.announcement.cta_url}
                      </a>
                    ) : (
                      <p className="mt-2 text-sm font-black text-white">
                        غير محدد
                      </p>
                    )}
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                    <p className="text-xs font-black text-slate-500">تاريخ الإنشاء</p>
                    <p className="mt-2 text-sm font-black text-white">
                      {formatDate(announcementDetail.announcement.created_at)}
                    </p>
                  </div>
                </section>

                <section className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/10 p-4">
                    <p className="text-xs font-black text-emerald-200">تم الإرسال</p>
                    <p className="mt-2 text-2xl font-black text-white">
                      {announcementDetail.summary.sent_count}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-red-300/15 bg-red-300/10 p-4">
                    <p className="text-xs font-black text-red-200">فشل</p>
                    <p className="mt-2 text-2xl font-black text-white">
                      {announcementDetail.summary.failed_count}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-amber-300/15 bg-amber-300/10 p-4">
                    <p className="text-xs font-black text-amber-200">تم تخطيه</p>
                    <p className="mt-2 text-2xl font-black text-white">
                      {announcementDetail.summary.skipped_count}
                    </p>
                  </div>
                </section>

                <section className="rounded-[24px] border border-cyan-300/15 bg-black/20 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">
                      {announcementDetail.recipients.length} مستلم
                    </span>
                    <h3 className="text-lg font-black text-white">المستلمون</h3>
                  </div>

                  {announcementDetail.recipients.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-cyan-300/20 bg-white/[0.035] px-4 py-8 text-center text-sm font-bold text-slate-400">
                      لا توجد نتائج إرسال محفوظة حتى الآن
                    </div>
                  ) : (
                    <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-[#06111f]/70 p-2">
                      {announcementDetail.recipients.map((recipient) => (
                        <div
                          key={recipient.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2"
                        >
                          <span
                            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-black ${getRecipientStatusClass(
                              recipient.send_status
                            )}`}
                          >
                            {getRecipientStatusLabel(recipient.send_status)}
                          </span>
                          <span className="min-w-0 flex-1 text-right">
                            <span className="block truncate text-sm font-black text-white">
                              {recipient.customer_name || 'عميل بدون اسم'}
                            </span>
                            <span className="mt-0.5 block text-xs font-bold text-slate-400">
                              {recipient.phone || 'بدون رقم جوال'}
                            </span>
                            {recipient.error_message ? (
                              <span className="mt-1 block truncate text-xs font-bold text-red-200">
                                {recipient.error_message}
                              </span>
                            ) : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </aside>
          </div>
        </div>
      ) : null}

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[2px]">
          <div className="flex min-h-full justify-end">
            <aside className="animate-[announcement-drawer-in_420ms_cubic-bezier(0.16,1,0.3,1)] h-screen w-full max-w-6xl overflow-y-auto border-l border-cyan-300/15 bg-[radial-gradient(circle_at_50%_8%,rgba(34,211,238,0.12),transparent_34%),linear-gradient(180deg,#07111d_0%,#050b16_100%)] p-7 text-right shadow-[0_24px_90px_rgba(0,0,0,0.45)] sm:p-8">
              <div className="mb-6 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] text-slate-300 transition hover:bg-white/[0.09] hover:text-white"
                  aria-label="إغلاق"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
                <div>
                  <span className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200/80">
                    New Announcement
                  </span>
                  <h2 className="mt-2 text-2xl font-black text-white">
                    إنشاء إعلان
                  </h2>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] lg:items-start">
                <form onSubmit={handleCreateAnnouncement} className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-200">
                      العنوان
                    </label>
                    <AdminInput
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="مثال: عرض نهاية الأسبوع"
                      className="h-14 rounded-2xl !border-white/10 !bg-[rgba(255,255,255,0.04)] px-5 text-right text-sm font-bold !text-white !shadow-none !outline-none !placeholder:text-slate-500 focus:!border-cyan-300/55 focus:!bg-white/[0.06] focus:!ring-2 focus:!ring-cyan-300/20"
                    />
                  </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-200">
                    نوع الإعلان
                  </label>
                  <AdminDarkSelect
                    value={announcementType}
                    onChange={(value) =>
                      setAnnouncementType(value as AnnouncementType)
                    }
                    options={announcementTypeOptions}
                    ariaLabel="نوع الإعلان"
                    triggerClassName="h-14 rounded-2xl !border-white/10 !bg-[rgba(255,255,255,0.04)] px-5"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-200">
                    نص الرسالة
                  </label>
                  <AdminTextarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="اكتب نص الرسالة التي ستظهر في واتساب"
                    rows={5}
                    className="min-h-[140px] rounded-2xl !border-white/10 !bg-[rgba(255,255,255,0.04)] px-5 py-4 text-right text-sm font-bold !text-white !shadow-none !outline-none !placeholder:text-slate-500 focus:!border-cyan-300/55 focus:!bg-white/[0.06] focus:!ring-2 focus:!ring-cyan-300/20"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-200">
                    كود الخصم
                    <span className="mr-2 text-xs font-bold text-slate-500">
                      اختياري
                    </span>
                  </label>
                  <AdminInput
                    value={discountCode}
                    onChange={(event) => setDiscountCode(event.target.value)}
                    placeholder="مثال: AFEX20"
                    className="h-14 rounded-2xl !border-white/10 !bg-[rgba(255,255,255,0.04)] px-5 text-right text-sm font-bold !text-white !shadow-none !outline-none !placeholder:text-slate-500 focus:!border-cyan-300/55 focus:!bg-white/[0.06] focus:!ring-2 focus:!ring-cyan-300/20"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-200">
                      عنوان الرابط / نص الزر
                      <span className="mr-2 text-xs font-bold text-slate-500">
                        اختياري
                      </span>
                    </label>
                    <AdminInput
                      value={ctaLabel}
                      onChange={(event) => setCtaLabel(event.target.value)}
                      placeholder="اضغط هنا للوصول للموقع"
                      className="h-14 rounded-2xl !border-white/10 !bg-[rgba(255,255,255,0.04)] px-5 text-right text-sm font-bold !text-white !shadow-none !outline-none !placeholder:text-slate-500 focus:!border-cyan-300/55 focus:!bg-white/[0.06] focus:!ring-2 focus:!ring-cyan-300/20"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-200">
                      رابط الزر
                      <span className="mr-2 text-xs font-bold text-slate-500">
                        اختياري
                      </span>
                    </label>
                    <AdminInput
                      value={ctaUrl}
                      onChange={(event) => setCtaUrl(event.target.value)}
                      placeholder="https://example.com"
                      className="h-14 rounded-2xl !border-white/10 !bg-[rgba(255,255,255,0.04)] px-5 text-right text-sm font-bold !text-white !shadow-none !outline-none !placeholder:text-slate-500 focus:!border-cyan-300/55 focus:!bg-white/[0.06] focus:!ring-2 focus:!ring-cyan-300/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-200">
                    صورة الإعلان
                    <span className="mr-2 text-xs font-bold text-slate-500">
                      اختياري
                    </span>
                  </label>
                  <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleImageFileChange}
                      className="block w-full cursor-pointer rounded-2xl border border-cyan-300/15 bg-[#071522] text-right text-xs font-bold text-slate-300 file:ml-4 file:cursor-pointer file:border-0 file:bg-cyan-300/15 file:px-4 file:py-3 file:text-xs file:font-black file:text-cyan-100 hover:bg-white/[0.055]"
                    />
                    <p className="mt-2 text-xs font-bold text-slate-500">
                      PNG أو JPG أو JPEG أو WEBP بحد أقصى 5MB.
                    </p>
                    {imagePreviewUrl ? (
                      <div className="mt-4 overflow-hidden rounded-2xl border border-cyan-300/15 bg-black/20">
                        <img
                          src={imagePreviewUrl}
                          alt="معاينة صورة الإعلان"
                          className="max-h-56 w-full object-cover"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-200">
                    الجمهور
                  </label>
                  <AdminDarkSelect
                    value={audienceType}
                    onChange={(value) => {
                      const nextAudience = value as AudienceType
                      setAudienceType(nextAudience)
                      if (nextAudience !== 'branch_customers') {
                        setBranchId('')
                      }
                      if (nextAudience !== 'manual_customers') {
                        setCustomerSearch('')
                        setSelectedCustomerIds([])
                      }
                    }}
                    options={audienceOptions}
                    ariaLabel="الجمهور"
                    triggerClassName="h-14 rounded-2xl !border-white/10 !bg-[rgba(255,255,255,0.04)] px-5"
                  />
                </div>

                {audienceType === 'branch_customers' ? (
                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-200">
                      الفرع
                    </label>
                    <AdminDarkSelect
                      value={branchId}
                      onChange={setBranchId}
                      disabled={loadingBranches}
                      options={branchOptions}
                      placeholder="اختر الفرع"
                      ariaLabel="الفرع المستهدف"
                      triggerClassName="h-14 rounded-2xl !border-white/10 !bg-[rgba(255,255,255,0.04)] px-5"
                    />
                  </div>
                ) : null}

                {audienceType === 'manual_customers' ? (
                  <div className="rounded-[22px] border border-cyan-300/15 bg-black/20 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">
                        {selectedCustomerCount} محدد
                      </span>
                      <div className="text-right">
                        <h3 className="text-sm font-black text-white">
                          اختيار العملاء
                        </h3>
                        <p className="mt-1 text-xs font-bold text-slate-400">
                          العملاء مشتركون على مستوى المنشأة.
                        </p>
                      </div>
                    </div>

                    <div className="mb-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void loadCustomers(customerSearch)}
                        disabled={loadingCustomers}
                        className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        بحث
                      </button>
                      <AdminInput
                        value={customerSearch}
                        onChange={(event) => setCustomerSearch(event.target.value)}
                        placeholder="بحث بالاسم أو رقم الجوال"
                        className="h-11 rounded-2xl !border-white/10 !bg-[rgba(255,255,255,0.04)] px-4 text-right text-xs font-bold !text-white !shadow-none !outline-none !placeholder:text-slate-500 focus:!border-cyan-300/55 focus:!bg-white/[0.06] focus:!ring-2 focus:!ring-cyan-300/20"
                      />
                    </div>

                    <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-[#06111f]/70 p-2">
                      {loadingCustomers ? (
                        <div className="px-3 py-6 text-center text-xs font-bold text-slate-400">
                          جارٍ تحميل العملاء...
                        </div>
                      ) : customers.length === 0 ? (
                        <div className="px-3 py-6 text-center text-xs font-bold text-slate-400">
                          لا يوجد عملاء مطابقون
                        </div>
                      ) : (
                        customers.map((customer) => {
                          const checked = selectedCustomerIds.includes(customer.id)

                          return (
                            <label
                              key={customer.id}
                              className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 transition ${
                                checked
                                  ? 'border-cyan-300/35 bg-cyan-300/10'
                                  : 'border-white/10 bg-white/[0.035] hover:bg-white/[0.055]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSelectedCustomer(customer.id)}
                                className="h-4 w-4 accent-cyan-300"
                              />
                              <span className="min-w-0 flex-1 text-right">
                                <span className="block truncate text-sm font-black text-white">
                                  {customer.name || 'عميل بدون اسم'}
                                </span>
                                <span className="mt-0.5 block text-xs font-bold text-slate-400">
                                  {customer.phone || 'بدون رقم جوال'}
                                </span>
                              </span>
                            </label>
                          )
                        })
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.055] px-5 text-sm font-black text-slate-200 transition hover:bg-white/[0.09]"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={!canSave || creating}
                    className="inline-flex h-12 min-w-[150px] items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-6 text-sm font-black text-slate-950 shadow-[0_0_35px_rgba(34,211,238,0.22)] transition hover:scale-[1.01] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {creating ? 'جارٍ الحفظ...' : 'حفظ'}
                  </button>
                </div>
                </form>

                <section className="rounded-[28px] border border-cyan-300/15 bg-white/[0.035] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.26)]">
                  <div className="mb-5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <h3 className="text-xl font-black text-white">
                        معاينة رسالة واتساب
                      </h3>
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                          className="h-5 w-5"
                        >
                          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-400">
                      هذا شكل تقريبي لما سيظهر للعميل
                    </p>
                  </div>

                  <div className="mx-auto max-w-[360px] rounded-[36px] border border-white/15 bg-[#06111f] p-3 shadow-[0_28px_90px_rgba(0,0,0,0.42)]">
                    <div className="overflow-hidden rounded-[30px] border border-slate-600/25 bg-[#08131d]">
                      <div className="flex items-center justify-between bg-[#122236] px-4 py-3 text-white" dir="ltr">
                        <div className="text-sm font-black">9:41</div>
                        <div className="flex items-center gap-1 text-xs font-black">
                          <span>▮▮▮</span>
                          <span>⌁</span>
                          <span className="rounded-sm border border-white/70 px-1">▰</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-b border-white/10 bg-[#132539] px-4 py-3">
                        <span className="text-slate-300">⋮</span>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-black text-white">
                              AFEX Marketing
                            </p>
                            <p className="text-xs font-bold text-slate-400">
                              حساب أعمال
                            </p>
                          </div>
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#050b16] text-xs font-black text-white">
                            AFEX
                          </div>
                        </div>
                      </div>

                      <div className="min-h-[430px] bg-[radial-gradient(circle_at_20%_10%,rgba(20,184,166,0.08),transparent_24%),linear-gradient(135deg,#06111a,#071520)] p-4">
                        <div className="ml-auto mt-6 max-w-[82%] rounded-bl-[24px] rounded-br-md rounded-tl-[24px] rounded-tr-[24px] bg-[linear-gradient(135deg,#14634e,#0e473b)] px-5 py-4 shadow-[0_18px_45px_rgba(0,0,0,0.26)]">
                          {imagePreviewUrl ? (
                            <img
                              src={imagePreviewUrl}
                              alt="معاينة صورة الإعلان"
                              className="mb-4 max-h-52 w-full rounded-2xl object-cover"
                            />
                          ) : null}
                          <p className="whitespace-pre-wrap text-right text-[15px] font-bold leading-8 text-emerald-50">
                            {previewMessage}
                          </p>
                          <div className="mt-3 flex items-center justify-end gap-1 text-[11px] font-bold text-emerald-100/65">
                            <span>✓✓</span>
                            <span>9:41 م</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 bg-[#08131d] px-4 py-4">
                        <div className="flex h-12 flex-1 items-center justify-between rounded-full bg-[#203244] px-4 text-sm font-bold text-slate-400">
                          <span>📎</span>
                          <span>اكتب رسالة</span>
                          <span>☺</span>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-lg text-white">
                          ●
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-cyan-300/15 bg-black/20 px-4 py-3 text-center text-sm font-bold leading-7 text-slate-300">
                    هذه معاينة تقريبية لشكل الرسالة. قد يختلف الشكل قليلًا حسب جهاز العميل.
                  </div>
                </section>
              </div>
            </aside>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        @keyframes announcement-drawer-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}

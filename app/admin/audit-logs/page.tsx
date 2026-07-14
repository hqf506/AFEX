'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePageAccess } from '@/hooks/use-page-access'

type AuditActor = {
  username: string | null
  full_name: string | null
}

type AuditLogRow = {
  id: string
  created_at: string
  action: string
  entity_type: string
  entity_id: string | null
  branch_id: string | null
  actor_user_id: string | null
  metadata: unknown
  actor?: AuditActor | AuditActor[] | null
}

type AuditLogsResponse = {
  success?: boolean
  logs?: AuditLogRow[]
  total?: number
  page?: number
  pageSize?: number
  error?: string
  details?: string
}

const PAGE_SIZE = 25

const EVENT_LABELS: Record<string, string> = {
  'order.created': 'تم إنشاء طلب جديد',
  'order.updated': 'تم تحديث الطلب',
  'order.status_updated': 'تم تحديث حالة الطلب',
  'order.cancelled': 'تم إلغاء الطلب',
  'invoice.created': 'تم إنشاء الفاتورة',
  invoice_pdf_sent: 'تم إرسال الفاتورة',
  invoice_pdf_failed: 'تعذر إرسال الفاتورة',
  'invoice.pdf_generation_failed': 'تعذر إنشاء ملف الفاتورة',
  'invoice.payment_snapshot_failed': 'تعذر حفظ بيانات الدفع',
  'whatsapp.message_sent': 'تم إرسال رسالة واتساب',
  'whatsapp.message_failed': 'فشل إرسال رسالة واتساب',
  'whatsapp.config_saved': 'تم حفظ إعدادات واتساب',
  'customer.created': 'تمت إضافة عميل',
  'customer.updated': 'تم تحديث بيانات العميل',
  'inventory.adjustment': 'تم تعديل المخزون',
  'inventory.received': 'تمت إضافة كمية للمخزون',
  'inventory.deducted': 'تم خصم كمية من المخزون',
  'login.success': 'تم تسجيل الدخول',
  'login.failed': 'فشلت محاولة تسجيل الدخول',
  'receipt.cancelled': 'تم إلغاء الفاتورة وإعادة المخزون',
  'user.created': 'تمت إضافة مستخدم',
  'user.deleted': 'تم حذف المستخدم',
  'user.profile_updated': 'تم تحديث بيانات المستخدم',
  'user.pos_profile_updated': 'تم تحديث بيانات موظف نقطة البيع',
  'user.role_updated': 'تم تحديث صلاحية المستخدم',
  'user.branch_updated': 'تم تغيير فرع المستخدم',
  'user.status_toggled': 'تم تغيير حالة المستخدم',
  'user.password_reset': 'تمت إعادة تعيين كلمة مرور المستخدم',
  'user.pos_pin_reset': 'تمت إعادة تعيين رمز موظف نقطة البيع',
  'user.profile_converted_to_pos_cashier': 'تم تحويل المستخدم إلى موظف نقطة بيع',
  'user.pos_cashier_converted_to_profile': 'تم تحويل موظف نقطة البيع إلى مستخدم إداري',
  'user.pos_profile_created_for_pin_reset': 'تم إنشاء ملف نقطة بيع للمستخدم',
  'branch.created': 'تمت إضافة فرع',
  'branch.updated': 'تم تحديث بيانات الفرع',
  'branch.restored': 'تمت استعادة الفرع',
  'branch.soft_deleted': 'تم حذف الفرع مؤقتًا',
  'branch.status_toggled': 'تم تغيير حالة الفرع',
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  order: 'الطلبات',
  invoice: 'الفواتير',
  receipt: 'الفواتير',
  customer: 'العملاء',
  inventory: 'المخزون',
  whatsapp_message: 'واتساب',
  branch_whatsapp_config: 'واتساب',
  profile: 'المستخدمون',
  pos_profile: 'المستخدمون',
  branch: 'الفروع',
  system: 'النظام',
}

const METADATA_KEY_LABELS: Record<string, string> = {
  order_id: 'رقم الطلب',
  order_number: 'رقم الطلب',
  invoice_id: 'رقم الفاتورة',
  invoice_number: 'رقم الفاتورة',
  provider_status: 'حالة المزود',
  provider_key: 'مزود الخدمة',
  provider_message_id: 'رقم الرسالة لدى المزود',
  recipient: 'رقم المستلم',
  recipient_masked: 'رقم المستلم',
  channel: 'قناة الإرسال',
  mode: 'طريقة الإرسال',
  type: 'نوع المحتوى',
  has_file: 'يحتوي على ملف',
  has_text: 'يحتوي على نص',
  status: 'الحالة',
  order_status: 'حالة الطلب',
  old_status: 'الحالة السابقة',
  new_status: 'الحالة الجديدة',
  payment_method: 'طريقة الدفع',
  items_count: 'عدد العناصر',
  total: 'الإجمالي',
  source: 'المصدر',
  error: 'سبب التعذر',
  message: 'الرسالة',
  role: 'الصلاحية',
  old_role: 'الصلاحية السابقة',
  new_role: 'الصلاحية الجديدة',
  branch_id: 'رقم الفرع',
  old_branch_id: 'الفرع السابق',
  new_branch_id: 'الفرع الجديد',
  is_active: 'الحالة النشطة',
  old_is_active: 'الحالة السابقة',
  new_is_active: 'الحالة الجديدة',
  username: 'اسم المستخدم',
  old_username: 'اسم المستخدم السابق',
  new_username: 'اسم المستخدم الجديد',
  full_name: 'الاسم الكامل',
  code: 'الرمز',
  name: 'الاسم',
  updated_fields: 'البيانات التي تم تحديثها',
  retention_days: 'مدة الاحتفاظ بالأيام',
  restored_from_soft_delete: 'تمت الاستعادة بعد حذف مؤقت',
  reset_by_admin: 'تمت إعادة التعيين بواسطة الإدارة',
  notification: 'بيانات الإشعار',
}

const METADATA_WORD_LABELS: Record<string, string> = {
  old: 'السابق',
  new: 'الجديد',
  id: 'الرقم',
  order: 'الطلب',
  invoice: 'الفاتورة',
  branch: 'الفرع',
  user: 'المستخدم',
  customer: 'العميل',
  provider: 'المزود',
  status: 'الحالة',
  number: 'الرقم',
  name: 'الاسم',
  type: 'النوع',
  method: 'الطريقة',
  payment: 'الدفع',
  message: 'الرسالة',
  error: 'الخطأ',
  count: 'العدد',
  total: 'الإجمالي',
  source: 'المصدر',
  created: 'الإنشاء',
  updated: 'التحديث',
}

const VALUE_LABELS: Record<string, string> = {
  whatsapp: 'واتساب',
  invoice_pdf: 'ملف PDF',
  pdf: 'ملف PDF',
  text: 'رسالة نصية',
  sent: 'تم الإرسال',
  failed: 'فشل الإرسال',
  success: 'تم بنجاح',
  pos: 'نقطة البيع',
  cash: 'نقدًا',
  card: 'بطاقة',
  active: 'نشط',
  inactive: 'غير نشط',
}

function shortId(value: string | null | undefined) {
  if (!value) return '—'
  if (value.length <= 12) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
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

function resolveActorName(log: AuditLogRow) {
  const actor = Array.isArray(log.actor) ? log.actor[0] : log.actor
  const fullName = actor?.full_name?.trim()
  const username = actor?.username?.trim()

  return fullName || username || shortId(log.actor_user_id)
}

function getEventLabel(action: string) {
  return EVENT_LABELS[action] || 'حدث في النظام'
}

function getEntityTypeLabel(entityType: string) {
  return ENTITY_TYPE_LABELS[entityType] || 'النظام'
}

function getMetadataKeyLabel(key: string) {
  if (METADATA_KEY_LABELS[key]) return METADATA_KEY_LABELS[key]

  const readableWords = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[_\s.-]+/)
    .filter(Boolean)
    .map((word) => METADATA_WORD_LABELS[word] || word)

  return readableWords.join(' ') || 'معلومة إضافية'
}

function formatMetadataValue(value: unknown): string {
  if (value === true) return 'نعم'
  if (value === false) return 'لا'
  if (value === null || value === undefined || value === '') return 'غير متوفر'
  if (Array.isArray(value)) return value.map(formatMetadataValue).join('، ') || 'غير متوفر'
  if (typeof value === 'object') return 'بيانات إضافية'

  const text = String(value)
  return VALUE_LABELS[text.toLowerCase()] || text
}

function getMetadataEntries(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return []

  const entries: Array<{ key: string; label: string; value: string }> = []

  function visit(value: Record<string, unknown>, parentLabel = '') {
    for (const [key, item] of Object.entries(value)) {
      const keyLabel = getMetadataKeyLabel(key)
      const label = parentLabel ? `${parentLabel} — ${keyLabel}` : keyLabel

      if (item && typeof item === 'object' && !Array.isArray(item)) {
        visit(item as Record<string, unknown>, label)
      } else {
        entries.push({ key: `${parentLabel}.${key}`, label, value: formatMetadataValue(item) })
      }
    }
  }

  visit(metadata as Record<string, unknown>)
  return entries
}

function summarizeMetadata(metadata: unknown) {
  const entries = getMetadataEntries(metadata).slice(0, 3)
  if (entries.length === 0) return 'لا توجد تفاصيل إضافية'
  return entries.map(({ label, value }) => `${label}: ${value}`).join(' · ')
}

function resolveFilterValue(value: string, labels: Record<string, string>) {
  const normalized = value.trim()
  return Object.entries(labels).find(([, label]) => label === normalized)?.[0] || normalized
}

function buildAuditLogsUrl({
  page,
  action,
  entityType,
  dateFrom,
  dateTo,
}: {
  page: number
  action: string
  entityType: string
  dateFrom: string
  dateTo: string
}) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('pageSize', String(PAGE_SIZE))

  if (action.trim()) params.set('action', resolveFilterValue(action, EVENT_LABELS))
  if (entityType.trim()) params.set('entity_type', resolveFilterValue(entityType, ENTITY_TYPE_LABELS))
  if (dateFrom.trim()) params.set('date_from', dateFrom.trim())
  if (dateTo.trim()) params.set('date_to', dateTo.trim())

  return `/api/admin/audit-logs?${params.toString()}`
}

export default function AdminAuditLogsPage() {
  const access = usePageAccess(['admin'])
  const { loading: accessLoading, allowed } = access

  const [logs, setLogs] = useState<AuditLogRow[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedMetadata, setSelectedMetadata] = useState<unknown | null>(null)

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total]
  )

  async function loadLogs(nextPage = page) {
    try {
      setLoadingLogs(true)
      setErrorMessage('')

      const response = await fetch(
        buildAuditLogsUrl({
          page: nextPage,
          action,
          entityType,
          dateFrom,
          dateTo,
        }),
        {
          method: 'GET',
          cache: 'no-store',
        }
      )
      const result = (await response.json()) as AuditLogsResponse

      if (!response.ok) {
        throw new Error(result.details || result.error || 'تعذر تحميل سجل النشاط')
      }

      setLogs(result.logs || [])
      setTotal(result.total || 0)
      setPage(result.page || nextPage)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر تحميل سجل النشاط'
      )
    } finally {
      setLoadingLogs(false)
    }
  }

  useEffect(() => {
    if (!accessLoading && allowed) {
      const timeoutId = window.setTimeout(() => {
        void loadLogs(1)
      }, 0)

      return () => window.clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessLoading, allowed])

  function applyFilters() {
    setPage(1)
    void loadLogs(1)
  }

  function clearFilters() {
    setAction('')
    setEntityType('')
    setDateFrom('')
    setDateTo('')
    setPage(1)

    window.setTimeout(() => {
      void loadLogs(1)
    }, 0)
  }

  if (accessLoading || !allowed) {
    return (
      <div className="rounded-[28px] border border-cyan-300/15 bg-[#07111f]/90 p-6 text-right text-slate-300">
        جارٍ تحميل سجل النشاط...
      </div>
    )
  }

  return (
    <section dir="rtl" className="space-y-6 text-right">
      <div className="rounded-[30px] border border-cyan-300/15 bg-[#07111f]/88 p-6 shadow-[0_24px_90px_rgba(0,0,0,0.32)] backdrop-blur-xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
          AFEX Audit
        </p>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-black text-white">سجل النشاط</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
              عرض مختصر للأحداث الحساسة داخل لوحة التحكم ونقطة البيع.
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/10 px-4 py-3 text-sm font-bold text-cyan-100">
            الإجمالي: {total}
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-cyan-300/15 bg-[#07111f]/88 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.26)] backdrop-blur-xl">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="space-y-2">
            <span className="text-xs font-bold text-slate-400">الحدث</span>
            <input
              value={action}
              onChange={(event) => setAction(event.target.value)}
              placeholder="مثال: تم إنشاء طلب جديد"
              className="h-11 w-full rounded-2xl border border-cyan-300/15 bg-[#06111f] px-4 text-sm font-bold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/45 focus:ring-2 focus:ring-cyan-300/15"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-bold text-slate-400">النوع</span>
            <input
              value={entityType}
              onChange={(event) => setEntityType(event.target.value)}
              placeholder="مثال: المستخدمون"
              className="h-11 w-full rounded-2xl border border-cyan-300/15 bg-[#06111f] px-4 text-sm font-bold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/45 focus:ring-2 focus:ring-cyan-300/15"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-bold text-slate-400">من تاريخ</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-11 w-full rounded-2xl border border-cyan-300/15 bg-[#06111f] px-4 text-sm font-bold text-white outline-none transition focus:border-cyan-300/45 focus:ring-2 focus:ring-cyan-300/15"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-bold text-slate-400">إلى تاريخ</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="h-11 w-full rounded-2xl border border-cyan-300/15 bg-[#06111f] px-4 text-sm font-bold text-white outline-none transition focus:border-cyan-300/45 focus:ring-2 focus:ring-cyan-300/15"
            />
          </label>
          <button
            type="button"
            onClick={applyFilters}
            className="h-11 self-end rounded-2xl border border-cyan-300/25 bg-cyan-300/12 px-4 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/18"
          >
            تطبيق
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="h-11 self-end rounded-2xl border border-slate-500/20 bg-[#06111f] px-4 text-sm font-black text-slate-300 transition hover:border-cyan-300/25 hover:text-white"
          >
            مسح
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">
          {errorMessage}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[28px] border border-cyan-300/15 bg-[#07111f]/88 shadow-[0_22px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-right">
            <thead>
              <tr className="border-b border-cyan-300/10 bg-cyan-300/8 text-xs font-black text-cyan-100">
                <th className="px-4 py-4">التاريخ</th>
                <th className="px-4 py-4">الحدث</th>
                <th className="px-4 py-4">النوع</th>
                <th className="px-4 py-4">المنفذ</th>
                <th className="px-4 py-4">رقم السجل</th>
                <th className="px-4 py-4">ملخص التفاصيل</th>
                <th className="px-4 py-4">تفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-300/10">
              {loadingLogs ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    جارٍ تحميل سجل النشاط...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    لا توجد سجلات مطابقة.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="text-sm text-slate-300 transition hover:bg-cyan-300/5"
                  >
                    <td className="whitespace-nowrap px-4 py-4 text-slate-400">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="px-4 py-4 font-black text-cyan-100">
                      {getEventLabel(log.action)}
                    </td>
                    <td className="px-4 py-4 text-slate-200">
                      {getEntityTypeLabel(log.entity_type)}
                    </td>
                    <td className="px-4 py-4">{resolveActorName(log)}</td>
                    <td className="px-4 py-4 font-mono text-xs text-slate-400">
                      {shortId(log.entity_id)}
                    </td>
                    <td className="max-w-[320px] truncate px-4 py-4 text-xs text-slate-400">
                      {summarizeMetadata(log.metadata)}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => setSelectedMetadata(log.metadata)}
                        className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/16"
                      >
                        عرض
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-cyan-300/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold text-slate-400">
            الصفحة {page} من {totalPages} · إجمالي السجلات {total}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loadingLogs}
              onClick={() => void loadLogs(Math.max(1, page - 1))}
              className="rounded-2xl border border-cyan-300/15 bg-[#06111f] px-4 py-2 text-sm font-black text-slate-300 transition hover:border-cyan-300/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              السابق
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loadingLogs}
              onClick={() => void loadLogs(page + 1)}
              className="rounded-2xl border border-cyan-300/25 bg-cyan-300/12 px-4 py-2 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/18 disabled:cursor-not-allowed disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        </div>
      </div>

      {selectedMetadata !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-[28px] border border-cyan-300/20 bg-[#07111f] p-5 shadow-[0_30px_110px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-black text-white">تفاصيل النشاط</h2>
              <button
                type="button"
                onClick={() => setSelectedMetadata(null)}
                className="rounded-xl border border-slate-500/20 bg-[#06111f] px-3 py-2 text-sm font-black text-slate-300 transition hover:text-white"
              >
                إغلاق
              </button>
            </div>
            <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-2xl border border-cyan-300/12 bg-[#030714] p-4">
              {getMetadataEntries(selectedMetadata).length > 0 ? (
                <dl className="grid gap-3 sm:grid-cols-2">
                  {getMetadataEntries(selectedMetadata).map((entry, index) => (
                    <div
                      key={`${entry.key}-${index}`}
                      className="rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.045] p-4"
                    >
                      <dt className="text-xs font-black text-cyan-200">{entry.label}</dt>
                      <dd className="mt-2 break-words text-sm font-bold leading-6 text-white">
                        {entry.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="py-8 text-center text-sm font-bold text-slate-400">
                  لا توجد تفاصيل إضافية لهذا النشاط.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

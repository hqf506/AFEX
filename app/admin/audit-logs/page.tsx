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

const VALUE_LABELS: Record<string, string> = {
  whatsapp: 'واتساب',
  invoice_pdf: 'فاتورة PDF',
  pdf: 'فاتورة PDF',
  file: 'فاتورة PDF',
  text: 'رسالة نصية',
  sent: 'تم الإرسال',
  failed: 'فشل الإرسال',
  success: 'تم بنجاح',
  true: 'نجح',
  false: 'فشل',
  pos: 'نقطة البيع',
  cash: 'نقدًا',
  card: 'بطاقة',
  bank_transfer: 'تحويل بنكي',
  pending: 'قيد الانتظار',
  completed: 'مكتمل',
  cancelled: 'ملغي',
  in_progress: 'قيد التنفيذ',
  active: 'نشط',
  inactive: 'غير نشط',
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

  return fullName || username || 'النظام'
}

function getEventLabel(action: string) {
  return EVENT_LABELS[action] || 'حدث في النظام'
}

function getEntityTypeLabel(entityType: string) {
  return ENTITY_TYPE_LABELS[entityType] || 'النظام'
}

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {}
}

function getBusinessValue(metadata: unknown, keys: string[]) {
  const root = metadataRecord(metadata)
  const notification = metadataRecord(root.notification)

  for (const key of keys) {
    const value = root[key] ?? notification[key]
    if (value !== null && value !== undefined && value !== '') return value
  }

  return null
}

function formatBusinessValue(value: unknown) {
  if (value === true) return 'نجح'
  if (value === false) return 'فشل'
  if (typeof value !== 'string' && typeof value !== 'number') return ''

  const text = String(value).trim()
  if (!text || UUID_PATTERN.test(text)) return ''
  return VALUE_LABELS[text.toLowerCase()] || text
}

function getOperationStatus(log: AuditLogRow) {
  if (/(failed|error)/i.test(log.action)) return 'فشل'
  if (/(sent|created|updated|received|deducted|success|cancelled|restored|reset|saved)/i.test(log.action)) {
    return 'نجحت'
  }

  return formatBusinessValue(
    getBusinessValue(log.metadata, ['provider_status', 'status', 'order_status', 'new_status'])
  ) || 'تم تسجيلها'
}

function getOperationDescription(log: AuditLogRow) {
  const total = Number(getBusinessValue(log.metadata, ['total']))

  if (log.action === 'order.created' && Number.isFinite(total)) {
    return `تم إنشاء طلب جديد بقيمة ${total.toFixed(2)} ريال`
  }

  if (log.action === 'whatsapp.message_sent') {
    const contentType = formatBusinessValue(getBusinessValue(log.metadata, ['type', 'mode']))
    const hasFile = getBusinessValue(log.metadata, ['has_file']) === true
    return contentType === 'فاتورة PDF' || hasFile
      ? 'تم إرسال فاتورة PDF عبر واتساب'
      : 'تم إرسال رسالة عبر واتساب'
  }

  if (log.action === 'whatsapp.message_failed') return 'فشل إرسال رسالة عبر واتساب'
  if (log.action === 'inventory.deducted') return 'تم خصم كمية بسبب عملية بيع'

  return getEventLabel(log.action)
}

function getBusinessDetails(log: AuditLogRow) {
  const values = [
    { label: 'نوع العملية', value: getEntityTypeLabel(log.entity_type) },
    { label: 'وصف العملية', value: getOperationDescription(log) },
    {
      label: 'رقم الطلب',
      value: formatBusinessValue(getBusinessValue(log.metadata, ['order_number', 'order_id'])),
    },
    {
      label: 'رقم الفاتورة',
      value: formatBusinessValue(getBusinessValue(log.metadata, ['invoice_number', 'invoice_id'])),
    },
    { label: 'المستخدم', value: resolveActorName(log) },
    {
      label: 'العميل',
      value: formatBusinessValue(
        getBusinessValue(log.metadata, ['customer_name', 'customer_number', 'recipient_masked'])
      ),
    },
    {
      label: 'قناة الإرسال',
      value: formatBusinessValue(getBusinessValue(log.metadata, ['channel'])),
    },
    { label: 'حالة العملية', value: getOperationStatus(log) },
    {
      label: 'طريقة الدفع',
      value: formatBusinessValue(getBusinessValue(log.metadata, ['payment_method'])),
    },
    { label: 'التاريخ والوقت', value: formatDate(log.created_at) },
  ]

  return values.filter(({ value }) => value)
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
  const [selectedLog, setSelectedLog] = useState<AuditLogRow | null>(null)

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
          <table className="min-w-[820px] w-full border-collapse text-right">
            <thead>
              <tr className="border-b border-cyan-300/10 bg-cyan-300/8 text-xs font-black text-cyan-100">
                <th className="px-4 py-4">التاريخ</th>
                <th className="px-4 py-4">الحدث</th>
                <th className="px-4 py-4">النوع</th>
                <th className="px-4 py-4">المنفذ</th>
                <th className="px-4 py-4">وصف العملية</th>
                <th className="px-4 py-4">تفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-300/10">
              {loadingLogs ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    جارٍ تحميل سجل النشاط...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
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
                    <td className="max-w-[360px] px-4 py-4 text-sm font-bold leading-6 text-slate-300">
                      {getOperationDescription(log)}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => setSelectedLog(log)}
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

      {selectedLog !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-[28px] border border-cyan-300/20 bg-[#07111f] p-5 shadow-[0_30px_110px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-black text-white">تفاصيل النشاط</h2>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-xl border border-slate-500/20 bg-[#06111f] px-3 py-2 text-sm font-black text-slate-300 transition hover:text-white"
              >
                إغلاق
              </button>
            </div>
            <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-2xl border border-cyan-300/12 bg-[#030714] p-4">
              <dl className="grid gap-3 sm:grid-cols-2">
                {getBusinessDetails(selectedLog).map((entry) => (
                  <div
                    key={entry.label}
                    className="rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.045] p-4"
                  >
                    <dt className="text-xs font-black text-cyan-200">{entry.label}</dt>
                    <dd className="mt-2 break-words text-sm font-bold leading-6 text-white">
                      {entry.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

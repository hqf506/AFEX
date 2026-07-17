import type {
  SupportCategory,
  SupportPriority,
  SupportStatus,
  SupportOperationalState,
} from '@/lib/support/contracts'

export const supportStatusLabels = {
  new: 'جديدة',
  investigating: 'قيد المعالجة',
  waiting_customer: 'بانتظار ردك',
  resolved: 'تم الحل',
  closed: 'مغلقة',
} as const

export const supportPriorityLabels = {
  low: 'منخفضة',
  normal: 'عادية',
  high: 'عالية',
  critical: 'حرجة',
} as const satisfies Record<SupportPriority, string>

export const supportCategoryLabels = {
  technical_error: 'خطأ تقني',
  orders: 'الطلبات',
  inventory: 'المخزون',
  invoices: 'الفواتير',
  whatsapp: 'واتساب',
  printing: 'الطباعة',
  users_permissions: 'المستخدمون والصلاحيات',
  performance: 'الأداء',
  feature_request: 'طلب ميزة',
  other: 'أخرى',
} as const satisfies Record<SupportCategory, string>

export const supportSourceLabels = {
  manual: 'إنشاء يدوي',
  error_report: 'بلاغ خطأ',
  system: 'النظام',
} as const

export const supportOperationalLabels = {
  awaiting_first_response: 'بانتظار أول رد',
  within_time: 'ضمن الوقت',
  attention: 'تحتاج انتباه',
  overdue: 'متأخرة',
  waiting_customer: 'بانتظار العميل',
  resolved: 'محلولة',
  closed: 'مغلقة',
} as const satisfies Record<SupportOperationalState, string>

export function supportOperationalClass(state: SupportOperationalState) {
  return {
    awaiting_first_response: 'border-cyan-300/25 bg-cyan-400/10 text-cyan-100',
    within_time: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100',
    attention: 'border-amber-300/30 bg-amber-400/10 text-amber-100',
    overdue: 'border-red-300/30 bg-red-500/10 text-red-100',
    waiting_customer: 'border-violet-300/25 bg-violet-400/10 text-violet-100',
    resolved: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100',
    closed: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  }[state]
}

export function formatSupportDuration(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—'
  const totalMinutes = Math.max(0, Math.floor(value))
  if (totalMinutes < 1) return 'أقل من دقيقة'
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const parts: string[] = []
  if (days) parts.push(days === 1 ? 'يوم واحد' : days === 2 ? 'يومان' : `${days.toLocaleString('ar-SA')} أيام`)
  if (hours) parts.push(hours === 1 ? 'ساعة' : hours === 2 ? 'ساعتان' : `${hours.toLocaleString('ar-SA')} ساعات`)
  if (minutes && days === 0) parts.push(`${minutes.toLocaleString('ar-SA')} دقيقة`)
  return parts.join(' و')
}

export const supportEventLabels: Record<string, string> = {
  ticket_created: 'تم إنشاء التذكرة',
  message_added: 'تمت إضافة رسالة',
  status_changed: 'تم تحديث الحالة',
  priority_changed: 'تم تحديث الأولوية',
  category_changed: 'تم تحديث التصنيف',
  assigned_to_changed: 'تم تحديث المسؤول',
  internal_note_added: 'تمت إضافة ملاحظة داخلية',
  ticket_resolved: 'تم حل التذكرة',
  ticket_closed: 'تم إغلاق التذكرة',
}

export type SupportSource = keyof typeof supportSourceLabels
export type { SupportCategory, SupportPriority, SupportStatus } from '@/lib/support/contracts'

export type SupportTicketListItem = {
  id: string
  ticket_number: string
  branch_id: string | null
  category: SupportCategory
  priority: SupportPriority
  status: SupportStatus
  title: string
  source: SupportSource
  last_message_at: string
  created_at: string
  updated_at: string
}

export type SupportTicketDetail = Omit<SupportTicketListItem, 'id' | 'branch_id'> & {
  has_branch: boolean
  description: string
  closed_at: string | null
  resolved_at: string | null
}

export type SupportMessage = {
  sender_type: 'customer' | 'provider' | 'system'
  message: string
  is_internal?: boolean
  created_at: string
}

export type SupportEvent = {
  event_type: string
  created_at: string
}

export type SupportAttachment = {
  id: string
  original_filename: string
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
  size_bytes: number
  created_at: string
}

export function formatSupportFileSize(bytes: number) {
  const safe = Math.max(0, bytes)
  return safe >= 1024 * 1024 ? `${(safe / (1024 * 1024)).toLocaleString('ar-SA', { maximumFractionDigits: 1 })} MB` : `${Math.ceil(safe / 1024).toLocaleString('ar-SA')} KB`
}

export function formatSupportDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('ar-SA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function supportStatusClass(status: SupportStatus) {
  return {
    new: 'border-cyan-300/25 bg-cyan-400/10 text-cyan-100',
    investigating: 'border-violet-300/25 bg-violet-400/10 text-violet-100',
    waiting_customer: 'border-amber-300/25 bg-amber-400/10 text-amber-100',
    resolved: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100',
    closed: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  }[status]
}

export function supportPriorityClass(priority: SupportPriority) {
  return {
    low: 'border-slate-400/25 bg-slate-400/10 text-slate-200',
    normal: 'border-blue-300/25 bg-blue-400/10 text-blue-100',
    high: 'border-orange-300/25 bg-orange-400/10 text-orange-100',
    critical: 'border-red-300/25 bg-red-500/10 text-red-100',
  }[priority]
}

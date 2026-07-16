export const supportStatusLabels = {
  open: 'مفتوحة',
  investigating: 'قيد المعالجة',
  waiting_customer: 'بانتظار ردك',
  resolved: 'تم الحل',
  closed: 'مغلقة',
} as const

export const supportPriorityLabels = {
  low: 'منخفضة',
  normal: 'عادية',
  high: 'عالية',
  urgent: 'عاجلة',
} as const

export const supportCategoryLabels = {
  technical: 'مشكلة تقنية',
  account: 'الحساب والصلاحيات',
  billing: 'الفوترة والمدفوعات',
  data: 'البيانات والتقارير',
  feature_request: 'طلب ميزة',
  other: 'أخرى',
} as const

export const supportSourceLabels = {
  manual: 'إنشاء يدوي',
  error_report: 'بلاغ خطأ',
  system: 'النظام',
} as const

export const supportEventLabels: Record<string, string> = {
  ticket_created: 'تم إنشاء التذكرة',
  message_added: 'تمت إضافة رسالة',
  status_changed: 'تم تحديث الحالة',
  priority_changed: 'تم تحديث الأولوية',
  category_changed: 'تم تحديث التصنيف',
  assigned_to_changed: 'تم تحديث المسؤول',
  ticket_resolved: 'تم حل التذكرة',
  ticket_closed: 'تم إغلاق التذكرة',
}

export type SupportStatus = keyof typeof supportStatusLabels
export type SupportPriority = keyof typeof supportPriorityLabels
export type SupportCategory = keyof typeof supportCategoryLabels
export type SupportSource = keyof typeof supportSourceLabels

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

export type SupportTicketDetail = SupportTicketListItem & {
  description: string
  closed_at: string | null
  resolved_at: string | null
}

export type SupportMessage = {
  id: string
  sender_type: 'customer' | 'provider' | 'system'
  message: string
  is_internal?: boolean
  created_at: string
}

export type SupportEvent = {
  id: string
  event_type: string
  created_at: string
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
    open: 'border-cyan-300/25 bg-cyan-400/10 text-cyan-100',
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
    urgent: 'border-red-300/25 bg-red-500/10 text-red-100',
  }[priority]
}

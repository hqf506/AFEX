export const SUPPORT_STATUSES = ['new', 'investigating', 'waiting_customer', 'resolved', 'closed'] as const
export const SUPPORT_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const
export const SUPPORT_CATEGORIES = ['technical_error', 'orders', 'inventory', 'invoices', 'whatsapp', 'printing', 'users_permissions', 'performance', 'feature_request', 'other'] as const
export const SUPPORT_OPERATIONAL_STATES = ['awaiting_first_response', 'within_time', 'attention', 'overdue', 'waiting_customer', 'resolved', 'closed'] as const
export const SUPPORT_OPERATIONAL_FILTERS = ['all', 'awaiting_first_response', 'needs_follow_up', 'attention', 'overdue', 'waiting_customer'] as const

export type SupportStatus = (typeof SUPPORT_STATUSES)[number]
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number]
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number]
export type SupportOperationalState = (typeof SUPPORT_OPERATIONAL_STATES)[number]
export type SupportOperationalFilter = (typeof SUPPORT_OPERATIONAL_FILTERS)[number]

export type ProviderOperationalTicket = {
  id: string
  ticket_number: string
  category: SupportCategory
  priority: SupportPriority
  status: SupportStatus
  title: string
  organization_name: string
  is_assigned: boolean
  assigned_to_me: boolean
  created_at: string
  updated_at: string
  first_provider_reply_at: string | null
  last_customer_message_at: string | null
  last_provider_reply_at: string | null
  last_public_message_at: string | null
  last_public_sender_type: 'customer' | 'provider' | 'system' | null
  public_message_count: number
  age_minutes: number
  first_response_minutes: number | null
  waiting_minutes: number | null
  operational_deadline_at: string | null
  first_response_threshold_minutes: number
  follow_up_threshold_minutes: number
  operational_state: SupportOperationalState
  is_overdue: boolean
  is_attention_required: boolean
}

export type ProviderOperationalSummary = {
  total_active: number
  new: number
  investigating: number
  waiting_customer: number
  resolved: number
  closed: number
  critical: number
  assigned_to_me: number
  unassigned: number
  awaiting_first_response: number
  attention: number
  overdue: number
  operational_waiting_customer: number
}

export type ProviderOperationalDashboard = {
  items: ProviderOperationalTicket[]
  pagination: { page: number; page_size: number; total: number }
  summary: ProviderOperationalSummary
  calculated_at: string
}

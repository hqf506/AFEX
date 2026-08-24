import 'server-only'

import type { AuthScopeType } from '@/lib/auth-profile'
import { shouldFilterByBranch } from '@/lib/branch-access'
import {
  normalizeOrderStatusHistory,
  type OrderStatusHistoryEntry,
  type OrderStatusHistorySourceRow,
} from '@/lib/orders/order-status-details'
import type { OrderStatus } from '@/lib/orders/normalize'
import { supabaseAdmin } from '@/lib/supabase/admin'

type LoadOrderStatusHistoryInput = {
  tenantId: string
  branchId: string | null
  scopeType: AuthScopeType | null | undefined
  orderId: string
  currentStatus: OrderStatus
}

export type AuthorizedOrderStatusHistoryResult = {
  readState: 'success' | 'error'
  entries: OrderStatusHistoryEntry[]
}

export async function loadAuthorizedOrderStatusHistory({
  tenantId,
  branchId,
  scopeType,
  orderId,
  currentStatus,
}: LoadOrderStatusHistoryInput): Promise<AuthorizedOrderStatusHistoryResult> {
  let historyQuery = supabaseAdmin
    .from('audit_logs')
    .select('id, action, actor_user_id, created_at, metadata')
    .eq('tenant_id', tenantId)
    .eq('entity_type', 'order')
    .eq('entity_id', orderId)
    .eq('action', 'order.status_updated')
    .order('created_at', { ascending: false })

  if (shouldFilterByBranch(scopeType, branchId)) {
    historyQuery = historyQuery.eq('branch_id', branchId as string)
  }

  const { data, error } = await historyQuery
  if (error) return { readState: 'error', entries: [] }

  const rows = Array.isArray(data) ? data as OrderStatusHistorySourceRow[] : []
  const actorIds = [...new Set(rows.flatMap((row) => (
    typeof row.actor_user_id === 'string' && row.actor_user_id.trim()
      ? [row.actor_user_id.trim()]
      : []
  )))]
  const employeeNames: Record<string, string> = {}

  if (actorIds.length > 0) {
    let profilesQuery = supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .eq('tenant_id', tenantId)
      .in('id', actorIds)

    if (shouldFilterByBranch(scopeType, branchId)) {
      profilesQuery = profilesQuery.eq('branch_id', branchId as string)
    }

    const profilesResult = await profilesQuery
    if (!profilesResult.error) {
      for (const profile of profilesResult.data || []) {
        const id = typeof profile.id === 'string' ? profile.id.trim() : ''
        const fullName = typeof profile.full_name === 'string' ? profile.full_name.trim() : ''
        if (id && fullName) employeeNames[id] = fullName
      }
    }
  }

  return {
    readState: 'success',
    entries: normalizeOrderStatusHistory(rows, employeeNames, currentStatus),
  }
}

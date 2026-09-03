export const ORDER_STATUS_TRANSITIONS = {
  in_progress: 'ready',
  ready: 'closed',
} as const

export type TransitionableOrderStatus = keyof typeof ORDER_STATUS_TRANSITIONS
export type OrderStatusTransitionTarget = (typeof ORDER_STATUS_TRANSITIONS)[TransitionableOrderStatus]
export type PersistedOrderStatus = TransitionableOrderStatus | OrderStatusTransitionTarget

export type OrderStatusTransitionAuthority = {
  tenantId: string
  branchId: string
  actorId: string
  actorRole: string
  canWriteOrders: boolean
}

export type AuthoritativeOrderStatusRow = {
  id: string
  orderNumber: string
  tenantId: string
  branchId: string
  status: string
}

type CompareAndSetResult =
  | { outcome: 'updated'; order: AuthoritativeOrderStatusRow }
  | { outcome: 'not_updated' }
  | { outcome: 'persistence_error' }

export type OrderStatusTransitionGateway = {
  loadOrder: (input: {
    orderId: string
    tenantId: string
  }) => Promise<AuthoritativeOrderStatusRow | null>
  compareAndSetStatus: (input: {
    orderId: string
    tenantId: string
    branchId: string
    currentStatus: TransitionableOrderStatus
    targetStatus: OrderStatusTransitionTarget
  }) => Promise<CompareAndSetResult>
  recordAudit: (input: {
    order: AuthoritativeOrderStatusRow
    actorId: string
    branchId: string
    previousStatus: TransitionableOrderStatus
    targetStatus: OrderStatusTransitionTarget
  }) => Promise<void>
}

export type OrderStatusTransitionClassification =
  | 'ORDER_STATUS_UPDATED'
  | 'ORDER_STATUS_ALREADY_APPLIED'
  | 'ORDER_STATUS_INPUT_INVALID'
  | 'ORDER_STATUS_FORBIDDEN'
  | 'ORDER_SCOPE_FORBIDDEN'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_STATUS_TRANSITION_INVALID'
  | 'ORDER_STATUS_STALE'
  | 'ORDER_STATUS_PERSISTENCE_FAILED'

export type OrderStatusTransitionResult =
  | {
      ok: true
      classification: 'ORDER_STATUS_UPDATED' | 'ORDER_STATUS_ALREADY_APPLIED'
      order: AuthoritativeOrderStatusRow
      idempotent: boolean
      auditMode: 'BEST_EFFORT_EXISTING_CONTRACT'
    }
  | {
      ok: false
      classification: Exclude<
        OrderStatusTransitionClassification,
        'ORDER_STATUS_UPDATED' | 'ORDER_STATUS_ALREADY_APPLIED'
      >
      currentStatus: string | null
    }

const POS_ORDER_STATUS_ACTOR_ROLES = new Set([
  'admin',
  'manager',
  'employee',
  'cashier',
])

function isTransitionableStatus(value: string): value is TransitionableOrderStatus {
  return Object.hasOwn(ORDER_STATUS_TRANSITIONS, value)
}

function isTransitionTarget(value: string): value is OrderStatusTransitionTarget {
  return value === 'ready' || value === 'closed'
}

function failed(
  classification: Exclude<
    OrderStatusTransitionClassification,
    'ORDER_STATUS_UPDATED' | 'ORDER_STATUS_ALREADY_APPLIED'
  >,
  currentStatus: string | null = null
): OrderStatusTransitionResult {
  return { ok: false, classification, currentStatus }
}

function alreadyApplied(order: AuthoritativeOrderStatusRow): OrderStatusTransitionResult {
  return {
    ok: true,
    classification: 'ORDER_STATUS_ALREADY_APPLIED',
    order,
    idempotent: true,
    auditMode: 'BEST_EFFORT_EXISTING_CONTRACT',
  }
}

export async function transitionOrderStatus(
  input: {
    orderId: string
    targetStatus: string
    authority: OrderStatusTransitionAuthority
  },
  gateway: OrderStatusTransitionGateway
): Promise<OrderStatusTransitionResult> {
  const orderId = input.orderId.trim()
  const targetStatus = input.targetStatus.trim()
  const authority = input.authority

  if (!orderId || !isTransitionTarget(targetStatus)) {
    return failed('ORDER_STATUS_INPUT_INVALID')
  }

  if (
    !authority.tenantId ||
    !authority.branchId ||
    !authority.actorId ||
    !authority.canWriteOrders ||
    !POS_ORDER_STATUS_ACTOR_ROLES.has(authority.actorRole)
  ) {
    return failed('ORDER_STATUS_FORBIDDEN')
  }

  let order: AuthoritativeOrderStatusRow | null
  try {
    order = await gateway.loadOrder({ orderId, tenantId: authority.tenantId })
  } catch {
    return failed('ORDER_STATUS_PERSISTENCE_FAILED')
  }

  if (!order) return failed('ORDER_NOT_FOUND')
  if (order.tenantId !== authority.tenantId || order.branchId !== authority.branchId) {
    return failed('ORDER_SCOPE_FORBIDDEN', order.status)
  }

  if (order.status === targetStatus) return alreadyApplied(order)
  if (!isTransitionableStatus(order.status)) {
    return failed('ORDER_STATUS_TRANSITION_INVALID', order.status)
  }
  if (ORDER_STATUS_TRANSITIONS[order.status] !== targetStatus) {
    return failed('ORDER_STATUS_TRANSITION_INVALID', order.status)
  }

  let updateResult: CompareAndSetResult
  try {
    updateResult = await gateway.compareAndSetStatus({
      orderId,
      tenantId: authority.tenantId,
      branchId: authority.branchId,
      currentStatus: order.status,
      targetStatus,
    })
  } catch {
    return failed('ORDER_STATUS_PERSISTENCE_FAILED', order.status)
  }

  if (updateResult.outcome === 'persistence_error') {
    return failed('ORDER_STATUS_PERSISTENCE_FAILED', order.status)
  }

  if (updateResult.outcome === 'not_updated') {
    let latest: AuthoritativeOrderStatusRow | null
    try {
      latest = await gateway.loadOrder({ orderId, tenantId: authority.tenantId })
    } catch {
      return failed('ORDER_STATUS_PERSISTENCE_FAILED', order.status)
    }

    if (!latest) return failed('ORDER_NOT_FOUND', order.status)
    if (latest.tenantId !== authority.tenantId || latest.branchId !== authority.branchId) {
      return failed('ORDER_SCOPE_FORBIDDEN', latest.status)
    }
    if (latest.status === targetStatus) return alreadyApplied(latest)
    return failed('ORDER_STATUS_STALE', latest.status)
  }

  // The existing AFEX audit helper is deliberately best-effort and non-atomic.
  // Preserve that established contract while still awaiting one write attempt.
  try {
    await gateway.recordAudit({
      order: updateResult.order,
      actorId: authority.actorId,
      branchId: authority.branchId,
      previousStatus: order.status,
      targetStatus,
    })
  } catch {
    // Defensive only: writeAuditLog currently catches its own persistence failure.
  }

  return {
    ok: true,
    classification: 'ORDER_STATUS_UPDATED',
    order: updateResult.order,
    idempotent: false,
    auditMode: 'BEST_EFFORT_EXISTING_CONTRACT',
  }
}

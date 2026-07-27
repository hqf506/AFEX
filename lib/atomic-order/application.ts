import 'server-only'

import {
  canonicalJson,
  sha256Hex,
} from '@/lib/idempotency/core'
import type {
  AuthorizationStageOutput,
  FinancialQuoteStageOutput,
} from '@/lib/atomic-order/contracts'

export const AUDIT_SCHEMA_VERSION = 'atomic-audit-v1' as const
export const OUTBOX_SCHEMA_VERSION = 'atomic-outbox-v1' as const

export type AtomicAuditCandidate = {
  correlationId: string
  tenantId: string
  branchId: string
  actorId: string
  actorRole: string
  employeeId: string | null
  orderId: string | null
  invoiceId: string | null
  customerId: string | null
  requestFingerprint: string
  quoteFingerprint: string
  eventType: 'order_created'
  action: 'order.create'
  entity: 'order'
  beforeSnapshot: null
  afterSnapshot: null
  timestamp: string
  auditSchemaVersion: typeof AUDIT_SCHEMA_VERSION
  persistenceStatus: 'pending_database_transaction'
}

export type AtomicOutboxEventType =
  | 'invoice_created'
  | 'inventory_changed'
  | 'customer_created'
  | 'whatsapp_send'
  | 'email_send'
  | 'pdf_generate'
  | 'loyalty_update'
  | 'analytics_publish'
  | 'webhook_dispatch'

export type AtomicOutboxPayload = {
  [key: string]:
    | string
    | number
    | boolean
    | null
    | AtomicOutboxPayload
    | Array<string | number | boolean | null | AtomicOutboxPayload>
}

export type AtomicOutboxCandidate = {
  eventId: string
  correlationId: string
  aggregateId: string | null
  aggregateType: 'order' | 'invoice' | 'customer' | 'inventory'
  tenantId: string
  branchId: string
  eventType: AtomicOutboxEventType
  payloadVersion: typeof OUTBOX_SCHEMA_VERSION
  payload: AtomicOutboxPayload
  payloadHashCandidate: string
  retryCount: 0
  executionStatus: 'pending_commit'
  createdAt: string
}

export const AFTER_COMMIT_EXECUTION_ORDER = [
  'invoice_committed',
  'inventory_committed',
  'audit_committed',
  'outbox_committed',
  'pdf_generate',
  'whatsapp_send',
  'email_send',
  'analytics_publish',
  'webhook_dispatch',
] as const

export const ATOMIC_ROLLBACK_OWNERS = [
  'customer_persistence',
  'number_allocation',
  'order_persistence',
  'invoice_persistence',
  'invoice_items_persistence',
  'financial_snapshot_persistence',
  'inventory_mutation',
  'payment_snapshot_persistence',
  'audit_persistence',
  'outbox_persistence',
  'idempotency_acquisition',
] as const

export const INSIDE_ATOMIC_TRANSACTION = [
  'authorization_validation_result',
  'customer_persistence',
  'idempotency_acquire',
  'financial_quote_validation',
  'inventory_validation_and_lock_plan',
  'number_allocation',
  'order_insert',
  'invoice_insert',
  'invoice_items_insert',
  'financial_snapshot_persistence',
  'inventory_movement',
  'inventory_deduction',
  'payment_snapshot_persistence',
  'audit_persistence',
  'outbox_persistence',
  'idempotency_commit',
] as const

export const OUTSIDE_ATOMIC_TRANSACTION = [
  'pdf_generation',
  'whatsapp_delivery',
  'email_delivery',
  'notification_delivery',
  'analytics_delivery',
  'webhook_delivery',
  'cache_refresh',
  'ui_refresh',
] as const

export type AtomicRollbackContract = {
  transactionOwner: 'future_atomic_database_function'
  strategy: 'database_transaction_rollback'
  rollbackOrder: readonly string[]
  externalRollbackRequired: false
}

export const ATOMIC_ROLLBACK_CONTRACT: AtomicRollbackContract = {
  transactionOwner: 'future_atomic_database_function',
  strategy: 'database_transaction_rollback',
  rollbackOrder: [...ATOMIC_ROLLBACK_OWNERS].reverse(),
  externalRollbackRequired: false,
}

function normalizeTimestamp(value: string) {
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) {
    throw new TypeError('Atomic timestamp contract is invalid')
  }
  return timestamp.toISOString()
}

function deterministicCandidateUuid(value: unknown) {
  const hash = sha256Hex(canonicalJson(value))
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

export function buildAtomicAuditCandidate(input: {
  authorization: AuthorizationStageOutput
  financial: FinancialQuoteStageOutput
  correlationId: string
  orderId?: string | null
  invoiceId?: string | null
  customerId?: string | null
  timestamp: string
}): AtomicAuditCandidate {
  return {
    correlationId: input.correlationId,
    tenantId: input.authorization.tenantId,
    branchId: input.authorization.branchId,
    actorId: input.authorization.actor.id,
    actorRole: input.authorization.authorization.role,
    employeeId:
      input.authorization.actor.type === 'pos_employee'
        ? input.authorization.actor.id
        : null,
    orderId: input.orderId || null,
    invoiceId: input.invoiceId || null,
    customerId: input.customerId || null,
    requestFingerprint: input.financial.snapshot.requestFingerprint,
    quoteFingerprint: input.financial.snapshot.quoteFingerprint,
    eventType: 'order_created',
    action: 'order.create',
    entity: 'order',
    beforeSnapshot: null,
    afterSnapshot: null,
    timestamp: normalizeTimestamp(input.timestamp),
    auditSchemaVersion: AUDIT_SCHEMA_VERSION,
    persistenceStatus: 'pending_database_transaction',
  }
}

export function buildAtomicOutboxCandidates(input: {
  correlationId: string
  tenantId: string
  branchId: string
  timestamp: string
  events: Array<{
    eventType: AtomicOutboxEventType
    aggregateType: AtomicOutboxCandidate['aggregateType']
    aggregateId?: string | null
    payload: AtomicOutboxPayload
  }>
}): AtomicOutboxCandidate[] {
  const createdAt = normalizeTimestamp(input.timestamp)
  return input.events.map((event, index) => {
    const canonicalPayload = JSON.parse(
      canonicalJson(event.payload)
    ) as AtomicOutboxPayload
    const payloadEnvelope = {
      correlationId: input.correlationId,
      tenantId: input.tenantId,
      branchId: input.branchId,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId || null,
      eventType: event.eventType,
      payloadVersion: OUTBOX_SCHEMA_VERSION,
      payload: canonicalPayload,
    }
    return {
      eventId: deterministicCandidateUuid({
        ...payloadEnvelope,
        ordinal: index,
      }),
      correlationId: input.correlationId,
      aggregateId: event.aggregateId || null,
      aggregateType: event.aggregateType,
      tenantId: input.tenantId,
      branchId: input.branchId,
      eventType: event.eventType,
      payloadVersion: OUTBOX_SCHEMA_VERSION,
      payload: canonicalPayload,
      payloadHashCandidate: sha256Hex(canonicalJson(payloadEnvelope)),
      retryCount: 0,
      executionStatus: 'pending_commit',
      createdAt,
    }
  })
}

export type AtomicExecutionMode = 'core_v2_only' | 'legacy_only'

export function selectAtomicExecutionMode(
  coreV2Enabled: boolean
): AtomicExecutionMode {
  return coreV2Enabled ? 'core_v2_only' : 'legacy_only'
}

export function assertLegacyIsolation(input: {
  mode: AtomicExecutionMode
  attemptedPaths: Array<'core_v2' | 'legacy'>
}) {
  const expected = input.mode === 'core_v2_only' ? 'core_v2' : 'legacy'
  if (
    input.attemptedPaths.length !== 1 ||
    input.attemptedPaths[0] !== expected
  ) {
    throw new TypeError('Atomic and legacy paths must never mix in one request')
  }
}

import 'server-only'

import type { AuthorizationContext } from '@/lib/authorization-context'
import type {
  FinancialQuote,
  FinancialQuoteRequest,
  FinancialSnapshot,
} from '@/lib/financial/core'
import type { IdempotencyCommandIdentity } from '@/lib/idempotency/core'
import type {
  InventoryLockPlanEntry,
  InventoryRequirement,
  InventorySnapshotCandidate,
} from '@/lib/inventory/core'
import type { NumberAllocationCandidate } from '@/lib/numbering/core'
import type {
  AtomicAuditCandidate,
  AtomicOutboxCandidate,
} from '@/lib/atomic-order/application'

export const ATOMIC_ORDER_ENGINE_VERSION = 'atomic-order-v2-r1' as const

export const ATOMIC_ORDER_STAGE_ORDER = [
  'authorization',
  'customer',
  'idempotency',
  'financial_quote',
  'inventory_validation',
  'number_allocation',
  'order_creation',
  'invoice_creation',
  'snapshot_mapping',
  'inventory_mutation',
  'payment_snapshot',
  'audit',
  'outbox',
  'idempotency_commit',
] as const

export type AtomicOrderStageName = (typeof ATOMIC_ORDER_STAGE_ORDER)[number]

export type AtomicOrderStageDefinition = {
  name: AtomicOrderStageName
  requiredPreviousStage: AtomicOrderStageName | null
  dependencies: readonly string[]
  capabilities: readonly string[]
}

export const ATOMIC_ORDER_STAGE_DEFINITIONS: Readonly<
  Record<AtomicOrderStageName, AtomicOrderStageDefinition>
> = {
  authorization: {
    name: 'authorization',
    requiredPreviousStage: null,
    dependencies: ['AuthorizationContext'],
    capabilities: ['orders:write'],
  },
  customer: {
    name: 'customer',
    requiredPreviousStage: 'authorization',
    dependencies: ['CustomerEngine', 'AuthorizationContext'],
    capabilities: ['orders:write'],
  },
  idempotency: {
    name: 'idempotency',
    requiredPreviousStage: 'customer',
    dependencies: ['IdempotencyService', 'CustomerEngine'],
    capabilities: ['orders:write'],
  },
  financial_quote: {
    name: 'financial_quote',
    requiredPreviousStage: 'idempotency',
    dependencies: ['FinancialQuoteService'],
    capabilities: ['orders:write'],
  },
  inventory_validation: {
    name: 'inventory_validation',
    requiredPreviousStage: 'financial_quote',
    dependencies: ['InventoryEngine'],
    capabilities: ['orders:write'],
  },
  number_allocation: {
    name: 'number_allocation',
    requiredPreviousStage: 'inventory_validation',
    dependencies: ['OrderNumberAllocator'],
    capabilities: ['orders:write'],
  },
  order_creation: {
    name: 'order_creation',
    requiredPreviousStage: 'number_allocation',
    dependencies: ['OrderRepository'],
    capabilities: ['orders:write'],
  },
  invoice_creation: {
    name: 'invoice_creation',
    requiredPreviousStage: 'order_creation',
    dependencies: ['InvoiceRepository'],
    capabilities: ['orders:write'],
  },
  snapshot_mapping: {
    name: 'snapshot_mapping',
    requiredPreviousStage: 'invoice_creation',
    dependencies: ['FinancialSnapshotMapper'],
    capabilities: ['orders:write'],
  },
  inventory_mutation: {
    name: 'inventory_mutation',
    requiredPreviousStage: 'snapshot_mapping',
    dependencies: ['InventoryEngine'],
    capabilities: ['orders:write'],
  },
  payment_snapshot: {
    name: 'payment_snapshot',
    requiredPreviousStage: 'inventory_mutation',
    dependencies: ['PaymentSnapshotMapper'],
    capabilities: ['orders:write'],
  },
  audit: {
    name: 'audit',
    requiredPreviousStage: 'payment_snapshot',
    dependencies: ['AuditWriter'],
    capabilities: ['orders:write'],
  },
  idempotency_commit: {
    name: 'idempotency_commit',
    requiredPreviousStage: 'outbox',
    dependencies: ['IdempotencyService'],
    capabilities: ['orders:write'],
  },
  outbox: {
    name: 'outbox',
    requiredPreviousStage: 'audit',
    dependencies: ['OutboxWriter'],
    capabilities: ['orders:write'],
  },
}

export type AtomicOrderErrorCode =
  | 'CORE_V2_DISABLED'
  | 'PIPELINE_CANCELLED'
  | 'STAGE_NOT_CONFIGURED'
  | 'STAGE_DEPENDENCY_MISSING'
  | 'STAGE_ORDER_INVALID'
  | 'AUTHORIZATION_REJECTED'
  | 'CUSTOMER_RESOLUTION_FAILED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'FINANCIAL_QUOTE_REJECTED'
  | 'INVENTORY_REJECTED'
  | 'NUMBER_CONFIGURATION_MISSING'
  | 'NUMBER_PREFIX_INVALID'
  | 'NUMBER_SEQUENCE_CONFLICT'
  | 'NUMBER_LOCK_TIMEOUT'
  | 'NUMBER_ALLOCATION_FAILED'
  | 'CUSTOMER_PERSISTENCE_CONFLICT'
  | 'ORDER_CREATION_FAILED'
  | 'ORDER_PERSISTENCE_FAILED'
  | 'INVOICE_CREATION_FAILED'
  | 'INVOICE_PERSISTENCE_FAILED'
  | 'INVOICE_ITEM_PERSISTENCE_FAILED'
  | 'SNAPSHOT_MAPPING_FAILED'
  | 'PAYMENT_SNAPSHOT_INVALID'
  | 'SNAPSHOT_INCOMPLETE'
  | 'SNAPSHOT_CONTRACT_MISMATCH'
  | 'INVENTORY_MUTATION_FAILED'
  | 'PAYMENT_SNAPSHOT_FAILED'
  | 'AUDIT_FAILED'
  | 'IDEMPOTENCY_COMMIT_FAILED'
  | 'OUTBOX_ENQUEUE_FAILED'
  | 'ROLLBACK_FAILED'
  | 'UNEXPECTED_STAGE_FAILURE'

export class AtomicOrderError extends Error {
  constructor(
    readonly code: AtomicOrderErrorCode,
    readonly stage: AtomicOrderStageName | null,
    readonly retryable: boolean,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options)
    this.name = 'AtomicOrderError'
  }
}

export type AtomicOrderIntent = {
  commandType: 'order.create'
  clientIdempotencyKey: string
  customer: {
    customerId: string | null
    name: string | null
    phone: string
    email: string | null
    notes: string | null
  }
  financial: FinancialQuoteRequest
}

export type AuthorizationStageOutput = {
  authorization: AuthorizationContext
  tenantId: string
  branchId: string
  actor: {
    type: 'user' | 'pos_employee'
    id: string
  }
}

export type CustomerStageOutput = {
  mode: 'existing' | 'create'
  customerId: string | null
  normalizedPhone: string
  expectedRecordVersion: number | null
}

export type IdempotencyStageOutput = {
  command: IdempotencyCommandIdentity
  commandId: string | null
  disposition: 'proceed' | 'replay'
  replayResult: AtomicOrderCommittedResult | null
}

export type FinancialQuoteStageOutput = {
  request: FinancialQuoteRequest
  quote: FinancialQuote
  snapshot: FinancialSnapshot
  snapshotCandidate: {
    complete: boolean
    reasons: Array<{
      code: 'PRICE_SOURCE_EVIDENCE_MISSING' | 'COST_SNAPSHOT_MISSING'
      line: number
      catalogItemId: string
    }>
    paymentStatusIntent: 'paid' | 'pending'
    lines: Array<{
      line: number
      catalogItemId: string
      costSnapshot: string | null
      profitSnapshot: string | null
      sourceEvidenceComplete: boolean
    }>
  }
  source: 'legacy' | 'core-v2'
  shadowDifferences: Array<{
    field: string
    line?: number
    legacy: string
    shadow: string
  }>
}

export type InventoryValidationStageOutput = {
  complete: true
  requirements: InventoryRequirement[]
  lockPlan: InventoryLockPlanEntry[]
  snapshotCandidates: InventorySnapshotCandidate[]
}

export type NumberAllocationStageOutput = NumberAllocationCandidate

export type OrderCreationStageOutput = {
  orderId: string
  orderNumber: string
  status: string
}

export type InvoiceCreationStageOutput = {
  invoiceId: string
  invoiceNumber: string
}

export type SnapshotMappingStageOutput = {
  financialSnapshot: FinancialSnapshot
  snapshotHash: string
}

export type InventoryMutationStageOutput = {
  movementIds: string[]
}

export type PaymentSnapshotStageOutput = {
  paymentMethod: string
  cashReceived: string
  remainingFromCustomer: string
  cashChange: string
}

export type AuditStageOutput = {
  candidate: AtomicAuditCandidate
}

export type AtomicOrderCommittedResult = {
  customerId: string
  orderId: string
  orderNumber: string
  invoiceId: string
  invoiceNumber: string
  status: string
  subtotal: string
  discount: string
  tax: string
  total: string
  itemsCount: number
  responseVersion: string
  responseHash: string
}

export type IdempotencyCommitStageOutput = {
  committedResult: AtomicOrderCommittedResult
}

export type OutboxStageOutput = {
  candidates: AtomicOutboxCandidate[]
}

export type AtomicOrderStageOutputs = {
  authorization: AuthorizationStageOutput
  customer: CustomerStageOutput
  idempotency: IdempotencyStageOutput
  financial_quote: FinancialQuoteStageOutput
  inventory_validation: InventoryValidationStageOutput
  number_allocation: NumberAllocationStageOutput
  order_creation: OrderCreationStageOutput
  invoice_creation: InvoiceCreationStageOutput
  snapshot_mapping: SnapshotMappingStageOutput
  inventory_mutation: InventoryMutationStageOutput
  payment_snapshot: PaymentSnapshotStageOutput
  audit: AuditStageOutput
  idempotency_commit: IdempotencyCommitStageOutput
  outbox: OutboxStageOutput
}

export type AtomicOrderPipelineState = {
  intent: AtomicOrderIntent
  outputs: Partial<AtomicOrderStageOutputs>
}

export type AtomicOrderStageLog = {
  correlationId: string
  engineVersion: typeof ATOMIC_ORDER_ENGINE_VERSION
  stage: AtomicOrderStageName
  event: 'started' | 'completed' | 'failed' | 'rollback_started' | 'rollback_completed'
  durationMs?: number
  code?: AtomicOrderErrorCode
}

export type AtomicOrderLogger = (entry: AtomicOrderStageLog) => void

export type AtomicOrderRollback = () => void | Promise<void>

export type AtomicOrderStageContext = {
  correlationId: string
  signal: AbortSignal
  registerRollback: (rollback: AtomicOrderRollback) => void
}

export type AtomicOrderStageHandler<Name extends AtomicOrderStageName> = (
  state: Readonly<AtomicOrderPipelineState>,
  context: AtomicOrderStageContext
) => Promise<AtomicOrderStageOutputs[Name]>

export type AtomicOrderStageHandlers = {
  [Name in AtomicOrderStageName]: AtomicOrderStageHandler<Name>
}

export type AtomicOrderPipelineResult = {
  engineVersion: typeof ATOMIC_ORDER_ENGINE_VERSION
  correlationId: string
  state: AtomicOrderPipelineState
  stageDurationsMs: Partial<Record<AtomicOrderStageName, number>>
}

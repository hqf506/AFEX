import 'server-only'

export const NUMBER_ALLOCATOR_VERSION = 'branch-monthly-row-lock-v1' as const
export const NUMBER_LOCK_STRATEGY = 'sequence_row_for_update' as const

export type BranchNumberingConfiguration = {
  tenantId: string
  branchId: string
  branchPrefix: string | null
}

export type NumberAllocationCandidate = {
  tenantId: string
  branchId: string
  branchPrefix: string
  transactionTimestamp: string
  sequenceMonth: string
  sequenceValue: null
  orderNumber: null
  invoiceNumber: null
  allocatorVersion: typeof NUMBER_ALLOCATOR_VERSION
  lockStrategy: typeof NUMBER_LOCK_STRATEGY
  allocationStatus: 'pending_database_allocation'
  idempotencyCommandId: string | null
  idempotencyKeyHash: string
  correlationId: string
}

export function buildNumberAllocationCandidate(input: {
  tenantId: string
  branchId: string
  configuration: BranchNumberingConfiguration
  transactionTimestamp: string
  idempotencyCommandId: string | null
  idempotencyKeyHash: string
  correlationId: string
}): NumberAllocationCandidate {
  if (
    input.configuration.tenantId !== input.tenantId ||
    input.configuration.branchId !== input.branchId
  ) {
    throw new TypeError('NUMBER_CONFIGURATION_MISSING')
  }
  const branchPrefix = input.configuration.branchPrefix?.trim() || ''
  if (!/^\d{2}$/.test(branchPrefix)) {
    throw new TypeError('NUMBER_PREFIX_INVALID')
  }
  const timestamp = new Date(input.transactionTimestamp)
  if (Number.isNaN(timestamp.getTime())) {
    throw new TypeError('NUMBER_CONFIGURATION_MISSING')
  }

  return {
    tenantId: input.tenantId,
    branchId: input.branchId,
    branchPrefix,
    transactionTimestamp: timestamp.toISOString(),
    sequenceMonth: `${timestamp.toISOString().slice(0, 7)}-01`,
    sequenceValue: null,
    orderNumber: null,
    invoiceNumber: null,
    allocatorVersion: NUMBER_ALLOCATOR_VERSION,
    lockStrategy: NUMBER_LOCK_STRATEGY,
    allocationStatus: 'pending_database_allocation',
    idempotencyCommandId: input.idempotencyCommandId,
    idempotencyKeyHash: input.idempotencyKeyHash,
    correlationId: input.correlationId,
  }
}

import 'server-only'

import {
  ATOMIC_ORDER_ENGINE_VERSION,
  AtomicOrderError,
  type AtomicOrderIntent,
  type AuthorizationStageOutput,
  type CustomerStageOutput,
  type FinancialQuoteStageOutput,
  type IdempotencyStageOutput,
  type InventoryValidationStageOutput,
  type NumberAllocationStageOutput,
} from '@/lib/atomic-order/contracts'
import {
  canonicalJson,
  sha256Hex,
} from '@/lib/idempotency/core'
import type { InventoryTrackingMode } from '@/lib/inventory/core'

export const ATOMIC_PERSISTENCE_CONTRACT_VERSION =
  'atomic-persistence-v1' as const
export const PAYMENT_RULE_VERSION = 'payment-rules-v1' as const
export const COMMITTED_SNAPSHOT_CANDIDATE_VERSION =
  'atomic-committed-snapshot-candidate-v1' as const

export type PersistenceFieldTrust =
  | 'trusted_context'
  | 'validated_intent'
  | 'database_generated'
  | 'derived_authoritative'
  | 'compatibility_only'

export type CustomerPersistenceMode =
  | 'reuse_existing'
  | 'create_new'
  | 'update_existing'
  | 'no_customer'

export type CustomerPersistenceIntent = {
  mode: CustomerPersistenceMode
  tenantId: string
  branchOriginId: string
  existingCustomerId: string | null
  normalizedPhone: string | null
  displayPhone: string | null
  name: string | null
  email: string | null
  address: string | null
  notes: string | null
  expectedRecordVersion: number | null
  allowedUpdateFields: readonly ['name', 'email', 'address', 'notes']
  conflictBehavior: 'reject_without_merge'
  persistenceStatus: 'pending_database_transaction'
}

export type OrderPersistenceCandidate = {
  tenantId: string
  branchId: string
  customerId: null
  orderNumber: null
  status: 'in_progress'
  createdByUserId: string
  createdByPosEmployeeId: string | null
  idempotencyCommandId: string | null
  idempotencyKeyHash: string
  financialEngineVersion: string
  correlationId: string
  sourceChannel: 'pos'
  createdAt: string
  cancellationRestoresInventory: true
  fieldTrust: {
    tenantId: 'trusted_context'
    branchId: 'trusted_context'
    customerId: 'database_generated'
    orderNumber: 'database_generated'
    status: 'derived_authoritative'
    createdByUserId: 'trusted_context'
    createdByPosEmployeeId: 'trusted_context'
    idempotencyKeyHash: 'derived_authoritative'
    financialEngineVersion: 'derived_authoritative'
    correlationId: 'trusted_context'
    sourceChannel: 'derived_authoritative'
    createdAt: 'trusted_context'
  }
}

export type InvoicePersistenceCandidate = {
  tenantId: string
  branchId: string
  orderId: null
  customerId: null
  invoiceNumber: null
  currency: 'SAR'
  subtotal: string
  discountId: string | null
  discountName: string | null
  discountType: 'percentage' | 'fixed' | null
  discountValue: string | null
  discountAmount: string
  taxableSubtotal: string
  vatSettingId: string | null
  vatRate: string
  vatAmount: string
  total: string
  paymentMethod: string
  paymentStatus: 'paid' | 'pending'
  cashReceived: string
  remainingFromCustomer: string
  cashChange: string
  requestFingerprint: string
  requestFingerprintVersion: string
  quoteFingerprint: string
  quoteVersion: string
  financialEngineVersion: string
  ruleVersions: FinancialQuoteStageOutput['quote']['ruleVersions']
  snapshotVersion: string
  snapshotHashCandidate: string
  sourceQuoteReference: string
  snapshotComplete: boolean
  completenessReasons: FinancialQuoteStageOutput['snapshotCandidate']['reasons']
  financialRecordClassification: 'authoritative_after_commit'
}

export type InvoiceItemPersistenceCandidate = {
  line: number
  catalogItemId: string
  nameSnapshot: string
  categorySnapshot: string | null
  typeSnapshot: 'product' | 'service'
  quantity: number
  unitPrice: string
  priceSource: 'branch_override' | 'catalog_default'
  sourceBranchPriceId: string | null
  sourceCatalogUpdatedAt: string
  sourceBranchPriceUpdatedAt: string | null
  grossAmount: string
  discountAllocation: string
  taxableAmount: string
  costSnapshot: string | null
  profitSnapshot: string | null
  costSnapshotStatus: 'complete' | 'missing'
  costSnapshotVersion: 'catalog-cost-v1'
  inventoryTrackingMode: InventoryTrackingMode
  inventoryMovementCorrelationReference: string | null
}

export type PaymentSnapshotCandidate = {
  paymentMethod: 'cash' | 'card' | 'transfer' | 'mada' | 'visa' | 'on_delivery'
  paymentStatus: 'paid' | 'pending'
  amountTendered: string | null
  cashReceived: string
  remainingFromCustomer: string
  cashChange: string
  paymentRuleVersion: typeof PAYMENT_RULE_VERSION
  persistenceStatus: 'pending_database_transaction'
}

export type AtomicCommittedSnapshotCandidate = {
  candidateVersion: typeof COMMITTED_SNAPSHOT_CANDIDATE_VERSION
  candidateStatus: 'pending_database_commit'
  authorization: {
    tenantId: string
    branchId: string
    actor: AuthorizationStageOutput['actor']
  }
  customer: CustomerPersistenceIntent
  numbering: NumberAllocationStageOutput
  order: OrderPersistenceCandidate
  invoice: InvoicePersistenceCandidate
  invoiceItems: InvoiceItemPersistenceCandidate[]
  financialSnapshot: FinancialQuoteStageOutput['snapshot']
  inventorySnapshots: InventoryValidationStageOutput['snapshotCandidates']
  payment: PaymentSnapshotCandidate
  requestFingerprint: string
  quoteFingerprint: string
  financialSnapshotHashCandidate: string
  inventorySnapshotHashes: string[]
  correlationId: string
  engineVersions: {
    atomic: typeof ATOMIC_ORDER_ENGINE_VERSION
    financial: string
    inventory: string
    numberAllocator: string
  }
  complete: boolean
  completenessReasons: FinancialQuoteStageOutput['snapshotCandidate']['reasons']
  candidateHash: string
}

export function buildCustomerPersistenceIntent(input: {
  intent: AtomicOrderIntent
  authorization: AuthorizationStageOutput
  customer: CustomerStageOutput
}): CustomerPersistenceIntent {
  const hasCustomerInput = Boolean(
    input.intent.customer.customerId ||
      input.intent.customer.phone ||
      input.intent.customer.name
  )
  const mode: CustomerPersistenceMode = !hasCustomerInput
    ? 'no_customer'
    : input.customer.mode === 'existing'
      ? 'reuse_existing'
      : 'create_new'

  return {
    mode,
    tenantId: input.authorization.tenantId,
    branchOriginId: input.authorization.branchId,
    existingCustomerId: input.customer.customerId,
    normalizedPhone: hasCustomerInput
      ? input.customer.normalizedPhone
      : null,
    displayPhone: input.intent.customer.phone || null,
    name: input.intent.customer.name,
    email: input.intent.customer.email,
    address: null,
    notes: input.intent.customer.notes,
    expectedRecordVersion: input.customer.expectedRecordVersion,
    allowedUpdateFields: ['name', 'email', 'address', 'notes'],
    conflictBehavior: 'reject_without_merge',
    persistenceStatus: 'pending_database_transaction',
  }
}

function normalizePaymentMethod(
  value: string
): PaymentSnapshotCandidate['paymentMethod'] {
  if (value === 'cod') return 'on_delivery'
  if (
    value === 'cash' ||
    value === 'card' ||
    value === 'transfer' ||
    value === 'mada' ||
    value === 'visa' ||
    value === 'on_delivery'
  ) {
    return value
  }
  throw new AtomicOrderError(
    'PAYMENT_SNAPSHOT_INVALID',
    'payment_snapshot',
    false,
    'Payment method is not supported by the persistence contract'
  )
}

export function buildPaymentSnapshotCandidate(
  financial: FinancialQuoteStageOutput
): PaymentSnapshotCandidate {
  const paymentMethod = normalizePaymentMethod(
    financial.snapshot.paymentMethod
  )
  const paymentStatus =
    paymentMethod === 'transfer' || paymentMethod === 'on_delivery'
      ? 'pending'
      : 'paid'
  const candidate: PaymentSnapshotCandidate = {
    paymentMethod,
    paymentStatus,
    amountTendered: financial.request.amountTendered,
    cashReceived: financial.snapshot.cashReceived,
    remainingFromCustomer: financial.snapshot.remainingFromCustomer,
    cashChange: financial.snapshot.cashChange,
    paymentRuleVersion: PAYMENT_RULE_VERSION,
    persistenceStatus: 'pending_database_transaction',
  }
  const total = parseMoney(financial.snapshot.total)
  const received = parseMoney(candidate.cashReceived)
  const remaining = parseMoney(candidate.remainingFromCustomer)
  const change = parseMoney(candidate.cashChange)
  const invalid =
    received < BigInt(0) ||
    remaining < BigInt(0) ||
    change < BigInt(0) ||
    ((paymentMethod === 'card' ||
      paymentMethod === 'mada' ||
      paymentMethod === 'visa') &&
      (received !== total ||
        remaining !== BigInt(0) ||
        change !== BigInt(0))) ||
    (paymentMethod === 'transfer' &&
      (received !== BigInt(0) ||
        remaining !== total ||
        change !== BigInt(0))) ||
    (paymentMethod === 'on_delivery' &&
      (received > total ||
        remaining !== total - received ||
        change !== BigInt(0))) ||
    (paymentMethod === 'cash' &&
      (remaining !== (total > received ? total - received : BigInt(0)) ||
        change !== (received > total ? received - total : BigInt(0))))
  if (invalid) {
    throw new AtomicOrderError(
      'PAYMENT_SNAPSHOT_INVALID',
      'payment_snapshot',
      false,
      'Payment values do not satisfy the frozen payment invariants'
    )
  }
  return candidate
}

function parseMoney(value: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value)
  if (!match) {
    throw new AtomicOrderError(
      'SNAPSHOT_CONTRACT_MISMATCH',
      'snapshot_mapping',
      false,
      'Financial snapshot contains a non-canonical money value'
    )
  }
  return BigInt(match[1]) * BigInt(100) +
    BigInt((match[2] || '').padEnd(2, '0'))
}

function sumMoney(values: string[]) {
  return values.reduce((total, value) => total + parseMoney(value), BigInt(0))
}

export function buildAtomicCommittedSnapshotCandidate(input: {
  intent: AtomicOrderIntent
  authorization: AuthorizationStageOutput
  customer: CustomerStageOutput
  idempotency: IdempotencyStageOutput
  financial: FinancialQuoteStageOutput
  inventory: InventoryValidationStageOutput
  numbering: NumberAllocationStageOutput
  correlationId: string
}): AtomicCommittedSnapshotCandidate {
  if (
    input.idempotency.command.tenantId !== input.authorization.tenantId ||
    input.idempotency.command.branchId !== input.authorization.branchId ||
    input.numbering.tenantId !== input.authorization.tenantId ||
    input.numbering.branchId !== input.authorization.branchId ||
    input.financial.quote.tenantId !== input.authorization.tenantId ||
    input.financial.quote.branchId !== input.authorization.branchId
  ) {
    throw new AtomicOrderError(
      'SNAPSHOT_CONTRACT_MISMATCH',
      'snapshot_mapping',
      false,
      'Atomic persistence scope contracts do not agree'
    )
  }

  const customer = buildCustomerPersistenceIntent(input)
  const payment = buildPaymentSnapshotCandidate(input.financial)
  const inventoryByItem = new Map(
    input.inventory.requirements.map((entry) => [
      entry.catalogItemId,
      entry,
    ])
  )
  const financialLineEvidence = new Map(
    input.financial.snapshotCandidate.lines.map((entry) => [
      entry.line,
      entry,
    ])
  )
  const invoiceItems = [...input.financial.quote.items]
    .sort((left, right) => left.line - right.line)
    .map((item) => {
      const inventory = inventoryByItem.get(item.catalogItemId)
      const evidence = financialLineEvidence.get(item.line)
      if (!inventory || !evidence) {
        throw new AtomicOrderError(
          'SNAPSHOT_CONTRACT_MISMATCH',
          'snapshot_mapping',
          false,
          'Financial and inventory line contracts do not agree'
        )
      }
      return {
        line: item.line,
        catalogItemId: item.catalogItemId,
        nameSnapshot: item.nameSnapshot,
        categorySnapshot: item.categorySnapshot,
        typeSnapshot: item.typeSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        priceSource: item.priceSource,
        sourceBranchPriceId: item.sourceBranchPriceId,
        sourceCatalogUpdatedAt: item.sourceCatalogUpdatedAt,
        sourceBranchPriceUpdatedAt: item.sourceBranchPriceUpdatedAt,
        grossAmount: item.grossLineAmount,
        discountAllocation: item.discountAmount,
        taxableAmount: item.taxableLineAmount,
        costSnapshot: evidence.costSnapshot,
        profitSnapshot: evidence.profitSnapshot,
        costSnapshotStatus:
          evidence.costSnapshot === null ? 'missing' as const : 'complete' as const,
        costSnapshotVersion: 'catalog-cost-v1' as const,
        inventoryTrackingMode: inventory.trackingMode,
        inventoryMovementCorrelationReference:
          inventory.trackingMode === 'tracked_product'
            ? input.correlationId
            : null,
      }
    })

  if (
    sumMoney(invoiceItems.map((item) => item.grossAmount)) !==
      parseMoney(input.financial.snapshot.subtotal) ||
    sumMoney(invoiceItems.map((item) => item.discountAllocation)) !==
      parseMoney(input.financial.snapshot.discountAmount) ||
    sumMoney(invoiceItems.map((item) => item.taxableAmount)) !==
      parseMoney(input.financial.snapshot.taxableSubtotal)
  ) {
    throw new AtomicOrderError(
      'SNAPSHOT_CONTRACT_MISMATCH',
      'snapshot_mapping',
      false,
      'Invoice line financial totals do not match the invoice header'
    )
  }

  for (const requirement of input.inventory.requirements) {
    const financialQuantity = invoiceItems
      .filter((item) => item.catalogItemId === requirement.catalogItemId)
      .reduce((total, item) => total + item.quantity, 0)
    if (String(financialQuantity) !== requirement.requestedQuantity) {
      throw new AtomicOrderError(
        'SNAPSHOT_CONTRACT_MISMATCH',
        'snapshot_mapping',
        false,
        'Financial lines and inventory requirements have different quantities'
      )
    }
  }

  const order: OrderPersistenceCandidate = {
    tenantId: input.authorization.tenantId,
    branchId: input.authorization.branchId,
    customerId: null,
    orderNumber: null,
    status: 'in_progress',
    createdByUserId: input.authorization.authorization.user.id,
    createdByPosEmployeeId:
      input.authorization.actor.type === 'pos_employee'
        ? input.authorization.actor.id
        : null,
    idempotencyCommandId: input.idempotency.commandId,
    idempotencyKeyHash: input.idempotency.command.keyHash,
    financialEngineVersion:
      input.financial.snapshot.financialEngineVersion,
    correlationId: input.correlationId,
    sourceChannel: 'pos',
    createdAt: input.numbering.transactionTimestamp,
    cancellationRestoresInventory: true,
    fieldTrust: {
      tenantId: 'trusted_context',
      branchId: 'trusted_context',
      customerId: 'database_generated',
      orderNumber: 'database_generated',
      status: 'derived_authoritative',
      createdByUserId: 'trusted_context',
      createdByPosEmployeeId: 'trusted_context',
      idempotencyKeyHash: 'derived_authoritative',
      financialEngineVersion: 'derived_authoritative',
      correlationId: 'trusted_context',
      sourceChannel: 'derived_authoritative',
      createdAt: 'trusted_context',
    },
  }
  const snapshot = input.financial.snapshot
  const invoice: InvoicePersistenceCandidate = {
    tenantId: input.authorization.tenantId,
    branchId: input.authorization.branchId,
    orderId: null,
    customerId: null,
    invoiceNumber: null,
    currency: snapshot.currencyCode,
    subtotal: snapshot.subtotal,
    discountId: snapshot.discountIdSnapshot,
    discountName: snapshot.discountNameSnapshot,
    discountType: snapshot.discountTypeSnapshot,
    discountValue: snapshot.discountValueSnapshot,
    discountAmount: snapshot.discountAmount,
    taxableSubtotal: snapshot.taxableSubtotal,
    vatSettingId: snapshot.vatSettingIdSnapshot,
    vatRate: snapshot.vatRateSnapshot,
    vatAmount: snapshot.vatAmount,
    total: snapshot.total,
    paymentMethod: payment.paymentMethod,
    paymentStatus: payment.paymentStatus,
    cashReceived: payment.cashReceived,
    remainingFromCustomer: payment.remainingFromCustomer,
    cashChange: payment.cashChange,
    requestFingerprint: snapshot.requestFingerprint,
    requestFingerprintVersion: snapshot.requestFingerprintVersion,
    quoteFingerprint: snapshot.quoteFingerprint,
    quoteVersion: snapshot.quoteVersion,
    financialEngineVersion: snapshot.financialEngineVersion,
    ruleVersions: snapshot.ruleVersions,
    snapshotVersion: snapshot.snapshotVersion,
    snapshotHashCandidate: snapshot.snapshotHash,
    sourceQuoteReference: input.financial.quote.quoteFingerprint,
    snapshotComplete: input.financial.snapshotCandidate.complete,
    completenessReasons: input.financial.snapshotCandidate.reasons,
    financialRecordClassification: 'authoritative_after_commit',
  }

  const withoutHash = {
    candidateVersion: COMMITTED_SNAPSHOT_CANDIDATE_VERSION,
    candidateStatus: 'pending_database_commit' as const,
    authorization: {
      tenantId: input.authorization.tenantId,
      branchId: input.authorization.branchId,
      actor: input.authorization.actor,
    },
    customer,
    numbering: input.numbering,
    order,
    invoice,
    invoiceItems,
    financialSnapshot: snapshot,
    inventorySnapshots: input.inventory.snapshotCandidates,
    payment,
    requestFingerprint: snapshot.requestFingerprint,
    quoteFingerprint: snapshot.quoteFingerprint,
    financialSnapshotHashCandidate: snapshot.snapshotHash,
    inventorySnapshotHashes: input.inventory.snapshotCandidates
      .map((entry) => entry.snapshotHash)
      .sort(),
    correlationId: input.correlationId,
    engineVersions: {
      atomic: ATOMIC_ORDER_ENGINE_VERSION,
      financial: snapshot.financialEngineVersion,
      inventory:
        input.inventory.snapshotCandidates[0]?.inventoryEngineVersion ||
        'inventory-engine-v2-r1',
      numberAllocator: input.numbering.allocatorVersion,
    },
    complete:
      input.financial.snapshotCandidate.complete &&
      input.inventory.complete,
    completenessReasons: [...input.financial.snapshotCandidate.reasons]
      .sort(
        (left, right) =>
          left.line - right.line ||
          left.code.localeCompare(right.code) ||
          left.catalogItemId.localeCompare(right.catalogItemId)
      )
      .filter(
        (reason, index, reasons) =>
          index === 0 ||
          canonicalJson(reason) !== canonicalJson(reasons[index - 1])
      ),
  }

  return {
    ...withoutHash,
    candidateHash: sha256Hex(canonicalJson(withoutHash)),
  }
}

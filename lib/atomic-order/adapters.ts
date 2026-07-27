import 'server-only'

import type { AuthorizationContext } from '@/lib/authorization-context'
import {
  FinancialCoreError,
  decimal,
  decimalToMoneyString,
  multiplyDecimal,
  sha256Financial,
  subtractDecimal,
} from '@/lib/financial/core'
import {
  buildFinancialQuoteRequest,
  type FinancialConfiguration,
  type FinancialQuoteResolution,
} from '@/lib/financial/service'
import {
  AtomicOrderError,
  type AtomicOrderCommittedResult,
  type AtomicOrderPipelineState,
  type AtomicOrderStageHandler,
  type AuthorizationStageOutput,
  type CustomerStageOutput,
  type FinancialQuoteStageOutput,
  type IdempotencyStageOutput,
  type InventoryValidationStageOutput,
} from '@/lib/atomic-order/contracts'
import {
  prepareCustomerIdentity,
  type CustomerIdentity,
} from '@/lib/customers'
import type {
  createIdempotencyService,
  IdempotencyReplayResult,
} from '@/lib/idempotency/service'
import {
  deriveInventoryRequirements,
  InventoryCoreError,
  validateInventoryStock,
  type InventoryCatalogEvidence,
  type InventoryStockEvidence,
} from '@/lib/inventory/core'
import {
  buildNumberAllocationCandidate,
  type BranchNumberingConfiguration,
} from '@/lib/numbering/core'
import {
  buildAtomicAuditCandidate,
  buildAtomicOutboxCandidates,
  type AtomicOutboxPayload,
  type AtomicOutboxEventType,
} from '@/lib/atomic-order/application'

type IdempotencyService = ReturnType<typeof createIdempotencyService>
type FinancialQuoteService = {
  resolve(input: {
    request: ReturnType<typeof buildFinancialQuoteRequest>
    configuration: FinancialConfiguration
    requestFingerprint?: string
  }): Promise<FinancialQuoteResolution>
}

function requireOutput<Name extends keyof AtomicOrderPipelineState['outputs']>(
  state: Readonly<AtomicOrderPipelineState>,
  name: Name
): NonNullable<AtomicOrderPipelineState['outputs'][Name]> {
  const output = state.outputs[name]

  if (!output) {
    throw new AtomicOrderError(
      'STAGE_DEPENDENCY_MISSING',
      name,
      false,
      `Required atomic order output is missing: ${name}`
    )
  }

  return output as NonNullable<AtomicOrderPipelineState['outputs'][Name]>
}

export function createAuthorizationStageAdapter(input: {
  resolve: (
    state: Readonly<AtomicOrderPipelineState>
  ) => AuthorizationContext | Promise<AuthorizationContext>
}): AtomicOrderStageHandler<'authorization'> {
  return async (state) => {
    const authorization = await input.resolve(state)
    const tenantId = authorization.tenantId
    const branchId =
      authorization.activeBranchId || state.intent.financial.branchId

    if (
      !tenantId ||
      !branchId ||
      !authorization.can('orders:write') ||
      !authorization.canAccessBranch(branchId) ||
      tenantId !== state.intent.financial.tenantId ||
      branchId !== state.intent.financial.branchId
    ) {
      throw new AtomicOrderError(
        'AUTHORIZATION_REJECTED',
        'authorization',
        false,
        'Atomic order authorization context rejected the command'
      )
    }

    const posEmployee = authorization.posEmployee
    const actor: AuthorizationStageOutput['actor'] = posEmployee
      ? { type: 'pos_employee', id: posEmployee.id }
      : { type: 'user', id: authorization.user.id }

    return {
      authorization,
      tenantId,
      branchId,
      actor,
    }
  }
}

export function createCustomerStageAdapter(input: {
  lookup: (input: {
    identity: CustomerIdentity
    tenantId: string
    branchId: string
    requestedCustomerId: string | null
  }) => Promise<{
    customerId: string
    recordVersion: number | null
  } | null>
}): AtomicOrderStageHandler<'customer'> {
  return async (state) => {
    const authorization = requireOutput(state, 'authorization')
    const identity = prepareCustomerIdentity(state.intent.customer.phone)

    if (!identity.ok) {
      throw new AtomicOrderError(
        'CUSTOMER_RESOLUTION_FAILED',
        'customer',
        false,
        identity.code
      )
    }

    let existing: Awaited<ReturnType<typeof input.lookup>>
    try {
      existing = await input.lookup({
        identity: identity.identity,
        tenantId: authorization.tenantId,
        branchId: authorization.branchId,
        requestedCustomerId: state.intent.customer.customerId,
      })
    } catch (error) {
      throw new AtomicOrderError(
        'CUSTOMER_RESOLUTION_FAILED',
        'customer',
        true,
        'Customer Engine lookup failed',
        { cause: error }
      )
    }

    const output: CustomerStageOutput = existing
      ? {
          mode: 'existing',
          customerId: existing.customerId,
          normalizedPhone: identity.identity.phoneNormalized,
          expectedRecordVersion: existing.recordVersion,
        }
      : {
          mode: 'create',
          customerId: null,
          normalizedPhone: identity.identity.phoneNormalized,
          expectedRecordVersion: null,
        }

    return output
  }
}

function mapReplayResult(
  result: IdempotencyReplayResult
): AtomicOrderCommittedResult {
  const legacyResult = {
    customerId: result.customer_id,
    orderId: result.order_id,
    orderNumber: result.order_number,
    invoiceId: result.invoice_id,
    invoiceNumber: result.invoice_number,
    status: result.status,
    subtotal: String(result.subtotal ?? ''),
    discount: String(result.discount ?? ''),
    tax: String(result.tax ?? ''),
    total: String(result.total ?? ''),
    itemsCount: result.itemsCount ?? 0,
    responseVersion: 'legacy-order-response-v1',
  }

  return {
    ...legacyResult,
    responseHash: sha256Financial(legacyResult),
  }
}

export function createIdempotencyStageAdapter(input: {
  service: IdempotencyService
}): AtomicOrderStageHandler<'idempotency'> {
  return async (state) => {
    const authorization = requireOutput(state, 'authorization')
    const customer = requireOutput(state, 'customer')
    const command = input.service.createCommand({
      clientKey: state.intent.clientIdempotencyKey,
      commandType: state.intent.commandType,
      intent: {
        tenantId: authorization.tenantId,
        branchId: authorization.branchId,
        actor: authorization.actor,
        requestVersion: state.intent.financial.requestVersion,
        customerId: customer.customerId,
        items: state.intent.financial.items,
        discountId: state.intent.financial.discountId,
        paymentMethod: state.intent.financial.paymentMethod,
        amountTendered: state.intent.financial.amountTendered,
        note: state.intent.financial.note,
        customer: {
          mode: customer.mode,
          id: customer.customerId,
          phoneNormalized: customer.normalizedPhone,
          expectedRecordVersion: customer.expectedRecordVersion,
        },
      },
    })
    const resolution = await input.service.resolveBeforeExecution({
      clientKey: state.intent.clientIdempotencyKey,
      command,
    })

    if (resolution.kind === 'replay') {
      const output: IdempotencyStageOutput = {
        command,
        commandId: null,
        disposition: 'replay',
        replayResult: mapReplayResult(resolution.result),
      }
      return output
    }

    if (resolution.kind === 'continue') {
      return {
        command,
        commandId: null,
        disposition: 'proceed',
        replayResult: null,
      }
    }

    if (resolution.kind === 'in_progress') {
      throw new AtomicOrderError(
        'IDEMPOTENCY_IN_PROGRESS',
        'idempotency',
        true,
        resolution.code
      )
    }

    throw new AtomicOrderError(
      'IDEMPOTENCY_CONFLICT',
      'idempotency',
      false,
      resolution.code
    )
  }
}

export function createFinancialQuoteStageAdapter(input: {
  service: FinancialQuoteService
  resolveConfiguration: (input: {
    tenantId: string
    branchId: string
    catalogItemIds: string[]
    discountId: string | null
  }) => Promise<FinancialConfiguration>
}): AtomicOrderStageHandler<'financial_quote'> {
  return async (state) => {
    const authorization = requireOutput(state, 'authorization')
    const customer = requireOutput(state, 'customer')
    const idempotency = requireOutput(state, 'idempotency')
    const financialIntent = state.intent.financial
    const request = buildFinancialQuoteRequest({
      tenantId: authorization.tenantId,
      branchId: authorization.branchId,
      actor: authorization.actor,
      customerId: customer.customerId,
      items: financialIntent.items.map((item) => ({
        catalogItemId: item.catalogItemId,
        quantity: item.quantity,
      })),
      discountId: financialIntent.discountId,
      paymentMethod: financialIntent.paymentMethod,
      amountTendered: financialIntent.amountTendered,
      note: financialIntent.note,
    })

    let resolution: FinancialQuoteResolution
    try {
      const configuration = await input.resolveConfiguration({
        tenantId: authorization.tenantId,
        branchId: authorization.branchId,
        catalogItemIds: request.items.map((item) => item.catalogItemId),
        discountId: request.discountId,
      })
      resolution = await input.service.resolve({
        request,
        configuration,
        requestFingerprint: idempotency.command.requestFingerprint,
      })
    } catch (error) {
      throw new AtomicOrderError(
        'FINANCIAL_QUOTE_REJECTED',
        'financial_quote',
        error instanceof FinancialCoreError && error.code === 'QUOTE_STALE',
        error instanceof FinancialCoreError
          ? error.code
          : 'Financial Quote Service failed',
        { cause: error }
      )
    }

    if (
      resolution.quote.requestFingerprint !==
      idempotency.command.requestFingerprint
    ) {
      throw new AtomicOrderError(
        'FINANCIAL_QUOTE_REJECTED',
        'financial_quote',
        false,
        'QUOTE_FINGERPRINT_CONFLICT'
      )
    }

    const reasons: FinancialQuoteStageOutput['snapshotCandidate']['reasons'] = []
    const lines = resolution.quote.items.map((item) => {
      const sourceEvidenceComplete =
        Boolean(item.sourceCatalogUpdatedAt) &&
        (item.priceSource === 'catalog_default' ||
          Boolean(
            item.sourceBranchPriceId &&
              item.sourceBranchPriceUpdatedAt
          ))
      if (!sourceEvidenceComplete) {
        reasons.push({
          code: 'PRICE_SOURCE_EVIDENCE_MISSING',
          line: item.line,
          catalogItemId: item.catalogItemId,
        })
      }
      if (item.costSnapshot === null) {
        reasons.push({
          code: 'COST_SNAPSHOT_MISSING',
          line: item.line,
          catalogItemId: item.catalogItemId,
        })
      }

      const profitSnapshot =
        item.costSnapshot === null
          ? null
          : decimalToMoneyString(
              subtractDecimal(
                decimal(item.taxableLineAmount),
                multiplyDecimal(
                  decimal(item.costSnapshot),
                  decimal(item.quantity)
                )
              )
            )

      return {
        line: item.line,
        catalogItemId: item.catalogItemId,
        costSnapshot: item.costSnapshot,
        profitSnapshot,
        sourceEvidenceComplete,
      }
    })
    const output: FinancialQuoteStageOutput = {
      request,
      quote: resolution.quote,
      snapshot: resolution.snapshot,
      snapshotCandidate: {
        complete: reasons.length === 0,
        reasons,
        paymentStatusIntent:
          request.paymentMethod === 'transfer' ? 'pending' : 'paid',
        lines,
      },
      source: resolution.source,
      shadowDifferences:
        resolution.source === 'legacy'
          ? resolution.shadowDifferences
          : [],
    }

    return output
  }
}

export function createInventoryValidationStageAdapter(input: {
  resolveCatalogEvidence: (input: {
    tenantId: string
    branchId: string
    catalogItemIds: string[]
  }) => Promise<InventoryCatalogEvidence[]>
  resolveStockEvidence: (input: {
    tenantId: string
    branchId: string
    catalogItemIds: string[]
  }) => Promise<InventoryStockEvidence[]>
}): AtomicOrderStageHandler<'inventory_validation'> {
  return async (state, context) => {
    const authorization = requireOutput(state, 'authorization')
    const financial = requireOutput(state, 'financial_quote')
    const catalogItemIds = [
      ...new Set(financial.quote.items.map((item) => item.catalogItemId)),
    ].sort()

    try {
      const catalogEvidence = await input.resolveCatalogEvidence({
        tenantId: authorization.tenantId,
        branchId: authorization.branchId,
        catalogItemIds,
      })
      const derived = deriveInventoryRequirements({
        tenantId: authorization.tenantId,
        branchId: authorization.branchId,
        quoteItems: financial.quote.items,
        catalogEvidence,
      })
      const trackedItemIds = derived
        .filter((entry) => entry.trackingMode === 'tracked_product')
        .map((entry) => entry.catalogItemId)
      const stockEvidence =
        trackedItemIds.length === 0
          ? []
          : await input.resolveStockEvidence({
              tenantId: authorization.tenantId,
              branchId: authorization.branchId,
              catalogItemIds: trackedItemIds,
            })
      const validated = validateInventoryStock({
        requirements: derived,
        stockEvidence,
        actor: authorization.actor,
        correlationId: context.correlationId,
      })
      const output: InventoryValidationStageOutput = {
        complete: true,
        ...validated,
      }
      return output
    } catch (error) {
      throw new AtomicOrderError(
        'INVENTORY_REJECTED',
        'inventory_validation',
        error instanceof InventoryCoreError &&
          error.code === 'INVENTORY_LOCK_TIMEOUT',
        error instanceof InventoryCoreError
          ? error.code
          : 'Inventory validation failed',
        { cause: error }
      )
    }
  }
}

export function createNumberAllocationStageAdapter(input: {
  resolveConfiguration: (input: {
    tenantId: string
    branchId: string
  }) => Promise<BranchNumberingConfiguration>
  transactionTimestamp: () => string
}): AtomicOrderStageHandler<'number_allocation'> {
  return async (state, context) => {
    const authorization = requireOutput(state, 'authorization')
    requireOutput(state, 'customer')
    const idempotency = requireOutput(state, 'idempotency')
    requireOutput(state, 'financial_quote')
    const inventory = requireOutput(state, 'inventory_validation')

    if (!inventory.complete) {
      throw new AtomicOrderError(
        'STAGE_DEPENDENCY_MISSING',
        'number_allocation',
        false,
        'Inventory validation is incomplete'
      )
    }

    try {
      const configuration = await input.resolveConfiguration({
        tenantId: authorization.tenantId,
        branchId: authorization.branchId,
      })
      return buildNumberAllocationCandidate({
        tenantId: authorization.tenantId,
        branchId: authorization.branchId,
        configuration,
        transactionTimestamp: input.transactionTimestamp(),
        idempotencyCommandId: idempotency.commandId,
        idempotencyKeyHash: idempotency.command.keyHash,
        correlationId: context.correlationId,
      })
    } catch (error) {
      const code =
        error instanceof TypeError &&
        (error.message === 'NUMBER_CONFIGURATION_MISSING' ||
          error.message === 'NUMBER_PREFIX_INVALID')
          ? error.message
          : 'NUMBER_ALLOCATION_FAILED'
      throw new AtomicOrderError(
        code,
        'number_allocation',
        false,
        code,
        { cause: error }
      )
    }
  }
}

export function createAuditStageAdapter(input: {
  transactionTimestamp: () => string
}): AtomicOrderStageHandler<'audit'> {
  return async (state, context) => {
    const authorization = requireOutput(state, 'authorization')
    const customer = requireOutput(state, 'customer')
    const financial = requireOutput(state, 'financial_quote')
    const order = requireOutput(state, 'order_creation')
    const invoice = requireOutput(state, 'invoice_creation')
    requireOutput(state, 'payment_snapshot')

    return {
      candidate: buildAtomicAuditCandidate({
        authorization,
        financial,
        correlationId: context.correlationId,
        orderId: order.orderId,
        invoiceId: invoice.invoiceId,
        customerId: customer.customerId,
        timestamp: input.transactionTimestamp(),
      }),
    }
  }
}

export function createOutboxStageAdapter(input: {
  transactionTimestamp: () => string
  events: (
    state: Readonly<AtomicOrderPipelineState>
  ) => Array<{
    eventType: AtomicOutboxEventType
    aggregateType: 'order' | 'invoice' | 'customer' | 'inventory'
    aggregateId?: string | null
    payload: AtomicOutboxPayload
  }>
}): AtomicOrderStageHandler<'outbox'> {
  return async (state, context) => {
    const authorization = requireOutput(state, 'authorization')
    requireOutput(state, 'audit')
    return {
      candidates: buildAtomicOutboxCandidates({
        correlationId: context.correlationId,
        tenantId: authorization.tenantId,
        branchId: authorization.branchId,
        timestamp: input.transactionTimestamp(),
        events: input.events(state),
      }),
    }
  }
}

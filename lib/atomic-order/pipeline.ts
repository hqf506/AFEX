import 'server-only'

import {
  ATOMIC_ORDER_ENGINE_VERSION,
  ATOMIC_ORDER_STAGE_DEFINITIONS,
  ATOMIC_ORDER_STAGE_ORDER,
  AtomicOrderError,
  type AtomicOrderErrorCode,
  type AtomicOrderIntent,
  type AtomicOrderLogger,
  type AtomicOrderPipelineResult,
  type AtomicOrderPipelineState,
  type AtomicOrderRollback,
  type AtomicOrderStageHandlers,
  type AtomicOrderStageName,
  type AtomicOrderStageOutputs,
} from '@/lib/atomic-order/contracts'

const STAGE_ERROR_CODES: Record<AtomicOrderStageName, AtomicOrderErrorCode> = {
  authorization: 'AUTHORIZATION_REJECTED',
  customer: 'CUSTOMER_RESOLUTION_FAILED',
  idempotency: 'IDEMPOTENCY_CONFLICT',
  financial_quote: 'FINANCIAL_QUOTE_REJECTED',
  inventory_validation: 'INVENTORY_REJECTED',
  number_allocation: 'NUMBER_ALLOCATION_FAILED',
  order_creation: 'ORDER_CREATION_FAILED',
  invoice_creation: 'INVOICE_CREATION_FAILED',
  snapshot_mapping: 'SNAPSHOT_MAPPING_FAILED',
  inventory_mutation: 'INVENTORY_MUTATION_FAILED',
  payment_snapshot: 'PAYMENT_SNAPSHOT_FAILED',
  audit: 'AUDIT_FAILED',
  idempotency_commit: 'IDEMPOTENCY_COMMIT_FAILED',
  outbox: 'OUTBOX_ENQUEUE_FAILED',
}

function now() {
  return performance.now()
}

function asAtomicOrderError(error: unknown, stage: AtomicOrderStageName) {
  if (error instanceof AtomicOrderError) return error

  return new AtomicOrderError(
    STAGE_ERROR_CODES[stage] || 'UNEXPECTED_STAGE_FAILURE',
    stage,
    false,
    `Atomic order stage failed: ${stage}`,
    { cause: error }
  )
}

function throwIfCancelled(signal: AbortSignal, stage: AtomicOrderStageName) {
  if (signal.aborted) {
    throw new AtomicOrderError(
      'PIPELINE_CANCELLED',
      stage,
      true,
      'Atomic order pipeline was cancelled',
      { cause: signal.reason }
    )
  }
}

function assertRequiredStage(
  state: AtomicOrderPipelineState,
  stage: AtomicOrderStageName
) {
  const required =
    ATOMIC_ORDER_STAGE_DEFINITIONS[stage].requiredPreviousStage

  if (required && state.outputs[required] === undefined) {
    throw new AtomicOrderError(
      'STAGE_DEPENDENCY_MISSING',
      stage,
      false,
      `Atomic order stage ${stage} requires completed stage ${required}`
    )
  }

  if (state.outputs[stage] !== undefined) {
    throw new AtomicOrderError(
      'STAGE_ORDER_INVALID',
      stage,
      false,
      `Atomic order stage ${stage} cannot execute more than once`
    )
  }
}

async function rollback(
  stack: Array<{ stage: AtomicOrderStageName; rollback: AtomicOrderRollback }>,
  correlationId: string,
  logger: AtomicOrderLogger
) {
  const failures: unknown[] = []

  for (const entry of [...stack].reverse()) {
    logger({
      correlationId,
      engineVersion: ATOMIC_ORDER_ENGINE_VERSION,
      stage: entry.stage,
      event: 'rollback_started',
    })

    try {
      await entry.rollback()
      logger({
        correlationId,
        engineVersion: ATOMIC_ORDER_ENGINE_VERSION,
        stage: entry.stage,
        event: 'rollback_completed',
      })
    } catch (error) {
      failures.push(error)
    }
  }

  if (failures.length > 0) {
    throw new AtomicOrderError(
      'ROLLBACK_FAILED',
      null,
      false,
      'One or more atomic order rollback handlers failed',
      { cause: failures }
    )
  }
}

export function createAtomicOrderPipeline(input: {
  handlers: AtomicOrderStageHandlers
  logger?: AtomicOrderLogger
}) {
  const logger: AtomicOrderLogger = input.logger || (() => undefined)

  return {
    async run(args: {
      intent: AtomicOrderIntent
      correlationId: string
      signal?: AbortSignal
    }): Promise<AtomicOrderPipelineResult> {
      const signal = args.signal || new AbortController().signal
      const state: AtomicOrderPipelineState = {
        intent: args.intent,
        outputs: {},
      }
      const rollbacks: Array<{
        stage: AtomicOrderStageName
        rollback: AtomicOrderRollback
      }> = []
      const stageDurationsMs: Partial<
        Record<AtomicOrderStageName, number>
      > = {}

      for (const stage of ATOMIC_ORDER_STAGE_ORDER) {
        const startedAt = now()

        try {
          throwIfCancelled(signal, stage)
          assertRequiredStage(state, stage)
          logger({
            correlationId: args.correlationId,
            engineVersion: ATOMIC_ORDER_ENGINE_VERSION,
            stage,
            event: 'started',
          })

          const output = await input.handlers[stage](state, {
            correlationId: args.correlationId,
            signal,
            registerRollback: (rollbackHandler) => {
              rollbacks.push({ stage, rollback: rollbackHandler })
            },
          })
          ;(state.outputs as Record<
            AtomicOrderStageName,
            AtomicOrderStageOutputs[AtomicOrderStageName]
          >)[stage] = output

          const durationMs = now() - startedAt
          stageDurationsMs[stage] = durationMs
          logger({
            correlationId: args.correlationId,
            engineVersion: ATOMIC_ORDER_ENGINE_VERSION,
            stage,
            event: 'completed',
            durationMs,
          })
        } catch (error) {
          const normalized = asAtomicOrderError(error, stage)
          logger({
            correlationId: args.correlationId,
            engineVersion: ATOMIC_ORDER_ENGINE_VERSION,
            stage,
            event: 'failed',
            durationMs: now() - startedAt,
            code: normalized.code,
          })

          try {
            await rollback(rollbacks, args.correlationId, logger)
          } catch (rollbackError) {
            throw rollbackError
          }

          throw normalized
        }
      }

      return {
        engineVersion: ATOMIC_ORDER_ENGINE_VERSION,
        correlationId: args.correlationId,
        state,
        stageDurationsMs,
      }
    },
  }
}

import 'server-only'

import { coreV2AtomicOrderEnabled } from '@/lib/core-v2-flags'
import {
  ATOMIC_ORDER_ENGINE_VERSION,
  AtomicOrderError,
  type AtomicOrderIntent,
  type AtomicOrderLogger,
  type AtomicOrderPipelineResult,
  type AtomicOrderStageHandlers,
} from '@/lib/atomic-order/contracts'
import { createAtomicOrderPipeline } from '@/lib/atomic-order/pipeline'

export const LEGACY_ORDER_CREATION_RPC =
  'create_invoice_with_items_safe' as const

export type LegacyOrderCreationAdapter<Input, Output> = {
  engineVersion: 'v1'
  rpcName: typeof LEGACY_ORDER_CREATION_RPC
  execute: (input: Input) => Promise<Output>
}

export function createLegacyOrderCreationAdapter<Input, Output>(
  execute: (input: Input) => Promise<Output>
): LegacyOrderCreationAdapter<Input, Output> {
  return {
    engineVersion: 'v1',
    rpcName: LEGACY_ORDER_CREATION_RPC,
    execute,
  }
}

export function isAtomicOrderCoreV2Enabled(explicit?: boolean) {
  return coreV2AtomicOrderEnabled(explicit)
}

export function createAtomicOrderFoundation(input: {
  handlers: AtomicOrderStageHandlers
  logger?: AtomicOrderLogger
  enabled?: boolean
}) {
  const enabled = isAtomicOrderCoreV2Enabled(input.enabled)
  const pipeline = createAtomicOrderPipeline({
    handlers: input.handlers,
    logger: input.logger,
  })

  return {
    engineVersion: ATOMIC_ORDER_ENGINE_VERSION,
    enabled,
    async execute(args: {
      intent: AtomicOrderIntent
      correlationId: string
      signal?: AbortSignal
    }): Promise<AtomicOrderPipelineResult> {
      if (!enabled) {
        throw new AtomicOrderError(
          'CORE_V2_DISABLED',
          null,
          false,
          'Core V2 atomic order pipeline is disabled'
        )
      }

      return pipeline.run(args)
    },
  }
}

export function createAtomicOrderStageLogger(
  sink: (entry: {
    correlationId: string
    engineVersion: string
    stage: string
    event: string
    durationMs?: number
    code?: string
  }) => void
): AtomicOrderLogger {
  return (entry) => {
    sink({
      correlationId: entry.correlationId,
      engineVersion: entry.engineVersion,
      stage: entry.stage,
      event: entry.event,
      durationMs: entry.durationMs,
      code: entry.code,
    })
  }
}

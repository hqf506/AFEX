import 'server-only'

export const CORE_V2_RUNTIME_STATES = [
  'LEGACY_ONLY',
  'SHADOW_VERIFY',
  'CORE_V2_CANARY',
  'CORE_V2_ACTIVE',
  'CORE_V2_PAUSED',
  'ROLLBACK_TO_LEGACY',
] as const

export type CoreV2RuntimeState = (typeof CORE_V2_RUNTIME_STATES)[number]

export const CORE_V2_RUNTIME_TRANSITION_INTENTIONS = Object.freeze({
  LEGACY_ONLY: ['SHADOW_VERIFY'],
  SHADOW_VERIFY: ['LEGACY_ONLY', 'CORE_V2_CANARY'],
  CORE_V2_CANARY: ['CORE_V2_ACTIVE', 'CORE_V2_PAUSED', 'ROLLBACK_TO_LEGACY'],
  CORE_V2_ACTIVE: ['CORE_V2_PAUSED', 'ROLLBACK_TO_LEGACY'],
  CORE_V2_PAUSED: ['CORE_V2_CANARY', 'CORE_V2_ACTIVE', 'ROLLBACK_TO_LEGACY'],
  ROLLBACK_TO_LEGACY: ['LEGACY_ONLY'],
} as const satisfies Record<CoreV2RuntimeState, readonly CoreV2RuntimeState[]>)

// A1 neither reads nor activates this state and introduces no Production default.
// SHADOW_VERIFY is read-only comparison only: no acquisition, dual write, or
// mutation of ledger, order, inventory, payment, or outbox state.
// ROLLBACK_TO_LEGACY affects eligible future routing only. It never deletes
// ledger history, rolls back committed commands, reverses durable side effects,
// or silently abandons already acquired/in-progress commands.

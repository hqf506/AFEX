import 'server-only'

export const COMMAND_DISPOSITIONS = [
  'created',
  'replay',
  'in_progress',
  'fingerprint_conflict',
] as const

export type CommandDisposition = (typeof COMMAND_DISPOSITIONS)[number]

export const LEGACY_PATH_MIGRATION_DISPOSITIONS = [
  'RETAIN_AS_IS',
  'WRAP_TEMPORARILY',
  'REPLACE_WITH_CORE_V2',
  'MOVE_SERVER_SIDE',
  'MOVE_BEHIND_RPC',
  'REMOVE_AS_DEAD_CODE',
  'DEFER_WITH_EXPLICIT_BLOCKER',
  'REQUIRES_ADDITIONAL_EVIDENCE',
] as const

export type LegacyPathMigrationDisposition =
  (typeof LEGACY_PATH_MIGRATION_DISPOSITIONS)[number]

export const COMMAND_DISPOSITION_SEMANTICS = Object.freeze({
  created: {
    externalBehavior: 'accepted_for_execution',
    retry: 'reuse_same_idempotency_key',
    replay: false,
    ledger: 'context_command_payload_created_atomically',
  },
  replay: {
    externalBehavior: 'return_stored_terminal_result',
    retry: 'do_not_execute_again',
    replay: true,
    ledger: 'existing_terminal_command_only',
  },
  in_progress: {
    externalBehavior: 'report_existing_nonterminal_command',
    retry: 'poll_or_retry_same_key_without_new_command',
    replay: false,
    ledger: 'existing_nonterminal_command_only',
  },
  fingerprint_conflict: {
    externalBehavior: 'reject_conflicting_payload',
    retry: 'use_same_payload_or_new_key_for_new_intent',
    replay: false,
    ledger: 'existing_command_only',
  },
} as const satisfies Record<
  CommandDisposition,
  {
    externalBehavior: string
    retry: string
    replay: boolean
    ledger: string
  }
>)

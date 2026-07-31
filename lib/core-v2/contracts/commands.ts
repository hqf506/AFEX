import 'server-only'

import type {
  ActorId,
  BranchId,
  CommandId,
  CorrelationId,
  LedgerId,
  TenantId,
} from './identities'
import type { DatabaseAuthoritativeAuthorizationContext } from './authorization'
import type {
  CanonicalFingerprintContract,
  CanonicalJsonBytes,
  IdempotencyIdentity,
} from './idempotency'

declare const commandTypeBrand: unique symbol

export const RECOGNIZED_COMMAND_TYPES = ['order.create'] as const
export type RecognizedCommandType = (typeof RECOGNIZED_COMMAND_TYPES)[number]
export type CommandType = string & {
  readonly [commandTypeBrand]: 'CommandType'
}

export const COMMAND_EXECUTION_STATES = [
  'reserved',
  'processing',
  'succeeded',
  'failed_retryable',
  'failed_final',
] as const

export type CommandExecutionState = (typeof COMMAND_EXECUTION_STATES)[number]

export type CommandIdentity = Readonly<{
  commandId: CommandId
  ledgerId: LedgerId
}>

export type CommandPayload = Readonly<{
  version: 'order-command-payload-v1'
  canonicalBytes: CanonicalJsonBytes
  fingerprint: CanonicalFingerprintContract
}>

export type CommandAuditMetadata = Readonly<{
  correlationId: CorrelationId
  actorId: ActorId
  tenantId: TenantId
  branchId: BranchId
}>

export type RuntimeDiagnosticMetadata = Readonly<{
  requestReference: string | null
  source: 'pos' | 'admin' | 'api'
}>

export type CommandEnvelope = Readonly<{
  authorization: DatabaseAuthoritativeAuthorizationContext
  identity: CommandIdentity
  idempotency: IdempotencyIdentity
  correlationId: CorrelationId
  commandType: CommandType
  payload: CommandPayload
  diagnostics: RuntimeDiagnosticMetadata
}>

export type CommandSuccess = Readonly<{
  ok: true
  commandId: CommandId
  responseVersion: string
  responseSnapshot: Readonly<Record<string, unknown>>
  completedAt: string
}>

export type CommandFailure = Readonly<{
  ok: false
  commandId: CommandId
  errorCode: string
  retryable: boolean
  failedStage: string | null
}>

export type CommandResult = CommandSuccess | CommandFailure

export type ExecutorResponse = Readonly<{
  result: CommandResult
  audit: CommandAuditMetadata
}>

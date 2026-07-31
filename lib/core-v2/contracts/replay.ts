import 'server-only'

import type {
  ActorId,
  BranchId,
  CommandId,
  CorrelationId,
  ReplayRequestId,
  TenantId,
} from './identities'
import type { CommandResult } from './commands'

export type ReplayRequest = Readonly<{
  replayRequestId: ReplayRequestId
  commandId: CommandId
  correlationId: CorrelationId
}>

export type ReplayAuthorization = Readonly<{
  freshlyAuthorized: true
  actorId: ActorId
  tenantId: TenantId
  branchId: BranchId
}>

export type ReplayResult = Readonly<{
  kind: 'stored_terminal_result'
  commandId: CommandId
  result: CommandResult
}>

export type ReplayFailure = Readonly<{
  kind: 'not_found' | 'not_authorized' | 'not_terminal' | 'corrupt_snapshot'
  retryable: boolean
}>

export type ReplayAuditMetadata = Readonly<{
  replayRequestId: ReplayRequestId
  commandId: CommandId
  correlationId: CorrelationId
  freshAuthorizationRequired: true
  payloadMutationAllowed: false
  clientInitiationAllowed: false
}>

import 'server-only'

import type {
  ActorId,
  AuthorizationContextId,
  BranchId,
  CorrelationId,
  TenantId,
} from './identities'
import type { CanonicalJsonBytes, IdempotencyKey } from './idempotency'
import type { CommandDisposition } from './dispositions'

declare const databaseAuthorityBrand: unique symbol
declare const normalizedFingerprintBrand: unique symbol

export type AuthorizationContextAcquisitionInput = Readonly<{
  authenticatedActorId: ActorId
  tenantId: TenantId
  branchId: BranchId
  idempotencyKey: IdempotencyKey
  correlationReference: CorrelationId
  canonicalPayload: CanonicalJsonBytes
  fingerprintProjection: CanonicalJsonBytes
  retainUntil: string
}>

export type DatabaseAuthorizationRole =
  | 'admin'
  | 'manager'
  | 'employee'
  | 'cashier'

export type DatabaseEmployeeSource = 'profile' | 'none'

export type DatabaseAuthoritativeAuthorizationContext = Readonly<{
  contextId: AuthorizationContextId
  authenticatedActorId: ActorId
  tenantId: TenantId
  branchId: BranchId
  roleSnapshot: DatabaseAuthorizationRole
  capabilityVersion: bigint
  employeeSource: DatabaseEmployeeSource
  employeeSourceId: ActorId | null
  commandType: 'order.create'
  issuedAt: string
  expiresAt: string
  readonly [databaseAuthorityBrand]: true
}>

export type RuntimeAuthorizationMetadata = Readonly<{
  correlationId: CorrelationId
  transport: 'pos' | 'admin' | 'api'
  requestReference: string | null
}>

export type NormalizedDatabaseFingerprint = Readonly<{
  readonly [normalizedFingerprintBrand]: true
}>

export type P2D20RawAcquisitionRow = Readonly<{
  acquisition_result: CommandDisposition
  authorization_context_id: unknown
  atomic_command_id: unknown
  correlation_reference: unknown
  command_status: unknown
  response_version: unknown
  response_snapshot: unknown
  completed_at: unknown
  error_code: unknown
  error_detail: unknown
  last_failure_stage: unknown
  stored_request_fingerprint: unknown
}>

type ResultBase = Readonly<{
  atomicCommandId: import('./identities').CommandId
  correlationReference: CorrelationId
  storedRequestFingerprint: NormalizedDatabaseFingerprint
}>

export type P2D20CreatedResult = ResultBase &
  Readonly<{
    disposition: 'created'
    authorizationContextId: AuthorizationContextId
    commandStatus: 'reserved'
    responseVersion: null
    responseSnapshot: null
    completedAt: null
    errorCode: null
    errorDetail: null
    lastFailureStage: null
  }>

export type P2D20InProgressResult = ResultBase &
  Readonly<{
    disposition: 'in_progress'
    authorizationContextId: AuthorizationContextId
    commandStatus: 'reserved' | 'processing' | 'failed_retryable'
    responseVersion: null
    responseSnapshot: null
    completedAt: null
    errorCode: null
    errorDetail: null
    lastFailureStage: null
  }>

export type P2D20ReplayResult = ResultBase &
  (
    | Readonly<{
        disposition: 'replay'
        authorizationContextId: AuthorizationContextId
        commandStatus: 'succeeded'
        responseVersion: string
        responseSnapshot: Readonly<Record<string, unknown>>
        completedAt: string
        errorCode: null
        errorDetail: null
        lastFailureStage: null
      }>
    | Readonly<{
        disposition: 'replay'
        authorizationContextId: AuthorizationContextId
        commandStatus: 'failed_final'
        responseVersion: null
        responseSnapshot: null
        completedAt: null
        errorCode: string
        errorDetail: string | null
        lastFailureStage: string
      }>
  )

export type P2D20FingerprintConflictResult = ResultBase &
  Readonly<{
    disposition: 'fingerprint_conflict'
    authorizationContextId: null
    commandStatus:
      | 'reserved'
      | 'processing'
      | 'succeeded'
      | 'failed_retryable'
      | 'failed_final'
    responseVersion: null
    responseSnapshot: null
    completedAt: null
    errorCode: null
    errorDetail: null
    lastFailureStage: null
  }>

export type P2D20AcquisitionResult =
  | P2D20CreatedResult
  | P2D20InProgressResult
  | P2D20ReplayResult
  | P2D20FingerprintConflictResult

// P2D.20 returns the context identifier but does not return the full stored
// authority row. Reading the remaining fields is deferred to a reviewed
// database contract; A1 does not invent or reconstruct them.

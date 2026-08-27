import 'server-only'

import { createHash } from 'node:crypto'

import type { Phase3CommandPayload } from './phase3'

export const CORE_V2_OFFLINE_BRIDGE_FLAGS = Object.freeze({
  authorityPersistence: false,
  persistentUnwrap: false,
  trustedSnapshotIngestion: false,
  productionOutboxPersistence: false,
  dispatch: false,
  replay: false,
  offlineOrderInterception: false,
  offlineOrderCreate: false,
  paymentProviderAction: false,
  externalEffects: false,
  cancellationReplay: false,
  refundReplay: false,
} as const)

export const CORE_V2_OFFLINE_AUTHORITY_UNAVAILABLE =
  'CORE_V2_OFFLINE_AUTHORITY_UNAVAILABLE' as const
export const TRUSTED_INVENTORY_FRONTIER_UNAVAILABLE =
  'TRUSTED_INVENTORY_FRONTIER_UNAVAILABLE' as const

export const CORE_V2_OFFLINE_LIMITS = Object.freeze({
  maximumBatchSize: 1_000,
  maximumDependencyCount: 64,
  maximumPayloadBytes: 256 * 1024,
  maximumCommandPayloadBytes: 64 * 1024,
  maximumPayloadDepth: 32,
  maximumPayloadNodes: 10_000,
  maximumStringLength: 8_192,
  maximumBusinessTextLength: 2_048,
  maximumOrderItems: 200,
  maximumTrustedInventoryItems: 200,
  maximumExternalReferenceLength: 64,
} as const)

export const CORE_V2_OFFLINE_SCHEMA_VERSIONS = Object.freeze([1] as const)
export type CoreV2OfflineSchemaVersion =
  (typeof CORE_V2_OFFLINE_SCHEMA_VERSIONS)[number]

export const CORE_V2_OFFLINE_COMMAND_TYPES = Object.freeze([
  'order.create',
  'order.status.change',
  'customer.create',
  'customer.update',
  'payment.employee_attestation',
  'audit.event.append',
  'order.cancel',
  'payment.refund',
] as const)
export type CoreV2OfflineCommandType =
  (typeof CORE_V2_OFFLINE_COMMAND_TYPES)[number]

export const CORE_V2_OFFLINE_ORDER_CREATE_CONTRACT_VERSION =
  'core-v2-offline-order-create.v2' as const
export const CORE_V2_OFFLINE_SHADOW_CONTRACT_VERSION =
  'core-v2-offline-shadow.v1' as const
export const CORE_V2_OFFLINE_AUTHORITY_BINDING_CANONICALIZATION_VERSION =
  'afex-authority-binding-canonical-json.v2' as const
export const CORE_V2_OFFLINE_ORIGIN_AUTHORITY_VERSION =
  'afex-offline-origin-authority.v2' as const
export const CORE_V2_OFFLINE_TRUSTED_ACTOR_RULE = Object.freeze({
  source: 'existing-requireVerifiedAuthContext' as const,
  requiredEvidence: Object.freeze([
    'server-side JWT signature and claims verification by requireVerifiedAuthContext',
    'trusted server constructs the PostgreSQL call',
    'database revalidates immutable Auth session and POS actor session references',
    'database revalidates active same-account bootstrap tenant branch employee device enrollment key namespace and generations',
  ] as const),
  databaseSessionLookupVerifiesJwtSignature: false as const,
  callerSuppliedUuidEqualityIsProvenance: false as const,
  serverContext: 'afex-sync-uploader-context.v1' as const,
  posActorReferenceRequired: true as const,
  browserUuidEqualityIsAuthority: false as const,
  browserRoleExecutionAllowed: false as const,
  secondActorAuthorityCreated: false as const,
  activation: 'SHADOW_PROVENANCE_NOT_ACTIVE' as const,
})
export const CORE_V2_OFFLINE_PILOT_COMMAND_TYPES = Object.freeze([
  'order.create',
] as const)
export const CORE_V2_OFFLINE_SHADOW_COMMAND_TYPES = Object.freeze([
  'order.status.change',
  'customer.create',
  'customer.update',
  'payment.employee_attestation',
  'audit.event.append',
  'order.cancel',
  'payment.refund',
] as const)
export type CoreV2OfflineCommandContractVersion =
  | typeof CORE_V2_OFFLINE_ORDER_CREATE_CONTRACT_VERSION
  | typeof CORE_V2_OFFLINE_SHADOW_CONTRACT_VERSION
export type CoreV2OfflinePilotCommandMode =
  | 'pilot_contract_only_dispatch_disabled'
  | 'shadow_mode_dispatch_forbidden'

export const CORE_V2_OFFLINE_PAYMENT_METHODS = Object.freeze([
  'mada',
  'cash',
  'visa',
  'cod',
  'card',
  'bank_transfer',
  'transfer',
  'on_delivery',
] as const)
export type CoreV2OfflinePaymentMethod =
  (typeof CORE_V2_OFFLINE_PAYMENT_METHODS)[number]

export const CORE_V2_OFFLINE_QUALIFICATION_STAGES = Object.freeze([
  'schema_compatibility',
  'canonical_payload_hash',
  'idempotency_identity',
  'dependency_readiness',
  'tenant_branch_binding',
  'pos_employee_binding',
  'device_generation_binding',
  'revocation_state',
  'command_type_authority',
  'inventory_frontier',
  'payment_attestation',
  'conflict_classification',
  'core_v2_availability',
] as const)
export type CoreV2OfflineQualificationStage =
  (typeof CORE_V2_OFFLINE_QUALIFICATION_STAGES)[number]

export type CoreV2OfflineQualificationOutcome =
  | 'qualified'
  | 'blocked'
  | 'conflict'
  | 'rejected'
  | 'already_processed'
  | 'temporarily_unavailable'

export type CoreV2OfflineLocalState =
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'failed'
  | 'conflict'
  | 'blocked'

type JsonPrimitive = null | boolean | number | string
export type CoreV2OfflineJsonValue =
  | JsonPrimitive
  | readonly CoreV2OfflineJsonValue[]
  | Readonly<{ [key: string]: CoreV2OfflineJsonValue }>

type CoreV2OfflineAggregateReference = Readonly<{
  kind: 'server' | 'local'
  id: string
}>

export type CoreV2OfflineOrderCreatePayload = Readonly<
  Omit<Phase3CommandPayload<'order.create'>, 'itemReferences'> & {
    itemReferences: readonly Readonly<{
      catalogItemReference: string
      quantity: number
      unitPrice: string
      grossAmount: string
      discountAllocation: string
      taxableAmount: string
      vatRate: string
      vatBasis: string
      vatAmount: string
      lineSubtotal: string
      lineTotal: string
    }>[]
    canonicalPayloadVersion: 'order-command-payload-v1'
    coreOrderCanonicalPayload: CoreV2OfflineJsonValue
    coreFingerprintProjection: CoreV2OfflineJsonValue
    corePayloadCanonicalHash: string
    idempotencyKey: string
    inventorySnapshotId: string
    inventoryFrontierVersion: string
    paymentMethod: CoreV2OfflinePaymentMethod
    currency: 'SAR'
    subtotalAmount: string
    discountAmount: string
    taxAmount: string
    totalAmount: string
  }
>

export type CoreV2OfflineCommandPayloadByType = Readonly<{
  'order.create': CoreV2OfflineOrderCreatePayload
  'order.status.change': Phase3CommandPayload<'order.status.change'>
  'customer.create': Phase3CommandPayload<'customer.create'>
  'customer.update': Phase3CommandPayload<'customer.update'>
  'payment.employee_attestation': Phase3CommandPayload<'payment.employee_attestation'>
  'audit.event.append': Readonly<
    Omit<Phase3CommandPayload<'audit.event.append'>, 'details'> & {
      details: Readonly<Record<string, CoreV2OfflineJsonValue>>
    }
  >
  'order.cancel': Readonly<{
    orderReference: CoreV2OfflineAggregateReference
    expectedVersion: string
    reasonCode: string
  }>
  'payment.refund': Readonly<{
    orderReference: CoreV2OfflineAggregateReference
    paymentReference: string
    amount: string
    currency: 'SAR'
    reasonCode: string
  }>
}>

export type CoreV2OfflineCommandPayload<
  T extends CoreV2OfflineCommandType = CoreV2OfflineCommandType,
> = CoreV2OfflineCommandPayloadByType[T]

export type CoreV2OfflinePaymentAttestation = Readonly<{
  attestationCommandId: string
  orderAggregateReference: string
  primaryAuthenticatedUserId: string
  actualPosEmployeeId: string
  tenantId: string
  branchId: string
  deviceId: string
  deviceGeneration: number
  employeeEnrollmentGeneration: number
  commandGeneration: number
  method: CoreV2OfflinePaymentMethod
  amount: string
  currency: 'SAR'
  employeeAttestedExternalStep: true
  attestedAtLocal: string
  providerStatus: 'unverified'
  providerConfirmation: 'not_claimed'
  providerSettlement: 'not_claimed'
  bankSettlement: 'not_claimed'
  cardAuthorization: 'not_claimed'
  refundCompletion: 'not_claimed'
  paymentProviderActionRequested: false
  orderCreateLocalCommandId: string
  orderCreateIdempotencyKeyHash: string
}>

export type CoreV2OfflineOriginAuthorityReference = Readonly<{
  bootstrapId: string
  bootstrapGeneration: number
  primaryAuthenticatedSubjectId: string
  tenantId: string
  branchId: string
  deviceId: string
  deviceGeneration: number
  enrollmentId: string
  actualPosEmployeeId: string
  employeeEnrollmentGeneration: number
  commandGeneration: number
  keyEnvelopeId: string
  keyEnvelopeVersion: number
  namespaceGeneration: number
  originAuthorityVersion: typeof CORE_V2_OFFLINE_ORIGIN_AUTHORITY_VERSION
}>

export type InventoryFrontierReference = Readonly<{
  contractVersion: 'branch-inventory-frontier.v1'
  tenantId: string
  branchId: string
  snapshotId: string
  frontierVersion: string
  localCommitmentFrontier: string
  items: readonly Readonly<{
    catalogItemId: string
    requestedQuantity: number
    pendingLocalCommitments: number
    syncingLocalCommitments: number
  }>[]
}>

export type TrustedInventoryFrontier = Readonly<{
  source: 'trusted_server'
  tenantId: string
  branchId: string
  snapshotId: string
  serverConfirmedAt: string
  frontierVersion: string
  items: readonly Readonly<{
    catalogItemId: string
    confirmedStock: number
  }>[]
}>

export type CoreV2OfflineCommandEnvelope = Readonly<{
  localCommandId: string
  idempotencyKey: string
  commandType: CoreV2OfflineCommandType
  commandContractVersion: CoreV2OfflineCommandContractVersion
  schemaVersion: CoreV2OfflineSchemaVersion
  primaryAuthenticatedUserId: string
  tenantId: string
  branchId: string
  actualPosEmployeeId: string
  deviceId: string
  deviceGeneration: number
  employeeEnrollmentGeneration: number
  commandGeneration: number
  aggregateType: 'order' | 'customer' | 'payment' | 'audit'
  aggregateId: string | null
  localAggregateReference: string | null
  localCreatedAt: string
  payload: CoreV2OfflineCommandPayload
  payloadCanonicalHash: string
  authorityBindingCanonicalHash: string
  dependencyReferences: readonly string[]
  paymentAttestation: CoreV2OfflinePaymentAttestation | null
  inventoryFrontierReference: InventoryFrontierReference | null
  keyEnvelopeId: string
  keyEnvelopeVersion: number
  originAuthorityReference: CoreV2OfflineOriginAuthorityReference
  clientApplicationVersion: string
}>

export type StableServerReceipt = Readonly<{
  receiptVersion: 1
  commandContractVersion: typeof CORE_V2_OFFLINE_ORDER_CREATE_CONTRACT_VERSION
  serverCommandId: string
  idempotencyKey: string
  payloadCanonicalHash: string
  authorityBindingCanonicalHash: string
  originAuthorityReference: CoreV2OfflineOriginAuthorityReference
  disposition: 'completed' | 'rejected'
  resultCode: string
  completedAt: string
  responseReference: string | null
  retryable: false
}>

export type ExistingIdempotencyAcquisition = Readonly<{
  serverCommandId: string
  commandContractVersion: typeof CORE_V2_OFFLINE_ORDER_CREATE_CONTRACT_VERSION
  primaryAuthenticatedUserId: string
  tenantId: string
  branchId: string
  actualPosEmployeeId: string
  deviceId: string
  deviceGeneration: number
  employeeEnrollmentGeneration: number
  commandGeneration: number
  commandType: CoreV2OfflineCommandType
  idempotencyKey: string
  payloadCanonicalHash: string
  authorityBindingCanonicalHash: string
  originAuthorityReference: CoreV2OfflineOriginAuthorityReference
  state: 'in_progress' | 'completed' | 'rejected' | 'infrastructure_failure'
  receipt: StableServerReceipt | null
}>

export type IdempotencyAcquisitionClassification =
  | Readonly<{ kind: 'first_acquisition_candidate' }>
  | Readonly<{ kind: 'duplicate_in_progress'; serverCommandId: string }>
  | Readonly<{
      kind: 'stable_completed_receipt_replay'
      serverCommandId: string
      receipt: StableServerReceipt
    }>
  | Readonly<{
      kind: 'stable_rejected_receipt'
      serverCommandId: string
      receipt: StableServerReceipt
    }>
  | Readonly<{
      kind: 'true_idempotency_conflict'
      serverCommandId: string
      code: string
    }>
  | Readonly<{ kind: 'retryable_infrastructure_failure' }>

export type CoreV2OfflineAuthorityClaims = Readonly<{
  position: number
  claimBindingHash: string
  commandContractVersion: CoreV2OfflineCommandContractVersion
  schemaVersion: CoreV2OfflineSchemaVersion
  localCommandId: string
  idempotencyKey: string
  payloadCanonicalHash: string
  authorityBindingCanonicalHash: string
  primaryAuthenticatedUserId: string
  tenantId: string
  branchId: string
  actualPosEmployeeId: string
  deviceId: string
  deviceGeneration: number
  employeeEnrollmentGeneration: number
  commandGeneration: number
  commandType: CoreV2OfflineCommandType
  aggregateType: CoreV2OfflineCommandEnvelope['aggregateType']
  aggregateId: string | null
  localAggregateReference: string | null
  keyEnvelopeId: string
  keyEnvelopeVersion: number
  originAuthorityReference: CoreV2OfflineOriginAuthorityReference
  paymentAttestation: CoreV2OfflinePaymentAttestation | null
  inventoryFrontierReference: InventoryFrontierReference | null
}>

export type TrustedCoreV2OfflineAuthoritySnapshot = Readonly<{
  source: 'trusted_server'
  authorityVersion: string
  resolvedAtServer: string
  primaryAuthenticatedUserId: string
  tenantId: string
  branchId: string
  actualPosEmployeeId: string
  deviceId: string
  deviceGeneration: number
  employeeEnrollmentGeneration: number
  commandGeneration: number
  keyEnvelopeId: string
  keyEnvelopeVersion: number
  originAuthorityReference: CoreV2OfflineOriginAuthorityReference
  keyEnvelopeValidated: true
  employeeRevoked: boolean
  deviceRevoked: boolean
  supportedCommandTypes: readonly CoreV2OfflineCommandType[]
  inventoryFrontier: TrustedInventoryFrontier | null
  coreV2Available: boolean
}>

export type CoreV2OfflineAuthorityResolution =
  | Readonly<{
      position: number
      claimBindingHash: string
      available: true
      authority: TrustedCoreV2OfflineAuthoritySnapshot
    }>
  | Readonly<{
      position: number
      claimBindingHash: string
      available: false
      code: typeof CORE_V2_OFFLINE_AUTHORITY_UNAVAILABLE
      retryable: boolean
    }>

export interface CoreV2OfflineAuthorityResolver {
  resolveBatch(
    claims: readonly CoreV2OfflineAuthorityClaims[]
  ): Promise<readonly CoreV2OfflineAuthorityResolution[]>
}

export type OfflineDependencyState = Readonly<{
  localCommandId: string
  state: CoreV2OfflineLocalState
}>

export type CoreV2OfflineConflictSnapshot = Readonly<{
  reasonCode: string
  expectedVersion: string | null
  actualVersion: string | null
  detectedAtServer: string
}>

export type CoreV2OfflineQualificationInput = Readonly<{
  envelope: unknown
  dependencyStates: readonly OfflineDependencyState[]
  existingAcquisition: ExistingIdempotencyAcquisition | null
  detectedConflict?: CoreV2OfflineConflictSnapshot | null
}>

export type CoreV2OfflineQualificationResult = Readonly<{
  localCommandId: string | null
  outcome: CoreV2OfflineQualificationOutcome
  code: string
  retryable: boolean
  checkedStages: readonly CoreV2OfflineQualificationStage[]
  idempotency: IdempotencyAcquisitionClassification | null
  receipt: StableServerReceipt | null
}>

export type CoreV2OfflineReviewContainer = Readonly<{
  reviewId: string
  reasonCode: string
  localCommandId: string
  idempotencyKey: string
  payloadCanonicalHash: string
  authoritySnapshot: Readonly<{
    authorityVersion: string
    tenantId: string
    branchId: string
    actualPosEmployeeId: string
  }>
  conflictSnapshot: CoreV2OfflineConflictSnapshot
  reviewerState: 'pending' | 'accepted' | 'rejected'
  compareAndSetVersion: number
  resolution: Readonly<{
    reviewerId: string
    resolvedAt: string
    resolutionCode: string
  }> | null
}>

export type CoreV2OfflineExternalEffectIntent = Readonly<{
  identity: string
  serverCommandId: string
  effectType: 'whatsapp' | 'printing' | 'notification' | 'other'
  effectVersion: number
  payloadReference: string
  executionAllowed: false
}>

const ENVELOPE_KEYS = [
  'localCommandId',
  'idempotencyKey',
  'commandType',
  'commandContractVersion',
  'schemaVersion',
  'primaryAuthenticatedUserId',
  'tenantId',
  'branchId',
  'actualPosEmployeeId',
  'deviceId',
  'deviceGeneration',
  'employeeEnrollmentGeneration',
  'commandGeneration',
  'aggregateType',
  'aggregateId',
  'localAggregateReference',
  'localCreatedAt',
  'payload',
  'payloadCanonicalHash',
  'authorityBindingCanonicalHash',
  'dependencyReferences',
  'paymentAttestation',
  'inventoryFrontierReference',
  'keyEnvelopeId',
  'keyEnvelopeVersion',
  'originAuthorityReference',
  'clientApplicationVersion',
] as const
export const CORE_V2_OFFLINE_AUTHORITY_BINDING_KEYS = Object.freeze([
  'commandContractVersion',
  'commandType',
  'schemaVersion',
  'localCommandId',
  'idempotencyKey',
  'primaryAuthenticatedUserId',
  'actualPosEmployeeId',
  'tenantId',
  'branchId',
  'deviceId',
  'deviceGeneration',
  'employeeEnrollmentGeneration',
  'commandGeneration',
  'keyEnvelopeId',
  'keyEnvelopeVersion',
  'aggregateType',
  'aggregateId',
  'localAggregateReference',
  'payloadCanonicalHash',
  'paymentAttestation',
  'inventoryFrontierReference',
  'originAuthorityReference',
] as const)
export const CORE_V2_OFFLINE_AUTHORITY_BINDING_CANONICALIZATION = Object.freeze({
  version: CORE_V2_OFFLINE_AUTHORITY_BINDING_CANONICALIZATION_VERSION,
  exactRequiredFields: CORE_V2_OFFLINE_AUTHORITY_BINDING_KEYS,
  objectKeyOrdering: 'recursive-ascending-ascii-field-name',
  stringNormalization: 'Unicode-NFC-before-RFC8259-JSON-escaping',
  numericRepresentation:
    'finite-JSON-number; negative-zero-normalized-to-zero; binding numbers are safe integers',
  nullableAggregateFields:
    'aggregateId and localAggregateReference are always present; exactly one is explicit JSON null',
  unknownOmittedOrAdditionalFields: 'REJECT',
  byteEncoding: 'UTF-8',
  digest: 'SHA-256-lowercase-hex',
} as const)
const PAYMENT_ATTESTATION_KEYS = [
  'attestationCommandId',
  'orderAggregateReference',
  'primaryAuthenticatedUserId',
  'actualPosEmployeeId',
  'tenantId',
  'branchId',
  'deviceId',
  'deviceGeneration',
  'employeeEnrollmentGeneration',
  'commandGeneration',
  'method',
  'amount',
  'currency',
  'employeeAttestedExternalStep',
  'attestedAtLocal',
  'providerStatus',
  'providerConfirmation',
  'providerSettlement',
  'bankSettlement',
  'cardAuthorization',
  'refundCompletion',
  'paymentProviderActionRequested',
  'orderCreateLocalCommandId',
  'orderCreateIdempotencyKeyHash',
] as const
const FRONTIER_REFERENCE_KEYS = [
  'contractVersion',
  'tenantId',
  'branchId',
  'snapshotId',
  'frontierVersion',
  'localCommitmentFrontier',
  'items',
] as const
const FRONTIER_REFERENCE_ITEM_KEYS = [
  'catalogItemId',
  'requestedQuantity',
  'pendingLocalCommitments',
  'syncingLocalCommitments',
] as const
const RECEIPT_KEYS = [
  'receiptVersion',
  'commandContractVersion',
  'serverCommandId',
  'idempotencyKey',
  'payloadCanonicalHash',
  'authorityBindingCanonicalHash',
  'originAuthorityReference',
  'disposition',
  'resultCode',
  'completedAt',
  'responseReference',
  'retryable',
] as const
const ACQUISITION_KEYS = [
  'serverCommandId',
  'commandContractVersion',
  'primaryAuthenticatedUserId',
  'tenantId',
  'branchId',
  'actualPosEmployeeId',
  'deviceId',
  'deviceGeneration',
  'employeeEnrollmentGeneration',
  'commandGeneration',
  'commandType',
  'idempotencyKey',
  'payloadCanonicalHash',
  'authorityBindingCanonicalHash',
  'originAuthorityReference',
  'state',
  'receipt',
] as const
const AVAILABLE_RESOLUTION_KEYS = [
  'position',
  'claimBindingHash',
  'available',
  'authority',
] as const
const UNAVAILABLE_RESOLUTION_KEYS = [
  'position',
  'claimBindingHash',
  'available',
  'code',
  'retryable',
] as const
const AUTHORITY_KEYS = [
  'source',
  'authorityVersion',
  'resolvedAtServer',
  'primaryAuthenticatedUserId',
  'tenantId',
  'branchId',
  'actualPosEmployeeId',
  'deviceId',
  'deviceGeneration',
  'employeeEnrollmentGeneration',
  'commandGeneration',
  'keyEnvelopeId',
  'keyEnvelopeVersion',
  'originAuthorityReference',
  'keyEnvelopeValidated',
  'employeeRevoked',
  'deviceRevoked',
  'supportedCommandTypes',
  'inventoryFrontier',
  'coreV2Available',
] as const
const TRUSTED_FRONTIER_KEYS = [
  'source',
  'tenantId',
  'branchId',
  'snapshotId',
  'serverConfirmedAt',
  'frontierVersion',
  'items',
] as const
const TRUSTED_FRONTIER_ITEM_KEYS = ['catalogItemId', 'confirmedStock'] as const

const COMMAND_AGGREGATE_TYPES = Object.freeze({
  'order.create': 'order',
  'order.status.change': 'order',
  'customer.create': 'customer',
  'customer.update': 'customer',
  'payment.employee_attestation': 'payment',
  'audit.event.append': 'audit',
  'order.cancel': 'order',
  'payment.refund': 'payment',
} as const satisfies Readonly<Record<CoreV2OfflineCommandType, CoreV2OfflineCommandEnvelope['aggregateType']>>)

const COMMAND_TYPE_SET = new Set<string>(CORE_V2_OFFLINE_COMMAND_TYPES)
const PILOT_COMMAND_TYPE_SET = new Set<string>(
  CORE_V2_OFFLINE_PILOT_COMMAND_TYPES
)
const PAYMENT_METHOD_SET = new Set<string>(CORE_V2_OFFLINE_PAYMENT_METHODS)
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,512}$/u
const SHA256_PATTERN = /^[0-9a-f]{64}$/u
const RESULT_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/u
const MONEY_PATTERN = /^(0|[1-9]\d{0,9})\.\d{2}$/u
const APPLICATION_VERSION_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u
const FORBIDDEN_PAYLOAD_KEYS = /^(?:password|passwd|secret|authorization|card_?number|cvv|cvc|payment_?pin|provider_?token)$/iu

export class CoreV2OfflineContractError extends Error {
  readonly code: string
  readonly field: string

  constructor(code: string, field: string) {
    super(code)
    this.name = 'CoreV2OfflineContractError'
    this.code = code
    this.field = field
  }
}

export function getCoreV2OfflinePilotCommandMode(
  commandType: CoreV2OfflineCommandType
): CoreV2OfflinePilotCommandMode {
  return PILOT_COMMAND_TYPE_SET.has(commandType)
    ? 'pilot_contract_only_dispatch_disabled'
    : 'shadow_mode_dispatch_forbidden'
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function readExactRecord(
  value: unknown,
  field: string,
  keys: readonly string[]
): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw new CoreV2OfflineContractError('INVALID_OBJECT', field)
  }
  const actual = Reflect.ownKeys(value)
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key)) ||
    keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    throw new CoreV2OfflineContractError('UNKNOWN_OR_MISSING_FIELD', field)
  }
  return value
}

function readRecordWithOptionalKeys(
  value: unknown,
  field: string,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = []
): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw new CoreV2OfflineContractError('INVALID_OBJECT', field)
  }
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys])
  const actualKeys = Reflect.ownKeys(value)
  if (
    actualKeys.some(
      (key) => typeof key !== 'string' || !allowedKeys.has(key)
    ) ||
    requiredKeys.some(
      (key) => !Object.prototype.hasOwnProperty.call(value, key)
    )
  ) {
    throw new CoreV2OfflineContractError('UNKNOWN_OR_MISSING_FIELD', field)
  }
  return value
}

function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new CoreV2OfflineContractError('MALFORMED_IDENTIFIER', field)
  }
  return value
}

function requireSafeIdentifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SAFE_IDENTIFIER_PATTERN.test(value)) {
    throw new CoreV2OfflineContractError('MALFORMED_IDENTIFIER', field)
  }
  return value
}

function requireBoundedText(
  value: unknown,
  field: string,
  nullable: true
): string | null
function requireBoundedText(
  value: unknown,
  field: string,
  nullable?: false
): string
function requireBoundedText(
  value: unknown,
  field: string,
  nullable: boolean
): string | null
function requireBoundedText(
  value: unknown,
  field: string,
  nullable = false
): string | null {
  if (nullable && value === null) return null
  if (typeof value !== 'string') {
    throw new CoreV2OfflineContractError('INVALID_TEXT', field)
  }
  const normalized = value.trim().normalize('NFC')
  if (
    !normalized ||
    normalized.length > CORE_V2_OFFLINE_LIMITS.maximumBusinessTextLength ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(normalized)
  ) {
    throw new CoreV2OfflineContractError('INVALID_TEXT', field)
  }
  return normalized
}

function requireMoney(value: unknown, field: string): string {
  if (typeof value !== 'string' || !MONEY_PATTERN.test(value)) {
    throw new CoreV2OfflineContractError('INVALID_MONEY', field)
  }
  return value
}

function moneyToMinorUnits(value: string): number {
  const [major, minor] = value.split('.')
  return Number(major) * 100 + Number(minor)
}

function requireSha256(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new CoreV2OfflineContractError('INVALID_SHA256', field)
  }
  return value
}

function requireAggregateReference(
  value: unknown,
  field: string
): CoreV2OfflineAggregateReference {
  const record = readExactRecord(value, field, ['kind', 'id'])
  if (record.kind !== 'server' && record.kind !== 'local') {
    throw new CoreV2OfflineContractError(
      'INVALID_AGGREGATE_REFERENCE',
      `${field}.kind`
    )
  }
  return Object.freeze({
    kind: record.kind,
    id: requireSafeIdentifier(record.id, `${field}.id`),
  })
}

function requirePositiveGeneration(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new CoreV2OfflineContractError('INVALID_GENERATION', field)
  }
  return Number(value)
}

function requireIsoTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new CoreV2OfflineContractError('INVALID_TIMESTAMP', field)
  }
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new CoreV2OfflineContractError('INVALID_TIMESTAMP', field)
  }
  return value
}

function canonicalizeJson(
  value: unknown,
  state: { depth: number; nodes: number; ancestors: WeakSet<object> },
  field: string,
  rejectForbiddenKeys = true
): CoreV2OfflineJsonValue {
  state.nodes += 1
  if (
    state.depth > CORE_V2_OFFLINE_LIMITS.maximumPayloadDepth ||
    state.nodes > CORE_V2_OFFLINE_LIMITS.maximumPayloadNodes
  ) {
    throw new CoreV2OfflineContractError('PAYLOAD_BOUNDS_EXCEEDED', field)
  }
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value.length > CORE_V2_OFFLINE_LIMITS.maximumStringLength) {
      throw new CoreV2OfflineContractError('PAYLOAD_BOUNDS_EXCEEDED', field)
    }
    return value.normalize('NFC')
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new CoreV2OfflineContractError('INVALID_JSON_VALUE', field)
    }
    return Object.is(value, -0) ? 0 : value
  }
  if (!value || typeof value !== 'object') {
    throw new CoreV2OfflineContractError('INVALID_JSON_VALUE', field)
  }
  if (state.ancestors.has(value)) {
    throw new CoreV2OfflineContractError('CYCLIC_PAYLOAD', field)
  }
  state.ancestors.add(value)
  state.depth += 1
  try {
    if (Array.isArray(value)) {
      return Object.freeze(
        value.map((entry, index) =>
          canonicalizeJson(
            entry,
            state,
            `${field}[${index}]`,
            rejectForbiddenKeys
          )
        )
      )
    }
    if (!isPlainRecord(value)) {
      throw new CoreV2OfflineContractError('INVALID_JSON_VALUE', field)
    }
    const result: Record<string, CoreV2OfflineJsonValue> = {}
    for (const key of Object.keys(value).sort()) {
      if (!key || (rejectForbiddenKeys && FORBIDDEN_PAYLOAD_KEYS.test(key))) {
        throw new CoreV2OfflineContractError('FORBIDDEN_PAYLOAD_FIELD', `${field}.${key}`)
      }
      result[key] = canonicalizeJson(
        value[key],
        state,
        `${field}.${key}`,
        rejectForbiddenKeys
      )
    }
    return Object.freeze(result)
  } finally {
    state.depth -= 1
    state.ancestors.delete(value)
  }
}

export function canonicalizeOfflineReplayPayload(value: unknown): string {
  const canonical = canonicalizeJson(
    value,
    { depth: 0, nodes: 0, ancestors: new WeakSet<object>() },
    'payload'
  )
  const serialized = JSON.stringify(canonical)
  if (
    Buffer.byteLength(serialized, 'utf8') >
    CORE_V2_OFFLINE_LIMITS.maximumPayloadBytes
  ) {
    throw new CoreV2OfflineContractError('PAYLOAD_BOUNDS_EXCEEDED', 'payload')
  }
  return serialized
}

export function sha256OfflineReplayPayload(canonicalPayload: string): string {
  return createHash('sha256').update(canonicalPayload, 'utf8').digest('hex')
}

export type CoreV2OfflineAuthorityBindingInput = Readonly<{
  commandContractVersion: CoreV2OfflineCommandContractVersion
  schemaVersion: CoreV2OfflineSchemaVersion
  localCommandId: string
  idempotencyKey: string
  commandType: CoreV2OfflineCommandType
  primaryAuthenticatedUserId: string
  tenantId: string
  branchId: string
  actualPosEmployeeId: string
  deviceId: string
  deviceGeneration: number
  employeeEnrollmentGeneration: number
  commandGeneration: number
  keyEnvelopeId: string
  keyEnvelopeVersion: number
  aggregateType: CoreV2OfflineCommandEnvelope['aggregateType']
  aggregateId: string | null
  localAggregateReference: string | null
  payloadCanonicalHash: string
  paymentAttestation: CoreV2OfflinePaymentAttestation | null
  inventoryFrontierReference: InventoryFrontierReference | null
  originAuthorityReference: CoreV2OfflineOriginAuthorityReference
}>

const ORIGIN_AUTHORITY_REFERENCE_KEYS = [
  'bootstrapId',
  'bootstrapGeneration',
  'primaryAuthenticatedSubjectId',
  'tenantId',
  'branchId',
  'deviceId',
  'deviceGeneration',
  'enrollmentId',
  'actualPosEmployeeId',
  'employeeEnrollmentGeneration',
  'commandGeneration',
  'keyEnvelopeId',
  'keyEnvelopeVersion',
  'namespaceGeneration',
  'originAuthorityVersion',
] as const

function parseOriginAuthorityReference(
  value: unknown,
  field = 'originAuthorityReference'
): CoreV2OfflineOriginAuthorityReference {
  const record = readExactRecord(
    value,
    field,
    ORIGIN_AUTHORITY_REFERENCE_KEYS
  )
  if (record.originAuthorityVersion !== CORE_V2_OFFLINE_ORIGIN_AUTHORITY_VERSION) {
    throw new CoreV2OfflineContractError(
      'ORIGIN_AUTHORITY_VERSION_MISMATCH',
      `${field}.originAuthorityVersion`
    )
  }
  return Object.freeze({
    bootstrapId: requireUuid(record.bootstrapId, `${field}.bootstrapId`),
    bootstrapGeneration: requirePositiveGeneration(
      record.bootstrapGeneration,
      `${field}.bootstrapGeneration`
    ),
    primaryAuthenticatedSubjectId: requireUuid(
      record.primaryAuthenticatedSubjectId,
      `${field}.primaryAuthenticatedSubjectId`
    ),
    tenantId: requireUuid(record.tenantId, `${field}.tenantId`),
    branchId: requireUuid(record.branchId, `${field}.branchId`),
    deviceId: requireUuid(record.deviceId, `${field}.deviceId`),
    deviceGeneration: requirePositiveGeneration(
      record.deviceGeneration,
      `${field}.deviceGeneration`
    ),
    enrollmentId: requireUuid(record.enrollmentId, `${field}.enrollmentId`),
    actualPosEmployeeId: requireUuid(
      record.actualPosEmployeeId,
      `${field}.actualPosEmployeeId`
    ),
    employeeEnrollmentGeneration: requirePositiveGeneration(
      record.employeeEnrollmentGeneration,
      `${field}.employeeEnrollmentGeneration`
    ),
    commandGeneration: requirePositiveGeneration(
      record.commandGeneration,
      `${field}.commandGeneration`
    ),
    keyEnvelopeId: requireUuid(record.keyEnvelopeId, `${field}.keyEnvelopeId`),
    keyEnvelopeVersion: requirePositiveGeneration(
      record.keyEnvelopeVersion,
      `${field}.keyEnvelopeVersion`
    ),
    namespaceGeneration: requirePositiveGeneration(
      record.namespaceGeneration,
      `${field}.namespaceGeneration`
    ),
    originAuthorityVersion: CORE_V2_OFFLINE_ORIGIN_AUTHORITY_VERSION,
  })
}

function assertOriginAuthorityCorrespondence(input: Readonly<{
  origin: CoreV2OfflineOriginAuthorityReference
  primaryAuthenticatedUserId: string
  tenantId: string
  branchId: string
  deviceId: string
  deviceGeneration: number
  actualPosEmployeeId: string
  employeeEnrollmentGeneration: number
  commandGeneration: number
  keyEnvelopeId: string
  keyEnvelopeVersion: number
}>): void {
  const { origin } = input
  if (
    origin.primaryAuthenticatedSubjectId !== input.primaryAuthenticatedUserId ||
    origin.tenantId !== input.tenantId ||
    origin.branchId !== input.branchId ||
    origin.deviceId !== input.deviceId ||
    origin.deviceGeneration !== input.deviceGeneration ||
    origin.actualPosEmployeeId !== input.actualPosEmployeeId ||
    origin.employeeEnrollmentGeneration !==
      input.employeeEnrollmentGeneration ||
    origin.commandGeneration !== input.commandGeneration ||
    origin.keyEnvelopeId !== input.keyEnvelopeId ||
    origin.keyEnvelopeVersion !== input.keyEnvelopeVersion
  ) {
    throw new CoreV2OfflineContractError(
      'ORIGIN_AUTHORITY_CORRESPONDENCE_MISMATCH',
      'originAuthorityReference'
    )
  }
}

function originAuthorityReferenceEquals(
  left: CoreV2OfflineOriginAuthorityReference,
  right: CoreV2OfflineOriginAuthorityReference
): boolean {
  return ORIGIN_AUTHORITY_REFERENCE_KEYS.every((key) => left[key] === right[key])
}

function normalizeCoreV2OfflineAuthorityBindingInput(
  input: CoreV2OfflineAuthorityBindingInput
): CoreV2OfflineAuthorityBindingInput {
  const record = readExactRecord(
    input,
    'authorityBinding',
    CORE_V2_OFFLINE_AUTHORITY_BINDING_KEYS
  )
  if (!CORE_V2_OFFLINE_SCHEMA_VERSIONS.includes(record.schemaVersion as 1)) {
    throw new CoreV2OfflineContractError(
      'UNSUPPORTED_SCHEMA_VERSION',
      'authorityBinding.schemaVersion'
    )
  }
  if (!COMMAND_TYPE_SET.has(String(record.commandType))) {
    throw new CoreV2OfflineContractError(
      'UNREGISTERED_COMMAND_TYPE',
      'authorityBinding.commandType'
    )
  }
  const commandType = record.commandType as CoreV2OfflineCommandType
  const expectedContractVersion =
    commandType === 'order.create'
      ? CORE_V2_OFFLINE_ORDER_CREATE_CONTRACT_VERSION
      : CORE_V2_OFFLINE_SHADOW_CONTRACT_VERSION
  if (record.commandContractVersion !== expectedContractVersion) {
    throw new CoreV2OfflineContractError(
      'COMMAND_CONTRACT_VERSION_MISMATCH',
      'authorityBinding.commandContractVersion'
    )
  }
  if (
    !['order', 'customer', 'payment', 'audit'].includes(
      String(record.aggregateType)
    )
  ) {
    throw new CoreV2OfflineContractError(
      'INVALID_AGGREGATE_TYPE',
      'authorityBinding.aggregateType'
    )
  }
  const aggregateId =
    record.aggregateId === null
      ? null
      : requireUuid(record.aggregateId, 'authorityBinding.aggregateId')
  const localAggregateReference =
    record.localAggregateReference === null
      ? null
      : requireSafeIdentifier(
          record.localAggregateReference,
          'authorityBinding.localAggregateReference'
        )
  if ((aggregateId === null) === (localAggregateReference === null)) {
    throw new CoreV2OfflineContractError(
      'AMBIGUOUS_AGGREGATE_IDENTITY',
      'authorityBinding.aggregateId'
    )
  }
  if (
    typeof record.idempotencyKey !== 'string' ||
    !IDEMPOTENCY_KEY_PATTERN.test(record.idempotencyKey)
  ) {
    throw new CoreV2OfflineContractError(
      'INVALID_IDEMPOTENCY_KEY',
      'authorityBinding.idempotencyKey'
    )
  }
  if (
    typeof record.payloadCanonicalHash !== 'string' ||
    !SHA256_PATTERN.test(record.payloadCanonicalHash)
  ) {
    throw new CoreV2OfflineContractError(
      'INVALID_PAYLOAD_HASH',
      'authorityBinding.payloadCanonicalHash'
    )
  }
  const originAuthorityReference = parseOriginAuthorityReference(
    record.originAuthorityReference,
    'authorityBinding.originAuthorityReference'
  )
  const normalized = Object.freeze({
    commandContractVersion: expectedContractVersion,
    commandType,
    schemaVersion: 1,
    localCommandId: requireUuid(
      record.localCommandId,
      'authorityBinding.localCommandId'
    ),
    idempotencyKey: record.idempotencyKey,
    primaryAuthenticatedUserId: requireUuid(
      record.primaryAuthenticatedUserId,
      'authorityBinding.primaryAuthenticatedUserId'
    ),
    actualPosEmployeeId: requireUuid(
      record.actualPosEmployeeId,
      'authorityBinding.actualPosEmployeeId'
    ),
    tenantId: requireUuid(record.tenantId, 'authorityBinding.tenantId'),
    branchId: requireUuid(record.branchId, 'authorityBinding.branchId'),
    deviceId: requireUuid(record.deviceId, 'authorityBinding.deviceId'),
    deviceGeneration: requirePositiveGeneration(
      record.deviceGeneration,
      'authorityBinding.deviceGeneration'
    ),
    employeeEnrollmentGeneration: requirePositiveGeneration(
      record.employeeEnrollmentGeneration,
      'authorityBinding.employeeEnrollmentGeneration'
    ),
    commandGeneration: requirePositiveGeneration(
      record.commandGeneration,
      'authorityBinding.commandGeneration'
    ),
    keyEnvelopeId: requireUuid(
      record.keyEnvelopeId,
      'authorityBinding.keyEnvelopeId'
    ),
    keyEnvelopeVersion: requirePositiveGeneration(
      record.keyEnvelopeVersion,
      'authorityBinding.keyEnvelopeVersion'
    ),
    aggregateType:
      record.aggregateType as CoreV2OfflineCommandEnvelope['aggregateType'],
    aggregateId,
    localAggregateReference,
    payloadCanonicalHash: record.payloadCanonicalHash,
    paymentAttestation: parsePaymentAttestation(record.paymentAttestation),
    inventoryFrontierReference: parseInventoryFrontierReference(
      record.inventoryFrontierReference
    ),
    originAuthorityReference,
  })
  assertOriginAuthorityCorrespondence({
    ...normalized,
    origin: normalized.originAuthorityReference,
  })
  return normalized
}

export function canonicalizeCoreV2OfflineAuthorityBinding(
  input: CoreV2OfflineAuthorityBindingInput
): string {
  const normalized = normalizeCoreV2OfflineAuthorityBindingInput(input)
  const canonical = canonicalizeJson(
    normalized,
    { depth: 0, nodes: 0, ancestors: new WeakSet<object>() },
    'authorityBinding',
    false
  )
  return JSON.stringify(canonical)
}

export function computeCoreV2OfflineAuthorityBindingCanonicalHash(
  input: CoreV2OfflineAuthorityBindingInput
): string {
  return sha256OfflineReplayPayload(
    canonicalizeCoreV2OfflineAuthorityBinding(input)
  )
}

export function computeCoreV2OfflineOrderCreateAuthorityBindingCanonicalHash(
  input: CoreV2OfflineAuthorityBindingInput
): string {
  if (input.commandType !== 'order.create') {
    throw new CoreV2OfflineContractError(
      'PILOT_COMMAND_DISPATCH_BLOCKED',
      'authorityBinding.commandType'
    )
  }
  if (
    input.commandContractVersion !==
    CORE_V2_OFFLINE_ORDER_CREATE_CONTRACT_VERSION
  ) {
    throw new CoreV2OfflineContractError(
      'COMMAND_CONTRACT_VERSION_MISMATCH',
      'authorityBinding.commandContractVersion'
    )
  }
  if (input.schemaVersion !== 1) {
    throw new CoreV2OfflineContractError(
      'UNSUPPORTED_SCHEMA_VERSION',
      'authorityBinding.schemaVersion'
    )
  }
  if (input.aggregateType !== 'order') {
    throw new CoreV2OfflineContractError(
      'COMMAND_AGGREGATE_TYPE_MISMATCH',
      'authorityBinding.aggregateType'
    )
  }
  return computeCoreV2OfflineAuthorityBindingCanonicalHash(input)
}

export function calculateCoreV2OfflineLocalAvailableQuantity(input: Readonly<{
  lastConfirmedBranchStock: number
  pendingLocalCommitments: number
  syncingLocalCommitments: number
}>): number {
  for (const [field, value] of Object.entries(input)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new CoreV2OfflineContractError(
        'INVALID_INVENTORY_COMMITMENT',
        field
      )
    }
  }
  return Math.max(
    0,
    input.lastConfirmedBranchStock -
      input.pendingLocalCommitments -
      input.syncingLocalCommitments
  )
}

function assertCommandPayloadBounds(payload: CoreV2OfflineCommandPayload) {
  const canonical = canonicalizeOfflineReplayPayload(payload)
  if (
    Buffer.byteLength(canonical, 'utf8') >
    CORE_V2_OFFLINE_LIMITS.maximumCommandPayloadBytes
  ) {
    throw new CoreV2OfflineContractError('PAYLOAD_BOUNDS_EXCEEDED', 'payload')
  }
}

function parsePaymentEmployeeAttestationPayload(
  value: unknown
): CoreV2OfflineCommandPayload<'payment.employee_attestation'> {
  const record = readRecordWithOptionalKeys(
    value,
    'payload',
    [
      'orderAggregateReference',
      'paymentMethod',
      'amount',
      'currency',
      'employeeConfirmedExternalPayment',
      'employeeConfirmedAtLocal',
      'paymentProviderConfirmationStatus',
      'paymentReplayPolicy',
      'reconciliationStatus',
    ],
    ['externalReference']
  )
  if (
    !PAYMENT_METHOD_SET.has(String(record.paymentMethod)) ||
    record.currency !== 'SAR' ||
    record.employeeConfirmedExternalPayment !== true ||
    (record.paymentProviderConfirmationStatus !== 'not_integrated' &&
      record.paymentProviderConfirmationStatus !== 'employee_attested') ||
    record.paymentReplayPolicy !== 'never_charge_or_invoke_provider' ||
    !['not_required', 'pending', 'matched', 'discrepancy'].includes(
      String(record.reconciliationStatus)
    )
  ) {
    throw new CoreV2OfflineContractError(
      'INVALID_PAYMENT_ATTESTATION_PAYLOAD',
      'payload'
    )
  }
  let externalReference: string | undefined
  if (record.externalReference !== undefined) {
    externalReference = requireSafeIdentifier(
      record.externalReference,
      'payload.externalReference'
    )
    if (
      externalReference.length >
      CORE_V2_OFFLINE_LIMITS.maximumExternalReferenceLength
    ) {
      throw new CoreV2OfflineContractError(
        'INVALID_PAYMENT_ATTESTATION_PAYLOAD',
        'payload.externalReference'
      )
    }
  }
  return Object.freeze({
    orderAggregateReference: requireSafeIdentifier(
      record.orderAggregateReference,
      'payload.orderAggregateReference'
    ),
    paymentMethod: record.paymentMethod as CoreV2OfflinePaymentMethod,
    amount: requireMoney(record.amount, 'payload.amount'),
    currency: 'SAR',
    employeeConfirmedExternalPayment: true,
    employeeConfirmedAtLocal: requireIsoTimestamp(
      record.employeeConfirmedAtLocal,
      'payload.employeeConfirmedAtLocal'
    ),
    ...(externalReference ? { externalReference } : {}),
    paymentProviderConfirmationStatus:
      record.paymentProviderConfirmationStatus as
        | 'not_integrated'
        | 'employee_attested',
    paymentReplayPolicy: 'never_charge_or_invoke_provider',
    reconciliationStatus: record.reconciliationStatus as
      | 'not_required'
      | 'pending'
      | 'matched'
      | 'discrepancy',
  })
}

export function parseCoreV2OfflineCommandPayload<
  T extends CoreV2OfflineCommandType,
>(commandType: T, value: unknown): CoreV2OfflineCommandPayload<T> {
  if (!COMMAND_TYPE_SET.has(commandType)) {
    throw new CoreV2OfflineContractError('UNREGISTERED_COMMAND_TYPE', 'commandType')
  }
  let payload: CoreV2OfflineCommandPayload
  if (commandType === 'order.create') {
    const record = readExactRecord(value, 'payload', [
      'aggregateReference',
      'customerReference',
      'itemReferences',
      'paymentAttestationCommandId',
      'paymentMethod',
      'currency',
      'subtotalAmount',
      'discountAmount',
      'taxAmount',
      'totalAmount',
      'canonicalPayloadVersion',
      'coreOrderCanonicalPayload',
      'coreFingerprintProjection',
      'corePayloadCanonicalHash',
      'idempotencyKey',
      'inventorySnapshotId',
      'inventoryFrontierVersion',
    ])
    if (
      !Array.isArray(record.itemReferences) ||
      record.itemReferences.length < 1 ||
      record.itemReferences.length > CORE_V2_OFFLINE_LIMITS.maximumOrderItems ||
      record.currency !== 'SAR' ||
      !PAYMENT_METHOD_SET.has(String(record.paymentMethod))
    ) {
      throw new CoreV2OfflineContractError('INVALID_ORDER_PAYLOAD', 'payload')
    }
    const itemIds = new Set<string>()
    const items = record.itemReferences.map((item, index) => {
      const itemRecord = readExactRecord(item, `payload.itemReferences[${index}]`, [
        'catalogItemReference',
        'quantity',
        'unitPrice',
        'grossAmount',
        'discountAllocation',
        'taxableAmount',
        'vatRate',
        'vatBasis',
        'vatAmount',
        'lineSubtotal',
        'lineTotal',
      ])
      const catalogItemReference = requireUuid(
        itemRecord.catalogItemReference,
        `payload.itemReferences[${index}].catalogItemReference`
      )
      if (itemIds.has(catalogItemReference)) {
        throw new CoreV2OfflineContractError(
          'DUPLICATE_ORDER_ITEM',
          'payload.itemReferences'
        )
      }
      itemIds.add(catalogItemReference)
      if (
        !Number.isSafeInteger(itemRecord.quantity) ||
        Number(itemRecord.quantity) < 1 ||
        Number(itemRecord.quantity) > 999
      ) {
        throw new CoreV2OfflineContractError(
          'INVALID_ORDER_ITEM_QUANTITY',
          `payload.itemReferences[${index}].quantity`
        )
      }
      const quantity = Number(itemRecord.quantity)
      const unitPrice = requireMoney(
        itemRecord.unitPrice,
        `payload.itemReferences[${index}].unitPrice`
      )
      const grossAmount = requireMoney(
        itemRecord.grossAmount,
        `payload.itemReferences[${index}].grossAmount`
      )
      const discountAllocation = requireMoney(
        itemRecord.discountAllocation,
        `payload.itemReferences[${index}].discountAllocation`
      )
      const taxableAmount = requireMoney(
        itemRecord.taxableAmount,
        `payload.itemReferences[${index}].taxableAmount`
      )
      const vatAmount = requireMoney(
        itemRecord.vatAmount,
        `payload.itemReferences[${index}].vatAmount`
      )
      const lineSubtotal = requireMoney(
        itemRecord.lineSubtotal,
        `payload.itemReferences[${index}].lineSubtotal`
      )
      const lineTotal = requireMoney(
        itemRecord.lineTotal,
        `payload.itemReferences[${index}].lineTotal`
      )
      const vatRate = requireMoney(itemRecord.vatRate, `payload.itemReferences[${index}].vatRate`)
      const vatBasis = requireMoney(itemRecord.vatBasis, `payload.itemReferences[${index}].vatBasis`)
      if (
        moneyToMinorUnits(unitPrice) * quantity !== moneyToMinorUnits(grossAmount) ||
        moneyToMinorUnits(grossAmount) - moneyToMinorUnits(discountAllocation) !==
          moneyToMinorUnits(taxableAmount) ||
        moneyToMinorUnits(vatBasis) !== moneyToMinorUnits(taxableAmount) ||
        moneyToMinorUnits(lineSubtotal) !== moneyToMinorUnits(taxableAmount) ||
        moneyToMinorUnits(lineTotal) !==
          moneyToMinorUnits(taxableAmount) + moneyToMinorUnits(vatAmount)
      ) {
        throw new CoreV2OfflineContractError(
          'ORDER_LINE_TOTAL_MISMATCH',
          `payload.itemReferences[${index}].lineTotal`
        )
      }
      return Object.freeze({
        catalogItemReference,
        quantity,
        unitPrice,
        grossAmount,
        discountAllocation,
        taxableAmount,
        vatRate,
        vatBasis,
        vatAmount,
        lineSubtotal,
        lineTotal,
      })
    })
    items.sort((left, right) =>
      left.catalogItemReference < right.catalogItemReference
        ? -1
        : left.catalogItemReference > right.catalogItemReference
          ? 1
          : 0
    )
    const subtotalAmount = requireMoney(
      record.subtotalAmount,
      'payload.subtotalAmount'
    )
    const discountAmount = requireMoney(
      record.discountAmount,
      'payload.discountAmount'
    )
    const taxAmount = requireMoney(record.taxAmount, 'payload.taxAmount')
    const totalAmount = requireMoney(record.totalAmount, 'payload.totalAmount')
    const itemSubtotal = items.reduce(
      (sum, item) => sum + moneyToMinorUnits(item.grossAmount),
      0
    )
    const subtotal = moneyToMinorUnits(subtotalAmount)
    const discount = moneyToMinorUnits(discountAmount)
    const tax = moneyToMinorUnits(taxAmount)
    const total = moneyToMinorUnits(totalAmount)
    if (
      itemSubtotal !== subtotal ||
      discount > subtotal ||
      subtotal - discount + tax !== total ||
      total <= 0
    ) {
      throw new CoreV2OfflineContractError(
        'ORDER_TOTALS_MISMATCH',
        'payload.totalAmount'
      )
    }
    payload = Object.freeze({
      aggregateReference: requireSafeIdentifier(
        record.aggregateReference,
        'payload.aggregateReference'
      ),
      customerReference: requireAggregateReference(
        record.customerReference,
        'payload.customerReference'
      ),
      itemReferences: Object.freeze(items),
      paymentAttestationCommandId: requireUuid(
        record.paymentAttestationCommandId,
        'payload.paymentAttestationCommandId'
      ),
      paymentMethod: record.paymentMethod as CoreV2OfflinePaymentMethod,
      currency: 'SAR',
      subtotalAmount,
      discountAmount,
      taxAmount,
      totalAmount,
      canonicalPayloadVersion:
        record.canonicalPayloadVersion === 'order-command-payload-v1'
          ? 'order-command-payload-v1'
          : (() => {
              throw new CoreV2OfflineContractError(
                'INVALID_CORE_PAYLOAD_VERSION',
                'payload.canonicalPayloadVersion'
              )
            })(),
      coreOrderCanonicalPayload: canonicalizeJson(
        record.coreOrderCanonicalPayload,
        { depth: 0, nodes: 0, ancestors: new WeakSet<object>() },
        'payload.coreOrderCanonicalPayload'
      ),
      coreFingerprintProjection: canonicalizeJson(
        record.coreFingerprintProjection,
        { depth: 0, nodes: 0, ancestors: new WeakSet<object>() },
        'payload.coreFingerprintProjection'
      ),
      corePayloadCanonicalHash: requireSha256(
        record.corePayloadCanonicalHash,
        'payload.corePayloadCanonicalHash'
      ),
      idempotencyKey: requireSafeIdentifier(
        record.idempotencyKey,
        'payload.idempotencyKey'
      ),
      inventorySnapshotId: requireUuid(
        record.inventorySnapshotId,
        'payload.inventorySnapshotId'
      ),
      inventoryFrontierVersion: requireSafeIdentifier(
        record.inventoryFrontierVersion,
        'payload.inventoryFrontierVersion'
      ),
    })
  } else if (commandType === 'order.status.change') {
    const record = readExactRecord(value, 'payload', [
      'orderReference',
      'fromStatus',
      'toStatus',
      'transitionContractVersion',
    ])
    const fromStatus = requireSafeIdentifier(record.fromStatus, 'payload.fromStatus')
    const toStatus = requireSafeIdentifier(record.toStatus, 'payload.toStatus')
    if (fromStatus === toStatus) {
      throw new CoreV2OfflineContractError(
        'INVALID_STATUS_TRANSITION',
        'payload.toStatus'
      )
    }
    payload = Object.freeze({
      orderReference: requireAggregateReference(
        record.orderReference,
        'payload.orderReference'
      ),
      fromStatus,
      toStatus,
      transitionContractVersion: requireSafeIdentifier(
        record.transitionContractVersion,
        'payload.transitionContractVersion'
      ),
    })
  } else if (commandType === 'customer.create') {
    const record = readExactRecord(value, 'payload', [
      'aggregateReference',
      'name',
      'phone',
      'email',
      'address',
      'notes',
    ])
    payload = Object.freeze({
      aggregateReference: requireSafeIdentifier(
        record.aggregateReference,
        'payload.aggregateReference'
      ),
      name: requireBoundedText(record.name, 'payload.name'),
      phone: requireBoundedText(record.phone, 'payload.phone'),
      email: requireBoundedText(record.email, 'payload.email', true),
      address: requireBoundedText(record.address, 'payload.address', true),
      notes: requireBoundedText(record.notes, 'payload.notes', true),
    })
  } else if (commandType === 'customer.update') {
    const record = readExactRecord(value, 'payload', [
      'aggregateReference',
      'expectedVersion',
      'changes',
    ])
    const changesRecord = readRecordWithOptionalKeys(
      record.changes,
      'payload.changes',
      [],
      ['name', 'phone', 'email', 'address', 'notes']
    )
    if (Object.keys(changesRecord).length === 0) {
      throw new CoreV2OfflineContractError('EMPTY_CUSTOMER_UPDATE', 'payload.changes')
    }
    const changes: Record<string, string | null> = {}
    for (const [key, changeValue] of Object.entries(changesRecord)) {
      changes[key] = requireBoundedText(
        changeValue,
        `payload.changes.${key}`,
        key === 'email' || key === 'address' || key === 'notes'
      )
    }
    payload = Object.freeze({
      aggregateReference: requireSafeIdentifier(
        record.aggregateReference,
        'payload.aggregateReference'
      ),
      expectedVersion: requireSafeIdentifier(
        record.expectedVersion,
        'payload.expectedVersion'
      ),
      changes: Object.freeze(changes),
    }) as CoreV2OfflineCommandPayload<'customer.update'>
  } else if (commandType === 'payment.employee_attestation') {
    payload = parsePaymentEmployeeAttestationPayload(value)
  } else if (commandType === 'audit.event.append') {
    const record = readExactRecord(value, 'payload', [
      'aggregateReference',
      'causalCommandId',
      'eventType',
      'details',
    ])
    const normalizedDetails = canonicalizeJson(
      record.details,
      { depth: 0, nodes: 0, ancestors: new WeakSet<object>() },
      'payload.details'
    )
    if (!isPlainRecord(normalizedDetails)) {
      throw new CoreV2OfflineContractError('INVALID_AUDIT_DETAILS', 'payload.details')
    }
    payload = Object.freeze({
      aggregateReference: requireSafeIdentifier(
        record.aggregateReference,
        'payload.aggregateReference'
      ),
      causalCommandId: requireUuid(
        record.causalCommandId,
        'payload.causalCommandId'
      ),
      eventType: requireSafeIdentifier(record.eventType, 'payload.eventType'),
      details: Object.freeze(normalizedDetails),
    })
  } else if (commandType === 'order.cancel') {
    const record = readExactRecord(value, 'payload', [
      'orderReference',
      'expectedVersion',
      'reasonCode',
    ])
    payload = Object.freeze({
      orderReference: requireAggregateReference(
        record.orderReference,
        'payload.orderReference'
      ),
      expectedVersion: requireSafeIdentifier(
        record.expectedVersion,
        'payload.expectedVersion'
      ),
      reasonCode: requireSafeIdentifier(record.reasonCode, 'payload.reasonCode'),
    })
  } else {
    const record = readExactRecord(value, 'payload', [
      'orderReference',
      'paymentReference',
      'amount',
      'currency',
      'reasonCode',
    ])
    if (record.currency !== 'SAR') {
      throw new CoreV2OfflineContractError('INVALID_MONEY', 'payload.currency')
    }
    payload = Object.freeze({
      orderReference: requireAggregateReference(
        record.orderReference,
        'payload.orderReference'
      ),
      paymentReference: requireSafeIdentifier(
        record.paymentReference,
        'payload.paymentReference'
      ),
      amount: requireMoney(record.amount, 'payload.amount'),
      currency: 'SAR',
      reasonCode: requireSafeIdentifier(record.reasonCode, 'payload.reasonCode'),
    })
  }
  if (commandType === 'order.create') {
    const orderPayload = payload as CoreV2OfflineCommandPayload<'order.create'>
    const coreCanonical = canonicalizeOfflineReplayPayload(
      orderPayload.coreOrderCanonicalPayload
    )
    if (
      sha256OfflineReplayPayload(coreCanonical) !==
      orderPayload.corePayloadCanonicalHash
    ) {
      throw new CoreV2OfflineContractError(
        'CORE_PAYLOAD_HASH_MISMATCH',
        'payload.corePayloadCanonicalHash'
      )
    }
  }
  assertCommandPayloadBounds(payload)
  return payload as CoreV2OfflineCommandPayload<T>
}

function parsePaymentAttestation(
  value: unknown
): CoreV2OfflinePaymentAttestation | null {
  if (value === null) return null
  const record = readExactRecord(
    value,
    'paymentAttestation',
    PAYMENT_ATTESTATION_KEYS
  )
  if (!PAYMENT_METHOD_SET.has(String(record.method))) {
    throw new CoreV2OfflineContractError(
      'UNRECOGNIZED_PAYMENT_METHOD',
      'paymentAttestation.method'
    )
  }
  if (
    record.currency !== 'SAR' ||
    record.employeeAttestedExternalStep !== true ||
    record.providerStatus !== 'unverified' ||
    record.providerConfirmation !== 'not_claimed' ||
    record.providerSettlement !== 'not_claimed' ||
    record.bankSettlement !== 'not_claimed' ||
    record.cardAuthorization !== 'not_claimed' ||
    record.refundCompletion !== 'not_claimed' ||
    record.paymentProviderActionRequested !== false
  ) {
    throw new CoreV2OfflineContractError(
      'PROVIDER_AUTHORITY_CLAIM_FORBIDDEN',
      'paymentAttestation'
    )
  }
  return Object.freeze({
    attestationCommandId: requireUuid(
      record.attestationCommandId,
      'paymentAttestation.attestationCommandId'
    ),
    orderAggregateReference: requireSafeIdentifier(
      record.orderAggregateReference,
      'paymentAttestation.orderAggregateReference'
    ),
    primaryAuthenticatedUserId: requireUuid(
      record.primaryAuthenticatedUserId,
      'paymentAttestation.primaryAuthenticatedUserId'
    ),
    actualPosEmployeeId: requireUuid(
      record.actualPosEmployeeId,
      'paymentAttestation.actualPosEmployeeId'
    ),
    tenantId: requireUuid(record.tenantId, 'paymentAttestation.tenantId'),
    branchId: requireUuid(record.branchId, 'paymentAttestation.branchId'),
    deviceId: requireUuid(record.deviceId, 'paymentAttestation.deviceId'),
    deviceGeneration: requirePositiveGeneration(
      record.deviceGeneration,
      'paymentAttestation.deviceGeneration'
    ),
    employeeEnrollmentGeneration: requirePositiveGeneration(
      record.employeeEnrollmentGeneration,
      'paymentAttestation.employeeEnrollmentGeneration'
    ),
    commandGeneration: requirePositiveGeneration(
      record.commandGeneration,
      'paymentAttestation.commandGeneration'
    ),
    method: record.method as CoreV2OfflinePaymentMethod,
    amount: requireMoney(record.amount, 'paymentAttestation.amount'),
    currency: 'SAR',
    employeeAttestedExternalStep: true,
    attestedAtLocal: requireIsoTimestamp(
      record.attestedAtLocal,
      'paymentAttestation.attestedAtLocal'
    ),
    providerStatus: 'unverified',
    providerConfirmation: 'not_claimed',
    providerSettlement: 'not_claimed',
    bankSettlement: 'not_claimed',
    cardAuthorization: 'not_claimed',
    refundCompletion: 'not_claimed',
    paymentProviderActionRequested: false,
    orderCreateLocalCommandId: requireUuid(
      record.orderCreateLocalCommandId,
      'paymentAttestation.orderCreateLocalCommandId'
    ),
    orderCreateIdempotencyKeyHash: requireSha256(
      record.orderCreateIdempotencyKeyHash,
      'paymentAttestation.orderCreateIdempotencyKeyHash'
    ),
  })
}

function parseInventoryFrontierReference(
  value: unknown
): InventoryFrontierReference | null {
  if (value === null) return null
  const record = readExactRecord(
    value,
    'inventoryFrontierReference',
    FRONTIER_REFERENCE_KEYS
  )
  if (
    record.contractVersion !== 'branch-inventory-frontier.v1' ||
    !Array.isArray(record.items) ||
    record.items.length < 1 ||
    record.items.length > CORE_V2_OFFLINE_LIMITS.maximumTrustedInventoryItems
  ) {
    throw new CoreV2OfflineContractError(
      'INVALID_INVENTORY_FRONTIER_REFERENCE',
      'inventoryFrontierReference.items'
    )
  }
  const seen = new Set<string>()
  const items = record.items.map((item, index) => {
    const itemRecord = readExactRecord(
      item,
      `inventoryFrontierReference.items[${index}]`,
      FRONTIER_REFERENCE_ITEM_KEYS
    )
    const catalogItemId = requireUuid(
      itemRecord.catalogItemId,
      `inventoryFrontierReference.items[${index}].catalogItemId`
    )
    if (
      seen.has(catalogItemId) ||
      !Number.isSafeInteger(itemRecord.requestedQuantity) ||
      Number(itemRecord.requestedQuantity) < 1 ||
      !Number.isSafeInteger(itemRecord.pendingLocalCommitments) ||
      Number(itemRecord.pendingLocalCommitments) < 0 ||
      !Number.isSafeInteger(itemRecord.syncingLocalCommitments) ||
      Number(itemRecord.syncingLocalCommitments) < 0
    ) {
      throw new CoreV2OfflineContractError(
        'INVALID_INVENTORY_FRONTIER_REFERENCE',
        `inventoryFrontierReference.items[${index}]`
      )
    }
    seen.add(catalogItemId)
    return Object.freeze({
      catalogItemId,
      requestedQuantity: Number(itemRecord.requestedQuantity),
      pendingLocalCommitments: Number(itemRecord.pendingLocalCommitments),
      syncingLocalCommitments: Number(itemRecord.syncingLocalCommitments),
    })
  })
  if (seen.size !== items.length) {
    throw new CoreV2OfflineContractError(
      'INVALID_INVENTORY_FRONTIER_REFERENCE',
      'inventoryFrontierReference.items'
    )
  }
  items.sort((left, right) =>
    left.catalogItemId < right.catalogItemId
      ? -1
      : left.catalogItemId > right.catalogItemId
        ? 1
        : 0
  )
  return Object.freeze({
    contractVersion: 'branch-inventory-frontier.v1',
    tenantId: requireUuid(record.tenantId, 'inventoryFrontierReference.tenantId'),
    branchId: requireUuid(record.branchId, 'inventoryFrontierReference.branchId'),
    snapshotId: requireUuid(record.snapshotId, 'inventoryFrontierReference.snapshotId'),
    frontierVersion: requireSafeIdentifier(
      record.frontierVersion,
      'inventoryFrontierReference.frontierVersion'
    ),
    localCommitmentFrontier: requireSafeIdentifier(
      record.localCommitmentFrontier,
      'inventoryFrontierReference.localCommitmentFrontier'
    ),
    items: Object.freeze(items),
  })
}

function envelopeAggregateReference(
  aggregateId: string | null,
  localAggregateReference: string | null
): string {
  return aggregateId ?? (localAggregateReference as string)
}

function requireExactDependencySet(
  actual: readonly string[],
  expected: readonly string[]
) {
  const sortedActual = [...actual].sort()
  const sortedExpected = [...expected].sort()
  if (
    sortedActual.length !== sortedExpected.length ||
    sortedActual.some((value, index) => value !== sortedExpected[index])
  ) {
    throw new CoreV2OfflineContractError(
      'COMMAND_DEPENDENCY_MISMATCH',
      'dependencyReferences'
    )
  }
}

function validateEnvelopeCommandSemantics(input: Readonly<{
  commandType: CoreV2OfflineCommandType
  aggregateType: CoreV2OfflineCommandEnvelope['aggregateType']
  aggregateReference: string
  localCommandId: string
  idempotencyKey: string
  primaryAuthenticatedUserId: string
  tenantId: string
  branchId: string
  actualPosEmployeeId: string
  deviceId: string
  deviceGeneration: number
  employeeEnrollmentGeneration: number
  commandGeneration: number
  payload: CoreV2OfflineCommandPayload
  dependencyReferences: readonly string[]
  paymentAttestation: CoreV2OfflinePaymentAttestation | null
  inventoryFrontierReference: InventoryFrontierReference | null
}>) {
  if (COMMAND_AGGREGATE_TYPES[input.commandType] !== input.aggregateType) {
    throw new CoreV2OfflineContractError(
      'COMMAND_AGGREGATE_TYPE_MISMATCH',
      'aggregateType'
    )
  }
  const paymentAllowed =
    input.commandType === 'order.create' ||
    input.commandType === 'payment.employee_attestation'
  if (!paymentAllowed && input.paymentAttestation !== null) {
    throw new CoreV2OfflineContractError(
      'IRRELEVANT_PAYMENT_ATTESTATION',
      'paymentAttestation'
    )
  }
  if (
    input.paymentAttestation &&
    (input.paymentAttestation.primaryAuthenticatedUserId !==
      input.primaryAuthenticatedUserId ||
      input.paymentAttestation.actualPosEmployeeId !==
        input.actualPosEmployeeId ||
      input.paymentAttestation.tenantId !== input.tenantId ||
      input.paymentAttestation.branchId !== input.branchId ||
      input.paymentAttestation.deviceId !== input.deviceId ||
      input.paymentAttestation.deviceGeneration !== input.deviceGeneration ||
      input.paymentAttestation.employeeEnrollmentGeneration !==
        input.employeeEnrollmentGeneration ||
      input.paymentAttestation.commandGeneration !== input.commandGeneration)
  ) {
    throw new CoreV2OfflineContractError(
      'PAYMENT_ATTESTATION_AUTHORITY_MISMATCH',
      'paymentAttestation'
    )
  }
  if (input.commandType !== 'order.create' && input.inventoryFrontierReference !== null) {
    throw new CoreV2OfflineContractError(
      'IRRELEVANT_INVENTORY_FRONTIER',
      'inventoryFrontierReference'
    )
  }
  if (input.commandType === 'order.create') {
    const payload = input.payload as CoreV2OfflineCommandPayload<'order.create'>
    if (payload.aggregateReference !== input.aggregateReference) {
      throw new CoreV2OfflineContractError(
        'COMMAND_AGGREGATE_IDENTITY_MISMATCH',
        'payload.aggregateReference'
      )
    }
    const attestation = input.paymentAttestation
    if (!attestation) {
      throw new CoreV2OfflineContractError(
        'PAYMENT_ATTESTATION_REQUIRED',
        'paymentAttestation'
      )
    }
    if (
      attestation.attestationCommandId !== payload.paymentAttestationCommandId ||
      attestation.orderAggregateReference !== payload.aggregateReference ||
      attestation.primaryAuthenticatedUserId !==
        input.primaryAuthenticatedUserId ||
      attestation.actualPosEmployeeId !== input.actualPosEmployeeId ||
      attestation.tenantId !== input.tenantId ||
      attestation.branchId !== input.branchId ||
      attestation.deviceId !== input.deviceId ||
      attestation.deviceGeneration !== input.deviceGeneration ||
      attestation.employeeEnrollmentGeneration !==
        input.employeeEnrollmentGeneration ||
      attestation.commandGeneration !== input.commandGeneration ||
      attestation.orderCreateLocalCommandId !== input.localCommandId ||
      attestation.orderCreateIdempotencyKeyHash !==
        sha256OfflineReplayPayload(input.idempotencyKey) ||
      attestation.method !== payload.paymentMethod ||
      attestation.amount !== payload.totalAmount ||
      attestation.currency !== payload.currency
    ) {
      throw new CoreV2OfflineContractError(
        'PAYMENT_ATTESTATION_BINDING_MISMATCH',
        'paymentAttestation'
      )
    }
    const frontier = input.inventoryFrontierReference
    if (!frontier) {
      throw new CoreV2OfflineContractError(
        'INVENTORY_FRONTIER_REFERENCE_REQUIRED',
        'inventoryFrontierReference'
      )
    }
    if (frontier.tenantId !== input.tenantId || frontier.branchId !== input.branchId) {
      throw new CoreV2OfflineContractError(
        'INVENTORY_FRONTIER_SCOPE_MISMATCH',
        'inventoryFrontierReference'
      )
    }
    const itemIds = payload.itemReferences.map((item) => item.catalogItemReference)
    const frontierItemIds = frontier.items.map((item) => item.catalogItemId)
    if (
      itemIds.length !== frontierItemIds.length ||
      itemIds.some((itemId, index) => itemId !== frontierItemIds[index])
    ) {
      throw new CoreV2OfflineContractError(
        'INVENTORY_FRONTIER_ITEM_SET_MISMATCH',
        'inventoryFrontierReference.items'
      )
    }
    if (
      payload.idempotencyKey !== input.idempotencyKey ||
      payload.inventorySnapshotId !== frontier.snapshotId ||
      payload.inventoryFrontierVersion !== frontier.frontierVersion ||
      payload.itemReferences.some(
        (item, index) => item.quantity !== frontier.items[index].requestedQuantity
      )
    ) {
      throw new CoreV2OfflineContractError(
        'INVENTORY_FRONTIER_QUANTITY_MISMATCH',
        'inventoryFrontierReference.items'
      )
    }
    requireExactDependencySet(input.dependencyReferences, [
      payload.paymentAttestationCommandId,
      ...(payload.customerReference.kind === 'local'
        ? [payload.customerReference.id]
        : []),
    ])
    return
  }
  if (input.commandType === 'order.status.change') {
    const payload = input.payload as CoreV2OfflineCommandPayload<'order.status.change'>
    if (payload.orderReference.id !== input.aggregateReference) {
      throw new CoreV2OfflineContractError(
        'COMMAND_AGGREGATE_IDENTITY_MISMATCH',
        'payload.orderReference'
      )
    }
    requireExactDependencySet(
      input.dependencyReferences,
      payload.orderReference.kind === 'local' ? [payload.orderReference.id] : []
    )
    return
  }
  if (input.commandType === 'customer.create' || input.commandType === 'customer.update') {
    const payload = input.payload as
      | CoreV2OfflineCommandPayload<'customer.create'>
      | CoreV2OfflineCommandPayload<'customer.update'>
    if (payload.aggregateReference !== input.aggregateReference) {
      throw new CoreV2OfflineContractError(
        'COMMAND_AGGREGATE_IDENTITY_MISMATCH',
        'payload.aggregateReference'
      )
    }
    requireExactDependencySet(input.dependencyReferences, [])
    return
  }
  if (input.commandType === 'payment.employee_attestation') {
    const payload = input.payload as CoreV2OfflineCommandPayload<'payment.employee_attestation'>
    const attestation = input.paymentAttestation
    if (!attestation) {
      throw new CoreV2OfflineContractError(
        'PAYMENT_ATTESTATION_REQUIRED',
        'paymentAttestation'
      )
    }
    if (
      payload.orderAggregateReference !== input.aggregateReference ||
      attestation.attestationCommandId !== input.localCommandId ||
      attestation.orderAggregateReference !== payload.orderAggregateReference ||
      attestation.method !== payload.paymentMethod ||
      attestation.amount !== payload.amount ||
      attestation.currency !== payload.currency
    ) {
      throw new CoreV2OfflineContractError(
        'PAYMENT_ATTESTATION_BINDING_MISMATCH',
        'paymentAttestation'
      )
    }
    requireExactDependencySet(input.dependencyReferences, [])
    return
  }
  if (input.commandType === 'audit.event.append') {
    const payload = input.payload as CoreV2OfflineCommandPayload<'audit.event.append'>
    if (payload.aggregateReference !== input.aggregateReference) {
      throw new CoreV2OfflineContractError(
        'COMMAND_AGGREGATE_IDENTITY_MISMATCH',
        'payload.aggregateReference'
      )
    }
    requireExactDependencySet(input.dependencyReferences, [payload.causalCommandId])
    return
  }
  if (input.commandType === 'order.cancel') {
    const payload = input.payload as CoreV2OfflineCommandPayload<'order.cancel'>
    if (payload.orderReference.id !== input.aggregateReference) {
      throw new CoreV2OfflineContractError(
        'COMMAND_AGGREGATE_IDENTITY_MISMATCH',
        'payload.orderReference'
      )
    }
    requireExactDependencySet(
      input.dependencyReferences,
      payload.orderReference.kind === 'local' ? [payload.orderReference.id] : []
    )
    return
  }
  const payload = input.payload as CoreV2OfflineCommandPayload<'payment.refund'>
  if (payload.paymentReference !== input.aggregateReference) {
    throw new CoreV2OfflineContractError(
      'COMMAND_AGGREGATE_IDENTITY_MISMATCH',
      'payload.paymentReference'
    )
  }
  requireExactDependencySet(
    input.dependencyReferences,
    payload.orderReference.kind === 'local' ? [payload.orderReference.id] : []
  )
}

export function parseCoreV2OfflineCommandEnvelope(
  value: unknown
): CoreV2OfflineCommandEnvelope {
  const record = readExactRecord(value, 'envelope', ENVELOPE_KEYS)
  if (!CORE_V2_OFFLINE_SCHEMA_VERSIONS.includes(record.schemaVersion as 1)) {
    throw new CoreV2OfflineContractError(
      'UNSUPPORTED_SCHEMA_VERSION',
      'schemaVersion'
    )
  }
  if (!COMMAND_TYPE_SET.has(String(record.commandType))) {
    throw new CoreV2OfflineContractError(
      'UNREGISTERED_COMMAND_TYPE',
      'commandType'
    )
  }
  const expectedContractVersion =
    record.commandType === 'order.create'
      ? CORE_V2_OFFLINE_ORDER_CREATE_CONTRACT_VERSION
      : CORE_V2_OFFLINE_SHADOW_CONTRACT_VERSION
  if (record.commandContractVersion !== expectedContractVersion) {
    throw new CoreV2OfflineContractError(
      'COMMAND_CONTRACT_VERSION_MISMATCH',
      'commandContractVersion'
    )
  }
  if (
    typeof record.idempotencyKey !== 'string' ||
    !IDEMPOTENCY_KEY_PATTERN.test(record.idempotencyKey)
  ) {
    throw new CoreV2OfflineContractError(
      'INVALID_IDEMPOTENCY_KEY',
      'idempotencyKey'
    )
  }
  if (
    typeof record.payloadCanonicalHash !== 'string' ||
    !SHA256_PATTERN.test(record.payloadCanonicalHash)
  ) {
    throw new CoreV2OfflineContractError(
      'INVALID_PAYLOAD_HASH',
      'payloadCanonicalHash'
    )
  }
  if (
    typeof record.authorityBindingCanonicalHash !== 'string' ||
    !SHA256_PATTERN.test(record.authorityBindingCanonicalHash)
  ) {
    throw new CoreV2OfflineContractError(
      'INVALID_AUTHORITY_BINDING_HASH',
      'authorityBindingCanonicalHash'
    )
  }
  if (
    !Array.isArray(record.dependencyReferences) ||
    record.dependencyReferences.length >
      CORE_V2_OFFLINE_LIMITS.maximumDependencyCount
  ) {
    throw new CoreV2OfflineContractError(
      'DEPENDENCY_BATCH_EXCEEDED',
      'dependencyReferences'
    )
  }
  const dependencyReferences = record.dependencyReferences.map((id, index) =>
    requireUuid(id, `dependencyReferences[${index}]`)
  )
  if (new Set(dependencyReferences).size !== dependencyReferences.length) {
    throw new CoreV2OfflineContractError(
      'DUPLICATE_DEPENDENCY',
      'dependencyReferences'
    )
  }
  const aggregateId =
    record.aggregateId === null
      ? null
      : requireUuid(record.aggregateId, 'aggregateId')
  const localAggregateReference =
    record.localAggregateReference === null
      ? null
      : requireSafeIdentifier(
          record.localAggregateReference,
          'localAggregateReference'
        )
  if ((aggregateId === null) === (localAggregateReference === null)) {
    throw new CoreV2OfflineContractError(
      'AMBIGUOUS_AGGREGATE_IDENTITY',
      'aggregateId'
    )
  }
  if (
    !['order', 'customer', 'payment', 'audit'].includes(
      String(record.aggregateType)
    )
  ) {
    throw new CoreV2OfflineContractError('INVALID_AGGREGATE_TYPE', 'aggregateType')
  }
  if (
    typeof record.clientApplicationVersion !== 'string' ||
    !APPLICATION_VERSION_PATTERN.test(record.clientApplicationVersion)
  ) {
    throw new CoreV2OfflineContractError(
      'INVALID_CLIENT_APPLICATION_VERSION',
      'clientApplicationVersion'
    )
  }
  const commandType = record.commandType as CoreV2OfflineCommandType
  const aggregateType =
    record.aggregateType as CoreV2OfflineCommandEnvelope['aggregateType']
  const localCommandId = requireUuid(record.localCommandId, 'localCommandId')
  const primaryAuthenticatedUserId = requireUuid(
    record.primaryAuthenticatedUserId,
    'primaryAuthenticatedUserId'
  )
  const tenantId = requireUuid(record.tenantId, 'tenantId')
  const branchId = requireUuid(record.branchId, 'branchId')
  const actualPosEmployeeId = requireUuid(
    record.actualPosEmployeeId,
    'actualPosEmployeeId'
  )
  const deviceId = requireUuid(record.deviceId, 'deviceId')
  const deviceGeneration = requirePositiveGeneration(
    record.deviceGeneration,
    'deviceGeneration'
  )
  const employeeEnrollmentGeneration = requirePositiveGeneration(
    record.employeeEnrollmentGeneration,
    'employeeEnrollmentGeneration'
  )
  const commandGeneration = requirePositiveGeneration(
    record.commandGeneration,
    'commandGeneration'
  )
  const keyEnvelopeId = requireUuid(record.keyEnvelopeId, 'keyEnvelopeId')
  const keyEnvelopeVersion = requirePositiveGeneration(
    record.keyEnvelopeVersion,
    'keyEnvelopeVersion'
  )
  const originAuthorityReference = parseOriginAuthorityReference(
    record.originAuthorityReference
  )
  assertOriginAuthorityCorrespondence({
    origin: originAuthorityReference,
    primaryAuthenticatedUserId,
    tenantId,
    branchId,
    deviceId,
    deviceGeneration,
    actualPosEmployeeId,
    employeeEnrollmentGeneration,
    commandGeneration,
    keyEnvelopeId,
    keyEnvelopeVersion,
  })
  const payload = parseCoreV2OfflineCommandPayload(commandType, record.payload)
  const canonicalPayload = canonicalizeOfflineReplayPayload(payload)
  if (
    sha256OfflineReplayPayload(canonicalPayload) !== record.payloadCanonicalHash
  ) {
    throw new CoreV2OfflineContractError(
      'PAYLOAD_HASH_MISMATCH',
      'payloadCanonicalHash'
    )
  }
  const paymentAttestation = parsePaymentAttestation(record.paymentAttestation)
  const inventoryFrontierReference = parseInventoryFrontierReference(
    record.inventoryFrontierReference
  )
  const authorityBindingCanonicalHash =
    (commandType === 'order.create'
      ? computeCoreV2OfflineOrderCreateAuthorityBindingCanonicalHash
      : computeCoreV2OfflineAuthorityBindingCanonicalHash)({
      commandContractVersion: expectedContractVersion,
      schemaVersion: 1,
      localCommandId,
      idempotencyKey: record.idempotencyKey,
      commandType,
      primaryAuthenticatedUserId,
      tenantId,
      branchId,
      actualPosEmployeeId,
      deviceId,
      deviceGeneration,
      employeeEnrollmentGeneration,
      commandGeneration,
      keyEnvelopeId,
      keyEnvelopeVersion,
      aggregateType,
      aggregateId,
      localAggregateReference,
      payloadCanonicalHash: record.payloadCanonicalHash,
      paymentAttestation,
      inventoryFrontierReference,
      originAuthorityReference,
    })
  if (authorityBindingCanonicalHash !== record.authorityBindingCanonicalHash) {
    throw new CoreV2OfflineContractError(
      'AUTHORITY_BINDING_HASH_MISMATCH',
      'authorityBindingCanonicalHash'
    )
  }
  validateEnvelopeCommandSemantics({
    commandType,
    aggregateType,
    aggregateReference: envelopeAggregateReference(
      aggregateId,
      localAggregateReference
    ),
    localCommandId,
    idempotencyKey: record.idempotencyKey,
    primaryAuthenticatedUserId,
    tenantId,
    branchId,
    actualPosEmployeeId,
    deviceId,
    deviceGeneration,
    employeeEnrollmentGeneration,
    commandGeneration,
    payload,
    dependencyReferences,
    paymentAttestation,
    inventoryFrontierReference,
  })
  return Object.freeze({
    localCommandId,
    idempotencyKey: record.idempotencyKey,
    commandType,
    commandContractVersion: expectedContractVersion,
    schemaVersion: 1,
    primaryAuthenticatedUserId,
    tenantId,
    branchId,
    actualPosEmployeeId,
    deviceId,
    deviceGeneration,
    employeeEnrollmentGeneration,
    commandGeneration,
    aggregateType,
    aggregateId,
    localAggregateReference,
    localCreatedAt: requireIsoTimestamp(record.localCreatedAt, 'localCreatedAt'),
    payload,
    payloadCanonicalHash: record.payloadCanonicalHash,
    authorityBindingCanonicalHash,
    dependencyReferences: Object.freeze(dependencyReferences),
    paymentAttestation,
    inventoryFrontierReference,
    keyEnvelopeId,
    keyEnvelopeVersion,
    originAuthorityReference,
    clientApplicationVersion: record.clientApplicationVersion,
  })
}

export function parseStableServerReceipt(value: unknown): StableServerReceipt {
  const record = readExactRecord(value, 'receipt', RECEIPT_KEYS)
  if (
    record.receiptVersion !== 1 ||
    record.commandContractVersion !==
      CORE_V2_OFFLINE_ORDER_CREATE_CONTRACT_VERSION ||
    (record.disposition !== 'completed' && record.disposition !== 'rejected') ||
    record.retryable !== false ||
    typeof record.idempotencyKey !== 'string' ||
    !IDEMPOTENCY_KEY_PATTERN.test(record.idempotencyKey) ||
    typeof record.payloadCanonicalHash !== 'string' ||
    !SHA256_PATTERN.test(record.payloadCanonicalHash) ||
    typeof record.authorityBindingCanonicalHash !== 'string' ||
    !SHA256_PATTERN.test(record.authorityBindingCanonicalHash) ||
    typeof record.resultCode !== 'string' ||
    !RESULT_CODE_PATTERN.test(record.resultCode) ||
    (record.responseReference !== null &&
      (typeof record.responseReference !== 'string' ||
        !SAFE_IDENTIFIER_PATTERN.test(record.responseReference)))
  ) {
    throw new CoreV2OfflineContractError('INVALID_STABLE_RECEIPT', 'receipt')
  }
  return Object.freeze({
    receiptVersion: 1,
    commandContractVersion: CORE_V2_OFFLINE_ORDER_CREATE_CONTRACT_VERSION,
    serverCommandId: requireUuid(record.serverCommandId, 'receipt.serverCommandId'),
    idempotencyKey: record.idempotencyKey,
    payloadCanonicalHash: record.payloadCanonicalHash,
    authorityBindingCanonicalHash: record.authorityBindingCanonicalHash,
    originAuthorityReference: parseOriginAuthorityReference(
      record.originAuthorityReference,
      'receipt.originAuthorityReference'
    ),
    disposition: record.disposition,
    resultCode: record.resultCode,
    completedAt: requireIsoTimestamp(record.completedAt, 'receipt.completedAt'),
    responseReference: record.responseReference,
    retryable: false,
  })
}

export function parseExistingIdempotencyAcquisition(
  value: unknown
): ExistingIdempotencyAcquisition {
  const record = readExactRecord(value, 'existingAcquisition', ACQUISITION_KEYS)
  if (!COMMAND_TYPE_SET.has(String(record.commandType))) {
    throw new CoreV2OfflineContractError(
      'UNREGISTERED_COMMAND_TYPE',
      'existingAcquisition.commandType'
    )
  }
  if (
    record.commandContractVersion !==
      CORE_V2_OFFLINE_ORDER_CREATE_CONTRACT_VERSION ||
    typeof record.idempotencyKey !== 'string' ||
    !IDEMPOTENCY_KEY_PATTERN.test(record.idempotencyKey) ||
    typeof record.payloadCanonicalHash !== 'string' ||
    !SHA256_PATTERN.test(record.payloadCanonicalHash) ||
    typeof record.authorityBindingCanonicalHash !== 'string' ||
    !SHA256_PATTERN.test(record.authorityBindingCanonicalHash) ||
    !['in_progress', 'completed', 'rejected', 'infrastructure_failure'].includes(
      String(record.state)
    )
  ) {
    throw new CoreV2OfflineContractError(
      'INVALID_IDEMPOTENCY_RECORD',
      'existingAcquisition'
    )
  }
  const state = record.state as ExistingIdempotencyAcquisition['state']
  const receipt =
    state === 'completed' || state === 'rejected'
      ? parseStableServerReceipt(record.receipt)
      : null
  if (
    ((state === 'in_progress' || state === 'infrastructure_failure') &&
      record.receipt !== null) ||
    ((state === 'completed' || state === 'rejected') && !receipt)
  ) {
    throw new CoreV2OfflineContractError(
      'INVALID_IDEMPOTENCY_RECORD',
      'existingAcquisition.receipt'
    )
  }
  const originAuthorityReference = parseOriginAuthorityReference(
    record.originAuthorityReference,
    'existingAcquisition.originAuthorityReference'
  )
  const acquisition = Object.freeze({
    serverCommandId: requireUuid(
      record.serverCommandId,
      'existingAcquisition.serverCommandId'
    ),
    commandContractVersion: CORE_V2_OFFLINE_ORDER_CREATE_CONTRACT_VERSION,
    primaryAuthenticatedUserId: requireUuid(
      record.primaryAuthenticatedUserId,
      'existingAcquisition.primaryAuthenticatedUserId'
    ),
    tenantId: requireUuid(record.tenantId, 'existingAcquisition.tenantId'),
    branchId: requireUuid(record.branchId, 'existingAcquisition.branchId'),
    actualPosEmployeeId: requireUuid(
      record.actualPosEmployeeId,
      'existingAcquisition.actualPosEmployeeId'
    ),
    deviceId: requireUuid(record.deviceId, 'existingAcquisition.deviceId'),
    deviceGeneration: requirePositiveGeneration(
      record.deviceGeneration,
      'existingAcquisition.deviceGeneration'
    ),
    employeeEnrollmentGeneration: requirePositiveGeneration(
      record.employeeEnrollmentGeneration,
      'existingAcquisition.employeeEnrollmentGeneration'
    ),
    commandGeneration: requirePositiveGeneration(
      record.commandGeneration,
      'existingAcquisition.commandGeneration'
    ),
    commandType: record.commandType as CoreV2OfflineCommandType,
    idempotencyKey: record.idempotencyKey,
    payloadCanonicalHash: record.payloadCanonicalHash,
    authorityBindingCanonicalHash: record.authorityBindingCanonicalHash,
    originAuthorityReference,
    state,
    receipt,
  })
  assertOriginAuthorityCorrespondence({
    origin: originAuthorityReference,
    primaryAuthenticatedUserId: acquisition.primaryAuthenticatedUserId,
    tenantId: acquisition.tenantId,
    branchId: acquisition.branchId,
    deviceId: acquisition.deviceId,
    deviceGeneration: acquisition.deviceGeneration,
    actualPosEmployeeId: acquisition.actualPosEmployeeId,
    employeeEnrollmentGeneration: acquisition.employeeEnrollmentGeneration,
    commandGeneration: acquisition.commandGeneration,
    keyEnvelopeId: originAuthorityReference.keyEnvelopeId,
    keyEnvelopeVersion: originAuthorityReference.keyEnvelopeVersion,
  })
  return acquisition
}

export function classifyIdempotencyAcquisition(
  envelope: CoreV2OfflineCommandEnvelope,
  value: ExistingIdempotencyAcquisition | null
): IdempotencyAcquisitionClassification {
  if (!value) return Object.freeze({ kind: 'first_acquisition_candidate' })
  const existing = parseExistingIdempotencyAcquisition(value)
  const serverCommandId = existing.serverCommandId
  if (existing.idempotencyKey !== envelope.idempotencyKey) {
    throw new CoreV2OfflineContractError(
      'IDEMPOTENCY_LOOKUP_IDENTITY_INVALID',
      'existingAcquisition.idempotencyKey'
    )
  }
  const scopeConflict =
    existing.commandContractVersion !== envelope.commandContractVersion
      ? 'ACQUISITION_CONTRACT_VERSION_CONFLICT'
      : existing.primaryAuthenticatedUserId !== envelope.primaryAuthenticatedUserId
      ? 'ACQUISITION_AUTHENTICATED_ACTOR_CONFLICT'
      : existing.tenantId !== envelope.tenantId
        ? 'ACQUISITION_TENANT_CONFLICT'
        : existing.branchId !== envelope.branchId
          ? 'ACQUISITION_BRANCH_CONFLICT'
          : existing.actualPosEmployeeId !== envelope.actualPosEmployeeId
            ? 'ACQUISITION_POS_EMPLOYEE_CONFLICT'
            : existing.deviceId !== envelope.deviceId
              ? 'ACQUISITION_DEVICE_CONFLICT'
              : existing.deviceGeneration !== envelope.deviceGeneration ||
                  existing.employeeEnrollmentGeneration !==
                    envelope.employeeEnrollmentGeneration ||
                  existing.commandGeneration !== envelope.commandGeneration
                ? 'ACQUISITION_GENERATION_CONFLICT'
                : !originAuthorityReferenceEquals(
                      existing.originAuthorityReference,
                      envelope.originAuthorityReference
                    )
                  ? 'ACQUISITION_ORIGIN_AUTHORITY_CONFLICT'
                : existing.commandType !== envelope.commandType
                  ? 'ACQUISITION_COMMAND_TYPE_CONFLICT'
                  : null
  if (scopeConflict) {
    return Object.freeze({
      kind: 'true_idempotency_conflict',
      serverCommandId,
      code: scopeConflict,
    })
  }
  if (existing.payloadCanonicalHash !== envelope.payloadCanonicalHash) {
    return Object.freeze({
      kind: 'true_idempotency_conflict',
      serverCommandId,
      code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
    })
  }
  if (
    existing.authorityBindingCanonicalHash !==
    envelope.authorityBindingCanonicalHash
  ) {
    return Object.freeze({
      kind: 'true_idempotency_conflict',
      serverCommandId,
      code: 'IDEMPOTENCY_AUTHORITY_BINDING_CONFLICT',
    })
  }
  if (existing.state === 'infrastructure_failure') {
    return Object.freeze({ kind: 'retryable_infrastructure_failure' })
  }
  if (existing.state === 'in_progress') {
    if (existing.receipt !== null) {
      throw new CoreV2OfflineContractError(
        'INVALID_IDEMPOTENCY_RECORD',
        'existingAcquisition.receipt'
      )
    }
    return Object.freeze({ kind: 'duplicate_in_progress', serverCommandId })
  }
  const receipt = existing.receipt as StableServerReceipt
  if (
    receipt.serverCommandId !== serverCommandId ||
    receipt.idempotencyKey !== envelope.idempotencyKey ||
    receipt.payloadCanonicalHash !== envelope.payloadCanonicalHash ||
    receipt.authorityBindingCanonicalHash !==
      envelope.authorityBindingCanonicalHash ||
    receipt.commandContractVersion !== envelope.commandContractVersion ||
    !originAuthorityReferenceEquals(
      receipt.originAuthorityReference,
      envelope.originAuthorityReference
    ) ||
    receipt.disposition !== existing.state
  ) {
    return Object.freeze({
      kind: 'true_idempotency_conflict',
      serverCommandId,
      code: 'RECEIPT_IDENTITY_CONFLICT',
    })
  }
  return Object.freeze({
    kind:
      existing.state === 'completed'
        ? 'stable_completed_receipt_replay'
        : 'stable_rejected_receipt',
    serverCommandId,
    receipt,
  })
}

function parseTrustedInventoryFrontier(
  value: unknown
): TrustedInventoryFrontier | null {
  if (value === null) return null
  const record = readExactRecord(
    value,
    'authority.inventoryFrontier',
    TRUSTED_FRONTIER_KEYS
  )
  if (
    record.source !== 'trusted_server' ||
    !Array.isArray(record.items) ||
    record.items.length > CORE_V2_OFFLINE_LIMITS.maximumTrustedInventoryItems
  ) {
    throw new CoreV2OfflineContractError(
      'INVALID_TRUSTED_INVENTORY_FRONTIER',
      'authority.inventoryFrontier'
    )
  }
  const seen = new Set<string>()
  const items = record.items.map((item, index) => {
    const itemRecord = readExactRecord(
      item,
      `authority.inventoryFrontier.items[${index}]`,
      TRUSTED_FRONTIER_ITEM_KEYS
    )
    const catalogItemId = requireUuid(
      itemRecord.catalogItemId,
      `authority.inventoryFrontier.items[${index}].catalogItemId`
    )
    if (
      seen.has(catalogItemId) ||
      !Number.isSafeInteger(itemRecord.confirmedStock) ||
      Number(itemRecord.confirmedStock) < 0
    ) {
      throw new CoreV2OfflineContractError(
        'INVALID_TRUSTED_INVENTORY_FRONTIER',
        `authority.inventoryFrontier.items[${index}]`
      )
    }
    seen.add(catalogItemId)
    return Object.freeze({
      catalogItemId,
      confirmedStock: Number(itemRecord.confirmedStock),
    })
  })
  items.sort((left, right) =>
    left.catalogItemId < right.catalogItemId
      ? -1
      : left.catalogItemId > right.catalogItemId
        ? 1
        : 0
  )
  return Object.freeze({
    source: 'trusted_server',
    tenantId: requireUuid(
      record.tenantId,
      'authority.inventoryFrontier.tenantId'
    ),
    branchId: requireUuid(
      record.branchId,
      'authority.inventoryFrontier.branchId'
    ),
    snapshotId: requireUuid(
      record.snapshotId,
      'authority.inventoryFrontier.snapshotId'
    ),
    serverConfirmedAt: requireIsoTimestamp(
      record.serverConfirmedAt,
      'authority.inventoryFrontier.serverConfirmedAt'
    ),
    frontierVersion: requireSafeIdentifier(
      record.frontierVersion,
      'authority.inventoryFrontier.frontierVersion'
    ),
    items: Object.freeze(items),
  })
}

export function parseTrustedCoreV2OfflineAuthoritySnapshot(
  value: unknown,
  expectedClaims?: CoreV2OfflineAuthorityClaims
): TrustedCoreV2OfflineAuthoritySnapshot {
  const record = readExactRecord(value, 'authority', AUTHORITY_KEYS)
  if (
    record.source !== 'trusted_server' ||
    typeof record.employeeRevoked !== 'boolean' ||
    typeof record.deviceRevoked !== 'boolean' ||
    record.keyEnvelopeValidated !== true ||
    typeof record.coreV2Available !== 'boolean' ||
    !Array.isArray(record.supportedCommandTypes) ||
    record.supportedCommandTypes.length > CORE_V2_OFFLINE_COMMAND_TYPES.length
  ) {
    throw new CoreV2OfflineContractError('INVALID_AUTHORITY_SNAPSHOT', 'authority')
  }
  const supportedCommandTypes = record.supportedCommandTypes.map(
    (commandType, index) => {
      if (!COMMAND_TYPE_SET.has(String(commandType))) {
        throw new CoreV2OfflineContractError(
          'INVALID_AUTHORITY_SNAPSHOT',
          `authority.supportedCommandTypes[${index}]`
        )
      }
      return commandType as CoreV2OfflineCommandType
    }
  )
  if (new Set(supportedCommandTypes).size !== supportedCommandTypes.length) {
    throw new CoreV2OfflineContractError(
      'INVALID_AUTHORITY_SNAPSHOT',
      'authority.supportedCommandTypes'
    )
  }
  supportedCommandTypes.sort()
  const authority = Object.freeze({
    source: 'trusted_server' as const,
    authorityVersion: requireSafeIdentifier(
      record.authorityVersion,
      'authority.authorityVersion'
    ),
    resolvedAtServer: requireIsoTimestamp(
      record.resolvedAtServer,
      'authority.resolvedAtServer'
    ),
    primaryAuthenticatedUserId: requireUuid(
      record.primaryAuthenticatedUserId,
      'authority.primaryAuthenticatedUserId'
    ),
    tenantId: requireUuid(record.tenantId, 'authority.tenantId'),
    branchId: requireUuid(record.branchId, 'authority.branchId'),
    actualPosEmployeeId: requireUuid(
      record.actualPosEmployeeId,
      'authority.actualPosEmployeeId'
    ),
    deviceId: requireUuid(record.deviceId, 'authority.deviceId'),
    deviceGeneration: requirePositiveGeneration(
      record.deviceGeneration,
      'authority.deviceGeneration'
    ),
    employeeEnrollmentGeneration: requirePositiveGeneration(
      record.employeeEnrollmentGeneration,
      'authority.employeeEnrollmentGeneration'
    ),
    commandGeneration: requirePositiveGeneration(
      record.commandGeneration,
      'authority.commandGeneration'
    ),
    keyEnvelopeId: requireUuid(
      record.keyEnvelopeId,
      'authority.keyEnvelopeId'
    ),
    keyEnvelopeVersion: requirePositiveGeneration(
      record.keyEnvelopeVersion,
      'authority.keyEnvelopeVersion'
    ),
    originAuthorityReference: parseOriginAuthorityReference(
      record.originAuthorityReference,
      'authority.originAuthorityReference'
    ),
    keyEnvelopeValidated: true as const,
    employeeRevoked: record.employeeRevoked,
    deviceRevoked: record.deviceRevoked,
    supportedCommandTypes: Object.freeze(supportedCommandTypes),
    inventoryFrontier: parseTrustedInventoryFrontier(record.inventoryFrontier),
    coreV2Available: record.coreV2Available,
  })
  if (
    expectedClaims &&
    (authority.primaryAuthenticatedUserId !==
      expectedClaims.primaryAuthenticatedUserId ||
      authority.tenantId !== expectedClaims.tenantId ||
      authority.branchId !== expectedClaims.branchId ||
      authority.actualPosEmployeeId !== expectedClaims.actualPosEmployeeId ||
      authority.deviceId !== expectedClaims.deviceId ||
      authority.deviceGeneration !== expectedClaims.deviceGeneration ||
      authority.employeeEnrollmentGeneration !==
        expectedClaims.employeeEnrollmentGeneration ||
      authority.commandGeneration !== expectedClaims.commandGeneration ||
      authority.keyEnvelopeId !== expectedClaims.keyEnvelopeId ||
      authority.keyEnvelopeVersion !== expectedClaims.keyEnvelopeVersion ||
      !originAuthorityReferenceEquals(
        authority.originAuthorityReference,
        expectedClaims.originAuthorityReference
      ))
  ) {
    throw new CoreV2OfflineContractError(
      'AUTHORITY_RESOLUTION_CORRESPONDENCE_MISMATCH',
      'authority'
    )
  }
  return authority
}

export function parseCoreV2OfflineAuthorityResolution(
  value: unknown,
  expectedClaims: CoreV2OfflineAuthorityClaims
): CoreV2OfflineAuthorityResolution {
  if (!isPlainRecord(value) || typeof value.available !== 'boolean') {
    throw new CoreV2OfflineContractError('INVALID_AUTHORITY_RESOLUTION', 'resolution')
  }
  if (value.available === false) {
    const record = readExactRecord(
      value,
      'resolution',
      UNAVAILABLE_RESOLUTION_KEYS
    )
    if (
      record.position !== expectedClaims.position ||
      record.claimBindingHash !== expectedClaims.claimBindingHash ||
      record.code !== CORE_V2_OFFLINE_AUTHORITY_UNAVAILABLE ||
      typeof record.retryable !== 'boolean'
    ) {
      throw new CoreV2OfflineContractError(
        'INVALID_AUTHORITY_RESOLUTION',
        'resolution'
      )
    }
    return Object.freeze({
      position: expectedClaims.position,
      claimBindingHash: expectedClaims.claimBindingHash,
      available: false,
      code: CORE_V2_OFFLINE_AUTHORITY_UNAVAILABLE,
      retryable: record.retryable,
    })
  }
  const record = readExactRecord(value, 'resolution', AVAILABLE_RESOLUTION_KEYS)
  if (
    record.position !== expectedClaims.position ||
    record.claimBindingHash !== expectedClaims.claimBindingHash
  ) {
    throw new CoreV2OfflineContractError(
      'AUTHORITY_RESOLUTION_CORRESPONDENCE_MISMATCH',
      'resolution'
    )
  }
  return Object.freeze({
    position: expectedClaims.position,
    claimBindingHash: expectedClaims.claimBindingHash,
    available: true,
    authority: parseTrustedCoreV2OfflineAuthoritySnapshot(
      record.authority,
      expectedClaims
    ),
  })
}

const UNAVAILABLE_RESOLVER: CoreV2OfflineAuthorityResolver = Object.freeze({
  resolveBatch: async (claims: readonly CoreV2OfflineAuthorityClaims[]) =>
    Object.freeze(
      claims.map((claim) =>
        Object.freeze({
          position: claim.position,
          claimBindingHash: claim.claimBindingHash,
          available: false as const,
          code: CORE_V2_OFFLINE_AUTHORITY_UNAVAILABLE,
          retryable: false,
        })
      )
    ),
})

export function createUnavailableCoreV2OfflineAuthorityResolver(): CoreV2OfflineAuthorityResolver {
  return UNAVAILABLE_RESOLVER
}

function result(
  localCommandId: string | null,
  outcome: CoreV2OfflineQualificationOutcome,
  code: string,
  retryable: boolean,
  checkedStages: readonly CoreV2OfflineQualificationStage[],
  idempotency: IdempotencyAcquisitionClassification | null,
  receipt: StableServerReceipt | null = null
): CoreV2OfflineQualificationResult {
  return Object.freeze({
    localCommandId,
    outcome,
    code,
    retryable,
    checkedStages: Object.freeze([...checkedStages]),
    idempotency,
    receipt,
  })
}

function validateDependencyReadiness(
  envelope: CoreV2OfflineCommandEnvelope,
  states: readonly OfflineDependencyState[]
): { outcome: 'pass' } | { outcome: 'blocked' | 'conflict'; code: string } {
  const byId = new Map<string, CoreV2OfflineLocalState>()
  for (const state of states) {
    const id = requireUuid(state.localCommandId, 'dependencyStates.localCommandId')
    if (byId.has(id)) {
      throw new CoreV2OfflineContractError(
        'DUPLICATE_DEPENDENCY_STATE',
        'dependencyStates'
      )
    }
    byId.set(id, state.state)
  }
  for (const dependencyId of envelope.dependencyReferences) {
    const dependencyState = byId.get(dependencyId)
    if (dependencyState === 'conflict') {
      return { outcome: 'conflict', code: 'DEPENDENCY_CONFLICT' }
    }
    if (dependencyState !== 'synced') {
      return { outcome: 'blocked', code: 'DEPENDENCY_NOT_READY' }
    }
  }
  return { outcome: 'pass' }
}

function validateTrustedInventoryFrontier(
  envelope: CoreV2OfflineCommandEnvelope,
  authority: TrustedCoreV2OfflineAuthoritySnapshot
): string | null {
  const required = envelope.commandType === 'order.create'
  const reference = envelope.inventoryFrontierReference
  if (!required && reference === null) return null
  if (!reference || !authority.inventoryFrontier) {
    return TRUSTED_INVENTORY_FRONTIER_UNAVAILABLE
  }
  const frontier = authority.inventoryFrontier
  if (
    frontier.source !== 'trusted_server' ||
    frontier.tenantId !== envelope.tenantId ||
    frontier.branchId !== envelope.branchId ||
    frontier.snapshotId !== reference.snapshotId ||
    frontier.frontierVersion !== reference.frontierVersion ||
    reference.tenantId !== envelope.tenantId ||
    reference.branchId !== envelope.branchId
  ) {
    return 'INVENTORY_FRONTIER_MISMATCH'
  }
  requireIsoTimestamp(frontier.serverConfirmedAt, 'inventoryFrontier.serverConfirmedAt')
  const items = new Map<string, number>()
  for (const item of frontier.items) {
    const id = requireUuid(item.catalogItemId, 'inventoryFrontier.catalogItemId')
    if (
      items.has(id) ||
      !Number.isSafeInteger(item.confirmedStock) ||
      item.confirmedStock < 0
    ) {
      return 'INVALID_TRUSTED_INVENTORY_FRONTIER'
    }
    items.set(id, item.confirmedStock)
  }
  const payload = envelope.payload as CoreV2OfflineCommandPayload<'order.create'>
  if (
    reference.items.length !== payload.itemReferences.length ||
    reference.items.some(
      (item, index) =>
        item.catalogItemId !==
          payload.itemReferences[index].catalogItemReference ||
        item.requestedQuantity !== payload.itemReferences[index].quantity
    )
  ) {
    return 'INVENTORY_FRONTIER_ITEM_SET_MISMATCH'
  }
  for (const referenceItem of reference.items) {
    const confirmedStock = items.get(referenceItem.catalogItemId)
    if (confirmedStock === undefined) {
      return 'INVENTORY_FRONTIER_ITEM_MISSING'
    }
    const localAvailable = calculateCoreV2OfflineLocalAvailableQuantity({
      lastConfirmedBranchStock: confirmedStock,
      pendingLocalCommitments: referenceItem.pendingLocalCommitments,
      syncingLocalCommitments: referenceItem.syncingLocalCommitments,
    })
    if (referenceItem.requestedQuantity > localAvailable) {
      return localAvailable === 0
        ? 'INVENTORY_LOCAL_AVAILABLE_ZERO'
        : 'INVENTORY_QUANTITY_INSUFFICIENT'
    }
  }
  return null
}

function isPaymentAttestationRequired(commandType: CoreV2OfflineCommandType) {
  return commandType === 'order.create'
}

type PreparedCandidate = {
  index: number
  envelope: CoreV2OfflineCommandEnvelope
  input: CoreV2OfflineQualificationInput
  checkedStages: CoreV2OfflineQualificationStage[]
  idempotency: IdempotencyAcquisitionClassification
}

export async function qualifyCoreV2OfflineReplayBatch(
  inputs: readonly CoreV2OfflineQualificationInput[],
  resolver: CoreV2OfflineAuthorityResolver = UNAVAILABLE_RESOLVER
): Promise<readonly CoreV2OfflineQualificationResult[]> {
  if (inputs.length > CORE_V2_OFFLINE_LIMITS.maximumBatchSize) {
    throw new CoreV2OfflineContractError('COMMAND_BATCH_EXCEEDED', 'inputs')
  }
  const results: Array<CoreV2OfflineQualificationResult | undefined> =
    new Array(inputs.length)
  const prepared: PreparedCandidate[] = []
  for (const [index, input] of inputs.entries()) {
    const checkedStages: CoreV2OfflineQualificationStage[] = []
    let envelope: CoreV2OfflineCommandEnvelope
    try {
      envelope = parseCoreV2OfflineCommandEnvelope(input.envelope)
      checkedStages.push('schema_compatibility', 'canonical_payload_hash')
      const idempotency = classifyIdempotencyAcquisition(
        envelope,
        input.existingAcquisition
      )
      checkedStages.push('idempotency_identity')
      if (idempotency.kind === 'true_idempotency_conflict') {
        results[index] = result(
          envelope.localCommandId,
          'conflict',
          idempotency.code,
          false,
          checkedStages,
          idempotency
        )
        continue
      }
      if (idempotency.kind === 'duplicate_in_progress') {
        results[index] = result(
          envelope.localCommandId,
          'temporarily_unavailable',
          'IDEMPOTENCY_DUPLICATE_IN_PROGRESS',
          true,
          checkedStages,
          idempotency
        )
        continue
      }
      if (idempotency.kind === 'retryable_infrastructure_failure') {
        results[index] = result(
          envelope.localCommandId,
          'temporarily_unavailable',
          'IDEMPOTENCY_INFRASTRUCTURE_FAILURE',
          true,
          checkedStages,
          idempotency
        )
        continue
      }
      if (
        idempotency.kind === 'stable_completed_receipt_replay' ||
        idempotency.kind === 'stable_rejected_receipt'
      ) {
        prepared.push({ index, envelope, input, checkedStages, idempotency })
        continue
      }
      const dependency = validateDependencyReadiness(
        envelope,
        input.dependencyStates
      )
      checkedStages.push('dependency_readiness')
      if (dependency.outcome !== 'pass') {
        results[index] = result(
          envelope.localCommandId,
          dependency.outcome,
          dependency.code,
          false,
          checkedStages,
          idempotency
        )
        continue
      }
      prepared.push({ index, envelope, input, checkedStages, idempotency })
    } catch (error) {
      const contractError =
        error instanceof CoreV2OfflineContractError ? error : null
      results[index] = result(
        contractError?.field === 'payloadCanonicalHash'
          ? (isPlainRecord(input.envelope) &&
              typeof input.envelope.localCommandId === 'string'
              ? input.envelope.localCommandId
              : null)
          : null,
        contractError?.code === 'PAYLOAD_HASH_MISMATCH'
          ? 'conflict'
          : 'rejected',
        contractError?.code ?? 'OFFLINE_ENVELOPE_INVALID',
        false,
        checkedStages,
        null
      )
    }
  }
  if (prepared.length === 0) {
    return Object.freeze(results as CoreV2OfflineQualificationResult[])
  }
  const claims = Object.freeze(
    prepared.map(({ envelope }, position) => {
      const claim = Object.freeze({
        position,
        commandContractVersion: envelope.commandContractVersion,
        schemaVersion: envelope.schemaVersion,
        localCommandId: envelope.localCommandId,
        idempotencyKey: envelope.idempotencyKey,
        payloadCanonicalHash: envelope.payloadCanonicalHash,
        authorityBindingCanonicalHash:
          envelope.authorityBindingCanonicalHash,
        primaryAuthenticatedUserId: envelope.primaryAuthenticatedUserId,
        tenantId: envelope.tenantId,
        branchId: envelope.branchId,
        actualPosEmployeeId: envelope.actualPosEmployeeId,
        deviceId: envelope.deviceId,
        deviceGeneration: envelope.deviceGeneration,
        employeeEnrollmentGeneration: envelope.employeeEnrollmentGeneration,
        commandGeneration: envelope.commandGeneration,
        commandType: envelope.commandType,
        aggregateType: envelope.aggregateType,
        aggregateId: envelope.aggregateId,
        localAggregateReference: envelope.localAggregateReference,
        keyEnvelopeId: envelope.keyEnvelopeId,
        keyEnvelopeVersion: envelope.keyEnvelopeVersion,
        originAuthorityReference: envelope.originAuthorityReference,
        paymentAttestation: envelope.paymentAttestation,
        inventoryFrontierReference: envelope.inventoryFrontierReference,
      })
      return Object.freeze({
        ...claim,
        claimBindingHash: sha256OfflineReplayPayload(
          JSON.stringify(
            canonicalizeJson(
              claim,
              {
                depth: 0,
                nodes: 0,
                ancestors: new WeakSet<object>(),
              },
              'authorityClaim',
              false
            )
          )
        ),
      })
    })
  )
  let resolutions: readonly CoreV2OfflineAuthorityResolution[]
  try {
    const rawResolutions: unknown = await resolver.resolveBatch(claims)
    if (
      !Array.isArray(rawResolutions) ||
      rawResolutions.length !== prepared.length
    ) {
      throw new CoreV2OfflineContractError(
        'INVALID_AUTHORITY_RESOLUTION_COUNT',
        'resolutions'
      )
    }
    const seenPositions = new Set<number>()
    for (const [index, rawResolution] of rawResolutions.entries()) {
      if (
        !isPlainRecord(rawResolution) ||
        rawResolution.position !== claims[index].position ||
        rawResolution.claimBindingHash !== claims[index].claimBindingHash ||
        seenPositions.has(Number(rawResolution.position))
      ) {
        throw new CoreV2OfflineContractError(
          'INVALID_AUTHORITY_RESOLUTION_CORRESPONDENCE',
          'resolutions'
        )
      }
      seenPositions.add(Number(rawResolution.position))
    }
    resolutions = Object.freeze(
      rawResolutions.map((resolution, index) => {
        try {
          return parseCoreV2OfflineAuthorityResolution(
            resolution,
            claims[index]
          )
        } catch {
          return Object.freeze({
            position: claims[index].position,
            claimBindingHash: claims[index].claimBindingHash,
            available: false as const,
            code: CORE_V2_OFFLINE_AUTHORITY_UNAVAILABLE,
            retryable: true,
          })
        }
      })
    )
  } catch {
    resolutions = Object.freeze(
      claims.map((claim) =>
        Object.freeze({
          position: claim.position,
          claimBindingHash: claim.claimBindingHash,
          available: false as const,
          code: CORE_V2_OFFLINE_AUTHORITY_UNAVAILABLE,
          retryable: true,
        })
      )
    )
  }
  for (const [preparedIndex, candidate] of prepared.entries()) {
    const { envelope, input, checkedStages, idempotency } = candidate
    const resolution = resolutions[preparedIndex]
    checkedStages.push('tenant_branch_binding')
    if (!resolution.available) {
      results[candidate.index] = result(
        envelope.localCommandId,
        'blocked',
        resolution.code,
        resolution.retryable,
        checkedStages,
        idempotency
      )
      continue
    }
    const authority = resolution.authority
    if (
      authority.source !== 'trusted_server' ||
      authority.tenantId !== envelope.tenantId ||
      authority.branchId !== envelope.branchId
    ) {
      results[candidate.index] = result(
        envelope.localCommandId,
        'blocked',
        authority.tenantId !== envelope.tenantId
            ? 'TENANT_BINDING_MISMATCH'
            : 'BRANCH_BINDING_MISMATCH',
        false,
        checkedStages,
        idempotency
      )
      continue
    }
    checkedStages.push('pos_employee_binding')
    if (authority.actualPosEmployeeId !== envelope.actualPosEmployeeId) {
      results[candidate.index] = result(
        envelope.localCommandId,
        'blocked',
        'POS_EMPLOYEE_BINDING_MISMATCH',
        false,
        checkedStages,
        idempotency
      )
      continue
    }
    checkedStages.push('device_generation_binding')
    if (
      authority.deviceId !== envelope.deviceId ||
      authority.deviceGeneration !== envelope.deviceGeneration ||
      authority.employeeEnrollmentGeneration !==
        envelope.employeeEnrollmentGeneration ||
      authority.commandGeneration !== envelope.commandGeneration ||
      authority.keyEnvelopeId !== envelope.keyEnvelopeId ||
      authority.keyEnvelopeVersion !== envelope.keyEnvelopeVersion ||
      authority.keyEnvelopeValidated !== true ||
      !originAuthorityReferenceEquals(
        authority.originAuthorityReference,
        envelope.originAuthorityReference
      )
    ) {
      results[candidate.index] = result(
        envelope.localCommandId,
        'blocked',
        authority.deviceId !== envelope.deviceId
          ? 'DEVICE_BINDING_MISMATCH'
          : authority.keyEnvelopeId !== envelope.keyEnvelopeId ||
              authority.keyEnvelopeVersion !== envelope.keyEnvelopeVersion ||
              authority.keyEnvelopeValidated !== true
            ? 'KEY_ENVELOPE_BINDING_MISMATCH'
          : 'STALE_AUTHORITY_GENERATION',
        false,
        checkedStages,
        idempotency
      )
      continue
    }
    checkedStages.push('revocation_state')
    if (authority.employeeRevoked || authority.deviceRevoked) {
      results[candidate.index] = result(
        envelope.localCommandId,
        'blocked',
        authority.employeeRevoked ? 'POS_EMPLOYEE_REVOKED' : 'DEVICE_REVOKED',
        false,
        checkedStages,
        idempotency
      )
      continue
    }
    checkedStages.push('command_type_authority')
    if (!PILOT_COMMAND_TYPE_SET.has(envelope.commandType)) {
      results[candidate.index] = result(
        envelope.localCommandId,
        'blocked',
        'PILOT_COMMAND_DISPATCH_BLOCKED',
        false,
        checkedStages,
        idempotency
      )
      continue
    }
    if (
      idempotency.kind === 'stable_completed_receipt_replay' ||
      idempotency.kind === 'stable_rejected_receipt'
    ) {
      results[candidate.index] = result(
        envelope.localCommandId,
        'already_processed',
        idempotency.kind === 'stable_completed_receipt_replay'
          ? 'STABLE_COMPLETED_RECEIPT_REPLAY'
          : 'STABLE_REJECTED_RECEIPT',
        false,
        checkedStages,
        idempotency,
        idempotency.receipt
      )
      continue
    }
    if (!authority.supportedCommandTypes.includes(envelope.commandType)) {
      results[candidate.index] = result(
        envelope.localCommandId,
        'blocked',
        'COMMAND_AUTHORITY_UNAVAILABLE',
        false,
        checkedStages,
        idempotency
      )
      continue
    }
    checkedStages.push('inventory_frontier')
    const frontierError = validateTrustedInventoryFrontier(envelope, authority)
    if (frontierError) {
      results[candidate.index] = result(
        envelope.localCommandId,
        'blocked',
        frontierError,
        frontierError === TRUSTED_INVENTORY_FRONTIER_UNAVAILABLE,
        checkedStages,
        idempotency
      )
      continue
    }
    checkedStages.push('payment_attestation')
    if (
      isPaymentAttestationRequired(envelope.commandType) &&
      !envelope.paymentAttestation
    ) {
      results[candidate.index] = result(
        envelope.localCommandId,
        'rejected',
        'PAYMENT_ATTESTATION_REQUIRED',
        false,
        checkedStages,
        idempotency
      )
      continue
    }
    checkedStages.push('conflict_classification')
    if (input.detectedConflict) {
      results[candidate.index] = result(
        envelope.localCommandId,
        'conflict',
        input.detectedConflict.reasonCode,
        false,
        checkedStages,
        idempotency
      )
      continue
    }
    checkedStages.push('core_v2_availability')
    if (!authority.coreV2Available) {
      results[candidate.index] = result(
        envelope.localCommandId,
        'temporarily_unavailable',
        'CORE_V2_OFFLINE_CORE_UNAVAILABLE',
        true,
        checkedStages,
        idempotency
      )
      continue
    }
    results[candidate.index] = result(
      envelope.localCommandId,
      'qualified',
      'QUALIFIED_NO_MUTATION_AUTHORIZED',
      false,
      checkedStages,
      idempotency
    )
  }
  return Object.freeze(results as CoreV2OfflineQualificationResult[])
}

export async function qualifyCoreV2OfflineReplay(
  input: CoreV2OfflineQualificationInput,
  resolver: CoreV2OfflineAuthorityResolver = UNAVAILABLE_RESOLVER
): Promise<CoreV2OfflineQualificationResult> {
  return (await qualifyCoreV2OfflineReplayBatch([input], resolver))[0]
}

export function mapCoreV2OfflineReplayOutcome(input: Readonly<{
  currentState: CoreV2OfflineLocalState
  qualification: CoreV2OfflineQualificationResult
  transport:
    | 'not_attempted'
    | 'aborted'
    | 'timeout'
    | 'unknown_response'
    | 'http_2xx_without_receipt'
    | 'stable_receipt'
}>): Readonly<{
  state: CoreV2OfflineLocalState
  retained: true
  retryable: boolean
  receiptVerified: boolean
  code: string
}> {
  const receipt = input.qualification.receipt
  if (
    receipt &&
    (input.transport === 'stable_receipt' ||
      input.qualification.outcome === 'already_processed')
  ) {
    return Object.freeze({
      state: receipt.disposition === 'completed' ? 'synced' : 'failed',
      retained: true,
      retryable: false,
      receiptVerified: true,
      code: receipt.resultCode,
    })
  }
  if (input.qualification.outcome === 'conflict') {
    return Object.freeze({
      state: 'conflict',
      retained: true,
      retryable: false,
      receiptVerified: false,
      code: input.qualification.code,
    })
  }
  if (input.qualification.outcome === 'blocked') {
    return Object.freeze({
      state: 'blocked',
      retained: true,
      retryable: input.qualification.retryable,
      receiptVerified: false,
      code: input.qualification.code,
    })
  }
  if (input.qualification.outcome === 'rejected') {
    return Object.freeze({
      state: 'failed',
      retained: true,
      retryable: false,
      receiptVerified: false,
      code: input.qualification.code,
    })
  }
  return Object.freeze({
    state: 'pending',
    retained: true,
    retryable: true,
    receiptVerified: false,
    code:
      input.transport === 'http_2xx_without_receipt'
        ? 'VALID_SERVER_RECEIPT_REQUIRED'
        : input.transport === 'aborted'
          ? 'TRANSPORT_ABORTED_RETRY_SAFE'
          : input.transport === 'timeout'
            ? 'TRANSPORT_TIMEOUT_RETRY_SAFE'
            : input.transport === 'unknown_response'
              ? 'UNKNOWN_RESPONSE_RETRY_SAFE'
              : input.qualification.code,
  })
}

export function createCoreV2OfflineExternalEffectIntent(input: Readonly<{
  serverCommandId: string
  effectType: CoreV2OfflineExternalEffectIntent['effectType']
  effectVersion: number
  payloadReference: string
}>): CoreV2OfflineExternalEffectIntent {
  const serverCommandId = requireUuid(input.serverCommandId, 'serverCommandId')
  if (
    !['whatsapp', 'printing', 'notification', 'other'].includes(input.effectType) ||
    !Number.isSafeInteger(input.effectVersion) ||
    input.effectVersion < 1
  ) {
    throw new CoreV2OfflineContractError('INVALID_EFFECT_INTENT', 'effect')
  }
  const payloadReference = requireSafeIdentifier(
    input.payloadReference,
    'payloadReference'
  )
  return Object.freeze({
    identity: `${serverCommandId}:${input.effectType}:${input.effectVersion}`,
    serverCommandId,
    effectType: input.effectType,
    effectVersion: input.effectVersion,
    payloadReference,
    executionAllowed: false,
  })
}

export function createCoreV2OfflineReviewContainer(input: Readonly<{
  reviewId: string
  reasonCode: string
  envelope: CoreV2OfflineCommandEnvelope
  authority: TrustedCoreV2OfflineAuthoritySnapshot
  conflictSnapshot: CoreV2OfflineConflictSnapshot
}>): CoreV2OfflineReviewContainer {
  if (!RESULT_CODE_PATTERN.test(input.reasonCode)) {
    throw new CoreV2OfflineContractError('INVALID_REVIEW_REASON', 'reasonCode')
  }
  return Object.freeze({
    reviewId: requireUuid(input.reviewId, 'reviewId'),
    reasonCode: input.reasonCode,
    localCommandId: input.envelope.localCommandId,
    idempotencyKey: input.envelope.idempotencyKey,
    payloadCanonicalHash: input.envelope.payloadCanonicalHash,
    authoritySnapshot: Object.freeze({
      authorityVersion: requireSafeIdentifier(
        input.authority.authorityVersion,
        'authorityVersion'
      ),
      tenantId: input.authority.tenantId,
      branchId: input.authority.branchId,
      actualPosEmployeeId: input.authority.actualPosEmployeeId,
    }),
    conflictSnapshot: Object.freeze({ ...input.conflictSnapshot }),
    reviewerState: 'pending',
    compareAndSetVersion: 1,
    resolution: null,
  })
}

export function resolveCoreV2OfflineReviewContainer(
  current: CoreV2OfflineReviewContainer,
  input: Readonly<{
    expectedVersion: number
    reviewerState: 'accepted' | 'rejected'
    reviewerId: string
    resolvedAt: string
    resolutionCode: string
  }>
): CoreV2OfflineReviewContainer {
  if (
    current.reviewerState !== 'pending' ||
    current.compareAndSetVersion !== input.expectedVersion
  ) {
    throw new CoreV2OfflineContractError('REVIEW_CAS_CONFLICT', 'expectedVersion')
  }
  if (!RESULT_CODE_PATTERN.test(input.resolutionCode)) {
    throw new CoreV2OfflineContractError(
      'INVALID_REVIEW_RESOLUTION',
      'resolutionCode'
    )
  }
  return Object.freeze({
    ...current,
    reviewerState: input.reviewerState,
    compareAndSetVersion: current.compareAndSetVersion + 1,
    resolution: Object.freeze({
      reviewerId: requireUuid(input.reviewerId, 'reviewerId'),
      resolvedAt: requireIsoTimestamp(input.resolvedAt, 'resolvedAt'),
      resolutionCode: input.resolutionCode,
    }),
  })
}

export const CORE_V2_OFFLINE_DELIVERY_GUARANTEE =
  'at-least-once transport with idempotent server acquisition and stable receipt replay' as const

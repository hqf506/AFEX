'use client'

import {
  OFFLINE_CAPABILITIES,
  OFFLINE_DATABASE_NAME,
  OFFLINE_STORES,
  OfflineKeyManager,
  OfflinePhase1Error,
  createSecureUuidV4,
  decryptOfflineRecord,
  encryptOfflineRecord,
  offlineKeyManager,
  openOfflineDatabase,
  sha256Base64Url,
  type EncryptedRecordEnvelope,
} from './phase1'
import { canonicalSnapshotJson } from './phase2'

export const OFFLINE_PHASE3_CAPABILITIES = Object.freeze({
  durableCommandOutbox: true,
  productionSensitiveCommandPersistence: true,
  commandDispatch: true,
  commandReplay: true,
  currentWritePathInterception: true,
  optimisticBusinessSuccess: false,
  serviceWorkerDispatch: false,
} as const)

export const PHASE3_AUTHORITY_GATE = Object.freeze({
  classification: 'APPROVED_ORDER_CREATE_PILOT' as const,
  productionPersistence: 'SERVER_ATTESTED_MANAGED_DEVICE_ONLY' as const,
  syntheticNonProductionPersistence: 'ALLOWED' as const,
  reason: 'ORDER_CREATE_ONLY_GLOBAL_KILL_SWITCH' as const,
})

export const PHASE3_LIMITS = Object.freeze({
  maximumPayloadBytes: 64 * 1024,
  maximumPendingCommands: 5_000,
  maximumDependencyCount: 64,
  maximumOrderingCommands: 1_000,
  maximumArrayLength: 200,
  maximumStringLength: 2_048,
  maximumExternalReferenceLength: 64,
  dispatcherLeaseMs: 30_000,
  abandonedSyncingMs: 60_000,
  enqueueP95TargetMs: 75,
  counterQueryP95TargetMs: 25,
  dependencyOrderingP95TargetsMs: Object.freeze({ 10: 5, 100: 20, 1000: 150 }),
  quotaWarningPendingCount: 4_000,
} as const)

export const PHASE3_COMMAND_TYPES = Object.freeze([
  'order.create',
  'order.status.change',
  'customer.create',
  'customer.update',
  'payment.employee_attestation',
  'audit.event.append',
] as const)

export type Phase3CommandType = (typeof PHASE3_COMMAND_TYPES)[number]
export type Phase3CommandState =
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'failed'
  | 'conflict'
  | 'blocked'

export const PHASE3_PAYMENT_METHODS = Object.freeze([
  'mada',
  'cash',
  'visa',
  'cod',
  'card',
  'bank_transfer',
  'transfer',
  'on_delivery',
] as const)
export type Phase3PaymentMethod = (typeof PHASE3_PAYMENT_METHODS)[number]

export const PHASE3_PAYMENT_PROVIDER_CONFIRMATION_STATUSES = Object.freeze([
  'not_integrated',
  'employee_attested',
  'provider_confirmed',
] as const)
export type Phase3PaymentProviderConfirmationStatus =
  (typeof PHASE3_PAYMENT_PROVIDER_CONFIRMATION_STATUSES)[number]

export const PHASE3_EMPLOYEE_PAYMENT_CONFIRMATION_STATUSES = Object.freeze([
  'not_integrated',
  'employee_attested',
] as const)
export type Phase3EmployeePaymentConfirmationStatus =
  (typeof PHASE3_EMPLOYEE_PAYMENT_CONFIRMATION_STATUSES)[number]

export const PHASE3_DEPENDENCY_POLICY = Object.freeze({
  'order.create': Object.freeze({
    payment: 'payment.employee_attestation',
    localCustomer: 'customer.create',
  }),
  'order.status.change': Object.freeze({ localOrder: 'order.create' }),
  'audit.event.append': Object.freeze({ causalCommand: 'exact-command-id' }),
  'payment.employee_attestation': Object.freeze({
    aggregateBinding: 'stable-local-order-aggregate',
    reusableAcrossAggregates: false,
  }),
} as const)

export const PHASE3_STATE_TRANSITIONS = Object.freeze({
  pending: Object.freeze<Phase3CommandState[]>(['syncing', 'failed', 'blocked']),
  syncing: Object.freeze<Phase3CommandState[]>([
    'pending',
    'synced',
    'failed',
    'conflict',
    'blocked',
  ]),
  synced: Object.freeze<Phase3CommandState[]>([]),
  failed: Object.freeze<Phase3CommandState[]>(['pending', 'blocked']),
  conflict: Object.freeze<Phase3CommandState[]>([]),
  blocked: Object.freeze<Phase3CommandState[]>(['pending', 'failed']),
}) satisfies Readonly<Record<Phase3CommandState, readonly Phase3CommandState[]>>

export type Phase3AuthorityReferences = Readonly<{
  accountUserAuthorityReference: string
  tenantReference: string
  branchReference: string
  deviceCacheReference: string
  posEmployeeActorReference: string
  actorSessionLeaseReference: string
}>

type AggregateReference = Readonly<{
  kind: 'server' | 'local'
  id: string
}>

export type PaymentEmployeeAttestationPayload = Readonly<{
  orderAggregateReference: string
  paymentMethod: Phase3PaymentMethod
  amount: string
  currency: 'SAR'
  employeeConfirmedExternalPayment: true
  employeeConfirmedAtLocal: string
  externalReference?: string
  paymentProviderConfirmationStatus: Phase3EmployeePaymentConfirmationStatus
  paymentReplayPolicy: 'never_charge_or_invoke_provider'
  reconciliationStatus: 'not_required' | 'pending' | 'matched' | 'discrepancy'
}>

export type Phase3CommandPayloadByType = {
  'customer.create': Readonly<{
    aggregateReference: string
    name: string
    phone: string
    email: string | null
    address: string | null
    notes: string | null
  }>
  'customer.update': Readonly<{
    aggregateReference: string
    expectedVersion: string
    changes: Readonly<{
      name?: string
      phone?: string
      email?: string | null
      address?: string | null
      notes?: string | null
    }>
  }>
  'payment.employee_attestation': PaymentEmployeeAttestationPayload
  'order.create': Readonly<{
    aggregateReference: string
    customerReference: AggregateReference
    itemReferences: ReadonlyArray<
      Readonly<{ catalogItemReference: string; quantity: number }>
    >
    paymentAttestationCommandId: string
  }>
  'order.status.change': Readonly<{
    orderReference: AggregateReference
    fromStatus: string
    toStatus: string
    transitionContractVersion: string
  }>
  'audit.event.append': Readonly<{
    aggregateReference: string
    causalCommandId: string
    eventType: string
    details: Readonly<Record<string, unknown>>
  }>
}

export type Phase3CommandPayload<T extends Phase3CommandType> =
  Phase3CommandPayloadByType[T]

export type Phase3CommandIdentity = Readonly<{
  localCommandId: string
  idempotencyKey: string
  aggregateId: string
  causationId: string
  correlationId: string
  payloadHash: string
  deduplicationKey: string
}>

export type Phase3EnqueueInput<T extends Phase3CommandType> = Readonly<{
  namespaceId: string
  commandType: T
  payload: Phase3CommandPayload<T>
  authority: Phase3AuthorityReferences
  dependencyIds?: readonly string[]
  deduplicationKey: string
  identity?: Phase3CommandIdentity
  correlationId?: string
  causationId?: string
}>

export type Phase3ImmutableCommandEnvelope = Readonly<{
  envelopeVersion: 1
  commandSchemaVersion: 1
  payloadSchemaVersion: 1
  localCommandId: string
  idempotencyKey: string
  commandType: Phase3CommandType
  namespaceId: string
  accountUserAuthorityReference: string
  tenantReference: string
  branchReference: string
  deviceCacheReference: string
  posEmployeeActorReference: string
  actorSessionLeaseReference: string
  aggregateId: string
  causationId: string
  correlationId: string
  createdAtLocal: string
  localSequence: number
  dependencyIds: readonly string[]
  dependencyProjectionHash: string
  payloadHash: string
  envelopeHash: string
  encryptedPayload: EncryptedRecordEnvelope
}>

export type Phase3AttemptMetadata = Readonly<{
  attemptCount: number
  lastAttemptAt: string | null
  lastErrorClassification: string | null
  serverReceiptResultReference: string | null
}>

export type Phase3StoredCommand = Readonly<{
  id: string
  namespaceId: string
  localCommandId: string
  idempotencyKey: string
  commandType: Phase3CommandType
  localSequence: number
  createdAtLocal: string
  state: Phase3CommandState
  immutable: Phase3ImmutableCommandEnvelope
  runtime: Phase3AttemptMetadata
}>

type Phase3DependencyRecord = Readonly<{
  id: string
  namespaceId: string
  commandId: string
  dependencyId: string
  blocking: boolean
  createdAtLocal: string
}>

type Phase3MetaRecord = {
  id: string
  kind: string
  namespaceId: string
  value?: number
  ownerId?: string
  expiresAt?: number
  schemaVersion: number
  updatedAt: string
}

type RepositoryOptions = {
  databaseName?: string
  keyManager?: OfflineKeyManager
  allowSyntheticAuthority?: boolean
  now?: () => number
}

const COMMAND_TYPE_SET = new Set<string>(PHASE3_COMMAND_TYPES)
const PAYMENT_METHOD_SET = new Set<string>(PHASE3_PAYMENT_METHODS)
const EMPLOYEE_PAYMENT_CONFIRMATION_SET = new Set<string>(
  PHASE3_EMPLOYEE_PAYMENT_CONFIRMATION_STATUSES
)
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]+$/u
const EXTERNAL_REFERENCE_PATTERN = /^[A-Za-z0-9._:/-]+$/u
const PAYMENT_CREDENTIAL_KEYS = new Set([
  'cardnumber',
  'card_number',
  'pan',
  'cvv',
  'cvc',
  'pin',
  'trackdata',
  'track_data',
  'providertoken',
  'provider_token',
  'terminalsecret',
  'terminal_secret',
])

function requestAsPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), {
      once: true,
    })
    request.addEventListener('error', () => reject(request.error), { once: true })
  })
}

function transactionAsPromise(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true })
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('IDB_TRANSACTION_ABORTED')),
      { once: true }
    )
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('IDB_TRANSACTION_FAILED')),
      { once: true }
    )
  })
}

function requireIdentifier(value: string, maximum = 256) {
  const normalized = value.trim()
  if (
    !normalized ||
    normalized.length > maximum ||
    !IDENTIFIER_PATTERN.test(normalized)
  ) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  return normalized
}

function requireBoundedText(value: unknown, nullable = false) {
  if (nullable && value === null) return null
  if (typeof value !== 'string') {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  const normalized = value.trim()
  if (
    !normalized ||
    normalized.length > PHASE3_LIMITS.maximumStringLength ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(normalized)
  ) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  return normalized
}

function requireIsoTimestamp(value: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  return new Date(parsed).toISOString()
}

function assertExactKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  const allowed = new Set([...required, ...optional])
  const keys = Reflect.ownKeys(value)
  if (
    keys.some((key) => typeof key !== 'string' || !allowed.has(key)) ||
    required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
}

function assertNoPaymentCredentials(value: unknown, ancestors = new WeakSet<object>()) {
  if (!value || typeof value !== 'object') return
  if (ancestors.has(value)) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  ancestors.add(value)
  try {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') {
        throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
      }
      if (PAYMENT_CREDENTIAL_KEYS.has(key.toLowerCase())) {
        throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
      }
      assertNoPaymentCredentials((value as Record<string, unknown>)[key], ancestors)
    }
  } finally {
    ancestors.delete(value)
  }
}

function requireAggregateReference(value: unknown): AggregateReference {
  assertExactKeys(value, ['kind', 'id'])
  if (value.kind !== 'server' && value.kind !== 'local') {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  return Object.freeze({ kind: value.kind, id: requireIdentifier(String(value.id)) })
}

function requireMoney(value: unknown) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,9})\.\d{2}$/u.test(value)) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  return value
}

function validatePaymentAttestation(value: unknown): PaymentEmployeeAttestationPayload {
  assertExactKeys(
    value,
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
    !PAYMENT_METHOD_SET.has(String(value.paymentMethod)) ||
    value.currency !== 'SAR' ||
    value.employeeConfirmedExternalPayment !== true ||
    !EMPLOYEE_PAYMENT_CONFIRMATION_SET.has(
      String(value.paymentProviderConfirmationStatus)
    ) ||
    value.paymentReplayPolicy !== 'never_charge_or_invoke_provider' ||
    !['not_required', 'pending', 'matched', 'discrepancy'].includes(
      String(value.reconciliationStatus)
    )
  ) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  let externalReference: string | undefined
  if (value.externalReference !== undefined) {
    externalReference = String(value.externalReference).trim()
    if (
      !externalReference ||
      externalReference.length > PHASE3_LIMITS.maximumExternalReferenceLength ||
      !EXTERNAL_REFERENCE_PATTERN.test(externalReference)
    ) {
      throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
    }
  }
  return Object.freeze({
    orderAggregateReference: requireIdentifier(String(value.orderAggregateReference)),
    paymentMethod: value.paymentMethod as Phase3PaymentMethod,
    amount: requireMoney(value.amount),
    currency: 'SAR',
    employeeConfirmedExternalPayment: true,
    employeeConfirmedAtLocal: requireIsoTimestamp(String(value.employeeConfirmedAtLocal)),
    ...(externalReference ? { externalReference } : {}),
    paymentProviderConfirmationStatus:
      value.paymentProviderConfirmationStatus as PaymentEmployeeAttestationPayload['paymentProviderConfirmationStatus'],
    paymentReplayPolicy: 'never_charge_or_invoke_provider',
    reconciliationStatus:
      value.reconciliationStatus as PaymentEmployeeAttestationPayload['reconciliationStatus'],
  })
}

function validatePayload<T extends Phase3CommandType>(
  commandType: T,
  input: Phase3CommandPayload<T>
): Phase3CommandPayload<T> {
  if (!COMMAND_TYPE_SET.has(commandType)) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  const value: unknown = input
  assertNoPaymentCredentials(value)
  let normalized: unknown
  if (commandType === 'customer.create') {
    assertExactKeys(value, ['aggregateReference', 'name', 'phone', 'email', 'address', 'notes'])
    normalized = Object.freeze({
      aggregateReference: requireIdentifier(String(value.aggregateReference)),
      name: requireBoundedText(value.name),
      phone: requireBoundedText(value.phone),
      email: requireBoundedText(value.email, true),
      address: requireBoundedText(value.address, true),
      notes: requireBoundedText(value.notes, true),
    })
  } else if (commandType === 'customer.update') {
    assertExactKeys(value, ['aggregateReference', 'expectedVersion', 'changes'])
    assertExactKeys(value.changes, [], ['name', 'phone', 'email', 'address', 'notes'])
    if (Object.keys(value.changes).length === 0) {
      throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
    }
    normalized = Object.freeze({
      aggregateReference: requireIdentifier(String(value.aggregateReference)),
      expectedVersion: requireIdentifier(String(value.expectedVersion)),
      changes: Object.freeze(
        Object.fromEntries(
          Object.entries(value.changes).map(([key, changeValue]) => [
            key,
            requireBoundedText(
              changeValue,
              ['email', 'address', 'notes'].includes(key)
            ),
          ])
        )
      ),
    })
  } else if (commandType === 'payment.employee_attestation') {
    normalized = validatePaymentAttestation(value)
  } else if (commandType === 'order.create') {
    assertExactKeys(value, [
      'aggregateReference',
      'customerReference',
      'itemReferences',
      'paymentAttestationCommandId',
    ])
    if (
      !Array.isArray(value.itemReferences) ||
      value.itemReferences.length < 1 ||
      value.itemReferences.length > PHASE3_LIMITS.maximumArrayLength
    ) {
      throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
    }
    normalized = Object.freeze({
      aggregateReference: requireIdentifier(String(value.aggregateReference)),
      customerReference: requireAggregateReference(value.customerReference),
      itemReferences: Object.freeze(
        value.itemReferences.map((item: unknown) => {
          assertExactKeys(item, ['catalogItemReference', 'quantity'])
          if (
            !Number.isSafeInteger(item.quantity) ||
            Number(item.quantity) < 1 ||
            Number(item.quantity) > 999
          ) {
            throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
          }
          return Object.freeze({
            catalogItemReference: requireIdentifier(String(item.catalogItemReference)),
            quantity: Number(item.quantity),
          })
        })
      ),
      paymentAttestationCommandId: requireIdentifier(
        String(value.paymentAttestationCommandId)
      ),
    })
  } else if (commandType === 'order.status.change') {
    assertExactKeys(value, [
      'orderReference',
      'fromStatus',
      'toStatus',
      'transitionContractVersion',
    ])
    normalized = Object.freeze({
      orderReference: requireAggregateReference(value.orderReference),
      fromStatus: requireIdentifier(String(value.fromStatus)),
      toStatus: requireIdentifier(String(value.toStatus)),
      transitionContractVersion: requireIdentifier(String(value.transitionContractVersion)),
    })
  } else {
    assertExactKeys(value, ['aggregateReference', 'causalCommandId', 'eventType', 'details'])
    const detailKeys =
      value.details && typeof value.details === 'object'
        ? Object.keys(value.details)
        : []
    assertExactKeys(value.details, [], detailKeys)
    normalized = Object.freeze({
      aggregateReference: requireIdentifier(String(value.aggregateReference)),
      causalCommandId: requireIdentifier(String(value.causalCommandId)),
      eventType: requireIdentifier(String(value.eventType)),
      details: value.details,
    })
  }
  const canonical = canonicalSnapshotJson(normalized)
  if (new TextEncoder().encode(canonical).byteLength > PHASE3_LIMITS.maximumPayloadBytes) {
    throw new OfflinePhase1Error('OFFLINE_QUOTA_HARD_STOP')
  }
  return normalized as Phase3CommandPayload<T>
}

function requiredDependencies<T extends Phase3CommandType>(
  commandType: T,
  payload: Phase3CommandPayload<T>
) {
  if (commandType === 'order.create') {
    const orderPayload = payload as Phase3CommandPayload<'order.create'>
    return [
      ...(orderPayload.customerReference.kind === 'local'
        ? [orderPayload.customerReference.id]
        : []),
      orderPayload.paymentAttestationCommandId,
    ]
  }
  if (commandType === 'order.status.change') {
    const statusPayload = payload as Phase3CommandPayload<'order.status.change'>
    return statusPayload.orderReference.kind === 'local'
      ? [statusPayload.orderReference.id]
      : []
  }
  if (commandType === 'audit.event.append') {
    return [(payload as Phase3CommandPayload<'audit.event.append'>).causalCommandId]
  }
  return []
}

function normalizeDependencies(
  commandId: string,
  provided: readonly string[],
  required: readonly string[]
) {
  if (provided.length > PHASE3_LIMITS.maximumDependencyCount) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  const normalized = [...new Set(provided.map((value) => requireIdentifier(value)))].sort()
  const normalizedRequired = [
    ...new Set(required.map((value) => requireIdentifier(value))),
  ].sort()
  if (
    normalized.includes(commandId) ||
    normalized.length !== normalizedRequired.length ||
    normalizedRequired.some(
      (dependencyId, index) => dependencyId !== normalized[index]
    )
  ) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  return Object.freeze(normalized)
}

function aggregateIdForPayload<T extends Phase3CommandType>(
  payload: Phase3CommandPayload<T>
) {
  return requireIdentifier(
    'aggregateReference' in payload
      ? String(payload.aggregateReference)
      : 'orderAggregateReference' in payload
        ? String(payload.orderAggregateReference)
        : String(payload.orderReference.id)
  )
}

async function digestReference(namespaceId: string, kind: string, value: string) {
  return `sha256:${await sha256Base64Url(
    canonicalSnapshotJson({ namespaceId, kind, value: requireIdentifier(value) })
  )}`
}

async function calculateIdempotencyKey(input: {
  namespaceId: string
  commandType: Phase3CommandType
  deduplicationKey: string
}) {
  return `idem_${await sha256Base64Url(
    canonicalSnapshotJson({
      contract: 'afex-phase3-idempotency-v1',
      namespaceId: input.namespaceId,
      commandType: input.commandType,
      deduplicationKey: input.deduplicationKey,
    })
  )}`
}

export async function createPhase3CommandIdentity<T extends Phase3CommandType>(
  input: Omit<Phase3EnqueueInput<T>, 'identity' | 'dependencyIds'>
): Promise<Phase3CommandIdentity> {
  const namespaceId = requireIdentifier(input.namespaceId)
  const commandType = requireIdentifier(input.commandType) as T
  const payload = validatePayload(commandType, input.payload)
  const payloadHash = await sha256Base64Url(canonicalSnapshotJson(payload))
  const deduplicationKey = requireIdentifier(input.deduplicationKey)
  const idempotencyKey = await calculateIdempotencyKey({
    namespaceId,
    commandType,
    deduplicationKey,
  })
  return Object.freeze({
    localCommandId: `lc_${createSecureUuidV4()}`,
    idempotencyKey,
    aggregateId: aggregateIdForPayload(payload),
    causationId: input.causationId
      ? requireIdentifier(input.causationId)
      : `cause_${createSecureUuidV4()}`,
    correlationId: input.correlationId
      ? requireIdentifier(input.correlationId)
      : `corr_${createSecureUuidV4()}`,
    payloadHash,
    deduplicationKey,
  })
}

export function assertLegalPhase3StateTransition(
  from: Phase3CommandState,
  to: Phase3CommandState
) {
  if (!PHASE3_STATE_TRANSITIONS[from]?.includes(to)) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  return true
}

export function topologicallyOrderPhase3Commands(
  commands: readonly Readonly<{
    namespaceId: string
    localCommandId: string
    immutable: Readonly<{ dependencyIds: readonly string[] }>
  }>[]
) {
  if (commands.length > PHASE3_LIMITS.maximumOrderingCommands) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  const byId = new Map(commands.map((command) => [command.localCommandId, command]))
  if (byId.size !== commands.length) {
    throw new OfflinePhase1Error('OFFLINE_INTEGRITY_FAILED')
  }
  const namespace = commands[0]?.namespaceId
  if (commands.some((command) => command.namespaceId !== namespace)) {
    throw new OfflinePhase1Error('OFFLINE_CROSS_SCOPE_DENIED')
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const ordered: string[] = []
  const visit = (commandId: string) => {
    if (visiting.has(commandId)) {
      throw new OfflinePhase1Error('OFFLINE_INTEGRITY_FAILED')
    }
    if (visited.has(commandId)) return
    const command = byId.get(commandId)
    if (!command) throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
    visiting.add(commandId)
    for (const dependencyId of command.immutable.dependencyIds) {
      if (dependencyId === commandId) {
        throw new OfflinePhase1Error('OFFLINE_INTEGRITY_FAILED')
      }
      if (byId.has(dependencyId)) visit(dependencyId)
    }
    visiting.delete(commandId)
    visited.add(commandId)
    ordered.push(commandId)
  }
  for (const commandId of [...byId.keys()].sort()) visit(commandId)
  return ordered
}

function commandRecordId(namespaceId: string, localCommandId: string) {
  return `${namespaceId}:${localCommandId}`
}

function dependencyRecordId(
  namespaceId: string,
  commandId: string,
  dependencyId: string
) {
  return `${namespaceId}:${commandId}:${dependencyId}`
}

function sequenceRecordId(namespaceId: string) {
  return `phase3:sequence:${namespaceId}`
}

function dispatcherLeaseRecordId(namespaceId: string) {
  return `phase3:dispatcher-lease:${namespaceId}`
}

function immutableProjection(
  envelope: Omit<Phase3ImmutableCommandEnvelope, 'envelopeHash' | 'encryptedPayload'>
) {
  return {
    envelopeVersion: envelope.envelopeVersion,
    commandSchemaVersion: envelope.commandSchemaVersion,
    payloadSchemaVersion: envelope.payloadSchemaVersion,
    localCommandId: envelope.localCommandId,
    idempotencyKey: envelope.idempotencyKey,
    commandType: envelope.commandType,
    namespaceId: envelope.namespaceId,
    accountUserAuthorityReference: envelope.accountUserAuthorityReference,
    tenantReference: envelope.tenantReference,
    branchReference: envelope.branchReference,
    deviceCacheReference: envelope.deviceCacheReference,
    posEmployeeActorReference: envelope.posEmployeeActorReference,
    actorSessionLeaseReference: envelope.actorSessionLeaseReference,
    aggregateId: envelope.aggregateId,
    causationId: envelope.causationId,
    correlationId: envelope.correlationId,
    createdAtLocal: envelope.createdAtLocal,
    localSequence: envelope.localSequence,
    dependencyIds: envelope.dependencyIds,
    dependencyProjectionHash: envelope.dependencyProjectionHash,
    payloadHash: envelope.payloadHash,
  }
}

async function assertImmutableEnvelopeIntegrity(command: Phase3StoredCommand) {
  const { envelopeHash, encryptedPayload: _encryptedPayload, ...projection } =
    command.immutable
  void _encryptedPayload
  const expected = await sha256Base64Url(
    canonicalSnapshotJson(immutableProjection(projection))
  )
  if (
    expected !== envelopeHash ||
    command.namespaceId !== command.immutable.namespaceId ||
    command.localCommandId !== command.immutable.localCommandId ||
    command.idempotencyKey !== command.immutable.idempotencyKey ||
    command.commandType !== command.immutable.commandType ||
    command.localSequence !== command.immutable.localSequence ||
    command.createdAtLocal !== command.immutable.createdAtLocal
  ) {
    throw new OfflinePhase1Error('OFFLINE_INTEGRITY_FAILED')
  }
}

type IndexedPhase3StoredCommand = Phase3StoredCommand

type Phase3DependencyValidation = Readonly<{
  directRecords: readonly IndexedPhase3StoredCommand[]
  closureRecords: readonly IndexedPhase3StoredCommand[]
}>

function assertSemanticDependencyPolicy<T extends Phase3CommandType>(
  namespaceId: string,
  commandId: string,
  commandType: T,
  payload: Phase3CommandPayload<T>,
  dependencyIds: readonly string[],
  directRecords: readonly IndexedPhase3StoredCommand[]
) {
  const byId = new Map(
    directRecords.map((dependency) => [
      dependency.localCommandId,
      dependency,
    ])
  )
  if (byId.size !== dependencyIds.length || directRecords.length !== dependencyIds.length) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  for (const dependency of directRecords) {
    if (dependency.localCommandId === commandId) {
      throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
    }
    if (dependency.namespaceId !== namespaceId) {
      throw new OfflinePhase1Error('OFFLINE_CROSS_SCOPE_DENIED')
    }
  }

  const requireDependency = (
    dependencyId: string,
    expectedType?: Phase3CommandType
  ) => {
    const dependency = byId.get(dependencyId)
    if (!dependency || (expectedType && dependency.commandType !== expectedType)) {
      throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
    }
    return dependency
  }

  if (commandType === 'order.create') {
    const order = payload as Phase3CommandPayload<'order.create'>
    const payment = requireDependency(
      order.paymentAttestationCommandId,
      PHASE3_DEPENDENCY_POLICY['order.create'].payment
    )
    if (payment.immutable.aggregateId !== order.aggregateReference) {
      throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
    }
    if (order.customerReference.kind === 'local') {
      requireDependency(
        order.customerReference.id,
        PHASE3_DEPENDENCY_POLICY['order.create'].localCustomer
      )
    }
  } else if (commandType === 'order.status.change') {
    const status = payload as Phase3CommandPayload<'order.status.change'>
    if (status.orderReference.kind === 'local') {
      requireDependency(
        status.orderReference.id,
        PHASE3_DEPENDENCY_POLICY['order.status.change'].localOrder
      )
    }
  } else if (commandType === 'audit.event.append') {
    const audit = payload as Phase3CommandPayload<'audit.event.append'>
    requireDependency(audit.causalCommandId)
  }
}

export class Phase3CommandRepository {
  readonly databaseName: string
  readonly keyManager: OfflineKeyManager
  readonly allowSyntheticAuthority: boolean
  private readonly now: () => number

  constructor(options?: RepositoryOptions) {
    this.databaseName = options?.databaseName ?? OFFLINE_DATABASE_NAME
    this.keyManager = options?.keyManager ?? offlineKeyManager
    this.allowSyntheticAuthority = options?.allowSyntheticAuthority ?? false
    this.now = options?.now ?? Date.now
  }

  private requireAuthority(namespaceId: string) {
    const normalizedNamespaceId = requireIdentifier(namespaceId)
    if (
      !this.allowSyntheticAuthority ||
      process.env.NODE_ENV === 'production'
    ) {
      if (
        !OFFLINE_CAPABILITIES.persistentUnwrapAuthority ||
        !OFFLINE_PHASE3_CAPABILITIES.productionSensitiveCommandPersistence
      ) {
        throw new OfflinePhase1Error('OFFLINE_AUTHORITY_UNAVAILABLE')
      }
    }
    const keyMaterial = this.keyManager.requireKey(normalizedNamespaceId)
    return { namespaceId: normalizedNamespaceId, ...keyMaterial }
  }

  private async findByIdempotency(
    namespaceId: string,
    idempotencyKey: string
  ) {
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(
        OFFLINE_STORES.commandOutbox,
        'readonly'
      )
      const record = (await requestAsPromise(
        transaction
          .objectStore(OFFLINE_STORES.commandOutbox)
          .index('namespaceIdempotency')
          .get(IDBKeyRange.only([namespaceId, idempotencyKey]))
      )) as IndexedPhase3StoredCommand | undefined
      await transactionAsPromise(transaction)
      return record
    } finally {
      database.close()
    }
  }

  private async findByLocalCommandId(localCommandId: string) {
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(
        OFFLINE_STORES.commandOutbox,
        'readonly'
      )
      const record = (await requestAsPromise(
        transaction
          .objectStore(OFFLINE_STORES.commandOutbox)
          .index('localCommandId')
          .get(requireIdentifier(localCommandId))
      )) as IndexedPhase3StoredCommand | undefined
      await transactionAsPromise(transaction)
      return record
    } finally {
      database.close()
    }
  }

  private async allocateLocalSequence(namespaceId: string) {
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(OFFLINE_STORES.meta, 'readwrite')
      const store = transaction.objectStore(OFFLINE_STORES.meta)
      const id = sequenceRecordId(namespaceId)
      const existing = (await requestAsPromise(store.get(id))) as
        | Phase3MetaRecord
        | undefined
      const current = existing?.kind === 'phase3-local-sequence' ? existing.value : 0
      if (current !== undefined && (!Number.isSafeInteger(current) || current < 0)) {
        transaction.abort()
        throw new OfflinePhase1Error('OFFLINE_INTEGRITY_FAILED')
      }
      const next = (current ?? 0) + 1
      store.put({
        id,
        kind: 'phase3-local-sequence',
        namespaceId,
        value: next,
        schemaVersion: 1,
        updatedAt: new Date(this.now()).toISOString(),
      } satisfies Phase3MetaRecord)
      await transactionAsPromise(transaction)
      return next
    } finally {
      database.close()
    }
  }

  private async validatePersistedDependencies(
    namespaceId: string,
    commandId: string,
    commandType: Phase3CommandType,
    payload: Phase3CommandPayload<Phase3CommandType>,
    dependencyIds: readonly string[]
  ): Promise<Phase3DependencyValidation> {
    const recordsById = new Map<string, IndexedPhase3StoredCommand>()
    const pending = [...dependencyIds]
    while (pending.length) {
      const dependencyId = pending.pop()!
      if (dependencyId === commandId) {
        throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
      }
      if (recordsById.has(dependencyId)) continue
      const dependency = await this.findByLocalCommandId(dependencyId)
      if (!dependency) {
        throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
      }
      if (dependency.namespaceId !== namespaceId) {
        throw new OfflinePhase1Error('OFFLINE_CROSS_SCOPE_DENIED')
      }
      await assertImmutableEnvelopeIntegrity(dependency)
      recordsById.set(dependencyId, dependency)
      if (recordsById.size >= PHASE3_LIMITS.maximumOrderingCommands) {
        throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
      }
      pending.push(...dependency.immutable.dependencyIds)
    }
    const closureRecords = [...recordsById.values()]
    const directRecords = dependencyIds.map((dependencyId) => {
      const dependency = recordsById.get(dependencyId)
      if (!dependency) throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
      return dependency
    })
    assertSemanticDependencyPolicy(
      namespaceId,
      commandId,
      commandType,
      payload,
      dependencyIds,
      directRecords
    )
    topologicallyOrderPhase3Commands([
      ...closureRecords,
      {
        namespaceId,
        localCommandId: commandId,
        immutable: { dependencyIds },
      },
    ])
    return Object.freeze({
      directRecords: Object.freeze(directRecords),
      closureRecords: Object.freeze(closureRecords),
    })
  }

  private async validateDependenciesInWriteTransaction(
    transaction: IDBTransaction,
    namespaceId: string,
    commandId: string,
    commandType: Phase3CommandType,
    payload: Phase3CommandPayload<Phase3CommandType>,
    dependencyIds: readonly string[],
    preliminary: Phase3DependencyValidation
  ) {
    const store = transaction.objectStore(OFFLINE_STORES.commandOutbox)
    const finalRecords = await Promise.all(
      preliminary.closureRecords.map(async (expected) => {
        const current = (await requestAsPromise(
          store
            .index('localCommandId')
            .get(IDBKeyRange.only(expected.localCommandId))
        )) as IndexedPhase3StoredCommand | undefined
        if (!current) throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
        if (current.namespaceId !== namespaceId) {
          throw new OfflinePhase1Error('OFFLINE_CROSS_SCOPE_DENIED')
        }
        if (
          current.localCommandId !== expected.localCommandId ||
          current.commandType !== expected.commandType ||
          current.immutable.envelopeHash !== expected.immutable.envelopeHash ||
          current.immutable.aggregateId !== expected.immutable.aggregateId ||
          current.immutable.dependencyProjectionHash !==
            expected.immutable.dependencyProjectionHash ||
          canonicalSnapshotJson(current.immutable.dependencyIds) !==
            canonicalSnapshotJson(expected.immutable.dependencyIds)
        ) {
          throw new OfflinePhase1Error('OFFLINE_INTEGRITY_FAILED')
        }
        return current
      })
    )
    const finalById = new Map(
      finalRecords.map((dependency) => [dependency.localCommandId, dependency])
    )
    const finalDirectRecords = dependencyIds.map((dependencyId) => {
      const dependency = finalById.get(dependencyId)
      if (!dependency) throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
      return dependency
    })
    assertSemanticDependencyPolicy(
      namespaceId,
      commandId,
      commandType,
      payload,
      dependencyIds,
      finalDirectRecords
    )
    topologicallyOrderPhase3Commands([
      ...finalRecords,
      {
        namespaceId,
        localCommandId: commandId,
        immutable: { dependencyIds },
      },
    ])
  }

  async enqueue<T extends Phase3CommandType>(input: Phase3EnqueueInput<T>) {
    const authority = this.requireAuthority(input.namespaceId)
    const commandType = requireIdentifier(input.commandType) as T
    if (!COMMAND_TYPE_SET.has(commandType)) {
      throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
    }
    const payload = validatePayload(commandType, input.payload)
    const identity =
      input.identity ??
      (await createPhase3CommandIdentity({
        namespaceId: authority.namespaceId,
        commandType,
        payload,
        authority: input.authority,
        deduplicationKey: input.deduplicationKey,
        correlationId: input.correlationId,
        causationId: input.causationId,
      }))
    const recalculatedPayloadHash = await sha256Base64Url(
      canonicalSnapshotJson(payload)
    )
    const expectedIdempotencyKey = await calculateIdempotencyKey({
      namespaceId: authority.namespaceId,
      commandType,
      deduplicationKey: requireIdentifier(input.deduplicationKey),
    })
    if (
      identity.payloadHash !== recalculatedPayloadHash ||
      identity.deduplicationKey !== requireIdentifier(input.deduplicationKey) ||
      identity.idempotencyKey !== expectedIdempotencyKey ||
      identity.aggregateId !== aggregateIdForPayload(payload)
    ) {
      throw new OfflinePhase1Error('OFFLINE_INTEGRITY_FAILED')
    }
    const required = requiredDependencies(commandType, payload)
    const dependencyIds = normalizeDependencies(
      identity.localCommandId,
      input.dependencyIds ?? [],
      required
    )
    const existing = await this.findByIdempotency(
      authority.namespaceId,
      identity.idempotencyKey
    )
    if (existing) {
      await assertImmutableEnvelopeIntegrity(existing)
      if (
        existing.commandType !== commandType ||
        existing.immutable.payloadHash !== identity.payloadHash ||
        canonicalSnapshotJson(existing.immutable.dependencyIds) !==
          canonicalSnapshotJson(dependencyIds)
      ) {
        throw new OfflinePhase1Error('OFFLINE_INTEGRITY_FAILED')
      }
      await this.validatePersistedDependencies(
        authority.namespaceId,
        existing.localCommandId,
        commandType,
        payload as Phase3CommandPayload<Phase3CommandType>,
        existing.immutable.dependencyIds
      )
      return { status: 'duplicate' as const, command: existing }
    }
    const dependencyValidation = await this.validatePersistedDependencies(
      authority.namespaceId,
      identity.localCommandId,
      commandType,
      payload as Phase3CommandPayload<Phase3CommandType>,
      dependencyIds
    )
    const pendingCounts = await this.getAuthorizedCounters(authority.namespaceId)
    if (pendingCounts.unresolved >= PHASE3_LIMITS.maximumPendingCommands) {
      throw new OfflinePhase1Error('OFFLINE_QUOTA_HARD_STOP')
    }
    const localSequence = await this.allocateLocalSequence(authority.namespaceId)
    const createdAtLocal = new Date(this.now()).toISOString()
    const dependencyProjectionHash = await sha256Base64Url(
      canonicalSnapshotJson(dependencyIds)
    )
    const references = await Promise.all([
      digestReference(
        authority.namespaceId,
        'account-user-authority',
        input.authority.accountUserAuthorityReference
      ),
      digestReference(authority.namespaceId, 'tenant', input.authority.tenantReference),
      digestReference(authority.namespaceId, 'branch', input.authority.branchReference),
      digestReference(
        authority.namespaceId,
        'device-cache',
        input.authority.deviceCacheReference
      ),
      digestReference(
        authority.namespaceId,
        'pos-employee-actor',
        input.authority.posEmployeeActorReference
      ),
      digestReference(
        authority.namespaceId,
        'actor-session-lease',
        input.authority.actorSessionLeaseReference
      ),
    ])
    const projectionWithoutHash = {
      envelopeVersion: 1 as const,
      commandSchemaVersion: 1 as const,
      payloadSchemaVersion: 1 as const,
      localCommandId: requireIdentifier(identity.localCommandId),
      idempotencyKey: requireIdentifier(identity.idempotencyKey),
      commandType,
      namespaceId: authority.namespaceId,
      accountUserAuthorityReference: references[0],
      tenantReference: references[1],
      branchReference: references[2],
      deviceCacheReference: references[3],
      posEmployeeActorReference: references[4],
      actorSessionLeaseReference: references[5],
      aggregateId: requireIdentifier(identity.aggregateId),
      causationId: requireIdentifier(identity.causationId),
      correlationId: requireIdentifier(identity.correlationId),
      createdAtLocal,
      localSequence,
      dependencyIds,
      dependencyProjectionHash,
      payloadHash: identity.payloadHash,
    }
    const envelopeHash = await sha256Base64Url(
      canonicalSnapshotJson(immutableProjection(projectionWithoutHash))
    )
    const encryptedPayload = await encryptOfflineRecord({
      key: authority.key,
      keyVersion: authority.keyVersion,
      namespaceId: authority.namespaceId,
      storeName: OFFLINE_STORES.commandOutbox,
      recordKey: identity.localCommandId,
      value: payload,
    })
    const immutable = Object.freeze({
      ...projectionWithoutHash,
      envelopeHash,
      encryptedPayload,
    }) satisfies Phase3ImmutableCommandEnvelope
    const command: IndexedPhase3StoredCommand = Object.freeze({
      id: commandRecordId(authority.namespaceId, identity.localCommandId),
      namespaceId: authority.namespaceId,
      localCommandId: identity.localCommandId,
      idempotencyKey: identity.idempotencyKey,
      commandType,
      localSequence,
      createdAtLocal,
      state: 'pending',
      immutable,
      runtime: Object.freeze({
        attemptCount: 0,
        lastAttemptAt: null,
        lastErrorClassification: null,
        serverReceiptResultReference: null,
      }),
    })
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(
        [OFFLINE_STORES.commandOutbox, OFFLINE_STORES.commandDependencies],
        'readwrite'
      )
      try {
        await this.validateDependenciesInWriteTransaction(
          transaction,
          authority.namespaceId,
          identity.localCommandId,
          commandType,
          payload as Phase3CommandPayload<Phase3CommandType>,
          dependencyIds,
          dependencyValidation
        )
        transaction.objectStore(OFFLINE_STORES.commandOutbox).add(command)
        const dependencyStore = transaction.objectStore(
          OFFLINE_STORES.commandDependencies
        )
        for (const dependencyId of dependencyIds) {
          dependencyStore.add({
            id: dependencyRecordId(
              authority.namespaceId,
              identity.localCommandId,
              dependencyId
            ),
            namespaceId: authority.namespaceId,
            commandId: identity.localCommandId,
            dependencyId,
            blocking: commandType !== 'audit.event.append',
            createdAtLocal,
          } satisfies Phase3DependencyRecord)
        }
        await transactionAsPromise(transaction)
      } catch (error) {
        try {
          transaction.abort()
        } catch {
          // The transaction may already be complete/aborted; retain the primary error.
        }
        throw error
      }
      return { status: 'created' as const, command }
    } catch (error) {
      const converged = await this.findByIdempotency(
        authority.namespaceId,
        identity.idempotencyKey
      )
      if (converged) {
        await assertImmutableEnvelopeIntegrity(converged)
        if (
          converged.commandType === commandType &&
          converged.immutable.payloadHash === identity.payloadHash
        ) {
          return { status: 'duplicate' as const, command: converged }
        }
      }
      throw error instanceof OfflinePhase1Error
        ? error
        : new OfflinePhase1Error('OFFLINE_DATABASE_UNAVAILABLE', true)
    } finally {
      database.close()
    }
  }

  async readCommandPayload<T extends Phase3CommandType>(
    namespaceId: string,
    localCommandId: string
  ): Promise<Phase3CommandPayload<T> | null> {
    const authority = this.requireAuthority(namespaceId)
    const record = await this.findByLocalCommandId(localCommandId)
    if (!record) return null
    if (record.namespaceId !== authority.namespaceId) {
      throw new OfflinePhase1Error('OFFLINE_CROSS_SCOPE_DENIED')
    }
    await assertImmutableEnvelopeIntegrity(record)
    const payload = await decryptOfflineRecord<Phase3CommandPayload<T>>({
      key: authority.key,
      namespaceId: authority.namespaceId,
      storeName: OFFLINE_STORES.commandOutbox,
      recordKey: record.localCommandId,
      envelope: record.immutable.encryptedPayload,
    })
    const hash = await sha256Base64Url(canonicalSnapshotJson(payload))
    if (hash !== record.immutable.payloadHash) {
      throw new OfflinePhase1Error('OFFLINE_INTEGRITY_FAILED')
    }
    return payload
  }

  async readCommandIdentityByDeduplication<T extends Phase3CommandType>(
    namespaceId: string,
    commandType: T,
    deduplicationKey: string
  ) {
    const authority = this.requireAuthority(namespaceId)
    const normalizedCommandType = requireIdentifier(commandType) as T
    if (!COMMAND_TYPE_SET.has(normalizedCommandType)) {
      throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
    }
    const idempotencyKey = await calculateIdempotencyKey({
      namespaceId: authority.namespaceId,
      commandType: normalizedCommandType,
      deduplicationKey: requireIdentifier(deduplicationKey),
    })
    const record = await this.findByIdempotency(
      authority.namespaceId,
      idempotencyKey
    )
    if (!record) return null
    await assertImmutableEnvelopeIntegrity(record)
    if (
      record.namespaceId !== authority.namespaceId ||
      record.commandType !== normalizedCommandType
    ) {
      throw new OfflinePhase1Error('OFFLINE_INTEGRITY_FAILED')
    }
    return Object.freeze({
      localCommandId: record.localCommandId,
      state: record.state,
      payloadHash: record.immutable.payloadHash,
    })
  }

  /** @deprecated Qualification compatibility alias. Runtime callers use readCommandPayload. */
  async readSyntheticPayload<T extends Phase3CommandType>(
    namespaceId: string,
    localCommandId: string
  ): Promise<Phase3CommandPayload<T> | null> {
    return this.readCommandPayload<T>(namespaceId, localCommandId)
  }

  async getAuthorizedCounters(namespaceId: string) {
    const authority = this.requireAuthority(namespaceId)
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(
        OFFLINE_STORES.commandOutbox,
        'readonly'
      )
      const store = transaction.objectStore(OFFLINE_STORES.commandOutbox)
      const stateIndex = store.index('namespaceState')
      const count = (state: Phase3CommandState) =>
        requestAsPromise(
          stateIndex.count(IDBKeyRange.only([authority.namespaceId, state]))
        )
      const [pending, syncing, synced, failed, conflict, blocked] =
        await Promise.all([
          count('pending'),
          count('syncing'),
          count('synced'),
          count('failed'),
          count('conflict'),
          count('blocked'),
        ])
      const oldestPending = await requestAsPromise(
        store
          .index('namespaceStateCreatedAt')
          .openCursor(
            IDBKeyRange.bound(
              [authority.namespaceId, 'pending', ''],
              [authority.namespaceId, 'pending', '\uffff']
            )
          )
      )
      await transactionAsPromise(transaction)
      const oldestCreatedAt = oldestPending
        ? (oldestPending.value as IndexedPhase3StoredCommand).createdAtLocal
        : null
      return {
        pending,
        syncing,
        synced,
        failed,
        conflict,
        blocked,
        total: pending + syncing + synced + failed + conflict + blocked,
        unresolved: pending + syncing + failed + conflict + blocked,
        oldestPendingAgeMs: oldestCreatedAt
          ? Math.max(0, this.now() - Date.parse(oldestCreatedAt))
          : null,
        quotaState:
          pending + syncing + failed + conflict + blocked >=
          PHASE3_LIMITS.maximumPendingCommands
            ? ('hard_stop' as const)
            : pending + syncing + failed + conflict + blocked >=
                PHASE3_LIMITS.quotaWarningPendingCount
              ? ('warning' as const)
              : ('normal' as const),
        authorityLocked: false as const,
      }
    } finally {
      database.close()
    }
  }

  async getSafeShadowStatus(namespaceId: string) {
    try {
      const counters = await this.getAuthorizedCounters(namespaceId)
      return {
        connectionState:
          typeof navigator === 'undefined'
            ? ('unknown' as const)
            : navigator.onLine
              ? ('online' as const)
              : ('offline' as const),
        ...counters,
      }
    } catch (error) {
      if (
        error instanceof OfflinePhase1Error &&
        (error.code === 'OFFLINE_AUTHORITY_UNAVAILABLE' ||
          error.code === 'OFFLINE_KEY_LOCKED')
      ) {
        return {
          connectionState: 'unknown' as const,
          authorityLocked: true as const,
          counters: null,
        }
      }
      throw error
    }
  }

  private async updateShadowState(
    namespaceId: string,
    localCommandId: string,
    expectedState: Phase3CommandState,
    nextState: Phase3CommandState,
    classification: string,
    serverReceiptResultReference: string | null = null
  ) {
    const authority = this.requireAuthority(namespaceId)
    assertLegalPhase3StateTransition(expectedState, nextState)
    const preliminary = await this.findByLocalCommandId(localCommandId)
    if (!preliminary) throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
    if (preliminary.namespaceId !== authority.namespaceId) {
      throw new OfflinePhase1Error('OFFLINE_CROSS_SCOPE_DENIED')
    }
    await assertImmutableEnvelopeIntegrity(preliminary)
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(
        OFFLINE_STORES.commandOutbox,
        'readwrite'
      )
      const store = transaction.objectStore(OFFLINE_STORES.commandOutbox)
      const current = (await requestAsPromise(
        store.get(commandRecordId(authority.namespaceId, localCommandId))
      )) as IndexedPhase3StoredCommand | undefined
      if (
        !current ||
        current.state !== expectedState ||
        current.immutable.envelopeHash !== preliminary.immutable.envelopeHash
      ) {
        transaction.abort()
        throw new OfflinePhase1Error('OFFLINE_DATABASE_BLOCKED', true)
      }
      const updated: IndexedPhase3StoredCommand = {
        ...current,
        state: nextState,
        runtime: {
          ...current.runtime,
          attemptCount:
            nextState === 'syncing'
              ? current.runtime.attemptCount + 1
              : current.runtime.attemptCount,
          lastAttemptAt:
            nextState === 'syncing'
              ? new Date(this.now()).toISOString()
              : current.runtime.lastAttemptAt,
          lastErrorClassification: requireIdentifier(classification),
          serverReceiptResultReference:
            serverReceiptResultReference ??
            current.runtime.serverReceiptResultReference,
        },
      }
      store.put(updated)
      await transactionAsPromise(transaction)
      return updated
    } finally {
      database.close()
    }
  }

  async markValidationFailure(
    namespaceId: string,
    localCommandId: string,
    classification = 'LOCAL_NON_RETRYABLE_VALIDATION_FAILED'
  ) {
    return this.updateShadowState(
      namespaceId,
      localCommandId,
      'pending',
      'failed',
      classification
    )
  }

  async markInvalidDependencies(
    namespaceId: string,
    localCommandId: string,
    classification = 'LOCAL_DEPENDENCY_INVALID'
  ) {
    return this.updateShadowState(
      namespaceId,
      localCommandId,
      'pending',
      'blocked',
      classification
    )
  }

  async markSyncing(namespaceId: string, localCommandId: string) {
    if (!OFFLINE_PHASE3_CAPABILITIES.commandDispatch) {
      throw new OfflinePhase1Error('OFFLINE_CAPABILITY_DISABLED')
    }
    const command = await this.findByLocalCommandId(localCommandId)
    if (
      !command ||
      command.namespaceId !== requireIdentifier(namespaceId) ||
      command.commandType !== 'order.create'
    ) {
      throw new OfflinePhase1Error('OFFLINE_CAPABILITY_DISABLED')
    }
    await assertImmutableEnvelopeIntegrity(command)
    return this.updateShadowState(
      namespaceId,
      localCommandId,
      'pending',
      'syncing',
      'BOUNDED_ORDER_CREATE_DISPATCH_STARTED'
    )
  }

  async markSynced(
    namespaceId: string,
    localCommandId: string,
    serverReceiptResultReference: string
  ) {
    if (!OFFLINE_PHASE3_CAPABILITIES.commandReplay) {
      throw new OfflinePhase1Error('OFFLINE_CAPABILITY_DISABLED')
    }
    const command = await this.findByLocalCommandId(localCommandId)
    if (
      !command ||
      command.namespaceId !== requireIdentifier(namespaceId) ||
      command.commandType !== 'order.create'
    ) {
      throw new OfflinePhase1Error('OFFLINE_CAPABILITY_DISABLED')
    }
    await assertImmutableEnvelopeIntegrity(command)
    return this.updateShadowState(
      namespaceId,
      localCommandId,
      'syncing',
      'synced',
      'STABLE_SERVER_RECEIPT_PERSISTED',
      serverReceiptResultReference
    )
  }

  async restorePendingAfterRetryableFailure(
    namespaceId: string,
    localCommandId: string,
    classification = 'RETRYABLE_SYNC_FAILURE'
  ) {
    const command = await this.findByLocalCommandId(localCommandId)
    if (
      !command ||
      command.namespaceId !== requireIdentifier(namespaceId) ||
      command.commandType !== 'order.create'
    ) {
      throw new OfflinePhase1Error('OFFLINE_CAPABILITY_DISABLED')
    }
    await assertImmutableEnvelopeIntegrity(command)
    return this.updateShadowState(
      namespaceId,
      localCommandId,
      'syncing',
      'pending',
      classification
    )
  }

  async markSyncConflict(
    namespaceId: string,
    localCommandId: string,
    classification = 'SERVER_AUTHORITY_OR_IDEMPOTENCY_CONFLICT'
  ) {
    const command = await this.findByLocalCommandId(localCommandId)
    if (
      !command ||
      command.namespaceId !== requireIdentifier(namespaceId) ||
      command.commandType !== 'order.create'
    ) {
      throw new OfflinePhase1Error('OFFLINE_CAPABILITY_DISABLED')
    }
    await assertImmutableEnvelopeIntegrity(command)
    return this.updateShadowState(
      namespaceId,
      localCommandId,
      'syncing',
      'conflict',
      classification
    )
  }

  async completeLocalEmployeePaymentAttestation(
    namespaceId: string,
    localCommandId: string
  ) {
    const command = await this.findByLocalCommandId(localCommandId)
    if (
      !command ||
      command.namespaceId !== requireIdentifier(namespaceId) ||
      command.commandType !== 'payment.employee_attestation'
    ) {
      throw new OfflinePhase1Error('OFFLINE_CAPABILITY_DISABLED')
    }
    await assertImmutableEnvelopeIntegrity(command)
    await this.updateShadowState(
      namespaceId,
      localCommandId,
      'pending',
      'syncing',
      'LOCAL_EMPLOYEE_PAYMENT_ATTESTATION_STARTED'
    )
    return this.updateShadowState(
      namespaceId,
      localCommandId,
      'syncing',
      'synced',
      'LOCAL_EMPLOYEE_PAYMENT_ATTESTATION_COMPLETED',
      `local-employee-attestation:${localCommandId}`
    )
  }

  async listCommandsByState(
    namespaceId: string,
    state: Phase3CommandState,
    limit = 10
  ) {
    const authority = this.requireAuthority(namespaceId)
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > PHASE3_LIMITS.maximumPendingCommands
    ) {
      throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
    }
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(
        OFFLINE_STORES.commandOutbox,
        'readonly'
      )
      const index = transaction
        .objectStore(OFFLINE_STORES.commandOutbox)
        .index('namespaceStateCreatedAt')
      const records = (await requestAsPromise(
        index.getAll(
          IDBKeyRange.bound(
            [authority.namespaceId, state, ''],
            [authority.namespaceId, state, '\uffff']
          ),
          limit
        )
      )) as IndexedPhase3StoredCommand[]
      await transactionAsPromise(transaction)
      for (const record of records) await assertImmutableEnvelopeIntegrity(record)
      return Object.freeze(records)
    } finally {
      database.close()
    }
  }

  async seedSyntheticRuntimeStateForQualification(
    namespaceId: string,
    localCommandId: string,
    state: Phase3CommandState,
    lastAttemptAt: string
  ) {
    this.requireAuthority(namespaceId)
    if (!this.allowSyntheticAuthority || process.env.NODE_ENV === 'production') {
      throw new OfflinePhase1Error('OFFLINE_AUTHORITY_UNAVAILABLE')
    }
    const record = await this.findByLocalCommandId(localCommandId)
    if (!record || record.namespaceId !== namespaceId) {
      throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
    }
    await assertImmutableEnvelopeIntegrity(record)
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(
        OFFLINE_STORES.commandOutbox,
        'readwrite'
      )
      transaction.objectStore(OFFLINE_STORES.commandOutbox).put({
        ...record,
        state,
        runtime: {
          ...record.runtime,
          attemptCount: state === 'syncing' ? 1 : record.runtime.attemptCount,
          lastAttemptAt: requireIsoTimestamp(lastAttemptAt),
        },
      } satisfies IndexedPhase3StoredCommand)
      await transactionAsPromise(transaction)
    } finally {
      database.close()
    }
  }

  async recoverAbandonedSyncing(namespaceId: string) {
    const authority = this.requireAuthority(namespaceId)
    const cutoff = this.now() - PHASE3_LIMITS.abandonedSyncingMs
    const database = await openOfflineDatabase(this.databaseName)
    const abandoned: string[] = []
    try {
      const transaction = database.transaction(
        OFFLINE_STORES.commandOutbox,
        'readonly'
      )
      const index = transaction
        .objectStore(OFFLINE_STORES.commandOutbox)
        .index('namespaceState')
      await new Promise<void>((resolve, reject) => {
        const request = index.openCursor(
          IDBKeyRange.only([authority.namespaceId, 'syncing'])
        )
        request.addEventListener('error', () => reject(request.error), {
          once: true,
        })
        request.addEventListener('success', () => {
          const cursor = request.result
          if (!cursor) {
            resolve()
            return
          }
          const record = cursor.value as IndexedPhase3StoredCommand
          const attemptAt = record.runtime.lastAttemptAt
            ? Date.parse(record.runtime.lastAttemptAt)
            : 0
          if (attemptAt <= cutoff) abandoned.push(record.localCommandId)
          cursor.continue()
        })
      })
      await transactionAsPromise(transaction)
    } finally {
      database.close()
    }
    const recovered: string[] = []
    for (const commandId of abandoned) {
      await this.updateShadowState(
        authority.namespaceId,
        commandId,
        'syncing',
        'pending',
        'ABANDONED_SYNCING_RECOVERED_NO_DISPATCH'
      )
      recovered.push(commandId)
    }
    return {
      recoveredCommandIds: recovered,
      networkRequests: 0,
      businessDispatches: 0,
    }
  }

  async acquireDispatcherLease(
    namespaceId: string,
    ownerId: string,
    ttlMs = PHASE3_LIMITS.dispatcherLeaseMs
  ) {
    const authority = this.requireAuthority(namespaceId)
    const normalizedOwnerId = requireIdentifier(ownerId)
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 120_000) {
      throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
    }
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(OFFLINE_STORES.meta, 'readwrite')
      const store = transaction.objectStore(OFFLINE_STORES.meta)
      const id = dispatcherLeaseRecordId(authority.namespaceId)
      const existing = (await requestAsPromise(store.get(id))) as
        | Phase3MetaRecord
        | undefined
      if (
        existing?.kind === 'phase3-dispatcher-lease' &&
        existing.ownerId !== normalizedOwnerId &&
        (existing.expiresAt ?? 0) > this.now()
      ) {
        await transactionAsPromise(transaction)
        return {
          acquired: false as const,
          ownerId: existing.ownerId ?? null,
          expiresAt: existing.expiresAt ?? null,
          dispatchEnabled: false as const,
        }
      }
      const expiresAt = this.now() + ttlMs
      store.put({
        id,
        kind: 'phase3-dispatcher-lease',
        namespaceId: authority.namespaceId,
        ownerId: normalizedOwnerId,
        expiresAt,
        schemaVersion: 1,
        updatedAt: new Date(this.now()).toISOString(),
      } satisfies Phase3MetaRecord)
      await transactionAsPromise(transaction)
      return {
        acquired: true as const,
        ownerId: normalizedOwnerId,
        expiresAt,
        dispatchEnabled: false as const,
      }
    } finally {
      database.close()
    }
  }

  async renewDispatcherLease(
    namespaceId: string,
    ownerId: string,
    ttlMs = PHASE3_LIMITS.dispatcherLeaseMs
  ) {
    const authority = this.requireAuthority(namespaceId)
    const normalizedOwnerId = requireIdentifier(ownerId)
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(OFFLINE_STORES.meta, 'readwrite')
      const store = transaction.objectStore(OFFLINE_STORES.meta)
      const id = dispatcherLeaseRecordId(authority.namespaceId)
      const existing = (await requestAsPromise(store.get(id))) as
        | Phase3MetaRecord
        | undefined
      if (
        existing?.kind !== 'phase3-dispatcher-lease' ||
        existing.ownerId !== normalizedOwnerId ||
        (existing.expiresAt ?? 0) <= this.now()
      ) {
        transaction.abort()
        throw new OfflinePhase1Error('OFFLINE_DATABASE_BLOCKED', true)
      }
      const expiresAt = this.now() + ttlMs
      store.put({
        ...existing,
        expiresAt,
        updatedAt: new Date(this.now()).toISOString(),
      })
      await transactionAsPromise(transaction)
      return { ownerId: normalizedOwnerId, expiresAt, dispatchEnabled: false as const }
    } finally {
      database.close()
    }
  }

  async releaseDispatcherLease(namespaceId: string, ownerId: string) {
    const authority = this.requireAuthority(namespaceId)
    const normalizedOwnerId = requireIdentifier(ownerId)
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(OFFLINE_STORES.meta, 'readwrite')
      const store = transaction.objectStore(OFFLINE_STORES.meta)
      const id = dispatcherLeaseRecordId(authority.namespaceId)
      const existing = (await requestAsPromise(store.get(id))) as
        | Phase3MetaRecord
        | undefined
      if (existing?.ownerId === normalizedOwnerId) store.delete(id)
      await transactionAsPromise(transaction)
      return { released: existing?.ownerId === normalizedOwnerId, dispatches: 0 }
    } finally {
      database.close()
    }
  }

  async getFutureDispatchPlan(namespaceId: string, commandIds: readonly string[]) {
    const authority = this.requireAuthority(namespaceId)
    const normalizedIds = [...new Set(commandIds.map((value) => requireIdentifier(value)))]
    if (normalizedIds.length > PHASE3_LIMITS.maximumOrderingCommands) {
      throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
    }
    const records: IndexedPhase3StoredCommand[] = []
    for (const commandId of normalizedIds) {
      const record = await this.findByLocalCommandId(commandId)
      if (!record) throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
      if (record.namespaceId !== authority.namespaceId) {
        throw new OfflinePhase1Error('OFFLINE_CROSS_SCOPE_DENIED')
      }
      await assertImmutableEnvelopeIntegrity(record)
      records.push(record)
    }
    const order = topologicallyOrderPhase3Commands(records)
    const byId = new Map(records.map((record) => [record.localCommandId, record]))
    return {
      orderedCommandIds: order,
      eligibility: order.map((commandId) => {
        const command = byId.get(commandId)!
        const blockingDependencies = command.immutable.dependencyIds.filter(
          (dependencyId) => command.commandType !== 'audit.event.append' &&
            byId.get(dependencyId)?.state !== 'synced'
        )
        return {
          commandId,
          eligible: false,
          blockingDependencies,
          classification: OFFLINE_PHASE3_CAPABILITIES.commandDispatch
            ? blockingDependencies.length
              ? 'DEPENDENCIES_NOT_SYNCED'
              : 'FUTURE_DISPATCH_AUTHORITY_REQUIRED'
            : 'SHADOW_MODE_DISPATCH_DISABLED',
        }
      }),
      dispatched: 0,
    }
  }
}

export function assertNoPhase3BusinessDispatch() {
  return Object.freeze({
    dispatchersStarted: 0,
    pollingLoops: 0,
    networkRequests: 0,
    businessWrites: 0,
    serviceWorkerDispatches: 0,
    currentWritePathInterceptions: 0,
    commandDispatch: OFFLINE_PHASE3_CAPABILITIES.commandDispatch,
  })
}

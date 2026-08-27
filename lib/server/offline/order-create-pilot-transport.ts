import 'server-only'

import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  CORE_V2_OFFLINE_BRIDGE_FLAGS,
  CORE_V2_OFFLINE_LIMITS,
  canonicalizeOfflineReplayPayload,
  parseCoreV2OfflineCommandEnvelope,
  qualifyCoreV2OfflineReplayBatch,
  type CoreV2OfflineAuthorityClaims,
  type CoreV2OfflineAuthorityResolution,
  type CoreV2OfflineCommandEnvelope,
  type CoreV2OfflineOrderCreatePayload,
  type CoreV2OfflineQualificationInput,
} from '@/lib/offline/core-v2-offline-authority-bridge'
import { requireAuthorizationContext } from '@/lib/authorization-context'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const OFFLINE_ORDER_CREATE_PILOT_SERVER_FLAGS = Object.freeze({
  transport: process.env.AFEX_OFFLINE_ORDER_CREATE_PILOT_ENABLED === 'true',
  bootstrap: process.env.AFEX_OFFLINE_ORDER_CREATE_PILOT_ENABLED === 'true',
  synchronization:
    process.env.AFEX_OFFLINE_ORDER_CREATE_PILOT_ENABLED === 'true',
  providerActions: false,
  externalEffects: false,
} as const)

export const OFFLINE_ORDER_CREATE_PILOT_MAX_BATCH = Math.min(
  1_000,
  CORE_V2_OFFLINE_LIMITS.maximumBatchSize
)

export const OFFLINE_ORDER_CREATE_PILOT_SCOPE_ENV = Object.freeze({
  accountId: 'AFEX_OFFLINE_ORDER_CREATE_PILOT_ACCOUNT_ID',
  tenantId: 'AFEX_OFFLINE_ORDER_CREATE_PILOT_TENANT_ID',
  branchId: 'AFEX_OFFLINE_ORDER_CREATE_PILOT_BRANCH_ID',
  deviceId: 'AFEX_OFFLINE_ORDER_CREATE_PILOT_DEVICE_ID',
  employeeId: 'AFEX_OFFLINE_ORDER_CREATE_PILOT_EMPLOYEE_ID',
} as const)

export const OFFLINE_ORDER_CREATE_PILOT_OPERATIONS = Object.freeze([
  'online.bootstrap',
  'device.register',
  'device.activate',
  'employee.enroll',
  'employee.replace_pin',
  'inventory.publish',
  'inventory.read',
  'order.create.resolve_and_acquire',
  'receipt.lookup',
  'account.logout',
  'account.recovery',
] as const)

type PilotOperation = (typeof OFFLINE_ORDER_CREATE_PILOT_OPERATIONS)[number]
type JsonRecord = Record<string, unknown>
type PilotScope = Readonly<{
  accountId: string
  tenantId: string
  branchId: string
  deviceId: string
  employeeId: string
}>

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const SAFE_VERSION_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/
const ALLOWED_OPERATION_SET = new Set<string>(OFFLINE_ORDER_CREATE_PILOT_OPERATIONS)

const PAYLOAD_KEYS = Object.freeze({
  'online.bootstrap': [
    'operationId',
    'deviceId',
    'keyEnvelopeId',
    'keyEnvelopeVersion',
    'namespaceGeneration',
    'inventorySnapshotId',
    'packageSha256',
    'evidenceSha256',
  ],
  'device.register': [
    'operationId',
    'deviceId',
    'mode',
    'proofPublicKeyJwk',
    'wrapPublicKeyJwk',
    'evidenceSha256',
  ],
  'device.activate': [
    'operationId',
    'deviceId',
    'expectedDeviceGeneration',
    'evidenceSha256',
  ],
  'employee.enroll': [
    'operationId',
    'deviceId',
    'actualPosEmployeeId',
    'keyEnvelopeId',
    'keyEnvelopeVersion',
    'namespaceGeneration',
    'pinVerifierSaltHex',
    'pinVerifierHex',
    'packageSha256',
    'evidenceSha256',
  ],
  'employee.replace_pin': [
    'operationId',
    'deviceId',
    'actualPosEmployeeId',
    'expectedEnrollmentGeneration',
    'pinVerifierSaltHex',
    'pinVerifierHex',
    'packageSha256',
    'evidenceSha256',
  ],
  'inventory.publish': [
    'deviceId',
    'snapshotId',
    'frontierVersion',
    'confirmedAt',
  ],
  'inventory.read': ['claim', 'catalogItemIds'],
  'order.create.resolve_and_acquire': ['commands'],
  'receipt.lookup': ['claims'],
  'account.logout': ['operationId', 'deviceId', 'evidenceSha256'],
  'account.recovery': ['deviceId'],
} satisfies Readonly<Record<PilotOperation, readonly string[]>>)

export class OfflinePilotTransportError extends Error {
  constructor(
    readonly classification: string,
    readonly status: number
  ) {
    super(classification)
    this.name = 'OfflinePilotTransportError'
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  classification: string
): JsonRecord {
  if (!isRecord(value)) throw new OfflinePilotTransportError(classification, 400)
  const actualKeys = Object.keys(value).sort()
  const expected = [...expectedKeys].sort()
  if (
    actualKeys.length !== expected.length ||
    actualKeys.some((key, index) => key !== expected[index])
  ) {
    throw new OfflinePilotTransportError(classification, 400)
  }
  return value
}

function uuid(value: unknown, classification: string) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new OfflinePilotTransportError(classification, 400)
  }
  return value
}

function positiveGeneration(value: unknown, classification: string) {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new OfflinePilotTransportError(classification, 400)
  }
  return Number(value)
}

function sha256(value: unknown, classification: string) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new OfflinePilotTransportError(classification, 400)
  }
  return value
}

function byteaHex(value: unknown, classification: string) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new OfflinePilotTransportError(classification, 400)
  }
  return `\\x${value.toLowerCase()}`
}

function isoTimestamp(value: unknown, classification: string) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    !value.includes('T')
  ) {
    throw new OfflinePilotTransportError(classification, 400)
  }
  return value
}

function parseRequestBody(value: unknown) {
  const request = exactRecord(
    value,
    ['operation', 'payload'],
    'OFFLINE_PILOT_REQUEST_SCHEMA_INVALID'
  )
  if (
    typeof request.operation !== 'string' ||
    !ALLOWED_OPERATION_SET.has(request.operation)
  ) {
    throw new OfflinePilotTransportError(
      'OFFLINE_PILOT_OPERATION_NOT_ALLOWED',
      400
    )
  }
  const operation = request.operation as PilotOperation
  return {
    operation,
    payload: exactRecord(
      request.payload,
      PAYLOAD_KEYS[operation],
      'OFFLINE_PILOT_PAYLOAD_SCHEMA_INVALID'
    ),
  }
}

function readPilotScopeFromEnvironment(): PilotScope {
  const candidate = {
    accountId: process.env[OFFLINE_ORDER_CREATE_PILOT_SCOPE_ENV.accountId],
    tenantId: process.env[OFFLINE_ORDER_CREATE_PILOT_SCOPE_ENV.tenantId],
    branchId: process.env[OFFLINE_ORDER_CREATE_PILOT_SCOPE_ENV.branchId],
    deviceId: process.env[OFFLINE_ORDER_CREATE_PILOT_SCOPE_ENV.deviceId],
    employeeId: process.env[OFFLINE_ORDER_CREATE_PILOT_SCOPE_ENV.employeeId],
  }
  for (const value of Object.values(candidate)) {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      throw new OfflinePilotTransportError(
        'OFFLINE_PILOT_SCOPE_CONFIGURATION_INVALID',
        503
      )
    }
  }
  return Object.freeze(candidate as PilotScope)
}

type TrustedPilotContext = Readonly<{
  authenticatedSubjectId: string
  authenticatedSessionId: string
  posActorSessionId: string
  actualPosEmployeeId: string
  tenantId: string
  branchId: string
}>

function assertTrustedContext(context: {
  verifiedAuth: { subjectId: string; sessionId: string }
  tenantId: string | null
  activeBranchId: string | null
  posEmployee: { id: string; tenantId: string; branchId: string | null } | null
  posActorSession: {
    sessionId: string
    actorId: string
    authenticatedSubjectId: string
    authenticatedSessionId: string
    tenantId: string
    branchId: string
  } | null
}): TrustedPilotContext {
  const actor = context.posActorSession
  const employee = context.posEmployee
  if (!actor || !employee || !context.tenantId || !context.activeBranchId) {
    throw new OfflinePilotTransportError(
      'OFFLINE_PILOT_POS_ACTOR_AUTHORITY_REQUIRED',
      403
    )
  }
  if (
    actor.authenticatedSubjectId !== context.verifiedAuth.subjectId ||
    actor.authenticatedSessionId !== context.verifiedAuth.sessionId ||
    actor.actorId !== employee.id ||
    actor.tenantId !== context.tenantId ||
    actor.branchId !== context.activeBranchId ||
    employee.tenantId !== context.tenantId ||
    employee.branchId !== context.activeBranchId
  ) {
    throw new OfflinePilotTransportError(
      'OFFLINE_PILOT_TRUSTED_CONTEXT_MISMATCH',
      403
    )
  }
  return Object.freeze({
    authenticatedSubjectId: context.verifiedAuth.subjectId,
    authenticatedSessionId: context.verifiedAuth.sessionId,
    posActorSessionId: actor.sessionId,
    actualPosEmployeeId: employee.id,
    tenantId: context.tenantId,
    branchId: context.activeBranchId,
  })
}

function assertEnvelopeContext(
  envelope: CoreV2OfflineCommandEnvelope,
  trusted: TrustedPilotContext
) {
  if (
    envelope.commandType !== 'order.create' ||
    envelope.primaryAuthenticatedUserId !== trusted.authenticatedSubjectId ||
    envelope.actualPosEmployeeId !== trusted.actualPosEmployeeId ||
    envelope.tenantId !== trusted.tenantId ||
    envelope.branchId !== trusted.branchId ||
    envelope.originAuthorityReference.primaryAuthenticatedSubjectId !==
      trusted.authenticatedSubjectId ||
    envelope.originAuthorityReference.actualPosEmployeeId !==
      trusted.actualPosEmployeeId ||
    envelope.originAuthorityReference.tenantId !== trusted.tenantId ||
    envelope.originAuthorityReference.branchId !== trusted.branchId
  ) {
    throw new OfflinePilotTransportError(
      'OFFLINE_PILOT_ENVELOPE_AUTHORITY_SUBSTITUTION_REJECTED',
      403
    )
  }
}

function scopedDeviceId(operation: PilotOperation, payload: JsonRecord) {
  if (typeof payload.deviceId === 'string') {
    return uuid(payload.deviceId, 'OFFLINE_PILOT_DEVICE_ID_INVALID')
  }
  const candidates =
    operation === 'order.create.resolve_and_acquire'
      ? payload.commands
      : operation === 'receipt.lookup'
        ? payload.claims
        : operation === 'inventory.read'
          ? [payload.claim]
          : null
  if (!Array.isArray(candidates) || candidates.length < 1) {
    throw new OfflinePilotTransportError(
      'OFFLINE_PILOT_SCOPED_DEVICE_REQUIRED',
      400
    )
  }
  const deviceIds = candidates.map((candidate) => {
    if (!isRecord(candidate)) {
      throw new OfflinePilotTransportError(
        'OFFLINE_PILOT_SCOPED_DEVICE_REQUIRED',
        400
      )
    }
    const envelope =
      operation === 'order.create.resolve_and_acquire'
        ? candidate.envelope
        : candidate
    if (!isRecord(envelope)) {
      throw new OfflinePilotTransportError(
        'OFFLINE_PILOT_SCOPED_DEVICE_REQUIRED',
        400
      )
    }
    return uuid(envelope.deviceId, 'OFFLINE_PILOT_DEVICE_ID_INVALID')
  })
  if (deviceIds.some((deviceId) => deviceId !== deviceIds[0])) {
    throw new OfflinePilotTransportError(
      'OFFLINE_PILOT_MIXED_DEVICE_BATCH_REJECTED',
      403
    )
  }
  return deviceIds[0]
}

function assertPilotScope(
  operation: PilotOperation,
  payload: JsonRecord,
  trusted: TrustedPilotContext,
  scope: PilotScope
) {
  if (
    trusted.authenticatedSubjectId !== scope.accountId ||
    trusted.tenantId !== scope.tenantId ||
    trusted.branchId !== scope.branchId ||
    trusted.actualPosEmployeeId !== scope.employeeId ||
    scopedDeviceId(operation, payload) !== scope.deviceId
  ) {
    throw new OfflinePilotTransportError(
      'OFFLINE_PILOT_SCOPE_NOT_ALLOWLISTED',
      403
    )
  }
}

export interface OfflinePilotRpcProvider {
  invoke(name: string, args: Readonly<JsonRecord>): Promise<unknown>
  readInventory(input: Readonly<{ tenantId: string; branchId: string }>): Promise<
    readonly Readonly<{
      catalogItemId: string
      confirmedStock: string
      stockUpdatedAt: string
    }>[]
  >
}

const SUPABASE_PROVIDER: OfflinePilotRpcProvider = Object.freeze({
  async invoke(name: string, args: Readonly<JsonRecord>) {
    const { data, error } = await supabaseAdmin.rpc(name, args)
    if (error) {
      throw new OfflinePilotTransportError(
        'OFFLINE_PILOT_DATABASE_CONTRACT_FAILED',
        503
      )
    }
    return data
  },
  async readInventory({
    tenantId,
    branchId,
  }: Readonly<{ tenantId: string; branchId: string }>) {
    const { data, error } = await supabaseAdmin
      .from('inventory_stock')
      .select('catalog_item_id, quantity_on_hand, updated_at')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .order('catalog_item_id', { ascending: true })
    if (error || !Array.isArray(data)) {
      throw new OfflinePilotTransportError(
        'OFFLINE_PILOT_INVENTORY_READ_FAILED',
        503
      )
    }
    return data.map((row) => ({
      catalogItemId: uuid(
        row.catalog_item_id,
        'OFFLINE_PILOT_INVENTORY_ITEM_INVALID'
      ),
      confirmedStock: String(row.quantity_on_hand),
      stockUpdatedAt: isoTimestamp(
        row.updated_at,
        'OFFLINE_PILOT_INVENTORY_TIMESTAMP_INVALID'
      ),
    }))
  },
})

function rpcArgsForAcquisition(
  envelope: CoreV2OfflineCommandEnvelope,
  trusted: TrustedPilotContext
) {
  const payload = envelope.payload as CoreV2OfflineOrderCreatePayload
  if (envelope.commandType !== 'order.create') {
    throw new OfflinePilotTransportError(
      'OFFLINE_PILOT_ORDER_CREATE_ONLY',
      400
    )
  }
  return Object.freeze({
    p_sync_authenticated_subject_id: trusted.authenticatedSubjectId,
    p_sync_authenticated_session_id: trusted.authenticatedSessionId,
    p_sync_pos_actor_session_id: trusted.posActorSessionId,
    p_command_contract_version: envelope.commandContractVersion,
    p_command_type: envelope.commandType,
    p_schema_version: envelope.schemaVersion,
    p_local_command_id: envelope.localCommandId,
    p_idempotency_key: envelope.idempotencyKey,
    p_primary_authenticated_user_id: trusted.authenticatedSubjectId,
    p_actual_pos_employee_id: trusted.actualPosEmployeeId,
    p_tenant_id: trusted.tenantId,
    p_branch_id: trusted.branchId,
    p_device_id: envelope.deviceId,
    p_device_generation: envelope.deviceGeneration,
    p_employee_enrollment_generation: envelope.employeeEnrollmentGeneration,
    p_command_generation: envelope.commandGeneration,
    p_key_envelope_id: envelope.keyEnvelopeId,
    p_key_envelope_version: envelope.keyEnvelopeVersion,
    p_aggregate_type: envelope.aggregateType,
    p_aggregate_id: envelope.aggregateId,
    p_local_aggregate_reference: envelope.localAggregateReference,
    p_payload_canonical_hash: envelope.payloadCanonicalHash,
    p_payment_attestation: envelope.paymentAttestation,
    p_inventory_frontier_reference: envelope.inventoryFrontierReference,
    p_origin_authority_reference: envelope.originAuthorityReference,
    p_authority_binding_canonical_hash: envelope.authorityBindingCanonicalHash,
    p_offline_canonical_payload: payload,
    p_core_canonical_payload: canonicalizeOfflineReplayPayload(
      payload.coreOrderCanonicalPayload
    ),
    p_core_fingerprint_projection: canonicalizeOfflineReplayPayload(
      payload.coreFingerprintProjection
    ),
    p_correlation_reference: envelope.localCommandId,
    p_retain_until: new Date(
      Date.parse(envelope.localCreatedAt) + 30 * 24 * 60 * 60 * 1_000
    ).toISOString(),
    p_local_created_at: envelope.localCreatedAt,
    p_client_application_version: envelope.clientApplicationVersion,
  })
}

function parseQualificationInputs(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > OFFLINE_ORDER_CREATE_PILOT_MAX_BATCH) {
    throw new OfflinePilotTransportError('OFFLINE_PILOT_BATCH_INVALID', 400)
  }
  return value.map((candidate) => {
    const record = exactRecord(
      candidate,
      ['envelope', 'dependencyStates'],
      'OFFLINE_PILOT_COMMAND_SCHEMA_INVALID'
    )
    if (!Array.isArray(record.dependencyStates)) {
      throw new OfflinePilotTransportError(
        'OFFLINE_PILOT_DEPENDENCY_STATE_INVALID',
        400
      )
    }
    return Object.freeze({
      envelope: record.envelope,
      dependencyStates: record.dependencyStates,
      existingAcquisition: null,
    }) satisfies CoreV2OfflineQualificationInput
  })
}

async function resolveAndAcquire(
  payload: JsonRecord,
  trusted: TrustedPilotContext,
  provider: OfflinePilotRpcProvider
) {
  const inputs = parseQualificationInputs(payload.commands)
  const envelopes = inputs.map((input) => {
    const envelope = parseCoreV2OfflineCommandEnvelope(input.envelope)
    assertEnvelopeContext(envelope, trusted)
    return envelope
  })
  const resolver = Object.freeze({
    async resolveBatch(claims: readonly CoreV2OfflineAuthorityClaims[]) {
      const raw = await provider.invoke(
        'afex_offline_server_resolve_order_create_batch_v1',
        Object.freeze({
          p_sync_authenticated_subject_id: trusted.authenticatedSubjectId,
          p_sync_authenticated_session_id: trusted.authenticatedSessionId,
          p_sync_pos_actor_session_id: trusted.posActorSessionId,
          p_claims: claims,
        })
      )
      if (!Array.isArray(raw)) {
        throw new OfflinePilotTransportError(
          'OFFLINE_PILOT_RESOLVER_OUTPUT_MALFORMED',
          503
        )
      }
      return raw as readonly CoreV2OfflineAuthorityResolution[]
    },
  })
  const qualifications = await qualifyCoreV2OfflineReplayBatch(inputs, resolver)
  const acquisitions: unknown[] = new Array(qualifications.length).fill(null)
  for (const [index, qualification] of qualifications.entries()) {
    if (qualification.outcome !== 'qualified') {
      continue
    }
    acquisitions[index] = await provider.invoke(
      'afex_offline_server_acquire_order_create_v1',
      rpcArgsForAcquisition(envelopes[index], trusted)
    )
  }
  return Object.freeze({
    contractVersion: 'offline-order-create-pilot-transport.v1',
    qualifications,
    acquisitions,
    providerActions: 0,
    externalEffects: 0,
  })
}

async function executeOperation(
  operation: PilotOperation,
  payload: JsonRecord,
  trusted: TrustedPilotContext,
  provider: OfflinePilotRpcProvider
) {
  const common = {
    subject: trusted.authenticatedSubjectId,
    session: trusted.authenticatedSessionId,
    actorSession: trusted.posActorSessionId,
    employee: trusted.actualPosEmployeeId,
    tenant: trusted.tenantId,
    branch: trusted.branchId,
  }
  switch (operation) {
    case 'device.register':
      return provider.invoke('afex_offline_server_register_device_v1', {
        p_operation_id: uuid(payload.operationId, 'OFFLINE_PILOT_OPERATION_ID_INVALID'),
        p_primary_authenticated_subject_id: common.subject,
        p_authenticated_session_id: common.session,
        p_pos_actor_session_id: common.actorSession,
        p_tenant_id: common.tenant,
        p_branch_id: common.branch,
        p_device_id: uuid(payload.deviceId, 'OFFLINE_PILOT_DEVICE_ID_INVALID'),
        p_mode:
          payload.mode === 'MODE_A_MANAGED_PWA_CONTINUOUS_OFFLINE'
            ? payload.mode
            : (() => {
                throw new OfflinePilotTransportError('OFFLINE_PILOT_DEVICE_MODE_INVALID', 400)
              })(),
        p_proof_public_key_jwk: exactRecord(
          payload.proofPublicKeyJwk,
          ['crv', 'kty', 'use', 'x', 'y'],
          'OFFLINE_PILOT_PROOF_KEY_INVALID'
        ),
        p_wrap_public_key_jwk: exactRecord(
          payload.wrapPublicKeyJwk,
          ['alg', 'e', 'kty', 'n', 'use'],
          'OFFLINE_PILOT_WRAP_KEY_INVALID'
        ),
        p_evidence_sha256: sha256(payload.evidenceSha256, 'OFFLINE_PILOT_EVIDENCE_INVALID'),
      })
    case 'device.activate':
      return provider.invoke('afex_offline_server_activate_device_v1', {
        p_operation_id: uuid(payload.operationId, 'OFFLINE_PILOT_OPERATION_ID_INVALID'),
        p_primary_authenticated_subject_id: common.subject,
        p_authenticated_session_id: common.session,
        p_pos_actor_session_id: common.actorSession,
        p_tenant_id: common.tenant,
        p_branch_id: common.branch,
        p_device_id: uuid(payload.deviceId, 'OFFLINE_PILOT_DEVICE_ID_INVALID'),
        p_expected_device_generation: positiveGeneration(
          payload.expectedDeviceGeneration,
          'OFFLINE_PILOT_DEVICE_GENERATION_INVALID'
        ),
        p_evidence_sha256: sha256(payload.evidenceSha256, 'OFFLINE_PILOT_EVIDENCE_INVALID'),
      })
    case 'employee.enroll':
    case 'employee.replace_pin': {
      const employeeId = uuid(
        payload.actualPosEmployeeId,
        'OFFLINE_PILOT_EMPLOYEE_ID_INVALID'
      )
      if (employeeId !== common.employee) {
        throw new OfflinePilotTransportError(
          'OFFLINE_PILOT_EMPLOYEE_SUBSTITUTION_REJECTED',
          403
        )
      }
      const base = {
        p_operation_id: uuid(payload.operationId, 'OFFLINE_PILOT_OPERATION_ID_INVALID'),
        p_primary_authenticated_subject_id: common.subject,
        p_authenticated_session_id: common.session,
        p_pos_actor_session_id: common.actorSession,
        p_tenant_id: common.tenant,
        p_branch_id: common.branch,
        p_device_id: uuid(payload.deviceId, 'OFFLINE_PILOT_DEVICE_ID_INVALID'),
        p_actual_pos_employee_id: employeeId,
        p_pin_verifier_salt: byteaHex(payload.pinVerifierSaltHex, 'OFFLINE_PILOT_PIN_SALT_INVALID'),
        p_pin_verifier_bytes: byteaHex(payload.pinVerifierHex, 'OFFLINE_PILOT_PIN_VERIFIER_INVALID'),
        p_package_sha256: sha256(payload.packageSha256, 'OFFLINE_PILOT_PACKAGE_INVALID'),
        p_evidence_sha256: sha256(payload.evidenceSha256, 'OFFLINE_PILOT_EVIDENCE_INVALID'),
      }
      return operation === 'employee.enroll'
        ? provider.invoke('afex_offline_server_enroll_employee_v1', {
            ...base,
            p_key_envelope_id: uuid(payload.keyEnvelopeId, 'OFFLINE_PILOT_KEY_ENVELOPE_INVALID'),
            p_key_envelope_version: positiveGeneration(payload.keyEnvelopeVersion, 'OFFLINE_PILOT_KEY_VERSION_INVALID'),
            p_namespace_generation: positiveGeneration(payload.namespaceGeneration, 'OFFLINE_PILOT_NAMESPACE_INVALID'),
          })
        : provider.invoke('afex_offline_server_replace_employee_pin_v1', {
            ...base,
            p_expected_enrollment_generation: positiveGeneration(
              payload.expectedEnrollmentGeneration,
              'OFFLINE_PILOT_ENROLLMENT_GENERATION_INVALID'
            ),
          })
    }
    case 'inventory.publish': {
      const items = await provider.readInventory({
        tenantId: common.tenant,
        branchId: common.branch,
      })
      return provider.invoke('afex_offline_server_publish_inventory_v1', {
        p_snapshot_id: uuid(payload.snapshotId, 'OFFLINE_PILOT_SNAPSHOT_ID_INVALID'),
        p_primary_authenticated_subject_id: common.subject,
        p_authenticated_session_id: common.session,
        p_pos_actor_session_id: common.actorSession,
        p_tenant_id: common.tenant,
        p_branch_id: common.branch,
        p_frontier_version:
          typeof payload.frontierVersion === 'string' &&
          SAFE_VERSION_PATTERN.test(payload.frontierVersion)
            ? payload.frontierVersion
            : (() => {
                throw new OfflinePilotTransportError('OFFLINE_PILOT_FRONTIER_VERSION_INVALID', 400)
              })(),
        p_confirmed_at: isoTimestamp(payload.confirmedAt, 'OFFLINE_PILOT_CONFIRMED_AT_INVALID'),
        p_items: items,
      })
    }
    case 'inventory.read': {
      if (!Array.isArray(payload.catalogItemIds) || payload.catalogItemIds.length > 200) {
        throw new OfflinePilotTransportError('OFFLINE_PILOT_CATALOG_ITEMS_INVALID', 400)
      }
      return provider.invoke('afex_offline_server_read_inventory_v1', {
        p_sync_authenticated_subject_id: common.subject,
        p_sync_authenticated_session_id: common.session,
        p_sync_pos_actor_session_id: common.actorSession,
        p_claim: payload.claim,
        p_catalog_item_ids: payload.catalogItemIds.map((item) =>
          uuid(item, 'OFFLINE_PILOT_CATALOG_ITEM_INVALID')
        ),
      })
    }
    case 'online.bootstrap':
      return provider.invoke('afex_offline_server_bootstrap_v1', {
        p_operation_id: uuid(payload.operationId, 'OFFLINE_PILOT_OPERATION_ID_INVALID'),
        p_primary_authenticated_subject_id: common.subject,
        p_authenticated_session_id: common.session,
        p_pos_actor_session_id: common.actorSession,
        p_tenant_id: common.tenant,
        p_branch_id: common.branch,
        p_device_id: uuid(payload.deviceId, 'OFFLINE_PILOT_DEVICE_ID_INVALID'),
        p_key_envelope_id: uuid(payload.keyEnvelopeId, 'OFFLINE_PILOT_KEY_ENVELOPE_INVALID'),
        p_key_envelope_version: positiveGeneration(payload.keyEnvelopeVersion, 'OFFLINE_PILOT_KEY_VERSION_INVALID'),
        p_namespace_generation: positiveGeneration(payload.namespaceGeneration, 'OFFLINE_PILOT_NAMESPACE_INVALID'),
        p_inventory_snapshot_id: uuid(payload.inventorySnapshotId, 'OFFLINE_PILOT_SNAPSHOT_ID_INVALID'),
        p_package_sha256: sha256(payload.packageSha256, 'OFFLINE_PILOT_PACKAGE_INVALID'),
        p_evidence_sha256: sha256(payload.evidenceSha256, 'OFFLINE_PILOT_EVIDENCE_INVALID'),
      })
    case 'order.create.resolve_and_acquire':
      return resolveAndAcquire(payload, trusted, provider)
    case 'receipt.lookup': {
      if (!Array.isArray(payload.claims) || payload.claims.length < 1 || payload.claims.length > OFFLINE_ORDER_CREATE_PILOT_MAX_BATCH) {
        throw new OfflinePilotTransportError('OFFLINE_PILOT_RECEIPT_BATCH_INVALID', 400)
      }
      return provider.invoke('afex_offline_server_lookup_receipts_v1', {
        p_sync_authenticated_subject_id: common.subject,
        p_sync_authenticated_session_id: common.session,
        p_sync_pos_actor_session_id: common.actorSession,
        p_claims: payload.claims,
      })
    }
    case 'account.logout':
      return provider.invoke('afex_offline_server_logout_v1', {
        p_operation_id: uuid(payload.operationId, 'OFFLINE_PILOT_OPERATION_ID_INVALID'),
        p_primary_authenticated_subject_id: common.subject,
        p_authenticated_session_id: common.session,
        p_pos_actor_session_id: common.actorSession,
        p_tenant_id: common.tenant,
        p_branch_id: common.branch,
        p_device_id: uuid(payload.deviceId, 'OFFLINE_PILOT_DEVICE_ID_INVALID'),
        p_evidence_sha256: sha256(payload.evidenceSha256, 'OFFLINE_PILOT_EVIDENCE_INVALID'),
      })
    case 'account.recovery':
      return provider.invoke('afex_offline_server_recovery_state_v1', {
        p_primary_authenticated_subject_id: common.subject,
        p_authenticated_session_id: common.session,
        p_pos_actor_session_id: common.actorSession,
        p_tenant_id: common.tenant,
        p_branch_id: common.branch,
        p_device_id: uuid(payload.deviceId, 'OFFLINE_PILOT_DEVICE_ID_INVALID'),
      })
  }
}

export async function handleOfflineOrderCreatePilotRequest(
  request: NextRequest,
  options: Readonly<{
    provider?: OfflinePilotRpcProvider
    enabled?: boolean
    scope?: PilotScope
  }> = {}
) {
  const enabled = options.enabled ?? OFFLINE_ORDER_CREATE_PILOT_SERVER_FLAGS.transport
  if (!enabled) {
    return NextResponse.json(
      { error: 'OFFLINE_PILOT_DISABLED' },
      { status: 404 }
    )
  }
  if (
    Object.values(CORE_V2_OFFLINE_BRIDGE_FLAGS).some(Boolean) ||
    OFFLINE_ORDER_CREATE_PILOT_SERVER_FLAGS.providerActions ||
    OFFLINE_ORDER_CREATE_PILOT_SERVER_FLAGS.externalEffects
  ) {
    return NextResponse.json(
      { error: 'OFFLINE_PILOT_SAFETY_FLAGS_INVALID' },
      { status: 503 }
    )
  }
  const authorization = await requireAuthorizationContext(request, [
    'admin',
    'employee',
    'cashier',
  ])
  if (!authorization.ok) return authorization.response
  if (!authorization.context.can('pos:access')) {
    return NextResponse.json({ error: 'OFFLINE_PILOT_POS_ONLY' }, { status: 403 })
  }
  try {
    const trusted = assertTrustedContext(authorization.context)
    const body = parseRequestBody(await request.json())
    assertPilotScope(
      body.operation,
      body.payload,
      trusted,
      options.scope ?? readPilotScopeFromEnvironment()
    )
    const result = await executeOperation(
      body.operation,
      body.payload,
      trusted,
      options.provider ?? SUPABASE_PROVIDER
    )
    return NextResponse.json({
      success: true,
      correlationId: authorization.context.correlationId || randomUUID(),
      operation: body.operation,
      data: result,
      providerActions: 0,
      externalEffects: 0,
    })
  } catch (error) {
    const failure =
      error instanceof OfflinePilotTransportError
        ? error
        : new OfflinePilotTransportError('OFFLINE_PILOT_REQUEST_FAILED', 500)
    return NextResponse.json(
      {
        success: false,
        correlationId: authorization.context.correlationId || randomUUID(),
        error: failure.classification,
      },
      { status: failure.status }
    )
  }
}

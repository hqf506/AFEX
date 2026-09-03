import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessPos } from '@/lib/permissions'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireVerifiedAuthContext } from '@/lib/verified-auth-context'
import {
  prePinDatabaseEvidence,
  type PrePinDatabaseEvidence,
} from '@/lib/server/offline/pre-pin-safe-diagnostics'

export const PRE_PIN_PROVISIONING_CONTRACT_VERSION =
  'afex-offline-pre-pin-provisioning.v2' as const
export const MULTI_DEVICE_PRE_PIN_PROVISIONING_CONTRACT_VERSION =
  'afex-offline-pre-pin-provisioning.v3' as const

export const PRE_PIN_PROVISIONING_OPERATIONS = Object.freeze([
  'device.provision',
  'device.replacement.inspect',
  'device.replacement.retire',
  'employee.roster',
  'inventory.publish',
  'bootstrap.publish',
] as const)

type Operation = (typeof PRE_PIN_PROVISIONING_OPERATIONS)[number]
type JsonRecord = Record<string, unknown>

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const SAFE_VERSION_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/
const OPERATION_SET = new Set<string>(PRE_PIN_PROVISIONING_OPERATIONS)
const PRE_PIN_ATTEMPT_CONTRACT_COOKIE = 'afex_pre_pin_attempt_contract'
const PRE_PIN_ATTEMPT_CONTRACT_MAX_AGE_SECONDS = 10 * 60
const PREPARATION_DIAGNOSTIC_CONTRACT =
  'afex-offline-preparation-client-diagnostic.v1'
const PREPARATION_DIAGNOSTIC_STAGES = new Set([
  'context.verify',
  'device.material',
  'device.provision',
  'employee.roster',
  'employee.enrollment',
  'read-snapshot',
  'inventory.publish',
  'bootstrap.publish',
  'local.install',
  'service-worker.install',
  'complete',
])
const PREPARATION_DIAGNOSTIC_OPERATIONS = new Set([
  'start',
  'success',
  'failure',
  'resume-required',
  'resume',
])
const PREPARATION_DIAGNOSTIC_MATERIAL_STATES = new Set([
  'unknown',
  'restored',
  'created',
])
const PREPARATION_DIAGNOSTIC_SW_STATES = new Set([
  'unsupported',
  'uncontrolled',
  'installing',
  'installed',
  'activating',
  'activated',
  'redundant',
])
const PREPARATION_DIAGNOSTIC_CLASSIFICATIONS = new Set([
  'none',
  'OFFLINE_EMPLOYEE_ENROLLMENT_REQUIRED',
  'OFFLINE_ROSTER_INVALID',
  'OFFLINE_ROSTER_VERIFIER_INVALID',
  'OFFLINE_DATABASE_BLOCKED',
  'OFFLINE_DATABASE_UNAVAILABLE',
  'OFFLINE_SCHEMA_CORRUPT',
  'OFFLINE_SCHEMA_UNSUPPORTED',
  'OFFLINE_KEY_LOCKED',
  'OFFLINE_SHELL_UNAVAILABLE',
  'OFFLINE_PREPARATION_CLIENT_FAILURE',
])

function multiDeviceOnboardingW1Enabled() {
  return (
    process.env.VERCEL_ENV === 'preview' &&
    process.env.AFEX_OFFLINE_MULTI_DEVICE_ONBOARDING_W1_ENABLED === 'true'
  )
}

function activePrePinContractVersion() {
  return multiDeviceOnboardingW1Enabled()
    ? MULTI_DEVICE_PRE_PIN_PROVISIONING_CONTRACT_VERSION
    : PRE_PIN_PROVISIONING_CONTRACT_VERSION
}

function prePinFacade(
  operation: Extract<
    Operation,
    'device.provision' | 'employee.roster' | 'inventory.publish' | 'bootstrap.publish'
  >
) {
  const version = multiDeviceOnboardingW1Enabled() ? 'v3' : 'v2'
  const names = {
    'device.provision': `afex_offline_server_pre_pin_provision_device_${version}`,
    'employee.roster': `afex_offline_server_pre_pin_employee_roster_${version}`,
    'inventory.publish': `afex_offline_server_pre_pin_publish_inventory_${version}`,
    'bootstrap.publish': `afex_offline_server_pre_pin_bootstrap_${version}`,
  } as const
  return names[operation]
}

const PAYLOAD_KEYS = Object.freeze({
  'device.provision': Object.freeze([
    'operationId',
    'deviceId',
    'proofPublicKeyJwk',
    'wrapPublicKeyJwk',
    'keyEnvelopeId',
    'wrappedKeySha256',
    'publicKeySha256',
    'envelopeAadSha256',
    'envelopeCiphertextSha256',
    'evidenceSha256',
  ]),
  'device.replacement.inspect': Object.freeze([]),
  'device.replacement.retire': Object.freeze([
    'operationId',
    'confirmation',
    'localOutboxZeroAttested',
  ]),
  'employee.roster': Object.freeze(['deviceId']),
  'inventory.publish': Object.freeze([
    'deviceId',
    'snapshotId',
    'frontierVersion',
    'confirmedAt',
  ]),
  'bootstrap.publish': Object.freeze([
    'operationId',
    'deviceId',
    'keyEnvelopeId',
    'keyEnvelopeVersion',
    'namespaceGeneration',
    'inventorySnapshotId',
    'packageSha256',
    'evidenceSha256',
  ]),
} satisfies Readonly<Record<Operation, readonly string[]>>)

class PrePinProvisioningError extends Error {
  constructor(
    readonly classification: string,
    readonly status: number,
    readonly diagnostic: Readonly<{
      stage: Operation
      rpcName: string
      database: PrePinDatabaseEvidence
    }> | null = null
  ) {
    super(classification)
    this.name = 'PrePinProvisioningError'
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  classification: string
) {
  if (!isRecord(value)) throw new PrePinProvisioningError(classification, 400)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new PrePinProvisioningError(classification, 400)
  }
  return value
}

function uuid(value: unknown, classification: string) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new PrePinProvisioningError(classification, 400)
  }
  return value
}

function sha256(value: unknown, classification: string) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new PrePinProvisioningError(classification, 400)
  }
  return value.toLowerCase()
}

function positiveGeneration(value: unknown, classification: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new PrePinProvisioningError(classification, 400)
  }
  return Number(value)
}

function isoTimestamp(value: unknown, classification: string) {
  if (typeof value !== 'string' || !value.includes('T') || !Date.parse(value)) {
    throw new PrePinProvisioningError(classification, 400)
  }
  return value
}

function safeVersion(value: unknown, classification: string) {
  if (typeof value !== 'string' || !SAFE_VERSION_PATTERN.test(value)) {
    throw new PrePinProvisioningError(classification, 400)
  }
  return value
}

function requiredBoolean(value: unknown, classification: string) {
  if (typeof value !== 'boolean') {
    throw new PrePinProvisioningError(classification, 400)
  }
  return value
}

function replacementAdministrator(trusted: TrustedPrePinContext) {
  if (!['owner', 'admin'].includes(trusted.accountRole)) {
    throw new PrePinProvisioningError(
      'OFFLINE_PRE_PIN_DEVICE_REPLACEMENT_ADMIN_REQUIRED',
      403
    )
  }
}

function replacementContext(value: unknown) {
  if (!isRecord(value) || value.contractVersion !== 'offline-pre-pin-device-retirement.v2') {
    throw new PrePinProvisioningError(
      'OFFLINE_PRE_PIN_DEVICE_REPLACEMENT_CONTEXT_INVALID',
      503
    )
  }
  const requiredNumbers = [
    'activeDeviceCount',
    'currentBootstrapCount',
    'currentKeyEnvelopeCount',
    'boundServerCommandCount',
    'nonterminalServerCommandCount',
    'unresolvedReceiptCount',
    'durableServerPayloadCount',
    'expectedDeviceGeneration',
    'expectedKeyEnvelopeVersion',
    'expectedNamespaceGeneration',
    'expectedBootstrapGeneration',
    'expectedRevocationGeneration',
  ] as const
  for (const key of requiredNumbers) {
    if (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0) {
      throw new PrePinProvisioningError(
        'OFFLINE_PRE_PIN_DEVICE_REPLACEMENT_CONTEXT_INVALID',
        503
      )
    }
  }
  if (
    typeof value.replacementRequired !== 'boolean' ||
    typeof value.serverStateZero !== 'boolean' ||
    typeof value.serverOutboxRelationPresent !== 'boolean'
  ) {
    throw new PrePinProvisioningError(
      'OFFLINE_PRE_PIN_DEVICE_REPLACEMENT_CONTEXT_INVALID',
      503
    )
  }
  return value
}

function publicReplacementContext(value: JsonRecord) {
  return Object.freeze({
    contractVersion: value.contractVersion,
    replacementRequired: value.replacementRequired,
    replacementAllowedAfterLocalAttestation:
      value.replacementRequired === true && value.serverStateZero === true,
    activeDeviceCount: value.activeDeviceCount,
    currentBootstrapCount: value.currentBootstrapCount,
    currentKeyEnvelopeCount: value.currentKeyEnvelopeCount,
    boundServerCommandCount: value.boundServerCommandCount,
    nonterminalServerCommandCount: value.nonterminalServerCommandCount,
    unresolvedReceiptCount: value.unresolvedReceiptCount,
    durableServerPayloadCount: value.durableServerPayloadCount,
    serverOutboxRelationPresent: value.serverOutboxRelationPresent,
    serverStateZero: value.serverStateZero,
    identifiersExposed: false,
    keysExposed: false,
  })
}

function publicJwk(
  value: unknown,
  expectedKeys: readonly string[],
  classification: string
) {
  const record = exactRecord(value, expectedKeys, classification)
  for (const entry of Object.values(record)) {
    if (typeof entry !== 'string' || !entry || entry.length > 2_048) {
      throw new PrePinProvisioningError(classification, 400)
    }
  }
  return record
}

type TrustedPrePinContext = Readonly<{
  authenticatedSubjectId: string
  authenticatedSessionId: string
  tenantId: string
  branchId: string
  accountRole: string
}>

async function trustedPrePinContext(): Promise<TrustedPrePinContext> {
  const supabase = await createSupabaseServerClient()
  const verified = await requireVerifiedAuthContext(supabase)
  if (!verified) {
    throw new PrePinProvisioningError(
      'OFFLINE_PRE_PIN_AUTH_SESSION_REQUIRED',
      401
    )
  }
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, role, is_active, tenant_id, branch_id')
    .eq('id', verified.subjectId)
    .maybeSingle()
  if (
    error ||
    !profile ||
    profile.is_active !== true ||
    typeof profile.role !== 'string' ||
    (!canAccessPos(profile.role) && profile.role !== 'owner') ||
    typeof profile.tenant_id !== 'string'
  ) {
    throw new PrePinProvisioningError(
      'OFFLINE_PRE_PIN_ESTABLISHMENT_AUTHORITY_DENIED',
      403
    )
  }

  let branchId =
    typeof profile.branch_id === 'string' ? profile.branch_id : null
  if (!branchId) {
    const { data: branches, error: branchError } = await supabaseAdmin
      .from('branches')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(2)
    if (branchError || !Array.isArray(branches) || branches.length !== 1) {
      throw new PrePinProvisioningError(
        'OFFLINE_PRE_PIN_EXACT_BRANCH_REQUIRED',
        409
      )
    }
    branchId = branches[0].id
  }

  return Object.freeze({
    authenticatedSubjectId: verified.subjectId,
    authenticatedSessionId: verified.sessionId,
    tenantId: profile.tenant_id,
    branchId: uuid(branchId, 'OFFLINE_PRE_PIN_BRANCH_INVALID'),
    accountRole: profile.role,
  })
}

async function invoke(operation: Operation, name: string, args: JsonRecord) {
  const { data, error } = await supabaseAdmin.rpc(name, args)
  if (error) {
    throw new PrePinProvisioningError(
      error.code === 'PGRST202'
        ? 'OFFLINE_PRE_PIN_SQL_CONTRACT_NOT_INSTALLED'
        : 'OFFLINE_PRE_PIN_DATABASE_CONTRACT_FAILED',
      503,
      Object.freeze({
        stage: operation,
        rpcName: name,
        database: prePinDatabaseEvidence(error),
      })
    )
  }
  return data
}

async function trustedInventory(tenantId: string, branchId: string) {
  const { data, error } = await supabaseAdmin
    .from('inventory_stock')
    .select('catalog_item_id, quantity_on_hand, updated_at')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .order('catalog_item_id', { ascending: true })
  if (error || !Array.isArray(data)) {
    throw new PrePinProvisioningError(
      'OFFLINE_PRE_PIN_INVENTORY_READ_FAILED',
      503
    )
  }
  return data.map((row) => ({
    catalogItemId: uuid(
      row.catalog_item_id,
      'OFFLINE_PRE_PIN_INVENTORY_ITEM_INVALID'
    ),
    confirmedStock: String(row.quantity_on_hand),
    stockUpdatedAt: isoTimestamp(
      row.updated_at,
      'OFFLINE_PRE_PIN_INVENTORY_TIMESTAMP_INVALID'
    ),
  }))
}

async function execute(
  operation: Operation,
  payload: JsonRecord,
  trusted: TrustedPrePinContext
) {
  const common = {
    p_authenticated_subject_id: trusted.authenticatedSubjectId,
    p_authenticated_session_id: trusted.authenticatedSessionId,
    p_tenant_id: trusted.tenantId,
    p_branch_id: trusted.branchId,
  }
  switch (operation) {
    case 'device.provision':
      try {
        return await invoke(
          operation,
          prePinFacade(operation),
          {
          ...common,
          p_operation_id: uuid(
            payload.operationId,
            'OFFLINE_PRE_PIN_OPERATION_INVALID'
          ),
          p_device_id: uuid(payload.deviceId, 'OFFLINE_PRE_PIN_DEVICE_INVALID'),
          p_mode: 'MODE_A_MANAGED_PWA_CONTINUOUS_OFFLINE',
          p_proof_public_key_jwk: publicJwk(
            payload.proofPublicKeyJwk,
            ['crv', 'kty', 'use', 'x', 'y'],
            'OFFLINE_PRE_PIN_PROOF_KEY_INVALID'
          ),
          p_wrap_public_key_jwk: publicJwk(
            payload.wrapPublicKeyJwk,
            ['alg', 'e', 'kty', 'n', 'use'],
            'OFFLINE_PRE_PIN_WRAP_KEY_INVALID'
          ),
          p_key_envelope_id: uuid(
            payload.keyEnvelopeId,
            'OFFLINE_PRE_PIN_KEY_ENVELOPE_INVALID'
          ),
          p_wrapped_key_sha256: sha256(
            payload.wrappedKeySha256,
            'OFFLINE_PRE_PIN_WRAPPED_KEY_HASH_INVALID'
          ),
          p_public_key_sha256: sha256(
            payload.publicKeySha256,
            'OFFLINE_PRE_PIN_PUBLIC_KEY_HASH_INVALID'
          ),
          p_envelope_aad_sha256: sha256(
            payload.envelopeAadSha256,
            'OFFLINE_PRE_PIN_AAD_HASH_INVALID'
          ),
          p_envelope_ciphertext_sha256: sha256(
            payload.envelopeCiphertextSha256,
            'OFFLINE_PRE_PIN_CIPHERTEXT_HASH_INVALID'
          ),
          p_evidence_sha256: sha256(
            payload.evidenceSha256,
            'OFFLINE_PRE_PIN_EVIDENCE_HASH_INVALID'
          ),
          }
        )
      } catch (error) {
        if (
          !multiDeviceOnboardingW1Enabled() &&
          error instanceof PrePinProvisioningError &&
          error.diagnostic?.database.databaseMessage?.includes(
            'AFEX_DEVICE_ACTIVATION_AUTHORITY_INVALID'
          )
        ) {
          throw new PrePinProvisioningError(
            'OFFLINE_PRE_PIN_ACTIVE_DEVICE_REPLACEMENT_REQUIRED',
            409,
            error.diagnostic
          )
        }
        throw error
      }
    case 'device.replacement.inspect': {
      replacementAdministrator(trusted)
      const context = replacementContext(
        await invoke(
          operation,
          'afex_offline_server_pre_pin_device_replacement_context_v2',
          common
        )
      )
      return publicReplacementContext(context)
    }
    case 'device.replacement.retire': {
      replacementAdministrator(trusted)
      if (
        payload.confirmation !== 'RETIRE_ACTIVE_DEVICE_AND_REPROVISION' ||
        requiredBoolean(
          payload.localOutboxZeroAttested,
          'OFFLINE_PRE_PIN_LOCAL_ZERO_ATTESTATION_REQUIRED'
        ) !== true
      ) {
        throw new PrePinProvisioningError(
          'OFFLINE_PRE_PIN_EXPLICIT_DEVICE_REPLACEMENT_CONFIRMATION_REQUIRED',
          409
        )
      }
      const operationId = uuid(
        payload.operationId,
        'OFFLINE_PRE_PIN_OPERATION_INVALID'
      )
      const context = replacementContext(
        await invoke(
          'device.replacement.inspect',
          'afex_offline_server_pre_pin_device_replacement_context_v2',
          common
        )
      )
      if (context.replacementRequired !== true || context.serverStateZero !== true) {
        throw new PrePinProvisioningError(
          'OFFLINE_PRE_PIN_DEVICE_REPLACEMENT_PENDING_STATE_PRESENT',
          409
        )
      }
      const evidenceSha256 = createHash('sha256')
        .update(
          JSON.stringify({
            contractVersion: PRE_PIN_PROVISIONING_CONTRACT_VERSION,
            operationId,
            authenticatedSubjectId: trusted.authenticatedSubjectId,
            authenticatedSessionId: trusted.authenticatedSessionId,
            tenantId: trusted.tenantId,
            branchId: trusted.branchId,
            localOutboxZeroAttested: true,
            confirmation: payload.confirmation,
          })
        )
        .digest('hex')
      return invoke(
        operation,
        'afex_offline_server_pre_pin_retire_device_v2',
        {
          ...common,
          p_operation_id: operationId,
          p_expected_device_generation: context.expectedDeviceGeneration,
          p_expected_key_envelope_version: context.expectedKeyEnvelopeVersion,
          p_expected_namespace_generation: context.expectedNamespaceGeneration,
          p_expected_bootstrap_generation: context.expectedBootstrapGeneration,
          p_expected_revocation_generation: context.expectedRevocationGeneration,
          p_local_outbox_zero_attested: true,
          p_local_attestation_method: 'HUMAN_VERIFIED_OLD_ORIGIN_READ_ONLY',
          p_reason_code: 'explicit_authenticated_device_replacement',
          p_evidence_sha256: evidenceSha256,
        }
      )
    }
    case 'employee.roster':
      return invoke(
        operation,
        prePinFacade(operation),
        {
          ...common,
          p_device_id: uuid(payload.deviceId, 'OFFLINE_PRE_PIN_DEVICE_INVALID'),
        }
      )
    case 'inventory.publish': {
      const items = await trustedInventory(trusted.tenantId, trusted.branchId)
      return invoke(
        operation,
        prePinFacade(operation),
        {
          ...common,
          p_device_id: uuid(payload.deviceId, 'OFFLINE_PRE_PIN_DEVICE_INVALID'),
          p_snapshot_id: uuid(
            payload.snapshotId,
            'OFFLINE_PRE_PIN_SNAPSHOT_INVALID'
          ),
          p_frontier_version: safeVersion(
            payload.frontierVersion,
            'OFFLINE_PRE_PIN_FRONTIER_INVALID'
          ),
          p_confirmed_at: isoTimestamp(
            payload.confirmedAt,
            'OFFLINE_PRE_PIN_CONFIRMED_AT_INVALID'
          ),
          p_items: items,
        }
      )
    }
    case 'bootstrap.publish':
      return invoke(operation, prePinFacade(operation), {
        ...common,
        p_operation_id: uuid(
          payload.operationId,
          'OFFLINE_PRE_PIN_OPERATION_INVALID'
        ),
        p_device_id: uuid(payload.deviceId, 'OFFLINE_PRE_PIN_DEVICE_INVALID'),
        p_key_envelope_id: uuid(
          payload.keyEnvelopeId,
          'OFFLINE_PRE_PIN_KEY_ENVELOPE_INVALID'
        ),
        p_key_envelope_version: positiveGeneration(
          payload.keyEnvelopeVersion,
          'OFFLINE_PRE_PIN_KEY_VERSION_INVALID'
        ),
        p_namespace_generation: positiveGeneration(
          payload.namespaceGeneration,
          'OFFLINE_PRE_PIN_NAMESPACE_GENERATION_INVALID'
        ),
        p_inventory_snapshot_id: uuid(
          payload.inventorySnapshotId,
          'OFFLINE_PRE_PIN_SNAPSHOT_INVALID'
        ),
        p_package_sha256: sha256(
          payload.packageSha256,
          'OFFLINE_PRE_PIN_PACKAGE_HASH_INVALID'
        ),
        p_evidence_sha256: sha256(
          payload.evidenceSha256,
          'OFFLINE_PRE_PIN_EVIDENCE_HASH_INVALID'
        ),
      })
  }
}

export async function getPrePinProvisioningContext() {
  if (process.env.AFEX_OFFLINE_ORDER_CREATE_PILOT_ENABLED !== 'true') {
    return NextResponse.json(
      { success: false, error: 'OFFLINE_PILOT_DISABLED' },
      { status: 404 }
    )
  }
  try {
    const trusted = await trustedPrePinContext()
    const contractVersion = activePrePinContractVersion()
    const response = NextResponse.json({
      success: true,
      contractVersion,
      globalPilotEnabled: true,
      multiDeviceOnboardingEnabled: multiDeviceOnboardingW1Enabled(),
      context: {
        primarySubjectId: trusted.authenticatedSubjectId,
        tenantId: trusted.tenantId,
        branchId: trusted.branchId,
        accountRole: trusted.accountRole,
        contextVersion: 2,
        authority: 'verified-primary-auth-pre-pin',
      },
    })
    response.cookies.set(PRE_PIN_ATTEMPT_CONTRACT_COOKIE, contractVersion, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/pos/offline-preparation',
      maxAge: PRE_PIN_ATTEMPT_CONTRACT_MAX_AGE_SECONDS,
    })
    return response
  } catch (error) {
    const failure =
      error instanceof PrePinProvisioningError
        ? error
        : new PrePinProvisioningError(
            'OFFLINE_PRE_PIN_CONTEXT_FAILED',
            500
          )
    return NextResponse.json(
      { success: false, error: failure.classification },
      { status: failure.status }
    )
  }
}

export async function handlePrePinProvisioningRequest(request: NextRequest) {
  if (process.env.AFEX_OFFLINE_ORDER_CREATE_PILOT_ENABLED !== 'true') {
    return NextResponse.json(
      { success: false, error: 'OFFLINE_PILOT_DISABLED' },
      { status: 404 }
    )
  }
  const correlationId = randomUUID()
  const vercelRequestId = request.headers.get('x-vercel-id')
  let operation: Operation | null = null
  try {
    const attemptContractVersion = request.cookies.get(
      PRE_PIN_ATTEMPT_CONTRACT_COOKIE
    )?.value
    if (attemptContractVersion !== activePrePinContractVersion()) {
      throw new PrePinProvisioningError(
        'OFFLINE_PRE_PIN_ATTEMPT_CONTRACT_MISMATCH',
        409
      )
    }
    const body = exactRecord(
      await request.json(),
      ['operation', 'payload'],
      'OFFLINE_PRE_PIN_REQUEST_INVALID'
    )
    if (
      typeof body.operation !== 'string' ||
      !OPERATION_SET.has(body.operation)
    ) {
      throw new PrePinProvisioningError(
        'OFFLINE_PRE_PIN_OPERATION_NOT_ALLOWED',
        400
      )
    }
    operation = body.operation as Operation
    const payload = exactRecord(
      body.payload,
      PAYLOAD_KEYS[operation],
      'OFFLINE_PRE_PIN_PAYLOAD_INVALID'
    )
    const trusted = await trustedPrePinContext()
    const data = await execute(operation, payload, trusted)
    return NextResponse.json({
      success: true,
      correlationId,
      contractVersion: activePrePinContractVersion(),
      operation,
      data,
      providerActions: 0,
      externalEffects: 0,
    })
  } catch (error) {
    const failure =
      error instanceof PrePinProvisioningError
        ? error
        : new PrePinProvisioningError(
            'OFFLINE_PRE_PIN_REQUEST_FAILED',
            500
          )
    if (process.env.VERCEL_ENV === 'preview') {
      console.error(
        JSON.stringify({
          event: 'AFEX_PRE_PIN_PREVIEW_REQUEST_FAILED',
          timestamp: new Date().toISOString(),
          correlationId,
          vercelRequestId:
            vercelRequestId && /^[A-Za-z0-9:_-]{1,160}$/u.test(vercelRequestId)
              ? vercelRequestId
              : null,
          route: '/api/pos/offline-preparation',
          stage: operation ?? failure.diagnostic?.stage ?? 'request.validation',
          rpcName: failure.diagnostic?.rpcName ?? null,
          httpStatus: failure.status,
          applicationErrorCode: failure.classification,
          databaseCode: failure.diagnostic?.database.databaseCode ?? null,
          databaseMessage: failure.diagnostic?.database.databaseMessage ?? null,
          databaseDetails: failure.diagnostic?.database.databaseDetails ?? null,
          databaseHint: failure.diagnostic?.database.databaseHint ?? null,
          providerActions: 0,
          externalEffects: 0,
        })
      )
    }
    return NextResponse.json(
      {
        success: false,
        error: failure.classification,
        correlationId,
      },
      {
        status: failure.status,
        headers: { 'x-afex-correlation-id': correlationId },
      }
    )
  }
}

export async function handlePrePinClientDiagnosticRequest(
  request: NextRequest
) {
  if (
    process.env.VERCEL_ENV !== 'preview' ||
    !multiDeviceOnboardingW1Enabled()
  ) {
    return NextResponse.json({ success: false }, { status: 404 })
  }

  const verified = await requireVerifiedAuthContext(
    await createSupabaseServerClient()
  )
  if (!verified) {
    return NextResponse.json({ success: false }, { status: 401 })
  }

  try {
    const body = exactRecord(
      await request.json(),
      [
        'contractVersion',
        'stage',
        'progress',
        'operation',
        'schemaVersion',
        'serviceWorkerState',
        'runtimeMaterialState',
        'classification',
      ],
      'OFFLINE_PREPARATION_DIAGNOSTIC_INVALID'
    )
    if (
      body.contractVersion !== PREPARATION_DIAGNOSTIC_CONTRACT ||
      typeof body.stage !== 'string' ||
      !PREPARATION_DIAGNOSTIC_STAGES.has(body.stage) ||
      !Number.isSafeInteger(body.progress) ||
      ![0, 10, 20, 35, 50, 75, 90, 100].includes(Number(body.progress)) ||
      typeof body.operation !== 'string' ||
      !PREPARATION_DIAGNOSTIC_OPERATIONS.has(body.operation) ||
      body.schemaVersion !== 3 ||
      typeof body.serviceWorkerState !== 'string' ||
      !PREPARATION_DIAGNOSTIC_SW_STATES.has(body.serviceWorkerState) ||
      typeof body.runtimeMaterialState !== 'string' ||
      !PREPARATION_DIAGNOSTIC_MATERIAL_STATES.has(
        body.runtimeMaterialState
      ) ||
      typeof body.classification !== 'string' ||
      !PREPARATION_DIAGNOSTIC_CLASSIFICATIONS.has(body.classification)
    ) {
      throw new PrePinProvisioningError(
        'OFFLINE_PREPARATION_DIAGNOSTIC_INVALID',
        400
      )
    }

    console.info(
      JSON.stringify({
        event: 'AFEX_OFFLINE_PREPARATION_CLIENT_DIAGNOSTIC',
        timestamp: new Date().toISOString(),
        stage: body.stage,
        progress: body.progress,
        operation: body.operation,
        schemaVersion: body.schemaVersion,
        serviceWorkerState: body.serviceWorkerState,
        runtimeMaterialState: body.runtimeMaterialState,
        classification: body.classification,
        providerActions: 0,
        externalEffects: 0,
      })
    )
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false }, { status: 400 })
  }
}

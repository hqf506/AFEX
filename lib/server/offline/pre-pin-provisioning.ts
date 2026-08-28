import 'server-only'

import { randomUUID } from 'node:crypto'
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

export const PRE_PIN_PROVISIONING_OPERATIONS = Object.freeze([
  'device.provision',
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
    !canAccessPos(profile.role) ||
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
      return invoke(
        operation,
        'afex_offline_server_pre_pin_provision_device_v2',
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
    case 'employee.roster':
      return invoke(
        operation,
        'afex_offline_server_pre_pin_employee_roster_v2',
        {
          ...common,
          p_device_id: uuid(payload.deviceId, 'OFFLINE_PRE_PIN_DEVICE_INVALID'),
        }
      )
    case 'inventory.publish': {
      const items = await trustedInventory(trusted.tenantId, trusted.branchId)
      return invoke(
        operation,
        'afex_offline_server_pre_pin_publish_inventory_v2',
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
      return invoke(operation, 'afex_offline_server_pre_pin_bootstrap_v2', {
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
    return NextResponse.json({
      success: true,
      contractVersion: PRE_PIN_PROVISIONING_CONTRACT_VERSION,
      globalPilotEnabled: true,
      context: {
        primarySubjectId: trusted.authenticatedSubjectId,
        tenantId: trusted.tenantId,
        branchId: trusted.branchId,
        accountRole: trusted.accountRole,
        contextVersion: 2,
        authority: 'verified-primary-auth-pre-pin',
      },
    })
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
      contractVersion: PRE_PIN_PROVISIONING_CONTRACT_VERSION,
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

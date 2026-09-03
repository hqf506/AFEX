'use client'

import type { InvoiceLineItem } from '@/lib/invoices/items'
import {
  migrateLegacyPosPaymentConfiguration,
  parsePosPaymentConfiguration,
  type PosPaymentConfiguration,
  type PosPaymentMethod,
} from '@/lib/invoices/payment-method'
import {
  readActivePosEmployee,
  type ActivePosEmployee,
} from '@/lib/pos-employee-session'
import type { AppRole } from '@/lib/app-roles'
import type { CurrentUserProfile } from '@/lib/auth'
import { resolveAuthScopeType } from '@/lib/auth-profile'
import {
  OFFLINE_DATABASE_VERSION,
  OFFLINE_KEY_ENVELOPE_VERSION,
  OFFLINE_SCHEMA_GENERATION,
  OFFLINE_SCHEMA_VERSION,
  OFFLINE_STORES,
  EncryptedOfflineRepository,
  createSecureUuidV4,
  activateServerVerifiedOfflineNamespace,
  hasOfflineBootstrapReadyMarker,
  markOfflineBootstrapReady,
  deriveOfflineNamespace,
  offlineKeyManager,
  putOfflineRuntimeAccessState,
  putOfflineRuntimeMaterial,
  readOfflineRuntimeAccessState,
  readOfflineRuntimeMaterial,
  type OfflineNamespaceDescriptor,
} from '@/lib/offline/phase1'
import {
  AFEX_OFFLINE_POS_SHELL_ROUTES,
  Phase2DatasetRepository,
  calculateSnapshotClosureHash,
  calculateSnapshotPageHash,
  installAfexOfflineApplicationShell,
  type Phase2DatasetId,
} from '@/lib/offline/phase2'
import {
  Phase3CommandRepository,
  createPhase3CommandIdentity,
  PHASE3_LIMITS,
  type Phase3AuthorityReferences,
  type Phase3PaymentMethod,
} from '@/lib/offline/phase3'
import { assertSelectedEmployeeMatchesPreparedBranch } from '@/lib/offline/employee-pin-selection'
import type { SelectedCustomerProfile } from '@/lib/customers'

export const OFFLINE_COMPLETE_RUNTIME_VERSION =
  'afex-pos-offline-complete-runtime.v1' as const
export const OFFLINE_PREPARATION_STAGES = Object.freeze([
  0, 10, 20, 35, 50, 75, 90, 100,
] as const)
export const OFFLINE_PIN_PBKDF2_ITERATIONS = 600_000
const RUNTIME_MATERIAL_PREFIX = 'afex-offline-runtime-material-v1:'
const BOOTSTRAP_RECORD_KEY = 'approved-bootstrap-v2'
const ROSTER_RECORD_KEY = 'approved-employee-roster-v2'
const INVENTORY_RECORD_KEY = 'trusted-inventory-frontier-v2'
const ACTOR_RECORD_KEY = 'active-pos-actor-binding-v2'
const PIN_ATTEMPT_RECORD_KEY = 'offline-pin-attempt-state-v1'
const READ_COMPLETENESS_RECORD_KEY = 'pos-read-completeness-v1'
const SYSTEM_SETTINGS_RECORD_KEY = 'pos-system-settings-v1'
const PAYMENT_CONFIGURATION_RECORD_KEY = 'pos-payment-configuration-v1'
const CATEGORIES_RECORD_KEY = 'pos-categories-v1'
const VARIANTS_RECORD_KEY = 'pos-variants-v1'
const INVENTORY_SNAPSHOT_RECORD_KEY = 'pos-inventory-snapshot-v1'
const PREPARATION_CHECKPOINT_RECORD_KEY =
  'offline-preparation-checkpoint-v1'
const OFFLINE_READ_CONTRACT_VERSION = 'afex-pos-offline-read-runtime.v1'
const PREPARATION_DIAGNOSTIC_CONTRACT =
  'afex-offline-preparation-client-diagnostic.v1'
const OFFLINE_PIN_MAX_ATTEMPTS = 3
const OFFLINE_PIN_LOCKOUT_MS = 30_000
const CORE_COMMAND_PREFIX = 'core-order-command:'
const SERVER_RECEIPT_PREFIX = 'server-receipt:'
const MAX_DATASET_PAGE_SIZE = 200
const MAX_SYNC_BATCH = 10
const MAX_REQUIRED_READ_RECORDS = 10_000
const CATALOG_DOWNLOAD_PAGE_SIZE = 60
const RECENT_ORDERS_DOWNLOAD_PAGE_SIZE = 100

type JsonRecord = Record<string, unknown>

export type OfflinePreparationProgress = Readonly<{
  percentage: (typeof OFFLINE_PREPARATION_STAGES)[number]
  stage: string
}>

export type PrePinContext = Readonly<{
  primarySubjectId: string
  tenantId: string
  branchId: string
  accountRole: AppRole
  contextVersion: 2
  authority: 'verified-primary-auth-pre-pin'
}>

export type DeviceAuthority = Readonly<{
  deviceId: string
  deviceGeneration: number
  keyEnvelopeId: string
  keyEnvelopeVersion: number
  namespaceGeneration: number
  status: 'active'
}>

export type OfflineEmployeeRosterEntry = Readonly<{
  employeeId: string
  username: string | null
  fullName: string | null
  role: string
  branchId: string
  enrolled: true
  enrollmentId: string
  enrollmentGeneration: number
  credentialGeneration: number
  permissionGeneration: number
  revocationGeneration: number
  commandGeneration: number
  pinVerifierAlgorithm: 'PBKDF2-HMAC-SHA256'
  pinVerifierVersion: 1
  pinVerifierIterations: 600000
  pinVerifierSaltLength: 32
  pinVerifierLength: 32
  pinVerifierSaltHex: string
  pinVerifierHex: string
  status: 'active'
}>

export type TrustedInventory = Readonly<{
  snapshotId: string
  frontierVersion: string
  confirmedAt: string
  items: readonly Readonly<{
    catalogItemId: string
    confirmedStock: number
  }>[]
}>

export type ApprovedBootstrap = Readonly<{
  bootstrapId: string
  bootstrapGeneration: number
  primaryAuthenticatedSubjectId: string
  tenantId: string
  branchId: string
  deviceId: string
  deviceGeneration: number
  keyEnvelopeId: string
  keyEnvelopeVersion: number
  namespaceGeneration: number
  inventorySnapshotId: string
  inventoryFrontierVersion: string
  status: 'active'
  preparedAt: string
}>

type RuntimeMaterial = Readonly<{
  version: 1
  context: PrePinContext
  descriptor: OfflineNamespaceDescriptor
  deviceId: string
  proofPrivateKey: CryptoKey
  proofPublicKeyJwk: JsonWebKey
  wrapPrivateKey: CryptoKey
  wrapPublicKeyJwk: JsonWebKey
  wrappedDek: ArrayBuffer
  keyEnvelopeId: string
  keyVersion: number
  packageSha256: string
  evidenceSha256: string
}>

export type PreparedOfflineRuntime = Readonly<{
  context: PrePinContext
  descriptor: OfflineNamespaceDescriptor
  device: DeviceAuthority
  roster: readonly OfflineEmployeeRosterEntry[]
  inventory: TrustedInventory
  bootstrap: ApprovedBootstrap
  preparedAt: string
}>

type PendingOfflinePreparationCheckpoint = Readonly<{
  version: 1
  state: 'employee-enrollment-required'
  context: PrePinContext
  descriptor: OfflineNamespaceDescriptor
  device: DeviceAuthority
  createdAt: string
}>

type EmployeeEnrollmentAuthority = Readonly<{
  source: 'prepared-runtime' | 'preparation-checkpoint'
  context: PrePinContext
  descriptor: OfflineNamespaceDescriptor
  device: DeviceAuthority
  roster: readonly OfflineEmployeeRosterEntry[]
  runtime: PreparedOfflineRuntime | null
}>

export type OfflineReadDatasetName =
  | 'applicationShell'
  | 'employeeRoster'
  | 'customers'
  | 'customerSearch'
  | 'catalog'
  | 'categories'
  | 'variants'
  | 'prices'
  | 'discounts'
  | 'vat'
  | 'branchInventory'
  | 'posSettings'
  | 'receiptSettings'
  | 'paymentConfiguration'
  | 'recentOrders'

export type OfflineReadCompletenessManifest = Readonly<{
  contractVersion: typeof OFFLINE_READ_CONTRACT_VERSION
  snapshotVersion: string
  confirmedAt: string
  datasetVersions: Readonly<{
    catalog: string
    customers: string
    orders: string
    runtimeSettings: string
  }>
  counts: Readonly<Record<OfflineReadDatasetName, number>>
  complete: true
}>

export type OfflineCustomerSnapshot = SelectedCustomerProfile &
  Readonly<{
    lastPurchaseAmount: number | null
    firstVisitAt: string | null
    lastActivityAt: string | null
    visitsCount: number | null
    totalSpent: number | null
  }>

export type OfflineCheckoutInput = Readonly<{
  clientIdempotencyKey: string
  customerId: string | null
  customerRecordVersion: number | null
  customerName: string
  paymentMethod: PosPaymentMethod
  note: string
  items: readonly InvoiceLineItem[]
  totals: Readonly<{
    subtotal: number
    discountAmount: number
    taxAmount: number
    finalTotal: number
    numericCashReceived: number
    remainingFromCustomer: number
    cashChange: number
    vatRate: number
  }>
  employee: ActivePosEmployee | null
  branchId: string
}>

let currentRuntime: PreparedOfflineRuntime | null = null
let currentReadCompleteness: Readonly<{
  namespaceId: string
  manifest: OfflineReadCompletenessManifest
}> | null = null
let preparationInFlight: Promise<PreparedOfflineRuntime> | null = null
let syncInFlight: Promise<unknown> | null = null
let clientDiagnosticsEnabled = false
let runtimeMaterialState: 'unknown' | 'restored' | 'created' = 'unknown'
let preparationDiagnosticStage: OfflinePreparationDiagnosticStage =
  'context.verify'
let preparationDiagnosticProgress: OfflinePreparationProgress['percentage'] = 0

if (typeof window !== 'undefined') {
  window.addEventListener('afex:offline-runtime-locked', () => {
    currentRuntime = null
    currentReadCompleteness = null
  })
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    )
  }
  return value
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(value: string) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) {
    throw new Error('OFFLINE_HEX_INVALID')
  }
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (pair) =>
    Number.parseInt(pair, 16)
  )
}

async function sha256Hex(value: string | ArrayBuffer | Uint8Array) {
  const input =
    typeof value === 'string'
      ? new TextEncoder().encode(value)
      : value instanceof Uint8Array
        ? value
        : new Uint8Array(value)
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(input).buffer)
  return bytesToHex(new Uint8Array(digest))
}

type OfflineEnrollmentDiagnosticStage =
  | 'authority.restore'
  | 'namespace.derive'
  | 'pin-verifier.derive'
  | 'employee.enroll.request'
  | 'employee.roster.request'
  | 'local-roster.persist'
  | 'online-bootstrap.request'
  | 'local-actor.persist'

function safeEnrollmentApplicationCode(error: unknown) {
  const value = error instanceof Error ? error.message : ''
  return /^[A-Z][A-Z0-9_]{2,96}$/u.test(value) ? value : null
}

function reportEnrollmentFailure(input: Readonly<{
  stageCode: OfflineEnrollmentDiagnosticStage
  operationName: string
  httpStatus: number | null
  applicationCode: string | null
}>) {
  if (process.env.NODE_ENV !== 'development' && !clientDiagnosticsEnabled) return
  console.warn('[AFEX offline enrollment]', input)
}

function money(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error('OFFLINE_MONEY_INVALID')
  return value.toFixed(2)
}

function requireUuid(value: unknown, classification = 'OFFLINE_UUID_INVALID') {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  ) {
    throw new Error(classification)
  }
  return value
}

type OfflinePreparationDiagnosticStage =
  | 'context.verify'
  | 'device.material'
  | 'device.provision'
  | 'employee.roster'
  | 'employee.enrollment'
  | 'read-snapshot'
  | 'inventory.publish'
  | 'bootstrap.publish'
  | 'local.install'
  | 'service-worker.install'
  | 'complete'

type OfflinePreparationDiagnosticOperation =
  | 'start'
  | 'success'
  | 'failure'
  | 'resume-required'
  | 'resume'

const SAFE_PREPARATION_CLASSIFICATIONS = new Set([
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
])

function safePreparationClassification(error: unknown) {
  const value = error instanceof Error ? error.message : ''
  return SAFE_PREPARATION_CLASSIFICATIONS.has(value)
    ? value
    : 'OFFLINE_PREPARATION_CLIENT_FAILURE'
}

async function serviceWorkerDiagnosticState() {
  if (
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return 'unsupported' as const
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration('/')
    const worker =
      registration?.waiting ??
      registration?.installing ??
      registration?.active ??
      navigator.serviceWorker.controller
    if (!worker) return 'uncontrolled' as const
    return worker.state
  } catch {
    return navigator.serviceWorker.controller
      ? ('activated' as const)
      : ('uncontrolled' as const)
  }
}

async function reportOfflinePreparationDiagnostic(input: Readonly<{
  stage: OfflinePreparationDiagnosticStage
  progress: OfflinePreparationProgress['percentage']
  operation: OfflinePreparationDiagnosticOperation
  classification?: string
}>) {
  if (!clientDiagnosticsEnabled || typeof window === 'undefined') return
  const diagnostic = Object.freeze({
    contractVersion: PREPARATION_DIAGNOSTIC_CONTRACT,
    stage: input.stage,
    progress: input.progress,
    operation: input.operation,
    schemaVersion: OFFLINE_DATABASE_VERSION,
    serviceWorkerState: await serviceWorkerDiagnosticState(),
    runtimeMaterialState,
    classification: input.classification ?? 'none',
  })
  console.info('[AFEX offline preparation]', diagnostic)
  await fetch('/api/pos/offline-preparation', {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(diagnostic),
  }).catch(() => undefined)
}

async function preparationDiagnostic(
  stage: OfflinePreparationDiagnosticStage,
  progress: OfflinePreparationProgress['percentage'],
  operation: OfflinePreparationDiagnosticOperation,
  classification = 'none'
) {
  preparationDiagnosticStage = stage
  preparationDiagnosticProgress = progress
  await reportOfflinePreparationDiagnostic({
    stage,
    progress,
    operation,
    classification,
  })
}

async function postPreparation(operation: string, payload: JsonRecord) {
  const response = await fetch('/api/pos/offline-preparation', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, payload }),
  })
  const result = (await response.json().catch(() => null)) as JsonRecord | null
  if (!response.ok || !result?.success) {
    throw new Error(
      typeof result?.error === 'string'
        ? result.error
        : 'OFFLINE_PREPARATION_REQUEST_FAILED'
    )
  }
  return result.data
}

async function fetchPrePinContext() {
  clientDiagnosticsEnabled = false
  const response = await fetch('/api/pos/offline-preparation', {
    credentials: 'include',
    cache: 'no-store',
  })
  const result = (await response.json().catch(() => null)) as JsonRecord | null
  const context = result?.context
  if (
    !response.ok ||
    result?.success !== true ||
    result.globalPilotEnabled !== true ||
    !isRecord(context) ||
    context.contextVersion !== 2 ||
    context.authority !== 'verified-primary-auth-pre-pin'
  ) {
    throw new Error(
      typeof result?.error === 'string'
        ? result.error
        : 'OFFLINE_PREPARATION_CONTEXT_FAILED'
    )
  }
  clientDiagnosticsEnabled = result.multiDeviceOnboardingEnabled === true
  return Object.freeze({
    primarySubjectId: requireUuid(context.primarySubjectId),
    tenantId: requireUuid(context.tenantId),
    branchId: requireUuid(context.branchId),
    accountRole:
      context.accountRole === 'admin' ||
      context.accountRole === 'manager' ||
      context.accountRole === 'employee' ||
      context.accountRole === 'cashier'
        ? context.accountRole
        : (() => {
            throw new Error('OFFLINE_PREPARATION_ROLE_INVALID')
          })(),
    contextVersion: 2 as const,
    authority: 'verified-primary-auth-pre-pin' as const,
  })
}

async function createRuntimeMaterial(
  context: PrePinContext
): Promise<RuntimeMaterial> {
  const deviceId = createSecureUuidV4()
  const descriptor = await deriveOfflineNamespace({
    primarySubjectId: context.primarySubjectId,
    tenantId: context.tenantId,
    branchId: context.branchId,
    deviceCacheId: deviceId,
    schemaGeneration: OFFLINE_SCHEMA_GENERATION,
    authoritySource: 'server-verified-auth-context',
    contextVersion: 1,
  })
  const proofPair = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify']
  )) as CryptoKeyPair
  const wrapPair = (await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 3072,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    false,
    ['wrapKey', 'unwrapKey']
  )) as CryptoKeyPair
  const wrappableDek = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
  const wrappedDek = await crypto.subtle.wrapKey(
    'raw',
    wrappableDek,
    wrapPair.publicKey,
    { name: 'RSA-OAEP' }
  )
  const proofExport = await crypto.subtle.exportKey('jwk', proofPair.publicKey)
  const wrapExport = await crypto.subtle.exportKey('jwk', wrapPair.publicKey)
  const proofPublicKeyJwk = Object.freeze({
    kty: String(proofExport.kty),
    crv: String(proofExport.crv),
    x: String(proofExport.x),
    y: String(proofExport.y),
    use: 'sig',
  })
  const wrapPublicKeyJwk = Object.freeze({
    kty: String(wrapExport.kty),
    n: String(wrapExport.n),
    e: String(wrapExport.e),
    alg: 'RSA-OAEP-256',
    use: 'enc',
  })
  const packageSha256 = await sha256Hex(
    JSON.stringify(canonical({ version: OFFLINE_COMPLETE_RUNTIME_VERSION }))
  )
  const evidenceSha256 = await sha256Hex(
    JSON.stringify(
      canonical({
        context,
        descriptor,
        deviceId,
        proofPublicKeyJwk,
        wrapPublicKeyJwk,
      })
    )
  )
  return Object.freeze({
    version: 1 as const,
    context,
    descriptor,
    deviceId,
    proofPrivateKey: proofPair.privateKey,
    proofPublicKeyJwk,
    wrapPrivateKey: wrapPair.privateKey,
    wrapPublicKeyJwk,
    wrappedDek,
    keyEnvelopeId: createSecureUuidV4(),
    keyVersion: 1,
    packageSha256,
    evidenceSha256,
  })
}

async function runtimeMaterialId(context: PrePinContext) {
  return `${RUNTIME_MATERIAL_PREFIX}${await sha256Hex(
    JSON.stringify(
      canonical({
        primarySubjectId: context.primarySubjectId,
        tenantId: context.tenantId,
        branchId: context.branchId,
      })
    )
  )}`
}

async function loadOrCreateRuntimeMaterial(
  context: PrePinContext,
  options: Readonly<{ allowCreate: boolean }> = { allowCreate: true }
) {
  const materialId = await runtimeMaterialId(context)
  const existing = await readOfflineRuntimeMaterial<RuntimeMaterial>(
    materialId
  )
  let material = existing?.material ?? null
  runtimeMaterialState = 'restored'
  if (
    !material ||
    material.version !== 1 ||
    material.context.primarySubjectId !== context.primarySubjectId ||
    material.context.tenantId !== context.tenantId ||
    material.context.branchId !== context.branchId
  ) {
    if (!options.allowCreate) {
      throw new Error('OFFLINE_RUNTIME_MATERIAL_UNAVAILABLE')
    }
    runtimeMaterialState = 'created'
    material = await createRuntimeMaterial(context)
    await putOfflineRuntimeMaterial({
      id: materialId,
      kind: 'managed-device-nonextractable-key-material',
      namespaceId: material.descriptor.namespaceId,
      material,
      schemaVersion: OFFLINE_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    })
  }
  if (material.context.accountRole !== context.accountRole) {
    material = Object.freeze({ ...material, context })
    await putOfflineRuntimeMaterial({
      id: materialId,
      kind: 'managed-device-nonextractable-key-material',
      namespaceId: material.descriptor.namespaceId,
      material,
      schemaVersion: OFFLINE_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    })
  }
  const key = await crypto.subtle.unwrapKey(
    'raw',
    material.wrappedDek,
    material.wrapPrivateKey,
    { name: 'RSA-OAEP' },
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
  activateServerVerifiedOfflineNamespace(material.descriptor)
  offlineKeyManager.unlock({
    source: 'reviewed-runtime',
    primaryAuthenticated: true,
    posActorAuthorized: false,
    prePinProvisioningAuthorized: true,
    namespaceId: material.descriptor.namespaceId,
    keyVersion: material.keyVersion,
    key,
  })
  await putOfflineRuntimeAccessState({
    version: 1,
    runtimeMaterialId: materialId,
    namespaceId: material.descriptor.namespaceId,
    loggedOut: false,
    updatedAt: new Date().toISOString(),
  })
  return material
}

function deviceAuthority(value: unknown): DeviceAuthority {
  const row = Array.isArray(value) ? value[0] : value
  if (!isRecord(row) || row.status !== 'active') {
    throw new Error('OFFLINE_DEVICE_AUTHORITY_INVALID')
  }
  return Object.freeze({
    deviceId: requireUuid(row.deviceId),
    deviceGeneration: Number(row.deviceGeneration),
    keyEnvelopeId: requireUuid(row.keyEnvelopeId),
    keyEnvelopeVersion: Number(row.keyEnvelopeVersion),
    namespaceGeneration: Number(row.namespaceGeneration),
    status: 'active' as const,
  })
}

function employeeRoster(
  value: unknown,
  options: Readonly<{ requireEnrolledEmployee: boolean }> = {
    requireEnrolledEmployee: true,
  }
) {
  if (
    !isRecord(value) ||
    value.contractVersion !== 'offline-pre-pin-roster.v2' ||
    value.containsPlaintextPin !== false ||
    value.containsOfflinePinVerifier !== true ||
    value.maximumEmployees !== 25 ||
    !Array.isArray(value.employees) ||
    (options.requireEnrolledEmployee && value.employees.length < 1) ||
    value.employees.length > 25 ||
    value.employeeCount !== value.employees.length ||
    value.enrolledEmployeeCount !== value.employees.length
  ) {
    throw new Error('OFFLINE_ROSTER_INVALID')
  }
  const rows = value.employees
  return Object.freeze(
    rows.map((candidate) => {
      if (!isRecord(candidate)) throw new Error('OFFLINE_ROSTER_INVALID')
      const salt = String(candidate.pinVerifierSaltHex ?? '')
      const verifier = String(candidate.pinVerifierHex ?? '')
      if (
        candidate.enrolled !== true ||
        candidate.pinVerifierAlgorithm !== 'PBKDF2-HMAC-SHA256' ||
        candidate.pinVerifierVersion !== 1 ||
        candidate.pinVerifierIterations !== 600000 ||
        candidate.pinVerifierSaltLength !== 32 ||
        candidate.pinVerifierLength !== 32 ||
        !/^[0-9a-f]{64}$/.test(salt) ||
        !/^[0-9a-f]{64}$/.test(verifier) ||
        !Number.isSafeInteger(candidate.enrollmentGeneration) ||
        Number(candidate.enrollmentGeneration) < 1 ||
        !Number.isSafeInteger(candidate.credentialGeneration) ||
        Number(candidate.credentialGeneration) < 1 ||
        !Number.isSafeInteger(candidate.permissionGeneration) ||
        Number(candidate.permissionGeneration) < 1 ||
        !Number.isSafeInteger(candidate.revocationGeneration) ||
        Number(candidate.revocationGeneration) < 0 ||
        !Number.isSafeInteger(candidate.commandGeneration) ||
        Number(candidate.commandGeneration) < 1
      ) {
        throw new Error('OFFLINE_ROSTER_VERIFIER_INVALID')
      }
      return Object.freeze({
        employeeId: requireUuid(candidate.employeeId),
        username:
          typeof candidate.username === 'string' ? candidate.username : null,
        fullName:
          typeof candidate.fullName === 'string' ? candidate.fullName : null,
        role: String(candidate.role),
        branchId: requireUuid(candidate.branchId),
        enrolled: true as const,
        enrollmentId: requireUuid(candidate.enrollmentId),
        enrollmentGeneration: Number(candidate.enrollmentGeneration),
        credentialGeneration: Number(candidate.credentialGeneration),
        permissionGeneration: Number(candidate.permissionGeneration),
        revocationGeneration: Number(candidate.revocationGeneration),
        commandGeneration: Number(candidate.commandGeneration),
        pinVerifierAlgorithm: 'PBKDF2-HMAC-SHA256' as const,
        pinVerifierVersion: 1 as const,
        pinVerifierIterations: 600000 as const,
        pinVerifierSaltLength: 32 as const,
        pinVerifierLength: 32 as const,
        pinVerifierSaltHex: salt,
        pinVerifierHex: verifier,
        status: 'active' as const,
      })
    })
  )
}

async function persistPendingPreparationCheckpoint(
  material: RuntimeMaterial,
  device: DeviceAuthority
) {
  const encrypted = new EncryptedOfflineRepository({
    allowPersistentWrites: true,
  })
  await encrypted.initialize()
  const checkpoint: PendingOfflinePreparationCheckpoint = Object.freeze({
    version: 1,
    state: 'employee-enrollment-required',
    context: material.context,
    descriptor: material.descriptor,
    device,
    createdAt: new Date().toISOString(),
  })
  await encrypted.putEncryptedDraft(
    material.descriptor.namespaceId,
    PREPARATION_CHECKPOINT_RECORD_KEY,
    checkpoint,
    'offline-preparation-resume-checkpoint'
  )
  return checkpoint
}

async function restorePendingPreparationCheckpoint() {
  const access = await readOfflineRuntimeAccessState()
  if (!access || access.loggedOut) {
    throw new Error('OFFLINE_PREPARATION_CHECKPOINT_UNAVAILABLE')
  }
  const existing = await readOfflineRuntimeMaterial<RuntimeMaterial>(
    access.runtimeMaterialId
  )
  if (!existing?.material || existing.namespaceId !== access.namespaceId) {
    throw new Error('OFFLINE_PREPARATION_CHECKPOINT_UNAVAILABLE')
  }
  const material = await loadOrCreateRuntimeMaterial(existing.material.context, {
    allowCreate: false,
  })
  const encrypted = new EncryptedOfflineRepository({
    allowPersistentWrites: true,
  })
  const checkpoint =
    await encrypted.readEncryptedRecord<PendingOfflinePreparationCheckpoint>(
      OFFLINE_STORES.drafts,
      material.descriptor.namespaceId,
      PREPARATION_CHECKPOINT_RECORD_KEY
    )
  if (
    !checkpoint ||
    checkpoint.version !== 1 ||
    checkpoint.state !== 'employee-enrollment-required' ||
    checkpoint.context.primarySubjectId !== material.context.primarySubjectId ||
    checkpoint.context.tenantId !== material.context.tenantId ||
    checkpoint.context.branchId !== material.context.branchId ||
    checkpoint.descriptor.namespaceId !== material.descriptor.namespaceId ||
    checkpoint.device.deviceId !== material.deviceId ||
    checkpoint.device.status !== 'active'
  ) {
    throw new Error('OFFLINE_PREPARATION_CHECKPOINT_INVALID')
  }
  return checkpoint
}

async function employeeEnrollmentAuthority(): Promise<EmployeeEnrollmentAuthority> {
  try {
    const runtime = await restorePreparedOfflineRuntime()
    return Object.freeze({
      source: 'prepared-runtime' as const,
      context: runtime.context,
      descriptor: runtime.descriptor,
      device: runtime.device,
      roster: runtime.roster,
      runtime,
    })
  } catch (error) {
    let checkpoint: PendingOfflinePreparationCheckpoint
    try {
      checkpoint = await restorePendingPreparationCheckpoint()
    } catch {
      throw error
    }
    const currentContext = await fetchPrePinContext()
    if (
      currentContext.primarySubjectId !== checkpoint.context.primarySubjectId ||
      currentContext.tenantId !== checkpoint.context.tenantId ||
      currentContext.branchId !== checkpoint.context.branchId
    ) {
      throw new Error('OFFLINE_PREPARATION_CHECKPOINT_SCOPE_MISMATCH')
    }
    return Object.freeze({
      source: 'preparation-checkpoint' as const,
      context: currentContext,
      descriptor: checkpoint.descriptor,
      device: checkpoint.device,
      roster: Object.freeze([]),
      runtime: null,
    })
  }
}

function trustedInventory(value: unknown): TrustedInventory {
  const row = Array.isArray(value) ? value[0] : value
  if (!isRecord(row) || !Array.isArray(row.items)) {
    throw new Error('OFFLINE_INVENTORY_INVALID')
  }
  return Object.freeze({
    snapshotId: requireUuid(row.snapshotId),
    frontierVersion: String(row.frontierVersion),
    confirmedAt: String(row.confirmedAt),
    items: Object.freeze(
      row.items.map((candidate) => {
        if (!isRecord(candidate)) throw new Error('OFFLINE_INVENTORY_INVALID')
        const confirmedStock = Math.max(0, Math.floor(Number(candidate.confirmedStock)))
        if (!Number.isSafeInteger(confirmedStock)) {
          throw new Error('OFFLINE_INVENTORY_INVALID')
        }
        return Object.freeze({
          catalogItemId: requireUuid(candidate.catalogItemId),
          confirmedStock,
        })
      })
    ),
  })
}

function approvedBootstrap(value: unknown): ApprovedBootstrap {
  const row = Array.isArray(value) ? value[0] : value
  if (!isRecord(row) || row.status !== 'active') {
    throw new Error('OFFLINE_BOOTSTRAP_INVALID')
  }
  return Object.freeze({
    bootstrapId: requireUuid(row.bootstrapId),
    bootstrapGeneration: Number(row.bootstrapGeneration),
    primaryAuthenticatedSubjectId: requireUuid(
      row.primaryAuthenticatedSubjectId
    ),
    tenantId: requireUuid(row.tenantId),
    branchId: requireUuid(row.branchId),
    deviceId: requireUuid(row.deviceId),
    deviceGeneration: Number(row.deviceGeneration),
    keyEnvelopeId: requireUuid(row.keyEnvelopeId),
    keyEnvelopeVersion: Number(row.keyEnvelopeVersion),
    namespaceGeneration: Number(row.namespaceGeneration),
    inventorySnapshotId: requireUuid(row.inventorySnapshotId),
    inventoryFrontierVersion: String(row.inventoryFrontierVersion),
    status: 'active' as const,
    preparedAt: String(row.preparedAt),
  })
}

async function persistDataset(
  repository: Phase2DatasetRepository,
  namespaceId: string,
  datasetId: Phase2DatasetId,
  snapshotVersion: string,
  confirmedAtServer: string,
  records: readonly Readonly<{ recordKey: string; value: unknown }>[],
  retainSnapshotVersions: readonly string[] = []
) {
  const pages: Array<Array<{ recordKey: string; value: unknown }>> = []
  for (let index = 0; index < records.length; index += MAX_DATASET_PAGE_SIZE) {
    pages.push(records.slice(index, index + MAX_DATASET_PAGE_SIZE))
  }
  if (pages.length === 0) pages.push([])
  const pageClosures = await Promise.all(
    pages.map(async (page, index) => ({
      pageNumber: index + 1,
      recordCount: page.length,
      hash: await calculateSnapshotPageHash(page),
    }))
  )
  const closureHash = await calculateSnapshotClosureHash(pageClosures)
  const writer = await repository.beginSnapshot({
    namespaceId,
    datasetId,
    datasetSchemaVersion: 1,
    snapshotVersion,
    sourceContractVersion: OFFLINE_COMPLETE_RUNTIME_VERSION,
    confirmedAtServer,
    freshnessMs: 30 * 24 * 60 * 60 * 1_000,
    expectedPageCount: pages.length,
    expectedRecordCount: records.length,
    expectedClosureHash: closureHash,
  })
  for (const [index, page] of pages.entries()) {
    await repository.stageSnapshotPage(writer, {
      pageNumber: index + 1,
      records: page,
    })
  }
  return repository.completeSnapshot(writer, { retainSnapshotVersions })
}

async function readInstalledReadCompleteness(namespaceId: string) {
  try {
    const encrypted = new EncryptedOfflineRepository({
      allowPersistentWrites: true,
    })
    const manifest = await encrypted.readEncryptedRecord<unknown>(
      OFFLINE_STORES.drafts,
      namespaceId,
      READ_COMPLETENESS_RECORD_KEY
    )
    return requireOfflineReadCompleteness(manifest)
  } catch {
    return null
  }
}

function offlineCustomerSnapshot(value: unknown): OfflineCustomerSnapshot {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.phone !== 'string'
  ) {
    throw new Error('OFFLINE_REQUIRED_DATASET_INVALID:customers')
  }
  return Object.freeze({
    ...(value as unknown as SelectedCustomerProfile),
    lastPurchaseAmount: null,
    firstVisitAt:
      typeof value.createdAt === 'string' ? value.createdAt : null,
    lastActivityAt: null,
    visitsCount:
      typeof value.visitCount === 'number' ? value.visitCount : null,
    totalSpent:
      typeof value.totalSpending === 'number' ? value.totalSpending : null,
  })
}

async function fetchCompleteCatalogSnapshot(branchId: string) {
  const products: unknown[] = []
  const categories = new Set<string>()
  const productIds = new Set<string>()
  let total = 0
  let page = 1
  do {
    const params = new URLSearchParams({
      branchId,
      page: String(page),
      pageSize: String(CATALOG_DOWNLOAD_PAGE_SIZE),
    })
    const response = await fetch(`/api/invoice/catalog?${params}`, {
      credentials: 'include',
      cache: 'no-store',
    })
    const result = (await response.json().catch(() => null)) as JsonRecord | null
    if (
      !response.ok ||
      result?.success !== true ||
      !Array.isArray(result.products) ||
      !Number.isSafeInteger(result.total) ||
      Number(result.total) < 0 ||
      Number(result.total) > MAX_REQUIRED_READ_RECORDS
    ) {
      throw new Error('OFFLINE_REQUIRED_DATASET_MISSING:catalog')
    }
    total = Number(result.total)
    for (const category of Array.isArray(result.categories)
      ? result.categories
      : []) {
      if (typeof category === 'string' && category.trim()) {
        categories.add(category.trim())
      }
    }
    for (const product of result.products) {
      if (!isRecord(product) || typeof product.id !== 'string') {
        throw new Error('OFFLINE_REQUIRED_DATASET_INVALID:catalog')
      }
      if (productIds.has(product.id)) {
        throw new Error('OFFLINE_REQUIRED_DATASET_INVALID:catalog')
      }
      productIds.add(product.id)
      products.push(product)
    }
    page += 1
  } while ((page - 1) * CATALOG_DOWNLOAD_PAGE_SIZE < total)
  return Object.freeze({
    success: true as const,
    products: Object.freeze(products),
    categories: Object.freeze([...categories]),
    total: products.length,
  })
}

async function fetchCompleteRecentOrdersSnapshot(branchId: string) {
  const items: unknown[] = []
  const orderIds = new Set<string>()
  let page = 1
  let hasMore = false
  do {
    const params = new URLSearchParams({
      mode: 'full',
      page: String(page),
      pageSize: String(RECENT_ORDERS_DOWNLOAD_PAGE_SIZE),
      recentHours: '48',
      branchId,
    })
    const response = await fetch(`/api/orders?${params}`, {
      credentials: 'include',
      cache: 'no-store',
    })
    const result = (await response.json().catch(() => null)) as JsonRecord | null
    if (!response.ok || result?.success !== true || !Array.isArray(result.items)) {
      throw new Error('OFFLINE_REQUIRED_DATASET_MISSING:recentOrders')
    }
    for (const order of result.items) {
      if (!isRecord(order) || typeof order.id !== 'string') {
        throw new Error('OFFLINE_REQUIRED_DATASET_INVALID:recentOrders')
      }
      if (orderIds.has(order.id)) {
        throw new Error('OFFLINE_REQUIRED_DATASET_INVALID:recentOrders')
      }
      orderIds.add(order.id)
      items.push(order)
    }
    if (items.length > MAX_REQUIRED_READ_RECORDS) {
      throw new Error('OFFLINE_REQUIRED_DATASET_CAPACITY_EXCEEDED:recentOrders')
    }
    hasMore = result.hasMore === true
    if (hasMore && result.items.length === 0) {
      throw new Error('OFFLINE_REQUIRED_DATASET_INVALID:recentOrders')
    }
    page += 1
  } while (hasMore)
  return Object.freeze(items)
}

async function fetchRequiredReadDatasets(context: PrePinContext) {
  const query = encodeURIComponent(context.branchId)
  const [catalog, runtimeResponse, readSnapshotResponse, recentOrders] = await Promise.all([
    fetchCompleteCatalogSnapshot(context.branchId),
    fetch(`/api/pos/runtime?branchId=${query}`, {
      credentials: 'include',
      cache: 'no-store',
    }),
    fetch(`/api/pos/offline-read-snapshot?branchId=${query}`, {
      credentials: 'include',
      cache: 'no-store',
    }),
    fetchCompleteRecentOrdersSnapshot(context.branchId),
  ])
  const [runtime, readSnapshot] = (await Promise.all([
    runtimeResponse.json().catch(() => null),
    readSnapshotResponse.json().catch(() => null),
  ])) as [JsonRecord | null, JsonRecord | null]

  if (!runtimeResponse.ok || runtime?.success !== true || !isRecord(runtime.runtime)) {
    throw new Error('OFFLINE_REQUIRED_DATASET_MISSING:runtimeSettings')
  }
  if (
    !readSnapshotResponse.ok ||
    readSnapshot?.success !== true ||
    readSnapshot.contractVersion !== 'afex-pos-offline-read-snapshot.v1' ||
    !Array.isArray(readSnapshot.customers) ||
    !isRecord(readSnapshot.settings) ||
    typeof readSnapshot.confirmedAt !== 'string'
  ) {
    const classification =
      typeof readSnapshot?.code === 'string'
        ? readSnapshot.code
        : 'offlineReadSnapshot'
    throw new Error(`OFFLINE_REQUIRED_DATASET_MISSING:${classification}`)
  }
  const runtimePaymentConfiguration = parsePosPaymentConfiguration(
    runtime.runtime.paymentConfiguration
  )
  const snapshotPaymentConfiguration = parsePosPaymentConfiguration(
    readSnapshot.paymentConfiguration
  )
  if (!runtimePaymentConfiguration || !snapshotPaymentConfiguration) {
    throw new Error('OFFLINE_REQUIRED_DATASET_INVALID:paymentConfiguration')
  }
  return {
    catalog,
    runtime: runtime.runtime,
    paymentConfiguration: runtimePaymentConfiguration,
    customers: readSnapshot.customers.map(offlineCustomerSnapshot),
    systemSettings: readSnapshot.settings,
    confirmedAt: readSnapshot.confirmedAt,
    recentOrders,
  }
}

async function doPrepare(
  onProgress?: (progress: OfflinePreparationProgress) => void
) {
  runtimeMaterialState = 'unknown'
  preparationDiagnosticStage = 'context.verify'
  preparationDiagnosticProgress = 0
  const progress = (
    percentage: OfflinePreparationProgress['percentage'],
    stage: string
  ) => onProgress?.(Object.freeze({ percentage, stage }))
  progress(0, 'بدء التحقق من جلسة المنشأة')
  const context = await fetchPrePinContext()
  progress(10, 'تم التحقق من جلسة الحساب')
  await preparationDiagnostic('context.verify', 10, 'success')
  if (!context.tenantId || !context.branchId) {
    throw new Error('OFFLINE_PREPARATION_SCOPE_MISSING')
  }
  progress(20, 'تم تثبيت نطاق المنشأة والفرع')
  await preparationDiagnostic('device.material', 20, 'start')
  const material = await loadOrCreateRuntimeMaterial(context)
  await preparationDiagnostic('device.material', 20, 'success')
  const wrappedKeySha256 = await sha256Hex(material.wrappedDek)
  const publicKeySha256 = await sha256Hex(
    String(material.wrapPublicKeyJwk.n ?? '')
  )
  const envelopeAadSha256 = await sha256Hex(
    JSON.stringify(
      canonical({
        namespaceId: material.descriptor.namespaceId,
        deviceId: material.deviceId,
        keyEnvelopeId: material.keyEnvelopeId,
        keyVersion: material.keyVersion,
      })
    )
  )
  await preparationDiagnostic('device.provision', 20, 'start')
  const rawDevice = await postPreparation('device.provision', {
    operationId: createSecureUuidV4(),
    deviceId: material.deviceId,
    proofPublicKeyJwk: material.proofPublicKeyJwk as JsonRecord,
    wrapPublicKeyJwk: material.wrapPublicKeyJwk as JsonRecord,
    keyEnvelopeId: material.keyEnvelopeId,
    wrappedKeySha256,
    publicKeySha256,
    envelopeAadSha256,
    envelopeCiphertextSha256: wrappedKeySha256,
    evidenceSha256: material.evidenceSha256,
  })
  const device = deviceAuthority(rawDevice)
  if (device.deviceId !== material.deviceId) {
    throw new Error('OFFLINE_DEVICE_SUBSTITUTION_REJECTED')
  }
  progress(35, 'تم تسجيل الجهاز المُدار والتحقق منه')
  await preparationDiagnostic('device.provision', 35, 'success')
  await preparationDiagnostic('employee.roster', 35, 'start')
  const roster = employeeRoster(
    await postPreparation('employee.roster', { deviceId: device.deviceId }),
    { requireEnrolledEmployee: false }
  )
  if (roster.length < 1) {
    await persistPendingPreparationCheckpoint(material, device)
    await preparationDiagnostic(
      'employee.enrollment',
      35,
      'resume-required',
      'OFFLINE_EMPLOYEE_ENROLLMENT_REQUIRED'
    )
    throw new Error('OFFLINE_EMPLOYEE_ENROLLMENT_REQUIRED')
  }
  progress(50, 'تم تنزيل قائمة الموظفين المعتمدة')
  await preparationDiagnostic('employee.roster', 50, 'success')
  await preparationDiagnostic('read-snapshot', 50, 'start')
  const {
    catalog,
    runtime,
    customers,
    systemSettings,
    paymentConfiguration,
    confirmedAt,
    recentOrders,
  } =
    await fetchRequiredReadDatasets(context)
  progress(75, 'تم تنزيل الكتالوج والأسعار والضريبة وطرق الدفع')
  await preparationDiagnostic('read-snapshot', 75, 'success')
  const now = new Date().toISOString()
  const snapshotId = createSecureUuidV4()
  const frontierVersion = `frontier-${Date.now()}`
  await preparationDiagnostic('inventory.publish', 75, 'start')
  const inventory = trustedInventory(
    await postPreparation('inventory.publish', {
      deviceId: device.deviceId,
      snapshotId,
      frontierVersion,
      confirmedAt: now,
    })
  )
  progress(90, 'تم تثبيت لقطة المخزون الموثوقة')
  await preparationDiagnostic('inventory.publish', 90, 'success')

  await preparationDiagnostic('bootstrap.publish', 90, 'start')
  const bootstrap = approvedBootstrap(
    await postPreparation('bootstrap.publish', {
      operationId: createSecureUuidV4(),
      deviceId: device.deviceId,
      keyEnvelopeId: device.keyEnvelopeId,
      keyEnvelopeVersion: device.keyEnvelopeVersion,
      namespaceGeneration: device.namespaceGeneration,
      inventorySnapshotId: inventory.snapshotId,
      packageSha256: material.packageSha256,
      evidenceSha256: material.evidenceSha256,
    })
  )
  if (
    bootstrap.primaryAuthenticatedSubjectId !== context.primarySubjectId ||
    bootstrap.tenantId !== context.tenantId ||
    bootstrap.branchId !== context.branchId ||
    bootstrap.deviceId !== device.deviceId ||
    bootstrap.inventorySnapshotId !== inventory.snapshotId
  ) {
    throw new Error('OFFLINE_BOOTSTRAP_AUTHORITY_MISMATCH')
  }
  await preparationDiagnostic('bootstrap.publish', 90, 'success')

  await preparationDiagnostic('local.install', 90, 'start')
  const encrypted = new EncryptedOfflineRepository({
    allowPersistentWrites: true,
  })
  currentReadCompleteness = null
  const datasets = new Phase2DatasetRepository()
  const snapshotVersion = inventory.frontierVersion
  await encrypted.initialize()
  const previousCompleteness = await readInstalledReadCompleteness(
    material.descriptor.namespaceId
  )
  const retainedSnapshotVersions = previousCompleteness
    ? [previousCompleteness.snapshotVersion]
    : []
  await encrypted.putKeyEnvelope({
    id: `${material.descriptor.namespaceId}:key:${device.keyEnvelopeVersion}`,
    namespaceId: material.descriptor.namespaceId,
    keyVersion: device.keyEnvelopeVersion,
    envelopeVersion: OFFLINE_KEY_ENVELOPE_VERSION,
    wrappingAlgorithm: 'RSA-OAEP-3072-SHA256',
    wrappedKey: bytesToHex(new Uint8Array(material.wrappedDek)),
    authority: 'reviewed-runtime',
    createdAt: now,
  })
  await persistDataset(
    datasets,
    material.descriptor.namespaceId,
    'catalog',
    snapshotVersion,
    inventory.confirmedAt,
    (catalog.products as unknown[]).map((value, index) => ({
      recordKey:
        isRecord(value) && typeof value.id === 'string'
          ? value.id
          : `catalog-${index + 1}`,
      value,
    })),
    retainedSnapshotVersions
  )
  await persistDataset(
    datasets,
    material.descriptor.namespaceId,
    'customers',
    snapshotVersion,
    confirmedAt,
    customers.map((value) => ({ recordKey: value.id, value })),
    retainedSnapshotVersions
  )
  await persistDataset(
    datasets,
    material.descriptor.namespaceId,
    'orders',
    snapshotVersion,
    confirmedAt,
    recentOrders.map((value, index) => ({
      recordKey:
        isRecord(value) && typeof value.id === 'string'
          ? value.id
          : `recent-order-${index + 1}`,
      value,
    })),
    retainedSnapshotVersions
  )
  const catalogRows = catalog.products as unknown[]
  const categories = new Set([
    ...(Array.isArray(catalog.categories)
      ? catalog.categories.filter(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0
        )
      : []),
    ...catalogRows.flatMap((value) =>
      isRecord(value) && typeof value.category === 'string' && value.category.trim()
        ? [value.category.trim()]
        : []
    ),
  ])
  const variants = catalogRows.flatMap((value) => {
    if (!isRecord(value) || typeof value.id !== 'string') return []
    const color = typeof value.pos_color === 'string' ? value.pos_color : null
    const shape = typeof value.pos_shape === 'string' ? value.pos_shape : null
    if (!color && !shape) return []
    return [{ catalogItemId: value.id, color, shape }]
  })
  await preparationDiagnostic('service-worker.install', 90, 'start')
  const shellInstallation = await installAfexOfflineApplicationShell()
  await preparationDiagnostic('service-worker.install', 90, 'success')
  const completeness: OfflineReadCompletenessManifest = Object.freeze({
    contractVersion: OFFLINE_READ_CONTRACT_VERSION,
    snapshotVersion,
    confirmedAt,
    datasetVersions: Object.freeze({
      catalog: snapshotVersion,
      customers: snapshotVersion,
      orders: snapshotVersion,
      runtimeSettings: snapshotVersion,
    }),
    counts: Object.freeze({
      applicationShell: shellInstallation.routeCount,
      employeeRoster: roster.length,
      customers: customers.length,
      customerSearch: customers.length,
      catalog: catalogRows.length,
      categories: categories.size,
      variants: variants.length,
      prices: catalogRows.length,
      discounts: Array.isArray(runtime.discounts) ? runtime.discounts.length : 0,
      vat: isRecord(runtime.vat) ? 1 : 0,
      branchInventory: inventory.items.length,
      posSettings: 1,
      receiptSettings: 1,
      paymentConfiguration: paymentConfiguration.methods.length,
      recentOrders: recentOrders.length,
    }),
    complete: true,
  })

  await persistDataset(
    datasets,
    material.descriptor.namespaceId,
    'runtimeSettings',
    snapshotVersion,
    confirmedAt,
    [
      { recordKey: 'pos-runtime', value: runtime },
      { recordKey: SYSTEM_SETTINGS_RECORD_KEY, value: systemSettings },
      {
        recordKey: PAYMENT_CONFIGURATION_RECORD_KEY,
        value: paymentConfiguration,
      },
      { recordKey: CATEGORIES_RECORD_KEY, value: [...categories] },
      { recordKey: VARIANTS_RECORD_KEY, value: variants },
      { recordKey: INVENTORY_SNAPSHOT_RECORD_KEY, value: inventory },
    ],
    retainedSnapshotVersions
  )
  const [
    catalogAvailability,
    customerAvailability,
    orderAvailability,
    runtimeAvailability,
  ] =
    await Promise.all([
      datasets.getSafeAvailability(
        material.descriptor.namespaceId,
        'catalog',
        snapshotVersion
      ),
      datasets.getSafeAvailability(
        material.descriptor.namespaceId,
        'customers',
        snapshotVersion
      ),
      datasets.getSafeAvailability(
        material.descriptor.namespaceId,
        'orders',
        snapshotVersion
      ),
      datasets.getSafeAvailability(
        material.descriptor.namespaceId,
        'runtimeSettings',
        snapshotVersion
      ),
    ])
  const [
    installedCatalog,
    installedCustomers,
    installedOrders,
    installedRuntimeSettings,
  ] =
    await Promise.all([
      readCompleteDataset<JsonRecord>(
        material.descriptor.namespaceId,
        'catalog',
        snapshotVersion
      ),
      readCompleteDataset<OfflineCustomerSnapshot>(
        material.descriptor.namespaceId,
        'customers',
        snapshotVersion
      ),
      readCompleteDataset<JsonRecord>(
        material.descriptor.namespaceId,
        'orders',
        snapshotVersion
      ),
      readCompleteDataset<JsonRecord>(
        material.descriptor.namespaceId,
        'runtimeSettings',
        snapshotVersion
      ),
    ])
  const installedRuntimeRecordKeys = new Set(
    installedRuntimeSettings.map((record) => record.recordKey)
  )
  const installedCategories = installedRuntimeSettings.find(
    (record) => record.recordKey === CATEGORIES_RECORD_KEY
  )?.value
  const installedVariants = installedRuntimeSettings.find(
    (record) => record.recordKey === VARIANTS_RECORD_KEY
  )?.value
  if (
    catalogAvailability.status !== 'complete' ||
    customerAvailability.status !== 'complete' ||
    orderAvailability.status !== 'complete' ||
    runtimeAvailability.status !== 'complete' ||
    installedCatalog.length !== completeness.counts.catalog ||
    installedCustomers.length !== completeness.counts.customers ||
    installedOrders.length !== completeness.counts.recentOrders ||
    !Array.isArray(installedCategories) ||
    installedCategories.length !== completeness.counts.categories ||
    !Array.isArray(installedVariants) ||
    installedVariants.length !== completeness.counts.variants ||
    ![
      'pos-runtime',
      SYSTEM_SETTINGS_RECORD_KEY,
      PAYMENT_CONFIGURATION_RECORD_KEY,
      CATEGORIES_RECORD_KEY,
      VARIANTS_RECORD_KEY,
      INVENTORY_SNAPSHOT_RECORD_KEY,
    ].every((recordKey) => installedRuntimeRecordKeys.has(recordKey))
  ) {
    throw new Error('OFFLINE_DURABLE_INTEGRITY_ATTESTATION_FAILED')
  }
  await encrypted.putEncryptedDraftBatch(material.descriptor.namespaceId, [
    {
      recordKey: ROSTER_RECORD_KEY,
      value: roster,
      classification: 'pre-pin-employee-roster',
    },
    {
      recordKey: INVENTORY_RECORD_KEY,
      value: inventory,
      classification: 'trusted-inventory-frontier',
    },
    {
      recordKey: BOOTSTRAP_RECORD_KEY,
      value: bootstrap,
      classification: 'approved-account-bootstrap',
    },
    {
      recordKey: READ_COMPLETENESS_RECORD_KEY,
      value: completeness,
      classification: 'pos-read-completeness-pivot',
    },
  ])
  const [storedBootstrap, storedRoster, storedInventory, storedCompleteness] =
    await Promise.all([
      encrypted.readEncryptedRecord<ApprovedBootstrap>(
        OFFLINE_STORES.drafts,
        material.descriptor.namespaceId,
        BOOTSTRAP_RECORD_KEY
      ),
      encrypted.readEncryptedRecord<readonly OfflineEmployeeRosterEntry[]>(
        OFFLINE_STORES.drafts,
        material.descriptor.namespaceId,
        ROSTER_RECORD_KEY
      ),
      encrypted.readEncryptedRecord<TrustedInventory>(
        OFFLINE_STORES.drafts,
        material.descriptor.namespaceId,
        INVENTORY_RECORD_KEY
      ),
      encrypted.readEncryptedRecord<unknown>(
        OFFLINE_STORES.drafts,
        material.descriptor.namespaceId,
        READ_COMPLETENESS_RECORD_KEY
      ),
    ])
  const installedCompleteness = requireOfflineReadCompleteness(
    storedCompleteness
  )
  if (
    storedBootstrap?.bootstrapId !== bootstrap.bootstrapId ||
    storedRoster?.length !== roster.length ||
    storedInventory?.snapshotId !== inventory.snapshotId ||
    installedCompleteness.snapshotVersion !== snapshotVersion
  ) {
    throw new Error('OFFLINE_DURABLE_INTEGRITY_ATTESTATION_FAILED')
  }
  const prepared = Object.freeze({
    context,
    descriptor: material.descriptor,
    device,
    roster,
    inventory,
    bootstrap,
    preparedAt: now,
  })
  currentRuntime = prepared
  currentReadCompleteness = Object.freeze({
    namespaceId: material.descriptor.namespaceId,
    manifest: completeness,
  })
  await preparationDiagnostic('local.install', 90, 'success')
  markOfflineBootstrapReady()
  progress(100, 'اكتمل تجهيز نقطة البيع للعمل دون اتصال')
  await preparationDiagnostic('complete', 100, 'success')
  return prepared
}

export function prepareCompleteOfflineRuntime(
  onProgress?: (progress: OfflinePreparationProgress) => void
) {
  if (!preparationInFlight) {
    preparationInFlight = doPrepare(onProgress)
      .catch(async (error) => {
        await reportOfflinePreparationDiagnostic({
          stage: preparationDiagnosticStage,
          progress: preparationDiagnosticProgress,
          operation: 'failure',
          classification: safePreparationClassification(error),
        })
        throw error
      })
      .finally(() => {
        preparationInFlight = null
      })
  }
  return preparationInFlight
}

export async function restorePreparedOfflineRuntime() {
  if (currentRuntime && offlineKeyManager.getState().status === 'unlocked') {
    return currentRuntime
  }
  if (!hasOfflineBootstrapReadyMarker()) {
    throw new Error('OFFLINE_BOOTSTRAP_NOT_PREPARED')
  }
  const access = await readOfflineRuntimeAccessState()
  if (!access || access.loggedOut) {
    throw new Error('OFFLINE_BOOTSTRAP_LOGGED_OUT')
  }
  const existing = await readOfflineRuntimeMaterial<RuntimeMaterial>(
    access.runtimeMaterialId
  )
  if (!existing?.material) throw new Error('OFFLINE_BOOTSTRAP_NOT_PREPARED')
  if (existing.namespaceId !== access.namespaceId) {
    throw new Error('OFFLINE_RUNTIME_SCOPE_MISMATCH')
  }
  const material = await loadOrCreateRuntimeMaterial(
    existing.material.context,
    { allowCreate: false }
  )
  const encrypted = new EncryptedOfflineRepository({ allowPersistentWrites: true })
  const [bootstrap, roster, inventory] = await Promise.all([
    encrypted.readEncryptedRecord<ApprovedBootstrap>(
      OFFLINE_STORES.drafts,
      material.descriptor.namespaceId,
      BOOTSTRAP_RECORD_KEY
    ),
    encrypted.readEncryptedRecord<readonly OfflineEmployeeRosterEntry[]>(
      OFFLINE_STORES.drafts,
      material.descriptor.namespaceId,
      ROSTER_RECORD_KEY
    ),
    encrypted.readEncryptedRecord<TrustedInventory>(
      OFFLINE_STORES.drafts,
      material.descriptor.namespaceId,
      INVENTORY_RECORD_KEY
    ),
  ])
  if (!bootstrap || !roster || !inventory) {
    throw new Error('OFFLINE_BOOTSTRAP_NOT_PREPARED')
  }
  const restoredRuntime = Object.freeze({
    context: material.context,
    descriptor: material.descriptor,
    device: Object.freeze({
      deviceId: bootstrap.deviceId,
      deviceGeneration: bootstrap.deviceGeneration,
      keyEnvelopeId: bootstrap.keyEnvelopeId,
      keyEnvelopeVersion: bootstrap.keyEnvelopeVersion,
      namespaceGeneration: bootstrap.namespaceGeneration,
      status: 'active' as const,
    }),
    roster,
    inventory,
    bootstrap,
    preparedAt: bootstrap.preparedAt,
  })
  currentReadCompleteness = null
  await readOfflineReadCompleteness(restoredRuntime)
  currentRuntime = restoredRuntime
  return currentRuntime
}

export async function restoreOfflinePrimaryAuthProfile(): Promise<CurrentUserProfile> {
  const runtime = await restorePreparedOfflineRuntime()
  return Object.freeze({
    id: runtime.context.primarySubjectId,
    email: '',
    role: runtime.context.accountRole,
    full_name: '',
    is_active: true,
    tenant_id: runtime.context.tenantId,
    tenant_name: null,
    branch_id: runtime.context.branchId,
    scope_type: resolveAuthScopeType(runtime.context.accountRole),
  })
}

async function readCompleteDataset<T>(
  namespaceId: string,
  datasetId: Phase2DatasetId,
  snapshotVersion?: string
) {
  const repository = new Phase2DatasetRepository()
  const values: Array<{ recordKey: string; value: T }> = []
  let cursor: string | undefined
  do {
    const page = await repository.readCompleteSnapshotPage<T>({
      namespaceId,
      datasetId,
      ...(snapshotVersion ? { snapshotVersion } : {}),
      limit: MAX_DATASET_PAGE_SIZE,
      ...(cursor ? { afterRecordKey: cursor } : {}),
    })
    if (page.status !== 'ready') throw new Error('OFFLINE_DATASET_NOT_READY')
    values.push(...page.records)
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  return values
}

function requireOfflineReadCompleteness(
  value: unknown
): OfflineReadCompletenessManifest {
  if (
    !isRecord(value) ||
    value.contractVersion !== OFFLINE_READ_CONTRACT_VERSION ||
    value.complete !== true ||
    typeof value.snapshotVersion !== 'string' ||
    typeof value.confirmedAt !== 'string' ||
    !isRecord(value.datasetVersions) ||
    !isRecord(value.counts)
  ) {
    throw new Error('OFFLINE_READ_COMPLETENESS_INVALID')
  }
  const datasetVersions = value.datasetVersions as Record<string, unknown>
  const counts = value.counts as Record<string, unknown>
  const requiredCounts: OfflineReadDatasetName[] = [
    'applicationShell',
    'employeeRoster',
    'customers',
    'customerSearch',
    'catalog',
    'categories',
    'variants',
    'prices',
    'discounts',
    'vat',
    'branchInventory',
    'posSettings',
    'receiptSettings',
    'paymentConfiguration',
    'recentOrders',
  ]
  if (
    !['catalog', 'customers', 'orders', 'runtimeSettings'].every(
      (datasetId) =>
        typeof datasetVersions[datasetId] === 'string' &&
        datasetVersions[datasetId] === value.snapshotVersion
    ) ||
    requiredCounts.some(
      (datasetId) =>
        !Number.isSafeInteger(counts[datasetId]) ||
        Number(counts[datasetId]) < 0
    ) ||
    Number(counts.applicationShell) !== AFEX_OFFLINE_POS_SHELL_ROUTES.length
  ) {
    throw new Error('OFFLINE_READ_COMPLETENESS_INVALID')
  }
  return value as unknown as OfflineReadCompletenessManifest
}

async function migrateLegacyOfflinePaymentSnapshot(input: Readonly<{
  runtime: PreparedOfflineRuntime
  manifest: OfflineReadCompletenessManifest
  paymentConfiguration: PosPaymentConfiguration
  catalogRecords: readonly Readonly<{ recordKey: string; value: JsonRecord }>[]
  customerRecords: readonly Readonly<{
    recordKey: string
    value: OfflineCustomerSnapshot
  }>[]
  orderRecords: readonly Readonly<{ recordKey: string; value: JsonRecord }>[]
  runtimeSettingRecords: readonly Readonly<{
    recordKey: string
    value: JsonRecord
  }>[]
}>) {
  const namespaceId = input.runtime.descriptor.namespaceId
  const migratedSnapshotVersion = `payment-authority-v2-${createSecureUuidV4()}`
  const retainedSnapshotVersions = [input.manifest.snapshotVersion]
  const repository = new Phase2DatasetRepository()
  const migratedRuntimeSettings = input.runtimeSettingRecords.map((record) => {
    if (record.recordKey === PAYMENT_CONFIGURATION_RECORD_KEY) {
      return { ...record, value: input.paymentConfiguration }
    }
    if (record.recordKey === 'pos-runtime' && isRecord(record.value)) {
      return {
        ...record,
        value: {
          ...record.value,
          paymentConfiguration: input.paymentConfiguration,
        },
      }
    }
    return record
  })

  await persistDataset(
    repository,
    namespaceId,
    'catalog',
    migratedSnapshotVersion,
    input.manifest.confirmedAt,
    input.catalogRecords,
    retainedSnapshotVersions
  )
  await persistDataset(
    repository,
    namespaceId,
    'customers',
    migratedSnapshotVersion,
    input.manifest.confirmedAt,
    input.customerRecords,
    retainedSnapshotVersions
  )
  await persistDataset(
    repository,
    namespaceId,
    'orders',
    migratedSnapshotVersion,
    input.manifest.confirmedAt,
    input.orderRecords,
    retainedSnapshotVersions
  )
  await persistDataset(
    repository,
    namespaceId,
    'runtimeSettings',
    migratedSnapshotVersion,
    input.manifest.confirmedAt,
    migratedRuntimeSettings,
    retainedSnapshotVersions
  )

  const migratedManifest: OfflineReadCompletenessManifest = Object.freeze({
    ...input.manifest,
    snapshotVersion: migratedSnapshotVersion,
    datasetVersions: Object.freeze({
      catalog: migratedSnapshotVersion,
      customers: migratedSnapshotVersion,
      orders: migratedSnapshotVersion,
      runtimeSettings: migratedSnapshotVersion,
    }),
    counts: Object.freeze({
      ...input.manifest.counts,
      paymentConfiguration: input.paymentConfiguration.methods.length,
    }),
  })
  const encrypted = new EncryptedOfflineRepository({
    allowPersistentWrites: true,
  })
  await encrypted.initialize()
  await encrypted.putEncryptedDraft(
    namespaceId,
    READ_COMPLETENESS_RECORD_KEY,
    migratedManifest,
    'pos-read-completeness-pivot'
  )
  currentReadCompleteness = null
}

async function readOfflineReadCompleteness(runtime: PreparedOfflineRuntime) {
  if (currentReadCompleteness?.namespaceId === runtime.descriptor.namespaceId) {
    return currentReadCompleteness.manifest
  }
  const manifest = await readInstalledReadCompleteness(
    runtime.descriptor.namespaceId
  )
  if (!manifest) throw new Error('OFFLINE_READ_COMPLETENESS_INVALID')
  const [
    catalogAvailability,
    customerAvailability,
    orderAvailability,
    settingsAvailability,
    catalogRecords,
    customerRecords,
    orderRecords,
    runtimeSettingRecords,
  ] =
    await Promise.all([
      new Phase2DatasetRepository().getSafeAvailability(
        runtime.descriptor.namespaceId,
        'catalog',
        manifest.datasetVersions.catalog
      ),
      new Phase2DatasetRepository().getSafeAvailability(
        runtime.descriptor.namespaceId,
        'customers',
        manifest.datasetVersions.customers
      ),
      new Phase2DatasetRepository().getSafeAvailability(
        runtime.descriptor.namespaceId,
        'orders',
        manifest.datasetVersions.orders
      ),
      new Phase2DatasetRepository().getSafeAvailability(
        runtime.descriptor.namespaceId,
        'runtimeSettings',
        manifest.datasetVersions.runtimeSettings
      ),
      readCompleteDataset<JsonRecord>(
        runtime.descriptor.namespaceId,
        'catalog',
        manifest.datasetVersions.catalog
      ),
      readCompleteDataset<OfflineCustomerSnapshot>(
        runtime.descriptor.namespaceId,
        'customers',
        manifest.datasetVersions.customers
      ),
      readCompleteDataset<JsonRecord>(
        runtime.descriptor.namespaceId,
        'orders',
        manifest.datasetVersions.orders
      ),
      readCompleteDataset<JsonRecord>(
        runtime.descriptor.namespaceId,
        'runtimeSettings',
        manifest.datasetVersions.runtimeSettings
      ),
    ])
  const runtimeRecordKeys = new Set(
    runtimeSettingRecords.map((record) => record.recordKey)
  )
  const categories = runtimeSettingRecords.find(
    (record) => record.recordKey === CATEGORIES_RECORD_KEY
  )?.value
  const variants = runtimeSettingRecords.find(
    (record) => record.recordKey === VARIANTS_RECORD_KEY
  )?.value
  const storedPaymentConfiguration = runtimeSettingRecords.find(
    (record) => record.recordKey === PAYMENT_CONFIGURATION_RECORD_KEY
  )?.value
  const paymentConfiguration = parsePosPaymentConfiguration(
    storedPaymentConfiguration
  )
  if (!paymentConfiguration) {
    const migratedPaymentConfiguration = migrateLegacyPosPaymentConfiguration(
      storedPaymentConfiguration
    )
    if (
      !migratedPaymentConfiguration ||
      manifest.counts.paymentConfiguration !== 8
    ) {
      throw new Error('OFFLINE_PAYMENT_CONFIGURATION_INVALID')
    }
    await migrateLegacyOfflinePaymentSnapshot({
      runtime,
      manifest,
      paymentConfiguration: migratedPaymentConfiguration,
      catalogRecords,
      customerRecords,
      orderRecords,
      runtimeSettingRecords,
    })
    return readOfflineReadCompleteness(runtime)
  }
  if (
    catalogAvailability.status !== 'complete' ||
    customerAvailability.status !== 'complete' ||
    orderAvailability.status !== 'complete' ||
    settingsAvailability.status !== 'complete' ||
    catalogRecords.length !== manifest.counts.catalog ||
    customerRecords.length !== manifest.counts.customers ||
    orderRecords.length !== manifest.counts.recentOrders ||
    manifest.counts.employeeRoster !== runtime.roster.length ||
    manifest.counts.branchInventory !== runtime.inventory.items.length ||
    manifest.counts.paymentConfiguration !==
      paymentConfiguration.methods.length ||
    !Array.isArray(categories) ||
    categories.length !== manifest.counts.categories ||
    !Array.isArray(variants) ||
    variants.length !== manifest.counts.variants ||
    ![
      'pos-runtime',
      SYSTEM_SETTINGS_RECORD_KEY,
      PAYMENT_CONFIGURATION_RECORD_KEY,
      CATEGORIES_RECORD_KEY,
      VARIANTS_RECORD_KEY,
      INVENTORY_SNAPSHOT_RECORD_KEY,
    ].every((recordKey) => runtimeRecordKeys.has(recordKey))
  ) {
    throw new Error('OFFLINE_READ_COMPLETENESS_INVALID')
  }
  currentReadCompleteness = Object.freeze({
    namespaceId: runtime.descriptor.namespaceId,
    manifest,
  })
  return manifest
}

export async function readOfflineReadinessStatus() {
  const runtime = await restorePreparedOfflineRuntime()
  const manifest = await readOfflineReadCompleteness(runtime)
  const confirmedAtMs = Date.parse(manifest.confirmedAt)
  if (!Number.isFinite(confirmedAtMs)) {
    throw new Error('OFFLINE_READ_COMPLETENESS_INVALID')
  }
  return Object.freeze({
    complete: true as const,
    confirmedAt: manifest.confirmedAt,
    stale: Date.now() - confirmedAtMs > 30 * 24 * 60 * 60 * 1_000,
    counts: manifest.counts,
  })
}

export async function readOfflineCatalogPage(input: Readonly<{
  branchId: string
  page: number
  pageSize: number
  search?: string
  category?: string
}>) {
  const runtime = await restorePreparedOfflineRuntime()
  if (runtime.context.branchId !== input.branchId) {
    throw new Error('OFFLINE_CROSS_SCOPE_DENIED')
  }
  const completeness = await readOfflineReadCompleteness(runtime)
  const rows = (
    await readCompleteDataset<JsonRecord>(
      runtime.descriptor.namespaceId,
      'catalog',
      completeness.datasetVersions.catalog
    )
  ).map((record) => record.value)
  const inventoryByCatalogItem = new Map(
    runtime.inventory.items.map((item) => [
      item.catalogItemId,
      item.confirmedStock,
    ])
  )
  const inventoryBoundRows = rows.map((row) => {
    const catalogItemId = [row.catalog_item_id, row.item_id, row.id].find(
      (value): value is string => typeof value === 'string' && value.length > 0
    )
    const confirmedStock = catalogItemId
      ? inventoryByCatalogItem.get(catalogItemId)
      : undefined
    if (confirmedStock === undefined) return row
    const lowStockThreshold = Number(row.low_stock_threshold ?? 0)
    return {
      ...row,
      api_quantity_on_hand: confirmedStock,
      quantity_on_hand: confirmedStock,
      is_low_stock:
        Number.isFinite(lowStockThreshold) &&
        lowStockThreshold > 0 &&
        confirmedStock <= lowStockThreshold,
    }
  })
  const search = (input.search || '').trim().toLocaleLowerCase('ar')
  const category = (input.category || '').trim()
  const filtered = inventoryBoundRows.filter((row) => {
    const name = typeof row.name === 'string' ? row.name : ''
    const rowCategory = typeof row.category === 'string' ? row.category : ''
    return (
      (!search ||
        name.toLocaleLowerCase('ar').includes(search) ||
        rowCategory.toLocaleLowerCase('ar').includes(search)) &&
      (!category || category === 'all' || rowCategory === category)
    )
  })
  const page = Math.max(1, Math.trunc(input.page))
  const pageSize = Math.max(1, Math.min(200, Math.trunc(input.pageSize)))
  const start = (page - 1) * pageSize
  return {
    products: filtered.slice(start, start + pageSize),
    categories: [
      ...new Set(
        inventoryBoundRows
          .map((row) =>
            typeof row.category === 'string' ? row.category.trim() : ''
          )
          .filter(Boolean)
      ),
    ],
    total: filtered.length,
    page,
    pageSize,
  }
}

export async function readOfflineRuntimeSettings() {
  const runtime = await restorePreparedOfflineRuntime()
  const completeness = await readOfflineReadCompleteness(runtime)
  const records = await readCompleteDataset<JsonRecord>(
    runtime.descriptor.namespaceId,
    'runtimeSettings',
    completeness.datasetVersions.runtimeSettings
  )
  const settings = records.find((record) => record.recordKey === 'pos-runtime')
  if (!settings) throw new Error('OFFLINE_RUNTIME_SETTINGS_NOT_READY')
  return settings.value
}

export async function readOfflinePaymentConfiguration() {
  const runtime = await restorePreparedOfflineRuntime()
  const completeness = await readOfflineReadCompleteness(runtime)
  const records = await readCompleteDataset<JsonRecord>(
    runtime.descriptor.namespaceId,
    'runtimeSettings',
    completeness.datasetVersions.runtimeSettings
  )
  const configuration = parsePosPaymentConfiguration(
    records.find(
      (record) => record.recordKey === PAYMENT_CONFIGURATION_RECORD_KEY
    )?.value
  )
  if (!configuration) {
    throw new Error('OFFLINE_PAYMENT_CONFIGURATION_INVALID')
  }
  return configuration
}

export async function readOfflineSystemSettings() {
  const runtime = await restorePreparedOfflineRuntime()
  const completeness = await readOfflineReadCompleteness(runtime)
  const records = await readCompleteDataset<JsonRecord>(
    runtime.descriptor.namespaceId,
    'runtimeSettings',
    completeness.datasetVersions.runtimeSettings
  )
  const settings = records.find(
    (record) => record.recordKey === SYSTEM_SETTINGS_RECORD_KEY
  )
  if (!settings || !isRecord(settings.value)) {
    throw new Error('OFFLINE_SYSTEM_SETTINGS_NOT_READY')
  }
  return settings.value
}

function offlineCustomerSearchText(value: string) {
  return value.trim().toLocaleLowerCase('ar').replace(/[٠-٩۰-۹]/gu, (digit) => {
    const arabic = '٠١٢٣٤٥٦٧٨٩'.indexOf(digit)
    return `${arabic >= 0 ? arabic : '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)}`
  })
}

async function readOfflineCustomerRecords() {
  const runtime = await restorePreparedOfflineRuntime()
  const completeness = await readOfflineReadCompleteness(runtime)
  const records = await readCompleteDataset<OfflineCustomerSnapshot>(
    runtime.descriptor.namespaceId,
    'customers',
    completeness.datasetVersions.customers
  )
  if (records.length !== completeness.counts.customers) {
    throw new Error('OFFLINE_READ_COMPLETENESS_INVALID')
  }
  return records.map((record) => record.value)
}

export async function searchOfflineCustomers(input: Readonly<{
  query?: string
  recent?: boolean
  limit?: number
}>) {
  const customers = await readOfflineCustomerRecords()
  const query = offlineCustomerSearchText(input.query || '')
  const queryDigits = query.replace(/[^0-9]/gu, '')
  const matches = query
    ? customers.filter((customer) => {
        const name = offlineCustomerSearchText(customer.name)
        const phone = offlineCustomerSearchText(customer.phone)
        return (
          name.includes(query) ||
          phone.includes(query) ||
          (queryDigits.length > 0 && phone.replace(/[^0-9]/gu, '').includes(queryDigits))
        )
      })
    : [...customers]
  if (input.recent) {
    matches.sort((left, right) =>
      (right.lastActivityAt || right.createdAt || '').localeCompare(
        left.lastActivityAt || left.createdAt || ''
      )
    )
  }
  return matches.slice(0, Math.max(1, Math.min(input.limit ?? 100, 200)))
}

export async function readOfflineCustomerProfile(customerId: string) {
  const customers = await readOfflineCustomerRecords()
  const customer = customers.find((candidate) => candidate.id === customerId)
  if (!customer) throw new Error('OFFLINE_CUSTOMER_NOT_FOUND')
  return customer as SelectedCustomerProfile
}

export async function readOfflineRecentOrders() {
  const runtime = await restorePreparedOfflineRuntime()
  const completeness = await readOfflineReadCompleteness(runtime)
  const records = await readCompleteDataset<JsonRecord>(
    runtime.descriptor.namespaceId,
    'orders',
    completeness.datasetVersions.orders
  )
  if (records.length !== completeness.counts.recentOrders) {
    throw new Error('OFFLINE_READ_COMPLETENESS_INVALID')
  }
  return records.map((record) => record.value)
}

async function derivePinVerifier(pin: string, salt?: Uint8Array) {
  if (!/^\d{4}$/.test(pin)) throw new Error('OFFLINE_PIN_FORMAT_INVALID')
  const verifierSalt = salt ?? crypto.getRandomValues(new Uint8Array(32))
  const inputKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const verifier = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: Uint8Array.from(verifierSalt).buffer,
      iterations: OFFLINE_PIN_PBKDF2_ITERATIONS,
    },
    inputKey,
    256
  )
  return {
    saltHex: bytesToHex(verifierSalt),
    verifierHex: bytesToHex(new Uint8Array(verifier)),
  }
}

function constantTimeHexEqual(leftHex: string, rightHex: string) {
  let left: Uint8Array
  let right: Uint8Array
  try {
    left = hexToBytes(leftHex.toLowerCase())
    right = hexToBytes(rightHex.toLowerCase())
  } catch {
    return false
  }
  const length = Math.max(left.length, right.length, 32)
  let difference = left.length ^ right.length
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return difference === 0
}

type OfflinePinAttemptState = Readonly<{
  failedAttempts: number
  lockedUntil: number
  updatedAt: string
}>

async function readOfflinePinAttemptState(
  repository: EncryptedOfflineRepository,
  namespaceId: string
) {
  const value = await repository.readEncryptedRecord<OfflinePinAttemptState>(
    OFFLINE_STORES.drafts,
    namespaceId,
    PIN_ATTEMPT_RECORD_KEY
  )
  if (
    !value ||
    !Number.isSafeInteger(value.failedAttempts) ||
    value.failedAttempts < 0 ||
    !Number.isSafeInteger(value.lockedUntil) ||
    value.lockedUntil < 0
  ) {
    return Object.freeze({
      failedAttempts: 0,
      lockedUntil: 0,
      updatedAt: new Date(0).toISOString(),
    })
  }
  return value
}

export async function verifyOfflineEmployeePin(pin: string) {
  const runtime = await restorePreparedOfflineRuntime()
  const encrypted = new EncryptedOfflineRepository({ allowPersistentWrites: true })
  const attemptState = await readOfflinePinAttemptState(
    encrypted,
    runtime.descriptor.namespaceId
  )
  const now = Date.now()
  if (attemptState.lockedUntil > now) {
    throw new Error('تم إيقاف المحاولات مؤقتًا. انتظر قليلًا ثم حاول مرة أخرى.')
  }
  const matches: OfflineEmployeeRosterEntry[] = []
  for (const employee of runtime.roster) {
    if (
      !employee.enrolled ||
      employee.status !== 'active' ||
      !employee.pinVerifierSaltHex ||
      !employee.pinVerifierHex
    ) {
      continue
    }
    const derived = await derivePinVerifier(
      pin,
      hexToBytes(employee.pinVerifierSaltHex)
    )
    if (constantTimeHexEqual(derived.verifierHex, employee.pinVerifierHex)) {
      matches.push(employee)
    }
  }
  if (matches.length !== 1) {
    const failedAttempts =
      attemptState.lockedUntil > 0 && attemptState.lockedUntil <= now
        ? 1
        : attemptState.failedAttempts + 1
    const lockedUntil =
      failedAttempts >= OFFLINE_PIN_MAX_ATTEMPTS
        ? now + OFFLINE_PIN_LOCKOUT_MS
        : 0
    await encrypted.putEncryptedDraft(
      runtime.descriptor.namespaceId,
      PIN_ATTEMPT_RECORD_KEY,
      {
        failedAttempts:
          failedAttempts >= OFFLINE_PIN_MAX_ATTEMPTS ? 0 : failedAttempts,
        lockedUntil,
        updatedAt: new Date(now).toISOString(),
      } satisfies OfflinePinAttemptState,
      'offline-pin-attempt-state'
    )
    throw new Error(
      lockedUntil > 0
        ? 'تم إيقاف المحاولات مؤقتًا. انتظر قليلًا ثم حاول مرة أخرى.'
        : 'رمز الموظف غير صحيح.'
    )
  }
  const selected = matches[0]
  const employee: ActivePosEmployee = {
    id: selected.employeeId,
    username: selected.username,
    full_name: selected.fullName,
    role: selected.role as ActivePosEmployee['role'],
    branch_id: selected.branchId,
  }
  await encrypted.putEncryptedDraftBatch(runtime.descriptor.namespaceId, [
    {
      recordKey: ACTOR_RECORD_KEY,
      value: {
        employee,
        enrollmentId: selected.enrollmentId,
        employeeEnrollmentGeneration: selected.enrollmentGeneration,
        commandGeneration: selected.commandGeneration,
        boundAt: new Date().toISOString(),
        source: 'offline-enrolled-verifier',
      },
      classification: 'local-pos-actor-binding',
    },
    {
      recordKey: PIN_ATTEMPT_RECORD_KEY,
      value: {
        failedAttempts: 0,
        lockedUntil: 0,
        updatedAt: new Date().toISOString(),
      } satisfies OfflinePinAttemptState,
      classification: 'offline-pin-attempt-state',
    },
  ])
  return employee
}

export async function enrollOnlineEmployeeForOffline(
  pin: string,
  employee: ActivePosEmployee
) {
  let stageCode: OfflineEnrollmentDiagnosticStage = 'authority.restore'
  let operationName = 'employee.enroll'
  let httpStatus: number | null = null
  let applicationCode: string | null = null
  try {
    const authority = await employeeEnrollmentAuthority()
    assertSelectedEmployeeMatchesPreparedBranch(
      employee.branch_id,
      authority.context.branchId
    )
    const existing = authority.roster.find(
      (entry) => entry.employeeId === employee.id && entry.enrolled
    )
    const operation = existing ? 'employee.replace_pin' : 'employee.enroll'
    operationName = operation
    stageCode = 'namespace.derive'
    const materialId = await runtimeMaterialId(authority.context)
    stageCode = 'pin-verifier.derive'
    const verifier = await derivePinVerifier(pin)
  const payload = existing
    ? {
        operationId: createSecureUuidV4(),
        deviceId: authority.device.deviceId,
        actualPosEmployeeId: employee.id,
        expectedEnrollmentGeneration: existing.enrollmentGeneration,
        pinVerifierSaltHex: verifier.saltHex,
        pinVerifierHex: verifier.verifierHex,
        packageSha256: (
          await readOfflineRuntimeMaterial<RuntimeMaterial>(materialId)
        )?.material.packageSha256,
        evidenceSha256: await sha256Hex(
          JSON.stringify(
            canonical({ employeeId: employee.id, operation, version: 1 })
          )
        ),
      }
    : {
        operationId: createSecureUuidV4(),
        deviceId: authority.device.deviceId,
        actualPosEmployeeId: employee.id,
        keyEnvelopeId: authority.device.keyEnvelopeId,
        keyEnvelopeVersion: authority.device.keyEnvelopeVersion,
        namespaceGeneration: authority.device.namespaceGeneration,
        pinVerifierSaltHex: verifier.saltHex,
        pinVerifierHex: verifier.verifierHex,
        packageSha256: (
          await readOfflineRuntimeMaterial<RuntimeMaterial>(materialId)
        )?.material.packageSha256,
        evidenceSha256: await sha256Hex(
          JSON.stringify(
            canonical({ employeeId: employee.id, operation, version: 1 })
          )
        ),
      }
  if (!payload.packageSha256) throw new Error('OFFLINE_KEY_MATERIAL_MISSING')
  stageCode = 'employee.enroll.request'
  const response = await fetch('/api/pos/offline-pilot', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, payload }),
  })
  const result = (await response.json().catch(() => null)) as JsonRecord | null
  httpStatus = response.status
  applicationCode =
    typeof result?.error === 'string' && /^[A-Z][A-Z0-9_]{2,96}$/u.test(result.error)
      ? result.error
      : null
  if (!response.ok || result?.success !== true) {
    throw new Error(
      typeof result?.error === 'string'
        ? result.error
        : 'OFFLINE_EMPLOYEE_ENROLLMENT_FAILED'
    )
  }
  stageCode = 'employee.roster.request'
  operationName = 'employee.roster'
  const refreshedRoster = employeeRoster(
    await postPreparation('employee.roster', {
      deviceId: authority.device.deviceId,
    })
  )
  const encrypted = new EncryptedOfflineRepository({ allowPersistentWrites: true })
  const enrolledEmployee =
    refreshedRoster.find(
      (entry) => entry.employeeId === employee.id && entry.enrolled
    ) ?? null
  if (
    !enrolledEmployee?.enrollmentId ||
    !enrolledEmployee.enrollmentGeneration ||
    !enrolledEmployee.commandGeneration
  ) {
    throw new Error('OFFLINE_EMPLOYEE_ENROLLMENT_NOT_ATTESTED')
  }

  if (authority.source === 'preparation-checkpoint') {
    stageCode = 'local-roster.persist'
    operationName = 'employee.enrollment.resume'
    await encrypted.putEncryptedDraft(
      authority.descriptor.namespaceId,
      ROSTER_RECORD_KEY,
      refreshedRoster,
      'pre-pin-employee-roster-resume'
    )
    await preparationDiagnostic('employee.enrollment', 35, 'resume')
    return Object.freeze({
      employee: enrolledEmployee,
      preparationResumeRequired: true as const,
    })
  }

  const runtime = authority.runtime
  if (!runtime) throw new Error('OFFLINE_BOOTSTRAP_NOT_PREPARED')
  const installedCompleteness = await readOfflineReadCompleteness(runtime)
  const refreshedCompleteness: OfflineReadCompletenessManifest = Object.freeze({
    ...installedCompleteness,
    counts: Object.freeze({
      ...installedCompleteness.counts,
      employeeRoster: refreshedRoster.length,
    }),
  })
  stageCode = 'local-roster.persist'
  operationName = 'employee.enrollment.persist'
  await encrypted.putEncryptedDraftBatch(runtime.descriptor.namespaceId, [
    {
      recordKey: ROSTER_RECORD_KEY,
      value: refreshedRoster,
      classification: 'pre-pin-employee-roster',
    },
    {
      recordKey: READ_COMPLETENESS_RECORD_KEY,
      value: refreshedCompleteness,
      classification: 'pos-read-completeness-pivot',
    },
  ])
  currentRuntime = Object.freeze({ ...runtime, roster: refreshedRoster })
  currentReadCompleteness = Object.freeze({
    namespaceId: runtime.descriptor.namespaceId,
    manifest: refreshedCompleteness,
  })
  stageCode = 'online-bootstrap.request'
  operationName = 'online.bootstrap'
  httpStatus = null
  applicationCode = null
  const actorBootstrapResponse = await fetch('/api/pos/offline-pilot', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operation: 'online.bootstrap',
      payload: {
        operationId: createSecureUuidV4(),
        deviceId: runtime.device.deviceId,
        keyEnvelopeId: runtime.device.keyEnvelopeId,
        keyEnvelopeVersion: runtime.device.keyEnvelopeVersion,
        namespaceGeneration: runtime.device.namespaceGeneration,
        inventorySnapshotId: runtime.inventory.snapshotId,
        packageSha256: payload.packageSha256,
        evidenceSha256: await sha256Hex(
          JSON.stringify(
            canonical({
              employeeId: employee.id,
              inventorySnapshotId: runtime.inventory.snapshotId,
              operation: 'online.bootstrap',
              version: 1,
            })
          )
        ),
      },
    }),
  })
  const actorBootstrap = (await actorBootstrapResponse
    .json()
    .catch(() => null)) as JsonRecord | null
  httpStatus = actorBootstrapResponse.status
  applicationCode =
    typeof actorBootstrap?.error === 'string' &&
    /^[A-Z][A-Z0-9_]{2,96}$/u.test(actorBootstrap.error)
      ? actorBootstrap.error
      : null
  if (!actorBootstrapResponse.ok || actorBootstrap?.success !== true) {
    throw new Error(
      typeof actorBootstrap?.error === 'string'
        ? actorBootstrap.error
        : 'OFFLINE_ACTOR_BOOTSTRAP_FAILED'
    )
  }
  stageCode = 'local-actor.persist'
  operationName = 'online.bootstrap.persist'
  await encrypted.putEncryptedDraft(
    runtime.descriptor.namespaceId,
    ACTOR_RECORD_KEY,
    {
      employee,
      enrollmentId: enrolledEmployee.enrollmentId,
      employeeEnrollmentGeneration: enrolledEmployee.enrollmentGeneration,
      commandGeneration: enrolledEmployee.commandGeneration,
      boundAt: new Date().toISOString(),
      source: 'online-pos-actor-session',
    },
    'local-pos-actor-binding'
  )
  return Object.freeze({
    employee: enrolledEmployee,
    preparationResumeRequired: false as const,
  })
  } catch (error) {
    reportEnrollmentFailure({
      stageCode,
      operationName,
      httpStatus,
      applicationCode: applicationCode ?? safeEnrollmentApplicationCode(error),
    })
    throw error
  }
}

async function actorAuthority(runtime: PreparedOfflineRuntime, employeeId: string) {
  const encrypted = new EncryptedOfflineRepository({ allowPersistentWrites: true })
  const binding = await encrypted.readEncryptedRecord<JsonRecord>(
    OFFLINE_STORES.drafts,
    runtime.descriptor.namespaceId,
    ACTOR_RECORD_KEY
  )
  if (!binding || !isRecord(binding.employee)) {
    throw new Error('OFFLINE_ACTOR_BINDING_REQUIRED')
  }
  const employee = binding.employee
  if (employee.id !== employeeId || employee.branch_id !== runtime.context.branchId) {
    throw new Error('OFFLINE_EMPLOYEE_SUBSTITUTION_REJECTED')
  }
  const enrollment = runtime.roster.find(
    (entry) => entry.employeeId === employeeId && entry.enrolled
  )
  if (!enrollment?.enrollmentId) throw new Error('OFFLINE_ENROLLMENT_REQUIRED')
  return { binding, enrollment }
}

function phase3Authority(
  runtime: PreparedOfflineRuntime,
  employeeId: string
): Phase3AuthorityReferences {
  return {
    accountUserAuthorityReference: runtime.context.primarySubjectId,
    tenantReference: runtime.context.tenantId,
    branchReference: runtime.context.branchId,
    deviceCacheReference: runtime.device.deviceId,
    posEmployeeActorReference: employeeId,
    actorSessionLeaseReference: runtime.bootstrap.bootstrapId,
  }
}

async function pendingInventoryCommitments(
  repository: Phase3CommandRepository,
  namespaceId: string,
  excludedLocalCommandId: string | null = null
) {
  const totals = new Map<string, { pending: number; syncing: number }>()
  for (const state of ['pending', 'syncing'] as const) {
    const commands = await repository.listCommandsByState(
      namespaceId,
      state,
      PHASE3_LIMITS.maximumPendingCommands
    )
    for (const command of commands) {
      if (
        command.commandType !== 'order.create' ||
        command.localCommandId === excludedLocalCommandId
      ) continue
      const payload = await repository.readCommandPayload<'order.create'>(
        namespaceId,
        command.localCommandId
      )
      for (const item of payload?.itemReferences ?? []) {
        const current = totals.get(item.catalogItemReference) ?? {
          pending: 0,
          syncing: 0,
        }
        current[state] += item.quantity
        totals.set(item.catalogItemReference, current)
      }
    }
  }
  return totals
}

function allocateLines(input: OfflineCheckoutInput) {
  let allocatedDiscount = 0
  let allocatedTax = 0
  return input.items.map((item, index) => {
    if (!item.item_id) throw new Error('OFFLINE_CATALOG_ITEM_REQUIRED')
    const gross = item.unit_price * item.quantity
    const last = index === input.items.length - 1
    const discount = last
      ? input.totals.discountAmount - allocatedDiscount
      : Math.round(
          input.totals.discountAmount * (gross / input.totals.subtotal) * 100
        ) / 100
    const tax = last
      ? input.totals.taxAmount - allocatedTax
      : Math.round(input.totals.taxAmount * (gross / input.totals.subtotal) * 100) /
        100
    allocatedDiscount += discount
    allocatedTax += tax
    const taxable = gross - discount
    return {
      item,
      catalogItemId: requireUuid(item.item_id),
      gross,
      discount,
      taxable,
      tax,
      total: taxable + tax,
      lineId: createSecureUuidV4(),
    }
  })
}

export async function enqueueOfflineOrderCreate(input: OfflineCheckoutInput) {
  const runtime = await restorePreparedOfflineRuntime()
  if (
    input.branchId !== runtime.context.branchId ||
    !input.employee ||
    !input.customerId ||
    !Number.isSafeInteger(input.customerRecordVersion) ||
    Number(input.customerRecordVersion) < 1 ||
    input.items.length < 1
  ) {
    throw new Error('OFFLINE_ORDER_CREATE_LOCAL_AUTHORITY_INVALID')
  }
  const { enrollment } = await actorAuthority(runtime, input.employee.id)
  const encrypted = new EncryptedOfflineRepository({ allowPersistentWrites: true })
  const idempotencyRecordKey = `idempotency-binding:${await sha256Hex(
    input.clientIdempotencyKey
  )}`
  const submissionHash = await sha256Hex(
    JSON.stringify(
      canonical({
        contract: 'offline-order-create-submission.v1',
        tenantId: runtime.context.tenantId,
        branchId: input.branchId,
        employeeId: input.employee.id,
        customerId: input.customerId,
        customerRecordVersion: input.customerRecordVersion,
        paymentMethod: input.paymentMethod,
        note: input.note,
        items: input.items.map((item) => ({
          itemId: item.item_id,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          itemType: item.item_type,
        })),
        totals: input.totals,
      })
    )
  )
  type IdempotencyBinding = Readonly<{
    submissionHash: string
    orderReference: string
    createdAt: string
    localCommandId: string | null
    status: 'preparing' | 'complete'
  }>
  let binding = await encrypted.readEncryptedRecord<IdempotencyBinding>(
    OFFLINE_STORES.drafts,
    runtime.descriptor.namespaceId,
    idempotencyRecordKey
  )
  if (!binding) {
    const candidate = Object.freeze({
      submissionHash,
      orderReference: createSecureUuidV4(),
      createdAt: new Date().toISOString(),
      localCommandId: null,
      status: 'preparing' as const,
    })
    await encrypted.putEncryptedDraftIfAbsent(
      runtime.descriptor.namespaceId,
      idempotencyRecordKey,
      candidate,
      'order-create-idempotency-preparation'
    )
    binding = await encrypted.readEncryptedRecord<IdempotencyBinding>(
      OFFLINE_STORES.drafts,
      runtime.descriptor.namespaceId,
      idempotencyRecordKey
    )
  }
  if (!binding || binding.submissionHash !== submissionHash) {
    throw new Error('OFFLINE_IDEMPOTENCY_PAYLOAD_CONFLICT')
  }
  const orderId = requireUuid(
    binding.orderReference,
    'OFFLINE_IDEMPOTENCY_BINDING_INVALID'
  )
  const createdAt = binding.createdAt
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new Error('OFFLINE_IDEMPOTENCY_BINDING_INVALID')
  }
  if (binding.status === 'complete') {
    if (!binding.localCommandId) {
      throw new Error('OFFLINE_IDEMPOTENCY_BINDING_INVALID')
    }
    const receipt = await encrypted.readEncryptedRecord<{
      version: number
      localCommandId: string
      orderReference: string
      receiptNumber: string
      total: string
      state: string
      createdAt: string
    }>(
      OFFLINE_STORES.drafts,
      runtime.descriptor.namespaceId,
      `local-receipt:${binding.localCommandId}`
    )
    if (!receipt) throw new Error('OFFLINE_IDEMPOTENCY_RECEIPT_MISSING')
    return { queued: true as const, duplicate: true as const, receipt }
  }
  const commands = new Phase3CommandRepository()
  const existingOrder = await commands.readCommandIdentityByDeduplication(
    runtime.descriptor.namespaceId,
    'order.create',
    input.clientIdempotencyKey
  )
  const commitments = await pendingInventoryCommitments(
    commands,
    runtime.descriptor.namespaceId,
    existingOrder?.localCommandId ?? null
  )
  const confirmed = new Map(
    runtime.inventory.items.map((item) => [item.catalogItemId, item.confirmedStock])
  )
  for (const item of input.items) {
    const itemId = requireUuid(item.item_id)
    const local = commitments.get(itemId) ?? { pending: 0, syncing: 0 }
    const available = Math.max(
      0,
      (confirmed.get(itemId) ?? 0) - local.pending - local.syncing
    )
    if (item.quantity > available) {
      throw new Error(
        available === 0
          ? 'OFFLINE_INVENTORY_EXHAUSTED'
          : `OFFLINE_INVENTORY_INSUFFICIENT:${available}`
      )
    }
  }
  const authority = phase3Authority(runtime, input.employee.id)
  const paymentPayload = {
    orderAggregateReference: orderId,
    paymentMethod: input.paymentMethod as Phase3PaymentMethod,
    amount: money(input.totals.finalTotal),
    currency: 'SAR' as const,
    employeeConfirmedExternalPayment: true as const,
    employeeConfirmedAtLocal: createdAt,
    paymentProviderConfirmationStatus: 'employee_attested' as const,
    paymentReplayPolicy: 'never_charge_or_invoke_provider' as const,
    reconciliationStatus: 'pending' as const,
  }
  const paymentIdentity = await createPhase3CommandIdentity({
    namespaceId: runtime.descriptor.namespaceId,
    commandType: 'payment.employee_attestation',
    payload: paymentPayload,
    authority,
    deduplicationKey: `${input.clientIdempotencyKey}:payment`,
    causationId: `cause_${orderId}`,
    correlationId: `corr_${orderId}`,
  })
  const payment = await commands.enqueue({
    namespaceId: runtime.descriptor.namespaceId,
    commandType: 'payment.employee_attestation',
    payload: paymentPayload,
    authority,
    deduplicationKey: `${input.clientIdempotencyKey}:payment`,
    identity: paymentIdentity,
  })
  if (payment.command.state === 'pending') {
    await commands.completeLocalEmployeePaymentAttestation(
      runtime.descriptor.namespaceId,
      payment.command.localCommandId
    )
  }
  const orderPayload = {
    aggregateReference: orderId,
    customerReference: { kind: 'server' as const, id: requireUuid(input.customerId) },
    itemReferences: input.items.map((item) => ({
      catalogItemReference: requireUuid(item.item_id),
      quantity: item.quantity,
    })),
    paymentAttestationCommandId: payment.command.localCommandId,
  }
  const orderIdentity = await createPhase3CommandIdentity({
    namespaceId: runtime.descriptor.namespaceId,
    commandType: 'order.create',
    payload: orderPayload,
    authority,
    deduplicationKey: input.clientIdempotencyKey,
    causationId: payment.command.localCommandId,
    correlationId: payment.command.immutable.correlationId,
  })
  const order = await commands.enqueue({
    namespaceId: runtime.descriptor.namespaceId,
    commandType: 'order.create',
    payload: orderPayload,
    authority,
    dependencyIds: [payment.command.localCommandId],
    deduplicationKey: input.clientIdempotencyKey,
    identity: orderIdentity,
  })
  await encrypted.putEncryptedDraft(
    runtime.descriptor.namespaceId,
    idempotencyRecordKey,
    {
      submissionHash,
      orderReference: orderId,
      createdAt,
      localCommandId: order.command.localCommandId,
      status: 'preparing',
    },
    'order-create-idempotency-preparation'
  )
  const localReceipt = Object.freeze({
    version: 1,
    localCommandId: order.command.localCommandId,
    orderReference: orderId,
    receiptNumber: `LOCAL-${order.command.localSequence.toString().padStart(6, '0')}`,
    total: money(input.totals.finalTotal),
    state: 'pending_sync',
    createdAt: order.command.createdAtLocal,
  })
  const lines = allocateLines(input)
  const coreOrderCanonicalPayload = {
    payload_version: 'order-command-payload-v1',
    fingerprint_version: 'order-request-fingerprint-v1',
    command_type: 'order.create',
    tenant_id: runtime.context.tenantId,
    branch_id: runtime.context.branchId,
    authenticated_actor_id: runtime.context.primarySubjectId,
    customer: {
      mode: 'existing',
      customer_id: input.customerId,
      expected_record_version: input.customerRecordVersion,
      normalized_phone: null,
      display_phone: null,
      name: null,
      email: null,
      address: null,
      notes: null,
      allowed_update_fields: [],
      conflict_behavior: 'reject',
    },
    items: lines.map((line, index) => ({
      line_id: line.lineId,
      line_number: index + 1,
      catalog_item_id: line.catalogItemId,
      name_snapshot: line.item.item_name,
      sku_snapshot: `OFFLINE-${line.catalogItemId.slice(0, 8)}`,
      category_snapshot: 'offline-catalog',
      item_type_snapshot: line.item.item_type,
      quantity: String(line.item.quantity),
      unit_snapshot: 'item',
      inventory_tracking_mode:
        line.item.item_type === 'product' ? 'tracked_product' : 'service',
      fulfillment_class: 'immediate',
      line_note: null,
      modifiers: [],
    })),
    pricing: {
      currency: 'SAR',
      currency_precision: 2,
      subtotal: money(input.totals.subtotal),
      taxable_subtotal: money(input.totals.subtotal - input.totals.discountAmount),
      total: money(input.totals.finalTotal),
      rounding_strategy: 'invoice-half-up-v1',
      price_version: runtime.inventory.frontierVersion,
      branch_pricing_version: runtime.inventory.frontierVersion,
      quote_reference: orderId,
      quote_version: 'financial-quote-v1',
      quote_fingerprint: await sha256Hex(
        JSON.stringify(canonical(lines.map((line) => [line.catalogItemId, line.item.unit_price])))
      ),
      financial_engine_version: 'financial-engine-v2-r1',
      lines: lines.map((line) => ({
        line_id: line.lineId,
        unit_price: money(line.item.unit_price),
        pricing_source: 'catalog_default',
        source_catalog_id: line.catalogItemId,
        source_branch_price_id: null,
        source_catalog_version: runtime.inventory.confirmedAt,
        source_branch_price_version: runtime.inventory.confirmedAt,
        gross_amount: money(line.gross),
        discount_allocation: money(line.discount),
        taxable_amount: money(line.taxable),
        vat_amount: money(line.tax),
        net_amount: money(line.taxable),
      })),
    },
    vat: {
      mode: input.totals.vatRate > 0 ? 'exclusive' : 'exempt',
      tax_inclusive: false,
      setting_id: null,
      rate: money(input.totals.vatRate),
      amount: money(input.totals.taxAmount),
      rule_version: 'v1',
      effective_at: runtime.inventory.confirmedAt,
    },
    discount: {
      id: null,
      source: input.totals.discountAmount > 0 ? 'manual' : 'none',
      name_snapshot:
        input.totals.discountAmount > 0 ? 'POS discount' : null,
      type: input.totals.discountAmount > 0 ? 'fixed' : null,
      value:
        input.totals.discountAmount > 0
          ? money(input.totals.discountAmount)
          : null,
      amount: money(input.totals.discountAmount),
      eligibility_version: null,
      rule_version:
        input.totals.discountAmount > 0
          ? runtime.inventory.frontierVersion
          : null,
    },
    payment: {
      method: input.paymentMethod,
      amount_tendered: money(input.totals.numericCashReceived),
      expected_status:
        input.paymentMethod === 'cod' || input.paymentMethod === 'on_delivery'
          ? 'pending'
          : 'paid',
      cash_received:
        input.paymentMethod === 'cash' ||
        input.paymentMethod === 'cod' ||
        input.paymentMethod === 'on_delivery'
          ? money(input.totals.numericCashReceived)
          : null,
      remaining_from_customer: money(input.totals.remainingFromCustomer),
      cash_change: money(input.totals.cashChange),
      rule_version: 'v1',
      provider_reference: null,
    },
    fulfillment: {
      method: 'immediate',
      branch_id: runtime.context.branchId,
      requested_at: null,
      address: null,
      instructions: null,
    },
    order: { note: input.note.trim() || null },
    metadata: {
      source_channel: 'pos',
      request_reference: input.clientIdempotencyKey,
      offline_draft_id: order.command.localCommandId,
      correlation_id: orderId,
      device_id: runtime.device.deviceId,
      pos_terminal_id: runtime.device.deviceId,
      client_version: OFFLINE_COMPLETE_RUNTIME_VERSION,
    },
    versions: {
      customer_engine: 'v1',
      financial_engine: 'financial-engine-v2-r1',
      inventory_engine: 'v1',
      numbering_engine: 'v1',
      authorization_contract: 'v1',
      payload_contract: 'order-command-payload-v1',
    },
  }
  const itemReferences = lines.map((line) => ({
    catalogItemReference: line.catalogItemId,
    quantity: line.item.quantity,
    unitPrice: money(line.item.unit_price),
    grossAmount: money(line.gross),
    discountAllocation: money(line.discount),
    taxableAmount: money(line.taxable),
    vatRate: money(input.totals.vatRate),
    vatBasis: money(line.taxable),
    vatAmount: money(line.tax),
    lineSubtotal: money(line.gross),
    lineTotal: money(line.total),
  }))
  const corePayloadHash = await sha256Hex(
    JSON.stringify(canonical(coreOrderCanonicalPayload))
  )
  const coreFingerprintProjection = {
    command_type: 'order.create',
    tenant_id: runtime.context.tenantId,
    branch_id: runtime.context.branchId,
    request_reference: input.clientIdempotencyKey,
  }
  const payload = {
    aggregateReference: orderId,
    customerReference: { kind: 'server', id: input.customerId },
    itemReferences,
    paymentAttestationCommandId: payment.command.localCommandId,
    paymentMethod: input.paymentMethod,
    currency: 'SAR',
    subtotalAmount: money(input.totals.subtotal),
    discountAmount: money(input.totals.discountAmount),
    taxAmount: money(input.totals.taxAmount),
    totalAmount: money(input.totals.finalTotal),
    canonicalPayloadVersion: 'order-command-payload-v1',
    coreOrderCanonicalPayload,
    coreFingerprintProjection,
    corePayloadCanonicalHash: corePayloadHash,
    idempotencyKey: input.clientIdempotencyKey,
    inventorySnapshotId: runtime.inventory.snapshotId,
    inventoryFrontierVersion: runtime.inventory.frontierVersion,
  }
  const payloadCanonicalHash = await sha256Hex(
    JSON.stringify(canonical(payload))
  )
  const originAuthorityReference = {
    bootstrapId: runtime.bootstrap.bootstrapId,
    bootstrapGeneration: runtime.bootstrap.bootstrapGeneration,
    primaryAuthenticatedSubjectId: runtime.context.primarySubjectId,
    tenantId: runtime.context.tenantId,
    branchId: runtime.context.branchId,
    deviceId: runtime.device.deviceId,
    deviceGeneration: runtime.device.deviceGeneration,
    enrollmentId: enrollment.enrollmentId,
    actualPosEmployeeId: input.employee.id,
    employeeEnrollmentGeneration: enrollment.enrollmentGeneration,
    commandGeneration: enrollment.commandGeneration,
    keyEnvelopeId: runtime.device.keyEnvelopeId,
    keyEnvelopeVersion: runtime.device.keyEnvelopeVersion,
    namespaceGeneration: runtime.device.namespaceGeneration,
    originAuthorityVersion: 'afex-offline-origin-authority.v2',
  }
  const paymentAttestation = {
    attestationCommandId: payment.command.localCommandId,
    orderAggregateReference: orderId,
    primaryAuthenticatedUserId: runtime.context.primarySubjectId,
    actualPosEmployeeId: input.employee.id,
    tenantId: runtime.context.tenantId,
    branchId: runtime.context.branchId,
    deviceId: runtime.device.deviceId,
    deviceGeneration: runtime.device.deviceGeneration,
    employeeEnrollmentGeneration: enrollment.enrollmentGeneration,
    commandGeneration: enrollment.commandGeneration,
    method: input.paymentMethod,
    amount: money(input.totals.finalTotal),
    currency: 'SAR',
    employeeAttestedExternalStep: true,
    attestedAtLocal: createdAt,
    providerStatus: 'unverified',
    providerConfirmation: 'not_claimed',
    providerSettlement: 'not_claimed',
    bankSettlement: 'not_claimed',
    cardAuthorization: 'not_claimed',
    refundCompletion: 'not_claimed',
    paymentProviderActionRequested: false,
    orderCreateLocalCommandId: order.command.localCommandId,
    orderCreateIdempotencyKeyHash: await sha256Hex(input.clientIdempotencyKey),
  }
  const inventoryFrontierReference = {
    contractVersion: 'branch-inventory-frontier.v1',
    tenantId: runtime.context.tenantId,
    branchId: runtime.context.branchId,
    snapshotId: runtime.inventory.snapshotId,
    frontierVersion: runtime.inventory.frontierVersion,
    localCommitmentFrontier: `local-sequence-${order.command.localSequence}`,
    items: itemReferences
      .map((item) => {
        const commitment = commitments.get(item.catalogItemReference) ?? {
          pending: 0,
          syncing: 0,
        }
        return {
          catalogItemId: item.catalogItemReference,
          requestedQuantity: item.quantity,
          pendingLocalCommitments: commitment.pending,
          syncingLocalCommitments: commitment.syncing,
        }
      })
      .sort((left, right) => left.catalogItemId.localeCompare(right.catalogItemId)),
  }
  const authorityBinding = {
    commandContractVersion: 'core-v2-offline-order-create.v2',
    schemaVersion: 1,
    localCommandId: order.command.localCommandId,
    idempotencyKey: input.clientIdempotencyKey,
    commandType: 'order.create',
    primaryAuthenticatedUserId: runtime.context.primarySubjectId,
    tenantId: runtime.context.tenantId,
    branchId: runtime.context.branchId,
    actualPosEmployeeId: input.employee.id,
    deviceId: runtime.device.deviceId,
    deviceGeneration: runtime.device.deviceGeneration,
    employeeEnrollmentGeneration: enrollment.enrollmentGeneration,
    commandGeneration: enrollment.commandGeneration,
    keyEnvelopeId: runtime.device.keyEnvelopeId,
    keyEnvelopeVersion: runtime.device.keyEnvelopeVersion,
    aggregateType: 'order',
    aggregateId: orderId,
    localAggregateReference: null,
    payloadCanonicalHash,
    paymentAttestation,
    inventoryFrontierReference,
    originAuthorityReference,
  }
  const envelope = Object.freeze({
    localCommandId: order.command.localCommandId,
    idempotencyKey: input.clientIdempotencyKey,
    commandType: 'order.create',
    commandContractVersion: 'core-v2-offline-order-create.v2',
    schemaVersion: 1,
    primaryAuthenticatedUserId: runtime.context.primarySubjectId,
    tenantId: runtime.context.tenantId,
    branchId: runtime.context.branchId,
    actualPosEmployeeId: input.employee.id,
    deviceId: runtime.device.deviceId,
    deviceGeneration: runtime.device.deviceGeneration,
    employeeEnrollmentGeneration: enrollment.enrollmentGeneration,
    commandGeneration: enrollment.commandGeneration,
    aggregateType: 'order',
    aggregateId: orderId,
    localAggregateReference: null,
    localCreatedAt: order.command.createdAtLocal,
    payload,
    payloadCanonicalHash,
    authorityBindingCanonicalHash: await sha256Hex(
      JSON.stringify(canonical(authorityBinding))
    ),
    dependencyReferences: [payment.command.localCommandId],
    paymentAttestation,
    inventoryFrontierReference,
    keyEnvelopeId: runtime.device.keyEnvelopeId,
    keyEnvelopeVersion: runtime.device.keyEnvelopeVersion,
    originAuthorityReference,
    clientApplicationVersion: '1.0.0',
  })
  await encrypted.putEncryptedDraftBatch(runtime.descriptor.namespaceId, [
    {
      recordKey: `${CORE_COMMAND_PREFIX}${order.command.localCommandId}`,
      value: envelope,
      classification: 'core-v2-order-create-envelope',
    },
    {
      recordKey: `local-receipt:${order.command.localCommandId}`,
      value: localReceipt,
      classification: 'stable-local-pending-receipt',
    },
    {
      recordKey: idempotencyRecordKey,
      value: {
        submissionHash,
        orderReference: orderId,
        createdAt,
        localCommandId: order.command.localCommandId,
        status: 'complete',
      },
      classification: 'order-create-idempotency-binding',
    },
  ])
  return {
    queued: true as const,
    duplicate: order.status === 'duplicate',
    receipt: localReceipt,
  }
}

async function synchronizeBoundedBatch() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { status: 'offline' as const }
  }
  const runtime = await restorePreparedOfflineRuntime()
  const employee = readActivePosEmployee()
  if (!employee) {
    return { status: 'actor-required' as const }
  }
  await actorAuthority(runtime, employee.id)
  const commands = new Phase3CommandRepository()
  await commands.recoverAbandonedSyncing(runtime.descriptor.namespaceId)
  const pending = (
    await commands.listCommandsByState(
      runtime.descriptor.namespaceId,
      'pending',
      MAX_SYNC_BATCH
    )
  ).filter((command) => command.commandType === 'order.create')
  const encrypted = new EncryptedOfflineRepository({ allowPersistentWrites: true })
  const results: unknown[] = []
  for (const command of pending) {
    await commands.markSyncing(runtime.descriptor.namespaceId, command.localCommandId)
    try {
      const envelope = await encrypted.readEncryptedRecord<JsonRecord>(
        OFFLINE_STORES.drafts,
        runtime.descriptor.namespaceId,
        `${CORE_COMMAND_PREFIX}${command.localCommandId}`
      )
      if (!envelope) throw new Error('OFFLINE_CORE_ENVELOPE_MISSING')
      const response = await fetch('/api/pos/offline-pilot', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'order.create.resolve_and_acquire',
          payload: {
            commands: [
              {
                envelope,
                dependencyStates: (envelope.dependencyReferences as string[]).map(
                  (localCommandId) => ({ localCommandId, state: 'synced' })
                ),
              },
            ],
          },
        }),
      })
      const body = (await response.json().catch(() => null)) as JsonRecord | null
      if (!response.ok || body?.success !== true || !isRecord(body.data)) {
        const classification =
          typeof body?.error === 'string'
            ? body.error.replace(/[^A-Z0-9_:-]/gi, '_').slice(0, 96)
            : 'OFFLINE_SYNC_REQUEST_FAILED'
        if (
          response.status === 401 ||
          response.status === 403 ||
          /AUTH|ACTOR|EMPLOYEE|REVOK|STALE|SCOPE|DEVICE/u.test(classification)
        ) {
          await commands.markSyncConflict(
            runtime.descriptor.namespaceId,
            command.localCommandId,
            classification || 'SERVER_AUTHORITY_CONFLICT'
          )
          break
        }
        throw new Error(
          classification
        )
      }
      const qualifications = body.data.qualifications
      const acquisitions = body.data.acquisitions
      const qualification = Array.isArray(qualifications)
        ? qualifications[0]
        : null
      const acquisition = Array.isArray(acquisitions) ? acquisitions[0] : null
      if (
        !isRecord(qualification) ||
        !['qualified', 'already_processed'].includes(String(qualification.outcome))
      ) {
        if (
          isRecord(qualification) &&
          ['conflict', 'rejected', 'blocked'].includes(
            String(qualification.outcome)
          )
        ) {
          await commands.markSyncConflict(
            runtime.descriptor.namespaceId,
            command.localCommandId,
            String(qualification.code || 'SERVER_AUTHORITY_CONFLICT')
              .replace(/[^A-Z0-9_:-]/gi, '_')
              .slice(0, 96)
          )
          continue
        }
        throw new Error('OFFLINE_SYNC_TEMPORARILY_UNAVAILABLE')
      }
      const receipt = acquisition ?? qualification.receipt
      if (!receipt) throw new Error('OFFLINE_STABLE_RECEIPT_MISSING')
      await encrypted.putEncryptedDraft(
        runtime.descriptor.namespaceId,
        `${SERVER_RECEIPT_PREFIX}${command.localCommandId}`,
        receipt,
        'stable-server-receipt'
      )
      const receiptReference = await sha256Hex(
        JSON.stringify(canonical(receipt))
      )
      await commands.markSynced(
        runtime.descriptor.namespaceId,
        command.localCommandId,
        receiptReference
      )
      results.push(receipt)
    } catch (error) {
      await commands.restorePendingAfterRetryableFailure(
        runtime.descriptor.namespaceId,
        command.localCommandId,
        error instanceof Error
          ? error.message.replace(/[^A-Z0-9_:-]/gi, '_').slice(0, 96)
          : 'RETRYABLE_SYNC_FAILURE'
      )
      break
    }
  }
  return { status: 'complete' as const, processed: results.length, results }
}

export function synchronizeOfflineOrderCreate() {
  if (!syncInFlight) {
    syncInFlight = synchronizeBoundedBatch().finally(() => {
      syncInFlight = null
    })
  }
  return syncInFlight
}

export function installOfflineReconnectSynchronization() {
  if (typeof window === 'undefined') return () => undefined
  const synchronize = () => void synchronizeOfflineOrderCreate().catch(() => undefined)
  window.addEventListener('online', synchronize)
  if (navigator.onLine) synchronize()
  return () => window.removeEventListener('online', synchronize)
}

'use client'

/**
 * Phase 1 is the only browser persistence boundary for future AFEX POS data.
 * The approved order.create pilot uses this as its only browser persistence
 * boundary. Runtime authority is still established by the server and a
 * non-extractable managed-device key; the employee PIN never unwraps the DEK.
 */

export const OFFLINE_DATABASE_NAME = 'afex-pos-local-v1'
export const OFFLINE_DATABASE_VERSION = 3
export const OFFLINE_SCHEMA_VERSION = 1
export const OFFLINE_MIN_READABLE_SCHEMA_VERSION = 1
export const OFFLINE_ENVELOPE_VERSION = 1
export const OFFLINE_KEY_ENVELOPE_VERSION = 1
export const OFFLINE_SCHEMA_GENERATION = 'g1'

export function createSecureUuidV4() {
  if (
    typeof crypto === 'undefined' ||
    typeof crypto.getRandomValues !== 'function'
  ) {
    throw new Error('OFFLINE_WEBCRYPTO_UNAVAILABLE')
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const OFFLINE_AUTHORITY_LEASE_POLICY = Object.freeze({
  readLeaseAbsoluteMs: 24 * 60 * 60 * 1_000,
  futureBusinessCommandLeaseAbsoluteMs: 2 * 60 * 60 * 1_000,
})

export const OFFLINE_MEDIA_POLICY = Object.freeze({
  maximumImages: 1_000,
  maximumBytes: 250 * 1024 * 1024,
})

export const OFFLINE_QUOTA_THRESHOLDS = Object.freeze({
  warningRatio: 0.7,
  hardStopRatio: 0.9,
})

export const OFFLINE_STORES = Object.freeze({
  meta: 'meta',
  keyEnvelopes: 'keyEnvelopes',
  drafts: 'drafts',
  quarantine: 'quarantine',
  purgeTombstones: 'purgeTombstones',
  datasetManifests: 'datasetManifests',
  catalog: 'catalog',
  customers: 'customers',
  orders: 'orders',
  invoices: 'invoices',
  events: 'events',
  runtimeSettings: 'runtimeSettings',
  mediaRefs: 'mediaRefs',
  commandOutbox: 'commandOutbox',
  commandDependencies: 'commandDependencies',
})

export const OFFLINE_PHASE1_STORES = Object.freeze([
  OFFLINE_STORES.meta,
  OFFLINE_STORES.keyEnvelopes,
  OFFLINE_STORES.drafts,
  OFFLINE_STORES.quarantine,
  OFFLINE_STORES.purgeTombstones,
] as const)

export const OFFLINE_DATASET_STORES = Object.freeze([
  OFFLINE_STORES.catalog,
  OFFLINE_STORES.customers,
  OFFLINE_STORES.orders,
  OFFLINE_STORES.invoices,
  OFFLINE_STORES.events,
  OFFLINE_STORES.runtimeSettings,
  OFFLINE_STORES.mediaRefs,
] as const)

export const OFFLINE_COMMAND_STORES = Object.freeze([
  OFFLINE_STORES.commandOutbox,
  OFFLINE_STORES.commandDependencies,
] as const)

export type OfflineStoreName =
  (typeof OFFLINE_STORES)[keyof typeof OFFLINE_STORES]

export type OfflineCapabilityFlags = {
  encryptedLocalStore: boolean
  legacyMigration: boolean
  logoutScopedPurge: boolean
  persistentUnwrapAuthority: boolean
  businessCommandDispatch: false
  serviceWorkerDataCache: false
}

function publicFlag(value: string | undefined, fallback: boolean) {
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

export const OFFLINE_CAPABILITIES: Readonly<OfflineCapabilityFlags> =
  Object.freeze({
    encryptedLocalStore: publicFlag(
      process.env.NEXT_PUBLIC_AFEX_OFFLINE_LOCAL_STORE,
      false
    ),
    legacyMigration: publicFlag(
      process.env.NEXT_PUBLIC_AFEX_OFFLINE_LEGACY_MIGRATION,
      false
    ),
    // Explicit user-initiated deletion is safe even while new persistence is off.
    logoutScopedPurge: publicFlag(
      process.env.NEXT_PUBLIC_AFEX_OFFLINE_LOGOUT_PURGE,
      true
    ),
    persistentUnwrapAuthority: true,
    businessCommandDispatch: false,
    serviceWorkerDataCache: false,
  })

export type OfflineErrorCode =
  | 'OFFLINE_API_UNAVAILABLE'
  | 'OFFLINE_AUTHORITY_UNAVAILABLE'
  | 'OFFLINE_CAPABILITY_DISABLED'
  | 'OFFLINE_CONTEXT_INVALID'
  | 'OFFLINE_CROSS_SCOPE_DENIED'
  | 'OFFLINE_DATABASE_BLOCKED'
  | 'OFFLINE_DATABASE_UNAVAILABLE'
  | 'OFFLINE_INTEGRITY_FAILED'
  | 'OFFLINE_KEY_LOCKED'
  | 'OFFLINE_LEGACY_BINDING_REQUIRED'
  | 'OFFLINE_LEGACY_CLEANUP_CONFIRMATION_REQUIRED'
  | 'OFFLINE_LEGACY_CLEANUP_FAILED'
  | 'OFFLINE_PURGE_FAILED_LOCKED'
  | 'OFFLINE_QUOTA_HARD_STOP'
  | 'OFFLINE_SCHEMA_CORRUPT'
  | 'OFFLINE_SCHEMA_UNSUPPORTED'
  | 'OFFLINE_SHELL_UNAVAILABLE'

export class OfflinePhase1Error extends Error {
  readonly code: OfflineErrorCode
  readonly retryable: boolean

  constructor(code: OfflineErrorCode, retryable = false) {
    super(code)
    this.name = 'OfflinePhase1Error'
    this.code = code
    this.retryable = retryable
  }
}

export function toOfflineSafeClassification(error: unknown) {
  return error instanceof OfflinePhase1Error
    ? error.code
    : 'OFFLINE_DATABASE_UNAVAILABLE'
}

export type VerifiedOfflineIdentity = {
  primarySubjectId: string
  tenantId: string
  branchId: string
  deviceCacheId: string
  schemaGeneration: string
  authoritySource: 'server-verified-auth-context'
  contextVersion: 1
}

export type OfflineNamespaceDescriptor = {
  namespaceId: string
  schemaGeneration: string
  schemaVersion: number
}

export type VerifiedOfflineContextResponse = {
  success: true
  context: {
    primarySubjectId: string
    tenantId: string
    branchId: string
    contextVersion: 1
    actorAuthority: 'active-pos-actor' | 'primary-auth-only'
  }
}

function requireOpaqueInput(value: string) {
  const normalized = value.trim()
  if (!normalized || normalized.length > 256) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  return normalized
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

function base64UrlToBytes(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(`${normalized}${padding}`)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function sha256Bytes(value: string | Uint8Array) {
  const bytes =
    typeof value === 'string' ? new TextEncoder().encode(value) : value
  const digestInput = Uint8Array.from(bytes).buffer
  return new Uint8Array(await crypto.subtle.digest('SHA-256', digestInput))
}

export async function sha256Base64Url(value: string | Uint8Array) {
  return bytesToBase64Url(await sha256Bytes(value))
}

export async function deriveOfflineNamespace(
  identity: VerifiedOfflineIdentity
): Promise<OfflineNamespaceDescriptor> {
  if (
    identity.authoritySource !== 'server-verified-auth-context' ||
    identity.contextVersion !== 1
  ) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }

  const canonicalIdentity = JSON.stringify({
    primarySubjectId: requireOpaqueInput(identity.primarySubjectId),
    tenantId: requireOpaqueInput(identity.tenantId),
    branchId: requireOpaqueInput(identity.branchId),
    deviceCacheId: requireOpaqueInput(identity.deviceCacheId),
    schemaGeneration: requireOpaqueInput(identity.schemaGeneration),
  })

  return {
    namespaceId: `ns_${await sha256Base64Url(canonicalIdentity)}`,
    schemaGeneration: identity.schemaGeneration,
    schemaVersion: OFFLINE_SCHEMA_VERSION,
  }
}

export type EncryptedRecordEnvelope = {
  algorithm: 'AES-GCM'
  envelopeVersion: 1
  keyVersion: number
  schemaVersion: number
  namespaceId: string
  storeName: OfflineStoreName
  recordKey: string
  nonce: string
  ciphertext: string
  aadDigest: string
}

function recordAdditionalData(input: {
  namespaceId: string
  storeName: OfflineStoreName
  recordKey: string
  schemaVersion: number
  envelopeVersion: number
}) {
  return new TextEncoder().encode(
    JSON.stringify({
      namespaceId: input.namespaceId,
      storeName: input.storeName,
      recordKey: input.recordKey,
      schemaVersion: input.schemaVersion,
      envelopeVersion: input.envelopeVersion,
    })
  )
}

function assertCryptoKey(key: CryptoKey) {
  if (
    key.type !== 'secret' ||
    key.extractable ||
    key.algorithm.name !== 'AES-GCM' ||
    !key.usages.includes('encrypt') ||
    !key.usages.includes('decrypt')
  ) {
    throw new OfflinePhase1Error('OFFLINE_AUTHORITY_UNAVAILABLE')
  }
}

export async function encryptOfflineRecord(params: {
  key: CryptoKey
  keyVersion: number
  namespaceId: string
  storeName: OfflineStoreName
  recordKey: string
  value: unknown
}): Promise<EncryptedRecordEnvelope> {
  assertCryptoKey(params.key)
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const additionalData = recordAdditionalData({
    namespaceId: params.namespaceId,
    storeName: params.storeName,
    recordKey: params.recordKey,
    schemaVersion: OFFLINE_SCHEMA_VERSION,
    envelopeVersion: OFFLINE_ENVELOPE_VERSION,
  })
  const plaintext = new TextEncoder().encode(JSON.stringify(params.value))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData, tagLength: 128 },
    params.key,
    plaintext
  )

  return {
    algorithm: 'AES-GCM',
    envelopeVersion: OFFLINE_ENVELOPE_VERSION,
    keyVersion: params.keyVersion,
    schemaVersion: OFFLINE_SCHEMA_VERSION,
    namespaceId: params.namespaceId,
    storeName: params.storeName,
    recordKey: params.recordKey,
    nonce: bytesToBase64Url(nonce),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    aadDigest: await sha256Base64Url(additionalData),
  }
}

export async function decryptOfflineRecord<T>(params: {
  key: CryptoKey
  namespaceId: string
  storeName: OfflineStoreName
  recordKey: string
  envelope: EncryptedRecordEnvelope
}): Promise<T> {
  assertCryptoKey(params.key)
  const envelope = params.envelope
  if (
    envelope.algorithm !== 'AES-GCM' ||
    envelope.envelopeVersion !== OFFLINE_ENVELOPE_VERSION ||
    envelope.schemaVersion < OFFLINE_MIN_READABLE_SCHEMA_VERSION ||
    envelope.schemaVersion > OFFLINE_SCHEMA_VERSION ||
    envelope.namespaceId !== params.namespaceId ||
    envelope.storeName !== params.storeName ||
    envelope.recordKey !== params.recordKey
  ) {
    throw new OfflinePhase1Error('OFFLINE_INTEGRITY_FAILED')
  }

  const additionalData = recordAdditionalData({
    namespaceId: envelope.namespaceId,
    storeName: envelope.storeName,
    recordKey: envelope.recordKey,
    schemaVersion: envelope.schemaVersion,
    envelopeVersion: envelope.envelopeVersion,
  })
  if ((await sha256Base64Url(additionalData)) !== envelope.aadDigest) {
    throw new OfflinePhase1Error('OFFLINE_INTEGRITY_FAILED')
  }

  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64UrlToBytes(envelope.nonce),
        additionalData,
        tagLength: 128,
      },
      params.key,
      base64UrlToBytes(envelope.ciphertext)
    )
    return JSON.parse(new TextDecoder().decode(plaintext)) as T
  } catch {
    throw new OfflinePhase1Error('OFFLINE_INTEGRITY_FAILED')
  }
}

export type StoredKeyEnvelopeMetadata = {
  id: string
  namespaceId: string
  keyVersion: number
  envelopeVersion: number
  wrappingAlgorithm: 'AES-KW' | 'RSA-OAEP-3072-SHA256'
  wrappedKey: string
  authority: 'synthetic-test' | 'reviewed-runtime'
  createdAt: string
}

export type SyntheticNamespaceKeyMaterial = {
  key: CryptoKey
  envelope: StoredKeyEnvelopeMetadata
}

export async function createSyntheticNamespaceKeyMaterial(
  namespaceId: string,
  keyVersion = 1
): Promise<SyntheticNamespaceKeyMaterial> {
  if (process.env.NODE_ENV === 'production') {
    throw new OfflinePhase1Error('OFFLINE_AUTHORITY_UNAVAILABLE')
  }

  const wrappingKey = await crypto.subtle.generateKey(
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  )
  const wrappableKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
  const wrappedKey = await crypto.subtle.wrapKey(
    'raw',
    wrappableKey,
    wrappingKey,
    'AES-KW'
  )
  const key = await crypto.subtle.unwrapKey(
    'raw',
    wrappedKey,
    wrappingKey,
    'AES-KW',
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )

  return {
    key,
    envelope: {
      id: `${namespaceId}:key:${keyVersion}`,
      namespaceId,
      keyVersion,
      envelopeVersion: OFFLINE_KEY_ENVELOPE_VERSION,
      wrappingAlgorithm: 'AES-KW',
      wrappedKey: bytesToBase64Url(new Uint8Array(wrappedKey)),
      authority: 'synthetic-test',
      createdAt: new Date().toISOString(),
    },
  }
}

export type OfflineUnlockAuthority = {
  source: 'synthetic-test' | 'reviewed-runtime'
  primaryAuthenticated: boolean
  posActorAuthorized: boolean
  prePinProvisioningAuthorized?: boolean
  namespaceId: string
  keyVersion: number
  key: CryptoKey
}

type LockedState = {
  status: 'locked'
  reason: string
  namespaceId: string | null
}

type UnlockedState = {
  status: 'unlocked'
  namespaceId: string
  keyVersion: number
}

export type OfflineLockState = LockedState | UnlockedState

export class OfflineKeyManager {
  private state: OfflineLockState = {
    status: 'locked',
    reason: 'initial',
    namespaceId: null,
  }
  private key: CryptoKey | null = null
  private listeners = new Set<(state: OfflineLockState) => void>()

  getState() {
    return { ...this.state }
  }

  subscribe(listener: (state: OfflineLockState) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  unlock(authority: OfflineUnlockAuthority) {
    if (
      !authority.primaryAuthenticated ||
      (!authority.posActorAuthorized && !authority.prePinProvisioningAuthorized)
    ) {
      this.lock('authority-denied', authority.namespaceId)
      throw new OfflinePhase1Error('OFFLINE_AUTHORITY_UNAVAILABLE')
    }
    if (
      authority.source === 'reviewed-runtime' &&
      !OFFLINE_CAPABILITIES.persistentUnwrapAuthority
    ) {
      this.lock('runtime-unwrap-unavailable', authority.namespaceId)
      throw new OfflinePhase1Error('OFFLINE_AUTHORITY_UNAVAILABLE')
    }
    if (
      authority.source === 'synthetic-test' &&
      process.env.NODE_ENV === 'production'
    ) {
      this.lock('synthetic-authority-denied', authority.namespaceId)
      throw new OfflinePhase1Error('OFFLINE_AUTHORITY_UNAVAILABLE')
    }
    assertCryptoKey(authority.key)
    this.key = authority.key
    this.state = {
      status: 'unlocked',
      namespaceId: authority.namespaceId,
      keyVersion: authority.keyVersion,
    }
    this.emit()
  }

  requireKey(namespaceId: string) {
    if (
      this.state.status !== 'unlocked' ||
      this.state.namespaceId !== namespaceId ||
      !this.key
    ) {
      throw new OfflinePhase1Error('OFFLINE_KEY_LOCKED')
    }
    return { key: this.key, keyVersion: this.state.keyVersion }
  }

  lock(reason: string, namespaceId: string | null = null) {
    this.key = null
    this.state = { status: 'locked', reason, namespaceId }
    this.emit()
  }

  private emit() {
    for (const listener of this.listeners) listener(this.getState())
  }
}

export const offlineKeyManager = new OfflineKeyManager()

type CoordinationMessage = {
  version: 1
  eventId: string
  action: 'lock' | 'purge'
  namespaceId: string | null
  reason: string
}

const OFFLINE_COORDINATION_CHANNEL = 'afex-pos-offline-control-v1'
const OFFLINE_BOOTSTRAP_READY_MARKER = 'afex_pos_offline_bootstrap_ready_v1'

export function markOfflineBootstrapReady() {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(OFFLINE_BOOTSTRAP_READY_MARKER, 'ready')
  }
}

export function clearOfflineBootstrapReady() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(OFFLINE_BOOTSTRAP_READY_MARKER)
  }
}

export function hasOfflineBootstrapReadyMarker() {
  return (
    typeof window !== 'undefined' &&
    window.localStorage.getItem(OFFLINE_BOOTSTRAP_READY_MARKER) === 'ready'
  )
}
class OfflineTabCoordinator {
  private channel: BroadcastChannel | null = null
  private started = false

  start() {
    if (this.started || typeof window === 'undefined') return
    this.started = true
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(OFFLINE_COORDINATION_CHANNEL)
      this.channel.addEventListener('message', (event: MessageEvent<unknown>) =>
        this.receive(event.data)
      )
      return
    }
    navigator.serviceWorker?.addEventListener('message', this.handleWorkerMessage)
  }

  broadcast(message: Omit<CoordinationMessage, 'version' | 'eventId'>) {
    this.start()
    const payload: CoordinationMessage = {
      ...message,
      version: 1,
      eventId: createSecureUuidV4(),
    }
    if (this.channel) {
      this.channel.postMessage(payload)
      return
    }
    navigator.serviceWorker?.controller?.postMessage({
      type: 'AFEX_OFFLINE_COORDINATION_V1',
      payload,
    })
  }

  private handleWorkerMessage = (event: MessageEvent<unknown>) => {
    const message = event.data as { type?: unknown; payload?: unknown } | null
    if (message?.type !== 'AFEX_OFFLINE_COORDINATION_V1') return
    this.receive(message.payload)
  }

  private receive(value: unknown) {
    if (!value || typeof value !== 'object') return
    const message = value as Partial<CoordinationMessage>
    if (
      message.version !== 1 ||
      (message.action !== 'lock' && message.action !== 'purge') ||
      typeof message.reason !== 'string'
    ) {
      offlineKeyManager.lock('coordination-integrity-failure')
      return
    }
    offlineKeyManager.lock(
      message.action === 'purge' ? 'remote-purge' : message.reason,
      typeof message.namespaceId === 'string' ? message.namespaceId : null
    )
  }
}

const offlineTabCoordinator = new OfflineTabCoordinator()

export function lockOfflineRuntime(
  reason: string,
  namespaceId: string | null = null,
  broadcast = true
) {
  offlineKeyManager.lock(reason, namespaceId)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('afex:offline-runtime-locked'))
  }
  if (broadcast && typeof window !== 'undefined') {
    offlineTabCoordinator.broadcast({
      action: reason.includes('purge') ? 'purge' : 'lock',
      namespaceId,
      reason,
    })
  }
}

export type PosSessionLifecycleDependencies = {
  revokePosActor: () => Promise<void>
  clearEmployeePresentation: () => void
  clearPlaintextCaches: () => void
}

export async function executePosEmployeeSwitchLifecycle(
  dependencies: PosSessionLifecycleDependencies
) {
  lockOfflineRuntime('employee-switch')
  await dependencies.revokePosActor()
  dependencies.clearEmployeePresentation()
  dependencies.clearPlaintextCaches()
  return { intent: 'switch' as const, primaryAuthRetained: true }
}

export async function executeFullPosLogoutLifecycle(
  dependencies: PosSessionLifecycleDependencies & {
    signOutPrimary: () => Promise<void>
    markPrimaryLoggedOut: () => void
  }
) {
  lockOfflineRuntime('logout-start')
  clearOfflineBootstrapReady()
  await markOfflineRuntimeAccessLoggedOut().catch(() => undefined)
  await dependencies.revokePosActor()
  await dependencies.signOutPrimary()
  dependencies.clearEmployeePresentation()
  dependencies.clearPlaintextCaches()
  dependencies.markPrimaryLoggedOut()
  return { intent: 'logout' as const, primaryAuthRetained: false }
}

type OfflineStoredRecord = {
  id: string
  namespaceId: string
  recordKey: string
  envelope: EncryptedRecordEnvelope
  classification: string
  createdAt: string
  updatedAt: string
}

type OfflineMetaRecord = {
  id: string
  kind: string
  value?: string | number
  material?: unknown
  namespaceId?: string
  expiresAt?: number
  ownerId?: string
  schemaVersion: number
  updatedAt: string
}

export type OfflineRuntimeMaterialRecord<T = unknown> = Readonly<{
  id: string
  kind: string
  namespaceId: string
  material: T
  schemaVersion: number
  updatedAt: string
}>

export const OFFLINE_RUNTIME_ACCESS_STATE_ID =
  'afex-offline-runtime-access-state-v1' as const

export type OfflineRuntimeAccessState = Readonly<{
  version: 1
  runtimeMaterialId: string
  namespaceId: string
  loggedOut: boolean
  updatedAt: string
}>

/**
 * Stores structured-cloneable runtime key material (including non-extractable
 * CryptoKey handles) in IndexedDB. Values never pass through JSON, logs, Cache
 * Storage, or browser storage APIs that expose plaintext strings.
 */
export async function putOfflineRuntimeMaterial<T>(
  record: OfflineRuntimeMaterialRecord<T>,
  databaseName = OFFLINE_DATABASE_NAME
) {
  const database = await openOfflineDatabase(databaseName)
  try {
    const transaction = database.transaction(OFFLINE_STORES.meta, 'readwrite')
    transaction.objectStore(OFFLINE_STORES.meta).put(record)
    await transactionAsPromise(transaction)
  } finally {
    database.close()
  }
}

export async function readOfflineRuntimeMaterial<T>(
  id: string,
  databaseName = OFFLINE_DATABASE_NAME
) {
  const database = await openOfflineDatabase(databaseName)
  try {
    const transaction = database.transaction(OFFLINE_STORES.meta, 'readonly')
    const record = (await requestAsPromise(
      transaction.objectStore(OFFLINE_STORES.meta).get(requireOpaqueInput(id))
    )) as OfflineRuntimeMaterialRecord<T> | undefined
    await transactionAsPromise(transaction)
    return record ?? null
  } finally {
    database.close()
  }
}

export async function deleteOfflineRuntimeMaterial(
  id: string,
  databaseName = OFFLINE_DATABASE_NAME
) {
  const database = await openOfflineDatabase(databaseName)
  try {
    const transaction = database.transaction(OFFLINE_STORES.meta, 'readwrite')
    transaction.objectStore(OFFLINE_STORES.meta).delete(requireOpaqueInput(id))
    await transactionAsPromise(transaction)
  } finally {
    database.close()
  }
}

export async function putOfflineRuntimeAccessState(
  state: OfflineRuntimeAccessState,
  databaseName = OFFLINE_DATABASE_NAME
) {
  await putOfflineRuntimeMaterial(
    {
      id: OFFLINE_RUNTIME_ACCESS_STATE_ID,
      kind: 'offline-runtime-access-state',
      namespaceId: state.namespaceId,
      material: state,
      schemaVersion: OFFLINE_SCHEMA_VERSION,
      updatedAt: state.updatedAt,
    },
    databaseName
  )
}

export async function readOfflineRuntimeAccessState(
  databaseName = OFFLINE_DATABASE_NAME
) {
  const record = await readOfflineRuntimeMaterial<OfflineRuntimeAccessState>(
    OFFLINE_RUNTIME_ACCESS_STATE_ID,
    databaseName
  )
  return record?.material ?? null
}

export async function markOfflineRuntimeAccessLoggedOut(
  databaseName = OFFLINE_DATABASE_NAME
) {
  const current = await readOfflineRuntimeAccessState(databaseName)
  if (!current) return
  await putOfflineRuntimeAccessState(
    {
      ...current,
      loggedOut: true,
      updatedAt: new Date().toISOString(),
    },
    databaseName
  )
}

export type PurgeTombstoneRecord = {
  id: string
  namespaceId: string
  bindingDigest: string
  state: 'pending' | 'purging' | 'purge_failed_locked' | 'complete'
  step: string
  classification: string | null
  createdAt: string
  updatedAt: string
}

function requestAsPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), {
      once: true,
    })
    request.addEventListener(
      'error',
      () =>
        reject(
          new OfflinePhase1Error(
            request.error?.name === 'QuotaExceededError'
              ? 'OFFLINE_QUOTA_HARD_STOP'
              : 'OFFLINE_DATABASE_UNAVAILABLE',
            request.error?.name !== 'QuotaExceededError'
          )
        ),
      { once: true }
    )
  })
}

function transactionAsPromise(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true })
    transaction.addEventListener(
      'abort',
      () =>
        reject(
          new OfflinePhase1Error(
            transaction.error?.name === 'QuotaExceededError'
              ? 'OFFLINE_QUOTA_HARD_STOP'
              : 'OFFLINE_DATABASE_UNAVAILABLE',
            transaction.error?.name !== 'QuotaExceededError'
          )
        ),
      { once: true }
    )
    transaction.addEventListener(
      'error',
      () =>
        reject(
          new OfflinePhase1Error(
            transaction.error?.name === 'QuotaExceededError'
              ? 'OFFLINE_QUOTA_HARD_STOP'
              : 'OFFLINE_DATABASE_UNAVAILABLE',
            transaction.error?.name !== 'QuotaExceededError'
          )
        ),
      { once: true }
    )
  })
}

function createNamespacedStore(database: IDBDatabase, name: string) {
  const store = database.createObjectStore(name, { keyPath: 'id' })
  store.createIndex('namespaceId', 'namespaceId', { unique: false })
}

function createDatasetManifestStore(database: IDBDatabase) {
  const store = database.createObjectStore(OFFLINE_STORES.datasetManifests, {
    keyPath: 'id',
  })
  store.createIndex('namespaceId', 'namespaceId', { unique: false })
  store.createIndex(
    'namespaceDatasetStatus',
    ['namespaceId', 'datasetId', 'status'],
    { unique: false }
  )
  store.createIndex(
    'namespaceDatasetConfirmedAt',
    ['namespaceId', 'datasetId', 'confirmedAtServer'],
    { unique: false }
  )
}

function createDatasetRecordStore(database: IDBDatabase, name: string) {
  const store = database.createObjectStore(name, { keyPath: 'id' })
  store.createIndex('namespaceId', 'namespaceId', { unique: false })
  store.createIndex(
    'namespaceSnapshot',
    ['namespaceId', 'snapshotVersion'],
    { unique: false }
  )
  store.createIndex(
    'namespaceSnapshotRecord',
    ['namespaceId', 'snapshotVersion', 'recordKey'],
    { unique: true }
  )
}

function createCommandOutboxStore(database: IDBDatabase) {
  const store = database.createObjectStore(OFFLINE_STORES.commandOutbox, {
    keyPath: 'id',
  })
  store.createIndex('namespaceId', 'namespaceId', { unique: false })
  store.createIndex('localCommandId', 'localCommandId', { unique: true })
  store.createIndex('namespaceState', ['namespaceId', 'state'], {
    unique: false,
  })
  store.createIndex('namespaceSequence', ['namespaceId', 'localSequence'], {
    unique: true,
  })
  store.createIndex(
    'namespaceIdempotency',
    ['namespaceId', 'idempotencyKey'],
    { unique: true }
  )
  store.createIndex(
    'namespaceStateCreatedAt',
    ['namespaceId', 'state', 'createdAtLocal'],
    { unique: false }
  )
}

function createCommandDependencyStore(database: IDBDatabase) {
  const store = database.createObjectStore(OFFLINE_STORES.commandDependencies, {
    keyPath: 'id',
  })
  store.createIndex('namespaceId', 'namespaceId', { unique: false })
  store.createIndex('namespaceCommand', ['namespaceId', 'commandId'], {
    unique: false,
  })
  store.createIndex('namespaceDependency', ['namespaceId', 'dependencyId'], {
    unique: false,
  })
  store.createIndex(
    'namespaceCommandDependency',
    ['namespaceId', 'commandId', 'dependencyId'],
    { unique: true }
  )
}

type OfflineIndexSchemaRequirement = Readonly<{
  name: string
  keyPath: string | readonly string[]
  unique: boolean
}>

type OfflineStoreSchemaRequirement = Readonly<{
  name: OfflineStoreName
  keyPath: string
  indexes: readonly OfflineIndexSchemaRequirement[]
}>

const NAMESPACE_INDEX_REQUIREMENT = Object.freeze({
  name: 'namespaceId',
  keyPath: 'namespaceId',
  unique: false,
}) satisfies OfflineIndexSchemaRequirement

const PHASE1_SCHEMA_REQUIREMENTS = Object.freeze([
  Object.freeze({ name: OFFLINE_STORES.meta, keyPath: 'id', indexes: [] }),
  ...[
    OFFLINE_STORES.keyEnvelopes,
    OFFLINE_STORES.drafts,
    OFFLINE_STORES.quarantine,
    OFFLINE_STORES.purgeTombstones,
  ].map((name) =>
    Object.freeze({
      name,
      keyPath: 'id',
      indexes: Object.freeze([NAMESPACE_INDEX_REQUIREMENT]),
    })
  ),
] satisfies readonly OfflineStoreSchemaRequirement[])

const PHASE2_SCHEMA_REQUIREMENTS = Object.freeze([
  Object.freeze({
    name: OFFLINE_STORES.datasetManifests,
    keyPath: 'id',
    indexes: Object.freeze([
      NAMESPACE_INDEX_REQUIREMENT,
      Object.freeze({
        name: 'namespaceDatasetStatus',
        keyPath: Object.freeze(['namespaceId', 'datasetId', 'status']),
        unique: false,
      }),
      Object.freeze({
        name: 'namespaceDatasetConfirmedAt',
        keyPath: Object.freeze([
          'namespaceId',
          'datasetId',
          'confirmedAtServer',
        ]),
        unique: false,
      }),
    ]),
  }),
  ...OFFLINE_DATASET_STORES.map((name) =>
    Object.freeze({
      name,
      keyPath: 'id',
      indexes: Object.freeze([
        NAMESPACE_INDEX_REQUIREMENT,
        Object.freeze({
          name: 'namespaceSnapshot',
          keyPath: Object.freeze(['namespaceId', 'snapshotVersion']),
          unique: false,
        }),
        Object.freeze({
          name: 'namespaceSnapshotRecord',
          keyPath: Object.freeze([
            'namespaceId',
            'snapshotVersion',
            'recordKey',
          ]),
          unique: true,
        }),
      ]),
    })
  ),
] satisfies readonly OfflineStoreSchemaRequirement[])

const PHASE3_SCHEMA_REQUIREMENTS = Object.freeze([
  Object.freeze({
    name: OFFLINE_STORES.commandOutbox,
    keyPath: 'id',
    indexes: Object.freeze([
      NAMESPACE_INDEX_REQUIREMENT,
      Object.freeze({
        name: 'localCommandId',
        keyPath: 'localCommandId',
        unique: true,
      }),
      Object.freeze({
        name: 'namespaceState',
        keyPath: Object.freeze(['namespaceId', 'state']),
        unique: false,
      }),
      Object.freeze({
        name: 'namespaceSequence',
        keyPath: Object.freeze(['namespaceId', 'localSequence']),
        unique: true,
      }),
      Object.freeze({
        name: 'namespaceIdempotency',
        keyPath: Object.freeze(['namespaceId', 'idempotencyKey']),
        unique: true,
      }),
      Object.freeze({
        name: 'namespaceStateCreatedAt',
        keyPath: Object.freeze(['namespaceId', 'state', 'createdAtLocal']),
        unique: false,
      }),
    ]),
  }),
  Object.freeze({
    name: OFFLINE_STORES.commandDependencies,
    keyPath: 'id',
    indexes: Object.freeze([
      NAMESPACE_INDEX_REQUIREMENT,
      Object.freeze({
        name: 'namespaceCommand',
        keyPath: Object.freeze(['namespaceId', 'commandId']),
        unique: false,
      }),
      Object.freeze({
        name: 'namespaceDependency',
        keyPath: Object.freeze(['namespaceId', 'dependencyId']),
        unique: false,
      }),
      Object.freeze({
        name: 'namespaceCommandDependency',
        keyPath: Object.freeze([
          'namespaceId',
          'commandId',
          'dependencyId',
        ]),
        unique: true,
      }),
    ]),
  }),
] satisfies readonly OfflineStoreSchemaRequirement[])

const CURRENT_SCHEMA_REQUIREMENTS = Object.freeze([
  ...PHASE1_SCHEMA_REQUIREMENTS,
  ...PHASE2_SCHEMA_REQUIREMENTS,
  ...PHASE3_SCHEMA_REQUIREMENTS,
])

function keyPathMatches(
  actual: string | string[] | null,
  expected: string | readonly string[]
) {
  if (typeof expected === 'string') return actual === expected
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  )
}

function storeMatchesSchema(
  store: IDBObjectStore,
  requirement: OfflineStoreSchemaRequirement
) {
  if (
    !keyPathMatches(store.keyPath, requirement.keyPath) ||
    store.autoIncrement
  ) {
    return false
  }
  for (const expectedIndex of requirement.indexes) {
    if (!store.indexNames.contains(expectedIndex.name)) return false
    const index = store.index(expectedIndex.name)
    if (
      !keyPathMatches(index.keyPath, expectedIndex.keyPath) ||
      index.unique !== expectedIndex.unique
    ) {
      return false
    }
  }
  return true
}

function transactionSchemaIsComplete(
  transaction: IDBTransaction,
  requirements: readonly OfflineStoreSchemaRequirement[]
) {
  return requirements.every((requirement) => {
    try {
      return storeMatchesSchema(
        transaction.objectStore(requirement.name),
        requirement
      )
    } catch {
      return false
    }
  })
}

function databaseSchemaIsComplete(
  database: IDBDatabase,
  requirements: readonly OfflineStoreSchemaRequirement[]
) {
  if (
    requirements.some(
      (requirement) => !database.objectStoreNames.contains(requirement.name)
    )
  ) {
    return false
  }
  try {
    return transactionSchemaIsComplete(
      database.transaction(
        requirements.map((requirement) => requirement.name),
        'readonly'
      ),
      requirements
    )
  } catch {
    return false
  }
}

function assertExistingStoresMatch(
  database: IDBDatabase,
  transaction: IDBTransaction,
  requirements: readonly OfflineStoreSchemaRequirement[]
) {
  for (const requirement of requirements) {
    if (
      database.objectStoreNames.contains(requirement.name) &&
      !storeMatchesSchema(transaction.objectStore(requirement.name), requirement)
    ) {
      throw new OfflinePhase1Error('OFFLINE_SCHEMA_CORRUPT')
    }
  }
}

export async function openOfflineDatabase(
  databaseName = OFFLINE_DATABASE_NAME
) {
  if (typeof indexedDB === 'undefined') {
    throw new OfflinePhase1Error('OFFLINE_API_UNAVAILABLE')
  }

  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, OFFLINE_DATABASE_VERSION)
    let upgradeFailure: 'corrupt' | 'unsupported' | null = null
    request.addEventListener('upgradeneeded', (event) => {
      const database = request.result
      const transaction = request.transaction
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion
      if (!transaction || ![0, 1, 2].includes(oldVersion)) {
        upgradeFailure = 'unsupported'
        request.transaction?.abort()
        return
      }
      try {
        if (
          oldVersion >= 1 &&
          !transactionSchemaIsComplete(transaction, PHASE1_SCHEMA_REQUIREMENTS)
        ) {
          throw new OfflinePhase1Error('OFFLINE_SCHEMA_CORRUPT')
        }
        if (
          oldVersion === 2 &&
          !transactionSchemaIsComplete(transaction, PHASE2_SCHEMA_REQUIREMENTS)
        ) {
          throw new OfflinePhase1Error('OFFLINE_SCHEMA_CORRUPT')
        }

        if (oldVersion === 0) {
          database.createObjectStore(OFFLINE_STORES.meta, { keyPath: 'id' })
          for (const storeName of [
            OFFLINE_STORES.keyEnvelopes,
            OFFLINE_STORES.drafts,
            OFFLINE_STORES.quarantine,
            OFFLINE_STORES.purgeTombstones,
          ]) {
            createNamespacedStore(database, storeName)
          }
        }

        if (oldVersion <= 1) {
          assertExistingStoresMatch(
            database,
            transaction,
            PHASE2_SCHEMA_REQUIREMENTS
          )
          if (
            !database.objectStoreNames.contains(OFFLINE_STORES.datasetManifests)
          ) {
            createDatasetManifestStore(database)
          }
          for (const storeName of OFFLINE_DATASET_STORES) {
            if (!database.objectStoreNames.contains(storeName)) {
              createDatasetRecordStore(database, storeName)
            }
          }
        }

        assertExistingStoresMatch(
          database,
          transaction,
          PHASE3_SCHEMA_REQUIREMENTS
        )
        if (!database.objectStoreNames.contains(OFFLINE_STORES.commandOutbox)) {
          createCommandOutboxStore(database)
        }
        if (
          !database.objectStoreNames.contains(OFFLINE_STORES.commandDependencies)
        ) {
          createCommandDependencyStore(database)
        }
      } catch (error) {
        upgradeFailure =
          error instanceof OfflinePhase1Error &&
          error.code === 'OFFLINE_SCHEMA_UNSUPPORTED'
            ? 'unsupported'
            : 'corrupt'
        transaction.abort()
      }
    })
    request.addEventListener('blocked', () => {
      reject(new OfflinePhase1Error('OFFLINE_DATABASE_BLOCKED', true))
    })
    request.addEventListener('error', () => {
      const isVersionError = request.error?.name === 'VersionError'
      reject(
        new OfflinePhase1Error(
          upgradeFailure === 'corrupt'
            ? 'OFFLINE_SCHEMA_CORRUPT'
            : isVersionError || upgradeFailure === 'unsupported'
              ? 'OFFLINE_SCHEMA_UNSUPPORTED'
              : 'OFFLINE_DATABASE_UNAVAILABLE',
          !isVersionError && upgradeFailure === null
        )
      )
    })
    request.addEventListener('success', () => resolve(request.result))
  })

  if (!databaseSchemaIsComplete(database, CURRENT_SCHEMA_REQUIREMENTS)) {
    database.close()
    throw new OfflinePhase1Error('OFFLINE_SCHEMA_CORRUPT')
  }
  if (
    database.version < OFFLINE_MIN_READABLE_SCHEMA_VERSION ||
    database.version > OFFLINE_DATABASE_VERSION
  ) {
    database.close()
    throw new OfflinePhase1Error('OFFLINE_SCHEMA_UNSUPPORTED')
  }

  const transaction = database.transaction(OFFLINE_STORES.meta, 'readwrite')
  transaction.objectStore(OFFLINE_STORES.meta).put({
    id: 'schema',
    kind: 'schema',
    value: OFFLINE_DATABASE_VERSION,
    schemaVersion: OFFLINE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  } satisfies OfflineMetaRecord)
  await transactionAsPromise(transaction)
  return database
}

export async function getOrCreateDeviceCacheId(
  databaseName = OFFLINE_DATABASE_NAME
) {
  const database = await openOfflineDatabase(databaseName)
  try {
    const transaction = database.transaction(OFFLINE_STORES.meta, 'readwrite')
    const store = transaction.objectStore(OFFLINE_STORES.meta)
    const existing = (await requestAsPromise(
      store.get('device-cache-id')
    )) as OfflineMetaRecord | undefined
    if (typeof existing?.value === 'string' && existing.value) {
      await transactionAsPromise(transaction)
      return existing.value
    }
    const deviceCacheId = createSecureUuidV4()
    store.put({
      id: 'device-cache-id',
      kind: 'device-cache-id',
      value: deviceCacheId,
      schemaVersion: OFFLINE_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    } satisfies OfflineMetaRecord)
    await transactionAsPromise(transaction)
    return deviceCacheId
  } finally {
    database.close()
  }
}

async function getAllByNamespace<T>(
  store: IDBObjectStore,
  namespaceId: string
): Promise<T[]> {
  return requestAsPromise(
    store.index('namespaceId').getAll(IDBKeyRange.only(namespaceId))
  ) as Promise<T[]>
}

async function deleteAllByNamespace(
  store: IDBObjectStore,
  namespaceId: string
) {
  const keys = await requestAsPromise(
    store.index('namespaceId').getAllKeys(IDBKeyRange.only(namespaceId))
  )
  for (const key of keys) store.delete(key)
}

async function acquireNamespaceLease(
  database: IDBDatabase,
  namespaceId: string,
  resource: 'purge'
) {
  const ownerId = createSecureUuidV4()
  const leaseId = `lease:${namespaceId}:${resource}`
  const transaction = database.transaction(OFFLINE_STORES.meta, 'readwrite')
  const store = transaction.objectStore(OFFLINE_STORES.meta)
  const existing = (await requestAsPromise(
    store.get(leaseId)
  )) as OfflineMetaRecord | undefined
  if (
    existing?.kind === 'coordination-lease' &&
    typeof existing.expiresAt === 'number' &&
    existing.expiresAt > Date.now()
  ) {
    transaction.abort()
    throw new OfflinePhase1Error('OFFLINE_DATABASE_BLOCKED', true)
  }
  store.put({
    id: leaseId,
    kind: 'coordination-lease',
    namespaceId,
    ownerId,
    expiresAt: Date.now() + 30_000,
    schemaVersion: OFFLINE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  } satisfies OfflineMetaRecord)
  await transactionAsPromise(transaction)
  return { leaseId, ownerId }
}

async function releaseNamespaceLease(
  database: IDBDatabase,
  lease: { leaseId: string; ownerId: string }
) {
  const transaction = database.transaction(OFFLINE_STORES.meta, 'readwrite')
  const store = transaction.objectStore(OFFLINE_STORES.meta)
  const existing = (await requestAsPromise(
    store.get(lease.leaseId)
  )) as OfflineMetaRecord | undefined
  if (existing?.ownerId === lease.ownerId) store.delete(lease.leaseId)
  await transactionAsPromise(transaction)
}

export class EncryptedOfflineRepository {
  readonly databaseName: string
  readonly allowPersistentWrites: boolean
  readonly keyManager: OfflineKeyManager

  constructor(options?: {
    databaseName?: string
    allowPersistentWrites?: boolean
    keyManager?: OfflineKeyManager
  }) {
    this.databaseName = options?.databaseName ?? OFFLINE_DATABASE_NAME
    this.allowPersistentWrites = options?.allowPersistentWrites ?? false
    this.keyManager = options?.keyManager ?? offlineKeyManager
  }

  async initialize() {
    const database = await openOfflineDatabase(this.databaseName)
    database.close()
  }

  async putKeyEnvelope(metadata: StoredKeyEnvelopeMetadata) {
    this.assertWritesEnabled()
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(
        OFFLINE_STORES.keyEnvelopes,
        'readwrite'
      )
      transaction.objectStore(OFFLINE_STORES.keyEnvelopes).put(metadata)
      await transactionAsPromise(transaction)
    } finally {
      database.close()
    }
  }

  async putEncryptedDraft(
    namespaceId: string,
    recordKey: string,
    value: unknown,
    classification = 'draft'
  ) {
    return this.putEncryptedRecord(
      OFFLINE_STORES.drafts,
      namespaceId,
      recordKey,
      value,
      classification
    )
  }

  async putEncryptedDraftIfAbsent(
    namespaceId: string,
    recordKey: string,
    value: unknown,
    classification = 'draft'
  ) {
    this.assertWritesEnabled()
    const { key, keyVersion } = this.keyManager.requireKey(namespaceId)
    const envelope = await encryptOfflineRecord({
      key,
      keyVersion,
      namespaceId,
      storeName: OFFLINE_STORES.drafts,
      recordKey,
      value,
    })
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(OFFLINE_STORES.drafts, 'readwrite')
      const now = new Date().toISOString()
      const request = transaction.objectStore(OFFLINE_STORES.drafts).add({
        id: `${namespaceId}:${recordKey}`,
        namespaceId,
        recordKey,
        envelope,
        classification,
        createdAt: now,
        updatedAt: now,
      } satisfies OfflineStoredRecord)
      const created = await new Promise<boolean>((resolve, reject) => {
        request.addEventListener('success', () => resolve(true), { once: true })
        request.addEventListener(
          'error',
          (event) => {
            if (request.error?.name === 'ConstraintError') {
              event.preventDefault()
              event.stopPropagation()
              resolve(false)
              return
            }
            reject(
              new OfflinePhase1Error(
                request.error?.name === 'QuotaExceededError'
                  ? 'OFFLINE_QUOTA_HARD_STOP'
                  : 'OFFLINE_DATABASE_UNAVAILABLE',
                request.error?.name !== 'QuotaExceededError'
              )
            )
          },
          { once: true }
        )
      })
      await transactionAsPromise(transaction)
      return created
    } finally {
      database.close()
    }
  }

  async putEncryptedDraftBatch(
    namespaceId: string,
    records: readonly Readonly<{
      recordKey: string
      value: unknown
      classification?: string
    }>[]
  ) {
    this.assertWritesEnabled()
    if (records.length < 1 || new Set(records.map((record) => record.recordKey)).size !== records.length) {
      throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
    }
    const { key, keyVersion } = this.keyManager.requireKey(namespaceId)
    const encrypted = await Promise.all(
      records.map(async (record) => ({
        ...record,
        envelope: await encryptOfflineRecord({
          key,
          keyVersion,
          namespaceId,
          storeName: OFFLINE_STORES.drafts,
          recordKey: record.recordKey,
          value: record.value,
        }),
      }))
    )
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(OFFLINE_STORES.drafts, 'readwrite')
      const store = transaction.objectStore(OFFLINE_STORES.drafts)
      const existing = await Promise.all(
        encrypted.map((record) =>
          requestAsPromise(store.get(`${namespaceId}:${record.recordKey}`)) as Promise<
            OfflineStoredRecord | undefined
          >
        )
      )
      const now = new Date().toISOString()
      encrypted.forEach((record, index) => {
        store.put({
          id: `${namespaceId}:${record.recordKey}`,
          namespaceId,
          recordKey: record.recordKey,
          envelope: record.envelope,
          classification: record.classification ?? 'draft',
          createdAt: existing[index]?.createdAt ?? now,
          updatedAt: now,
        } satisfies OfflineStoredRecord)
      })
      await transactionAsPromise(transaction)
      return encrypted.map((record) => record.envelope)
    } finally {
      database.close()
    }
  }

  async putEncryptedQuarantine(
    namespaceId: string,
    recordKey: string,
    value: unknown,
    classification: string
  ) {
    return this.putEncryptedRecord(
      OFFLINE_STORES.quarantine,
      namespaceId,
      recordKey,
      value,
      classification
    )
  }

  async readEncryptedRecord<T>(
    storeName: typeof OFFLINE_STORES.drafts | typeof OFFLINE_STORES.quarantine,
    namespaceId: string,
    recordKey: string
  ) {
    const { key } = this.keyManager.requireKey(namespaceId)
    const database = await openOfflineDatabase(this.databaseName)
    let record: OfflineStoredRecord | undefined
    try {
      const transaction = database.transaction(storeName, 'readonly')
      record = (await requestAsPromise(
        transaction.objectStore(storeName).get(`${namespaceId}:${recordKey}`)
      )) as OfflineStoredRecord | undefined
      await transactionAsPromise(transaction)
    } finally {
      database.close()
    }
    if (!record) return null
    if (
      record.namespaceId !== namespaceId ||
      record.recordKey !== recordKey ||
      record.envelope.namespaceId !== namespaceId
    ) {
      lockOfflineRuntime('cross-scope-integrity-failure', namespaceId)
      clearActiveOfflineNamespace()
      throw new OfflinePhase1Error('OFFLINE_CROSS_SCOPE_DENIED')
    }
    try {
      return await decryptOfflineRecord<T>({
        key,
        namespaceId,
        storeName,
        recordKey,
        envelope: record.envelope,
      })
    } catch {
      lockOfflineRuntime('record-integrity-failure', namespaceId)
      clearActiveOfflineNamespace()
      await this.quarantineCorruptRecord(record).catch(() => undefined)
      throw new OfflinePhase1Error('OFFLINE_INTEGRITY_FAILED')
    }
  }

  async countUnresolvedRecordsByStore(namespaceId: string) {
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(
        [OFFLINE_STORES.drafts, OFFLINE_STORES.quarantine],
        'readonly'
      )
      const [drafts, quarantine] = await Promise.all([
        requestAsPromise(
          transaction
            .objectStore(OFFLINE_STORES.drafts)
            .index('namespaceId')
            .count(IDBKeyRange.only(namespaceId))
        ),
        requestAsPromise(
          transaction
            .objectStore(OFFLINE_STORES.quarantine)
            .index('namespaceId')
            .count(IDBKeyRange.only(namespaceId))
        ),
      ])
      await transactionAsPromise(transaction)
      return { drafts, quarantine, total: drafts + quarantine }
    } finally {
      database.close()
    }
  }

  async countUnresolvedRecords(namespaceId: string) {
    return (await this.countUnresolvedRecordsByStore(namespaceId)).total
  }

  async countUnresolvedCommandRecordsByState(namespaceId: string) {
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(
        OFFLINE_STORES.commandOutbox,
        'readonly'
      )
      const index = transaction
        .objectStore(OFFLINE_STORES.commandOutbox)
        .index('namespaceState')
      const states = ['pending', 'syncing', 'failed', 'conflict', 'blocked'] as const
      const entries = await Promise.all(
        states.map(async (state) => [
          state,
          await requestAsPromise(
            index.count(IDBKeyRange.only([namespaceId, state]))
          ),
        ] as const)
      )
      await transactionAsPromise(transaction)
      const counts = Object.fromEntries(entries) as Record<
        (typeof states)[number],
        number
      >
      return {
        ...counts,
        total: states.reduce((total, state) => total + counts[state], 0),
      }
    } finally {
      database.close()
    }
  }

  async namespaceFingerprint(namespaceId: string) {
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(
        [
          OFFLINE_STORES.keyEnvelopes,
          OFFLINE_STORES.drafts,
          OFFLINE_STORES.quarantine,
          OFFLINE_STORES.purgeTombstones,
          OFFLINE_STORES.datasetManifests,
          ...OFFLINE_DATASET_STORES,
          ...OFFLINE_COMMAND_STORES,
        ],
        'readonly'
      )
      const snapshot: Record<string, unknown[]> = {}
      for (const storeName of [
        OFFLINE_STORES.keyEnvelopes,
        OFFLINE_STORES.drafts,
        OFFLINE_STORES.quarantine,
        OFFLINE_STORES.purgeTombstones,
        OFFLINE_STORES.datasetManifests,
        ...OFFLINE_DATASET_STORES,
        ...OFFLINE_COMMAND_STORES,
      ]) {
        snapshot[storeName] = await getAllByNamespace(
          transaction.objectStore(storeName),
          namespaceId
        )
      }
      await transactionAsPromise(transaction)
      return sha256Base64Url(JSON.stringify(snapshot))
    } finally {
      database.close()
    }
  }

  async purgeExactNamespace(
    authorization: VerifiedPurgeAuthorization,
    options?: { resumeExistingTombstoneOnly?: boolean }
  ) {
    if (!OFFLINE_CAPABILITIES.logoutScopedPurge && !this.allowPersistentWrites) {
      throw new OfflinePhase1Error('OFFLINE_CAPABILITY_DISABLED')
    }
    const { descriptor, bindingDigest } = assertVerifiedPurgeAuthorization(
      authorization
    )
    const namespaceId = descriptor.namespaceId
    lockOfflineRuntime('purge-pending', namespaceId)
    const tombstoneId = `purge:${namespaceId}`
    const now = new Date().toISOString()
    const database = await openOfflineDatabase(this.databaseName)
    let lease: { leaseId: string; ownerId: string } | null = null
    try {
      lease = await acquireNamespaceLease(database, namespaceId, 'purge')
      const tombstoneTransaction = database.transaction(
        OFFLINE_STORES.purgeTombstones,
        'readwrite'
      )
      const tombstoneStore = tombstoneTransaction.objectStore(
        OFFLINE_STORES.purgeTombstones
      )
      const existing = (await requestAsPromise(
        tombstoneStore.get(tombstoneId)
      )) as PurgeTombstoneRecord | undefined
      if (options?.resumeExistingTombstoneOnly) {
        if (!existing || existing.state === 'complete') {
          await transactionAsPromise(tombstoneTransaction)
          return {
            state: 'nothing_pending' as const,
            remainingCounts: null,
          }
        }
        if (existing.bindingDigest !== bindingDigest) {
          await transactionAsPromise(tombstoneTransaction)
          throw new OfflinePhase1Error('OFFLINE_CROSS_SCOPE_DENIED')
        }
      }
      tombstoneStore.put({
        id: tombstoneId,
        namespaceId,
        bindingDigest,
        state: 'pending',
        step: existing?.step ?? 'tombstoned',
        classification: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      } satisfies PurgeTombstoneRecord)
      await transactionAsPromise(tombstoneTransaction)

      const purgeTransaction = database.transaction(
        [
          OFFLINE_STORES.meta,
          OFFLINE_STORES.keyEnvelopes,
          OFFLINE_STORES.drafts,
          OFFLINE_STORES.quarantine,
          OFFLINE_STORES.purgeTombstones,
          OFFLINE_STORES.datasetManifests,
          ...OFFLINE_DATASET_STORES,
          ...OFFLINE_COMMAND_STORES,
        ],
        'readwrite'
      )
      for (const storeName of [
        OFFLINE_STORES.keyEnvelopes,
        OFFLINE_STORES.drafts,
        OFFLINE_STORES.quarantine,
        OFFLINE_STORES.datasetManifests,
        ...OFFLINE_DATASET_STORES,
        ...OFFLINE_COMMAND_STORES,
      ]) {
        await deleteAllByNamespace(
          purgeTransaction.objectStore(storeName),
          namespaceId
        )
      }
      const metaStore = purgeTransaction.objectStore(OFFLINE_STORES.meta)
      const namespaceMeta = (await requestAsPromise(
        metaStore.getAll()
      )) as OfflineMetaRecord[]
      for (const record of namespaceMeta) {
        if (
          record.namespaceId === namespaceId &&
          record.kind !== 'coordination-lease'
        ) {
          metaStore.delete(record.id)
        }
      }
      purgeTransaction.objectStore(OFFLINE_STORES.purgeTombstones).put({
        id: tombstoneId,
        namespaceId,
        bindingDigest,
        state: 'purging',
        step: 'records-removed',
        classification: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: new Date().toISOString(),
      } satisfies PurgeTombstoneRecord)
      await transactionAsPromise(purgeTransaction)

      const verificationTransaction = database.transaction(
        [
          OFFLINE_STORES.keyEnvelopes,
          OFFLINE_STORES.drafts,
          OFFLINE_STORES.quarantine,
          OFFLINE_STORES.datasetManifests,
          ...OFFLINE_DATASET_STORES,
          ...OFFLINE_COMMAND_STORES,
        ],
        'readonly'
      )
      const remainingCounts = await Promise.all(
        [
          OFFLINE_STORES.keyEnvelopes,
          OFFLINE_STORES.drafts,
          OFFLINE_STORES.quarantine,
          OFFLINE_STORES.datasetManifests,
          ...OFFLINE_DATASET_STORES,
          ...OFFLINE_COMMAND_STORES,
        ].map((storeName) =>
          requestAsPromise(
            verificationTransaction
              .objectStore(storeName)
              .index('namespaceId')
              .count(IDBKeyRange.only(namespaceId))
          )
        )
      )
      await transactionAsPromise(verificationTransaction)
      if (remainingCounts.some((count) => count !== 0)) {
        throw new OfflinePhase1Error('OFFLINE_PURGE_FAILED_LOCKED', true)
      }

      const receiptTransaction = database.transaction(
        OFFLINE_STORES.purgeTombstones,
        'readwrite'
      )
      receiptTransaction.objectStore(OFFLINE_STORES.purgeTombstones).put({
        id: tombstoneId,
        namespaceId,
        bindingDigest,
        state: 'complete',
        step: 'zero-residue-verified',
        classification: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: new Date().toISOString(),
      } satisfies PurgeTombstoneRecord)
      await transactionAsPromise(receiptTransaction)

      const cleanupTransaction = database.transaction(
        OFFLINE_STORES.purgeTombstones,
        'readwrite'
      )
      cleanupTransaction
        .objectStore(OFFLINE_STORES.purgeTombstones)
        .delete(tombstoneId)
      await transactionAsPromise(cleanupTransaction)
      clearActiveOfflineNamespace(namespaceId)
      return { state: 'purged' as const, remainingCounts }
    } catch (error) {
      if (
        error instanceof OfflinePhase1Error &&
        error.code === 'OFFLINE_CROSS_SCOPE_DENIED'
      ) {
        lockOfflineRuntime('purge-tombstone-binding-failed', namespaceId)
        clearActiveOfflineNamespace(namespaceId)
        throw error
      }
      try {
        if (!lease) throw error
        const failureTransaction = database.transaction(
          OFFLINE_STORES.purgeTombstones,
          'readwrite'
        )
        failureTransaction
          .objectStore(OFFLINE_STORES.purgeTombstones)
          .put({
            id: tombstoneId,
            namespaceId,
            bindingDigest,
            state: 'purge_failed_locked',
            step: 'retry-required',
            classification: toOfflineSafeClassification(error),
            createdAt: now,
            updatedAt: new Date().toISOString(),
          } satisfies PurgeTombstoneRecord)
        await transactionAsPromise(failureTransaction)
      } catch {
        // The primary safe state remains locked even if evidence persistence fails.
      }
      lockOfflineRuntime('purge-failed-locked', namespaceId)
      clearActiveOfflineNamespace(namespaceId)
      throw new OfflinePhase1Error('OFFLINE_PURGE_FAILED_LOCKED', true)
    } finally {
      if (lease) {
        await releaseNamespaceLease(database, lease).catch(() => undefined)
      }
      database.close()
    }
  }

  async countPendingPurgeTombstones(namespaceId?: string) {
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(
        OFFLINE_STORES.purgeTombstones,
        'readonly'
      )
      const store = transaction.objectStore(OFFLINE_STORES.purgeTombstones)
      const records = namespaceId
        ? await getAllByNamespace<PurgeTombstoneRecord>(store, namespaceId)
        : ((await requestAsPromise(store.getAll())) as PurgeTombstoneRecord[])
      await transactionAsPromise(transaction)
      return records.filter((record) => record.state !== 'complete').length
    } finally {
      database.close()
    }
  }

  async resumeAuthorizedPurge(authorization: VerifiedPurgeAuthorization) {
    return this.purgeExactNamespace(authorization, {
      resumeExistingTombstoneOnly: true,
    })
  }

  async listPurgeTombstones() {
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(
        OFFLINE_STORES.purgeTombstones,
        'readonly'
      )
      const records = (await requestAsPromise(
        transaction.objectStore(OFFLINE_STORES.purgeTombstones).getAll()
      )) as PurgeTombstoneRecord[]
      await transactionAsPromise(transaction)
      return records
    } finally {
      database.close()
    }
  }

  private assertWritesEnabled() {
    if (!this.allowPersistentWrites && !OFFLINE_CAPABILITIES.encryptedLocalStore) {
      throw new OfflinePhase1Error('OFFLINE_CAPABILITY_DISABLED')
    }
  }

  private async putEncryptedRecord(
    storeName: typeof OFFLINE_STORES.drafts | typeof OFFLINE_STORES.quarantine,
    namespaceId: string,
    recordKey: string,
    value: unknown,
    classification: string
  ) {
    this.assertWritesEnabled()
    const { key, keyVersion } = this.keyManager.requireKey(namespaceId)
    const envelope = await encryptOfflineRecord({
      key,
      keyVersion,
      namespaceId,
      storeName,
      recordKey,
      value,
    })
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(storeName, 'readwrite')
      const id = `${namespaceId}:${recordKey}`
      const store = transaction.objectStore(storeName)
      const existing = (await requestAsPromise(
        store.get(id)
      )) as OfflineStoredRecord | undefined
      const now = new Date().toISOString()
      store.put({
        id,
        namespaceId,
        recordKey,
        envelope,
        classification,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      } satisfies OfflineStoredRecord)
      await transactionAsPromise(transaction)
      return envelope
    } finally {
      database.close()
    }
  }

  private async quarantineCorruptRecord(record: OfflineStoredRecord) {
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(
        [OFFLINE_STORES.drafts, OFFLINE_STORES.quarantine],
        'readwrite'
      )
      transaction.objectStore(OFFLINE_STORES.quarantine).put({
        ...record,
        id: `${record.namespaceId}:corrupt:${record.recordKey}`,
        recordKey: `corrupt:${record.recordKey}`,
        classification: 'integrity-failure-ciphertext-only',
        updatedAt: new Date().toISOString(),
      } satisfies OfflineStoredRecord)
      transaction.objectStore(OFFLINE_STORES.drafts).delete(record.id)
      await transactionAsPromise(transaction)
    } finally {
      database.close()
    }
  }
}

export const offlineRepository = new EncryptedOfflineRepository()

let activeNamespace: OfflineNamespaceDescriptor | null = null

export type VerifiedPurgeAuthorization = Readonly<{
  descriptor: Readonly<OfflineNamespaceDescriptor>
  bindingDigest: string
  verifiedAt: number
}>

const verifiedPurgeAuthorizations = new WeakSet<object>()

function sameOfflineNamespace(
  left: OfflineNamespaceDescriptor,
  right: OfflineNamespaceDescriptor
) {
  return (
    left.namespaceId === right.namespaceId &&
    left.schemaGeneration === right.schemaGeneration &&
    left.schemaVersion === right.schemaVersion
  )
}

async function createPurgeBindingDigest(
  descriptor: OfflineNamespaceDescriptor
) {
  return sha256Base64Url(
    JSON.stringify({
      purpose: 'afex-pos-exact-namespace-purge-v1',
      namespaceId: descriptor.namespaceId,
      schemaGeneration: descriptor.schemaGeneration,
      schemaVersion: descriptor.schemaVersion,
    })
  )
}

function assertVerifiedPurgeAuthorization(
  authorization: VerifiedPurgeAuthorization
) {
  if (
    !authorization ||
    typeof authorization !== 'object' ||
    !verifiedPurgeAuthorizations.has(authorization) ||
    !sameOfflineNamespace(authorization.descriptor, {
      namespaceId: authorization.descriptor.namespaceId,
      schemaGeneration: OFFLINE_SCHEMA_GENERATION,
      schemaVersion: OFFLINE_SCHEMA_VERSION,
    })
  ) {
    clearActiveOfflineNamespace()
    lockOfflineRuntime('purge-authority-invalid')
    throw new OfflinePhase1Error('OFFLINE_CROSS_SCOPE_DENIED')
  }
  return authorization
}

export function getActiveOfflineNamespace() {
  return activeNamespace ? { ...activeNamespace } : null
}

export function activateServerVerifiedOfflineNamespace(
  descriptor: OfflineNamespaceDescriptor
) {
  if (
    descriptor.schemaGeneration !== OFFLINE_SCHEMA_GENERATION ||
    descriptor.schemaVersion !== OFFLINE_SCHEMA_VERSION ||
    !descriptor.namespaceId.startsWith('ns_')
  ) {
    lockOfflineRuntime('namespace-authority-invalid')
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  if (activeNamespace && !sameOfflineNamespace(activeNamespace, descriptor)) {
    lockOfflineRuntime('namespace-authority-mismatch')
    activeNamespace = null
    throw new OfflinePhase1Error('OFFLINE_CROSS_SCOPE_DENIED')
  }
  activeNamespace = { ...descriptor }
  return { ...activeNamespace }
}

export function clearActiveOfflineNamespace(namespaceId?: string) {
  if (!namespaceId || activeNamespace?.namespaceId === namespaceId) {
    activeNamespace = null
  }
}

export function finalizeOfflineSessionIntent(intent: 'logout' | 'switch') {
  if (intent === 'logout') clearActiveOfflineNamespace()
  return {
    intent,
    route: intent === 'switch' ? '/pos/employee-pin' : '/pos/login',
  } as const
}

export async function fetchVerifiedOfflineContext() {
  let response: Response
  try {
    response = await fetch('/api/pos/offline-context', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })
  } catch {
    throw new OfflinePhase1Error('OFFLINE_AUTHORITY_UNAVAILABLE', true)
  }
  const payload = (await response.json().catch(() => null)) as
    | VerifiedOfflineContextResponse
    | null
  if (
    !response.ok ||
    !payload?.success ||
    payload.context.contextVersion !== 1 ||
    !payload.context.primarySubjectId ||
    !payload.context.tenantId ||
    !payload.context.branchId
  ) {
    throw new OfflinePhase1Error('OFFLINE_AUTHORITY_UNAVAILABLE', true)
  }
  return payload.context
}

async function deriveCurrentVerifiedOfflineNamespace() {
  const [context, deviceCacheId] = await Promise.all([
    fetchVerifiedOfflineContext(),
    getOrCreateDeviceCacheId(),
  ])
  const descriptor = await deriveOfflineNamespace({
    primarySubjectId: context.primarySubjectId,
    tenantId: context.tenantId,
    branchId: context.branchId,
    deviceCacheId,
    schemaGeneration: OFFLINE_SCHEMA_GENERATION,
    authoritySource: 'server-verified-auth-context',
    contextVersion: 1,
  })
  return { descriptor, actorAuthority: context.actorAuthority }
}

export async function prepareVerifiedOfflineNamespace() {
  lockOfflineRuntime('namespace-preparing', null)
  const verified = await deriveCurrentVerifiedOfflineNamespace()
  if (
    activeNamespace &&
    !sameOfflineNamespace(activeNamespace, verified.descriptor)
  ) {
    clearActiveOfflineNamespace()
    lockOfflineRuntime('namespace-authority-mismatch')
    throw new OfflinePhase1Error('OFFLINE_CROSS_SCOPE_DENIED')
  }
  activeNamespace = verified.descriptor
  return {
    descriptor: { ...activeNamespace },
    actorAuthority: verified.actorAuthority,
  }
}

export async function authorizeCurrentOfflineNamespaceForPurge(
  candidate?: OfflineNamespaceDescriptor
): Promise<VerifiedPurgeAuthorization> {
  lockOfflineRuntime('purge-authority-verifying', null)
  const verified = await deriveCurrentVerifiedOfflineNamespace()
  if (verified.actorAuthority !== 'active-pos-actor') {
    clearActiveOfflineNamespace()
    lockOfflineRuntime('purge-pos-actor-authority-required')
    throw new OfflinePhase1Error('OFFLINE_AUTHORITY_UNAVAILABLE')
  }
  if (
    (candidate && !sameOfflineNamespace(candidate, verified.descriptor)) ||
    (activeNamespace &&
      !sameOfflineNamespace(activeNamespace, verified.descriptor))
  ) {
    clearActiveOfflineNamespace()
    lockOfflineRuntime('purge-cross-scope-denied')
    throw new OfflinePhase1Error('OFFLINE_CROSS_SCOPE_DENIED')
  }

  activeNamespace = verified.descriptor
  const authorization = Object.freeze({
    descriptor: Object.freeze({ ...verified.descriptor }),
    bindingDigest: await createPurgeBindingDigest(verified.descriptor),
    verifiedAt: Date.now(),
  })
  verifiedPurgeAuthorizations.add(authorization)
  return authorization
}

export type OfflineRuntimeInitializationResult = Readonly<{
  status:
    | 'initialized_locked'
    | 'pending_purges_discovered_locked'
    | 'offline_store_unavailable_locked'
  pendingPurgeCount: number
}>

export type AuthorizedPurgeRecoveryResult = Readonly<{
  status:
    | 'nothing_pending'
    | 'resumed_current_scope'
    | 'authorization_required_locked'
    | 'deferred_for_matching_scope'
    | 'binding_mismatch_locked'
    | 'purge_failed_locked'
    | 'offline_store_unavailable_locked'
  resumedTombstoneCount: number
  deferredTombstoneCount: number
}>

let initializationPromise: Promise<OfflineRuntimeInitializationResult> | null =
  null

export function initializeOfflinePhase1Runtime() {
  if (initializationPromise) return initializationPromise
  offlineTabCoordinator.start()
  initializationPromise = (async () => {
    try {
      await offlineRepository.initialize()
      const pendingPurgeCount =
        await offlineRepository.countPendingPurgeTombstones()
      lockOfflineRuntime(
        pendingPurgeCount > 0
          ? 'pending-purges-discovered-locked'
          : 'offline-runtime-initialized-locked',
        null,
        false
      )
      return {
        status:
          pendingPurgeCount > 0
            ? ('pending_purges_discovered_locked' as const)
            : ('initialized_locked' as const),
        pendingPurgeCount,
      }
    } catch {
      lockOfflineRuntime('offline-store-unavailable', null, false)
      clearActiveOfflineNamespace()
      return {
        status: 'offline_store_unavailable_locked' as const,
        pendingPurgeCount: 0,
      }
    }
  })()
  return initializationPromise
}

function lockedPurgeRecoveryResult(
  status: AuthorizedPurgeRecoveryResult['status'],
  deferredTombstoneCount = 0
): AuthorizedPurgeRecoveryResult {
  return {
    status,
    resumedTombstoneCount: 0,
    deferredTombstoneCount,
  }
}

export async function resumeAuthorizedPurgesForCurrentScope(): Promise<AuthorizedPurgeRecoveryResult> {
  const initialization = await initializeOfflinePhase1Runtime()
  if (initialization.status === 'offline_store_unavailable_locked') {
    return lockedPurgeRecoveryResult('offline_store_unavailable_locked')
  }

  lockOfflineRuntime('authorized-purge-resume-check', null)
  let prepared: Awaited<ReturnType<typeof prepareVerifiedOfflineNamespace>>
  try {
    prepared = await prepareVerifiedOfflineNamespace()
  } catch (error) {
    const classification = toOfflineSafeClassification(error)
    clearActiveOfflineNamespace()
    lockOfflineRuntime('authorized-purge-resume-deferred', null)
    return lockedPurgeRecoveryResult(
      classification === 'OFFLINE_AUTHORITY_UNAVAILABLE'
        ? 'authorization_required_locked'
        : classification === 'OFFLINE_CROSS_SCOPE_DENIED'
          ? 'binding_mismatch_locked'
          : 'offline_store_unavailable_locked',
      initialization.pendingPurgeCount
    )
  }

  if (prepared.actorAuthority !== 'active-pos-actor') {
    clearActiveOfflineNamespace(prepared.descriptor.namespaceId)
    lockOfflineRuntime('authorized-purge-pos-actor-required', null)
    return lockedPurgeRecoveryResult(
      'authorization_required_locked',
      initialization.pendingPurgeCount
    )
  }

  let authorization: VerifiedPurgeAuthorization
  try {
    authorization = await authorizeCurrentOfflineNamespaceForPurge(
      prepared.descriptor
    )
  } catch (error) {
    const classification = toOfflineSafeClassification(error)
    lockOfflineRuntime('authorized-purge-resume-denied', null)
    return lockedPurgeRecoveryResult(
      classification === 'OFFLINE_CROSS_SCOPE_DENIED'
        ? 'binding_mismatch_locked'
        : 'authorization_required_locked',
      initialization.pendingPurgeCount
    )
  }

  try {
    const recovery =
      await offlineRepository.resumeAuthorizedPurge(authorization)
    if (recovery.state === 'purged') {
      return {
        status: 'resumed_current_scope',
        resumedTombstoneCount: 1,
        deferredTombstoneCount:
          await offlineRepository.countPendingPurgeTombstones(),
      }
    }
    const deferredTombstoneCount =
      await offlineRepository.countPendingPurgeTombstones()
    return lockedPurgeRecoveryResult(
      deferredTombstoneCount > 0
        ? 'deferred_for_matching_scope'
        : 'nothing_pending',
      deferredTombstoneCount
    )
  } catch (error) {
    const classification = toOfflineSafeClassification(error)
    return lockedPurgeRecoveryResult(
      classification === 'OFFLINE_CROSS_SCOPE_DENIED'
        ? 'binding_mismatch_locked'
        : classification === 'OFFLINE_PURGE_FAILED_LOCKED'
          ? 'purge_failed_locked'
          : 'offline_store_unavailable_locked',
      await offlineRepository.countPendingPurgeTombstones().catch(() => 0)
    )
  }
}

export async function completePosPinOfflineRecoveryGate(
  onOnlinePosReady: () => void | Promise<void>
) {
  let recovery: AuthorizedPurgeRecoveryResult
  try {
    recovery = await resumeAuthorizedPurgesForCurrentScope()
  } catch {
    lockOfflineRuntime('offline-recovery-unexpected-failure', null)
    recovery = lockedPurgeRecoveryResult('offline_store_unavailable_locked')
  }
  await onOnlinePosReady()
  return recovery
}

export type OfflineQuotaAssessment = {
  usage: number | null
  quota: number | null
  ratio: number | null
  state: 'unavailable' | 'normal' | 'warning' | 'hard-stop'
}

export function assessOfflineQuota(
  usage: number | undefined,
  quota: number | undefined
): OfflineQuotaAssessment {
  if (
    !Number.isFinite(usage) ||
    !Number.isFinite(quota) ||
    !quota ||
    Number(quota) <= 0
  ) {
    return { usage: null, quota: null, ratio: null, state: 'unavailable' }
  }
  const ratio = Math.max(0, Number(usage)) / Number(quota)
  return {
    usage: Number(usage),
    quota: Number(quota),
    ratio,
    state:
      ratio >= OFFLINE_QUOTA_THRESHOLDS.hardStopRatio
        ? 'hard-stop'
        : ratio >= OFFLINE_QUOTA_THRESHOLDS.warningRatio
          ? 'warning'
          : 'normal',
  }
}

export async function inspectOfflineStorageCapability() {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return {
      persisted: null,
      persistRequested: false,
      estimate: assessOfflineQuota(undefined, undefined),
    }
  }
  let persisted: boolean | null = null
  let persistRequested = false
  try {
    persisted = await navigator.storage.persisted()
    if (!persisted && typeof navigator.storage.persist === 'function') {
      persistRequested = true
      persisted = await navigator.storage.persist()
    }
  } catch {
    persisted = null
  }
  let estimate: StorageEstimate = {}
  try {
    estimate = await navigator.storage.estimate()
  } catch {
    estimate = {}
  }
  return {
    persisted,
    persistRequested,
    estimate: assessOfflineQuota(estimate.usage, estimate.quota),
  }
}

export function pruneFutureEvictableData() {
  return {
    removedRecords: 0,
    removedBytes: 0,
    reason: 'PHASE_1_HAS_NO_EVICTABLE_READ_OR_MEDIA_STORES' as const,
  }
}

export const LEGACY_SENSITIVE_STORAGE_KEYS = Object.freeze([
  'invoice_customer',
  'invoice_sale_items',
  'invoice_sale_checkout',
  'leather_fix_pos_offline_drafts',
])

export type LegacyMigrationResult = {
  discovered: number
  imported: number
  quarantined: number
  retainedLocked: number
  removedAfterVerification: number
  classifications: string[]
}

export function discoverLegacyPlaintextRecords(
  storage: Pick<Storage, 'getItem'>
) {
  const results: Array<{ key: string; bytes: number }> = []
  for (const key of LEGACY_SENSITIVE_STORAGE_KEYS) {
    try {
      const value = storage.getItem(key)
      if (value !== null) {
        results.push({ key, bytes: new TextEncoder().encode(value).byteLength })
      }
    } catch {
      // Discovery remains value-free and fail-closed.
    }
  }
  return results
}

export type LegacySensitiveRecordAssessment = {
  key: (typeof LEGACY_SENSITIVE_STORAGE_KEYS)[number]
  classification: 'verified-bound' | 'ambiguous-unscoped'
  bytes: number
  recordCount: number
  contentHash: string
}

function countLegacyQueueRecords(key: string, value: string) {
  if (key !== 'leather_fix_pos_offline_drafts') return 1
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.length : 1
  } catch {
    return 1
  }
}

export async function assessLegacySensitiveRecords(params: {
  storage: Pick<Storage, 'getItem'>
  verifiedBindingKeys?: ReadonlySet<string>
}) {
  const records: LegacySensitiveRecordAssessment[] = []
  for (const key of LEGACY_SENSITIVE_STORAGE_KEYS) {
    let value: string | null = null
    try {
      value = params.storage.getItem(key)
    } catch {
      throw new OfflinePhase1Error('OFFLINE_DATABASE_UNAVAILABLE', true)
    }
    if (value === null) continue
    records.push({
      key,
      classification: params.verifiedBindingKeys?.has(key)
        ? 'verified-bound'
        : 'ambiguous-unscoped',
      bytes: new TextEncoder().encode(value).byteLength,
      recordCount: countLegacyQueueRecords(key, value),
      contentHash: await sha256Base64Url(value),
    })
  }

  const ambiguousRecords = records.filter(
    (record) => record.classification === 'ambiguous-unscoped'
  )
  const verifiedRecords = records.filter(
    (record) => record.classification === 'verified-bound'
  )
  return {
    records,
    discoveredKeyCount: records.length,
    totalBytes: records.reduce((total, record) => total + record.bytes, 0),
    activeLegacySaleDraftPresence: records.some((record) =>
      record.key.startsWith('invoice_')
    ),
    legacyOfflineDraftQueueRecordCount:
      records.find(
        (record) => record.key === 'leather_fix_pos_offline_drafts'
      )?.recordCount ?? 0,
    verifiedBoundRecordCount: verifiedRecords.reduce(
      (total, record) => total + record.recordCount,
      0
    ),
    ambiguousRecordCount: ambiguousRecords.reduce(
      (total, record) => total + record.recordCount,
      0
    ),
  }
}

export async function assessLogoutPurgeRecords(params: {
  repository: EncryptedOfflineRepository
  namespaceId: string
  storage: Pick<Storage, 'getItem'>
}) {
  const [encrypted, commands, legacy] = await Promise.all([
    params.repository.countUnresolvedRecordsByStore(params.namespaceId),
    params.repository.countUnresolvedCommandRecordsByState(params.namespaceId),
    assessLegacySensitiveRecords({ storage: params.storage }),
  ])
  return {
    encryptedDraftCount: encrypted.drafts,
    encryptedQuarantineCount: encrypted.quarantine,
    encryptedScopedUnresolvedCount: encrypted.total,
    encryptedCommandCounts: commands,
    encryptedUnresolvedCommandCount: commands.total,
    activeLegacySaleDraftPresence: legacy.activeLegacySaleDraftPresence,
    legacyOfflineDraftQueueRecordCount:
      legacy.legacyOfflineDraftQueueRecordCount,
    ambiguousLegacyRecordCount: legacy.ambiguousRecordCount,
    legacySensitiveKeyCount: legacy.discoveredKeyCount,
    legacySensitiveBytes: legacy.totalBytes,
    requiresSecondConfirmation:
      encrypted.total > 0 || commands.total > 0 || legacy.records.length > 0,
    blocksScopedCompleteClaim: legacy.ambiguousRecordCount > 0,
    legacyRecords: legacy.records,
  }
}

export const EXPLICIT_UNSCOPED_LEGACY_CLEANUP_CONFIRMATION =
  'DELETE_UNSCOPED_AFEX_LEGACY_DRAFTS'

export async function deleteExplicitlyConfirmedLegacySensitiveRecords(params: {
  storage: Pick<Storage, 'getItem' | 'removeItem'>
  confirmation: string
}) {
  if (params.confirmation !== EXPLICIT_UNSCOPED_LEGACY_CLEANUP_CONFIRMATION) {
    throw new OfflinePhase1Error(
      'OFFLINE_LEGACY_CLEANUP_CONFIRMATION_REQUIRED'
    )
  }
  const before = await assessLegacySensitiveRecords({ storage: params.storage })
  for (const record of before.records) {
    params.storage.removeItem(record.key)
  }
  const after = await assessLegacySensitiveRecords({ storage: params.storage })
  if (after.records.length > 0) {
    throw new OfflinePhase1Error('OFFLINE_LEGACY_CLEANUP_FAILED', true)
  }
  return {
    removedKeyCount: before.discoveredKeyCount,
    removedRecordCount: before.records.reduce(
      (total, record) => total + record.recordCount,
      0
    ),
    removedBytes: before.totalBytes,
    removedContentHashes: before.records.map((record) => record.contentHash),
    verifiedAbsentKeyCount: LEGACY_SENSITIVE_STORAGE_KEYS.length,
  }
}

export async function migrateLegacyPlaintextRecords(params: {
  storage: Pick<Storage, 'getItem' | 'removeItem'>
  repository: EncryptedOfflineRepository
  namespaceId: string
  verifiedBindingKeys?: ReadonlySet<string>
}) {
  const discovered = discoverLegacyPlaintextRecords(params.storage)
  const result: LegacyMigrationResult = {
    discovered: discovered.length,
    imported: 0,
    quarantined: 0,
    retainedLocked: 0,
    removedAfterVerification: 0,
    classifications: [],
  }
  if (!OFFLINE_CAPABILITIES.legacyMigration && !params.repository.allowPersistentWrites) {
    result.retainedLocked = discovered.length
    result.classifications.push('OFFLINE_LEGACY_MIGRATION_DISABLED')
    return result
  }
  for (const record of discovered) {
    const raw = params.storage.getItem(record.key)
    if (raw === null) continue
    const contentHash = await sha256Base64Url(raw)
    const recordKey = `legacy:${record.key}:${contentHash}`
    const verified = params.verifiedBindingKeys?.has(record.key) === true
    try {
      if (verified) {
        await params.repository.putEncryptedDraft(
          params.namespaceId,
          recordKey,
          { legacyKey: record.key, content: raw, contentHash },
          'verified-legacy-import'
        )
        result.imported += 1
      } else {
        await params.repository.putEncryptedQuarantine(
          params.namespaceId,
          recordKey,
          { legacyKey: record.key, content: raw, contentHash },
          'ambiguous-legacy-binding'
        )
        result.quarantined += 1
      }
      const verifiedRead = await params.repository.readEncryptedRecord<{
        contentHash: string
      }>(
        verified ? OFFLINE_STORES.drafts : OFFLINE_STORES.quarantine,
        params.namespaceId,
        recordKey
      )
      if (verifiedRead?.contentHash !== contentHash) {
        throw new OfflinePhase1Error('OFFLINE_INTEGRITY_FAILED')
      }
      params.storage.removeItem(record.key)
      result.removedAfterVerification += 1
    } catch (error) {
      result.retainedLocked += 1
      result.classifications.push(toOfflineSafeClassification(error))
    }
  }
  return result
}

export function assertNoBusinessDispatchInPhase1() {
  return {
    commandStores: 0,
    dispatchers: 0,
    businessApiCalls: 0,
    capability: OFFLINE_CAPABILITIES.businessCommandDispatch,
  }
}

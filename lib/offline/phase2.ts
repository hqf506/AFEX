'use client'

import {
  OFFLINE_CAPABILITIES,
  OFFLINE_DATABASE_NAME,
  OFFLINE_STORES,
  OfflineKeyManager,
  OfflinePhase1Error,
  decryptOfflineRecord,
  encryptOfflineRecord,
  offlineKeyManager,
  openOfflineDatabase,
  sha256Base64Url,
  type EncryptedRecordEnvelope,
} from './phase1'

const SNAPSHOT_WRITER_LEASE_MS = 30_000
const MAX_SNAPSHOT_PAGE_SIZE = 200
const MAX_READ_PAGE_SIZE = 200
const AFEX_SERVICE_WORKER_PATH = '/sw.js'
const AFEX_POS_SERVICE_WORKER_SCOPE = '/'
const AFEX_LEGACY_SERVICE_WORKER_SCOPES = new Set(['/pos/'])

export const AFEX_SHELL_CACHE_PREFIX = 'afex-pos-shell-'

export const AFEX_OFFLINE_POS_SHELL_ROUTES = Object.freeze([
  '/pos',
  '/pos/employee-pin',
  '/pos/sale/customer',
  '/pos/sale/items',
  '/pos/sale/checkout',
  '/pos/settings',
  '/pos/order-status',
  '/pos/order-history',
  '/pos/invoices',
] as const)

export async function installAfexOfflineApplicationShell() {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !OFFLINE_PHASE2_CAPABILITIES.offlineShell
  ) {
    throw new OfflinePhase1Error('OFFLINE_SHELL_UNAVAILABLE', true)
  }

  const existingRegistrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(
    existingRegistrations
      .filter((registration) => {
        try {
          const scope = new URL(registration.scope)
          return (
            scope.origin === window.location.origin &&
            AFEX_LEGACY_SERVICE_WORKER_SCOPES.has(scope.pathname) &&
            [registration.active, registration.waiting, registration.installing].some(
              isOwnedAfexWorker
            )
          )
        } catch {
          return false
        }
      })
      .map((registration) => registration.unregister())
  )
  const registration = await navigator.serviceWorker.register(AFEX_SERVICE_WORKER_PATH, {
    scope: AFEX_POS_SERVICE_WORKER_SCOPE,
    updateViaCache: 'none',
  })
  let worker = registration.waiting ?? registration.installing ?? registration.active
  if (worker?.state === 'installing') {
    await new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(
        () => reject(new OfflinePhase1Error('OFFLINE_SHELL_UNAVAILABLE', true)),
        15_000
      )
      worker?.addEventListener('statechange', () => {
        if (worker?.state === 'installed' || worker?.state === 'activated') {
          window.clearTimeout(timeoutId)
          resolve()
        } else if (worker?.state === 'redundant') {
          window.clearTimeout(timeoutId)
          reject(new OfflinePhase1Error('OFFLINE_SHELL_UNAVAILABLE', true))
        }
      })
    })
  }
  worker = registration.waiting ?? registration.active ?? worker
  if (worker?.state === 'installed') {
    worker.postMessage({ type: 'AFEX_ACTIVATE_SHELL_V1' })
  }
  if (!worker) {
    throw new OfflinePhase1Error('OFFLINE_SHELL_UNAVAILABLE', true)
  }

  return new Promise<Readonly<{ routeCount: number; assetCount: number }>>(
    (resolve, reject) => {
      const channel = new MessageChannel()
      const timeoutId = window.setTimeout(() => {
        channel.port1.close()
        reject(new OfflinePhase1Error('OFFLINE_SHELL_UNAVAILABLE', true))
      }, 30_000)
      channel.port1.addEventListener(
        'message',
        (event: MessageEvent<unknown>) => {
          window.clearTimeout(timeoutId)
          channel.port1.close()
          const value = event.data as
            | { type?: unknown; routeCount?: unknown; assetCount?: unknown }
            | null
          if (
            value?.type !== 'AFEX_POS_SHELL_INSTALLED_V2' ||
            !Number.isSafeInteger(value.routeCount) ||
            Number(value.routeCount) !== AFEX_OFFLINE_POS_SHELL_ROUTES.length ||
            !Number.isSafeInteger(value.assetCount) ||
            Number(value.assetCount) < 1
          ) {
            reject(new OfflinePhase1Error('OFFLINE_SHELL_UNAVAILABLE', true))
            return
          }
          resolve(
            Object.freeze({
              routeCount: Number(value.routeCount),
              assetCount: Number(value.assetCount),
            })
          )
        },
        { once: true }
      )
      channel.port1.start()
      worker.postMessage(
        {
          type: 'AFEX_INSTALL_POS_SHELL_V2',
          routes: AFEX_OFFLINE_POS_SHELL_ROUTES,
        },
        [channel.port2]
      )
    }
  )
}

const PHASE2_DATASET_IDS = new Set<Phase2DatasetId>([
  'catalog',
  'customers',
  'orders',
  'invoices',
  'events',
  'runtimeSettings',
  'mediaRefs',
])

function publicFlag(value: string | undefined, fallback = false) {
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

export const OFFLINE_PHASE2_CAPABILITIES = Object.freeze({
  offlineShell: publicFlag(
    process.env.NEXT_PUBLIC_AFEX_OFFLINE_APPLICATION_SHELL,
    true
  ),
  encryptedDatasetStore: true,
  datasetBootstrap: true,
  catalogReads: true,
  customerReads: true,
  orderInvoiceReads: true,
  mediaCache: false,
  businessMutationDispatch: false as const,
})

export const PHASE2_AUTHORITY_GATE = Object.freeze({
  classification: 'APPROVED_OFFLINE_READ_RUNTIME' as const,
  persistentUnwrapAuthority: true,
  prePinSensitiveIngestion: true,
  reason: 'SERVER_ATTESTED_MANAGED_DEVICE_AUTHORITY' as const,
})

export const PHASE2_RETENTION = Object.freeze({
  catalog: { maximumRecords: 10_000, maximumAgeMs: 30 * 86_400_000 },
  runtimeSettings: { completeVersions: 2, financialStaleMs: 2 * 3_600_000 },
  mediaRefs: { maximumRecords: 1_000, maximumBytes: 250 * 1024 * 1024 },
  customerIndex: { maximumRecords: 10_000, maximumAgeMs: 7 * 86_400_000 },
  customerProfiles: { maximumRecords: 200, maximumAgeMs: 48 * 3_600_000 },
  activeOrders: { maximumRecords: 500 },
  recentOrders: { maximumRecords: 1_000, serverWindowMs: 48 * 3_600_000 },
  invoices: { maximumRecords: 500, maximumAgeMs: 48 * 3_600_000 },
  events: { maximumRecords: 5_000, requiresRetainedParent: true },
})

export type Phase2DatasetId =
  | 'catalog'
  | 'customers'
  | 'orders'
  | 'invoices'
  | 'events'
  | 'runtimeSettings'
  | 'mediaRefs'

export type Phase2CoordinatorState =
  | 'idle'
  | 'preparing'
  | 'downloading'
  | 'partially_ready'
  | 'ready'
  | 'stale'
  | 'offline_ready'
  | 'locked'
  | 'failed'

export type DatasetManifestRecord = {
  id: string
  namespaceId: string
  datasetId: Phase2DatasetId
  datasetSchemaVersion: number
  snapshotVersion: string
  status: 'incomplete' | 'complete'
  sourceContractVersion: string
  confirmedAtServer: string
  freshnessMs: number
  expectedPageCount: number
  expectedRecordCount: number
  expectedClosureHash: string
  pageClosures: Array<{
    pageNumber: number
    recordCount: number
    hash: string
  }>
  writerId: string | null
  writerLeaseExpiresAt: number | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

type DatasetRecord = {
  id: string
  namespaceId: string
  datasetId: Phase2DatasetId
  datasetSchemaVersion: number
  snapshotVersion: string
  recordKey: string
  envelope: EncryptedRecordEnvelope
  createdAt: string
  updatedAt: string
}

export type SnapshotWriter = Readonly<{
  namespaceId: string
  datasetId: Phase2DatasetId
  snapshotVersion: string
  writerId: string
}>

type RepositoryOptions = {
  databaseName?: string
  keyManager?: OfflineKeyManager
  allowSyntheticAuthority?: boolean
  now?: () => number
}

function requestAsPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), {
      once: true,
    })
    request.addEventListener(
      'error',
      () => reject(new OfflinePhase1Error('OFFLINE_DATABASE_UNAVAILABLE', true)),
      { once: true }
    )
  })
}

function transactionAsPromise(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true })
    const rejectTransaction = () =>
      reject(new OfflinePhase1Error('OFFLINE_DATABASE_UNAVAILABLE', true))
    transaction.addEventListener('abort', rejectTransaction, { once: true })
    transaction.addEventListener('error', rejectTransaction, { once: true })
  })
}

function requireIdentifier(value: string, classification: string) {
  const normalized = value.trim()
  if (!normalized || normalized.length > 256) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  if (!/^[A-Za-z0-9._:-]+$/u.test(normalized)) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  return `${classification}:${normalized}`.slice(classification.length + 1)
}

function requireDatasetId(value: string): Phase2DatasetId {
  const normalized = requireIdentifier(value, 'dataset')
  if (!PHASE2_DATASET_IDS.has(normalized as Phase2DatasetId)) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  return normalized as Phase2DatasetId
}

function requirePositiveInteger(value: number, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  return value
}

function requireNonNegativeInteger(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  return value
}

function requireServerTimestamp(value: string) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  return new Date(timestamp).toISOString()
}

function datasetStore(datasetId: Phase2DatasetId) {
  return OFFLINE_STORES[datasetId]
}

function manifestId(
  namespaceId: string,
  datasetId: Phase2DatasetId,
  snapshotVersion: string
) {
  return `${namespaceId}:${datasetId}:${snapshotVersion}`
}

function encryptedRecordKey(
  datasetId: Phase2DatasetId,
  snapshotVersion: string,
  recordKey: string
) {
  return `${datasetId}:${snapshotVersion}:${recordKey}`
}

function compareCanonicalStrings(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

export function canonicalSnapshotJson(
  value: unknown,
  ancestors = new WeakSet<object>()
): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value)
  }
  if (
    typeof value === 'undefined' ||
    typeof value === 'function' ||
    typeof value === 'symbol' ||
    typeof value === 'bigint'
  ) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  if (typeof value !== 'object') {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }
  if (ancestors.has(value)) {
    throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
  }

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      const entries: string[] = []
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
        }
        entries.push(canonicalSnapshotJson(value[index], ancestors))
      }
      return `[${entries.join(',')}]`
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
    }
    const ownKeys = Reflect.ownKeys(value)
    if (ownKeys.some((key) => typeof key !== 'string')) {
      throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
    }
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const keys = (ownKeys as string[]).sort(compareCanonicalStrings)
    const entries = keys.map((key) => {
      const descriptor = descriptors[key]
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
      }
      return `${JSON.stringify(key)}:${canonicalSnapshotJson(
        descriptor.value,
        ancestors
      )}`
    })
    return `{${entries.join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

function isOwnedAfexWorker(worker: ServiceWorker | null) {
  if (!worker) return false
  try {
    const script = new URL(worker.scriptURL)
    return (
      script.origin === window.location.origin &&
      script.pathname === AFEX_SERVICE_WORKER_PATH
    )
  } catch {
    return false
  }
}

function isOwnedAfexRegistration(registration: ServiceWorkerRegistration) {
  try {
    const scope = new URL(registration.scope)
    return (
      scope.origin === window.location.origin &&
      (scope.pathname === AFEX_POS_SERVICE_WORKER_SCOPE ||
        AFEX_LEGACY_SERVICE_WORKER_SCOPES.has(scope.pathname)) &&
      [registration.active, registration.waiting, registration.installing].some(
        isOwnedAfexWorker
      )
    )
  } catch {
    return false
  }
}

function requestWorkerDisable(worker: ServiceWorker) {
  return new Promise<boolean>((resolve) => {
    const channel = new MessageChannel()
    let settled = false
    const finish = (acknowledged: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      channel.port1.close()
      resolve(acknowledged)
    }
    const timeout = window.setTimeout(() => finish(false), 1_000)
    channel.port1.addEventListener('message', (event) => {
      finish(event.data?.type === 'AFEX_SHELL_DISABLED_V1')
    })
    channel.port1.start()
    try {
      worker.postMessage(
        { type: 'AFEX_DISABLE_SHELL_V1' },
        [channel.port2]
      )
    } catch {
      finish(false)
    }
  })
}

export type AfexOfflineShellCleanupResult = Readonly<{
  status: 'complete' | 'incomplete'
  matchedRegistrations: number
  remainingRegistrations: number
  deletedCaches: number
  remainingCaches: number
  controllerNeutralized: boolean
  classifications: readonly string[]
}>

export async function neutralizeAfexOfflineShell(): Promise<AfexOfflineShellCleanupResult> {
  const classifications = new Set<string>()
  let matchedRegistrations = 0
  let deletedCaches = 0
  let controllerNeutralized = true
  const ownedRegistrationScopes = new Set<string>()
  const serviceWorkerAvailable =
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  const cacheStorageAvailable = typeof caches !== 'undefined'

  if (serviceWorkerAvailable) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      const ownedRegistrations = registrations.filter(isOwnedAfexRegistration)
      matchedRegistrations = ownedRegistrations.length
      for (const registration of ownedRegistrations) {
        ownedRegistrationScopes.add(registration.scope)
      }
      const ownedWorkers = new Set<ServiceWorker>()
      for (const registration of ownedRegistrations) {
        for (const worker of [registration.active, registration.waiting]) {
          if (isOwnedAfexWorker(worker)) ownedWorkers.add(worker as ServiceWorker)
        }
      }
      const controller = navigator.serviceWorker.controller
      if (isOwnedAfexWorker(controller)) ownedWorkers.add(controller as ServiceWorker)
      const acknowledgements = await Promise.all(
        [...ownedWorkers].map(requestWorkerDisable)
      )
      if (isOwnedAfexWorker(controller)) {
        controllerNeutralized = acknowledgements.every(Boolean)
        if (!controllerNeutralized) {
          classifications.add('AFEX_SHELL_CONTROLLER_DISABLE_UNCONFIRMED')
        }
      }
      await Promise.all(
        ownedRegistrations.map(async (registration) => {
          try {
            await registration.unregister()
          } catch {
            classifications.add('AFEX_SHELL_UNREGISTER_FAILED')
          }
        })
      )
    } catch {
      classifications.add('AFEX_SHELL_REGISTRATION_INSPECTION_FAILED')
    }
  }

  if (cacheStorageAvailable) {
    try {
      const ownedCacheNames = (await caches.keys()).filter((cacheName) =>
        cacheName.startsWith(AFEX_SHELL_CACHE_PREFIX)
      )
      const deletions = await Promise.all(
        ownedCacheNames.map(async (cacheName) => {
          try {
            return await caches.delete(cacheName)
          } catch {
            classifications.add('AFEX_SHELL_CACHE_DELETE_FAILED')
            return false
          }
        })
      )
      deletedCaches = deletions.filter(Boolean).length
    } catch {
      classifications.add('AFEX_SHELL_CACHE_INSPECTION_FAILED')
    }
  }

  let remainingRegistrations = 0
  let remainingCaches = 0
  if (serviceWorkerAvailable) {
    try {
      remainingRegistrations = (
        await navigator.serviceWorker.getRegistrations()
      ).filter(
        (registration) =>
          isOwnedAfexRegistration(registration) ||
          ownedRegistrationScopes.has(registration.scope)
      ).length
    } catch {
      classifications.add('AFEX_SHELL_REGISTRATION_VERIFICATION_FAILED')
      remainingRegistrations = matchedRegistrations || 1
    }
  }
  if (cacheStorageAvailable) {
    try {
      remainingCaches = (await caches.keys()).filter((cacheName) =>
        cacheName.startsWith(AFEX_SHELL_CACHE_PREFIX)
      ).length
    } catch {
      classifications.add('AFEX_SHELL_CACHE_VERIFICATION_FAILED')
      remainingCaches = 1
    }
  }
  if (remainingRegistrations > 0) {
    classifications.add('AFEX_SHELL_REGISTRATION_RESIDUE')
  }
  if (remainingCaches > 0) {
    classifications.add('AFEX_SHELL_CACHE_RESIDUE')
  }

  return {
    status:
      remainingRegistrations === 0 &&
      remainingCaches === 0 &&
      controllerNeutralized &&
      classifications.size === 0
        ? 'complete'
        : 'incomplete',
    matchedRegistrations,
    remainingRegistrations,
    deletedCaches,
    remainingCaches,
    controllerNeutralized,
    classifications: [...classifications].sort(compareCanonicalStrings),
  }
}

export async function calculateSnapshotPageHash(
  records: ReadonlyArray<{ recordKey: string; value: unknown }>
) {
  const canonical = records
    .map((record) => [requireIdentifier(record.recordKey, 'recordKey'), record.value])
    .sort(([left], [right]) =>
      compareCanonicalStrings(String(left), String(right))
    )
  return sha256Base64Url(canonicalSnapshotJson(canonical))
}

export async function calculateSnapshotClosureHash(
  pages: ReadonlyArray<{
    pageNumber: number
    recordCount: number
    hash: string
  }>
) {
  return sha256Base64Url(
    canonicalSnapshotJson(
      [...pages]
        .sort((left, right) => left.pageNumber - right.pageNumber)
        .map(({ pageNumber, recordCount, hash }) => ({
          pageNumber,
          recordCount,
          hash,
        }))
    )
  )
}

export class Phase2DatasetRepository {
  readonly databaseName: string
  readonly keyManager: OfflineKeyManager
  private readonly allowSyntheticAuthority: boolean
  private readonly now: () => number

  constructor(options: RepositoryOptions = {}) {
    this.databaseName = options.databaseName ?? OFFLINE_DATABASE_NAME
    this.keyManager = options.keyManager ?? offlineKeyManager
    this.allowSyntheticAuthority =
      options.allowSyntheticAuthority === true &&
      process.env.NODE_ENV !== 'production'
    this.now = options.now ?? Date.now
  }

  async beginSnapshot(input: {
    namespaceId: string
    datasetId: Phase2DatasetId
    datasetSchemaVersion: number
    snapshotVersion: string
    sourceContractVersion: string
    confirmedAtServer: string
    freshnessMs: number
    expectedPageCount: number
    expectedRecordCount: number
    expectedClosureHash: string
    writerId?: string
  }): Promise<SnapshotWriter> {
    this.assertWriteAuthority(input.namespaceId)
    const namespaceId = requireIdentifier(input.namespaceId, 'namespace')
    const snapshotVersion = requireIdentifier(
      input.snapshotVersion,
      'snapshotVersion'
    )
    const sourceContractVersion = requireIdentifier(
      input.sourceContractVersion,
      'sourceContractVersion'
    )
    const writerId = requireIdentifier(
      input.writerId ?? crypto.randomUUID(),
      'writerId'
    )
    const expectedPageCount = requirePositiveInteger(input.expectedPageCount)
    const expectedRecordCount = requireNonNegativeInteger(
      input.expectedRecordCount
    )
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(
        OFFLINE_STORES.datasetManifests,
        'readwrite'
      )
      const store = transaction.objectStore(OFFLINE_STORES.datasetManifests)
      const id = manifestId(namespaceId, input.datasetId, snapshotVersion)
      const existing = (await requestAsPromise(
        store.get(id)
      )) as DatasetManifestRecord | undefined
      const now = this.now()
      if (
        existing?.status === 'complete' ||
        (existing?.writerId &&
          existing.writerId !== writerId &&
          (existing.writerLeaseExpiresAt ?? 0) > now)
      ) {
        transaction.abort()
        throw new OfflinePhase1Error('OFFLINE_DATABASE_BLOCKED', true)
      }
      const timestamp = new Date(now).toISOString()
      store.put({
        id,
        namespaceId,
        datasetId: input.datasetId,
        datasetSchemaVersion: requirePositiveInteger(
          input.datasetSchemaVersion
        ),
        snapshotVersion,
        status: 'incomplete',
        sourceContractVersion,
        confirmedAtServer: requireServerTimestamp(input.confirmedAtServer),
        freshnessMs: requirePositiveInteger(input.freshnessMs),
        expectedPageCount,
        expectedRecordCount,
        expectedClosureHash: requireIdentifier(
          input.expectedClosureHash,
          'expectedClosureHash'
        ),
        pageClosures: existing?.pageClosures ?? [],
        writerId,
        writerLeaseExpiresAt: now + SNAPSHOT_WRITER_LEASE_MS,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        completedAt: null,
      } satisfies DatasetManifestRecord)
      await transactionAsPromise(transaction)
      return {
        namespaceId,
        datasetId: input.datasetId,
        snapshotVersion,
        writerId,
      }
    } finally {
      database.close()
    }
  }

  async stageSnapshotPage(
    writer: SnapshotWriter,
    input: {
      pageNumber: number
      records: ReadonlyArray<{ recordKey: string; value: unknown }>
    }
  ) {
    this.assertWriteAuthority(writer.namespaceId)
    const preliminaryManifest = await this.getManifest(writer)
    this.assertWriter(preliminaryManifest, writer)
    const pageNumber = requirePositiveInteger(input.pageNumber)
    if (input.records.length > MAX_SNAPSHOT_PAGE_SIZE) {
      throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
    }
    const normalizedRecords = input.records.map((record) => ({
      recordKey: requireIdentifier(record.recordKey, 'recordKey'),
      value: record.value,
    }))
    if (new Set(normalizedRecords.map((record) => record.recordKey)).size !== normalizedRecords.length) {
      throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
    }
    const pageHash = await calculateSnapshotPageHash(normalizedRecords)
    const { key, keyVersion } = this.keyManager.requireKey(writer.namespaceId)
    const storeName = datasetStore(writer.datasetId)
    const now = new Date(this.now()).toISOString()
    const encryptedRecords = await Promise.all(
      normalizedRecords.map(async (record) => {
        const envelopeKey = encryptedRecordKey(
          writer.datasetId,
          writer.snapshotVersion,
          record.recordKey
        )
        return {
          id: `${writer.namespaceId}:${envelopeKey}`,
          namespaceId: writer.namespaceId,
          datasetId: writer.datasetId,
          datasetSchemaVersion: preliminaryManifest.datasetSchemaVersion,
          snapshotVersion: writer.snapshotVersion,
          recordKey: record.recordKey,
          envelope: await encryptOfflineRecord({
            key,
            keyVersion,
            namespaceId: writer.namespaceId,
            storeName,
            recordKey: envelopeKey,
            value: record.value,
          }),
          createdAt: now,
          updatedAt: now,
        } satisfies DatasetRecord
      })
    )
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(
        [OFFLINE_STORES.datasetManifests, storeName],
        'readwrite'
      )
      const manifestStore = transaction.objectStore(
        OFFLINE_STORES.datasetManifests
      )
      const id = manifestId(
        writer.namespaceId,
        writer.datasetId,
        writer.snapshotVersion
      )
      const manifest = (await requestAsPromise(
        manifestStore.get(id)
      )) as DatasetManifestRecord | undefined
      this.assertWriter(manifest, writer)
      if (manifest.updatedAt !== preliminaryManifest.updatedAt) {
        transaction.abort()
        throw new OfflinePhase1Error('OFFLINE_DATABASE_BLOCKED', true)
      }
      if (pageNumber > manifest.expectedPageCount) {
        transaction.abort()
        throw new OfflinePhase1Error('OFFLINE_CONTEXT_INVALID')
      }
      const existingPage = manifest.pageClosures.find(
        (page) => page.pageNumber === pageNumber
      )
      if (existingPage) {
        if (
          existingPage.hash !== pageHash ||
          existingPage.recordCount !== normalizedRecords.length
        ) {
          transaction.abort()
          throw new OfflinePhase1Error('OFFLINE_INTEGRITY_FAILED')
        }
        await transactionAsPromise(transaction)
        return { status: 'already_staged' as const, pageHash }
      }
      const recordStore = transaction.objectStore(storeName)
      for (const record of encryptedRecords) recordStore.put(record)
      manifestStore.put({
        ...manifest,
        pageClosures: [
          ...manifest.pageClosures,
          {
            pageNumber,
            recordCount: normalizedRecords.length,
            hash: pageHash,
          },
        ],
        writerLeaseExpiresAt: this.now() + SNAPSHOT_WRITER_LEASE_MS,
        updatedAt: now,
      } satisfies DatasetManifestRecord)
      await transactionAsPromise(transaction)
      return { status: 'staged' as const, pageHash }
    } finally {
      database.close()
    }
  }

  async completeSnapshot(
    writer: SnapshotWriter,
    options: Readonly<{ retainSnapshotVersions?: readonly string[] }> = {}
  ) {
    this.assertWriteAuthority(writer.namespaceId)
    const storeName = datasetStore(writer.datasetId)
    const preliminary = await this.getManifest(writer)
    this.assertWriter(preliminary, writer)
    const orderedPages = [...preliminary.pageClosures].sort(
      (left, right) => left.pageNumber - right.pageNumber
    )
    const closureHash = await calculateSnapshotClosureHash(orderedPages)
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(
        [OFFLINE_STORES.datasetManifests, storeName],
        'readwrite'
      )
      const manifestStore = transaction.objectStore(
        OFFLINE_STORES.datasetManifests
      )
      const id = manifestId(
        writer.namespaceId,
        writer.datasetId,
        writer.snapshotVersion
      )
      const manifest = (await requestAsPromise(
        manifestStore.get(id)
      )) as DatasetManifestRecord | undefined
      this.assertWriter(manifest, writer)
      if (manifest.updatedAt !== preliminary.updatedAt) {
        transaction.abort()
        throw new OfflinePhase1Error('OFFLINE_DATABASE_BLOCKED', true)
      }
      const pagesAreClosed =
        orderedPages.length === manifest.expectedPageCount &&
        orderedPages.every((page, index) => page.pageNumber === index + 1)
      const recordCount = await requestAsPromise(
        transaction
          .objectStore(storeName)
          .index('namespaceSnapshot')
          .count(
            IDBKeyRange.only([
              writer.namespaceId,
              writer.snapshotVersion,
            ])
          )
      )
      if (
        !pagesAreClosed ||
        recordCount !== manifest.expectedRecordCount ||
        closureHash !== manifest.expectedClosureHash
      ) {
        transaction.abort()
        throw new OfflinePhase1Error('OFFLINE_INTEGRITY_FAILED')
      }
      const completedAt = new Date(this.now()).toISOString()
      manifestStore.put({
        ...manifest,
        status: 'complete',
        writerId: null,
        writerLeaseExpiresAt: null,
        updatedAt: completedAt,
        completedAt,
      } satisfies DatasetManifestRecord)
      const completeManifests = (await requestAsPromise(
        manifestStore
          .index('namespaceDatasetStatus')
          .getAll(
            IDBKeyRange.only([
              writer.namespaceId,
              writer.datasetId,
              'complete',
            ])
          )
      )) as DatasetManifestRecord[]
      const retained = [...completeManifests, { ...manifest, completedAt }]
        .filter(
          (entry, index, list) =>
            list.findIndex((candidate) => candidate.id === entry.id) === index
        )
        .sort((left, right) => {
          const completedOrder = (right.completedAt ?? '').localeCompare(
            left.completedAt ?? ''
          )
          return completedOrder || right.snapshotVersion.localeCompare(
            left.snapshotVersion
          )
        })
      const protectedVersions = new Set(
        (options.retainSnapshotVersions ?? []).map((version) =>
          requireIdentifier(version, 'retainedSnapshotVersion')
        )
      )
      for (const obsolete of retained.slice(2)) {
        if (protectedVersions.has(obsolete.snapshotVersion)) continue
        manifestStore.delete(obsolete.id)
        await this.deleteSnapshotRecords(
          transaction.objectStore(storeName),
          obsolete.namespaceId,
          obsolete.snapshotVersion
        )
      }
      await transactionAsPromise(transaction)
      return {
        status: 'complete' as const,
        snapshotVersion: writer.snapshotVersion,
        recordCount,
        confirmedAtServer: manifest.confirmedAtServer,
      }
    } finally {
      database.close()
    }
  }

  async readCompleteSnapshotPage<T>(input: {
    namespaceId: string
    datasetId: Phase2DatasetId
    snapshotVersion?: string
    limit?: number
    afterRecordKey?: string
  }) {
    const authority = this.requireReadAuthority(
      input.namespaceId,
      input.datasetId
    )
    const limit = Math.min(
      requirePositiveInteger(input.limit ?? 100, MAX_READ_PAGE_SIZE),
      MAX_READ_PAGE_SIZE
    )
    const manifest = input.snapshotVersion
      ? await this.completeManifestByVersion(
          authority.namespaceId,
          authority.datasetId,
          requireIdentifier(input.snapshotVersion, 'snapshotVersion')
        )
      : await this.latestCompleteManifest(
          authority.namespaceId,
          authority.datasetId
        )
    if (!manifest) {
      return {
        status: 'missing' as const,
        records: [] as Array<{ recordKey: string; value: T }>,
        nextCursor: null,
        asOf: null,
        stale: false,
      }
    }
    const storeName = datasetStore(authority.datasetId)
    const records = await this.readRecordPage(
      storeName,
      authority.namespaceId,
      manifest.snapshotVersion,
      input.afterRecordKey,
      limit
    )
    const values = await Promise.all(
      records.map(async (record) => ({
        recordKey: record.recordKey,
        value: await decryptOfflineRecord<T>({
          key: this.keyManager.requireKey(authority.namespaceId).key,
          namespaceId: authority.namespaceId,
          storeName,
          recordKey: encryptedRecordKey(
            authority.datasetId,
            manifest.snapshotVersion,
            record.recordKey
          ),
          envelope: record.envelope,
        }),
      }))
    )
    return {
      status: 'ready' as const,
      records: values,
      nextCursor:
        records.length === limit ? records.at(-1)?.recordKey ?? null : null,
      asOf: manifest.confirmedAtServer,
      stale:
        this.now() - Date.parse(manifest.confirmedAtServer) >
        manifest.freshnessMs,
    }
  }

  async getSafeAvailability(
    namespaceId: string,
    datasetId: Phase2DatasetId,
    snapshotVersion?: string
  ) {
    const authority = this.requireReadAuthority(namespaceId, datasetId)
    const manifest = snapshotVersion
      ? await this.completeManifestByVersion(
          authority.namespaceId,
          authority.datasetId,
          requireIdentifier(snapshotVersion, 'snapshotVersion')
        )
      : await this.latestCompleteManifest(
          authority.namespaceId,
          authority.datasetId
        )
    return manifest
      ? {
          status: 'complete' as const,
          snapshotVersion: manifest.snapshotVersion,
          asOf: manifest.confirmedAtServer,
          stale:
            this.now() - Date.parse(manifest.confirmedAtServer) >
            manifest.freshnessMs,
        }
      : { status: 'missing' as const }
  }

  private assertWriteAuthority(namespaceId: string) {
    this.keyManager.requireKey(namespaceId)
    if (
      this.allowSyntheticAuthority &&
      process.env.NODE_ENV !== 'production'
    ) {
      return
    }
    if (
      !OFFLINE_CAPABILITIES.persistentUnwrapAuthority ||
      !OFFLINE_PHASE2_CAPABILITIES.encryptedDatasetStore ||
      !OFFLINE_PHASE2_CAPABILITIES.datasetBootstrap
    ) {
      throw new OfflinePhase1Error('OFFLINE_AUTHORITY_UNAVAILABLE')
    }
  }

  private assertReadAuthority(
    namespaceId: string,
    datasetId: Phase2DatasetId
  ) {
    this.keyManager.requireKey(namespaceId)
    const datasetAllowed =
      datasetId === 'catalog' || datasetId === 'runtimeSettings'
        ? OFFLINE_PHASE2_CAPABILITIES.catalogReads
        : datasetId === 'customers'
          ? OFFLINE_PHASE2_CAPABILITIES.customerReads
          : datasetId === 'mediaRefs'
            ? OFFLINE_PHASE2_CAPABILITIES.mediaCache
            : OFFLINE_PHASE2_CAPABILITIES.orderInvoiceReads
    if (
      !this.allowSyntheticAuthority &&
      (!OFFLINE_CAPABILITIES.persistentUnwrapAuthority || !datasetAllowed)
    ) {
      throw new OfflinePhase1Error('OFFLINE_AUTHORITY_UNAVAILABLE')
    }
  }

  private requireReadAuthority(
    namespaceId: string,
    datasetId: string
  ) {
    const normalizedNamespaceId = requireIdentifier(namespaceId, 'namespace')
    const normalizedDatasetId = requireDatasetId(datasetId)
    this.assertReadAuthority(normalizedNamespaceId, normalizedDatasetId)
    return {
      namespaceId: normalizedNamespaceId,
      datasetId: normalizedDatasetId,
    }
  }

  private assertWriter(
    manifest: DatasetManifestRecord | undefined,
    writer: SnapshotWriter
  ): asserts manifest is DatasetManifestRecord {
    if (
      !manifest ||
      manifest.status !== 'incomplete' ||
      manifest.namespaceId !== writer.namespaceId ||
      manifest.datasetId !== writer.datasetId ||
      manifest.snapshotVersion !== writer.snapshotVersion ||
      manifest.writerId !== writer.writerId ||
      (manifest.writerLeaseExpiresAt ?? 0) <= this.now()
    ) {
      throw new OfflinePhase1Error('OFFLINE_DATABASE_BLOCKED', true)
    }
  }

  private async latestCompleteManifest(
    namespaceId: string,
    datasetId: Phase2DatasetId
  ) {
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(
        OFFLINE_STORES.datasetManifests,
        'readonly'
      )
      const manifests = (await requestAsPromise(
        transaction
          .objectStore(OFFLINE_STORES.datasetManifests)
          .index('namespaceDatasetStatus')
          .getAll(IDBKeyRange.only([namespaceId, datasetId, 'complete']))
      )) as DatasetManifestRecord[]
      await transactionAsPromise(transaction)
      return manifests.sort((left, right) =>
        (right.completedAt ?? '').localeCompare(left.completedAt ?? '')
      )[0]
    } finally {
      database.close()
    }
  }

  private async completeManifestByVersion(
    namespaceId: string,
    datasetId: Phase2DatasetId,
    snapshotVersion: string
  ) {
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(
        OFFLINE_STORES.datasetManifests,
        'readonly'
      )
      const manifest = (await requestAsPromise(
        transaction
          .objectStore(OFFLINE_STORES.datasetManifests)
          .get(manifestId(namespaceId, datasetId, snapshotVersion))
      )) as DatasetManifestRecord | undefined
      await transactionAsPromise(transaction)
      return manifest?.status === 'complete' ? manifest : undefined
    } finally {
      database.close()
    }
  }

  private async getManifest(writer: SnapshotWriter) {
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(
        OFFLINE_STORES.datasetManifests,
        'readonly'
      )
      const manifest = (await requestAsPromise(
        transaction
          .objectStore(OFFLINE_STORES.datasetManifests)
          .get(
            manifestId(
              writer.namespaceId,
              writer.datasetId,
              writer.snapshotVersion
            )
          )
      )) as DatasetManifestRecord | undefined
      await transactionAsPromise(transaction)
      return manifest
    } finally {
      database.close()
    }
  }

  private async readRecordPage(
    storeName: ReturnType<typeof datasetStore>,
    namespaceId: string,
    snapshotVersion: string,
    afterRecordKey: string | undefined,
    limit: number
  ) {
    const database = await openOfflineDatabase(this.databaseName)
    try {
      const transaction = database.transaction(storeName, 'readonly')
      const index = transaction
        .objectStore(storeName)
        .index('namespaceSnapshotRecord')
      const lower = [namespaceId, snapshotVersion, afterRecordKey ?? '']
      const upper = [namespaceId, snapshotVersion, '\uffff']
      const range = IDBKeyRange.bound(lower, upper, Boolean(afterRecordKey), false)
      const records = await new Promise<DatasetRecord[]>((resolve, reject) => {
        const collected: DatasetRecord[] = []
        const request = index.openCursor(range)
        request.addEventListener('error', () => reject(request.error), {
          once: true,
        })
        request.addEventListener('success', () => {
          const cursor = request.result
          if (!cursor || collected.length >= limit) {
            resolve(collected)
            return
          }
          collected.push(cursor.value as DatasetRecord)
          cursor.continue()
        })
      })
      await transactionAsPromise(transaction)
      return records
    } finally {
      database.close()
    }
  }

  private async deleteSnapshotRecords(
    store: IDBObjectStore,
    namespaceId: string,
    snapshotVersion: string
  ) {
    const index = store.index('namespaceSnapshot')
    const range = IDBKeyRange.only([namespaceId, snapshotVersion])
    await new Promise<void>((resolve, reject) => {
      const request = index.openKeyCursor(range)
      request.addEventListener('error', () => reject(request.error), {
        once: true,
      })
      request.addEventListener('success', () => {
        const cursor = request.result
        if (!cursor) {
          resolve()
          return
        }
        store.delete(cursor.primaryKey)
        cursor.continue()
      })
    })
  }
}

export class Phase2BootstrapCoordinator {
  private state: Phase2CoordinatorState = 'idle'
  private listeners = new Set<(state: Phase2CoordinatorState) => void>()

  getState() {
    return this.state
  }

  subscribe(listener: (state: Phase2CoordinatorState) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async prepareBeforePin() {
    this.setState('preparing')
    this.setState('locked')
    return {
      state: this.state,
      classification: 'PERSISTENT_UNWRAP_AUTHORITY_REQUIRED' as const,
      requestsStarted: 0,
      plaintextStored: false,
    }
  }

  async afterPin() {
    this.setState('locked')
    return {
      state: this.state,
      classification: 'PERSISTENT_UNWRAP_AUTHORITY_REQUIRED' as const,
      readableDatasets: 0,
    }
  }

  private setState(state: Phase2CoordinatorState) {
    this.state = state
    for (const listener of this.listeners) listener(state)
  }
}

export function formatPhase2Freshness(input: {
  asOf: string
  stale: boolean
}) {
  return {
    asOf: requireServerTimestamp(input.asOf),
    label: input.stale
      ? `بيانات محفوظة — حتى ${requireServerTimestamp(input.asOf)}`
      : `محدّث حتى ${requireServerTimestamp(input.asOf)}`,
    stale: input.stale,
  }
}

export function isInsideServerOwnedWindow(
  confirmedAt: string,
  serverCutoff: string
) {
  return Date.parse(requireServerTimestamp(confirmedAt)) > Date.parse(
    requireServerTimestamp(serverCutoff)
  )
}

export function assertNoPhase2BusinessDispatch() {
  return (
    OFFLINE_PHASE2_CAPABILITIES.businessMutationDispatch === false &&
    OFFLINE_CAPABILITIES.businessCommandDispatch === false
  )
}

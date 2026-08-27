import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import { chromium } from '@playwright/test'

const phase1Path = new URL('../lib/offline/phase1.ts', import.meta.url)
const phase2Path = new URL('../lib/offline/phase2.ts', import.meta.url)
const phase3Path = new URL('../lib/offline/phase3.ts', import.meta.url)

async function transpile(path) {
  return ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
}

async function withBrowser(run, nodeEnv = 'test') {
  const [phase1Source, rawPhase2Source, rawPhase3Source] = await Promise.all([
    transpile(phase1Path),
    transpile(phase2Path),
    transpile(phase3Path),
  ])
  const phase2Source = rawPhase2Source.replace(
    /from ['"]\.\/phase1['"]/gu,
    "from '/phase1.js'"
  )
  const phase3Source = rawPhase3Source
    .replace(/from ['"]\.\/phase1['"]/gu, "from '/phase1.js'")
    .replace(/from ['"]\.\/phase2['"]/gu, "from '/phase2.js'")
  const server = createServer((request, response) => {
    if (request.url === '/phase1.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' })
      response.end(phase1Source)
      return
    }
    if (request.url === '/phase2.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' })
      response.end(phase2Source)
      return
    }
    if (request.url === '/phase3.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' })
      response.end(phase3Source)
      return
    }
    if (request.url === '/api/pos/offline-context') {
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      })
      response.end(
        JSON.stringify({
          success: true,
          context: {
            primarySubjectId: 'synthetic-subject',
            tenantId: 'synthetic-tenant',
            branchId: 'synthetic-branch',
            contextVersion: 1,
            actorAuthority: 'active-pos-actor',
          },
        })
      )
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/html' })
    response.end('<!doctype html><title>AFEX Phase 3</title>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`http://127.0.0.1:${address.port}/`)
  await page.evaluate((environment) => {
    globalThis.process = { env: { NODE_ENV: environment } }
  }, nodeEnv)
  try {
    await run(page)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
}

const syntheticAuthority = {
  accountUserAuthorityReference: 'account-test',
  tenantReference: 'tenant-test',
  branchReference: 'branch-test',
  deviceCacheReference: 'device-test',
  posEmployeeActorReference: 'employee-test',
  actorSessionLeaseReference: 'actor-session-test',
}

const customerPayload = (suffix = 'a') => ({
  aggregateReference: `customer-${suffix}`,
  name: `Synthetic Customer ${suffix}`,
  phone: `05000000${suffix === 'a' ? '01' : '02'}`,
  email: null,
  address: null,
  notes: null,
})

test('authority B, strict shadow flags and every current payment method are explicit', async () => {
  const source = await readFile(phase3Path, 'utf8')
  assert.match(source, /productionPersistence:\s*'BLOCKED'/u)
  assert.match(source, /commandDispatch:\s*false/u)
  assert.match(source, /serviceWorkerDispatch:\s*false/u)
  assert.doesNotMatch(source, /\bfetch\s*\(/u)
  assert.doesNotMatch(source, /localStorage|sessionStorage/u)
  for (const method of [
    'mada',
    'cash',
    'visa',
    'cod',
    'card',
    'bank_transfer',
    'transfer',
    'on_delivery',
  ]) {
    assert.match(source, new RegExp(`'${method}'`, 'u'))
  }
})

test('database v2 migrates to v3 and preserves Phase 1 and Phase 2 records', async () => {
  await withBrowser(async (page) => {
    const result = await page.evaluate(async () => {
      const p1 = await import('/phase1.js')
      const databaseName = `phase3-migration-${crypto.randomUUID()}`
      const request = indexedDB.open(databaseName, 2)
      await new Promise((resolve, reject) => {
        request.onupgradeneeded = () => {
          const db = request.result
          db.createObjectStore('meta', { keyPath: 'id' })
          for (const name of [
            'keyEnvelopes',
            'drafts',
            'quarantine',
            'purgeTombstones',
          ]) {
            const store = db.createObjectStore(name, { keyPath: 'id' })
            store.createIndex('namespaceId', 'namespaceId')
          }
          const manifests = db.createObjectStore('datasetManifests', {
            keyPath: 'id',
          })
          manifests.createIndex('namespaceId', 'namespaceId')
          manifests.createIndex(
            'namespaceDatasetStatus',
            ['namespaceId', 'datasetId', 'status']
          )
          manifests.createIndex(
            'namespaceDatasetConfirmedAt',
            ['namespaceId', 'datasetId', 'confirmedAtServer']
          )
          for (const name of [
            'catalog',
            'customers',
            'orders',
            'invoices',
            'events',
            'runtimeSettings',
            'mediaRefs',
          ]) {
            const store = db.createObjectStore(name, { keyPath: 'id' })
            store.createIndex('namespaceId', 'namespaceId')
            store.createIndex('namespaceSnapshot', ['namespaceId', 'snapshotVersion'])
            store.createIndex(
              'namespaceSnapshotRecord',
              ['namespaceId', 'snapshotVersion', 'recordKey'],
              { unique: true }
            )
          }
        }
        request.onerror = () => reject(request.error)
        request.onsuccess = resolve
      })
      const old = request.result
      const transaction = old.transaction(['drafts', 'catalog'], 'readwrite')
      transaction.objectStore('drafts').put({
        id: 'ns-a:draft-a',
        namespaceId: 'ns-a',
        marker: 'phase1-preserved',
      })
      transaction.objectStore('catalog').put({
        id: 'ns-a:catalog-a',
        namespaceId: 'ns-a',
        snapshotVersion: 'v1',
        recordKey: 'catalog-a',
        marker: 'phase2-preserved',
      })
      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve
        transaction.onerror = () => reject(transaction.error)
      })
      old.close()
      const migrated = await p1.openOfflineDatabase(databaseName)
      const readTransaction = migrated.transaction(
        ['drafts', 'catalog'],
        'readonly'
      )
      const read = (store, id) =>
        new Promise((resolve, reject) => {
          const query = readTransaction.objectStore(store).get(id)
          query.onsuccess = () => resolve(query.result)
          query.onerror = () => reject(query.error)
        })
      const [draft, catalog] = await Promise.all([
        read('drafts', 'ns-a:draft-a'),
        read('catalog', 'ns-a:catalog-a'),
      ])
      const result = {
        version: migrated.version,
        stores: Array.from(migrated.objectStoreNames),
        draft: draft.marker,
        catalog: catalog.marker,
      }
      migrated.close()
      indexedDB.deleteDatabase(databaseName)
      return result
    })
    assert.equal(result.version, 3)
    assert.equal(result.draft, 'phase1-preserved')
    assert.equal(result.catalog, 'phase2-preserved')
    assert.ok(result.stores.includes('commandOutbox'))
    assert.ok(result.stores.includes('commandDependencies'))
  })
})

test('version-aware migration rejects corrupt v2 and v3 structures without silent recreation', async () => {
  await withBrowser(async (page) => {
    const result = await page.evaluate(async () => {
      const p1 = await import('/phase1.js')
      const createPhase1 = (db) => {
        db.createObjectStore('meta', { keyPath: 'id' })
        for (const name of ['keyEnvelopes', 'drafts', 'quarantine', 'purgeTombstones']) {
          const store = db.createObjectStore(name, { keyPath: 'id' })
          store.createIndex('namespaceId', 'namespaceId')
        }
      }
      const createPhase2 = (db, options = {}) => {
        const manifests = db.createObjectStore('datasetManifests', { keyPath: 'id' })
        manifests.createIndex('namespaceId', 'namespaceId')
        manifests.createIndex('namespaceDatasetStatus', ['namespaceId', 'datasetId', 'status'])
        manifests.createIndex('namespaceDatasetConfirmedAt', ['namespaceId', 'datasetId', 'confirmedAtServer'])
        for (const name of ['catalog', 'customers', 'orders', 'invoices', 'events', 'runtimeSettings', 'mediaRefs']) {
          if (name === options.omitStore) continue
          const store = db.createObjectStore(name, { keyPath: 'id' })
          store.createIndex('namespaceId', 'namespaceId')
          store.createIndex('namespaceSnapshot', ['namespaceId', 'snapshotVersion'])
          store.createIndex(
            'namespaceSnapshotRecord',
            options.wrongIndexStore === name
              ? ['namespaceId', 'recordKey']
              : ['namespaceId', 'snapshotVersion', 'recordKey'],
            { unique: true }
          )
        }
      }
      const createPhase3 = (db, options = {}) => {
        const outbox = db.createObjectStore('commandOutbox', { keyPath: 'id' })
        outbox.createIndex('namespaceId', 'namespaceId')
        outbox.createIndex('localCommandId', 'localCommandId', { unique: true })
        outbox.createIndex('namespaceState', ['namespaceId', 'state'])
        outbox.createIndex('namespaceSequence', ['namespaceId', 'localSequence'], {
          unique: options.wrongSequenceUnique ? false : true,
        })
        outbox.createIndex('namespaceIdempotency', ['namespaceId', 'idempotencyKey'], { unique: true })
        outbox.createIndex('namespaceStateCreatedAt', ['namespaceId', 'state', 'createdAtLocal'])
        if (!options.omitDependencies) {
          const dependencies = db.createObjectStore('commandDependencies', { keyPath: 'id' })
          dependencies.createIndex('namespaceId', 'namespaceId')
          dependencies.createIndex('namespaceCommand', ['namespaceId', 'commandId'])
          dependencies.createIndex('namespaceDependency', ['namespaceId', 'dependencyId'])
          dependencies.createIndex('namespaceCommandDependency', ['namespaceId', 'commandId', 'dependencyId'], { unique: true })
        }
      }
      const seed = (name, version, builder) =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open(name, version)
          request.onupgradeneeded = () => builder(request.result)
          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            request.result.close()
            resolve()
          }
        })
      const openErrorCode = async (name) => {
        try {
          const database = await p1.openOfflineDatabase(name)
          database.close()
          return null
        } catch (error) {
          return error.code
        }
      }
      const inspectAtVersion = (name, version, inspect) =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open(name, version)
          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            try {
              resolve(inspect(request.result))
            } finally {
              request.result.close()
            }
          }
        })

      const missingV2 = `phase3-corrupt-v2-missing-${crypto.randomUUID()}`
      await seed(missingV2, 2, (db) => {
        createPhase1(db)
        createPhase2(db, { omitStore: 'catalog' })
      })
      const missingV2Code = await openErrorCode(missingV2)
      const missingV2After = await inspectAtVersion(missingV2, 2, (db) => ({
        version: db.version,
        catalogExists: db.objectStoreNames.contains('catalog'),
        commandOutboxExists: db.objectStoreNames.contains('commandOutbox'),
      }))

      const wrongV2 = `phase3-corrupt-v2-index-${crypto.randomUUID()}`
      await seed(wrongV2, 2, (db) => {
        createPhase1(db)
        createPhase2(db, { wrongIndexStore: 'catalog' })
      })
      const wrongV2Code = await openErrorCode(wrongV2)
      const wrongV2Preserved = await inspectAtVersion(wrongV2, 2, (db) => {
        const transaction = db.transaction('catalog', 'readonly')
        const index = transaction.objectStore('catalog').index('namespaceSnapshotRecord')
        return { keyPath: Array.from(index.keyPath), unique: index.unique }
      })

      const missingV3 = `phase3-corrupt-v3-missing-${crypto.randomUUID()}`
      await seed(missingV3, 3, (db) => {
        createPhase1(db)
        createPhase2(db)
        createPhase3(db, { omitDependencies: true })
      })
      const missingV3Code = await openErrorCode(missingV3)

      const wrongV3 = `phase3-corrupt-v3-index-${crypto.randomUUID()}`
      await seed(wrongV3, 3, (db) => {
        createPhase1(db)
        createPhase2(db)
        createPhase3(db, { wrongSequenceUnique: true })
      })
      const wrongV3Code = await openErrorCode(wrongV3)

      for (const name of [missingV2, wrongV2, missingV3, wrongV3]) {
        indexedDB.deleteDatabase(name)
      }
      return {
        missingV2Code,
        missingV2After,
        wrongV2Code,
        wrongV2Preserved,
        missingV3Code,
        wrongV3Code,
      }
    })
    assert.equal(result.missingV2Code, 'OFFLINE_SCHEMA_CORRUPT')
    assert.deepEqual(result.missingV2After, {
      version: 2,
      catalogExists: false,
      commandOutboxExists: false,
    })
    assert.equal(result.wrongV2Code, 'OFFLINE_SCHEMA_CORRUPT')
    assert.deepEqual(result.wrongV2Preserved, {
      keyPath: ['namespaceId', 'recordKey'],
      unique: true,
    })
    assert.equal(result.missingV3Code, 'OFFLINE_SCHEMA_CORRUPT')
    assert.equal(result.wrongV3Code, 'OFFLINE_SCHEMA_CORRUPT')
  })
})

test('production denial occurs before any IndexedDB payload write', async () => {
  await withBrowser(async (page) => {
    const result = await page.evaluate(async (authority) => {
      const p3 = await import('/phase3.js')
      const databaseName = `phase3-production-denial-${crypto.randomUUID()}`
      const repository = new p3.Phase3CommandRepository({
        databaseName,
        allowSyntheticAuthority: true,
      })
      let code = null
      try {
        await repository.enqueue({
          namespaceId: 'ns-production',
          commandType: 'customer.create',
          payload: {
            aggregateReference: 'customer-production',
            name: 'Synthetic',
            phone: '0500000000',
            email: null,
            address: null,
            notes: null,
          },
          authority,
          deduplicationKey: 'submit-production',
        })
      } catch (error) {
        code = error.code
      }
      const databases = await indexedDB.databases()
      return {
        code,
        databaseCreated: databases.some((entry) => entry.name === databaseName),
      }
    }, syntheticAuthority)
    assert.deepEqual(result, {
      code: 'OFFLINE_AUTHORITY_UNAVAILABLE',
      databaseCreated: false,
    })
  }, 'production')
})

test('pre-PIN counter denial occurs before IndexedDB access', async () => {
  await withBrowser(async (page) => {
    const result = await page.evaluate(async () => {
      const p1 = await import('/phase1.js')
      const p3 = await import('/phase3.js')
      const databaseName = `phase3-pre-pin-${crypto.randomUUID()}`
      const repository = new p3.Phase3CommandRepository({
        databaseName,
        keyManager: new p1.OfflineKeyManager(),
        allowSyntheticAuthority: true,
      })
      let code = null
      try {
        await repository.getAuthorizedCounters('ns-pre-pin')
      } catch (error) {
        code = error.code
      }
      const databases = await indexedDB.databases()
      return {
        code,
        databaseCreated: databases.some((entry) => entry.name === databaseName),
      }
    })
    assert.deepEqual(result, {
      code: 'OFFLINE_KEY_LOCKED',
      databaseCreated: false,
    })
  })
})

test('encrypted enqueue survives repository restart, converges duplicates and rejects tampering', async () => {
  await withBrowser(async (page) => {
    const result = await page.evaluate(async ({ authority, payload }) => {
      const p1 = await import('/phase1.js')
      const p3 = await import('/phase3.js')
      const namespaceId = 'ns-encrypted-restart'
      const databaseName = `phase3-encrypted-${crypto.randomUUID()}`
      const manager = new p1.OfflineKeyManager()
      const material = await p1.createSyntheticNamespaceKeyMaterial(namespaceId)
      manager.unlock({
        source: 'synthetic-test',
        primaryAuthenticated: true,
        posActorAuthorized: true,
        namespaceId,
        keyVersion: 1,
        key: material.key,
      })
      const firstRepository = new p3.Phase3CommandRepository({
        databaseName,
        keyManager: manager,
        allowSyntheticAuthority: true,
      })
      const first = await firstRepository.enqueue({
        namespaceId,
        commandType: 'customer.create',
        payload,
        authority,
        deduplicationKey: 'customer-submit-a',
      })
      const duplicate = await firstRepository.enqueue({
        namespaceId,
        commandType: 'customer.create',
        payload,
        authority,
        deduplicationKey: 'customer-submit-a',
      })
      const restarted = new p3.Phase3CommandRepository({
        databaseName,
        keyManager: manager,
        allowSyntheticAuthority: true,
      })
      const restored = await restarted.readSyntheticPayload(
        namespaceId,
        first.command.localCommandId
      )
      const database = await p1.openOfflineDatabase(databaseName)
      const transaction = database.transaction('commandOutbox', 'readonly')
      const request = transaction.objectStore('commandOutbox').get(first.command.id)
      const raw = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      database.close()
      const wrongMaterial = await p1.createSyntheticNamespaceKeyMaterial(namespaceId)
      let wrongKeyCode = null
      try {
        await p1.decryptOfflineRecord({
          key: wrongMaterial.key,
          namespaceId,
          storeName: 'commandOutbox',
          recordKey: first.command.localCommandId,
          envelope: raw.immutable.encryptedPayload,
        })
      } catch (error) {
        wrongKeyCode = error.code
      }
      let wrongStoreCode = null
      try {
        await p1.decryptOfflineRecord({
          key: material.key,
          namespaceId,
          storeName: 'drafts',
          recordKey: first.command.localCommandId,
          envelope: raw.immutable.encryptedPayload,
        })
      } catch (error) {
        wrongStoreCode = error.code
      }
      let wrongNamespaceCode = null
      try {
        await p1.decryptOfflineRecord({
          key: material.key,
          namespaceId: 'ns-wrong',
          storeName: 'commandOutbox',
          recordKey: first.command.localCommandId,
          envelope: raw.immutable.encryptedPayload,
        })
      } catch (error) {
        wrongNamespaceCode = error.code
      }
      const tamperedEnvelope = {
        ...raw.immutable.encryptedPayload,
        ciphertext: `${raw.immutable.encryptedPayload.ciphertext.slice(0, -1)}${
          raw.immutable.encryptedPayload.ciphertext.endsWith('A') ? 'B' : 'A'
        }`,
      }
      let ciphertextTamperCode = null
      try {
        await p1.decryptOfflineRecord({
          key: material.key,
          namespaceId,
          storeName: 'commandOutbox',
          recordKey: first.command.localCommandId,
          envelope: tamperedEnvelope,
        })
      } catch (error) {
        ciphertextTamperCode = error.code
      }
      const tamperDatabase = await p1.openOfflineDatabase(databaseName)
      const tamperTransaction = tamperDatabase.transaction('commandOutbox', 'readwrite')
      tamperTransaction.objectStore('commandOutbox').put({
        ...raw,
        immutable: { ...raw.immutable, aggregateId: 'tampered-aggregate' },
      })
      await new Promise((resolve, reject) => {
        tamperTransaction.oncomplete = resolve
        tamperTransaction.onerror = () => reject(tamperTransaction.error)
      })
      tamperDatabase.close()
      let immutableTamperCode = null
      try {
        await restarted.markValidationFailure(namespaceId, first.command.localCommandId)
      } catch (error) {
        immutableTamperCode = error.code
      }
      const ciphertextProjection = JSON.stringify(raw)
      indexedDB.deleteDatabase(databaseName)
      return {
        firstStatus: first.status,
        duplicateStatus: duplicate.status,
        sameId: first.command.localCommandId === duplicate.command.localCommandId,
        sameIdempotency:
          first.command.idempotencyKey === duplicate.command.idempotencyKey,
        restored,
        plaintextAbsent:
          !ciphertextProjection.includes(payload.name) &&
          !ciphertextProjection.includes(payload.phone),
        wrongKeyCode,
        wrongStoreCode,
        wrongNamespaceCode,
        ciphertextTamperCode,
        immutableTamperCode,
      }
    }, { authority: syntheticAuthority, payload: customerPayload('a') })
    assert.equal(result.firstStatus, 'created')
    assert.equal(result.duplicateStatus, 'duplicate')
    assert.equal(result.sameId, true)
    assert.equal(result.sameIdempotency, true)
    assert.deepEqual(result.restored, customerPayload('a'))
    assert.equal(result.plaintextAbsent, true)
    assert.equal(result.wrongKeyCode, 'OFFLINE_INTEGRITY_FAILED')
    assert.equal(result.wrongStoreCode, 'OFFLINE_INTEGRITY_FAILED')
    assert.equal(result.wrongNamespaceCode, 'OFFLINE_INTEGRITY_FAILED')
    assert.equal(result.ciphertextTamperCode, 'OFFLINE_INTEGRITY_FAILED')
    assert.equal(result.immutableTamperCode, 'OFFLINE_INTEGRITY_FAILED')
  })
})

test('two-tab writers allocate unique namespace sequences and one dispatcher lease without dispatch', async () => {
  await withBrowser(async (page) => {
    const result = await page.evaluate(async (authority) => {
      const p1 = await import('/phase1.js')
      const p3 = await import('/phase3.js')
      const namespaceId = 'ns-two-tab'
      const databaseName = `phase3-two-tab-${crypto.randomUUID()}`
      const manager = new p1.OfflineKeyManager()
      const material = await p1.createSyntheticNamespaceKeyMaterial(namespaceId)
      manager.unlock({
        source: 'synthetic-test', primaryAuthenticated: true,
        posActorAuthorized: true, namespaceId, keyVersion: 1, key: material.key,
      })
      const a = new p3.Phase3CommandRepository({ databaseName, keyManager: manager, allowSyntheticAuthority: true })
      const b = new p3.Phase3CommandRepository({ databaseName, keyManager: manager, allowSyntheticAuthority: true })
      const duplicateInput = {
        namespaceId,
        commandType: 'customer.create',
        payload: {
          aggregateReference: 'customer-shared', name: 'Synthetic Shared', phone: '0500000003', email: null, address: null, notes: null,
        },
        authority,
        deduplicationKey: 'submit-shared',
      }
      const [duplicateA, duplicateB] = await Promise.all([
        a.enqueue(duplicateInput),
        b.enqueue(duplicateInput),
      ])
      const [first, second] = await Promise.all([
        a.enqueue({ namespaceId, commandType: 'customer.create', payload: {
          aggregateReference: 'customer-a', name: 'Synthetic A', phone: '0500000001', email: null, address: null, notes: null,
        }, authority, deduplicationKey: 'submit-a' }),
        b.enqueue({ namespaceId, commandType: 'customer.create', payload: {
          aggregateReference: 'customer-b', name: 'Synthetic B', phone: '0500000002', email: null, address: null, notes: null,
        }, authority, deduplicationKey: 'submit-b' }),
      ])
      const [leaseA, leaseB] = await Promise.all([
        a.acquireDispatcherLease(namespaceId, 'tab-a'),
        b.acquireDispatcherLease(namespaceId, 'tab-b'),
      ])
      const winner = leaseA.acquired ? 'tab-a' : 'tab-b'
      const loser = winner === 'tab-a' ? 'tab-b' : 'tab-a'
      const winnerRepository = winner === 'tab-a' ? a : b
      const loserRepository = loser === 'tab-a' ? a : b
      const renewed = await winnerRepository.renewDispatcherLease(namespaceId, winner)
      const released = await winnerRepository.releaseDispatcherLease(namespaceId, winner)
      const acquiredAfterRelease = await loserRepository.acquireDispatcherLease(namespaceId, loser)
      indexedDB.deleteDatabase(databaseName)
      return {
        sequences: [first.command.localSequence, second.command.localSequence],
        duplicateConverged:
          duplicateA.command.localCommandId === duplicateB.command.localCommandId,
        duplicateStatuses: [duplicateA.status, duplicateB.status],
        initialAcquired: [leaseA.acquired, leaseB.acquired],
        renewedDispatch: renewed.dispatchEnabled,
        released,
        acquiredAfterRelease,
      }
    }, syntheticAuthority)
    assert.equal(new Set(result.sequences).size, 2)
    assert.equal(result.duplicateConverged, true)
    assert.deepEqual(result.duplicateStatuses.sort(), ['created', 'duplicate'])
    assert.deepEqual(result.initialAcquired.sort(), [false, true])
    assert.equal(result.renewedDispatch, false)
    assert.equal(result.released.dispatches, 0)
    assert.equal(result.acquiredAfterRelease.acquired, true)
    assert.equal(result.acquiredAfterRelease.dispatchEnabled, false)
  })
})

test('dependency graph orders deterministically and rejects missing, self, cross-scope and cycles', async () => {
  await withBrowser(async (page) => {
    const result = await page.evaluate(async (authority) => {
      const p1 = await import('/phase1.js')
      const p3 = await import('/phase3.js')
      const databaseName = `phase3-deps-${crypto.randomUUID()}`
      const manager = new p1.OfflineKeyManager()
      const keyA = await p1.createSyntheticNamespaceKeyMaterial('ns-deps-a')
      manager.unlock({ source: 'synthetic-test', primaryAuthenticated: true, posActorAuthorized: true, namespaceId: 'ns-deps-a', keyVersion: 1, key: keyA.key })
      const repository = new p3.Phase3CommandRepository({ databaseName, keyManager: manager, allowSyntheticAuthority: true })
      const customer = await repository.enqueue({ namespaceId: 'ns-deps-a', commandType: 'customer.create', payload: {
        aggregateReference: 'customer-local', name: 'Synthetic Customer', phone: '0500000001', email: null, address: null, notes: null,
      }, authority, deduplicationKey: 'customer' })
      const payment = await repository.enqueue({ namespaceId: 'ns-deps-a', commandType: 'payment.employee_attestation', payload: {
        orderAggregateReference: 'order-local', paymentMethod: 'mada', amount: '10.00', currency: 'SAR', employeeConfirmedExternalPayment: true,
        employeeConfirmedAtLocal: '2026-08-25T00:00:00.000Z', paymentProviderConfirmationStatus: 'employee_attested',
        paymentReplayPolicy: 'never_charge_or_invoke_provider', reconciliationStatus: 'pending',
      }, authority, deduplicationKey: 'payment' })
      const order = await repository.enqueue({ namespaceId: 'ns-deps-a', commandType: 'order.create', payload: {
        aggregateReference: 'order-local', customerReference: { kind: 'local', id: customer.command.localCommandId },
        itemReferences: [{ catalogItemReference: 'catalog-1', quantity: 1 }], paymentAttestationCommandId: payment.command.localCommandId,
      }, authority, dependencyIds: [customer.command.localCommandId, payment.command.localCommandId], deduplicationKey: 'order' })
      const plan = await repository.getFutureDispatchPlan('ns-deps-a', [order.command.localCommandId, payment.command.localCommandId, customer.command.localCommandId])
      let wrongPaymentType = null
      try {
        await repository.enqueue({ namespaceId: 'ns-deps-a', commandType: 'order.create', payload: {
          aggregateReference: 'order-wrong-payment', customerReference: { kind: 'server', id: 'customer-server' },
          itemReferences: [{ catalogItemReference: 'catalog-1', quantity: 1 }], paymentAttestationCommandId: customer.command.localCommandId,
        }, authority, dependencyIds: [customer.command.localCommandId], deduplicationKey: 'wrong-payment-type' })
      } catch (error) { wrongPaymentType = error.code }
      let paymentAggregateReuse = null
      try {
        await repository.enqueue({ namespaceId: 'ns-deps-a', commandType: 'order.create', payload: {
          aggregateReference: 'order-other', customerReference: { kind: 'server', id: 'customer-server' },
          itemReferences: [{ catalogItemReference: 'catalog-1', quantity: 1 }], paymentAttestationCommandId: payment.command.localCommandId,
        }, authority, dependencyIds: [payment.command.localCommandId], deduplicationKey: 'payment-reuse' })
      } catch (error) { paymentAggregateReuse = error.code }
      let wrongLocalCustomerType = null
      try {
        await repository.enqueue({ namespaceId: 'ns-deps-a', commandType: 'order.create', payload: {
          aggregateReference: 'order-local', customerReference: { kind: 'local', id: payment.command.localCommandId },
          itemReferences: [{ catalogItemReference: 'catalog-1', quantity: 1 }], paymentAttestationCommandId: payment.command.localCommandId,
        }, authority, dependencyIds: [payment.command.localCommandId], deduplicationKey: 'wrong-customer-type' })
      } catch (error) { wrongLocalCustomerType = error.code }
      const paymentB = await repository.enqueue({ namespaceId: 'ns-deps-a', commandType: 'payment.employee_attestation', payload: {
        orderAggregateReference: 'order-b', paymentMethod: 'cash', amount: '20.00', currency: 'SAR', employeeConfirmedExternalPayment: true,
        employeeConfirmedAtLocal: '2026-08-25T00:00:00.000Z', paymentProviderConfirmationStatus: 'not_integrated',
        paymentReplayPolicy: 'never_charge_or_invoke_provider', reconciliationStatus: 'not_required',
      }, authority, deduplicationKey: 'payment-b' })
      const orderB = await repository.enqueue({ namespaceId: 'ns-deps-a', commandType: 'order.create', payload: {
        aggregateReference: 'order-b', customerReference: { kind: 'server', id: 'customer-server' },
        itemReferences: [{ catalogItemReference: 'catalog-2', quantity: 1 }], paymentAttestationCommandId: paymentB.command.localCommandId,
      }, authority, dependencyIds: [paymentB.command.localCommandId], deduplicationKey: 'order-b' })
      let differentOrder = null
      try {
        await repository.enqueue({ namespaceId: 'ns-deps-a', commandType: 'order.status.change', payload: {
          orderReference: { kind: 'local', id: orderB.command.localCommandId }, fromStatus: 'pending', toStatus: 'ready', transitionContractVersion: 'v1',
        }, authority, dependencyIds: [order.command.localCommandId], deduplicationKey: 'different-order' })
      } catch (error) { differentOrder = error.code }
      let substitutedAudit = null
      try {
        await repository.enqueue({ namespaceId: 'ns-deps-a', commandType: 'audit.event.append', payload: {
          aggregateReference: 'audit-order-local', causalCommandId: order.command.localCommandId, eventType: 'synthetic.audit', details: {},
        }, authority, dependencyIds: [customer.command.localCommandId], deduplicationKey: 'substituted-audit' })
      } catch (error) { substitutedAudit = error.code }
      let dependencyMutation = null
      try {
        await repository.enqueue({ namespaceId: 'ns-deps-a', commandType: 'order.create', payload: {
          aggregateReference: 'order-local', customerReference: { kind: 'local', id: customer.command.localCommandId },
          itemReferences: [{ catalogItemReference: 'catalog-1', quantity: 1 }], paymentAttestationCommandId: payment.command.localCommandId,
        }, authority, dependencyIds: [customer.command.localCommandId, payment.command.localCommandId, orderB.command.localCommandId], deduplicationKey: 'order' })
      } catch (error) { dependencyMutation = error.code }
      let missing = null
      try {
        await repository.enqueue({ namespaceId: 'ns-deps-a', commandType: 'order.status.change', payload: {
          orderReference: { kind: 'local', id: 'lc_missing' }, fromStatus: 'pending', toStatus: 'ready', transitionContractVersion: 'v1',
        }, authority, dependencyIds: ['lc_missing'], deduplicationKey: 'missing' })
      } catch (error) { missing = error.code }
      const keyB = await p1.createSyntheticNamespaceKeyMaterial('ns-deps-b')
      manager.unlock({ source: 'synthetic-test', primaryAuthenticated: true, posActorAuthorized: true, namespaceId: 'ns-deps-b', keyVersion: 1, key: keyB.key })
      let cross = null
      try {
        await repository.enqueue({ namespaceId: 'ns-deps-b', commandType: 'order.status.change', payload: {
          orderReference: { kind: 'local', id: order.command.localCommandId }, fromStatus: 'pending', toStatus: 'ready', transitionContractVersion: 'v1',
        }, authority, dependencyIds: [order.command.localCommandId], deduplicationKey: 'cross' })
      } catch (error) { cross = error.code }
      manager.unlock({ source: 'synthetic-test', primaryAuthenticated: true, posActorAuthorized: true, namespaceId: 'ns-deps-a', keyVersion: 1, key: keyA.key })
      const restarted = new p3.Phase3CommandRepository({ databaseName, keyManager: manager, allowSyntheticAuthority: true })
      const restartPlan = await restarted.getFutureDispatchPlan('ns-deps-a', [order.command.localCommandId, payment.command.localCommandId, customer.command.localCommandId])
      const raw = await p1.openOfflineDatabase(databaseName)
      const rawTransaction = raw.transaction('commandOutbox', 'readonly')
      const persistedOrder = await new Promise((resolve, reject) => {
        const query = rawTransaction.objectStore('commandOutbox').index('localCommandId').get(order.command.localCommandId)
        query.onsuccess = () => resolve(query.result)
        query.onerror = () => reject(query.error)
      })
      raw.close()
      const fake = (id, dependencyIds) => ({ namespaceId: 'ns-cycle', localCommandId: id, immutable: { dependencyIds } })
      let cycle = null
      let self = null
      try { p3.topologicallyOrderPhase3Commands([fake('a', ['b']), fake('b', ['a'])]) } catch (error) { cycle = error.code }
      try { p3.topologicallyOrderPhase3Commands([fake('a', ['a'])]) } catch (error) { self = error.code }
      indexedDB.deleteDatabase(databaseName)
      return {
        plan, missing, cross, cycle, self, wrongPaymentType, paymentAggregateReuse,
        wrongLocalCustomerType, differentOrder, substitutedAudit, dependencyMutation,
        restartPlan, originalProjectionHash: order.command.immutable.dependencyProjectionHash,
        persistedProjectionHash: persistedOrder.immutable.dependencyProjectionHash,
      }
    }, syntheticAuthority)
    assert.equal(result.plan.dispatched, 0)
    assert.deepEqual(result.plan.orderedCommandIds.slice(-1).length, 1)
    assert.equal(result.plan.orderedCommandIds.at(-1) !== undefined, true)
    assert.ok(result.plan.eligibility.every((entry) => entry.eligible === false))
    assert.equal(result.missing, 'OFFLINE_CONTEXT_INVALID')
    assert.equal(result.cross, 'OFFLINE_CROSS_SCOPE_DENIED')
    assert.equal(result.cycle, 'OFFLINE_INTEGRITY_FAILED')
    assert.equal(result.self, 'OFFLINE_INTEGRITY_FAILED')
    assert.equal(result.wrongPaymentType, 'OFFLINE_CONTEXT_INVALID')
    assert.equal(result.paymentAggregateReuse, 'OFFLINE_CONTEXT_INVALID')
    assert.equal(result.wrongLocalCustomerType, 'OFFLINE_CONTEXT_INVALID')
    assert.equal(result.differentOrder, 'OFFLINE_CONTEXT_INVALID')
    assert.equal(result.substitutedAudit, 'OFFLINE_CONTEXT_INVALID')
    assert.equal(result.dependencyMutation, 'OFFLINE_CONTEXT_INVALID')
    assert.equal(result.restartPlan.dispatched, 0)
    assert.equal(result.originalProjectionHash, result.persistedProjectionHash)
  })
})

test('state machine rejects illegal transitions and abandoned syncing recovery sends nothing', async () => {
  await withBrowser(async (page) => {
    const result = await page.evaluate(async (authority) => {
      const p1 = await import('/phase1.js')
      const p3 = await import('/phase3.js')
      const namespaceId = 'ns-state'
      const databaseName = `phase3-state-${crypto.randomUUID()}`
      const manager = new p1.OfflineKeyManager()
      const material = await p1.createSyntheticNamespaceKeyMaterial(namespaceId)
      manager.unlock({ source: 'synthetic-test', primaryAuthenticated: true, posActorAuthorized: true, namespaceId, keyVersion: 1, key: material.key })
      const repository = new p3.Phase3CommandRepository({ databaseName, keyManager: manager, allowSyntheticAuthority: true, now: () => Date.parse('2026-08-25T01:00:00.000Z') })
      const command = await repository.enqueue({ namespaceId, commandType: 'customer.create', payload: {
        aggregateReference: 'customer-state', name: 'Synthetic', phone: '0500000001', email: null, address: null, notes: null,
      }, authority, deduplicationKey: 'state' })
      const failedCommand = await repository.enqueue({ namespaceId, commandType: 'customer.create', payload: {
        aggregateReference: 'customer-failed', name: 'Synthetic Failed', phone: '0500000002', email: null, address: null, notes: null,
      }, authority, deduplicationKey: 'failed' })
      const blockedCommand = await repository.enqueue({ namespaceId, commandType: 'customer.create', payload: {
        aggregateReference: 'customer-blocked', name: 'Synthetic Blocked', phone: '0500000003', email: null, address: null, notes: null,
      }, authority, deduplicationKey: 'blocked' })
      await repository.markValidationFailure(
        namespaceId,
        failedCommand.command.localCommandId
      )
      await repository.markInvalidDependencies(
        namespaceId,
        blockedCommand.command.localCommandId
      )
      let illegal = null
      try { p3.assertLegalPhase3StateTransition('pending', 'synced') } catch (error) { illegal = error.code }
      let syncingDenied = null
      try {
        await repository.seedSyntheticRuntimeStateForQualification(namespaceId, command.command.localCommandId, 'syncing', '2026-08-25T00:00:00.000Z')
      } catch (error) { syncingDenied = error.code }
      let fetches = 0
      globalThis.fetch = async () => { fetches += 1; throw new Error('unexpected') }
      const recovery = await repository.recoverAbandonedSyncing(namespaceId)
      const counters = await repository.getAuthorizedCounters(namespaceId)
      indexedDB.deleteDatabase(databaseName)
      return { illegal, syncingDenied, recovery, counters, fetches }
    }, syntheticAuthority)
    assert.equal(result.illegal, 'OFFLINE_CONTEXT_INVALID')
    assert.equal(result.syncingDenied, null)
    assert.equal(result.recovery.recoveredCommandIds.length, 1)
    assert.equal(result.recovery.networkRequests, 0)
    assert.equal(result.recovery.businessDispatches, 0)
    assert.equal(result.counters.pending, 1)
    assert.equal(result.counters.syncing, 0)
    assert.equal(result.counters.failed, 1)
    assert.equal(result.counters.blocked, 1)
    assert.equal(result.fetches, 0)
  })
})

test('payment attestation accepts employee states for all methods and rejects provider authority and credentials', async () => {
  await withBrowser(async (page) => {
    const result = await page.evaluate(async (authority) => {
      const p1 = await import('/phase1.js')
      const p3 = await import('/phase3.js')
      const namespaceId = 'ns-payment'
      const databaseName = `phase3-payment-${crypto.randomUUID()}`
      const manager = new p1.OfflineKeyManager()
      const material = await p1.createSyntheticNamespaceKeyMaterial(namespaceId)
      manager.unlock({ source: 'synthetic-test', primaryAuthenticated: true, posActorAuthorized: true, namespaceId, keyVersion: 1, key: material.key })
      const repository = new p3.Phase3CommandRepository({ databaseName, keyManager: manager, allowSyntheticAuthority: true })
      const accepted = []
      for (const method of p3.PHASE3_PAYMENT_METHODS) {
        for (const confirmationStatus of ['not_integrated', 'employee_attested']) {
          const command = await repository.enqueue({ namespaceId, commandType: 'payment.employee_attestation', payload: {
            orderAggregateReference: `order-${method}-${confirmationStatus}`, paymentMethod: method, amount: '10.00', currency: 'SAR',
            employeeConfirmedExternalPayment: true, employeeConfirmedAtLocal: '2026-08-25T00:00:00.000Z',
            externalReference: `TERM-${method}`, paymentProviderConfirmationStatus: confirmationStatus,
            paymentReplayPolicy: 'never_charge_or_invoke_provider', reconciliationStatus: 'pending',
          }, authority, deduplicationKey: `payment-${method}-${confirmationStatus}` })
          accepted.push(command.command.commandType)
        }
      }
      const providerConfirmedRejected = []
      for (const method of p3.PHASE3_PAYMENT_METHODS) {
        try {
          await repository.enqueue({ namespaceId, commandType: 'payment.employee_attestation', payload: {
            orderAggregateReference: `order-provider-${method}`, paymentMethod: method, amount: '10.00', currency: 'SAR',
            employeeConfirmedExternalPayment: true, employeeConfirmedAtLocal: '2026-08-25T00:00:00.000Z',
            externalReference: `TERM-${method}`, paymentProviderConfirmationStatus: 'provider_confirmed',
            paymentReplayPolicy: 'never_charge_or_invoke_provider', reconciliationStatus: 'matched',
          }, authority, deduplicationKey: `provider-${method}` })
          providerConfirmedRejected.push(null)
        } catch (error) {
          providerConfirmedRejected.push(error.code)
        }
      }
      let credential = null
      try {
        await repository.enqueue({ namespaceId, commandType: 'payment.employee_attestation', payload: {
          orderAggregateReference: 'order-secret', paymentMethod: 'mada', amount: '10.00', currency: 'SAR',
          employeeConfirmedExternalPayment: true, employeeConfirmedAtLocal: '2026-08-25T00:00:00.000Z',
          paymentProviderConfirmationStatus: 'employee_attested', paymentReplayPolicy: 'never_charge_or_invoke_provider',
          reconciliationStatus: 'pending', providerToken: 'forbidden',
        }, authority, deduplicationKey: 'payment-secret' })
      } catch (error) { credential = error.code }
      let externalReference = null
      try {
        await repository.enqueue({ namespaceId, commandType: 'payment.employee_attestation', payload: {
          orderAggregateReference: 'order-bad-ref', paymentMethod: 'cash', amount: '10.00', currency: 'SAR',
          employeeConfirmedExternalPayment: true, employeeConfirmedAtLocal: '2026-08-25T00:00:00.000Z',
          externalReference: 'x'.repeat(65), paymentProviderConfirmationStatus: 'employee_attested',
          paymentReplayPolicy: 'never_charge_or_invoke_provider', reconciliationStatus: 'pending',
        }, authority, deduplicationKey: 'payment-bad-ref' })
      } catch (error) { externalReference = error.code }
      indexedDB.deleteDatabase(databaseName)
      return { accepted, providerConfirmedRejected, credential, externalReference }
    }, syntheticAuthority)
    assert.equal(result.accepted.length, 16)
    assert.ok(result.accepted.every((type) => type === 'payment.employee_attestation'))
    assert.deepEqual(
      result.providerConfirmedRejected,
      Array(8).fill('OFFLINE_CONTEXT_INVALID')
    )
    assert.equal(result.credential, 'OFFLINE_CONTEXT_INVALID')
    assert.equal(result.externalReference, 'OFFLINE_CONTEXT_INVALID')
  })
})

test('authorized counters, pre-authority denial and exact namespace purge include command stores', async () => {
  await withBrowser(async (page) => {
    const result = await page.evaluate(async (authority) => {
      const p1 = await import('/phase1.js')
      const p3 = await import('/phase3.js')
      const databaseName = `phase3-purge-${crypto.randomUUID()}`
      document.cookie = 'afex-phase3=authorized; path=/'
      const prepared = await p1.prepareVerifiedOfflineNamespace()
      const namespaceA = prepared.descriptor.namespaceId
      const namespaceB = 'ns-unrelated-phase3'
      const manager = new p1.OfflineKeyManager()
      const materialA = await p1.createSyntheticNamespaceKeyMaterial(namespaceA)
      const materialB = await p1.createSyntheticNamespaceKeyMaterial(namespaceB)
      const repository = new p3.Phase3CommandRepository({ databaseName, keyManager: manager, allowSyntheticAuthority: true })
      manager.unlock({ source: 'synthetic-test', primaryAuthenticated: true, posActorAuthorized: true, namespaceId: namespaceA, keyVersion: 1, key: materialA.key })
      await repository.enqueue({ namespaceId: namespaceA, commandType: 'customer.create', payload: {
        aggregateReference: 'customer-a', name: 'Synthetic A', phone: '0500000001', email: null, address: null, notes: null,
      }, authority, deduplicationKey: 'a' })
      const before = await repository.getAuthorizedCounters(namespaceA)
      manager.lock('retain-logout', namespaceA)
      let locked = null
      try { await repository.getAuthorizedCounters(namespaceA) } catch (error) { locked = error.code }
      const rawBefore = await p1.openOfflineDatabase(databaseName)
      const rawBeforeTx = rawBefore.transaction('commandOutbox', 'readonly')
      const retained = await new Promise((resolve, reject) => {
        const query = rawBeforeTx.objectStore('commandOutbox').index('namespaceId').count(IDBKeyRange.only(namespaceA))
        query.onsuccess = () => resolve(query.result)
        query.onerror = () => reject(query.error)
      })
      rawBefore.close()
      manager.unlock({ source: 'synthetic-test', primaryAuthenticated: true, posActorAuthorized: true, namespaceId: namespaceB, keyVersion: 1, key: materialB.key })
      await repository.enqueue({ namespaceId: namespaceB, commandType: 'customer.create', payload: {
        aggregateReference: 'customer-b', name: 'Synthetic B', phone: '0500000002', email: null, address: null, notes: null,
      }, authority, deduplicationKey: 'b' })
      const authorization = await p1.authorizeCurrentOfflineNamespaceForPurge(prepared.descriptor)
      const purgeRepository = new p1.EncryptedOfflineRepository({ databaseName, allowPersistentWrites: true, keyManager: manager })
      const assessment = await p1.assessLogoutPurgeRecords({ repository: purgeRepository, namespaceId: namespaceA, storage: window.localStorage })
      const purge = await purgeRepository.purgeExactNamespace(authorization)
      const rawAfter = await p1.openOfflineDatabase(databaseName)
      const tx = rawAfter.transaction('commandOutbox', 'readonly')
      const index = tx.objectStore('commandOutbox').index('namespaceId')
      const count = (namespaceId) => new Promise((resolve, reject) => {
        const query = index.count(IDBKeyRange.only(namespaceId))
        query.onsuccess = () => resolve(query.result)
        query.onerror = () => reject(query.error)
      })
      const [afterA, afterB] = await Promise.all([count(namespaceA), count(namespaceB)])
      rawAfter.close()
      indexedDB.deleteDatabase(databaseName)
      return { before, locked, retained, assessment, purge, afterA, afterB }
    }, syntheticAuthority)
    assert.equal(result.before.pending, 1)
    assert.equal(result.locked, 'OFFLINE_KEY_LOCKED')
    assert.equal(result.retained, 1)
    assert.equal(result.assessment.encryptedUnresolvedCommandCount, 1)
    assert.equal(result.assessment.requiresSecondConfirmation, true)
    assert.equal(result.purge.state, 'purged')
    assert.equal(result.afterA, 0)
    assert.equal(result.afterB, 1)
  })
})

test('canonical hashes are stable and malformed values remain rejected', async () => {
  await withBrowser(async (page) => {
    const result = await page.evaluate(async (authority) => {
      const p3 = await import('/phase3.js')
      const base = {
        namespaceId: 'ns-canonical',
        commandType: 'customer.create',
        authority,
        deduplicationKey: 'canonical',
      }
      const first = await p3.createPhase3CommandIdentity({ ...base, payload: {
        aggregateReference: 'customer-canonical', name: 'Synthetic', phone: '0500000001', email: null, address: null, notes: null,
      } })
      const second = await p3.createPhase3CommandIdentity({ ...base, payload: {
        phone: '0500000001', notes: null, address: null, email: null, name: 'Synthetic', aggregateReference: 'customer-canonical',
      } })
      let unsupported = null
      try {
        await p3.createPhase3CommandIdentity({ ...base, payload: {
          aggregateReference: 'customer-canonical', name: 'Synthetic', phone: '0500000001', email: null, address: null, notes: undefined,
        } })
      } catch (error) { unsupported = error.code }
      return { first, second, unsupported }
    }, syntheticAuthority)
    assert.equal(result.first.payloadHash, result.second.payloadHash)
    assert.equal(result.first.idempotencyKey, result.second.idempotencyKey)
    assert.notEqual(result.first.localCommandId, result.second.localCommandId)
    assert.equal(result.unsupported, 'OFFLINE_CONTEXT_INVALID')
  })
})

test('dependency ordering is bounded and measured at 10, 100 and 1000 commands', async () => {
  await withBrowser(async (page) => {
    const measurements = await page.evaluate(async () => {
      const p3 = await import('/phase3.js')
      return [10, 100, 1000].map((count) => {
        const commands = Array.from({ length: count }, (_, index) => ({
          namespaceId: 'ns-performance',
          localCommandId: `command-${String(index).padStart(4, '0')}`,
          immutable: {
            dependencyIds:
              index === 0
                ? []
                : [`command-${String(index - 1).padStart(4, '0')}`],
          },
        }))
        const startedAt = performance.now()
        const ordered = p3.topologicallyOrderPhase3Commands(commands)
        return {
          count,
          durationMs: performance.now() - startedAt,
          orderedCount: ordered.length,
        }
      })
    })
    assert.deepEqual(
      measurements.map((entry) => entry.orderedCount),
      [10, 100, 1000]
    )
    console.log(`PHASE3_SYNTHETIC_ORDERING=${JSON.stringify(measurements)}`)
  })
})

test('current business paths do not import, invoke, poll or dispatch Phase 3', async () => {
  const source = await readFile(phase3Path, 'utf8')
  const paths = [
    '../app/pos/sale/checkout/page.tsx',
    '../app/api/customers/route.ts',
    '../app/api/pos/orders/[id]/status/route.ts',
    '../lib/orders/order-status-whatsapp.ts',
    '../app/pos/sale/success/page.tsx',
  ]
  for (const path of paths) {
    const candidate = await readFile(new URL(path, import.meta.url), 'utf8')
    assert.doesNotMatch(candidate, /offline\/phase3|Phase3CommandRepository/u)
  }
  assert.doesNotMatch(source, /setInterval|setTimeout|navigator\.serviceWorker/u)
  assert.deepEqual(
    [...source.matchAll(/\bfetch\s*\(/gu)],
    []
  )
})

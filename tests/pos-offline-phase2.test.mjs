import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import { chromium } from '@playwright/test'

const phase1Path = new URL('../lib/offline/phase1.ts', import.meta.url)
const phase2Path = new URL('../lib/offline/phase2.ts', import.meta.url)

async function transpile(path) {
  return ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
}

async function withBrowser(run) {
  const phase1Source = await transpile(phase1Path)
  const phase2Source = (await transpile(phase2Path)).replace(
    /from ['"]\.\/phase1['"]/gu,
    "from '/phase1.js'"
  )
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
    response.writeHead(200, { 'Content-Type': 'text/html' })
    response.end('<!doctype html><title>AFEX offline test</title>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${address.port}/`)
  await page.evaluate(() => {
    globalThis.process = { env: { NODE_ENV: 'test' } }
  })
  try {
    await run(page)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
}

async function withServiceWorkerBrowser(run) {
  const [worker, shell, phase1Source, rawPhase2Source] = await Promise.all([
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/pos/offline-shell.html', import.meta.url), 'utf8'),
    transpile(phase1Path),
    transpile(phase2Path),
  ])
  const phase2Source = rawPhase2Source.replace(
    /from ['"]\.\/phase1['"]/gu,
    "from '/phase1.js'"
  )
  let networkAvailable = true
  const server = createServer((request, response) => {
    if (!networkAvailable) {
      request.socket.destroy()
      return
    }
    if (request.url === '/sw.js') {
      response.writeHead(200, {
        'Content-Type': 'text/javascript',
        'Service-Worker-Allowed': '/',
      })
      response.end(worker)
      return
    }
    if (request.url === '/unrelated-sw.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' })
      response.end(
        "self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',(event)=>event.waitUntil(self.clients.claim()));"
      )
      return
    }
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
    if (request.url === '/pos/offline-shell.html') {
      response.writeHead(200, { 'Content-Type': 'text/html' })
      response.end(shell)
      return
    }
    if (request.url === '/_next/static/test.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' })
      response.end('globalThis.__afexStaticLoaded = true')
      return
    }
    if (request.url === '/api/private') {
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      })
      response.end('{"synthetic":true}')
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/html' })
    response.end(
      '<!doctype html><title>AFEX POS live</title><script src="/_next/static/test.js"></script>'
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  const origin = `http://127.0.0.1:${address.port}`
  await page.goto(`${origin}/pos/live`)
  try {
    await run({
      context,
      disconnect: () => {
        networkAvailable = false
      },
      page,
      origin,
    })
  } finally {
    await context.setOffline(false)
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
}

test('approved pre-PIN dataset authority enables encrypted POS data but never business dispatch', async () => {
  await withBrowser(async (page) => {
    const result = await page.evaluate(async () => {
      const phase2 = await import('/phase2.js')
      const coordinator = new phase2.Phase2BootstrapCoordinator()
      return {
        authority: phase2.PHASE2_AUTHORITY_GATE,
        capabilities: phase2.OFFLINE_PHASE2_CAPABILITIES,
        preparation: await coordinator.prepareBeforePin(),
        noDispatch: phase2.assertNoPhase2BusinessDispatch(),
      }
    })
    assert.deepEqual(result.authority, {
    classification: 'APPROVED_OFFLINE_READ_RUNTIME',
    persistentUnwrapAuthority: true,
    prePinSensitiveIngestion: true,
    reason: 'SERVER_ATTESTED_MANAGED_DEVICE_AUTHORITY',
    })
    assert.deepEqual(result.capabilities, {
    offlineShell: true,
    encryptedDatasetStore: true,
    datasetBootstrap: true,
    catalogReads: true,
    customerReads: true,
    orderInvoiceReads: true,
    mediaCache: false,
    businessMutationDispatch: false,
    })
    assert.equal(result.preparation.plaintextStored, false)
    assert.equal(result.noDispatch, true)
  })
})

test('database v1 migrates through v3 without changing Phase 1 records', async () => {
  await withBrowser(async (page) => {
    const result = await page.evaluate(async () => {
      const p1 = await import('/phase1.js')
      const databaseName = `phase2-migration-${crypto.randomUUID()}`
      const openV1 = indexedDB.open(databaseName, 1)
      await new Promise((resolve, reject) => {
        openV1.onupgradeneeded = () => {
          const database = openV1.result
          database.createObjectStore('meta', { keyPath: 'id' })
          for (const name of [
            'keyEnvelopes',
            'drafts',
            'quarantine',
            'purgeTombstones',
          ]) {
            const store = database.createObjectStore(name, { keyPath: 'id' })
            store.createIndex('namespaceId', 'namespaceId')
          }
        }
        openV1.onerror = () => reject(openV1.error)
        openV1.onsuccess = () => resolve()
      })
      const oldDatabase = openV1.result
      const oldTransaction = oldDatabase.transaction(
        ['drafts', 'quarantine', 'purgeTombstones'],
        'readwrite'
      )
      oldTransaction.objectStore('drafts').put({
        id: 'ns_a:draft',
        namespaceId: 'ns_a',
        marker: 'phase1-draft',
      })
      oldTransaction.objectStore('quarantine').put({
        id: 'ns_a:quarantine',
        namespaceId: 'ns_a',
        marker: 'phase1-quarantine',
      })
      oldTransaction.objectStore('purgeTombstones').put({
        id: 'purge:ns_a',
        namespaceId: 'ns_a',
        marker: 'phase1-tombstone',
      })
      await new Promise((resolve, reject) => {
        oldTransaction.oncomplete = resolve
        oldTransaction.onerror = () => reject(oldTransaction.error)
      })
      oldDatabase.close()

      const migrated = await p1.openOfflineDatabase(databaseName)
      const transaction = migrated.transaction(
        ['drafts', 'quarantine', 'purgeTombstones'],
        'readonly'
      )
      const read = (store, key) =>
        new Promise((resolve, reject) => {
          const request = transaction.objectStore(store).get(key)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
      const records = await Promise.all([
        read('drafts', 'ns_a:draft'),
        read('quarantine', 'ns_a:quarantine'),
        read('purgeTombstones', 'purge:ns_a'),
      ])
      const stores = Array.from(migrated.objectStoreNames)
      const version = migrated.version
      migrated.close()
      indexedDB.deleteDatabase(databaseName)
      return { records, stores, version }
    })
    assert.equal(result.version, 3)
    assert.deepEqual(
      result.records.map((record) => record.marker),
      ['phase1-draft', 'phase1-quarantine', 'phase1-tombstone']
    )
    assert.deepEqual(result.stores.sort(), [
      'catalog',
      'commandDependencies',
      'commandOutbox',
      'customers',
      'datasetManifests',
      'drafts',
      'events',
      'invoices',
      'keyEnvelopes',
      'mediaRefs',
      'meta',
      'orders',
      'purgeTombstones',
      'quarantine',
      'runtimeSettings',
    ])
  })
})

test('encrypted snapshots are atomic, paged, isolated and retain current plus previous', async () => {
  await withBrowser(async (page) => {
    const result = await page.evaluate(async () => {
      const p1 = await import('/phase1.js')
      const p2 = await import('/phase2.js')
      const databaseName = `phase2-snapshots-${crypto.randomUUID()}`
      const manager = new p1.OfflineKeyManager()
      const namespaceId = 'ns_phase2_a'
      const material = await p1.createSyntheticNamespaceKeyMaterial(namespaceId)
      manager.unlock({
        source: 'synthetic-test',
        primaryAuthenticated: true,
        posActorAuthorized: true,
        namespaceId,
        keyVersion: 1,
        key: material.key,
      })
      let clock = Date.parse('2026-08-25T08:00:00.000Z')
      const repository = new p2.Phase2DatasetRepository({
        databaseName,
        keyManager: manager,
        allowSyntheticAuthority: true,
        now: () => clock,
      })

      const commit = async (snapshotVersion, values) => {
        const pages = values.map((value, index) => ({
          pageNumber: index + 1,
          records: [{ recordKey: `item-${index + 1}`, value }],
        }))
        const pageClosures = []
        for (const pageInput of pages) {
          pageClosures.push({
            pageNumber: pageInput.pageNumber,
            recordCount: pageInput.records.length,
            hash: await p2.calculateSnapshotPageHash(pageInput.records),
          })
        }
        const writer = await repository.beginSnapshot({
          namespaceId,
          datasetId: 'catalog',
          datasetSchemaVersion: 7,
          snapshotVersion,
          sourceContractVersion: 'catalog-v1',
          confirmedAtServer: new Date(clock).toISOString(),
          freshnessMs: 60_000,
          expectedPageCount: pages.length,
          expectedRecordCount: values.length,
          expectedClosureHash:
            await p2.calculateSnapshotClosureHash(pageClosures),
        })
        for (const pageInput of pages) {
          await repository.stageSnapshotPage(writer, pageInput)
        }
        return repository.completeSnapshot(writer)
      }

      const incompleteRecords = [{ recordKey: 'item-1', value: { version: 1 } }]
      const incompletePage = {
        pageNumber: 1,
        recordCount: 1,
        hash: await p2.calculateSnapshotPageHash(incompleteRecords),
      }
      const interrupted = await repository.beginSnapshot({
        namespaceId,
        datasetId: 'catalog',
        datasetSchemaVersion: 7,
        snapshotVersion: 'v1',
        sourceContractVersion: 'catalog-v1',
        confirmedAtServer: new Date(clock).toISOString(),
        freshnessMs: 60_000,
        expectedPageCount: 2,
        expectedRecordCount: 2,
        expectedClosureHash: await p2.calculateSnapshotClosureHash([
          incompletePage,
          { pageNumber: 2, recordCount: 1, hash: 'not-yet-staged' },
        ]),
      })
      await repository.stageSnapshotPage(interrupted, {
        pageNumber: 1,
        records: incompleteRecords,
      })
      const invisible = await repository.getSafeAvailability(
        namespaceId,
        'catalog'
      )

      clock += 31_000
      await commit('v2', [{ version: 2 }, { version: 2 }])
      clock += 1_000
      await commit('v3', [{ version: 3 }])
      clock += 1_000
      await commit('v4', [{ version: 4 }])
      const latest = await repository.readCompleteSnapshotPage({
        namespaceId,
        datasetId: 'catalog',
        limit: 1,
      })
      const secondPage = await repository.readCompleteSnapshotPage({
        namespaceId,
        datasetId: 'catalog',
        limit: 1,
        afterRecordKey: latest.nextCursor,
      })
      let wrongScopeCode = null
      try {
        await repository.readCompleteSnapshotPage({
          namespaceId: 'ns_phase2_b',
          datasetId: 'catalog',
        })
      } catch (error) {
        wrongScopeCode = error.code
      }
      const database = await p1.openOfflineDatabase(databaseName)
      const transaction = database.transaction(
        ['datasetManifests', 'catalog'],
        'readonly'
      )
      const manifests = await new Promise((resolve, reject) => {
        const request = transaction.objectStore('datasetManifests').getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const rawRecords = await new Promise((resolve, reject) => {
        const request = transaction.objectStore('catalog').getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      database.close()
      indexedDB.deleteDatabase(databaseName)
      return {
        invisible,
        latest,
        secondPage,
        wrongScopeCode,
        rawDatasetSchemaVersions: [...new Set(
          rawRecords.map((record) => record.datasetSchemaVersion)
        )],
        completeVersions: manifests
          .filter((manifest) => manifest.status === 'complete')
          .map((manifest) => manifest.snapshotVersion)
          .sort(),
        incompleteVersions: manifests
          .filter((manifest) => manifest.status === 'incomplete')
          .map((manifest) => manifest.snapshotVersion)
          .sort(),
      }
    })
    assert.deepEqual(result.invisible, { status: 'missing' })
    assert.equal(result.latest.status, 'ready')
    assert.deepEqual(result.latest.records, [
      { recordKey: 'item-1', value: { version: 4 } },
    ])
    assert.equal(result.latest.nextCursor, 'item-1')
    assert.deepEqual(result.secondPage.records, [])
    assert.equal(result.wrongScopeCode, 'OFFLINE_KEY_LOCKED')
    assert.deepEqual(result.rawDatasetSchemaVersions, [7])
    assert.deepEqual(result.completeVersions, ['v3', 'v4'])
    assert.deepEqual(result.incompleteVersions, ['v1'])
  })
})

test('snapshot availability metadata requires the exact unlocked namespace authority', async () => {
  await withBrowser(async (page) => {
    const result = await page.evaluate(async () => {
      const p1 = await import('/phase1.js')
      const p2 = await import('/phase2.js')
      const databaseName = `phase2-availability-${crypto.randomUUID()}`
      const namespaceId = 'ns_phase2_authorized'
      const manager = new p1.OfflineKeyManager()
      const repository = new p2.Phase2DatasetRepository({
        databaseName,
        keyManager: manager,
        allowSyntheticAuthority: true,
      })
      const capture = async (operation) => {
        try {
          return { value: await operation() }
        } catch (error) {
          return { code: error.code }
        }
      }

      const databasesBefore = (await indexedDB.databases()).map(
        (database) => database.name
      )
      const beforePin = await capture(() =>
        repository.getSafeAvailability(namespaceId, 'catalog')
      )
      const databasesAfterDeniedRead = (await indexedDB.databases()).map(
        (database) => database.name
      )

      const material = await p1.createSyntheticNamespaceKeyMaterial(namespaceId)
      manager.unlock({
        source: 'synthetic-test',
        primaryAuthenticated: true,
        posActorAuthorized: true,
        namespaceId,
        keyVersion: 1,
        key: material.key,
      })
      const records = [{ recordKey: 'item-1', value: { enabled: true } }]
      const pageClosure = {
        pageNumber: 1,
        recordCount: 1,
        hash: await p2.calculateSnapshotPageHash(records),
      }
      const writer = await repository.beginSnapshot({
        namespaceId,
        datasetId: 'catalog',
        datasetSchemaVersion: 1,
        snapshotVersion: 'v1',
        sourceContractVersion: 'catalog-v1',
        confirmedAtServer: '2026-08-25T09:00:00.000Z',
        freshnessMs: 60_000,
        expectedPageCount: 1,
        expectedRecordCount: 1,
        expectedClosureHash: await p2.calculateSnapshotClosureHash([
          pageClosure,
        ]),
      })
      await repository.stageSnapshotPage(writer, { pageNumber: 1, records })
      await repository.completeSnapshot(writer)

      const authorized = await repository.getSafeAvailability(
        `  ${namespaceId}  `,
        ' catalog '
      )
      const wrongNamespace = await capture(() =>
        repository.getSafeAvailability('ns_phase2_other', 'catalog')
      )
      const invalidDataset = await capture(() =>
        repository.getSafeAvailability(namespaceId, 'unknown')
      )
      manager.lock('test-lock', namespaceId)
      const afterLock = await capture(() =>
        repository.getSafeAvailability(namespaceId, 'catalog')
      )
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(databaseName)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
      return {
        beforePin,
        authorized,
        wrongNamespace,
        invalidDataset,
        afterLock,
        databaseOpenedOnDeniedRead:
          !databasesBefore.includes(databaseName) &&
          databasesAfterDeniedRead.includes(databaseName),
      }
    })

    assert.deepEqual(result.beforePin, { code: 'OFFLINE_KEY_LOCKED' })
    assert.equal(result.databaseOpenedOnDeniedRead, false)
    assert.equal(result.authorized.status, 'complete')
    assert.equal(result.authorized.snapshotVersion, 'v1')
    assert.deepEqual(result.wrongNamespace, { code: 'OFFLINE_KEY_LOCKED' })
    assert.deepEqual(result.invalidDataset, {
      code: 'OFFLINE_CONTEXT_INVALID',
    })
    assert.deepEqual(result.afterLock, { code: 'OFFLINE_KEY_LOCKED' })
    assert.equal(Object.hasOwn(result.beforePin, 'value'), false)
    assert.equal(Object.hasOwn(result.wrongNamespace, 'value'), false)
    assert.equal(Object.hasOwn(result.afterLock, 'value'), false)
  })
})

test('snapshot hashes recursively canonicalize objects and reject ambiguous values', async () => {
  await withBrowser(async (page) => {
    const result = await page.evaluate(async () => {
      const p2 = await import('/phase2.js')
      const left = {
        nested: { zebra: true, alpha: { two: 2, one: 1 } },
        label: 'same',
      }
      const right = {
        label: 'same',
        nested: { alpha: { one: 1, two: 2 }, zebra: true },
      }
      const firstHash = await p2.calculateSnapshotPageHash([
        { recordKey: 'record-1', value: left },
      ])
      const retryHash = await p2.calculateSnapshotPageHash([
        { recordKey: 'record-1', value: right },
      ])
      const arrayForward = await p2.calculateSnapshotPageHash([
        { recordKey: 'record-1', value: { sequence: ['a', 'b'] } },
      ])
      const arrayReverse = await p2.calculateSnapshotPageHash([
        { recordKey: 'record-1', value: { sequence: ['b', 'a'] } },
      ])
      const pages = [
        { pageNumber: 1, recordCount: 1, hash: firstHash },
        { pageNumber: 2, recordCount: 1, hash: arrayForward },
      ]
      const closureFirst = await p2.calculateSnapshotClosureHash(pages)
      const closureRetry = await p2.calculateSnapshotClosureHash([
        pages[1],
        pages[0],
      ])
      const cyclic = {}
      cyclic.self = cyclic
      const sparse = []
      sparse.length = 1
      const unsupported = [
        undefined,
        () => true,
        Symbol('unsupported'),
        1n,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        cyclic,
        new Date('2026-08-25T00:00:00.000Z'),
        sparse,
      ]
      const failureCodes = []
      for (const value of unsupported) {
        try {
          await p2.calculateSnapshotPageHash([
            { recordKey: 'record-1', value },
          ])
          failureCodes.push('UNEXPECTED_SUCCESS')
        } catch (error) {
          failureCodes.push(error.code)
        }
      }
      return {
        firstHash,
        retryHash,
        arrayForward,
        arrayReverse,
        closureFirst,
        closureRetry,
        failureCodes,
      }
    })

    assert.equal(result.firstHash, result.retryHash)
    assert.notEqual(result.arrayForward, result.arrayReverse)
    assert.equal(result.closureFirst, result.closureRetry)
    assert.deepEqual(
      result.failureCodes,
      Array.from({ length: 9 }, () => 'OFFLINE_CONTEXT_INVALID')
    )
  })
})

test('snapshot writer lease is single-owner and recoverable after expiry', async () => {
  await withBrowser(async (page) => {
    const result = await page.evaluate(async () => {
      const p1 = await import('/phase1.js')
      const p2 = await import('/phase2.js')
      const databaseName = `phase2-writer-${crypto.randomUUID()}`
      const namespaceId = 'ns_writer'
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
      let clock = 1_000_000
      const makeRepository = () =>
        new p2.Phase2DatasetRepository({
          databaseName,
          keyManager: manager,
          allowSyntheticAuthority: true,
          now: () => clock,
        })
      const first = makeRepository()
      const second = makeRepository()
      const begin = (repository, writerId) =>
        repository.beginSnapshot({
          namespaceId,
          datasetId: 'events',
          datasetSchemaVersion: 1,
          snapshotVersion: 'same-version',
          sourceContractVersion: 'events-v1',
          confirmedAtServer: '2026-08-25T00:00:00.000Z',
          freshnessMs: 60_000,
          expectedPageCount: 1,
          expectedRecordCount: 0,
          expectedClosureHash: 'synthetic-closure',
          writerId,
        })
      const simultaneous = await Promise.allSettled([
        begin(first, 'writer-a'),
        begin(second, 'writer-b'),
      ])
      clock += 30_001
      const recovered = await begin(second, 'writer-recovered')
      indexedDB.deleteDatabase(databaseName)
      return {
        fulfilled: simultaneous.filter((entry) => entry.status === 'fulfilled')
          .length,
        rejected: simultaneous
          .filter((entry) => entry.status === 'rejected')
          .map((entry) => entry.reason.code),
        recoveredWriter: recovered.writerId,
      }
    })
    assert.equal(result.fulfilled, 1)
    assert.deepEqual(result.rejected, ['OFFLINE_DATABASE_BLOCKED'])
    assert.equal(result.recoveredWriter, 'writer-recovered')
  })
})

test('checked Phase 1 purge removes Phase 2 stores and preserves another namespace', async () => {
  await withBrowser(async (page) => {
    const result = await page.evaluate(async () => {
      const p1 = await import('/phase1.js')
      const p2 = await import('/phase2.js')
      const databaseName = `phase2-purge-${crypto.randomUUID()}`
      let scope = {
        primarySubjectId: 'account-a',
        tenantId: 'tenant-a',
        branchId: 'branch-a',
      }
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            success: true,
            context: {
              ...scope,
              contextVersion: 1,
              actorAuthority: 'active-pos-actor',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      const originalDatabaseName = p1.offlineRepository.databaseName
      p1.offlineRepository.databaseName = databaseName
      const prepare = async () => {
        p1.clearActiveOfflineNamespace()
        return (await p1.prepareVerifiedOfflineNamespace()).descriptor
      }
      const namespaceA = await prepare()
      scope = {
        primarySubjectId: 'account-b',
        tenantId: 'tenant-b',
        branchId: 'branch-b',
      }
      const namespaceB = await prepare()

      const writeOne = async (namespace, marker) => {
        const manager = new p1.OfflineKeyManager()
        const material = await p1.createSyntheticNamespaceKeyMaterial(
          namespace.namespaceId
        )
        manager.unlock({
          source: 'synthetic-test',
          primaryAuthenticated: true,
          posActorAuthorized: true,
          namespaceId: namespace.namespaceId,
          keyVersion: 1,
          key: material.key,
        })
        const repository = new p2.Phase2DatasetRepository({
          databaseName,
          keyManager: manager,
          allowSyntheticAuthority: true,
        })
        const records = [{ recordKey: 'record-1', value: { marker } }]
        const page = {
          pageNumber: 1,
          recordCount: 1,
          hash: await p2.calculateSnapshotPageHash(records),
        }
        const writer = await repository.beginSnapshot({
          namespaceId: namespace.namespaceId,
          datasetId: 'invoices',
          datasetSchemaVersion: 1,
          snapshotVersion: 'v1',
          sourceContractVersion: 'invoice-v1',
          confirmedAtServer: '2026-08-25T00:00:00.000Z',
          freshnessMs: 60_000,
          expectedPageCount: 1,
          expectedRecordCount: 1,
          expectedClosureHash: await p2.calculateSnapshotClosureHash([page]),
        })
        await repository.stageSnapshotPage(writer, { pageNumber: 1, records })
        await repository.completeSnapshot(writer)
      }
      await writeOne(namespaceA, 'a')
      await writeOne(namespaceB, 'b')
      const fingerprintBefore =
        await p1.offlineRepository.namespaceFingerprint(namespaceB.namespaceId)

      scope = {
        primarySubjectId: 'account-a',
        tenantId: 'tenant-a',
        branchId: 'branch-a',
      }
      p1.clearActiveOfflineNamespace()
      const prepared = await p1.prepareVerifiedOfflineNamespace()
      const authorization = await p1.authorizeCurrentOfflineNamespaceForPurge(
        prepared.descriptor
      )
      const purge = await p1.offlineRepository.purgeExactNamespace(authorization)
      const fingerprintAfter =
        await p1.offlineRepository.namespaceFingerprint(namespaceB.namespaceId)
      const database = await p1.openOfflineDatabase(databaseName)
      const transaction = database.transaction(
        ['datasetManifests', 'invoices'],
        'readonly'
      )
      const countNamespace = (storeName, namespaceId) =>
        new Promise((resolve, reject) => {
          const request = transaction
            .objectStore(storeName)
            .index('namespaceId')
            .count(IDBKeyRange.only(namespaceId))
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
      const [aManifests, aInvoices, bManifests, bInvoices] = await Promise.all([
        countNamespace('datasetManifests', namespaceA.namespaceId),
        countNamespace('invoices', namespaceA.namespaceId),
        countNamespace('datasetManifests', namespaceB.namespaceId),
        countNamespace('invoices', namespaceB.namespaceId),
      ])
      database.close()
      p1.offlineRepository.databaseName = originalDatabaseName
      indexedDB.deleteDatabase(databaseName)
      return {
        purge,
        fingerprintBefore,
        fingerprintAfter,
        aManifests,
        aInvoices,
        bManifests,
        bInvoices,
      }
    })
    assert.equal(result.purge.state, 'purged')
    assert.ok(result.purge.remainingCounts.every((count) => count === 0))
    assert.equal(result.aManifests, 0)
    assert.equal(result.aInvoices, 0)
    assert.equal(result.bManifests, 1)
    assert.equal(result.bInvoices, 1)
    assert.equal(result.fingerprintBefore, result.fingerprintAfter)
  })
})

test('retention, freshness and server-owned 48-hour boundary are exact', async () => {
  await withBrowser(async (page) => {
    const result = await page.evaluate(async () => {
      const phase2 = await import('/phase2.js')
      return {
        retention: phase2.PHASE2_RETENTION,
        afterCutoff: phase2.isInsideServerOwnedWindow(
      '2026-08-25T00:00:00.001Z',
      '2026-08-25T00:00:00.000Z'
        ),
        atCutoff: phase2.isInsideServerOwnedWindow(
      '2026-08-25T00:00:00.000Z',
      '2026-08-25T00:00:00.000Z'
        ),
        riyadhMidnight: phase2.isInsideServerOwnedWindow(
      '2026-08-24T21:00:01.000Z',
      '2026-08-24T21:00:00.000Z'
        ),
        freshness: phase2.formatPhase2Freshness({
      asOf: '2026-08-25T00:00:00.000Z',
      stale: true,
        }),
      }
    })
    assert.equal(result.retention.catalog.maximumRecords, 10_000)
    assert.equal(result.retention.mediaRefs.maximumRecords, 1_000)
    assert.equal(result.retention.mediaRefs.maximumBytes, 250 * 1024 * 1024)
    assert.equal(result.retention.runtimeSettings.financialStaleMs, 7_200_000)
    assert.equal(result.retention.recentOrders.serverWindowMs, 172_800_000)
    assert.equal(result.afterCutoff, true)
    assert.equal(result.atCutoff, false)
    assert.equal(
      result.riyadhMidnight,
      true,
      'Riyadh midnight is compared as a server-owned instant'
    )
    assert.equal(result.freshness.stale, true)
  })
})

test('service worker caches only AFEX shell/static assets and never authenticated JSON', async () => {
  const [worker, registration, shell, phase2Source] = await Promise.all([
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
    readFile(
      new URL('../components/pos-offline-shell-registration.tsx', import.meta.url),
      'utf8'
    ),
    readFile(
      new URL('../public/pos/offline-shell.html', import.meta.url),
      'utf8'
    ),
    readFile(phase2Path, 'utf8'),
  ])
  assert.match(worker, /afex-pos-shell-v3/u)
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/u)
  assert.match(worker, /request\.method !== 'GET'/u)
  assert.match(worker, /url\.pathname\.startsWith\('\/_next\/static\/'\)/u)
  assert.doesNotMatch(worker, /install[\s\S]{0,160}skipWaiting/u)
  assert.doesNotMatch(worker, /caches\.delete\(cacheName\)[\s\S]*cacheNames\.map/u)
  assert.match(registration, /initializeOfflinePhase1Runtime/u)
  assert.match(registration, /offline_store_unavailable_locked/u)
  assert.match(registration, /neutralizeAfexOfflineShell/u)
  assert.match(registration, /result\.status === 'incomplete'/u)
  assert.match(shell, /AFEX POS غير متصل/u)
  assert.doesNotMatch(
    shell,
    /\b(?:customer|phone|invoice|order)\b|عميل|فاتورة/u
  )
  assert.doesNotMatch(phase2Source, /fetch\s*\(/u)
  assert.doesNotMatch(phase2Source, /\b(?:POST|PATCH)\b|service_role/u)
  assert.doesNotMatch(phase2Source, /businessMutationDispatch:\s*true/u)
})

test('real service worker removes obsolete AFEX caches and serves the offline lock shell', async () => {
  await withServiceWorkerBrowser(async ({ disconnect, page, origin }) => {
    await page.evaluate(async () => {
      await caches.open('afex-pos-shell-v0')
      await caches.open('afex-pos-shell-obsolete')
      await caches.open('unrelated-application-cache')
    })
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/pos/',
      })
      await navigator.serviceWorker.ready
      registration.waiting?.postMessage({ type: 'AFEX_ACTIVATE_SHELL_V1' })
    })
    await page.reload()
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
    await page.evaluate(async () => {
      await fetch('/_next/static/test.js')
      await fetch('/api/private')
    })
    const cacheState = await page.evaluate(async () => {
      const names = (await caches.keys()).sort()
      const requests = []
      for (const name of names) {
        const cache = await caches.open(name)
        for (const request of await cache.keys()) requests.push(request.url)
      }
      return { names, requests }
    })
    assert.ok(!cacheState.names.includes('afex-pos-shell-v0'))
    assert.ok(cacheState.names.includes('afex-pos-shell-v3'))
    assert.ok(cacheState.names.includes('unrelated-application-cache'))
    assert.ok(!cacheState.names.includes('afex-pos-shell-obsolete'))
    assert.ok(
      cacheState.requests.some((url) => url.endsWith('/_next/static/test.js'))
    )
    assert.ok(!cacheState.requests.some((url) => url.includes('/api/private')))

    disconnect()
    const offlineResponse = await page.goto(
      `${origin}/pos/network-unavailable`,
      { waitUntil: 'domcontentloaded' }
    )
    const offlineState = await page.evaluate(() => ({
      body: document.body.textContent,
      controller: Boolean(navigator.serviceWorker.controller),
      title: document.title,
    }))
    assert.equal(offlineState.controller, true)
    assert.equal(offlineResponse?.status(), 200)
    assert.match(offlineState.body, /AFEX POS غير متصل/u)
    assert.equal(offlineState.title, 'AFEX POS — غير متصل')
  })
})

test('real Chromium installs the complete POS route shell and cold reloads it offline', async () => {
  await withServiceWorkerBrowser(async ({ disconnect, page, origin }) => {
    const installed = await page.evaluate(async () => {
      globalThis.process = { env: { NODE_ENV: 'test' } }
      const phase2 = await import('/phase2.js')
      return phase2.installAfexOfflineApplicationShell()
    })
    assert.deepEqual(installed, { routeCount: 9, assetCount: 1 })
    await page.reload()
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))

    disconnect()
    const offlineResponse = await page.goto(`${origin}/pos/sale/customer`, {
      waitUntil: 'domcontentloaded',
    })
    assert.equal(offlineResponse?.status(), 200)
    assert.equal(await page.title(), 'AFEX POS live')
    assert.equal(
      await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js')),
      true
    )
  })
})

test('real Chromium kill switch removes only the AFEX worker and owned caches', async () => {
  await withServiceWorkerBrowser(async ({ context, page, origin }) => {
    await page.evaluate(async () => {
      globalThis.process = { env: { NODE_ENV: 'test' } }
      await navigator.serviceWorker.register('/unrelated-sw.js', {
        scope: '/unrelated/',
      })
      await caches.open('unrelated-application-cache')
      await caches.open('afex-pos-shell-v0')
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/pos/',
        updateViaCache: 'none',
      })
      await navigator.serviceWorker.ready
      registration.waiting?.postMessage({ type: 'AFEX_ACTIVATE_SHELL_V1' })
    })
    await page.reload()
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
    await page.evaluate(async () => {
      await fetch('/_next/static/test.js')
    })

    const cleanup = await page.evaluate(async () => {
      globalThis.process = { env: { NODE_ENV: 'test' } }
      const phase2 = await import('/phase2.js')
      return phase2.neutralizeAfexOfflineShell()
    })
    await page.evaluate(async () => {
      await fetch('/_next/static/test.js')
    })
    const after = await page.evaluate(async () => ({
      registrations: (await navigator.serviceWorker.getRegistrations()).map(
        (registration) => ({
          scope: registration.scope,
          scripts: [
            registration.active?.scriptURL,
            registration.waiting?.scriptURL,
            registration.installing?.scriptURL,
          ].filter(Boolean),
        })
      ),
      caches: (await caches.keys()).sort(),
    }))
    const freshPage = await context.newPage()
    await freshPage.goto(`${origin}/pos/fresh`)
    const freshController = await freshPage.evaluate(() =>
      Boolean(navigator.serviceWorker.controller)
    )
    await freshPage.close()

    assert.equal(cleanup.status, 'complete')
    assert.equal(cleanup.matchedRegistrations, 1)
    assert.equal(cleanup.remainingRegistrations, 0)
    assert.equal(cleanup.remainingCaches, 0)
    assert.equal(cleanup.controllerNeutralized, true)
    assert.deepEqual(cleanup.classifications, [])
    assert.equal(
      after.registrations.some((registration) =>
        registration.scripts.some((script) =>
          new URL(script).pathname.endsWith('/sw.js')
        )
      ),
      false
    )
    assert.equal(
      after.registrations.some((registration) =>
        registration.scripts.some((script) =>
          new URL(script).pathname.endsWith('/unrelated-sw.js')
        )
      ),
      true
    )
    assert.equal(
      after.caches.some((cacheName) => cacheName.startsWith('afex-pos-shell-')),
      false
    )
    assert.equal(after.caches.includes('unrelated-application-cache'), true)
    assert.equal(freshController, false)
  })
})

test('production source enables encrypted POS preparation while keeping Phase 2 mutation dispatch disabled', async () => {
  const [phase1Source, phase2Source, shellLayout] = await Promise.all([
    readFile(phase1Path, 'utf8'),
    readFile(phase2Path, 'utf8'),
    readFile(
      new URL('../components/pos-shell-layout.tsx', import.meta.url),
      'utf8'
    ),
  ])
  assert.match(phase1Source, /persistentUnwrapAuthority:\s*true/u)
  assert.match(phase1Source, /businessCommandDispatch:\s*false/u)
  assert.match(phase2Source, /encryptedDatasetStore:\s*true/u)
  assert.match(phase2Source, /datasetBootstrap:\s*true/u)
  assert.match(phase2Source, /businessMutationDispatch:\s*false/u)
  assert.match(shellLayout, /PosOfflineShellRegistration/u)
  assert.doesNotMatch(shellLayout, /Phase2DatasetRepository/u)
})

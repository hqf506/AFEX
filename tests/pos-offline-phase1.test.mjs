import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import { chromium } from '@playwright/test'
import * as offline from '../lib/offline/phase1.ts'

const sourcePath = new URL('../lib/offline/phase1.ts', import.meta.url)

async function loadBrowserModule(page) {
  const source = await readFile(sourcePath, 'utf8')
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  await page.evaluate(async (code) => {
    globalThis.process = { env: { NODE_ENV: 'test' } }
    const url = URL.createObjectURL(
      new Blob([code], { type: 'text/javascript' })
    )
    globalThis.__afexOfflinePhase1 = await import(url)
  }, javascript)
}

test('namespace is deterministic and isolates every durable scope input', async () => {
  const base = {
    primarySubjectId: 'subject-a',
    tenantId: 'tenant-a',
    branchId: 'branch-a',
    deviceCacheId: 'device-a',
    schemaGeneration: offline.OFFLINE_SCHEMA_GENERATION,
    authoritySource: 'server-verified-auth-context',
    contextVersion: 1,
  }
  const first = await offline.deriveOfflineNamespace(base)
  const second = await offline.deriveOfflineNamespace({ ...base })
  assert.equal(first.namespaceId, second.namespaceId)
  for (const [key, value] of [
    ['primarySubjectId', 'subject-b'],
    ['tenantId', 'tenant-b'],
    ['branchId', 'branch-b'],
    ['deviceCacheId', 'device-b'],
    ['schemaGeneration', 'g2'],
  ]) {
    const different = await offline.deriveOfflineNamespace({
      ...base,
      [key]: value,
    })
    assert.notEqual(different.namespaceId, first.namespaceId)
  }
  assert.doesNotMatch(first.namespaceId, /subject|tenant|branch|device/u)
})

test('unverified browser identity is rejected', async () => {
  await assert.rejects(
    offline.deriveOfflineNamespace({
      primarySubjectId: 'subject-a',
      tenantId: 'tenant-a',
      branchId: 'branch-a',
      deviceCacheId: 'device-a',
      schemaGeneration: 'g1',
      authoritySource: 'browser-cache',
      contextVersion: 1,
    }),
    (error) => error?.code === 'OFFLINE_CONTEXT_INVALID'
  )
})

test('AES-GCM round trip, nonce uniqueness and AAD tamper fail closed', async () => {
  const namespaceId = 'ns_crypto_test'
  const material = await offline.createSyntheticNamespaceKeyMaterial(namespaceId)
  const first = await offline.encryptOfflineRecord({
    key: material.key,
    keyVersion: 1,
    namespaceId,
    storeName: offline.OFFLINE_STORES.drafts,
    recordKey: 'draft-a',
    value: { synthetic: true, amount: 1 },
  })
  const second = await offline.encryptOfflineRecord({
    key: material.key,
    keyVersion: 1,
    namespaceId,
    storeName: offline.OFFLINE_STORES.drafts,
    recordKey: 'draft-a',
    value: { synthetic: true, amount: 1 },
  })
  assert.notEqual(first.nonce, second.nonce)
  assert.deepEqual(
    await offline.decryptOfflineRecord({
      key: material.key,
      namespaceId,
      storeName: offline.OFFLINE_STORES.drafts,
      recordKey: 'draft-a',
      envelope: first,
    }),
    { synthetic: true, amount: 1 }
  )
  await assert.rejects(
    offline.decryptOfflineRecord({
      key: material.key,
      namespaceId,
      storeName: offline.OFFLINE_STORES.drafts,
      recordKey: 'draft-b',
      envelope: first,
    }),
    (error) => error?.code === 'OFFLINE_INTEGRITY_FAILED'
  )
  await assert.rejects(
    offline.decryptOfflineRecord({
      key: material.key,
      namespaceId: 'ns_other',
      storeName: offline.OFFLINE_STORES.drafts,
      recordKey: 'draft-a',
      envelope: first,
    }),
    (error) => error?.code === 'OFFLINE_INTEGRITY_FAILED'
  )
  const altered = {
    ...first,
    ciphertext: `${first.ciphertext.slice(0, -1)}${
      first.ciphertext.endsWith('A') ? 'B' : 'A'
    }`,
  }
  await assert.rejects(
    offline.decryptOfflineRecord({
      key: material.key,
      namespaceId,
      storeName: offline.OFFLINE_STORES.drafts,
      recordKey: 'draft-a',
      envelope: altered,
    }),
    (error) => error?.code === 'OFFLINE_INTEGRITY_FAILED'
  )
})

test('Primary Auth alone and a wrong scope cannot unlock the key manager', async () => {
  const manager = new offline.OfflineKeyManager()
  const material = await offline.createSyntheticNamespaceKeyMaterial('ns_a')
  assert.throws(
    () =>
      manager.unlock({
        source: 'synthetic-test',
        primaryAuthenticated: true,
        posActorAuthorized: false,
        namespaceId: 'ns_a',
        keyVersion: 1,
        key: material.key,
      }),
    (error) => error?.code === 'OFFLINE_AUTHORITY_UNAVAILABLE'
  )
  manager.unlock({
    source: 'synthetic-test',
    primaryAuthenticated: true,
    posActorAuthorized: true,
    namespaceId: 'ns_a',
    keyVersion: 1,
    key: material.key,
  })
  assert.throws(
    () => manager.requireKey('ns_b'),
    (error) => error?.code === 'OFFLINE_KEY_LOCKED'
  )
  manager.lock('employee-switch', 'ns_a')
  assert.equal(manager.getState().status, 'locked')
})

test('quota boundaries and media policy are exact', () => {
  assert.equal(offline.assessOfflineQuota(69, 100).state, 'normal')
  assert.equal(offline.assessOfflineQuota(70, 100).state, 'warning')
  assert.equal(offline.assessOfflineQuota(89, 100).state, 'warning')
  assert.equal(offline.assessOfflineQuota(90, 100).state, 'hard-stop')
  assert.equal(offline.assessOfflineQuota(undefined, undefined).state, 'unavailable')
  assert.deepEqual(offline.OFFLINE_MEDIA_POLICY, {
    maximumImages: 1_000,
    maximumBytes: 250 * 1024 * 1024,
  })
  assert.deepEqual(offline.OFFLINE_AUTHORITY_LEASE_POLICY, {
    readLeaseAbsoluteMs: 24 * 60 * 60 * 1_000,
    futureBusinessCommandLeaseAbsoluteMs: 2 * 60 * 60 * 1_000,
  })
  assert.equal(
    offline.pruneFutureEvictableData().reason,
    'PHASE_1_HAS_NO_EVICTABLE_READ_OR_MEDIA_STORES'
  )
})

test('employee switch and full logout use distinct fail-closed lifecycles', async () => {
  const switchEvents = []
  const switchMaterial = await offline.createSyntheticNamespaceKeyMaterial(
    'ns_switch_lifecycle'
  )
  offline.offlineKeyManager.unlock({
    source: 'synthetic-test',
    primaryAuthenticated: true,
    posActorAuthorized: true,
    namespaceId: 'ns_switch_lifecycle',
    keyVersion: 1,
    key: switchMaterial.key,
  })
  const switched = await offline.executePosEmployeeSwitchLifecycle({
    revokePosActor: async () => {
      switchEvents.push(`revoke:${offline.offlineKeyManager.getState().status}`)
    },
    clearEmployeePresentation: () => switchEvents.push('clear-employee'),
    clearPlaintextCaches: () => switchEvents.push('clear-caches'),
  })
  assert.deepEqual(switchEvents, [
    'revoke:locked',
    'clear-employee',
    'clear-caches',
  ])
  assert.deepEqual(switched, {
    intent: 'switch',
    primaryAuthRetained: true,
  })
  assert.equal(
    offline.finalizeOfflineSessionIntent('switch').route,
    '/pos/employee-pin'
  )
  assert.throws(
    () => offline.offlineKeyManager.requireKey('ns_switch_lifecycle'),
    (error) => error?.code === 'OFFLINE_KEY_LOCKED'
  )

  const logoutEvents = []
  const loggedOut = await offline.executeFullPosLogoutLifecycle({
    revokePosActor: async () => {
      logoutEvents.push(`revoke:${offline.offlineKeyManager.getState().status}`)
    },
    signOutPrimary: async () => logoutEvents.push('primary-signout'),
    clearEmployeePresentation: () => logoutEvents.push('clear-employee'),
    clearPlaintextCaches: () => logoutEvents.push('clear-caches'),
    markPrimaryLoggedOut: () => logoutEvents.push('mark-logged-out'),
  })
  assert.deepEqual(logoutEvents, [
    'revoke:locked',
    'primary-signout',
    'clear-employee',
    'clear-caches',
    'mark-logged-out',
  ])
  assert.deepEqual(loggedOut, {
    intent: 'logout',
    primaryAuthRetained: false,
  })
  assert.equal(
    offline.finalizeOfflineSessionIntent('logout').route,
    '/pos/login'
  )

  const failureMaterial = await offline.createSyntheticNamespaceKeyMaterial(
    'ns_logout_failure'
  )
  offline.offlineKeyManager.unlock({
    source: 'synthetic-test',
    primaryAuthenticated: true,
    posActorAuthorized: true,
    namespaceId: 'ns_logout_failure',
    keyVersion: 1,
    key: failureMaterial.key,
  })
  await assert.rejects(
    offline.executePosEmployeeSwitchLifecycle({
      revokePosActor: async () => {
        throw new Error('synthetic-revocation-failure')
      },
      clearEmployeePresentation: () => assert.fail('must not clear on failure'),
      clearPlaintextCaches: () => assert.fail('must not clear on failure'),
    })
  )
  assert.equal(offline.offlineKeyManager.getState().status, 'locked')
})

test('legacy assessment blocks scoped completion and explicit cleanup is allowlisted', async () => {
  const values = new Map([
    ['invoice_customer', JSON.stringify({ synthetic: true })],
    [
      'leather_fix_pos_offline_drafts',
      JSON.stringify([{ synthetic: 1 }, { synthetic: 2 }]),
    ],
    ['afex-pos-theme-v1', 'dark'],
    ['unrelated-user-key', 'byte-identical'],
  ])
  const storage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    removeItem(key) {
      values.delete(key)
    },
  }
  const assessment = await offline.assessLegacySensitiveRecords({ storage })
  assert.equal(assessment.activeLegacySaleDraftPresence, true)
  assert.equal(assessment.legacyOfflineDraftQueueRecordCount, 2)
  assert.equal(assessment.ambiguousRecordCount, 3)
  assert.equal(assessment.verifiedBoundRecordCount, 0)
  assert.equal(assessment.discoveredKeyCount, 2)
  assert.ok(assessment.records.every((record) => !('value' in record)))

  await assert.rejects(
    offline.deleteExplicitlyConfirmedLegacySensitiveRecords({
      storage,
      confirmation: 'not-confirmed',
    }),
    (error) =>
      error?.code === 'OFFLINE_LEGACY_CLEANUP_CONFIRMATION_REQUIRED'
  )
  assert.equal(values.has('invoice_customer'), true)
  const cleanup = await offline.deleteExplicitlyConfirmedLegacySensitiveRecords({
    storage,
    confirmation: offline.EXPLICIT_UNSCOPED_LEGACY_CLEANUP_CONFIRMATION,
  })
  assert.equal(cleanup.removedKeyCount, 2)
  assert.equal(cleanup.removedRecordCount, 3)
  assert.equal(values.has('invoice_customer'), false)
  assert.equal(values.has('leather_fix_pos_offline_drafts'), false)
  assert.equal(values.get('afex-pos-theme-v1'), 'dark')
  assert.equal(values.get('unrelated-user-key'), 'byte-identical')
})

test('browser IndexedDB, legacy migration, scoped purge and tab lock contracts', async (t) => {
  const server = createServer((request, response) => {
    if (request.url === '/api/pos/offline-context') {
      const scope = request.headers.cookie?.match(/afex-test-scope=([^;]+)/u)?.[1]
      const context =
        scope === 'ACCOUNT_B'
          ? { primarySubjectId: 'subject-b', tenantId: 'tenant-b', branchId: 'branch-b' }
          : scope === 'BRANCH_B'
            ? { primarySubjectId: 'subject-a', tenantId: 'tenant-a', branchId: 'branch-b' }
            : { primarySubjectId: 'subject-a', tenantId: 'tenant-a', branchId: 'branch-a' }
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      })
      response.end(
        JSON.stringify({
          success: true,
          context: {
            ...context,
            contextVersion: 1,
            actorAuthority:
              scope === 'PRIMARY_ONLY'
                ? 'primary-auth-only'
                : 'active-pos-actor',
          },
        })
      )
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/html' })
    response.end('<!doctype html><html><body>AFEX Phase 1 synthetic test</body></html>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const origin = `http://127.0.0.1:${address.port}`
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const pageA = await context.newPage()
  const pageB = await context.newPage()

  t.after(async () => {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  })

  await Promise.all([pageA.goto(origin), pageB.goto(origin)])
  await Promise.all([loadBrowserModule(pageA), loadBrowserModule(pageB)])

  const result = await pageA.evaluate(async () => {
    const api = globalThis.__afexOfflinePhase1
    document.cookie = 'afex-test-scope=A; path=/'
    const databaseName = `afex-phase1-test-${crypto.randomUUID()}`
    const manager = new api.OfflineKeyManager()
    const repository = new api.EncryptedOfflineRepository({
      databaseName,
      allowPersistentWrites: true,
      keyManager: manager,
    })
    const preparedA = await api.prepareVerifiedOfflineNamespace()
    const namespaceA = preparedA.descriptor.namespaceId
    const namespaceB = 'ns_test_b'
    const materialA = await api.createSyntheticNamespaceKeyMaterial(namespaceA)
    const materialB = await api.createSyntheticNamespaceKeyMaterial(namespaceB)

    await repository.initialize()
    const database = await api.openOfflineDatabase(databaseName)
    const stores = Array.from(database.objectStoreNames)
    database.close()

    manager.unlock({
      source: 'synthetic-test',
      primaryAuthenticated: true,
      posActorAuthorized: true,
      namespaceId: namespaceA,
      keyVersion: 1,
      key: materialA.key,
    })
    await repository.putKeyEnvelope(materialA.envelope)
    await repository.putEncryptedDraft(
      namespaceA,
      'draft-a',
      { synthetic: 'a' },
      'synthetic-test'
    )
    const retainedBeforeLock = await repository.readEncryptedRecord(
      api.OFFLINE_STORES.drafts,
      namespaceA,
      'draft-a'
    )
    manager.lock('logout-retain', namespaceA)
    let lockedReadCode = null
    try {
      await repository.readEncryptedRecord(
        api.OFFLINE_STORES.drafts,
        namespaceA,
        'draft-a'
      )
    } catch (error) {
      lockedReadCode = error.code
    }
    manager.unlock({
      source: 'synthetic-test',
      primaryAuthenticated: true,
      posActorAuthorized: true,
      namespaceId: namespaceB,
      keyVersion: 1,
      key: materialB.key,
    })
    await repository.putKeyEnvelope(materialB.envelope)
    await repository.putEncryptedDraft(
      namespaceB,
      'draft-b',
      { synthetic: 'b' },
      'synthetic-test'
    )
    const namespaceBFingerprintBefore =
      await repository.namespaceFingerprint(namespaceB)

    manager.unlock({
      source: 'synthetic-test',
      primaryAuthenticated: true,
      posActorAuthorized: true,
      namespaceId: namespaceA,
      keyVersion: 1,
      key: materialA.key,
    })
    localStorage.setItem('invoice_customer', JSON.stringify({ synthetic: true }))
    localStorage.setItem('invoice_sale_items', JSON.stringify({ synthetic: true }))
    const migration = await api.migrateLegacyPlaintextRecords({
      storage: localStorage,
      repository,
      namespaceId: namespaceA,
      verifiedBindingKeys: new Set(['invoice_customer']),
    })
    const plaintextRemaining = [
      localStorage.getItem('invoice_customer'),
      localStorage.getItem('invoice_sale_items'),
    ].filter((value) => value !== null).length
    localStorage.setItem(
      'invoice_sale_checkout',
      JSON.stringify({ synthetic: 'active-sale' })
    )
    localStorage.setItem(
      'leather_fix_pos_offline_drafts',
      JSON.stringify([{ synthetic: 1 }, { synthetic: 2 }])
    )
    localStorage.setItem('unrelated-phase1-test', 'byte-identical')
    const logoutAssessment = await api.assessLogoutPurgeRecords({
      repository,
      namespaceId: namespaceA,
      storage: localStorage,
    })
    const legacyCleanup =
      await api.deleteExplicitlyConfirmedLegacySensitiveRecords({
        storage: localStorage,
        confirmation: api.EXPLICIT_UNSCOPED_LEGACY_CLEANUP_CONFIRMATION,
      })
    const unrelatedLegacyValue = localStorage.getItem(
      'unrelated-phase1-test'
    )
    const unresolvedBeforePurge =
      await repository.countUnresolvedRecords(namespaceA)
    const purgeAuthorization =
      await api.authorizeCurrentOfflineNamespaceForPurge(preparedA.descriptor)
    const purge = await repository.purgeExactNamespace(purgeAuthorization)
    const unresolvedAfterPurge =
      await repository.countUnresolvedRecords(namespaceA)
    const activeAfterCompletedPurge = api.getActiveOfflineNamespace()
    const namespaceBFingerprintAfter =
      await repository.namespaceFingerprint(namespaceB)

    const interruptedName = `${databaseName}-interrupted`
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(interruptedName, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('meta', { keyPath: 'id' })
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
    })
    let interruptedCode = null
    try {
      await api.openOfflineDatabase(interruptedName)
    } catch (error) {
      interruptedCode = error.code
    }

    const resumeName = `${databaseName}-resume`
    const resumeRepository = new api.EncryptedOfflineRepository({
      databaseName: resumeName,
      allowPersistentWrites: true,
      keyManager: manager,
    })
    await resumeRepository.initialize()
    const resumeDatabase = await api.openOfflineDatabase(resumeName)
    const transaction = resumeDatabase.transaction(
      api.OFFLINE_STORES.purgeTombstones,
      'readwrite'
    )
    transaction.objectStore(api.OFFLINE_STORES.purgeTombstones).put({
      id: `purge:${namespaceA}`,
      namespaceId: namespaceA,
      bindingDigest: purgeAuthorization.bindingDigest,
      state: 'pending',
      step: 'tombstoned',
      classification: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
      transaction.onerror = () => reject(transaction.error)
    })
    resumeDatabase.close()
    document.cookie = 'afex-test-scope=A; path=/'
    const resumeResult =
      await resumeRepository.resumeAuthorizedPurge(purgeAuthorization)
    const tombstonesAfterResume = await resumeRepository.listPurgeTombstones()

    const staleRepository = new api.EncryptedOfflineRepository({
      databaseName: `${databaseName}-stale`,
      allowPersistentWrites: true,
      keyManager: manager,
    })
    await staleRepository.initialize()
    document.cookie = 'afex-test-scope=A; path=/'
    const stalePreparedA = await api.prepareVerifiedOfflineNamespace()
    manager.unlock({
      source: 'synthetic-test',
      primaryAuthenticated: true,
      posActorAuthorized: true,
      namespaceId: namespaceA,
      keyVersion: 1,
      key: materialA.key,
    })
    await staleRepository.putEncryptedDraft(
      namespaceA,
      'stale-a',
      { synthetic: 'stale-a' },
      'synthetic-test'
    )
    const staleFingerprintBefore =
      await staleRepository.namespaceFingerprint(namespaceA)
    document.cookie = 'afex-test-scope=ACCOUNT_B; path=/'
    let staleAccountCode = null
    try {
      const staleAuthorization =
        await api.authorizeCurrentOfflineNamespaceForPurge(
          stalePreparedA.descriptor
        )
      await staleRepository.purgeExactNamespace(staleAuthorization)
    } catch (error) {
      staleAccountCode = error.code
    }
    const staleFingerprintAfterAccount =
      await staleRepository.namespaceFingerprint(namespaceA)
    const activeAfterAccountMismatch = api.getActiveOfflineNamespace()

    document.cookie = 'afex-test-scope=A; path=/'
    const stalePreparedBranchA = await api.prepareVerifiedOfflineNamespace()
    document.cookie = 'afex-test-scope=BRANCH_B; path=/'
    let staleBranchCode = null
    try {
      await api.authorizeCurrentOfflineNamespaceForPurge(
        stalePreparedBranchA.descriptor
      )
    } catch (error) {
      staleBranchCode = error.code
    }
    const staleFingerprintAfterBranch =
      await staleRepository.namespaceFingerprint(namespaceA)
    document.cookie = 'afex-test-scope=PRIMARY_ONLY; path=/'
    let primaryOnlyPurgeCode = null
    try {
      await api.authorizeCurrentOfflineNamespaceForPurge(
        stalePreparedA.descriptor
      )
    } catch (error) {
      primaryOnlyPurgeCode = error.code
    }

    const failureDatabaseName = `${databaseName}-purge-failure`
    const failureRepository = new api.EncryptedOfflineRepository({
      databaseName: failureDatabaseName,
      allowPersistentWrites: true,
      keyManager: manager,
    })
    await failureRepository.initialize()
    document.cookie = 'afex-test-scope=A; path=/'
    const failurePrepared = await api.prepareVerifiedOfflineNamespace()
    const failureAuthorization =
      await api.authorizeCurrentOfflineNamespaceForPurge(
        failurePrepared.descriptor
      )
    manager.unlock({
      source: 'synthetic-test',
      primaryAuthenticated: true,
      posActorAuthorized: true,
      namespaceId: namespaceA,
      keyVersion: 1,
      key: materialA.key,
    })
    await failureRepository.putEncryptedDraft(
      namespaceA,
      'retryable-draft',
      { synthetic: 'retryable' },
      'synthetic-test'
    )
    const failureDatabase = await api.openOfflineDatabase(failureDatabaseName)
    const leaseTransaction = failureDatabase.transaction(
      api.OFFLINE_STORES.meta,
      'readwrite'
    )
    const leaseId = `lease:${namespaceA}:purge`
    leaseTransaction.objectStore(api.OFFLINE_STORES.meta).put({
      id: leaseId,
      kind: 'coordination-lease',
      namespaceId: namespaceA,
      ownerId: 'synthetic-blocker',
      expiresAt: Date.now() + 60_000,
      schemaVersion: api.OFFLINE_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    })
    await new Promise((resolve, reject) => {
      leaseTransaction.oncomplete = () => resolve()
      leaseTransaction.onabort = () => reject(leaseTransaction.error)
    })
    let purgeFailure = null
    try {
      await failureRepository.purgeExactNamespace(failureAuthorization)
    } catch (error) {
      purgeFailure = {
        code: error.code,
        retryable: error.retryable,
        lockState: api.offlineKeyManager.getState().status,
      }
    }
    const releaseTransaction = failureDatabase.transaction(
      api.OFFLINE_STORES.meta,
      'readwrite'
    )
    releaseTransaction.objectStore(api.OFFLINE_STORES.meta).delete(leaseId)
    await new Promise((resolve, reject) => {
      releaseTransaction.oncomplete = () => resolve()
      releaseTransaction.onabort = () => reject(releaseTransaction.error)
    })
    failureDatabase.close()
    const purgeRetry = await failureRepository.purgeExactNamespace(
      failureAuthorization
    )

    document.cookie = 'afex-test-scope=A; path=/'
    await api.prepareVerifiedOfflineNamespace()
    const switchCompletion = api.finalizeOfflineSessionIntent('switch')
    const activeAfterSwitch = api.getActiveOfflineNamespace()
    const logoutCompletion = api.finalizeOfflineSessionIntent('logout')
    const activeAfterFullLogout = api.getActiveOfflineNamespace()

    indexedDB.deleteDatabase(databaseName)
    indexedDB.deleteDatabase(interruptedName)
    indexedDB.deleteDatabase(resumeName)
    indexedDB.deleteDatabase(`${databaseName}-stale`)
    indexedDB.deleteDatabase(failureDatabaseName)
    return {
      stores,
      retainedBeforeLock,
      lockedReadCode,
      migration,
      plaintextRemaining,
      logoutAssessment,
      legacyCleanup,
      unrelatedLegacyValue,
      unresolvedBeforePurge,
      unresolvedAfterPurge,
      purge,
      activeAfterCompletedPurge,
      namespaceBFingerprintBefore,
      namespaceBFingerprintAfter,
      interruptedCode,
      resumeResult,
      tombstonesAfterResume,
      staleAccountCode,
      staleBranchCode,
      staleFingerprintBefore,
      staleFingerprintAfterAccount,
      staleFingerprintAfterBranch,
      primaryOnlyPurgeCode,
      activeAfterAccountMismatch,
      switchCompletion,
      activeAfterSwitch,
      logoutCompletion,
      activeAfterFullLogout,
      purgeFailure,
      purgeRetry,
    }
  })

  assert.deepEqual(result.stores.sort(), Object.values(offline.OFFLINE_STORES).sort())
  assert.deepEqual(result.retainedBeforeLock, { synthetic: 'a' })
  assert.equal(result.lockedReadCode, 'OFFLINE_KEY_LOCKED')
  assert.equal(result.migration.imported, 1)
  assert.equal(result.migration.quarantined, 1)
  assert.equal(result.migration.removedAfterVerification, 2)
  assert.equal(result.plaintextRemaining, 0)
  assert.equal(result.logoutAssessment.activeLegacySaleDraftPresence, true)
  assert.equal(result.logoutAssessment.legacyOfflineDraftQueueRecordCount, 2)
  assert.equal(result.logoutAssessment.ambiguousLegacyRecordCount, 3)
  assert.equal(result.logoutAssessment.requiresSecondConfirmation, true)
  assert.equal(result.logoutAssessment.blocksScopedCompleteClaim, true)
  assert.equal(result.legacyCleanup.removedKeyCount, 2)
  assert.equal(result.unrelatedLegacyValue, 'byte-identical')
  assert.ok(result.unresolvedBeforePurge >= 3)
  assert.equal(result.unresolvedAfterPurge, 0)
  assert.equal(result.purge.state, 'purged')
  assert.equal(result.activeAfterCompletedPurge, null)
  assert.equal(
    result.namespaceBFingerprintAfter,
    result.namespaceBFingerprintBefore
  )
  assert.equal(result.interruptedCode, 'OFFLINE_SCHEMA_CORRUPT')
  assert.equal(result.resumeResult.state, 'purged')
  assert.deepEqual(result.tombstonesAfterResume, [])
  assert.equal(result.staleAccountCode, 'OFFLINE_CROSS_SCOPE_DENIED')
  assert.equal(result.staleBranchCode, 'OFFLINE_CROSS_SCOPE_DENIED')
  assert.equal(result.primaryOnlyPurgeCode, 'OFFLINE_AUTHORITY_UNAVAILABLE')
  assert.equal(result.staleFingerprintAfterAccount, result.staleFingerprintBefore)
  assert.equal(result.staleFingerprintAfterBranch, result.staleFingerprintBefore)
  assert.equal(result.activeAfterAccountMismatch, null)
  assert.deepEqual(result.switchCompletion, {
    intent: 'switch',
    route: '/pos/employee-pin',
  })
  assert.ok(result.activeAfterSwitch)
  assert.deepEqual(result.logoutCompletion, {
    intent: 'logout',
    route: '/pos/login',
  })
  assert.equal(result.activeAfterFullLogout, null)
  assert.deepEqual(result.purgeFailure, {
    code: 'OFFLINE_PURGE_FAILED_LOCKED',
    retryable: true,
    lockState: 'locked',
  })
  assert.equal(result.purgeRetry.state, 'purged')

  await pageB.evaluate(async () => {
    const api = globalThis.__afexOfflinePhase1
    const material = await api.createSyntheticNamespaceKeyMaterial('ns_tab')
    api.lockOfflineRuntime('listener-initialization', 'ns_tab')
    api.offlineKeyManager.unlock({
      source: 'synthetic-test',
      primaryAuthenticated: true,
      posActorAuthorized: true,
      namespaceId: 'ns_tab',
      keyVersion: 1,
      key: material.key,
    })
  })
  await pageA.evaluate(() => {
    globalThis.__afexOfflinePhase1.lockOfflineRuntime('employee-switch', 'ns_tab')
  })
  await pageB.waitForFunction(
    () => globalThis.__afexOfflinePhase1.offlineKeyManager.getState().status === 'locked'
  )
  const tabState = await pageB.evaluate(() =>
    globalThis.__afexOfflinePhase1.offlineKeyManager.getState()
  )
  assert.equal(tabState.status, 'locked')
})

test('restart recovery is deferred until the exact POS-authorized scope returns', async (t) => {
  let offlineContextRequests = 0
  const server = createServer((request, response) => {
    if (request.url === '/api/pos/offline-context') {
      offlineContextRequests += 1
      const scope =
        request.headers.cookie?.match(/afex-restart-scope=([^;]+)/u)?.[1] ??
        'SIGNED_OUT'
      if (scope === 'SIGNED_OUT') {
        response.writeHead(401, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        })
        response.end(
          JSON.stringify({ success: false, error: 'AUTHENTICATION_REQUIRED' })
        )
        return
      }
      const context =
        scope === 'B'
          ? {
              primarySubjectId: 'restart-subject-b',
              tenantId: 'restart-tenant-b',
              branchId: 'restart-branch-b',
            }
          : {
              primarySubjectId: 'restart-subject-a',
              tenantId: 'restart-tenant-a',
              branchId: 'restart-branch-a',
            }
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      })
      response.end(
        JSON.stringify({
          success: true,
          context: {
            ...context,
            contextVersion: 1,
            actorAuthority:
              scope === 'PRIMARY_ONLY'
                ? 'primary-auth-only'
                : 'active-pos-actor',
          },
        })
      )
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/html' })
    response.end('<!doctype html><html><body>AFEX restart recovery test</body></html>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const origin = `http://127.0.0.1:${address.port}`
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const pageA = await context.newPage()
  const pageB = await context.newPage()

  t.after(async () => {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  })

  await Promise.all([pageA.goto(origin), pageB.goto(origin)])
  await Promise.all([loadBrowserModule(pageA), loadBrowserModule(pageB)])

  const seeded = await pageA.evaluate(async () => {
    const api = globalThis.__afexOfflinePhase1
    document.cookie = 'afex-restart-scope=A; path=/'
    await api.offlineRepository.initialize()
    const prepared = await api.prepareVerifiedOfflineNamespace()
    const authorization =
      await api.authorizeCurrentOfflineNamespaceForPurge(prepared.descriptor)
    const namespaceId = prepared.descriptor.namespaceId
    const now = new Date().toISOString()
    const database = await api.openOfflineDatabase()
    const transaction = database.transaction(
      [api.OFFLINE_STORES.drafts, api.OFFLINE_STORES.purgeTombstones],
      'readwrite'
    )
    transaction.objectStore(api.OFFLINE_STORES.drafts).put({
      id: `${namespaceId}:restart-draft`,
      namespaceId,
      recordKey: 'restart-draft',
      envelope: { synthetic: true },
      classification: 'synthetic-restart-test',
      createdAt: now,
      updatedAt: now,
    })
    transaction.objectStore(api.OFFLINE_STORES.purgeTombstones).put({
      id: `purge:${namespaceId}`,
      namespaceId,
      bindingDigest: authorization.bindingDigest,
      state: 'pending',
      step: 'tombstoned',
      classification: null,
      createdAt: now,
      updatedAt: now,
    })
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve
      transaction.onabort = () => reject(transaction.error)
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
    const fingerprint =
      await api.offlineRepository.namespaceFingerprint(namespaceId)
    api.clearActiveOfflineNamespace()
    api.lockOfflineRuntime('synthetic-cold-start', namespaceId)
    document.cookie = 'afex-restart-scope=SIGNED_OUT; path=/'
    return {
      namespaceId,
      bindingDigest: authorization.bindingDigest,
      fingerprint,
    }
  })

  const requestsBeforeColdInitialization = offlineContextRequests
  const coldInitialization = await pageA.evaluate(() =>
    globalThis.__afexOfflinePhase1.initializeOfflinePhase1Runtime()
  )
  assert.deepEqual(coldInitialization, {
    status: 'pending_purges_discovered_locked',
    pendingPurgeCount: 1,
  })
  assert.equal(offlineContextRequests, requestsBeforeColdInitialization)
  const coldState = await pageA.evaluate(async (namespaceId) => {
    const api = globalThis.__afexOfflinePhase1
    return {
      fingerprint:
        await api.offlineRepository.namespaceFingerprint(namespaceId),
      pending:
        await api.offlineRepository.countPendingPurgeTombstones(namespaceId),
      lock: api.offlineKeyManager.getState().status,
    }
  }, seeded.namespaceId)
  assert.equal(coldState.fingerprint, seeded.fingerprint)
  assert.equal(coldState.pending, 1)
  assert.equal(coldState.lock, 'locked')

  const primaryOnly = await pageA.evaluate(async () => {
    document.cookie = 'afex-restart-scope=PRIMARY_ONLY; path=/'
    return globalThis.__afexOfflinePhase1.resumeAuthorizedPurgesForCurrentScope()
  })
  assert.equal(primaryOnly.status, 'authorization_required_locked')
  assert.equal(primaryOnly.resumedTombstoneCount, 0)

  const accountB = await pageA.evaluate(async (namespaceId) => {
    const api = globalThis.__afexOfflinePhase1
    api.clearActiveOfflineNamespace()
    document.cookie = 'afex-restart-scope=B; path=/'
    let onlinePosActivated = false
    const recovery = await api.completePosPinOfflineRecoveryGate(() => {
      onlinePosActivated = true
    })
    return {
      recovery,
      onlinePosActivated,
      activeNamespace: api.getActiveOfflineNamespace(),
      accountAFingerprint:
        await api.offlineRepository.namespaceFingerprint(namespaceId),
    }
  }, seeded.namespaceId)
  assert.equal(accountB.recovery.status, 'deferred_for_matching_scope')
  assert.equal(accountB.recovery.resumedTombstoneCount, 0)
  assert.equal(accountB.recovery.deferredTombstoneCount, 1)
  assert.equal(accountB.onlinePosActivated, true)
  assert.ok(accountB.activeNamespace)
  assert.notEqual(accountB.activeNamespace.namespaceId, seeded.namespaceId)
  assert.equal(accountB.accountAFingerprint, seeded.fingerprint)

  const accountA = await pageA.evaluate(async (namespaceId) => {
    const api = globalThis.__afexOfflinePhase1
    api.clearActiveOfflineNamespace()
    document.cookie = 'afex-restart-scope=A; path=/'
    let pendingWhenOnlineReady = -1
    let unresolvedWhenOnlineReady = -1
    const recovery = await api.completePosPinOfflineRecoveryGate(async () => {
      pendingWhenOnlineReady =
        await api.offlineRepository.countPendingPurgeTombstones(namespaceId)
      unresolvedWhenOnlineReady =
        await api.offlineRepository.countUnresolvedRecords(namespaceId)
    })
    const repeated = await api.completePosPinOfflineRecoveryGate(() => undefined)
    return {
      recovery,
      repeated,
      pendingWhenOnlineReady,
      unresolvedWhenOnlineReady,
    }
  }, seeded.namespaceId)
  assert.equal(accountA.recovery.status, 'resumed_current_scope')
  assert.equal(accountA.recovery.resumedTombstoneCount, 1)
  assert.equal(accountA.pendingWhenOnlineReady, 0)
  assert.equal(accountA.unresolvedWhenOnlineReady, 0)
  assert.equal(accountA.repeated.status, 'nothing_pending')
  assert.equal(accountA.repeated.resumedTombstoneCount, 0)

  const bindingMismatch = await pageA.evaluate(async ({ namespaceId }) => {
    const api = globalThis.__afexOfflinePhase1
    const now = new Date().toISOString()
    const database = await api.openOfflineDatabase()
    const transaction = database.transaction(
      [api.OFFLINE_STORES.drafts, api.OFFLINE_STORES.purgeTombstones],
      'readwrite'
    )
    transaction.objectStore(api.OFFLINE_STORES.drafts).put({
      id: `${namespaceId}:binding-mismatch`,
      namespaceId,
      recordKey: 'binding-mismatch',
      envelope: { synthetic: true },
      classification: 'synthetic-restart-test',
      createdAt: now,
      updatedAt: now,
    })
    transaction.objectStore(api.OFFLINE_STORES.purgeTombstones).put({
      id: `purge:${namespaceId}`,
      namespaceId,
      bindingDigest: 'invalid-binding-digest',
      state: 'pending',
      step: 'tombstoned',
      classification: null,
      createdAt: now,
      updatedAt: now,
    })
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve
      transaction.onabort = () => reject(transaction.error)
    })
    database.close()
    const fingerprintBefore =
      await api.offlineRepository.namespaceFingerprint(namespaceId)
    api.clearActiveOfflineNamespace()
    document.cookie = 'afex-restart-scope=A; path=/'
    const recovery = await api.resumeAuthorizedPurgesForCurrentScope()
    return {
      recovery,
      fingerprintBefore,
      fingerprintAfter:
        await api.offlineRepository.namespaceFingerprint(namespaceId),
      lock: api.offlineKeyManager.getState().status,
    }
  }, seeded)
  assert.equal(bindingMismatch.recovery.status, 'binding_mismatch_locked')
  assert.equal(bindingMismatch.fingerprintAfter, bindingMismatch.fingerprintBefore)
  assert.equal(bindingMismatch.lock, 'locked')

  await pageA.evaluate(async ({ namespaceId, bindingDigest }) => {
    const api = globalThis.__afexOfflinePhase1
    const database = await api.openOfflineDatabase()
    const cleanup = database.transaction(
      [api.OFFLINE_STORES.drafts, api.OFFLINE_STORES.purgeTombstones],
      'readwrite'
    )
    cleanup
      .objectStore(api.OFFLINE_STORES.drafts)
      .delete(`${namespaceId}:binding-mismatch`)
    cleanup
      .objectStore(api.OFFLINE_STORES.purgeTombstones)
      .delete(`purge:${namespaceId}`)
    await new Promise((resolve, reject) => {
      cleanup.oncomplete = resolve
      cleanup.onabort = () => reject(cleanup.error)
    })
    database.close()

    const now = new Date().toISOString()
    const seededDatabase = await api.openOfflineDatabase()
    const seededTransaction = seededDatabase.transaction(
      [api.OFFLINE_STORES.drafts, api.OFFLINE_STORES.purgeTombstones],
      'readwrite'
    )
    seededTransaction.objectStore(api.OFFLINE_STORES.drafts).put({
      id: `${namespaceId}:two-tab`,
      namespaceId,
      recordKey: 'two-tab',
      envelope: { synthetic: true },
      classification: 'synthetic-restart-test',
      createdAt: now,
      updatedAt: now,
    })
    seededTransaction.objectStore(api.OFFLINE_STORES.purgeTombstones).put({
      id: `purge:${namespaceId}`,
      namespaceId,
      bindingDigest,
      state: 'pending',
      step: 'tombstoned',
      classification: null,
      createdAt: now,
      updatedAt: now,
    })
    await new Promise((resolve, reject) => {
      seededTransaction.oncomplete = resolve
      seededTransaction.onabort = () => reject(seededTransaction.error)
    })
    seededDatabase.close()
    api.clearActiveOfflineNamespace()
    document.cookie = 'afex-restart-scope=A; path=/'
  }, seeded)
  await pageB.evaluate(() => {
    const api = globalThis.__afexOfflinePhase1
    api.clearActiveOfflineNamespace()
    document.cookie = 'afex-restart-scope=A; path=/'
  })

  const concurrent = await Promise.all(
    [pageA, pageB].map((page) =>
      page.evaluate(() =>
        globalThis.__afexOfflinePhase1.completePosPinOfflineRecoveryGate(
          () => undefined
        )
      )
    )
  )
  assert.equal(
    concurrent.filter((result) => result.status === 'resumed_current_scope')
      .length,
    1
  )
  assert.ok(
    concurrent.every((result) =>
      [
        'resumed_current_scope',
        'nothing_pending',
        'purge_failed_locked',
      ].includes(result.status)
    )
  )
  const finalState = await pageA.evaluate(async (namespaceId) => {
    const api = globalThis.__afexOfflinePhase1
    return {
      pending:
        await api.offlineRepository.countPendingPurgeTombstones(namespaceId),
      unresolved:
        await api.offlineRepository.countUnresolvedRecords(namespaceId),
    }
  }, seeded.namespaceId)
  assert.deepEqual(finalState, { pending: 0, unresolved: 0 })

  await pageA.evaluate(() => indexedDB.deleteDatabase('afex-pos-local-v1'))
})

test('Phase 1 source and UI contracts exclude business dispatch and sensitive diagnostics', async () => {
  const source = await readFile(sourcePath, 'utf8')
  const dialog = await readFile(
    new URL('../components/pos-logout-retention-dialog.tsx', import.meta.url),
    'utf8'
  )
  const endpoint = await readFile(
    new URL('../app/api/pos/offline-context/route.ts', import.meta.url),
    'utf8'
  )
  const legacyDraft = await readFile(
    new URL('../lib/pos-offline-draft.ts', import.meta.url),
    'utf8'
  )
  const employeeSession = await readFile(
    new URL('../lib/pos-employee-session.ts', import.meta.url),
    'utf8'
  )
  const employeePin = await readFile(
    new URL('../app/pos/employee-pin/page.tsx', import.meta.url),
    'utf8'
  )

  assert.doesNotMatch(source, /fetch\(['"]\/api\/(orders|customers|invoices)/u)
  assert.doesNotMatch(source, /outbox|serviceWorker\.register/u)
  assert.doesNotMatch(source, /pin.*derive|derive.*pin|service[_-]?role|refresh[_-]?token/iu)
  assert.match(source, /businessCommandDispatch:\s*false/u)
  assert.match(source, /serviceWorkerDataCache:\s*false/u)
  assert.match(source, /maximumImages:\s*1_000/u)
  assert.match(source, /250 \* 1024 \* 1024/u)
  assert.match(dialog, /حذف البيانات المحفوظة من هذا الجهاز/u)
  assert.match(dialog, /سجلات تاريخية ملتبسة/u)
  assert.match(dialog, /حذف مسودات AFEX التاريخية غير المنسوبة/u)
  assert.match(dialog, /await switchPosEmployeeAndRequirePin\(\)/u)
  assert.match(dialog, /await endFullPosSessionAndRequireLogin\(\)/u)
  assert.match(dialog, /await offlineRepository\.purgeExactNamespace/u)
  assert.ok(
    dialog.indexOf('await endFullPosSessionAndRequireLogin()') <
      dialog.indexOf('await offlineRepository.purgeExactNamespace')
  )
  assert.match(source, /authorizeCurrentOfflineNamespaceForPurge/u)
  assert.match(source, /resumeAuthorizedPurgesForCurrentScope/u)
  assert.doesNotMatch(source, /resumePendingPurges/u)
  assert.ok(
    employeePin.lastIndexOf('await completePosPinOfflineRecoveryGate') <
      employeePin.lastIndexOf('writeActivePosEmployee')
  )
  assert.match(source, /EXPLICIT_UNSCOPED_LEGACY_CLEANUP_CONFIRMATION/u)
  assert.doesNotMatch(source, /localStorage\.clear\(/u)
  assert.doesNotMatch(dialog, /localStorage\.clear\(/u)
  assert.match(endpoint, /requireAuthorizationContext/u)
  assert.match(endpoint, /context\.user\.id/u)
  assert.match(endpoint, /context\.tenantId/u)
  assert.match(endpoint, /context\.activeBranchId/u)
  assert.match(legacyDraft, /!OFFLINE_CAPABILITIES\.businessCommandDispatch/u)
  assert.match(employeeSession, /switchPosEmployeeAndRequirePin/u)
  assert.match(employeeSession, /endFullPosSessionAndRequireLogin/u)
  assert.deepEqual(offline.assertNoBusinessDispatchInPhase1(), {
    commandStores: 0,
    dispatchers: 0,
    businessApiCalls: 0,
    capability: false,
  })
})
